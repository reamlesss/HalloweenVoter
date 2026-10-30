create table if not exists public.contestants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  voter_id uuid primary key,
  contestant_id uuid not null references public.contestants(id),
  created_at timestamptz not null default now()
);

alter table public.contestants enable row level security;
alter table public.votes enable row level security;

grant insert on public.contestants to anon, authenticated;
revoke all on public.votes from public, anon, authenticated;

drop policy if exists "Anyone can add contestants" on public.contestants;
create policy "Anyone can add contestants"
  on public.contestants for insert to anon, authenticated
  with check (true);

create schema if not exists poll_private;
revoke all on schema poll_private from public, anon, authenticated;

create table if not exists poll_private.poll_settings (
  id boolean primary key default true check (id),
  voting_open boolean not null default false
);

alter table poll_private.poll_settings enable row level security;
revoke all on table poll_private.poll_settings from public, anon, authenticated;

drop function if exists public.get_vote_results();
drop function if exists public.get_contestants();
drop function if exists public.get_poll_status();
drop function if exists public.get_admin_vote_results(text);
drop function if exists public.get_admin_vote_results();
drop function if exists public.set_voting_open(text, boolean);
drop function if exists public.set_voting_open(boolean);

alter table poll_private.poll_settings drop column if exists admin_token;

insert into poll_private.poll_settings (id, voting_open)
values (true, false)
on conflict (id) do nothing;

create function public.get_contestants()
returns table (
  id uuid,
  name text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select c.id, c.name, c.created_at
  from public.contestants as c
  order by c.created_at asc;
$$;

create function public.get_poll_status()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select settings.voting_open from poll_private.poll_settings as settings where settings.id = true),
    false
  );
$$;

create function public.get_admin_vote_results()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  votes bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  select c.id, c.name, c.created_at, count(v.voter_id)::bigint as votes
  from public.contestants as c
  left join public.votes as v on v.contestant_id = c.id
  group by c.id, c.name, c.created_at
  order by count(v.voter_id) desc, c.created_at asc;
$$;

create function public.set_voting_open(p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_open is null then
    raise exception 'A voting state is required.';
  end if;

  update poll_private.poll_settings
  set voting_open = p_open
  where id = true;

  if not found then
    raise exception 'Poll settings are missing.';
  end if;
end;
$$;

create or replace function public.set_vote(p_voter_id uuid, p_contestant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voting_open boolean;
begin
  select settings.voting_open
  into v_voting_open
  from poll_private.poll_settings as settings
  where settings.id = true
  for share;

  if not found or not coalesce(v_voting_open, false) then
    raise exception 'Voting is closed.';
  end if;

  if p_voter_id is null or p_contestant_id is null then
    raise exception 'A voter and person are required.';
  end if;

  if not exists (
    select 1 from public.contestants where id = p_contestant_id
  ) then
    raise exception 'That person is not on the lineup.';
  end if;

  insert into public.votes (voter_id, contestant_id)
  values (p_voter_id, p_contestant_id)
  on conflict (voter_id) do update
  set contestant_id = excluded.contestant_id;
end;
$$;

create or replace function public.withdraw_vote(p_voter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voting_open boolean;
begin
  select settings.voting_open
  into v_voting_open
  from poll_private.poll_settings as settings
  where settings.id = true
  for share;

  if not found or not coalesce(v_voting_open, false) then
    raise exception 'Voting is closed.';
  end if;

  if p_voter_id is null then
    raise exception 'A voter is required.';
  end if;

  delete from public.votes
  where voter_id = p_voter_id;
end;
$$;

revoke all on function public.get_contestants() from public;
revoke all on function public.get_poll_status() from public;
revoke all on function public.get_admin_vote_results() from public;
revoke all on function public.set_voting_open(boolean) from public;
revoke all on function public.set_vote(uuid, uuid) from public;
revoke all on function public.withdraw_vote(uuid) from public;

grant execute on function public.get_contestants() to anon, authenticated;
grant execute on function public.get_poll_status() to anon, authenticated;
grant execute on function public.get_admin_vote_results() to anon, authenticated;
grant execute on function public.set_voting_open(boolean) to anon, authenticated;
grant execute on function public.set_vote(uuid, uuid) to anon, authenticated;
grant execute on function public.withdraw_vote(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
