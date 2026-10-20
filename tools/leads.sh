#!/usr/bin/env bash
# Gatepost Admin leads / texts / bot notes. See tools/ADMIN-README.md.
#   leads.sh lead EXT_KEY "Name" "Work" [NEXTDOOR_URL] [MESSAGE] [SOURCE] [PHONE]
#   leads.sh text EXT_KEY PHONE "Body" ["Name"] ["Work"] [SENT_AT_ISO] [in|out]
#   leads.sh notes                 # JSON list of unread bot notes
#   leads.sh notes-read ID [ID..]  # mark notes read
set -euo pipefail
. "$(dirname "$0")/_rpc.sh"
CMD="${1:?usage: leads.sh lead|text|notes|notes-read ...}"; shift
j() { python3 -c 'import json,sys;k=sys.argv[1].split(",");v=sys.argv[2:];print(json.dumps({a:b for a,b in zip(k,v) if b!=""}))' "$@"; }
case "$CMD" in
  lead) [ $# -ge 3 ] || { echo "usage: leads.sh lead EXT_KEY NAME WORK [URL] [MESSAGE] [SOURCE] [PHONE]" >&2; exit 2; }
    rpc leads_upsert "$(j p_ext_key,p_name,p_work,p_nextdoor_post_url,p_message,p_source,p_phone "$@")";;
  text) [ $# -ge 3 ] || { echo "usage: leads.sh text EXT_KEY PHONE BODY [NAME] [WORK] [SENT_AT] [in|out]" >&2; exit 2; }
    rpc texts_upsert "$(j p_ext_key,p_phone,p_body,p_name,p_work,p_sent_at,p_direction "$@")";;
  notes) rpc bot_notes_unread '{}';;
  notes-read) [ $# -ge 1 ] || { echo "usage: leads.sh notes-read ID [ID..]" >&2; exit 2; }
    rpc bot_notes_mark_read "$(python3 -c 'import json,sys;print(json.dumps({"p_ids":[int(x) for x in sys.argv[1:]]}))' "$@")";;
  *) echo "unknown command: $CMD" >&2; exit 2;;
esac
