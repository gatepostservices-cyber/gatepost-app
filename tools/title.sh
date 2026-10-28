#!/usr/bin/env bash
# Wholesale Hub title companies (owner-only section in the Gatepost Admin app). Business contact data only.
# Usage:
#   tools/title.sh upsert cos.json     JSON array of company objects, keyed by "ext_id" (insert new, update existing; max 200)
#   tools/title.sh list                prints every title company as JSON
# Fields (all optional except ext_id; a key you leave out is NOT touched on an existing row):
#   ext_id          text 1-80, REQUIRED, unique key
#   name            text <=200   (REQUIRED when the company is new)
#   state           2 UPPERCASE letters, e.g. NM, OH   (REQUIRED when the company is new)
#   phone <=40      website <=300 (must start http:// or https://)      office_address <=300
#   contact_person <=120 (optional)      evidence_notes <=4000      call_script <=8000
#   status          To call | Called | Approved | Rejected     (new rows default to "To call")
#   call_notes      text <=4000
# ANY other key is rejected. Christian edits status + call_notes in the hub, so LEAVE OUT "status" and "call_notes" on re-runs to keep his edits.
# Token: ~/.config/gatepost/wholesale-token (same as wholesale.sh; override with GATEPOST_WHOLESALE_TOKEN_FILE). Outside the repo, never printed.
# Checked server-side by SECURITY DEFINER RPCs title_upsert / title_list (only the token's SHA-256 is in the DB).
set -euo pipefail
CMD="${1:-}"; [ $# -gt 0 ] && shift
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="${GATEPOST_WHOLESALE_TOKEN_FILE:-$HOME/.config/gatepost/wholesale-token}"
case "$CMD" in
  list) FN=title_list; ROWS='[]';;
  upsert) [ $# -eq 1 ] && [ -r "$1" ] || { echo "usage: title.sh upsert file.json  (JSON array of company objects)" >&2; exit 2; }
    FN=title_upsert
    ROWS=$(python3 - "$1" <<'PY'
import json, re, sys
KEYS = ["ext_id", "name", "state", "phone", "website", "office_address", "contact_person", "evidence_notes", "status", "call_notes", "call_script"]
LIM = {"ext_id": 80, "name": 200, "state": 2, "phone": 40, "website": 300, "office_address": 300, "contact_person": 120, "evidence_notes": 4000, "call_notes": 4000, "call_script": 8000, "status": 20}
STATUS = ["To call", "Called", "Approved", "Rejected"]
def bad(m): sys.stderr.write("rejected: " + m + "\n"); sys.exit(2)
try: d = json.load(open(sys.argv[1]))
except Exception as ex: bad("not valid JSON (%s)" % ex)
if not isinstance(d, list) or not d: bad("file must be a non-empty JSON array of company objects")
if len(d) > 200: bad("at most 200 companies per call")
seen = set()
for i, o in enumerate(d, 1):
    if not isinstance(o, dict): bad("row %d is not an object" % i)
    for k, v in o.items():
        if k not in KEYS: bad("row %d: unknown key %r (allowed: %s)" % (i, k, ", ".join(KEYS)))
        if not isinstance(v, str): bad("row %d: %s must be text" % (i, k))
        if len(v) > LIM[k]: bad("row %d: %s longer than %d" % (i, k, LIM[k]))
        if k == "status" and v not in STATUS: bad("row %d: status must be one of %s" % (i, ", ".join(STATUS)))
        if k == "state" and not re.fullmatch(r"[A-Z]{2}", v): bad("row %d: state must be 2 uppercase letters" % i)
        if k == "website" and not re.match(r"(?i)https?://", v): bad("row %d: website must start with http:// or https://" % i)
        if k == "name" and not v.strip(): bad("row %d: name cannot be empty" % i)
    x = o.get("ext_id")
    if not x or not x.strip(): bad("row %d: ext_id is required" % i)
    if x in seen: bad("row %d: duplicate ext_id %r in file" % (i, x))
    seen.add(x)
print(json.dumps(d))
PY
    ) || exit 2;;
  *) echo "usage: title.sh upsert file.json | list" >&2; exit 2;;
esac
[ -r "$TOKEN_FILE" ] || { echo "token file not found: $TOKEN_FILE" >&2; exit 2; }
URL=$(sed -n 's/.*SUPABASE_URL: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
KEY=$(sed -n 's/.*SUPABASE_ANON_KEY: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
BODY=$(ROWS="$ROWS" TF="$TOKEN_FILE" FN="$FN" python3 -c 'import json,os;d={"p_token":open(os.environ["TF"]).read().strip()}
if os.environ["FN"]=="title_upsert": d["p_cos"]=json.loads(os.environ["ROWS"])
print(json.dumps(d))')
RES=$(curl -sS -w '\n%{http_code}' "$URL/rest/v1/rpc/$FN" -H "apikey: $KEY" -H "Content-Type: application/json" -d @- <<<"$BODY")
CODE=${RES##*$'\n'}; OUT=${RES%$'\n'*}
if [ "$CODE" = 200 ]; then echo "$OUT"; else echo "failed ($CODE): $OUT" >&2; exit 1; fi
