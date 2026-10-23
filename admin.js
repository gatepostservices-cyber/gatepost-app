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
    knowledge: () => gpSb.from('knowledge').select('id,key,category,title,value,source,owner,updated_at,updated_by').order('category').order('title').limit(1000) };
  const NEED = { leads: ['leads', 'matches', 'outreach'], customers: ['timeline'], pricebook: ['price_book'], joblog: ['job_log'], control: ['bot_notes'], brain: ['knowledge'] };
  async function load(k, force) {
    if (!window.gpSb || O.busy[k] || (!force && O.d[k] && Date.now() - (O.at[k] || 0) < 20000)) return;
    O.busy[k] = 1; try { const { data, error } = await Q[k](); if (error) { O.d[k] = O.d[k] || []; window.gpReportError && gpReportError(error, { op: 'office ' + k }); } else O.d[k] = data || []; O.at[k] = Date.now(); }
    finally { O.busy[k] = 0; } paint(); }
  function paint() { const r = document.getElementById('of-root'); if (r && typeof page === 'function' && ['office', 'leads', 'joblog'].includes(page())) r.outerHTML = officePage(true); }
  const toast = m => { const el = document.getElementById('of-msg'); if (el) el.textContent = m; };
  const TABS = [['leads', 'Leads'], ['customers', 'Customers'], ['pricebook', 'Price Book'], ['joblog', 'Job Log'], ['control', 'Control'], ['brain', 'Brain']];
  window.officePage = function (noLoad) {
    if (!own()) return '<div class="card" id="of-root"><h2>Office</h2><p class="muted">Owners only.</p></div>';
    if (!brGeo.c) (window.requestIdleCallback || (f => setTimeout(f, 400)))(() => brGeo());
    // Simplified nav: Leads lives in Sales, Job Log in Schedule; Office keeps Customers, Price Book, Control.
    const pg = typeof page === 'function' ? page() : 'office', solo = pg === 'leads' || pg === 'joblog';
    if (solo) O.tab = pg; else if (O.tab === 'leads' || O.tab === 'joblog') { O.tab = 'customers'; O.q = ''; O.ol = null; O.oadd = 0; }
    const tabs = solo ? [] : TABS.filter(([k]) => k !== 'leads' && k !== 'joblog');
    if (!noLoad) setTimeout(() => NEED[O.tab].forEach(k => load(k)), 0);
    const body = { leads: leadsHTML, customers: custHTML, pricebook: pbHTML, joblog: jlHTML, control: ctlHTML, brain: brHTML }[O.tab]();
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
    const E = []; for (let i = 0; i < 180; i++) E.push({ x: (rnd() - .5) * 3.4, y: (rnd() - .5) * 5.6, z: .4 + rnd() * D, s: .55 + rnd() * .9, c: rnd() < .09, ph: rnd() * 400 });
    const LK = []; for (let i = 0; i < E.length; i++) { let b = -1, bd = .25; for (let j = i + 1; j < E.length; j++) { const q = (E[i].x - E[j].x) ** 2 + (E[i].y - E[j].y) ** 2 + (E[i].z - E[j].z) ** 2; if (q < bd) { bd = q; b = j; } } if (b >= 0) LK.push([i, b]); }
    const ST = []; for (let i = 0; i < 60; i++) { const x0 = (rnd() - .5) * 3, y0 = (rnd() - .5) * 5, z0 = .5 + rnd() * D, len = 1.2 + rnd() * 2.4, ph = rnd() * 6.3, a = .15 + rnd() * .45, dx = (rnd() - .5) * 1.2, hz = rnd() < .5;
      const pts = []; for (let k = 0; k <= 14; k++) { const u = k / 14; pts.push(hz ? [x0 + (u - .5) * len, y0 + Math.sin(u * 3 + ph) * a + dx * u * .3, Math.cos(u * 2.4 + ph) * .5] : [x0 + Math.sin(u * 3 + ph) * a + dx * u, y0 + (u - .5) * len, Math.cos(u * 2.4 + ph) * .5]); }
      ST.push({ pts, z0, ph: rnd(), sp: .5 + rnd(), c: rnd() < .25 }); }
    const BP = B.P.map(p => ({ ...p, s: .7 + rnd() * .6, ph: rnd() * 400 }));
    return (brGeo.c = { B, E, LK, ST, BP }); }
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
    const n = () => (O.d.knowledge || []).length; let B, E, LK, ST, BP;
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
      // brain points as world neurons
      const SB = BP.map((p, i) => { const X = p.x * ca + p.z * sa, Z0 = -p.x * sa + p.z * ca, Y = p.y * ct - Z0 * st, Z = p.y * st + Z0 * ct, raw = BZ + Z * BS - camZ, rz = wrap(raw);
        const a = form * (p.part && raw >= .15 ? 1 - cl(u * 2.5) : 1); return a > .01 ? [...pj(X * BS, -Y * BS, rz), a] : null; });
      const SE = E.map(p => [...pj(p.x, p.y, wrap(p.z - camZ)), F]);
      const link = (A_, B_, w, ph) => { if (!A_ || !B_ || Math.abs(A_[2] - B_[2]) > 1) return; const al = fog((A_[2] + B_[2]) / 2) * Math.min(A_[3], B_[3]); if (al < .03) return;
        x.strokeStyle = G + al * w + ')'; x.beginPath(); x.moveTo(A_[0], A_[1]); x.lineTo(B_[0], B_[1]); x.stroke();
        if (ph != null && ph < .3) { const qq = (t / 900 + ph * 7) % 1, ps = 2.4; x.fillStyle = C + Math.min(1, al * 1.8) + ')'; x.fillRect(A_[0] + (B_[0] - A_[0]) * qq - ps / 2, A_[1] + (B_[1] - A_[1]) * qq - ps / 2, ps, ps); } };
      x.lineWidth = .8; for (const [a, b, ph] of B.L) link(SB[a], SB[b], .55, ph); for (const [a, b] of LK) link(SE[a], SE[b], .5);
      if (F > .01) for (const sd of ST) { const zb = wrap(sd.z0 - camZ); let pv = 0, zs = 0; x.beginPath();
        for (const [px, py, pz] of sd.pts) { const z = zb + pz; if (z < .2) { pv = 0; continue; } const P_ = pj(px, py, z); pv ? x.lineTo(P_[0], P_[1]) : x.moveTo(P_[0], P_[1]); pv = 1; zs += z; }
        const zm = zs / sd.pts.length || D, al = fog(zm) * F; if (al < .02) continue; x.strokeStyle = (sd.c ? C : G) + (al * .45) + ')'; x.lineWidth = Math.min(3.5, 2.6 / zm); x.stroke();
        for (let m = 0; m < 2; m++) { const qq = ((t / 2600) * sd.sp + sd.ph + m * .5) % 1, kf = qq * 14, k0 = Math.floor(kf), a = sd.pts[k0], b = sd.pts[Math.min(14, k0 + 1)], fr = kf - k0, z = zb + a[2] + (b[2] - a[2]) * fr; if (z < .25) continue;
          const P_ = pj(a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr, z), g = Math.min(44, 18 / z); x.globalAlpha = fog(z) * .9 * F; x.drawImage(sd.c ? glowG : glowC, P_[0] - g / 2, P_[1] - g / 2, g, g); x.globalAlpha = 1; } }
      const dot = (P_, p) => { if (!P_) return; const [X, Y, z, a] = P_; if (X < -40 || X > W + 40 || Y < -40 || Y > H + 40) return;
        const fl = rm ? 0 : Math.max(0, Math.sin(t * .0021 + p.ph)) ** 60, al = Math.min(1, fog(z) * (1.1 + fl * 2) * a), r = Math.min(7, 2.6 * p.s / z + .5) * (1 + fl); if (al < .02) return;
        if (r > .9) { const g = r * 6; x.globalAlpha = al * .5; x.drawImage(p.c || fl > .3 ? glowC : glowG, X - g / 2, Y - g / 2, g, g); x.globalAlpha = 1; }
        x.fillStyle = (p.c ? C : G) + al + ')'; x.beginPath(); x.arc(X, Y, Math.max(.45, r * .5), 0, 6.283); x.fill(); };
      for (let i = 0; i < BP.length; i++) dot(SB[i], BP[i]); for (let i = 0; i < E.length; i++) dot(SE[i], E[i]);
      x.globalCompositeOperation = 'source-over';
      const hud = intro ? (1 - cl(u * 2.2)) * cl(t / 300) : 0;
      if (hud > 0) { const R = Math.min(W, H) * .44, k = t / T; x.globalAlpha = hud; x.lineWidth = 1.1;
        [[R, k * 4, 1.3, G + '.7)'], [R * 1.1, -k * 3, .5, C + '.5)'], [R * 1.18, k * 2, 2.2, G + '.3)']].forEach(([rr, o, len, col], j) => { x.strokeStyle = col; for (let m = 0; m < 3; m++) { x.beginPath(); x.arc(cx, cy, rr, o + m * 2.09, o + m * 2.09 + len * (j ? .5 : .8)); x.stroke(); } });
        x.strokeStyle = G + '.45)'; for (let m = 0; m < 60; m++) { const a = m / 60 * 6.283 + k, r1 = R * .94, r2 = m % 5 ? R * .965 : R * .99; x.beginPath(); x.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); x.stroke(); }
        const ly = cy - R + (k * 2.2 % 1) * R * 2; x.strokeStyle = C + '.2)'; x.beginPath(); x.moveTo(cx - R, ly); x.lineTo(cx + R, ly); x.stroke();
        x.font = '600 12px ui-monospace, Menlo, monospace'; x.textAlign = 'center'; x.fillStyle = C + '.9)'; x.fillText('GATEPOST BRAIN', cx, cy - R * 1.3);
        x.font = '10px ui-monospace, Menlo, monospace'; x.fillStyle = G + '.9)'; const N = n(), sc = Math.min(N, Math.round(N * k * 2.2));
        x.fillText(`NEURAL INDEX \u00b7 ${N ? sc + ' / ' + N + ' FACTS' : 'SYNCING'}`, cx, cy + R * 1.32); x.fillText(`SCAN ${String(Math.min(100, Math.round(k * 180))).padStart(3, '0')}%`, cx, cy + R * 1.32 + 15);
        x.textAlign = 'left'; x.fillText('LINKS ' + (B.L.length + LK.length), 14, H * .12); x.textAlign = 'right'; x.fillText('NODES ' + (BP.length + E.length), W - 14, H * .12);
        x.textAlign = 'center'; x.font = '12px system-ui, sans-serif'; x.fillStyle = C + '.5)'; x.fillText('Tap to skip', cx, H - 28); x.globalAlpha = 1; }
      if (live && t > T - 250) { live = false; body.classList.remove('br-intro-on'); if (sk) { sk.remove(); sk = null; } } }
    const loop = now => { if (!document.getElementById('br-list')) return stop(); raf = requestAnimationFrame(loop); if (!live && now - last < 32) return; last = now; draw(now); };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !rm) raf = requestAnimationFrame(loop); };
    const rs = () => { [W, H] = brFit(cv, x); if (rm) draw(0); };
    const chk = setInterval(() => { if (!document.getElementById('br-list')) stop(); }, 1000);
    function stop() { cancelAnimationFrame(raf); clearInterval(chk); document.removeEventListener('visibilitychange', vis); removeEventListener('resize', rs);
      cv.remove(); if (sk) sk.remove(); body.classList.remove('br-on', 'br-intro-on'); window.__brAmb = null; }
    document.addEventListener('visibilitychange', vis); addEventListener('resize', rs);
    const me = window.__brAmb = { stop };
    const go = () => { if (window.__brAmb !== me) return; ({ B, E, LK, ST, BP } = brGeo()); t0 = performance.now(); draw(t0); if (!rm) raf = requestAnimationFrame(loop); };
    brGeo.c ? go() : setTimeout(go, 0); }
  window.ofBrAmbient = brAmbient;
  function brIntro(force) { if (force) { if (window.__brAmb) window.__brAmb.stop(); try { sessionStorage.removeItem('gp-br-intro'); } catch (_) {} } brAmbient(!!force); }
  window.ofBrIntro = brIntro;
})();
