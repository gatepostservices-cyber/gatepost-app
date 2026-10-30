#!/usr/bin/env bash
# Wholesale Hub LEADS loader (owner-only screens in the Owners Hub: tap Call today / This week / Worth a look, open a lead).
# (Named wholesale_leads.sh because tools/leads.sh is the existing Gatepost Admin Nextdoor-leads tool.)
# Usage:
#   tools/wholesale_leads.sh load [--dry-run] [--dump FILE.json] [--only nm-homes|nm-land|oh-homes] [--batch N] [--dex DIR]
#   tools/wholesale_leads.sh status            counts in the database by state / type / bucket / status
# load reads Dex's CSVs (default DIR /workspace/dex/leads):
#     nm-homes  DIR/leads_latest.csv                NM  homes
#     nm-land   DIR/land/land_leads_latest.csv      NM  land
#     oh-homes  DIR/cleveland/leads_latest.csv      OH  homes
#   and upserts EVERY row (Call today, This week and Worth a look) in batches (default 400, max 500) through the token RPC wholesale_leads_upsert.
#   Safe to re-run: rows are keyed by ext_id; status and call_notes (what Christian sets in the hub) are NEVER written by the loader.
#   --dump FILE.json (implies --dry-run) also writes the rows it would send, for inspection.
#   --dry-run reads the files, validates, prints the counts it WOULD load, and touches neither the token nor the network.
# ext_id (the link to wholesale_deals, which uses the same ids): nm-land-<apn>, nm-homes-<upc>, oh-homes-<parcel_id>
#   (a CSV "ext_id" column wins if Dex adds one; rows with no id/duplicate id get a short hash of the address).
# PRIVACY: only whitelisted property-record columns are picked out of each CSV by name. The owner, owner_mail, mail and mail_state columns (names / mailing
#   addresses) are never read into memory, sent or stored; owner_flag (a category) and absentee / out_of_state (0/1) are kept. The RPC rejects owner/mail keys too.
# Token: ~/.config/gatepost/wholesale-token (same as wholesale.sh / deals.sh; override GATEPOST_WHOLESALE_TOKEN_FILE). Outside the repo, never printed.
set -euo pipefail
CMD="${1:-}"; [ $# -gt 0 ] && shift
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="${GATEPOST_WHOLESALE_TOKEN_FILE:-$HOME/.config/gatepost/wholesale-token}"
DRY=0; DUMP=""; ONLY=""; BATCH=400; DEX="${DEX_LEADS_DIR:-/workspace/dex/leads}"
case "$CMD" in
  load) while [ $# -gt 0 ]; do case "$1" in
      --dry-run) DRY=1; shift;; --dump) DUMP="${2:?--dump needs a file}"; DRY=1; shift 2;; --only) ONLY="${2:?--only needs nm-homes|nm-land|oh-homes}"; shift 2;; --batch) BATCH="${2:?}"; shift 2;; --dex) DEX="${2:?}"; shift 2;;
      *) echo "usage: wholesale_leads.sh load [--dry-run] [--dump FILE] [--only nm-homes|nm-land|oh-homes] [--batch N] [--dex DIR] | status" >&2; exit 2;; esac; done;;
  status) FN=wholesale_leads_stats;;
  *) echo "usage: wholesale_leads.sh load [--dry-run] [--dump FILE] [--only nm-homes|nm-land|oh-homes] [--batch N] [--dex DIR] | status" >&2; exit 2;;
esac
if [ "$CMD" = status ] || [ "$DRY" = 0 ]; then
  [ -r "$TOKEN_FILE" ] || { echo "token file not found: $TOKEN_FILE" >&2; exit 2; }
