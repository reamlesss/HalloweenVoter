# Costume Royale

A static Halloween costume poll for GitHub Pages. The page uses Supabase to share contestants and votes between guests. Results refresh automatically every 15 seconds, and guests can refresh them immediately with the **Refresh votes** button.

## Set up Supabase

1. Create a Supabase project.
2. In the Supabase dashboard, open **SQL Editor**, create a query, paste in the SQL below, and run it.
3. Open **Project Settings → API** and copy the project URL and the public `anon` key.
4. In `script.js`, replace `YOUR_PROJECT_ID` in `SUPABASE_URL` with your project reference and replace `YOUR_SUPABASE_ANON_KEY` with the public anon key.
5. Do **not** put a Supabase `service_role` key in this website. The anon key is designed to be public; the database policies below restrict what it can do.

If you already ran the earlier setup with a costume field, first run this migration in the SQL Editor. It removes saved costume descriptions and updates the results function for the name-only lineup. Then run the setup SQL below.

```sql
alter table public.contestants drop column if exists costume;
drop function if exists public.get_vote_results();
```

If you already set up the poll, run this SQL in Supabase **SQL Editor**. It installs both the vote and withdraw functions. The withdraw function deletes only the vote belonging to that browser ID; after it succeeds, the page clears that browser's saved vote and allows another vote.

```sql
create or replace function public.set_vote(p_voter_id uuid, p_contestant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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
begin
  if p_voter_id is null then
    raise exception 'A voter is required.';
  end if;

  delete from public.votes
  where voter_id = p_voter_id;
end;
$$;

revoke all on function public.set_vote(uuid, uuid) from public;
revoke all on function public.withdraw_vote(uuid) from public;
grant execute on function public.set_vote(uuid, uuid) to anon, authenticated;
grant execute on function public.withdraw_vote(uuid) to anon, authenticated;
```

Reload the voting page after the SQL succeeds. A **Take back my vote** button appears after voting. Pressing it removes that browser's vote, updates the totals, and lets the user vote again.

```sql
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
revoke all on public.votes from anon, authenticated;

drop policy if exists "Anyone can add contestants" on public.contestants;
create policy "Anyone can add contestants"
  on public.contestants for insert to anon, authenticated
  with check (true);

drop function if exists public.get_vote_results();
create or replace function public.get_vote_results()
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
  group by c.id
  order by c.created_at asc;
$$;

create or replace function public.withdraw_vote(p_voter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_voter_id is null then
    raise exception 'A voter is required.';
  end if;

  delete from public.votes
  where voter_id = p_voter_id;
end;
$$;

create or replace function public.set_vote(p_voter_id uuid, p_contestant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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

revoke all on function public.get_vote_results() from public;
revoke all on function public.set_vote(uuid, uuid) from public;
revoke all on function public.withdraw_vote(uuid) from public;
grant execute on function public.get_vote_results() to anon, authenticated;
grant execute on function public.set_vote(uuid, uuid) to anon, authenticated;
grant execute on function public.withdraw_vote(uuid) to anon, authenticated;
```

## Publish on GitHub Pages

1. Push `index.html`, `style.css`, and `script.js` to a GitHub repository.
2. In that repository, open **Settings → Pages** and enable Pages from your chosen branch and folder.
3. Open the published Pages URL and share it with guests.

No Python server, build step, or secret key is needed. The vote ID is stored in each browser's local storage and the database keeps one current vote for each ID. A voter can take back their vote and then vote again. As with any anonymous public poll, this is a basic per-browser limit rather than verified identity; guests can bypass it by clearing browser storage or using another browser.
