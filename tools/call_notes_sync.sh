#!/usr/bin/env bash
# Upsert every /workspace/gatepost/call-notes/<phone>.md into public.call_notes (one row per phone; file body replaces the old body).
# Usage: tools/call_notes_sync.sh [DIR]   (default /workspace/gatepost/call-notes)
set -euo pipefail
. "$(dirname "$0")/_rpc.sh"
NDIR="${1:-/workspace/gatepost/call-notes}"; n=0
shopt -s nullglob
for f in "$NDIR"/*.md; do
  ph=$(basename "$f" .md)
  args=$(F="$f" P="$ph" python3 -c 'import json,os,datetime;f=os.environ["F"];print(json.dumps({"p_phone":os.environ["P"],"p_body":open(f).read(),"p_modified":datetime.datetime.fromtimestamp(os.path.getmtime(f),datetime.timezone.utc).isoformat()}))')
  rpc call_notes_upsert "$args" >/dev/null && n=$((n+1))
done
echo "synced $n call note file(s) from $NDIR"