fi
URL=$(sed -n 's/.*SUPABASE_URL: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
KEY=$(sed -n 's/.*SUPABASE_ANON_KEY: *"\([^"]*\)".*/\1/p' "$DIR/config.js")
export URL KEY TOKEN_FILE DRY DUMP ONLY BATCH DEX CMD
exec python3 - <<'PY'
import csv, datetime, hashlib, json, os, subprocess, sys
CMD, DRY, ONLY, DEX = os.environ["CMD"], os.environ["DRY"] == "1", os.environ["ONLY"], os.environ["DEX"]
URL, KEY, TF = os.environ["URL"], os.environ["KEY"], os.environ["TOKEN_FILE"]
def die(m, c=2): sys.stderr.write(m + "\n"); sys.exit(c)
def rpc(fn, args):
    args = dict(args); args["p_token"] = open(TF).read().strip()
    r = subprocess.run(["curl", "-sS", "-w", "\n%{http_code}", URL + "/rest/v1/rpc/" + fn, "-H", "apikey: " + KEY, "-H", "Content-Type: application/json", "-d", "@-"],
                       input=json.dumps(args).encode(), capture_output=True)
    out = r.stdout.decode(); body, _, code = out.rpartition("\n")
    if r.returncode or code != "200": die("failed (%s): %s %s" % (code, body[:500], r.stderr.decode()[:200]), 1)
    return json.loads(body)
if CMD == "status":
    rows = rpc("wholesale_leads_stats", {}); tot = 0
    for r in rows: print("%-3s %-6s %-13s %-15s %6d" % (r["state"], r["type"], r["bucket"], r["status"], r["n"])); tot += r["n"]
    print("total", tot); sys.exit(0)

BATCH = int(os.environ["BATCH"])
if not 1 <= BATCH <= 500: die("--batch must be 1-500")
# ---- columns we are allowed to read, by name. Anything else (owner, owner_mail, mail, mail_state, ...) is skipped without keeping the value. ----
SPECS = {
 "nm-homes": dict(file="leads_latest.csv", state="NM", type="homes",
    cols="bucket score market address owner_flag absentee source source_url assessor_url upc permits permit_statuses latest_permit_year work why tax_delinquency note ext_id".split()),
 "nm-land": dict(file="land/land_leads_latest.csv", state="NM", type="land",
    cols="bucket score county region apn account address_or_legal area zip acres owner_flag death_cert out_of_state last_transfer_year last_transfer_date last_transfer_type sale_date_basis tax_flag tax_balance why source_url note ext_id".split()),
 "oh-homes": dict(file="cleveland/leads_latest.csv", state="OH", type="homes",
    cols="bucket score address owner_flag source source_url assessor_url parcel_id violations condemned boardups tax_delinquent_balance foreclosure_flag last_sale sqft year_built why note ext_id".split()),
}
if ONLY and ONLY not in SPECS: die("--only must be one of " + ", ".join(SPECS))
BUCKETS = ("Call today", "This week", "Worth a look")
def s(v): v = (v or "").strip(); return v or None
def num(v, f=float):
    v = (v or "").strip()
    if v == "": return None
    try: x = float(v)
    except ValueError: return None
    return int(x) if f is int else (int(x) if x == int(x) else x)
def flag(v): v = (v or "").strip().lower(); return None if v == "" else v in ("1", "1.0", "y", "yes", "true")
def clip(v, n): return v if v is None or len(v) <= n else v[:n - 1] + "\u2026"
def uniq(parts, sep):
    seen, out = set(), []
    for p in (x.strip() for x in (parts or "").split(sep)):
        if p and p not in seen: seen.add(p); out.append(p)
    return out
def hid(*a): return hashlib.sha1("|".join(a).encode()).hexdigest()[:8]
def read(key):
    sp = SPECS[key]; path = os.path.join(DEX, sp["file"])
    if not os.path.isfile(path): die("missing CSV: " + path)
    date = datetime.date.fromtimestamp(os.path.getmtime(path)).isoformat()
    out = []
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rd = csv.reader(fh); head = next(rd); pick = {h: i for i, h in enumerate(head) if h in sp["cols"]}
        for r in rd:
            if not r: continue
            o = {h: (r[i] if i < len(r) else "") for h, i in pick.items()}   # only whitelisted columns survive this line
            del r
            out.append(o)
    return sp, date, out
def build(key):
    sp, date, rows = read(key); res = []
    for o in rows:
        b = (o.get("bucket") or "").strip()
        if b not in BUCKETS: die("%s: unexpected bucket %r" % (key, b))
        sc = num(o.get("score"), int)
        if sc is None: die("%s: row without a score" % key)
        d = {}
        if key == "nm-homes":
            addr, pid, market = s(o["address"]), s(o["upc"]), s(o["market"])
            d = dict(owner_flag=s(o["owner_flag"]), absentee=flag(o["absentee"]), upc=pid, permits=uniq(o["permits"], ";") or None, permit_statuses=s(o["permit_statuses"]),
                     latest_permit_year=num(o["latest_permit_year"], int), work=uniq(o["work"], " | ") or None, tax_status=s(o["tax_delinquency"]),
                     tax_delinquent=(o["tax_delinquency"] or "").upper().startswith("DELINQUENT"), source=s(o["source"]))
            base = "nm-homes-" + (pid or hid(addr or "", o["source"]))
        elif key == "nm-land":
            addr, pid, market = s(o["address_or_legal"]), s(o["apn"]), s(o["region"])
            d = dict(county=s(o["county"]), area=s(o["area"]), zip=s(o["zip"]), acres=num(o["acres"]), account=s(o["account"]), owner_flag=s(o["owner_flag"]), death_cert=flag(o["death_cert"]),
                     out_of_state=flag(o["out_of_state"]), last_transfer_year=num(o["last_transfer_year"], int), last_transfer_date=s(o["last_transfer_date"]),
                     last_transfer_type=s(o["last_transfer_type"]), sale_date_basis=s(o["sale_date_basis"]), tax_flag=s(o["tax_flag"]), tax_balance=num(o["tax_balance"]),
                     tax_delinquent=(o["tax_flag"] or "").strip().upper() == "DELINQUENT")
            base = "nm-land-" + (pid or hid(addr or ""))
        else:
            addr, pid, market = s(o["address"]), s(o["parcel_id"]), "Cleveland (Cuyahoga Co.)"
            tb = num(o["tax_delinquent_balance"])
            d = dict(owner_flag=s(o["owner_flag"]), source=s(o["source"]), violations=num(o["violations"], int), condemned=bool((o["condemned"] or "").strip()), boardups=num(o["boardups"], int),
                     tax_delinquent_balance=tb, tax_delinquent=bool(tb and tb > 0), foreclosure_flag=bool((o["foreclosure_flag"] or "").strip()), last_sale=s(o["last_sale"]),
                     sqft=num(o["sqft"], int), year_built=num(o["year_built"], int))
            base = "oh-homes-" + (pid or hid(addr or ""))
        if not addr: die("%s: row without an address" % key)
        row = dict(ext_id=s(o.get("ext_id")) or base, state=sp["state"], type=sp["type"], market=clip(market, 120), bucket=b, score=sc, address=clip(addr, 300), parcel_id=pid, why=clip(s(o["why"]), 2000),
                   source_url=clip(s(o.get("source_url")), 1000), assessor_url=clip(s(o.get("assessor_url")), 1000), note=clip(s(o.get("note")), 1000),
                   details={k: v for k, v in d.items() if v is not None}, data_date=date)
        row = {k: v for k, v in row.items() if v is not None}
        res.append(row)
    # exact duplicate rows (same id and same content, e.g. a parcel listed twice in the file) are loaded once
    seen, keep, exact = set(), [], 0
    for r in res:
        sig = json.dumps(r, sort_keys=True)
        if sig in seen: exact += 1; continue
        seen.add(sig); keep.append(r)
    res = keep
    # duplicate ids: every member gets a short hash of its address + why so the ids are stable
    cnt = {}
    for r in res: cnt[r["ext_id"]] = cnt.get(r["ext_id"], 0) + 1
    dups = 0
    for r in res:
        if cnt[r["ext_id"]] > 1: dups += 1; r["ext_id"] = r["ext_id"] + "-" + hid(r["address"], r.get("why", ""))
    ids = [r["ext_id"] for r in res]
    if len(set(ids)) != len(ids): die("%s: ext_id still not unique after hashing" % key)
    for r in res:
        if len(r["ext_id"]) > 80: die("ext_id too long: " + r["ext_id"])
        bad = [k for k in r["details"] if "mail" in k.lower() or ("owner" in k.lower() and k != "owner_flag")]
        if bad: die("refusing to send owner/mail keys: %s" % bad)
    return sp, date, res, dups, exact
keys = [ONLY] if ONLY else list(SPECS)
plan, grand = [], 0
for k in keys:
    sp, date, res, dups, exact = build(k); plan.append((k, sp, date, res))
    c = {b: sum(1 for r in res if r["bucket"] == b) for b in BUCKETS}
    print("%-9s %s %-5s file %-32s data %s  rows %6d   Call today %5d  This week %5d  Worth a look %6d%s" % (k, sp["state"], sp["type"], sp["file"], date, len(res), c[BUCKETS[0]], c[BUCKETS[1]], c[BUCKETS[2]], ("  (%d rows share an id with another row: ids hashed)" % dups if dups else "") + ("  (%d exact duplicate rows skipped)" % exact if exact else "")))
    grand += len(res)
print("TOTAL rows %d%s" % (grand, "  (dry run: nothing sent)" if DRY else ""))
if os.environ.get("DUMP"): json.dump([r for _, _, _, res in plan for r in res], open(os.environ["DUMP"], "w")); print("rows written to", os.environ["DUMP"])
if DRY: sys.exit(0)
ins = upd = 0; done = 0; last = None
for k, sp, date, res in plan:
    for i in range(0, len(res), BATCH):
        r = rpc("wholesale_leads_upsert", {"p_rows": res[i:i + BATCH]}); ins += r["inserted"]; upd += r["updated"]; last = r["total"]; done += len(res[i:i + BATCH])
        sys.stderr.write("\r%s %d/%d  " % (k, min(i + BATCH, len(res)), len(res)))
    sys.stderr.write("\n")
print("sent %d rows: %d inserted, %d updated; table now holds %s rows" % (done, ins, upd, last))
PY
