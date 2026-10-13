# Gatepost sync setup (Supabase, free tier)

1. Sign up at https://supabase.com (GitHub login works) -> New project (free, region US West). Save the DB password.
2. SQL Editor -> paste `supabase-setup.sql` -> Run.
3. Authentication -> Sign In / Providers -> Email: keep enabled. For simplest onboarding turn OFF "Confirm email"
   (otherwise each new user must click an email link before logging in).
4. Authentication -> URL Configuration -> Site URL: https://gatepostservices-cyber.github.io/gatepost-app/
5. Project Settings -> API: copy Project URL + anon (publishable) key into `config.js`.
6. Register first in the app -> that account becomes admin automatically. Others start with 0 access.

Agents posting requests: server-side insert into `items` (kind='request', status='pending', data={from,text})
using the service_role key. Never ship service_role to the browser.

Optional: PostHog -> put public `phc_` key in config.js. Optional Twilio SMS: see supabase/functions/notify-request.
Free-tier note: Supabase pauses projects after ~7 days of no activity; open the dashboard to restore.
Old phone data in localStorage is not migrated automatically (re-enter or ask for an import script).
