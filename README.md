# Costume Royale

A simple Halloween costume poll hosted on GitHub Pages. Contestants and votes are shared through Supabase. Voters see contestant names without vote totals; totals are shown on the admin page.

## Set up Supabase

1. Open **SQL Editor** in your Supabase project and run [supabase.sql](./supabase.sql). The poll starts closed. Running the SQL again keeps the existing open/closed state.
2. In **Project Settings → API**, copy the project URL and public anon key. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in both [script.js](./script.js) and [admin.js](./admin.js).
3. Do not put a Supabase `service_role` key in the website.

## Pages

- Share `index.html` with voters.
- Open `admin.html` to view results and start or stop voting.

There is no admin password or token. Anyone who can open the admin page can manage the poll, and the admin database functions are callable without a password. This is intended for simple local use, not a public poll that needs access control.

## Publish on GitHub Pages

1. Push `index.html`, `admin.html`, `style.css`, `script.js`, and `admin.js` to your repository.
2. In **Settings → Pages**, enable Pages for your chosen branch and folder.
3. Use the `index.html` URL for voters and the `admin.html` URL for poll management.

Results and voting status refresh automatically every 15 seconds. Each browser's vote ID is stored in local storage, so this is a basic per-browser voting limit rather than verified identity.
