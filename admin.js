// Gatepost Admin "Office" screen (owners only): Leads, Customers (timeline), Price Book, Job Log, Control (bot launcher + notes for bots).
// Data: public.leads / texts / lead_matches / customer_timeline / price_book / job_log / bot_notes (admin-only RLS). Bots write via tools/leads.sh + call_notes_sync.sh.
(function () {
  const O = window.OF = { tab: 'leads', d: {}, at: {}, busy: {}, q: '', cust: null, ol: null, oadd: 0 };
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = d => d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const money = n => n == null || n === '' ? '—' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const fmtPh = p => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e(p); };
  const safeUrl = u => /^https:\/\/([a-z0-9-]+\.)*nextdoor\.com\//i.test(u || '') ? u : '';
  const BOTS = { 'fe067e3a-c664-5d47-bbcb-e92f394a76a6': 'Alabaster', '20bbeb34-ce2b-546b-bcaf-471275c29022': 'Marv', '4606ba13-0fbd-4caf-9d5e-982b7ecd0a9d': 'Wendy',
    'ee0d9746-08c7-469c-bb15-a6664fcbd659': 'Abe', '7ed5d130-2b5c-4285-9285-1e9b8b65814b': 'Alfred', 'fd99b358-d467-44ad-b0d6-aa9cadbf549e': 'Gatepost' };
  window.OF_BOTS = BOTS;
  const own = () => typeof isOwner === 'function' && isOwner();
  const Q = {
    leads: () => gpSb.from('leads').select('*').order('created_at', { ascending: false }).limit(200),
    matches: () => gpSb.from('lead_matches').select('id,lead_id,text_id,status,auto,texts(phone,name,work,body,sent_at)').neq('status', 'rejected').order('created_at', { ascending: false }).limit(300),
    outreach: () => gpSb.from('lead_outreach').select('*').order('sent_at', { ascending: false }).limit(1000),
    timeline: () => gpSb.from('customer_timeline').select('*').order('at_', { ascending: false }).limit(1000),
    price_book: () => gpSb.from('price_book').select('*').order('sort',{ nullsFirst: false }).order('service').limit(1000),
    job_log: () => gpSb.from('job_log').select('*').order('job_date', { ascending: false, nullsFirst: false }).limit(300),
    bot_notes: () => gpSb.from('bot_notes').select('*').order('created_at', { ascending: false }).limit(50),
    team_shifts: () => gpSb.from('team_shifts').select('id,worker_id,worker_name,clock_in,clock_out,hours,houses,houses_per_hour,est_minutes,actual_minutes,pace_ratio,miles,neighborhood,sessions').order('clock_in', { ascending: false }).limit(500),
    knowledge: () => gpSb.from('knowledge').select('id,key,category,title,value,source,owner,updated_at,updated_by').order('category').order('title').limit(1000) };
  const NEED = { leads: ['leads', 'matches', 'outreach'], customers: ['timeline'], pricebook: ['price_book'], joblog: ['job_log'], control: ['bot_notes'], brain: ['knowledge'], hours: ['team_shifts'] };
  async function load(k, force) {
    if (!window.gpSb || O.busy[k] || (!force && O.d[k] && Date.now() - (O.at[k] || 0) < 20000)) return;
    O.busy[k] = 1; try { const { data, error } = await Q[k](); if (error) { O.d[k] = O.d[k] || []; window.gpReportError && gpReportError(error, { op: 'office ' + k }); } else O.d[k] = data || []; O.at[k] = Date.now(); }
    finally { O.busy[k] = 0; } paint(); }
  function paint() { const r = document.getElementById('of-root'); if (r && typeof page === 'function' && ['office', 'leads', 'joblog'].includes(page())) r.outerHTML = officePage(true); }
  const toast = m => { const el = document.getElementById('of-msg'); if (el) el.textContent = m; };
  const TABS = [['leads', 'Leads'], ['customers', 'Customers'], ['pricebook', 'Price Book'], ['joblog', 'Job Log'], ['control', 'Control'], ['hours', 'Team Hours'], ['brain', 'Brain']];
  window.officePage = function (noLoad) {
    if (!own()) return '<div class="card" id="of-root"><h2>Office</h2><p class="muted">Owners only.</p></div>';
    if (!brGeo.c) (window.requestIdleCallback || (f => setTimeout(f, 400)))(() => brGeo());
    // Simplified nav: Leads lives in Sales, Job Log in Schedule; Office keeps Customers, Price Book, Control.
    const pg = typeof page === 'function' ? page() : 'office', solo = pg === 'leads' || pg === 'joblog';
    if (solo) O.tab = pg; else if (O.tab === 'leads' || O.tab === 'joblog') { O.tab = 'customers'; O.q = ''; O.ol = null; O.oadd = 0; }
    const tabs = solo ? [] : TABS.filter(([k]) => k !== 'leads' && k !== 'joblog');
    if (!noLoad) setTimeout(() => NEED[O.tab].forEach(k => load(k)), 0);
    const body = { leads: leadsHTML, customers: custHTML, pricebook: pbHTML, joblog: jlHTML, control: ctlHTML, brain: brHTML, hours: hoursHTML }[O.tab]();
    return `<div id="of-root">${tabs.length ? `<div class="of-tabs" role="tablist">${tabs.map(([k, n]) => `<button type="button" role="tab" class="${O.tab === k ? 'on' : ''}" onclick="ofTab('${k}')">${n}</button>`).join('')}</div>` : ''}
      <div id="of-msg" class="muted q-rt" aria-live="polite"></div>${body}</div>`; };
  window.ofLoad = (k, f) => load(k, f);
  window.ofTab = k => { O.tab = k; O.q = ''; O.cust = null; O.ol = null; O.oadd = 0; paint(); NEED[k].forEach(x => load(x)); };
  const loading = k => O.d[k] == null ? '<p class="muted">Loading\u2026</p>' : '';
  // ----- Leads
  const OCH = { nextdoor: 'Nextdoor', text: 'Text', email: 'Email', call: 'Call', other: 'Other' }, OST = { sent: 'Sent', replied: 'Replied', no_reply: 'No reply', won: 'Won', lost: 'Lost' };
  const outFor = id => (O.d.outreach || []).filter(o => o.lead_id === id);
  const outLine = o => `<span class="badge">${e(OCH[o.channel] || o.channel)}</span> ${o.direction === 'in' ? '\u2190 in' : '\u2192 out'} \u00b7 ${e(day(o.sent_at))} \u00b7 <span class="of-ost ${e(o.status)}">${e(OST[o.status] || o.status)}</span>`;
  const sel = (id, m, v) => `<select id="${id}">${Object.entries(m).map(([k, n]) => `<option value="${k}"${k === v ? ' selected' : ''}>${n}</option>`).join('')}</select>`;
  function outreachHTML(l) {
    const os = outFor(l.id);
    return `<div class="card" id="of-outreach"><button type="button" class="secondary q-sm" onclick="OF.ol=null;OF.oadd=0;ofRepaint()">\u2039 All leads</button><h2>Outreach: ${e(l.name)}</h2><p class="muted">${e(l.work)} \u00b7 ${os.length} entr${os.length === 1 ? 'y' : 'ies'}</p>
      ${O.oadd ? `<div class="of-form" id="oo-form">${sel('oo-ch', OCH, 'nextdoor')}${sel('oo-dir', { out: 'Out (we sent)', in: 'In (they sent)' }, 'out')}${sel('oo-st', OST, 'sent')}<input id="oo-by" placeholder="Sent by" value="${e((window.S && S.me && (S.me.full_name || S.me.name)) || '')}"><label class="muted">When (blank = now)<input id="oo-at" type="datetime-local" aria-label="When"></label></div>
        <textarea id="oo-sum" rows="3" placeholder="What was said"></textarea><div class="q-actions"><button type="button" class="primary q-sm" onclick="ofOutAdd(${l.id})">Save outreach</button><button type="button" class="secondary q-sm" onclick="OF.oadd=0;ofRepaint()">Cancel</button></div>`
        : `<div class="q-actions"><button type="button" class="primary q-sm" onclick="OF.oadd=1;ofRepaint()">+ Add outreach</button></div>`}
      ${os.length ? os.map(o => `<div class="of-item of-tl"><div class="uf-top"><span>${outLine(o)}</span><span class="muted">${e(o.sent_by || '')}</span></div>${o.summary ? `<div class="of-body">${e(o.summary)}</div>` : ''}</div>`).join('') : '<p class="muted">No outreach logged yet.</p>'}</div>`; }
  window.ofOutAdd = async id => { const v = x => (document.getElementById(x) || {}).value || '', at = v('oo-at');
    const row = { lead_id: id, channel: v('oo-ch'), direction: v('oo-dir'), status: v('oo-st'), sent_by: v('oo-by').trim() || 'owner', summary: v('oo-sum').trim() || null, sent_at: at ? new Date(at).toISOString() : new Date().toISOString() };
    const { error } = await gpSb.from('lead_outreach').insert(row); if (error) return toast('Not saved: ' + error.message); O.oadd = 0; toast('Outreach saved'); load('outreach', 1); };
  function leadsHTML() {
    const L = O.d.leads, M = O.d.matches || [];
    const ol = O.ol != null && (L || []).find(l => l.id === O.ol); if (ol) return outreachHTML(ol);
    const rows = (L || []).map(l => { const ms = M.filter(m => m.lead_id === l.id), u = safeUrl(l.nextdoor_post_url);
      return `<div class="of-item"><div class="uf-top"><b>${e(l.name)}</b><span class="muted">${e(day(l.created_at))}</span></div>
        <div>${e(l.work)} <span class="badge">${e(l.status)}</span>${l.phone ? ` <span class="muted">${fmtPh(l.phone)}</span>` : ''}</div>
        ${l.message ? `<div class="muted uf-st">${e(l.message)}</div>` : ''}
        <div class="of-row">${u ? `<a class="link-btn" href="${e(u)}" target="_blank" rel="noopener">Nextdoor post \u203a</a>` : ''}<span class="muted">${e(l.source || '')}</span></div>
        ${(o => `<button type="button" class="of-out" onclick="OF.ol=${l.id};OF.oadd=0;ofRepaint()">${o ? `<span class="muted">Last outreach:</span> ${outLine(o)}` : '<span class="muted">No outreach yet \u00b7 add</span>'} <span class="of-out-n">${outFor(l.id).length ? outFor(l.id).length + ' \u203a' : '\u203a'}</span></button>`)(outFor(l.id)[0])}
        ${ms.map(m => { const t = m.texts || {}; return `<div class="of-match ${m.status}"><div><b>${m.status === 'confirmed' ? 'Matched text' : 'Possible match'}</b>${m.auto ? ' <span class="muted">(auto: name + work)</span>' : ''} \u00b7 ${fmtPh(t.phone)} ${t.name ? '\u00b7 ' + e(t.name) : ''} ${t.work ? '\u00b7 ' + e(t.work) : ''}</div>
          <div class="muted uf-st">${e(t.body)}</div>${m.status === 'possible' ? `<div class="q-actions"><button type="button" class="primary q-sm" onclick="ofDecide(${m.id},'confirmed')">Confirm</button><button type="button" class="secondary q-sm" onclick="ofDecide(${m.id},'rejected')">Reject</button></div>` : ''}</div>`; }).join('')}</div>`; }).join('');
    return `<div class="card"><h2>Leads</h2><p class="muted">From Nextdoor and texts. A text is matched automatically only when the name and the work both match exactly; anything else waits for you to confirm or reject.</p>
      ${loading('leads') || rows || '<p class="muted">No leads yet.</p>'}</div>`; }
  window.ofDecide = async (id, st) => { const { error } = await gpSb.rpc('decide_match', { p_id: id, p_status: st }); if (error) return toast('Not saved: ' + error.message); toast(st === 'confirmed' ? 'Confirmed' : 'Rejected'); load('leads', 1); load('matches', 1); };
  // ----- Customers (timeline merged by phone)
  function custHTML() {
    const T = O.d.timeline; if (T == null) return `<div class="card"><h2>Customers</h2>${loading('timeline')}</div>`;
    const by = {}; T.forEach(r => { if (!r.phone) return; (by[r.phone] = by[r.phone] || []).push(r); });
    if (O.cust && by[O.cust]) { const rs = by[O.cust], nm = (rs.find(r => r.who) || {}).who || '';
      return `<div class="card"><button type="button" class="secondary q-sm" onclick="OF.cust=null;ofRepaint()">\u2039 All customers</button><h2>${e(nm) || fmtPh(O.cust)}</h2><p class="muted">${fmtPh(O.cust)}</p>
        ${rs.map(r => `<div class="of-item of-tl"><div class="uf-top"><span class="badge">${e({ lead: 'Lead', text: 'Text', quote: 'Quote', call: 'Call notes' }[r.kind] || r.kind)}</span><span class="muted">${e(day(r.at_))}</span></div>
          <div class="of-body">${e(r.body)}</div>${safeUrl(r.url) ? `<a class="link-btn" href="${e(r.url)}" target="_blank" rel="noopener">Nextdoor post \u203a</a>` : ''}</div>`).join('')}</div>`; }
    const ks = Object.keys(by);
    return `<div class="card"><h2>Customers</h2><p class="muted">Confirmed customers: leads, matched texts, quotes and call notes merged by phone.</p>
      ${ks.length ? ks.map(p => { const rs = by[p], nm = (rs.find(r => r.who) || {}).who || ''; return `<button type="button" class="of-cust" onclick="OF.cust='${e(p)}';ofRepaint()"><b>${e(nm) || 'Unknown'}</b> <span class="muted">${fmtPh(p)} \u00b7 ${rs.length} entries \u00b7 ${e(day(rs[0].at_))}</span></button>`; }).join('') : '<p class="muted">No confirmed customers yet.</p>'}</div>`; }
  window.ofRepaint = paint;
  // ----- Price Book (read-only list + search; filled later by the OneDrive sync)
  function pbHTML() {
    const P = O.d.price_book, q = O.q.toLowerCase(), F = (P || []).filter(r => !q || [r.section, r.service, r.unit, r.notes].join(' ').toLowerCase().includes(q));
    return `<div class="card"><h2>Price Book</h2><p class="muted">Read-only. Synced daily from the official rate book. Low / Aim before GRT.</p>
      <input id="pb-q" type="search" placeholder="Search services\u2026" value="${e(O.q)}" oninput="OF.q=this.value;ofPbList()">
      <div id="pb-list">${loading('price_book') || pbRows(F)}</div></div>`; }
  const pbRows = F => { if (!F.length) return '<p class="muted">' + ((O.d.price_book || []).length ? 'No matches.' : 'Price book is empty until the sync runs.') + '</p>';
    const G = []; F.forEach(r => { const k = r.section || 'Other'; let g = G.find(x => x.k === k); if (!g) G.push(g = { k, rows: [] }); g.rows.push(r); });
    const src = (F.find(r => r.source) || {}).source;
    return G.map(g => `<h3 class="pb-sec">${e(g.k)}</h3>` + (g.rows.every(r => r.unit === 'rule') ? `<ul class="pb-rules">${g.rows.map(r => `<li>${e(r.service)}</li>`).join('')}</ul>`
      : `<table class="of-t"><thead><tr><th>Job</th><th>Unit</th><th>Low</th><th>Aim</th><th>Notes</th></tr></thead><tbody>${g.rows.map(r => r.unit === 'rule' ? `<tr><td colspan="5" class="muted">${e(r.service)}</td></tr>` : `<tr><td>${e(r.service)}</td><td>${e(r.unit)}</td><td>${money(r.low)}</td><td>${money(r.aim)}</td><td class="muted">${e(r.notes)}</td></tr>`).join('')}</tbody></table>`)).join('')
      + (src ? `<p class="muted uf-st">Source: ${e(src)}</p>` : ''); };
  window.ofPbList = () => { const q = O.q.toLowerCase(), el = document.getElementById('pb-list'); if (el) el.innerHTML = pbRows((O.d.price_book || []).filter(r => !q || [r.section, r.service, r.unit, r.notes].join(' ').toLowerCase().includes(q))); };
  // ----- Job Log (for reference only)
  function jlHTML() {
    const J = O.d.job_log, loc = localEstimates();
    return `<div class="card"><h2>Job Log</h2><p class="muted"><b>For reference only.</b> Listed vs. actual price on past jobs. Not a price list.</p>
      <div class="of-form"><input id="jl-ref" placeholder="Job / quote ref"><input id="jl-svc" placeholder="Service"><input id="jl-lp" type="number" inputmode="decimal" placeholder="Listed $"><input id="jl-ap" type="number" inputmode="decimal" placeholder="Actual $"><input id="jl-dt" type="date"><input id="jl-nt" placeholder="Notes"></div>
      <div class="q-actions"><button type="button" class="primary" onclick="ofJlAdd()">Add</button>${loc.length ? `<button type="button" class="secondary" onclick="ofJlImport()">Import ${loc.length} saved estimate(s) from this device</button>` : ''}</div>
      ${loading('job_log') || ((J || []).length ? `<table class="of-t"><thead><tr><th>Date</th><th>Ref</th><th>Service</th><th>Listed</th><th>Actual</th><th>Notes</th></tr></thead><tbody>${J.map(r => `<tr><td>${e(r.job_date || '')}</td><td>${e(r.ref)}</td><td>${e(r.service)}</td><td>${money(r.listed_price)}</td><td>${money(r.actual_price)}</td><td class="muted">${e(r.notes)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No jobs logged yet.</p>')}</div>`; }
  // Old local-only mode kept estimates in localStorage 'gatepost_app_v1'; offer a one-time copy into job_log (marked imported, skipped if already there).
  function localEstimates() { try { const L = JSON.parse(localStorage.getItem('gatepost_app_v1') || 'null'); const done = new Set((O.d.job_log || []).map(r => r.ref));
    return ((L && L.estimates) || []).filter(x => !done.has('local-' + (x.id || x.created || x.client))); } catch (_) { return []; } }
  window.ofJlImport = async () => { const rows = localEstimates().map(x => ({ ref: 'local-' + (x.id || x.created || x.client), service: x.job || x.service || x.title || 'Estimate', listed_price: Number(x.total || x.price) || null, notes: ['Imported from device', x.client || x.customer || ''].filter(Boolean).join(' \u00b7 ') }));
    if (!rows.length) return; const { error } = await gpSb.from('job_log').insert(rows); if (error) return toast('Not imported: ' + error.message); toast('Imported ' + rows.length); load('job_log', 1); };
  window.ofJlAdd = async () => { const v = id => (document.getElementById(id) || {}).value || '';
    const row = { ref: v('jl-ref').trim() || null, service: v('jl-svc').trim(), listed_price: v('jl-lp') === '' ? null : Number(v('jl-lp')), actual_price: v('jl-ap') === '' ? null : Number(v('jl-ap')), job_date: v('jl-dt') || null, notes: v('jl-nt').trim() || null };
    if (!row.service) return toast('Service is required');
    const { error } = await gpSb.from('job_log').insert(row); if (error) return toast('Not added: ' + error.message); toast('Added'); load('job_log', 1); };
  // ----- Team Hours: shifts sent by the Gatepost Team app on clock-out (table team_shifts; admin-read RLS, anon insert-only)
  const n1 = (v, d = 1) => v == null || v === '' ? '\u2014' : Number(v).toFixed(d);
  const tOnly = d => d ? new Date(d).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit' }) : '';
  const dOnly = d => d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'America/Denver', weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const pace = r => r == null ? '\u2014' : `<span class="th-pace ${r <= 1 ? 'ok' : 'slow'}" title="Actual route time / app estimate. Under 1.0x = faster than estimate.">${Number(r).toFixed(2)}x</span>`;
  function hoursHTML() {
    const T = O.d.team_shifts; if (T == null) return '<div class="card"><h2>Team Hours</h2>' + loading('team_shifts') + '</div>';
    const W = {}; T.forEach(r => { const w = W[r.worker_id] || (W[r.worker_id] = { name: r.worker_name, n: 0, h: 0, houses: 0, est: 0, act: 0, mi: 0, last: r.clock_in });
      w.n++; w.h += +r.hours || 0; w.houses += +r.houses || 0; w.est += +r.est_minutes || 0; w.act += +r.actual_minutes || 0; w.mi += +r.miles || 0; });
    const ws = Object.values(W).sort((a, b) => b.h - a.h);
    return `<div class="card"><div class="uf-top"><h2>Team Hours</h2><button type="button" class="secondary q-sm" onclick="ofLoad('team_shifts',1)">Refresh</button></div>
      <p class="muted">Sent by the Gatepost Team app when a worker clocks out. Houses are estimated from the route steps covered. Pace = actual route time \u00f7 app estimate (0.9x = faster than estimate). Workers never see these numbers.</p>
      <h3>Per worker</h3>${ws.length ? `<div class="th-wrap"><table class="of-t th-t"><thead><tr><th>Worker</th><th>Shifts</th><th>Hours</th><th>Houses</th><th>Houses/hr</th><th>Pace</th><th>Miles</th><th>Last shift</th></tr></thead><tbody>${ws.map(w => `<tr><td><b>${e(w.name)}</b></td><td>${w.n}</td><td>${n1(w.h, 2)}</td><td>${w.houses}</td><td>${w.h > 0 ? n1(w.houses / w.h) : '\u2014'}</td><td>${w.est > 0 ? pace(w.act / w.est) : '\u2014'}</td><td>${n1(w.mi)}</td><td class="muted">${e(dOnly(w.last))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No shifts yet.</p>'}
      <h3>Shifts</h3>${T.length ? `<div class="th-wrap"><table class="of-t th-t"><thead><tr><th>Worker</th><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Houses</th><th>Houses/hr</th><th>Pace</th><th>Miles</th><th>Neighborhood</th></tr></thead><tbody>${T.map(r => `<tr><td><b>${e(r.worker_name)}</b></td><td>${e(dOnly(r.clock_in))}</td><td>${e(tOnly(r.clock_in))}</td><td>${e(tOnly(r.clock_out))}</td><td>${n1(r.hours, 2)}</td><td>${r.houses ?? '\u2014'}</td><td>${n1(r.houses_per_hour)}</td><td>${pace(r.pace_ratio)}</td><td>${n1(r.miles)}</td><td class="muted">${e(r.neighborhood || '')}${(r.sessions || []).length ? '<br>' + (r.sessions || []).map(x => e(x.session + ' (' + x.steps_checked + ' steps)')).join(', ') : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No shifts yet.</p>'}</div>`; }
  // ----- Control: bot launcher (permissions.launcher) + notes for bots
  function ctlHTML() {
    const ids = (typeof can === 'function' ? can('launcher', []) : []) || [], N = O.d.bot_notes;
    return `<div class="card"><h2>Control</h2><p class="muted">Open a bot.</p><div class="of-launch">${ids.filter(id => BOTS[id]).map(id => `<a class="of-bot" href="grokbot://app/v1/agent?id=${encodeURIComponent(id)}">${e(BOTS[id])}</a>`).join('') || '<p class="muted">No bots set for your account.</p>'}</div></div>
      <div class="card"><h2>Notes for bots</h2><p class="muted">Non-urgent. Read at the 6:30 PM daily run.</p><textarea id="bn-new" rows="3" placeholder="Type a note\u2026"></textarea>
      <div class="q-actions"><button type="button" class="primary" onclick="ofNote()">Save note</button></div>
      ${loading('bot_notes') || ((N || []).length ? `<ul class="ib-list">${N.map(n => `<li><span class="ib-t">${e(n.text)}</span><span class="muted uf-st">${e(day(n.created_at))} \u00b7 ${n.read_at ? 'read' : 'unread'}</span></li>`).join('')}</ul>` : '<p class="muted">No notes.</p>')}</div>`; }
  window.ofNote = async () => { const ta = document.getElementById('bn-new'), t = (ta && ta.value || '').trim(); if (!t) return;
    const { error } = await gpSb.from('bot_notes').insert({ text: t }); if (error) return toast('Not saved: ' + error.message); toast('Saved'); load('bot_notes', 1); };
  // ----- Brain (read-only view of public.knowledge, admin RLS)
  const BR_ORDER = ['rules', 'pricing', 'phone', 'owners', 'filing', 'bots', 'links', 'accounts', 'app_tools'];
  const brF = () => { const q = O.q.toLowerCase(); return (O.d.knowledge || []).filter(r => !q || [r.title, r.value, r.key].join(' ').toLowerCase().includes(q)); };
  const brDay = d => d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const brRows = F => { if (!F.length) return '<p class="muted">' + ((O.d.knowledge || []).length ? 'No matches.' : 'Nothing in the brain yet.') + '</p>';
    const G = {}; F.forEach(r => (G[r.category || 'other'] = G[r.category || 'other'] || []).push(r));
    const ks = Object.keys(G).sort((a, b) => ((BR_ORDER.indexOf(a) + 1) || 99) - ((BR_ORDER.indexOf(b) + 1) || 99) || a.localeCompare(b));
    return ks.map(k => `<h3 class="br-sec"><span>${e(k.replace(/_/g, ' '))}</span><i>${G[k].length}</i></h3>` + G[k].map(r => `<div class="br-item"><b>${e(r.title || r.key)}</b>
      <div class="of-body br-val">${e(r.value)}</div><div class="br-meta">updated ${e(brDay(r.updated_at))}${r.updated_by ? ' by ' + e(r.updated_by) : ''}</div></div>`).join('')).join(''); };
  function brHTML() {
    brAmbient();  // synchronous: dark scene + hidden content classes are on the body before this HTML is first painted
    return `<div class="card br-card"><div class="br-hud"><span class="br-hud-t">GATEPOST BRAIN</span><span class="br-hud-s">${(O.d.knowledge || []).length || '\u2014'} FACTS \u00b7 READ-ONLY \u00b7 SHARED BY EVERY BOT</span></div>
      <input id="br-q" type="search" placeholder="Search the brain\u2026" value="${e(O.q)}" oninput="OF.q=this.value;ofBrList()">
      <div id="br-list">${loading('knowledge') || brRows(brF())}</div></div>`; }
  window.ofBrList = () => { const el = document.getElementById('br-list'); if (el) el.innerHTML = brRows(brF()); };
  // ----- Brain visuals: one hand-rolled 3D point-cloud brain (cerebrum x2, cerebellum, stem), used by the intro and the ambient background.
  // Axes: x left/right, y up, z front(+)/back(-).
  function brBuild(N) {
    let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, P = [];
    const dir = () => { const u = rnd() * 2 - 1, t = rnd() * 6.2832, r = Math.sqrt(1 - u * u); return [r * Math.cos(t), u, r * Math.sin(t)]; };
    const ridge = (x, y, z) => Math.abs(Math.sin(x * 10 + Math.sin(z * 5) * 2.2 + y * 3) * Math.cos(z * 8.5 + y * 6.5 + Math.sin(x * 6) * 1.5));
    let guard = 0;
    while (P.length < N && guard++ < N * 200) { const r = rnd(), [ex, ey, ez] = dir();
      if (r < .8) { const side = rnd() < .5 ? -1 : 1, rx = .4, ry = .56, rz = .98;
        let xl = ex > 0 ? ex * rx : ex * rx * .18, y = ey * ry, z = ez * rz;
        if (z > .2) y *= 1 + .1 * ez; if (z < -.5) xl *= .85;                      // frontal height, narrower occipital
        if (y < 0) y *= .62;                                                       // flatter underside
        const tb = Math.exp(-((ez - .2) ** 2) / .1 - ((ey + .55) ** 2) / .12) * (ex > -.1 ? 1 : 0);  // temporal lobe bulge
        y -= tb * .2; xl += tb * .06; z += tb * .04;
        const X = side * (.1 + xl), med = ex < 0;
        if (rnd() > (med ? .15 : .15 + .85 * ridge(X, y, z) ** 2)) continue;
        P.push({ x: X, y: y + .08, z, c: rnd() < .1, part: 0 }); }
      else if (r < .95) { const x = ex * .44 * (1 - .25 * Math.exp(-(ex * ex) / .02)), y = ey * .19, z = ez * .27;  // cerebellum with folia stripes
        if (Math.abs(Math.sin(ey * 15 + ex * 1.5)) < .5 || y > .05) continue; P.push({ x, y: y - .42, z: z - .7, c: rnd() < .08, part: 1 }); }
      else { const t = rnd(), a = rnd() * 6.2832, rad = .085 - .025 * t; P.push({ x: Math.cos(a) * rad, y: -.3 - t * .42, z: -.33 + Math.sin(a) * rad * .9 - t * .08, c: rnd() < .06, part: 2 }); } }
    const L = []; for (let i = 0; i < P.length; i++) { let b = -1, bd = .011, b2 = -1; for (let j = 0; j < P.length; j++) { if (j === i || P[j].part !== P[i].part) continue;
        const q = (P[i].x - P[j].x) ** 2 + (P[i].y - P[j].y) ** 2 + (P[i].z - P[j].z) ** 2; if (q < bd && q > .0004) { b2 = b; bd = q; b = j; } }
      if (b > i) L.push([i, b, rnd()]); if (b2 > i && rnd() < .3) L.push([i, b2, rnd()]); }
    return { P, L }; }
  const brSprite = (col) => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, col + '.9)'); r.addColorStop(.25, col + '.35)'); r.addColorStop(1, col + '0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return c; };
  const brFit = (cv, x) => { const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; x.setTransform(dpr, 0, 0, dpr, 0, 0); return [W, H]; };
  // Scene geometry is built once per page load (and pre-warmed when Office opens) so entering Brain never waits on it.
  function brGeo() { if (brGeo.c) return brGeo.c; const D = 7, B = brBuild(500);
    let s = 5; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const BP = B.P.map(p => ({ ...p, s: .7 + rnd() * .6, ph: rnd() * 400 }));
    brPath(); return (brGeo.c = { B, BP }); }
  // ----- Neural pathway the camera crawls along after the intro. A Catmull-Rom centerline through the field (one control point per
  // Knowledge section = one fork), wrapped by twisting axon fibres, forks peeling off, soma cells with dendrite trees, and folded tissue walls.
  function brPath() { if (brPath.c) return brPath.c;
    let s = 29; const r = () => (s = (s * 16807) % 2147483647) / 2147483647, SP = 5, K = 16, ZM = K * SP, DZ = .25;
    const CP = []; for (let k = 0; k <= K + 2; k++) CP.push(k < 1 ? [0, 0] : [(r() - .5) * 2.8, (r() - .5) * 2.1]);
    const cen = z => { z = Math.max(0, Math.min(ZM - .001, z)); const k = Math.floor(z / SP), u = z / SP - k, a = CP[Math.max(0, k - 1)], b = CP[k], c = CP[k + 1], d = CP[k + 2];
      const cr = i => .5 * (2 * b[i] + (-a[i] + c[i]) * u + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * u * u + (-a[i] + 3 * b[i] - 3 * c[i] + d[i]) * u * u * u); return [cr(0), cr(1)]; };
    const PL = [], SO = [], add = (p, kind, w) => { let z0 = 1e9, z1 = -1e9; for (const q of p) { z0 = Math.min(z0, q[2]); z1 = Math.max(z1, q[2]); } PL.push({ p, kind, w, z0, z1, ph: r() }); };
    // main bundle: 4 fibres twisting round the centerline (the chosen path)
    for (let f = 0; f < 4; f++) { const ph = f * 1.57, rad = .32 + f * .07, p = []; for (let z = 0; z <= ZM; z += DZ) { const c = cen(z); p.push([c[0] + Math.cos(z * .5 + ph) * rad, c[1] + .25 + Math.sin(z * .5 + ph) * rad * .8, z]); } add(p, 0, f ? 1.6 : 2.4); }
    // forks: at every control point 2-3 axons peel away, each with a sub-branch
    const curve = (o, ang, len, dz, wob, n) => { const p = []; for (let j = 0; j <= n; j++) { const t = j / n, d = len * t * t * .6 + len * t * .4, w = Math.sin(t * 3.1) * wob;
        p.push([o[0] + Math.cos(ang) * d + Math.cos(ang + 1.57) * w, o[1] + Math.sin(ang) * d * .85 + Math.sin(ang + 1.57) * w, o[2] + t * dz]); } return p; };
    for (let k = 1; k < K; k++) { const zk = k * SP, c = cen(zk), o = [c[0], c[1] + .25, zk], nb = 2 + (r() < .5);
      for (let b = 0; b < nb; b++) { const ang = b / nb * 6.283 + r() * 1.2, p = curve(o, ang, 2.2 + r() * 1.8, 3 + r() * 3, (r() - .5) * .8, 18); add(p, 1, 1.5);
        const m = p[9], q = curve(m, ang + (r() < .5 ? -.8 : .8), .9 + r(), 1.5 + r() * 1.5, .2, 10); add(q, 1, .9); }
      SO.push({ x: o[0] + .55, y: o[1] - .35, z: zk - .4, s: 1.7, fork: 1 }); }
    // stray axons running through the tissue around the path
    for (let i = 0; i < 46; i++) { const z0 = r() * ZM, a = r() * 6.283, rad = 1.2 + r() * 1.6, len = 4 + r() * 7, ph = r() * 6, p = [];
      for (let j = 0; j <= 60; j++) { const z = z0 + j / 60 * len, c = cen(z), aa = a + Math.sin(j / 60 * 3 + ph) * .5; p.push([c[0] + Math.cos(aa) * rad, c[1] + Math.sin(aa) * rad * .85, z]); } add(p, 2, .9); }
    // neurons: soma + dendrite trees + an axon reaching into the bundle
    const walk = (o, d, len, n) => { const p = [o]; let [x, y, z] = o, [a, b, c] = d; for (let j = 1; j <= n; j++) { a += (r() - .5) * .9; b += (r() - .5) * .9; c += (r() - .5) * .5; const L = Math.hypot(a, b, c) || 1; a /= L; b /= L; c /= L;
        x += a * len / n; y += b * len / n; z += c * len / n; p.push([x, y, z]); } return p; };
    for (let k = 0; k < K; k++) for (let i = 0; i < 8; i++) { const z = k * SP + r() * SP, c = cen(z), a = r() * 6.283, rad = .9 + r() * 1.7;
      SO.push({ x: c[0] + Math.cos(a) * rad, y: c[1] + Math.sin(a) * rad * .85, z, s: .8 + r() * .7 }); }
    for (const so of SO) { const o = [so.x, so.y, so.z], nd = so.fork ? 9 : 5 + Math.floor(r() * 3);
      for (let d = 0; d < nd; d++) { const u = r() * 2 - 1, t = r() * 6.283, q = Math.sqrt(1 - u * u), p = walk(o, [q * Math.cos(t), u, q * Math.sin(t) * .6], (.35 + r() * .55) * so.s, 7); add(p, 3, .8);
        const b = walk(p[3], [r() - .5, r() - .5, r() - .5], .25 * so.s + r() * .2, 4); add(b, 3, .5); }
      const zz = so.z + .6 + r(), c = cen(zz); add(curve(o, Math.atan2(c[1] + .25 - so.y, c[0] - so.x), Math.hypot(c[0] - so.x, c[1] + .25 - so.y), zz - so.z, .15, 12), 4, .7); }
    // folded tissue walls (gyri/sulci): broken wavy rings around the path
    const FO = []; for (let z = .3; z < ZM; z += .42) { const c = cen(z); for (let m = 0; m < 3; m++) { const t0 = r() * 6.283, sp = 1 + r() * 1.4, p = [];
      for (let j = 0; j <= 44; j++) { const th = t0 + j / 44 * sp, R = 2.7 + .5 * Math.sin(5 * th + z * .9) + .14 * Math.sin(11 * th - z * 1.7); p.push([c[0] + Math.cos(th) * R, c[1] + .25 + Math.sin(th) * R * .8, z + Math.sin(th * 3 + z) * .12]); } FO.push({ p, z0: z - .2, z1: z + .2 }); } }
    const DU = []; for (let i = 0; i < 260; i++) { const z = r() * ZM, c = cen(z), a = r() * 6.283, rad = .5 + r() * 3; DU.push({ x: c[0] + Math.cos(a) * rad, y: c[1] + Math.sin(a) * rad, z, ph: r() * 400 }); }
    return (brPath.c = { cen, PL, SO, FO, DU, SP, K, ZM }); }
  // One continuous scene on one canvas: the intro brain IS the neuron field. The camera dives into the brain and settles into the ambient drift
  // (no cut); extra neurons and strands fade in from depth during the dive; the list fades in over the running scene.
  // Intro once per session, tap to skip; ~30fps after the dive; paused when hidden; freed when the Brain list leaves; reduced motion = one static frame.
  function brAmbient(forceIntro) {
    if (window.__brAmb) return; const rm = matchMedia('(prefers-reduced-motion: reduce)').matches; let intro = !rm;
    try { if (!forceIntro && sessionStorage.getItem('gp-br-intro')) intro = false; if (intro) sessionStorage.setItem('gp-br-intro', '1'); } catch (_) {}
    const body = document.body, cv = document.createElement('canvas'); cv.id = 'br-amb'; cv.setAttribute('aria-hidden', 'true'); body.prepend(cv); body.classList.add('br-on');
    const x = cv.getContext('2d'); let [W, H] = brFit(cv, x), raf = 0, last = 0, tOff = 0, live = intro;
    const D = 7, T1 = 1500, T = 3200, BZ = 3.3, BS = 1.25, A = 3.15, V = .00022; let t0 = performance.now();
    let sk = null; if (intro) { body.classList.add('br-intro-on'); sk = document.createElement('div'); sk.id = 'br-intro'; sk.setAttribute('aria-hidden', 'true'); body.appendChild(sk);
      sk.onclick = () => { tOff = Math.max(tOff, T - (performance.now() - t0)); }; }
    const n = () => (O.d.knowledge || []).length; let B, BP, PA, sCur = -1, sPrev = 0, lt = 0;
    const glowG = brSprite('rgba(120,215,160,'), glowC = brSprite('rgba(251,247,238,'), G = 'rgba(120,215,160,', C = 'rgba(251,247,238,';
    const sm = q => q * q * (3 - 2 * q), cl = q => Math.max(0, Math.min(1, q));
    const wrap = r => r < .15 ? ((r - .15) % D + D) % D + .15 : r;
    function draw(now) {
      if (!B) return;
      const t = rm ? T : intro ? now - t0 + tOff : T + now - t0, sy = window.scrollY || 0, u = cl((t - T1) / (T - T1)), e = sm(u), F = intro ? e : 1;
      const camZ = A * e + V * Math.max(0, t - T1) + sy * .0035, camY = -.22 * e;
      const swx = Math.sin(t * .00017) * .25 * F, swy = (Math.cos(t * .00013) * .2 + sy * .0006) * F + camY;
      const q = 1 - (1 - cl(t / T)) ** 2, ang = .8 + .95 * q, tl = -.45 + .15 * q, ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(tl), st = Math.sin(tl);
      const fk = 1.4 - (intro ? .9 * (1 - e) : 0), fog = z => Math.max(0, 1 - z / D) ** fk, form = intro ? cl(t / 500) : 1;
      const f = Math.min(W, H) * .95, cx = W / 2, cy = H * .45, pj = (wx, wy, rz) => [cx + (wx - swx) * f / rz, cy + (wy - swy) * f / rz, rz];
      x.globalCompositeOperation = 'source-over'; x.fillStyle = '#030d08'; x.fillRect(0, 0, W, H);
      const bg = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .7); bg.addColorStop(0, 'rgba(34,78,54,.55)'); bg.addColorStop(.5, 'rgba(18,44,30,.35)'); bg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'lighter'; x.lineCap = 'round';
      // intro brain points (cross-fade out at the end of the dive while the pathway fades in)
      const bA = intro ? 1 - cl((u - .5) / .5) : 0;
      const SB = bA > .01 ? BP.map((p, i) => { const X = p.x * ca + p.z * sa, Z0 = -p.x * sa + p.z * ca, Y = p.y * ct - Z0 * st, Z = p.y * st + Z0 * ct, raw = BZ + Z * BS - camZ, rz = wrap(raw);
        const a = bA * form * (p.part && raw >= .15 ? 1 - cl(u * 2.5) : 1); return a > .01 ? [...pj(X * BS, -Y * BS, rz), a] : null; }) : [];
      const link = (A_, B_, w, ph) => { if (!A_ || !B_ || Math.abs(A_[2] - B_[2]) > 1) return; const al = fog((A_[2] + B_[2]) / 2) * Math.min(A_[3], B_[3]); if (al < .03) return;
        x.strokeStyle = G + al * w + ')'; x.beginPath(); x.moveTo(A_[0], A_[1]); x.lineTo(B_[0], B_[1]); x.stroke();
        if (ph != null && ph < .3) { const qq = (t / 900 + ph * 7) % 1, ps = 2.4; x.fillStyle = C + Math.min(1, al * 1.8) + ')'; x.fillRect(A_[0] + (B_[0] - A_[0]) * qq - ps / 2, A_[1] + (B_[1] - A_[1]) * qq - ps / 2, ps, ps); } };
      const dot = (P_, p) => { if (!P_) return; const [X, Y, z, a] = P_; if (X < -40 || X > W + 40 || Y < -40 || Y > H + 40) return;
        const fl = rm ? 0 : Math.max(0, Math.sin(t * .0021 + p.ph)) ** 60, al = Math.min(1, fog(z) * (1.1 + fl * 2) * a), r = Math.min(7, 2.6 * p.s / z + .5) * (1 + fl); if (al < .02) return;
        if (r > .9) { const g = r * 6; x.globalAlpha = al * .5; x.drawImage(p.c || fl > .3 ? glowC : glowG, X - g / 2, Y - g / 2, g, g); x.globalAlpha = 1; }
        x.fillStyle = (p.c ? C : G) + al + ')'; x.beginPath(); x.arc(X, Y, Math.max(.45, r * .5), 0, 6.283); x.fill(); };
      if (bA > .01) { x.lineWidth = .8; for (const [a, b, ph] of B.L) link(SB[a], SB[b], .55, ph); for (let i = 0; i < BP.length; i++) dot(SB[i], BP[i]); }
      if (F > .01) pathDraw(t, F);
      x.globalCompositeOperation = 'source-over';
      const hud = intro ? (1 - cl(u * 2.2)) * cl(t / 300) : 0;
      if (hud > 0) { const R = Math.min(W, H) * .44, k = t / T; x.globalAlpha = hud; x.lineWidth = 1.1;
        [[R, k * 4, 1.3, G + '.7)'], [R * 1.1, -k * 3, .5, C + '.5)'], [R * 1.18, k * 2, 2.2, G + '.3)']].forEach(([rr, o, len, col], j) => { x.strokeStyle = col; for (let m = 0; m < 3; m++) { x.beginPath(); x.arc(cx, cy, rr, o + m * 2.09, o + m * 2.09 + len * (j ? .5 : .8)); x.stroke(); } });
        x.strokeStyle = G + '.45)'; for (let m = 0; m < 60; m++) { const a = m / 60 * 6.283 + k, r1 = R * .94, r2 = m % 5 ? R * .965 : R * .99; x.beginPath(); x.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); x.stroke(); }
        const ly = cy - R + (k * 2.2 % 1) * R * 2; x.strokeStyle = C + '.2)'; x.beginPath(); x.moveTo(cx - R, ly); x.lineTo(cx + R, ly); x.stroke();
        x.font = '600 12px ui-monospace, Menlo, monospace'; x.textAlign = 'center'; x.fillStyle = C + '.9)'; x.fillText('GATEPOST BRAIN', cx, cy - R * 1.3);
        x.font = '10px ui-monospace, Menlo, monospace'; x.fillStyle = G + '.9)'; const N = n(), sc = Math.min(N, Math.round(N * k * 2.2));
        x.fillText(`NEURAL INDEX \u00b7 ${N ? sc + ' / ' + N + ' FACTS' : 'SYNCING'}`, cx, cy + R * 1.32); x.fillText(`SCAN ${String(Math.min(100, Math.round(k * 180))).padStart(3, '0')}%`, cx, cy + R * 1.32 + 15);
        x.textAlign = 'left'; x.fillText('LINKS ' + (B.L.length + PA.PL.length), 14, H * .12); x.textAlign = 'right'; x.fillText('NODES ' + (BP.length + PA.SO.length), W - 14, H * .12);
        x.textAlign = 'center'; x.font = '12px system-ui, sans-serif'; x.fillStyle = C + '.5)'; x.fillText('Tap to skip', cx, H - 28); x.globalAlpha = 1; }
      if (live && t > T - 250) { live = false; body.classList.remove('br-intro-on'); if (sk) { sk.remove(); sk = null; } } }
    // scroll -> camera distance along the path: each Knowledge section is one segment, so a fork is passed as each section header arrives
    function sTarget() { const sy = window.scrollY || 0, y = sy + H * .45, tops = [...document.querySelectorAll('#br-list .br-sec')].slice(0, PA.K - 3).map(el => el.getBoundingClientRect().top + sy);
      const endY = Math.max(y, document.documentElement.scrollHeight - H + H * .45), bd = [0, ...tops.filter(v => v > 0), endY + 1];
      for (let i = 0; i < bd.length - 1; i++) if (y < bd[i + 1]) return (i + cl((y - bd[i]) / (bd[i + 1] - bd[i]))) * PA.SP; return (bd.length - 1) * PA.SP; }
    function pathDraw(t, F) {
      const tg = sTarget(), dt = Math.min(100, Math.max(1, t - lt)); lt = t;
      sPrev = sCur; sCur = sCur < 0 || rm ? tg : sCur + (tg - sCur) * (1 - Math.exp(-dt / 260)); const vel = Math.min(3, Math.abs(sCur - sPrev) / dt * 60);
      const sc = sCur + (rm ? 0 : Math.sin(t * .00035) * .12), c0 = PA.cen(sc), c1 = PA.cen(sc + 1.8), cam = [c0[0] - .1, c0[1] + .05, sc];
      const yw = Math.atan2(c1[0] - c0[0], 1.8), pt = Math.atan2(c1[1] - c0[1], 1.8), ro = Math.sin(sc * .21) * .1 + (rm ? 0 : Math.sin(t * .0002) * .03);
      const cy_ = Math.cos(yw), sy_ = Math.sin(yw), cp = Math.cos(pt), sp = Math.sin(pt), cr = Math.cos(ro), sr = Math.sin(ro), f = Math.min(W, H) * .9, cx = W / 2, cy = H * .46;
      const pr = (px, py, pz) => { const dx = px - cam[0], dy = py - cam[1], dz = pz - cam[2], X = dx * cy_ - dz * sy_, Z = dx * sy_ + dz * cy_, Y = dy * cp - Z * sp, Z2 = dy * sp + Z * cp;
        if (Z2 < .05) return null; const X2 = X * cr - Y * sr, Y2 = X * sr + Y * cr; return [cx + X2 * f / Z2, cy + Y2 * f / Z2, Z2]; };
      const VD = 10, lum = z => F * cl(z / .35) * Math.pow(Math.max(0, 1 - z / VD), 1.25);
      // depth glow where the path leads
      x.globalCompositeOperation = 'lighter';
      const vp = pr(PA.cen(sc + 7)[0], PA.cen(sc + 7)[1] + .25, sc + 7) || [cx, cy];
      let g = x.createRadialGradient(vp[0], vp[1], 0, vp[0], vp[1], Math.max(W, H) * .55); g.addColorStop(0, `rgba(70,170,112,${.42 * F})`); g.addColorStop(.25, `rgba(30,96,62,${.25 * F})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      const z0 = sc - .3, z1 = sc + VD; x.lineCap = x.lineJoin = 'round';
      const poly = (p, al, w, col) => { let on = 0, n = 0; x.beginPath(); for (const q of p) { if (q[2] < z0 || q[2] > z1 + 1) { on = 0; continue; } const P_ = pr(q[0], q[1], q[2]); if (!P_) { on = 0; continue; } on ? x.lineTo(P_[0], P_[1]) : x.moveTo(P_[0], P_[1]); on = 1; n++; }
        if (n > 1) { x.strokeStyle = col + al + ')'; x.lineWidth = w; x.stroke(); } };
      const zm = o => Math.max(.3, (Math.max(o.z0, sc) + Math.min(o.z1, sc + VD)) / 2 - sc);
      for (const o of PA.FO) { if (o.z1 < z0 || o.z0 > z1) continue; const z = zm(o), al = lum(z) * .55; if (al > .01) { poly(o.p, al * .35, Math.min(14, 9 / z), G); poly(o.p, al, Math.min(3, 1.6 / z), G); } }
      for (const o of PA.PL) { if (o.z1 < z0 || o.z0 > z1) continue; const z = zm(o), L = lum(z), w = o.w * Math.min(4, 2.2 / z); if (L < .02) continue;
        if (o.kind === 0) { poly(o.p, L * .16, w * 6, G); poly(o.p, L * .5, w * 2.2, G); poly(o.p, Math.min(1, L * 1.1), w * .8, 'rgba(200,250,220,'); }
        else if (o.kind === 1) { poly(o.p, L * .14, w * 5, G); poly(o.p, Math.min(1, L * .95), w, G); }
        else if (o.kind === 2) poly(o.p, L * .5, w, G);
        else poly(o.p, Math.min(1, L * (o.kind === 4 ? .7 : .85)), Math.max(.6, w * .8), o.kind === 4 ? G : 'rgba(160,235,190,'); }
      // synapse pulses racing ahead along fibres and forks
      const spr = (P_, sz, al, img) => { if (!P_ || al < .02) return; x.globalAlpha = Math.min(1, al); x.drawImage(img, P_[0] - sz / 2, P_[1] - sz / 2, sz, sz); x.globalAlpha = 1; };
      for (const o of PA.PL) { if (o.kind > 1 || o.z1 < z0 || o.z0 > z1) continue; const n = o.p.length - 1, cnt = o.kind ? 2 : 7;
        for (let m = 0; m < cnt; m++) { let qf; if (o.kind) qf = ((t / 1700) * (.7 + o.ph) + o.ph + m / cnt) % 1 * n; else { const zz = sc + ((t / 2600 + o.ph + m / cnt) % 1) * VD; qf = zz / .25; }
          const k = Math.floor(qf), fr = qf - k; if (k < 0 || k >= n) continue; const a = o.p[k], b = o.p[k + 1], P_ = pr(a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr, a[2] + (b[2] - a[2]) * fr); if (!P_) continue;
          const L = lum(P_[2]); spr(P_, Math.min(90, 34 / P_[2]), L * 1.3, glowC); spr(P_, Math.min(160, 80 / P_[2]), L * .6, glowG); } }
      // somas (with nucleus), streaking past when close and moving
      for (const so of PA.SO) { if (so.z < z0 || so.z > z1) continue; const P_ = pr(so.x, so.y, so.z); if (!P_) continue; const z = P_[2], L = lum(z) * cl((z - .25) / 1.1), rr = Math.min(18, .07 * so.s * f / z); if (L < .02) continue;
        const pu = rm ? 0 : Math.max(0, Math.sin(t * .0016 + so.x * 9)) ** 30;
        if (vel > .02 && z < 2.2) { const dx = P_[0] - cx, dy = P_[1] - cy, k = vel * (2.2 - z) * .35; x.strokeStyle = G + L * .5 + ')'; x.lineWidth = rr * .9; x.beginPath(); x.moveTo(P_[0], P_[1]); x.lineTo(P_[0] + dx * k, P_[1] + dy * k); x.stroke(); }
        spr(P_, rr * 7, L * .55, glowG); x.fillStyle = `rgba(40,110,72,${Math.min(1, L * .95)})`; x.beginPath(); x.arc(P_[0], P_[1], rr, 0, 6.283); x.fill();
        x.fillStyle = `rgba(150,235,185,${Math.min(1, L * .9)})`; x.beginPath(); x.arc(P_[0], P_[1], rr * .62, 0, 6.283); x.fill();
        spr(P_, rr * 2.6, L * (1 + pu * 2), glowC); }
      for (const d of PA.DU) { if (d.z < z0 || d.z > z1) continue; const P_ = pr(d.x, d.y, d.z); if (!P_) continue; const L = lum(P_[2]) * (.5 + .5 * Math.sin(t * .002 + d.ph)), r = Math.min(3, 2.4 / P_[2]); if (L < .03) continue;
        x.fillStyle = C + L * .8 + ')'; x.beginPath(); x.arc(P_[0], P_[1], r, 0, 6.283); x.fill(); }
      x.globalCompositeOperation = 'source-over'; }
    const loop = now => { if (!document.getElementById('br-list')) return stop(); raf = requestAnimationFrame(loop); if (!live && now - last < 32) return; last = now; draw(now); };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !rm) raf = requestAnimationFrame(loop); };
    const rs = () => { [W, H] = brFit(cv, x); if (rm) draw(0); }, rsc = () => { if (rm) draw(0); };
    const chk = setInterval(() => { if (!document.getElementById('br-list')) stop(); }, 1000);
    function stop() { cancelAnimationFrame(raf); clearInterval(chk); document.removeEventListener('visibilitychange', vis); removeEventListener('resize', rs); removeEventListener('scroll', rsc);
      cv.remove(); if (sk) sk.remove(); body.classList.remove('br-on', 'br-intro-on'); window.__brAmb = null; }
    document.addEventListener('visibilitychange', vis); addEventListener('resize', rs); addEventListener('scroll', rsc, { passive: true });
    const me = window.__brAmb = { stop };
    const go = () => { if (window.__brAmb !== me) return; ({ B, BP } = brGeo()); PA = brPath(); t0 = performance.now(); draw(t0); if (!rm) raf = requestAnimationFrame(loop); };
    brGeo.c ? go() : setTimeout(go, 0); }
  window.ofBrAmbient = brAmbient;
  function brIntro(force) { if (force) { if (window.__brAmb) window.__brAmb.stop(); try { sessionStorage.removeItem('gp-br-intro'); } catch (_) {} } brAmbient(!!force); }
  window.ofBrIntro = brIntro;
})();
