#!/usr/bin/env bash
# Done list for the Owners Hub (Admin Hub > Inbox > Done): one card per item per day, with every change listed inside. Christian and Nate see it live.
# Usage:
#   tools/done.sh add  AGENT_ID BOT_NAME ITEM_KEY ASKED_BY "What changed" ["Card title"]
#   tools/done.sh list [DAYS]          # read-only: items of the last DAYS days (default 7), newest first, each with its changes (JSON)
#   ASKED_BY is Christian or Nate. ITEM_KEY is a stable id for the piece of work (for tools/unfinished.sh close it is the item's EXT_KEY).
#   Same ITEM_KEY on the same day (America/Denver) = the SAME card: the change is appended, never a second card. Next day = a new card.
#   Sending the exact same change twice for a card is ignored (safe to retry). The optional title sets / replaces the card title;
#   without it a new card is titled with the first change and later changes keep that title.
#   Limits: ITEM_KEY 200, AGENT_ID 200, BOT_NAME 80, change 1000, title 300 characters.
# Same token as unfinished.sh / post-request.sh: ~/.config/gatepost/request-token (override with GATEPOST_REQUEST_TOKEN_FILE), checked server-side by the
# SECURITY DEFINER RPCs done_add / done_list (only its SHA-256 hash is in the DB). No service_role key. The token is never printed.
set -euo pipefail
CMD="${1:?usage: done.sh add|list ...}"; shift
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="${GATEPOST_REQUEST_TOKEN_FILE:-$HOME/.config/gatepost/request-token}"
[ -r "$TOKEN_FILE" ] || { echo "token file not found: $TOKEN_FILE" >&2; exit 2; }
URL=$(sed -n 's/.*SUPABASE_URL: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
KEY=$(sed -n 's/.*SUPABASE_ANON_KEY: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
case "$CMD" in
  add) [ $# -ge 5 ] || { echo 'usage: done.sh add AGENT_ID BOT_NAME ITEM_KEY ASKED_BY "What changed" ["Card title"]' >&2; exit 2; }
    case "$4" in Christian|Nate) ;; *) echo "ASKED_BY must be Christian or Nate (got: $4)" >&2; exit 2;; esac
    FN=done_add; ARGS=$(python3 -c 'import json,sys;a=sys.argv[1:];d={"p_agent_id":a[0],"p_bot_name":a[1],"p_item_key":a[2],"p_asked_by":a[3],"p_change":a[4]}
if len(a)>5 and a[5].strip(): d["p_title"]=a[5]
print(json.dumps(d))' "$@");;
  list) FN=done_list; ARGS=$(python3 -c 'import json,sys;print(json.dumps({"p_days":int(sys.argv[1]) if len(sys.argv)>1 else 7}))' "$@");;
  *) echo "unknown command: $CMD (add|list)" >&2; exit 2;;
esac
BODY=$(ARGS="$ARGS" TF="$TOKEN_FILE" python3 -c 'import json,os;d=json.loads(os.environ["ARGS"]);d["p_token"]=open(os.environ["TF"]).read().strip();print(json.dumps(d))')
RES=$(curl -sS -w '\n%{http_code}' "$URL/rest/v1/rpc/$FN" -H "apikey: $KEY" -H "Content-Type: application/json" -d "$BODY")
CODE=${RES##*$'\n'}; OUT=${RES%$'\n'*}
if [ "$CODE" = 200 ]; then echo "$OUT"; else echo "failed ($CODE): $OUT" >&2; exit 1; fi
