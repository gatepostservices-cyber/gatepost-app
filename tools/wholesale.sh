#!/usr/bin/env bash
# Wholesale Hub summary numbers (owner-only screen in the Gatepost Admin app). Numbers only: never names or addresses.
# Usage:
#   tools/wholesale.sh get
#   tools/wholesale.sh set listings=10 call_today=19 week=142 worth_a_look=299     (any subset; whole numbers 0..999999999)
# Keys: listings (listings considered), call_today (leads to call today), week (leads this week), worth_a_look.
# Token: ~/.config/gatepost/wholesale-token (override with GATEPOST_WHOLESALE_TOKEN_FILE). Kept OUTSIDE the repo, never printed.
# The token is checked server-side by the SECURITY DEFINER RPCs wholesale_set / wholesale_get (only its SHA-256 is in the DB).
set -euo pipefail
CMD="${1:-}"; [ $# -gt 0 ] && shift
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="${GATEPOST_WHOLESALE_TOKEN_FILE:-$HOME/.config/gatepost/wholesale-token}"
case "$CMD" in
  get) FN=wholesale_get; VALS='{}';;
  set) [ $# -ge 1 ] || { echo "usage: wholesale.sh set key=number [key=number ...]  (keys: listings call_today week worth_a_look)" >&2; exit 2; }
    FN=wholesale_set
    VALS=$(python3 - "$@" <<'PY'
import json, re, sys
KEYS = {"listings", "call_today", "week", "worth_a_look"}
out = {}
for a in sys.argv[1:]:
    k, sep, v = a.partition("=")
    if not sep or k not in KEYS:
        sys.stderr.write("bad argument %r (expected key=number, keys: %s)\n" % (k if sep else a, " ".join(sorted(KEYS)))); sys.exit(2)
    if not re.fullmatch(r"[0-9]{1,9}", v):
        sys.stderr.write("rejected: %s must be a whole number (digits only), got %r\n" % (k, v)); sys.exit(2)
    out[k] = int(v)
print(json.dumps(out))
PY
    ) || exit 2;;
  *) echo "usage: wholesale.sh get | set key=number ..." >&2; exit 2;;
esac
[ -r "$TOKEN_FILE" ] || { echo "token file not found: $TOKEN_FILE" >&2; exit 2; }
URL=$(sed -n 's/.*SUPABASE_URL: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
KEY=$(sed -n 's/.*SUPABASE_ANON_KEY: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
BODY=$(VALS="$VALS" TF="$TOKEN_FILE" FN="$FN" python3 -c 'import json,os;d={"p_token":open(os.environ["TF"]).read().strip()}
if os.environ["FN"]=="wholesale_set": d["p_values"]=json.loads(os.environ["VALS"])
print(json.dumps(d))')
RES=$(curl -sS -w '\n%{http_code}' "$URL/rest/v1/rpc/$FN" -H "apikey: $KEY" -H "Content-Type: application/json" -d @- <<<"$BODY")
CODE=${RES##*$'\n'}; OUT=${RES%$'\n'*}
if [ "$CODE" = 200 ]; then echo "$OUT"; else echo "failed ($CODE): $OUT" >&2; exit 1; fi
