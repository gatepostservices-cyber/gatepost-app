#!/usr/bin/env bash
# Wholesale Hub PHONE loader: puts phone numbers (from Dex's phones.csv) on EXISTING wholesale leads, keyed on ext_id. Phone-only: it updates the five phone columns
# (phone, phone_type, phone_contact, phone_source, phone_confidence) through the token RPC wholesale_leads_phones and nothing else. It never inserts a lead, never touches
# status / call_notes / owner data / scores, and rows with no phone are skipped, so re-running or loading a file with gaps never wipes an existing phone.
# Usage:
#   tools/wholesale_phones.sh load [--dry-run] [--check] [--file CSV] [--only nm-homes|nm-land|oh-homes] [--limit N] [--batch N]
#   --dry-run   reads + validates the CSV and prints what it would send (no token, no network).
#   --check     asks the database to count what it WOULD change (needs the token; writes nothing). Reports ext_ids that are not in the database.
#   --limit N   only the first N rows that have a phone (test on one row: --limit 1).
#   default file: /workspace/dex/leads/phones/phones.csv (override with --file or DEX_PHONES_CSV). Needs a header row with ext_id, phone, phone_type, phone_contact, phone_source, phone_confidence;
#   every other column (owner, notes, checked, ...) is ignored and never sent. Phone numbers are sent as written ("(505) 227-5691"); phone_type owner|agent|company and
#   phone_confidence high|medium|low are lower-cased; a row with a bad phone / type / confidence is skipped and listed (never sent).
# Phones are public-record / listing lookups: verify and DNC-scrub before calling (the hub shows that caption).
# Token: ~/.config/gatepost/wholesale-token (same as wholesale_leads.sh; override GATEPOST_WHOLESALE_TOKEN_FILE). Outside the repo, never printed.
set -euo pipefail
CMD="${1:-}"; [ $# -gt 0 ] && shift
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="${GATEPOST_WHOLESALE_TOKEN_FILE:-$HOME/.config/gatepost/wholesale-token}"
FILE="${DEX_PHONES_CSV:-/workspace/dex/leads/phones/phones.csv}"; DRY=0; CHECK=0; ONLY=""; LIMIT=0; BATCH=400
USAGE="usage: wholesale_phones.sh load [--dry-run] [--check] [--file CSV] [--only nm-homes|nm-land|oh-homes] [--limit N] [--batch N]"
[ "$CMD" = load ] || { echo "$USAGE" >&2; exit 2; }
while [ $# -gt 0 ]; do case "$1" in
  --dry-run) DRY=1; shift;; --check) CHECK=1; shift;; --file) FILE="${2:?--file needs a CSV}"; shift 2;; --only) ONLY="${2:?--only needs nm-homes|nm-land|oh-homes}"; shift 2;;
  --limit) LIMIT="${2:?--limit needs a number}"; shift 2;; --batch) BATCH="${2:?}"; shift 2;; *) echo "$USAGE" >&2; exit 2;; esac; done
