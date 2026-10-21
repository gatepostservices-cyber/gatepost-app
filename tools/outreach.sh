#!/usr/bin/env bash
# Gatepost Admin lead outreach log. See tools/ADMIN-README.md.
#   outreach.sh log LEAD CHANNEL "Summary" [out|in] [STATUS] [SENT_BY] [SENT_AT_ISO] [EXT_KEY]
#     LEAD    = the lead's EXT_KEY (as given to leads.sh lead) or its numeric id
#     CHANNEL = nextdoor|text|email|call|other   STATUS = sent|replied|no_reply|won|lost (default sent)
#     EXT_KEY = optional unique key; re-running with the same key updates instead of adding a row
set -euo pipefail
. "$(dirname "$0")/_rpc.sh"
CMD="${1:?usage: outreach.sh log LEAD CHANNEL SUMMARY [out|in] [STATUS] [SENT_BY] [SENT_AT] [EXT_KEY]}"; shift
j() { python3 -c 'import json,sys;k=sys.argv[1].split(",");v=sys.argv[2:];print(json.dumps({a:b for a,b in zip(k,v) if b!=""}))' "$@"; }
case "$CMD" in
  log) [ $# -ge 3 ] || { echo "usage: outreach.sh log LEAD CHANNEL SUMMARY [out|in] [STATUS] [SENT_BY] [SENT_AT] [EXT_KEY]" >&2; exit 2; }
    rpc lead_outreach_upsert "$(j p_lead,p_channel,p_summary,p_direction,p_status,p_sent_by,p_sent_at,p_ext_key "$@")";;
  *) echo "unknown command: $CMD" >&2; exit 2;;
esac
