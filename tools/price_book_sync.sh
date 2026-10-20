#!/usr/bin/env bash
# Replace public.price_book from the official rate book markdown (see ADMIN-README.md).
# Usage: tools/price_book_sync.sh [FILE] [--dry-run]   (default /workspace/gatepost/price-book.md)
# Parses "## Section" headings, "| Job | Unit | Low | Aim | Notes |" tables, and "- " rule bullets under "How to use"/"Rules" (stored as rows, no price).
# Non-numeric Low/Aim cells are kept blank and reported as ambiguous; prices are never guessed.
set -euo pipefail
. "$(dirname "$0")/_rpc.sh"
F="${1:-/workspace/gatepost/price-book.md}"; DRY="${2:-}"
[ -r "$F" ] || { echo "price book file not found: $F" >&2; exit 2; }
NAME="${PRICE_BOOK_NAME:-Gatepost_Full_Rate_Book_copy_formerly_named_Pricing_Reference.md}"
ROWS=$(F="$F" NAME="$NAME" python3 - <<'P'
import os,re,json,sys,datetime
f=os.environ["F"]; mod=datetime.datetime.fromtimestamp(os.path.getmtime(f),datetime.timezone.utc).strftime("%Y-%m-%d")
src=f'{os.environ["NAME"]} (modified {mod})'; sec=None; rows=[]; amb=[]
num=lambda s: s.replace('$','').replace(',','').strip()
for ln in open(f, encoding="utf-8"):
    ln=ln.rstrip("\n")
    if ln.startswith("## "): sec=ln[3:].strip(); continue
    if ln.startswith("|"):
        c=[x.strip() for x in ln.strip().strip("|").split("|")]
        if len(c)<5 or c[0].lower()=="job" or set(c[0])<=set("-: "): continue
        r={"section":sec,"service":c[0],"unit":c[1],"low":"","aim":"","notes":" | ".join(c[4:]),"source":src}
        for k,v in (("low",c[2]),("aim",c[3])):
            if re.fullmatch(r"\d+(\.\d+)?", num(v)): r[k]=num(v)
            elif v not in ("","—","-"): amb.append(f"{sec} / {c[0]}: {k}='{v}'")
        if r["low"]=="" and r["aim"]=="": amb.append(f"{sec} / {c[0]}: no numeric Low/Aim")
        rows.append(r); continue
    if ln.startswith("- ") and sec in ("How to use","Rules","Open conflicts (16 Oct 2026, not changed here)"):
        rows.append({"section":sec,"service":ln[2:].strip(),"unit":"rule","low":"","aim":"","notes":"","source":src})
for a in amb: print("AMBIGUOUS:",a,file=sys.stderr)
print(json.dumps(rows))
P
)
N=$(python3 -c 'import json,sys;print(len(json.loads(sys.stdin.read())))' <<<"$ROWS")
[ "$DRY" = --dry-run ] && { echo "parsed $N rows (dry run)"; exit 0; }
[ "$N" -gt 20 ] || { echo "only $N rows parsed; refusing to replace" >&2; exit 1; }
rpc price_book_replace "$(python3 -c 'import json,sys;print(json.dumps({"p_rows":json.loads(sys.stdin.read())}))' <<<"$ROWS")" >/dev/null
echo "price_book replaced: $N rows"
