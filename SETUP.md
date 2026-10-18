# Gatepost sync setup (Supabase, free tier)

1. Sign up at https://supabase.com (GitHub login works) -> New project (free, region US West). Save the DB password.
2. SQL Editor -> paste `supabase-setup.sql` -> Run, then `supabase-roles.sql`, `supabase-calendar-privacy.sql`, `supabase-bot-chat.sql`, `supabase-bot-activity.sql`, `supabase-resolve-request.sql` (roles, Outlook privacy, Town chat desks, activity log, bot request clearing).
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

## Bot boards (Town v3b)
Run `supabase-bot-boards.sql`. It creates `public.bot_boards` (admin-read only), the token-gated `post_board(token, bot, board_key, payload)` (it replaces that bot's row for the key) and the admin-only `approve_board_item` used by the one-tap Approve.
Bots publish with `tools/board.sh "<bot>" <key> '<json>'` (or `@file.json`), using the same token file as `post-request.sh`. Every list board takes `{"items":[...]}`; a bare JSON array also works.
- Gatepost `follow_ups_due`: `{"items":[{"who","sent":"YYYY-MM-DD","days":n,"channel"}]}`
- Gatepost `todays_jobs`: `{"items":[{"address","time","price","phone"}]}`
- Leads `nextdoor_replies`: `{"items":[{"name","waiting_since":"ISO time"}]}`
- Leads `lead_tally`: `{"sent_today":n,"goal":n,"stale_holds":[{"name","held_since":"ISO time or YYYY-MM-DD"}]}`
- Bids `quote_clock`: `{"items":[{"street","total","expires":"YYYY-MM-DD"}]}`
- Any bot `waiting_on_christian`: `{"items":[{"quote","needs","since":"ISO time (optional)"}]}`
- Tasks `promised_followups`: `{"items":[{"what","due":"YYYY-MM-DD","owner"}]}`

## Unfinished items (bots)
The app's **Unfinished** screen (town dock chip / building, admin only) lists work Christian started with a bot that isn't done. Bots report with `tools/unfinished.sh`, which uses the same token file as `post-request.sh` (`~/.config/gatepost/request-token`, override `GATEPOST_REQUEST_TOKEN_FILE`):

```
tools/unfinished.sh add     AGENT_ID BOT_NAME EXT_KEY "One-line summary" ["Last state"]
tools/unfinished.sh update  AGENT_ID BOT_NAME EXT_KEY "One-line summary" "Last state"
tools/unfinished.sh close   AGENT_ID EXT_KEY      # done
tools/unfinished.sh aborted AGENT_ID              # JSON list of items Christian aborted; marks them acknowledged
```
`add`/`update` are one idempotent upsert on (AGENT_ID, EXT_KEY); done/aborted items are never reopened. RPCs: `unfinished_upsert(p_token, p_agent_id, p_bot_name, p_ext_key, p_summary, p_state)`, `unfinished_close(p_token, p_agent_id, p_ext_key)`, `unfinished_aborted(p_token, p_agent_id)`. In the app, CONTINUE copies "Continue where you left off on: <summary>. Last state: <state>." then opens `grokbot://app/v1/agent?id=<agent_id>`; ABORT marks it aborted. No push notifications.
