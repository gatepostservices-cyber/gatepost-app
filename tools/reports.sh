#!/usr/bin/env bash
# Gatepost reports (Today > Reports). See tools/ADMIN-README.md.
#   reports.sh post --kind win_loss --week-ending YYYY-MM-DD --title "..." --summary "..." --data-file path.json [--ext-key KEY] [--posted-by NAME]
#     ext key defaults to KIND-WEEK_ENDING (e.g. win_loss-2026-10-18); posting the same week again replaces it.
set -euo pipefail
. "$(dirname "$0")/_rpc.sh"
U='usage: reports.sh post --kind KIND --week-ending YYYY-MM-DD --title TITLE --summary TEXT [--data-file FILE.json] [--ext-key KEY] [--posted-by NAME]'
[ "${1:-}" = post ] || { echo "$U" >&2; exit 2; }; shift
KIND=win_loss WEEK= TITLE= SUMMARY= DATA= EXT= BY=Marv
while [ $# -gt 0 ]; do case "$1" in
  --kind) KIND="$2";; --week-ending) WEEK="$2";; --title) TITLE="$2";; --summary) SUMMARY="$2";;
  --data-file) DATA="$2";; --ext-key) EXT="$2";; --posted-by) BY="$2";; *) echo "$U" >&2; exit 2;; esac; shift 2; done
[ -n "$WEEK" ] && [ -n "$TITLE" ] || { echo "$U" >&2; exit 2; }
[ -z "$DATA" ] || [ -r "$DATA" ] || { echo "data file not found: $DATA" >&2; exit 2; }
ARGS=$(K="$KIND" W="$WEEK" T="$TITLE" S="$SUMMARY" D="$DATA" E="${EXT:-$KIND-$WEEK}" B="$BY" python3 -c 'import json,os
e=os.environ; d=json.load(open(e["D"])) if e["D"] else {}
assert isinstance(d,dict), "data must be a JSON object"
print(json.dumps({"p_ext_key":e["E"],"p_kind":e["K"],"p_title":e["T"],"p_week_ending":e["W"],"p_summary":e["S"],"p_data":d,"p_posted_by":e["B"]}))')
rpc reports_upsert "$ARGS"
