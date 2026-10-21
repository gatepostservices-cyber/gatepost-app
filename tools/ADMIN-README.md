## Gatepost Admin: bot tools (for Alabaster's 6:30 PM daily run)
All scripts use the same token as `post-request.sh` / `unfinished.sh`: `~/.config/gatepost/request-token` (override `GATEPOST_REQUEST_TOKEN_FILE`). The token is checked server-side by SECURITY DEFINER RPCs; never print it. Data shows only to the owners (Christian, Nate) in the app's **Office** screen.

### Leads (`tools/leads.sh lead`)
```
tools/leads.sh lead EXT_KEY "Name" "Work" [NEXTDOOR_POST_URL] [MESSAGE] [SOURCE] [PHONE]
```
Idempotent upsert on EXT_KEY (use the Nextdoor post id). RPC `leads_upsert(p_token, p_ext_key, p_name, p_work, p_nextdoor_post_url, p_message, p_source, p_phone)`. No screenshots; the app shows a "Nextdoor post" link.

### Texts (`tools/leads.sh text`), from Google Voice emails (senders `@txt.voice.google.com`)
```
tools/leads.sh text EXT_KEY PHONE "Body" ["Name"] ["Work"] [SENT_AT_ISO] [in|out]
```
Upsert on EXT_KEY (use the email Message-ID). RPC `texts_upsert(...)`. Each text is matched against leads: **auto-confirmed only when Name AND Work both match the lead exactly** (case/spacing ignored). A partial match (same name or first name, same work, or same phone) is a *possible match* the owners Confirm/Reject in the app. Pass the name/work you read from the text when you can. The email reader itself is not built yet.

### Call notes (`tools/call_notes_sync.sh`)
```
tools/call_notes_sync.sh [DIR]     # default /workspace/gatepost/call-notes
```
Each `<phone>.md` file (e.g. `5055551234.md`) is upserted into `call_notes` (one row per phone; the file replaces the old text). RPC `call_notes_upsert(p_token, p_phone, p_body, p_modified)`. They appear in the Customer timeline with leads, matched texts and quotes, merged by phone.

### Outreach (`tools/outreach.sh log`), daily run
```
tools/outreach.sh log LEAD CHANNEL "Summary" [out|in] [STATUS] [SENT_BY] [SENT_AT_ISO] [EXT_KEY]
# e.g. tools/outreach.sh log nd-12345 nextdoor "Replied to post with intro + quote offer" out sent Alabaster
```
After each reply/message you send (or a reply you see come in), log it. LEAD = the lead's EXT_KEY (or numeric id). CHANNEL `nextdoor|text|email|call|other`, STATUS `sent|replied|no_reply|won|lost` (default `sent`), SENT_BY your name. Pass an EXT_KEY (e.g. the message id) to make re-runs idempotent. RPC `lead_outreach_upsert(p_token, p_lead, p_channel, p_summary, p_direction, p_status, p_sent_by, p_sent_at, p_ext_key)`. Owners see the latest entry on each lead in Office > Leads and can tap it for the full history.

### Follow-up drafts (`tools/followups.sh`), Alabaster, daily 6:30 PM run
```
tools/followups.sh add EXT_KEY CHANNEL RECIPIENT "Body" DAY_OFFSET [DUE_AT_ISO] [CUSTOMER_NAME] [LEAD] [QUOTE_REF]
tools/followups.sh approved
tools/followups.sh sent ID|EXT_KEY
# e.g. tools/followups.sh add Q-1042-d3 text "(505) 555-0123" "Hi Pat, just checking in on the gutter quote..." 3 2026-10-24T17:00:00-06:00 "Pat Lee" nd-12345 Q-1042
```
Follow-ups go out 1, 3 and 6 days after each quote, but **nothing sends without an owner's approval**. At the daily 6:30 PM run:
1. **Add** a draft for every follow-up now due (day 1/3/6 after the quote) with `add`. Use a stable EXT_KEY (quote ref + day, e.g. `Q-1042-d3`) so re-runs don't duplicate. Re-adding only refreshes a draft that is still pending; approved/denied/sent drafts are never changed. CHANNEL `text|email`, DAY_OFFSET `1|3|6`.
2. **Send only approved drafts**: run `approved`, send each one's `send_body` exactly as written (it includes any owner edit) to its `recipient` on its `channel`.
3. **Mark sent** right after each send: `sent ID`. It refuses anything not approved.
Never send a pending or denied draft. Owners (Christian and Nate) approve, edit-then-approve or deny in the app under Inbox > Approvals. Denied drafts are kept. The app itself never sends anything.
RPCs `followup_draft_upsert(p_token, p_ext_key, p_channel, p_recipient, p_body, p_day_offset, p_due_at, p_customer_name, p_lead, p_quote_ref)`, `followup_approved_list(p_token)`, `followup_mark_sent(p_token, p_id)`.

### Weekly win/loss report (`tools/reports.sh`), Marv
```
tools/reports.sh post --kind win_loss --week-ending YYYY-MM-DD --title "Win/loss, week ending Oct 18" --summary "..." --data-file /path/report.json [--ext-key KEY] [--posted-by Marv]
```
The ext key defaults to `KIND-WEEK_ENDING` (e.g. `win_loss-2026-10-18`); re-posting the same week replaces it. Both owners see a running list (newest first, expandable) under Today > Reports.
**Rule: a quote not won within one week of quoting counts as lost.**
data JSON (all fields optional):
```
{"counts":{"quoted":12,"won":5,"lost":4,"open":3},"dollars":{"won":4200,"lost":3100},
 "by_job_type":[{"type":"Gutter cleaning","quoted":4,"won":2,"lost":1,"won_usd":600}],
 "pricing_flags":[{"type":"Fence repair","direction":"high","reason":"Lost 3 of 3, all said price"}],
 "won":["Pat Lee"],"lost":["Sam Ortiz"]}
```
RPC `reports_upsert(p_token, p_ext_key, p_kind, p_title, p_week_ending, p_summary, p_data, p_posted_by)`.

### Notes for bots (`tools/leads.sh notes`)
```
tools/leads.sh notes               # JSON list of unread notes the owners left in Office > Control
tools/leads.sh notes-read ID [ID..] # mark them read after handling
```
RPCs `bot_notes_unread(p_token)`, `bot_notes_mark_read(p_token, p_ids)`. Notes are non-urgent; handle them in the daily run. No new routines.

### Price book (`tools/price_book_sync.sh`), daily run
Source (chosen by Christian): OneDrive `/Gatepost/99_Archive/Pricing_2026-10-16/Gatepost_Full_Rate_Book_copy_formerly_named_Pricing_Reference.md` (item id `D0F4007D996EA966!s2245658aaa64477082feec1373d1c977`). Never move, rename or edit it.
1. Download it with your OneDrive tool (DownloadFile, connection user-Onedrive) to `/workspace/gatepost/price-book.md`, and set the file's mtime to the OneDrive `lastModifiedDateTime` (e.g. `touch -d 2026-10-16T13:47:58Z /workspace/gatepost/price-book.md`).
2. Run `tools/price_book_sync.sh` (default file above; `--dry-run` to only parse).
It parses each `## Section`, every `| Job | Unit | Low | Aim | Notes |` row and the bullet rules under "How to use", "Rules" and "Open conflicts" (stored as unit `rule`), then replaces all of `price_book` via `price_book_replace(p_token, p_rows)`; source = file name + modified date. Non-numeric Low/Aim are left blank and printed as `AMBIGUOUS:` lines; report those, don't guess. It refuses to replace if 20 rows or fewer parse.
