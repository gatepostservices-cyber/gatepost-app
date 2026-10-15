#!/usr/bin/env bash
# Post a request to the Gatepost app's "Agent requests" inbox.
# Usage: tools/post-request.sh [--kind decision|todo] [--needs-christian] "From name" "Request text" ['{"title":"...","amount":"$200","links":["https://..."]}']
#   --kind decision   a question/approval Christian must answer (always needs_christian, sends a push)
#   --kind todo       routine to-do (default; quiet, no push unless --needs-christian)
#   --needs-christian flag a to-do for Christian personally (sends a push)
# Env alternatives: GATEPOST_REQUEST_KIND, GATEPOST_NEEDS_CHRISTIAN=1
# Uses the public publishable key (from config.js) + a posting token kept OUTSIDE the repo:
#   ~/.config/gatepost/request-token   (override with GATEPOST_REQUEST_TOKEN_FILE)
# The token is checked server-side by the public.post_request() RPC (only its SHA-256 hash is in the DB).
# No service_role key is used or needed.
set -euo pipefail
KIND="${GATEPOST_REQUEST_KIND:-}"; NC="${GATEPOST_NEEDS_CHRISTIAN:-}"
while [ $# -gt 0 ]; do case "$1" in
  --kind) KIND="${2:?--kind needs decision|todo}"; shift 2;; --kind=*) KIND="${1#--kind=}"; shift;;
  --needs-christian) NC=1; shift;; --) shift; break;; *) break;; esac; done
FROM="${1:?usage: post-request.sh FROM TEXT [DETAILS_JSON]}"; TEXT="${2:?missing TEXT}"; DETAILS="${3:-{\}}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="${GATEPOST_REQUEST_TOKEN_FILE:-$HOME/.config/gatepost/request-token}"
[ -r "$TOKEN_FILE" ] || { echo "token file not found: $TOKEN_FILE" >&2; exit 2; }
URL=$(sed -n 's/.*SUPABASE_URL: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
KEY=$(sed -n 's/.*SUPABASE_ANON_KEY: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
BODY=$(FROM="$FROM" TEXT="$TEXT" DETAILS="$DETAILS" TF="$TOKEN_FILE" K="$KIND" NC="$NC" python3 -c '
import json,os
print(json.dumps({"p_token":open(os.environ["TF"]).read().strip(),"p_from":os.environ["FROM"],"p_text":os.environ["TEXT"],"p_details":json.loads(os.environ["DETAILS"]),**({"p_kind":os.environ["K"]} if os.environ["K"] else {}),**({"p_needs_christian":True} if os.environ["NC"] in ("1","true","yes") else {})}))')
RES=$(curl -sS -w '\n%{http_code}' "$URL/rest/v1/rpc/post_request" -H "apikey: $KEY" -H "Content-Type: application/json" -d "$BODY")
CODE=${RES##*$'\n'}; OUT=${RES%$'\n'*}
if [ "$CODE" = 200 ]; then echo "posted request id $OUT"; else echo "failed ($CODE): $OUT" >&2; exit 1; fi
