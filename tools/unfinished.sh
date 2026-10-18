#!/usr/bin/env bash
# Track work Christian started with a bot that isn't finished yet (the app's "Unfinished" screen).
# Usage:
#   tools/unfinished.sh add     AGENT_ID BOT_NAME EXT_KEY "One-line summary" ["Last state"]
#   tools/unfinished.sh update  AGENT_ID BOT_NAME EXT_KEY "One-line summary" "Last state"
#   tools/unfinished.sh close   AGENT_ID EXT_KEY            # mark done
#   tools/unfinished.sh aborted AGENT_ID                    # JSON list of items Christian aborted (not yet seen); marks them seen
# add/update are the same idempotent upsert on (AGENT_ID, EXT_KEY); an empty state keeps the old one. Done/aborted items are not reopened.
# Same token as post-request.sh: ~/.config/gatepost/request-token (override with GATEPOST_REQUEST_TOKEN_FILE),
# checked server-side by the SECURITY DEFINER RPCs (only its SHA-256 hash is in the DB). No service_role key. No push notifications.
set -euo pipefail
CMD="${1:?usage: unfinished.sh add|update|close|aborted ...}"; shift
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="${GATEPOST_REQUEST_TOKEN_FILE:-$HOME/.config/gatepost/request-token}"
[ -r "$TOKEN_FILE" ] || { echo "token file not found: $TOKEN_FILE" >&2; exit 2; }
URL=$(sed -n 's/.*SUPABASE_URL: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
KEY=$(sed -n 's/.*SUPABASE_ANON_KEY: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
case "$CMD" in
  add|update) [ $# -ge 4 ] || { echo "usage: unfinished.sh $CMD AGENT_ID BOT_NAME EXT_KEY SUMMARY [STATE]" >&2; exit 2; }
    FN=unfinished_upsert; ARGS=$(python3 -c 'import json,sys;a=sys.argv[1:];print(json.dumps({"p_agent_id":a[0],"p_bot_name":a[1],"p_ext_key":a[2],"p_summary":a[3],"p_state":a[4] if len(a)>4 else ""}))' "$@");;
  close) [ $# -ge 2 ] || { echo "usage: unfinished.sh close AGENT_ID EXT_KEY" >&2; exit 2; }
    FN=unfinished_close; ARGS=$(python3 -c 'import json,sys;print(json.dumps({"p_agent_id":sys.argv[1],"p_ext_key":sys.argv[2]}))' "$1" "$2");;
  aborted) [ $# -ge 1 ] || { echo "usage: unfinished.sh aborted AGENT_ID" >&2; exit 2; }
    FN=unfinished_aborted; ARGS=$(python3 -c 'import json,sys;print(json.dumps({"p_agent_id":sys.argv[1]}))' "$1");;
  *) echo "unknown command: $CMD (add|update|close|aborted)" >&2; exit 2;;
esac
BODY=$(ARGS="$ARGS" TF="$TOKEN_FILE" python3 -c 'import json,os;d=json.loads(os.environ["ARGS"]);d["p_token"]=open(os.environ["TF"]).read().strip();print(json.dumps(d))')
RES=$(curl -sS -w '\n%{http_code}' "$URL/rest/v1/rpc/$FN" -H "apikey: $KEY" -H "Content-Type: application/json" -d "$BODY")
CODE=${RES##*$'\n'}; OUT=${RES%$'\n'*}
if [ "$CODE" = 200 ]; then echo "$OUT"; else echo "failed ($CODE): $OUT" >&2; exit 1; fi
