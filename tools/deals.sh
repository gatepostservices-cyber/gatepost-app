#!/usr/bin/env bash
# Wholesale Hub deal tracker (owner-only screen in the Gatepost Admin app). Property/deal facts only.
# Usage:
#   tools/deals.sh upsert deals.json     JSON array of deal objects, keyed by "ext_id" (insert new, update existing; max 200)
#   tools/deals.sh list                  prints every deal as JSON
# Deal fields (all optional except ext_id; a key you leave out is NOT touched on an existing deal):
#   ext_id             text 1-80, REQUIRED, unique key
#   state              2 UPPERCASE letters, NM or OH (a NEW deal without it is OH when its ext_id starts with oh-, else NM; omitted on update = unchanged)
#   type               homes | land   (new deals default to homes; left out on an existing deal = unchanged)
#   address            text <=200 (the PROPERTY address only)
#   list_price arv rehab   numbers >= 0 (< 1e10)
#   max_offer          number (< 1e10 in size)
#   creative_structure text <=2000      notes text <=4000      call_script text <=8000
#   status             Considering | Offered | Under contract | Assigned | Dead   (new deals default to Considering)
# ANY other key is rejected (there are NO owner-name or mailing-address fields; do not send them). Christian edits status + notes in the hub,
# so leave "status"/"notes" out of re-runs unless you mean to overwrite them.
# Token: ~/.config/gatepost/wholesale-token (same token as wholesale.sh; override with GATEPOST_WHOLESALE_TOKEN_FILE). Outside the repo, never printed.
# Checked server-side by SECURITY DEFINER RPCs deals_upsert / deals_list (only the token's SHA-256 is in the DB).
set -euo pipefail
CMD="${1:-}"; [ $# -gt 0 ] && shift
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="${GATEPOST_WHOLESALE_TOKEN_FILE:-$HOME/.config/gatepost/wholesale-token}"
case "$CMD" in
  list) FN=deals_list; DEALS='[]';;
  upsert) [ $# -eq 1 ] && [ -r "$1" ] || { echo "usage: deals.sh upsert file.json  (JSON array of deal objects)" >&2; exit 2; }
    FN=deals_upsert
    DEALS=$(python3 - "$1" <<'PY'
import json, math, sys
KEYS = ["ext_id", "state", "type", "address", "list_price", "arv", "rehab", "max_offer", "creative_structure", "status", "notes", "call_script"]
NUM = {"list_price", "arv", "rehab", "max_offer"}
TXT = {"ext_id": 80, "address": 200, "creative_structure": 2000, "notes": 4000, "call_script": 8000}
STATUS = ["Considering", "Offered", "Under contract", "Assigned", "Dead"]
def bad(m): sys.stderr.write("rejected: " + m + "\n"); sys.exit(2)
try: d = json.load(open(sys.argv[1]))
except Exception as ex: bad("not valid JSON (%s)" % ex)
if not isinstance(d, list) or not d: bad("file must be a non-empty JSON array of deal objects")
if len(d) > 200: bad("at most 200 deals per call")
seen = set()
for i, o in enumerate(d, 1):
    if not isinstance(o, dict): bad("deal %d is not an object" % i)
    for k, v in o.items():
        if k not in KEYS: bad("deal %d: unknown key %r (allowed: %s)" % (i, k, ", ".join(KEYS)))
        if k in NUM:
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v): bad("deal %d: %s must be a number" % (i, k))
            if abs(v) >= 1e10 or (k != "max_offer" and v < 0): bad("deal %d: %s out of range" % (i, k))
        elif k == "state":
            if not (isinstance(v, str) and len(v) == 2 and v.isascii() and v.isalpha() and v.isupper()): bad("deal %d: state must be 2 uppercase letters" % i)
        elif k == "type":
            if v not in ("homes", "land"): bad("deal %d: type must be homes or land" % i)
        elif k == "status":
            if v not in STATUS: bad("deal %d: status must be one of %s" % (i, ", ".join(STATUS)))
        else:
            if not isinstance(v, str): bad("deal %d: %s must be text" % (i, k))
            if len(v) > TXT[k]: bad("deal %d: %s longer than %d" % (i, k, TXT[k]))
    x = o.get("ext_id")
    if not isinstance(x, str) or not x.strip(): bad("deal %d: ext_id is required" % i)
    if x in seen: bad("deal %d: duplicate ext_id %r in file" % (i, x))
    seen.add(x)
print(json.dumps(d))
PY
    ) || exit 2;;
  *) echo "usage: deals.sh upsert file.json | list" >&2; exit 2;;
esac
[ -r "$TOKEN_FILE" ] || { echo "token file not found: $TOKEN_FILE" >&2; exit 2; }
URL=$(sed -n 's/.*SUPABASE_URL: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
KEY=$(sed -n 's/.*SUPABASE_ANON_KEY: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
BODY=$(DEALS="$DEALS" TF="$TOKEN_FILE" FN="$FN" python3 -c 'import json,os;d={"p_token":open(os.environ["TF"]).read().strip()}
if os.environ["FN"]=="deals_upsert": d["p_deals"]=json.loads(os.environ["DEALS"])
print(json.dumps(d))')
RES=$(curl -sS -w '\n%{http_code}' "$URL/rest/v1/rpc/$FN" -H "apikey: $KEY" -H "Content-Type: application/json" -d @- <<<"$BODY")
CODE=${RES##*$'\n'}; OUT=${RES%$'\n'*}
if [ "$CODE" = 200 ]; then echo "$OUT"; else echo "failed ($CODE): $OUT" >&2; exit 1; fi
