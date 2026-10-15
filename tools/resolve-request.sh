#!/usr/bin/env bash
# Mark a request decided/cleared from a bot. Same token as post-request.sh.
#   tools/resolve-request.sh ITEM_ID approved|declined|done ["note"]
set -euo pipefail
ID="${1:?usage: resolve-request.sh ITEM_ID approved|declined|done [NOTE]}"; ST="${2:?missing STATUS}"; NOTE="${3:-}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"; TF="${GATEPOST_REQUEST_TOKEN_FILE:-$HOME/.config/gatepost/request-token}"
URL=$(sed -n 's/.*SUPABASE_URL: *"\([^"]*\)".*/\1/p' "$DIR/config.js"); KEY=$(sed -n 's/.*SUPABASE_ANON_KEY: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
BODY=$(I="$ID" S="$ST" N="$NOTE" TF="$TF" python3 -c 'import json,os;print(json.dumps({"p_token":open(os.environ["TF"]).read().strip(),"p_item_id":int(os.environ["I"]),"p_status":os.environ["S"],"p_note":os.environ["N"] or None}))')
RES=$(curl -sS -w '\n%{http_code}' "$URL/rest/v1/rpc/resolve_request" -H "apikey: $KEY" -H "Content-Type: application/json" -d "$BODY")
CODE=${RES##*$'\n'}; OUT=${RES%$'\n'*}; [ "$CODE" = 200 ] && echo "request $ID -> $OUT" || { echo "failed ($CODE): $OUT" >&2; exit 1; }
