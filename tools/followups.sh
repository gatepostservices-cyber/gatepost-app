#!/usr/bin/env bash
# Gatepost follow-up drafts (Approvals queue). See tools/ADMIN-README.md. Nothing is sent by this script or the app.
#   followups.sh add EXT_KEY CHANNEL RECIPIENT "Body" DAY_OFFSET [DUE_AT_ISO] [CUSTOMER_NAME] [LEAD] [QUOTE_REF]
#     CHANNEL = text|email   DAY_OFFSET = 1|3|6   LEAD = lead EXT_KEY or numeric id (optional)
#   followups.sh approved          # JSON list of owner-approved, unsent drafts (send send_body exactly)
#   followups.sh sent ID|EXT_KEY   # mark one approved draft sent, right after you send it
set -euo pipefail
. "$(dirname "$0")/_rpc.sh"
U="usage: followups.sh add EXT_KEY CHANNEL RECIPIENT BODY DAY_OFFSET [DUE_AT] [CUSTOMER_NAME] [LEAD] [QUOTE_REF] | approved | sent ID|EXT_KEY"
CMD="${1:?$U}"; shift
j() { python3 -c 'import json,sys;k=sys.argv[1].split(",");v=sys.argv[2:];d={a:b for a,b in zip(k,v) if b!=""}
if "p_day_offset" in d: d["p_day_offset"]=int(d["p_day_offset"])
print(json.dumps(d))' "$@"; }
case "$CMD" in
  add) [ $# -ge 5 ] || { echo "$U" >&2; exit 2; }
    rpc followup_draft_upsert "$(j p_ext_key,p_channel,p_recipient,p_body,p_day_offset,p_due_at,p_customer_name,p_lead,p_quote_ref "$@")";;
  approved) rpc followup_approved_list '{}';;
  sent) [ $# -eq 1 ] || { echo "$U" >&2; exit 2; }; rpc followup_mark_sent "$(j p_id "$1")";;
  *) echo "$U" >&2; exit 2;;
esac
