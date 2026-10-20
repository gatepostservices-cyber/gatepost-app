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