[ -r "$FILE" ] || { echo "CSV not found: $FILE" >&2; exit 2; }
if [ "$DRY" = 0 ]; then [ -r "$TOKEN_FILE" ] || { echo "token file not found: $TOKEN_FILE" >&2; exit 2; }; fi
URL=$(sed -n 's/.*SUPABASE_URL: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
KEY=$(sed -n 's/.*SUPABASE_ANON_KEY: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
export URL KEY TOKEN_FILE FILE DRY CHECK ONLY LIMIT BATCH
exec python3 - <<'PY'
import csv, json, os, re, subprocess, sys
URL, KEY, TF, FILE = os.environ["URL"], os.environ["KEY"], os.environ["TOKEN_FILE"], os.environ["FILE"]
DRY, CHECK, ONLY, LIMIT, BATCH = os.environ["DRY"] == "1", os.environ["CHECK"] == "1", os.environ["ONLY"], int(os.environ["LIMIT"]), int(os.environ["BATCH"])
def die(m, c=2): sys.stderr.write(m + "\n"); sys.exit(c)
if not 1 <= BATCH <= 500: die("--batch must be 1-500")
if ONLY and ONLY not in ("nm-homes", "nm-land", "oh-homes"): die("--only must be nm-homes, nm-land or oh-homes")
def rpc(args):
    args = dict(args); args["p_token"] = open(TF).read().strip()
    r = subprocess.run(["curl", "-sS", "-w", "\n%{http_code}", URL + "/rest/v1/rpc/wholesale_leads_phones", "-H", "apikey: " + KEY, "-H", "Content-Type: application/json", "-d", "@-"],
                       input=json.dumps(args).encode(), capture_output=True)
    body, _, code = r.stdout.decode().rpartition("\n")
    if r.returncode or code != "200": die("failed (%s): %s %s" % (code, body[:500], r.stderr.decode()[:200]), 1)
    return json.loads(body)
PH = re.compile(r"^[0-9+()\-. ]{7,30}(\s*(x|ext\.?)\s*[0-9]{1,6})?$")
def one(v, n): v = " ".join((v or "").split()); return (v if len(v) <= n else v[:n - 1] + "\u2026") if v else None
rows, skipped_blank, bad, seen = [], 0, [], set()
with open(FILE, newline="", encoding="utf-8-sig") as fh:
    rd = csv.DictReader(fh)
    need = {"ext_id", "phone", "phone_type", "phone_contact", "phone_source", "phone_confidence"}
    if not need <= set(rd.fieldnames or []): die("CSV is missing columns: " + ", ".join(sorted(need - set(rd.fieldnames or []))))
    for n, o in enumerate(rd, 2):
        eid = (o.get("ext_id") or "").strip(); ph = one(o.get("phone"), 40)
        if ONLY and not eid.startswith(ONLY + "-"): continue
        if not eid: bad.append((n, "", "no ext_id")); continue
        if not ph: skipped_blank += 1; continue
        t = (o.get("phone_type") or "").strip().lower() or None; c = (o.get("phone_confidence") or "").strip().lower() or None
        why = "duplicate ext_id" if eid in seen else "bad phone %r" % ph if (not PH.match(ph) or not 7 <= len(re.sub(r"\D", "", ph)) <= 15) else "bad phone_type %r" % t if t not in (None, "owner", "agent", "company") else "bad phone_confidence %r" % c if c not in (None, "high", "medium", "low") else "ext_id too long" if len(eid) > 80 else ""
        if why: bad.append((n, eid, why)); continue
        seen.add(eid)
        rows.append({k: v for k, v in dict(ext_id=eid, phone=ph, phone_type=t, phone_contact=one(o.get("phone_contact"), 200), phone_source=one(o.get("phone_source"), 1000), phone_confidence=c).items() if v is not None})
if LIMIT: rows = rows[:LIMIT]
tc = lambda k: {v: sum(1 for r in rows if r.get(k) == v) for v in sorted({r.get(k) for r in rows if r.get(k)})}
print("file %s: %d rows with a phone (blank rows skipped: %d); type %s; confidence %s" % (FILE, len(rows), skipped_blank, tc("phone_type"), tc("phone_confidence")))
for n, eid, why in bad: print("  SKIPPED line %d %s: %s" % (n, eid, why))
if not rows: die("nothing to load", 1)
if DRY: print("dry run: nothing sent. first row:", json.dumps(rows[0])); sys.exit(0)
tot = dict(updated=0, not_found=0, skipped_no_phone_data=0); nf = []; last = None
for i in range(0, len(rows), BATCH):
    r = rpc({"p_rows": rows[i:i + BATCH], "p_dry_run": CHECK})
    for k in tot: tot[k] += r[k]
    nf += r["not_found_sample"]; last = r["leads_with_phone"]
print(("CHECK (database unchanged): would update %d, not in database %d" if CHECK else "updated %d leads, not in database %d") % (tot["updated"], tot["not_found"]) + ("; leads with a phone now: %d" % last if not CHECK else "; leads with a phone today: %d" % last))
if nf: print("  ext_ids not found (first %d): %s" % (len(nf), ", ".join(nf[:20])))
PY
