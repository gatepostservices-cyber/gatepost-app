#!/usr/bin/env bash
# Shared helper: rpc FN JSON_ARGS  -> POST /rest/v1/rpc/FN with p_token added from the token file (never printed).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKEN_FILE="${GATEPOST_REQUEST_TOKEN_FILE:-$HOME/.config/gatepost/request-token}"
[ -r "$TOKEN_FILE" ] || { echo "token file not found: $TOKEN_FILE" >&2; exit 2; }
URL=$(sed -n 's/.*SUPABASE_URL: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
KEY=$(sed -n 's/.*SUPABASE_ANON_KEY: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
rpc() { local BODY RES CODE OUT
  BODY=$(ARGS="$2" TF="$TOKEN_FILE" python3 -c 'import json,os;d=json.loads(os.environ["ARGS"]);d["p_token"]=open(os.environ["TF"]).read().strip();print(json.dumps(d))')
  RES=$(curl -sS -w '\n%{http_code}' "$URL/rest/v1/rpc/$1" -H "apikey: $KEY" -H "Content-Type: application/json" -d @- <<<"$BODY")
  CODE=${RES##*$'\n'}; OUT=${RES%$'\n'*}
  if [ "$CODE" = 200 ]; then echo "$OUT"; else echo "failed ($CODE): $OUT" >&2; return 1; fi; }
