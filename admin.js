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
    // Simplified nav: Leads lives in Sales, Job Log in Schedule; Office keeps Customers, Price Book, Control.
    const pg = typeof page === 'function' ? page() : 'office', solo = pg === 'leads' || pg === 'joblog';
    if (solo) O.tab = pg; else if (O.tab === 'leads' || O.tab === 'joblog') { O.tab = 'customers'; O.q = ''; O.ol = null; O.oadd = 0; }
    const tabs = solo ? [] : TABS.filter(([k]) => k !== 'leads' && k !== 'joblog');
    if (!noLoad) setTimeout(() => NEED[O.tab].forEach(k => load(k)), 0);
    const body = { leads: leadsHTML, customers: custHTML, pricebook: pbHTML, joblog: jlHTML, control: ctlHTML, brain: brHTML }[O.tab]();
    return `<div id="of-root">${tabs.length ? `<div class="of-tabs" role="tablist">${tabs.map(([k, n]) => `<button type="button" role="tab" class="${O.tab === k ? 'on' : ''}" onclick="ofTab('${k}')">${n}</button>`).join('')}</div>` : ''}
      <div id="of-msg" class="muted q-rt" aria-live="polite"></div>${body}</div>`; };
  window.ofLoad = (k, f) => load(k, f);
  window.ofTab = k => { if (k === 'brain') setTimeout(brIntro, 0); O.tab = k; O.q = ''; O.cust = null; O.ol = null; O.oadd = 0; paint(); NEED[k].forEach(x => load(x)); };
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
    return ks.map(k => `<h3 class="pb-sec">${e(k.replace(/_/g, ' '))} <span class="muted">${G[k].length}</span></h3>` + G[k].map(r => `<div class="br-item"><b>${e(r.title || r.key)}</b>
      <div class="of-body br-val">${e(r.value)}</div><div class="muted uf-st">updated ${e(brDay(r.updated_at))}${r.updated_by ? ' by ' + e(r.updated_by) : ''}</div></div>`).join('')).join(''); };
  function brHTML() {
    setTimeout(brAmbient, 0);
    return `<div class="card br-card"><h2>Brain</h2><p class="muted">Read-only. The shared facts every bot checks before asking.</p>
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
  // v: {ang, tl, cam, f, cx, cy, t(ms), a(alpha), dark, pulse}
  function brDraw(x, B, v) {
    const ca = Math.cos(v.ang), sa = Math.sin(v.ang), ct = Math.cos(v.tl), st = Math.sin(v.tl), S = new Array(B.P.length);
    for (let i = 0; i < B.P.length; i++) { const p = B.P[i], X = p.x * ca + p.z * sa, Z0 = -p.x * sa + p.z * ca, Y = p.y * ct - Z0 * st, Z = p.y * st + Z0 * ct, dz = v.cam + Z;
      S[i] = dz > .08 ? [v.cx + X * v.f / dz, v.cy - Y * v.f / dz, dz] : null; }
    const G = v.dark ? 'rgba(110,205,150,' : 'rgba(31,58,43,', C = v.dark ? 'rgba(251,247,238,' : 'rgba(61,107,79,', dep = d => Math.max(v.light ? .6 : .12, Math.min(1, 1.5 - d / (v.cam + 1.2)));
    x.globalCompositeOperation = v.dark ? 'lighter' : 'source-over'; x.lineWidth = v.dark ? .55 : 1.1;
    for (const [a, b, ph] of B.L) { const A = S[a], Bq = S[b]; if (!A || !Bq) continue; const al = dep((A[2] + Bq[2]) / 2) * v.a;
      x.strokeStyle = G + al * (v.dark ? .38 : .85) + ')'; x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(Bq[0], Bq[1]); x.stroke();
      if (ph < v.pulse) { const q = (v.t / 900 + ph * 7) % 1; const ps = v.light ? 3.2 : 2; x.fillStyle = (v.light ? 'rgba(46,140,90,' : C) + Math.min(1, al * 1.8) + ')'; x.fillRect(A[0] + (Bq[0] - A[0]) * q - ps / 2, A[1] + (Bq[1] - A[1]) * q - ps / 2, ps, ps); } }
    const spr = v.dark && (brDraw.s || (brDraw.s = brSprite('rgba(110,205,150,')));
    for (let i = 0; i < S.length; i++) { const p = S[i]; if (!p) continue; const al = dep(p[2]) * v.a, sc = Math.min(4, 1.6 / p[2]), c = B.P[i].c;
      if (spr && al > .25) { x.globalAlpha = al * .55; const g = 7 * sc; x.drawImage(spr, p[0] - g / 2, p[1] - g / 2, g, g); x.globalAlpha = 1; }
      const r = (c ? 1.5 : 1.05) * sc * (v.light ? 2.2 : 1); x.fillStyle = (c ? C : G) + al + ')'; x.fillRect(p[0] - r / 2, p[1] - r / 2, r, r); }
    x.globalCompositeOperation = 'source-over'; return S; }
  const brFit = (cv, x) => { const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; x.setTransform(dpr, 0, 0, dpr, 0, 0); return [W, H]; };
  // Ambient background while reading: light, ~30fps, paused when hidden, freed when the Brain list leaves the page.
  function brAmbient() {
    if (window.__brAmb) return; const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = document.createElement('canvas'); cv.id = 'br-amb'; cv.setAttribute('aria-hidden', 'true'); document.body.prepend(cv); document.body.classList.add('br-on');
    const x = cv.getContext('2d'), B = brBuild(580); let [W, H] = brFit(cv, x), raf = 0, last = 0, t0 = performance.now();
    const draw = now => { x.clearRect(0, 0, W, H); const sy = window.scrollY || 0, t = rm ? 0 : now - t0;
      brDraw(x, B, { ang: Math.sin(t * .00012) * .45 + sy * .0004, tl: -1.15 + Math.sin(t * .0003) * .05, cam: 2.6, f: Math.min(H * .95, W * 1.9), cx: W / 2, cy: H * .52 - sy * .08, t, a: 1, dark: false, pulse: rm ? 0 : .35, light: 1 }); };
    const loop = now => { if (!document.getElementById('br-list')) return stop(); raf = requestAnimationFrame(loop); if (now - last < 32 || document.getElementById('br-intro')) return; last = now; draw(now); };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !rm) raf = requestAnimationFrame(loop); };
    const rs = () => { [W, H] = brFit(cv, x); if (rm) draw(0); }, sc = () => { if (rm) draw(0); };
    const chk = setInterval(() => { if (!document.getElementById('br-list')) stop(); }, 1000);
    function stop() { cancelAnimationFrame(raf); clearInterval(chk); document.removeEventListener('visibilitychange', vis); removeEventListener('resize', rs); removeEventListener('scroll', sc);
      cv.remove(); document.body.classList.remove('br-on'); window.__brAmb = null; }
    document.addEventListener('visibilitychange', vis); addEventListener('resize', rs); addEventListener('scroll', sc, { passive: true });
    window.__brAmb = { stop }; if (rm) draw(0); else raf = requestAnimationFrame(loop); }
  window.ofBrAmbient = brAmbient;
  // Intro: JARVIS-style holographic brain. Once per session, tap to skip, none with reduced motion. Settles inside the brain, then reveals the ambient brain behind the list.
  function brIntro(force) {
    try { if (!force && (sessionStorage.getItem('gp-br-intro') || matchMedia('(prefers-reduced-motion: reduce)').matches)) return; sessionStorage.setItem('gp-br-intro', '1'); } catch (_) {}
    if (document.getElementById('br-intro')) return;
    const d = document.createElement('div'); d.id = 'br-intro'; d.setAttribute('aria-hidden', 'true');
    const cv = document.createElement('canvas'); d.appendChild(cv); document.body.appendChild(d); document.body.classList.add('br-intro-on');
    const x = cv.getContext('2d'), B = brBuild(880); let [W, H] = brFit(cv, x);
    let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, F = []; for (let i = 0; i < 140; i++) F.push({ x: (rnd() - .5) * 6, y: (rnd() - .5) * 6, z: rnd() * 8 });
    const n = (O.d.knowledge || []).length, T = 3200, t0 = performance.now(); let raf, done = 0;
    const rs = () => { [W, H] = brFit(cv, x); };
    const end = () => { if (done) return; done = 1; cancelAnimationFrame(raf); removeEventListener('resize', rs); d.classList.add('out'); setTimeout(() => { d.remove(); document.body.classList.remove('br-intro-on'); }, 600); };
    d.onclick = end; addEventListener('resize', rs);
    const G = 'rgba(110,205,150,', C = 'rgba(251,247,238,';
    function frame(now) {
      const t = now - t0, k = Math.min(1, t / T), push = k < .55 ? 0 : Math.min(1, (k - .55) / .38), e = push * push * (3 - 2 * push);
      const cx = W / 2, cy = H * .47, f = Math.min(W, H) * 1.2, cam = 3.1 - e * 2.35, form = Math.min(1, k / .18);
      x.fillStyle = '#05100b'; x.fillRect(0, 0, W, H);
      const bg = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .6); bg.addColorStop(0, 'rgba(31,58,43,.6)'); bg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
      brDraw(x, B, { ang: .85 + k * .9, tl: -.5, cam: cam + (1 - form) * 2, f, cx, cy, t, a: form, dark: true, pulse: .3 });
      if (push > 0) { x.globalCompositeOperation = 'lighter'; for (const q of F) { const z = ((q.z - e * 9) % 8 + 8) % 8 + .1, z2 = z + .3;
        x.strokeStyle = G + Math.min(.7, push * 1.4) + ')'; x.lineWidth = 1.2 / z; x.beginPath(); x.moveTo(cx + q.x * f / z / 3, cy + q.y * f / z / 3); x.lineTo(cx + q.x * f / z2 / 3, cy + q.y * f / z2 / 3); x.stroke(); } x.globalCompositeOperation = 'source-over'; }
      const hud = Math.max(0, 1 - push * 2.2), R = Math.min(W, H) * .44;
      if (hud > 0) { x.globalAlpha = hud * Math.min(1, k * 4); x.lineWidth = 1.1;
        [[R, k * 4, 1.3, G + '.7)'], [R * 1.1, -k * 3, .5, C + '.5)'], [R * 1.18, k * 2, 2.2, G + '.3)']].forEach(([rr, o, len, col], j) => { x.strokeStyle = col;
          for (let m = 0; m < 3; m++) { x.beginPath(); x.arc(cx, cy, rr, o + m * 2.09, o + m * 2.09 + len * (j ? .5 : .8)); x.stroke(); } });
        x.strokeStyle = G + '.45)'; for (let m = 0; m < 60; m++) { const a = m / 60 * 6.283 + k, r1 = R * .94, r2 = m % 5 ? R * .965 : R * .99; x.beginPath(); x.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); x.stroke(); }
        const sy = cy - R + (k * 2.2 % 1) * R * 2; x.strokeStyle = C + '.2)'; x.beginPath(); x.moveTo(cx - R, sy); x.lineTo(cx + R, sy); x.stroke();
        x.font = '600 12px ui-monospace, Menlo, monospace'; x.textAlign = 'center'; x.fillStyle = C + '.9)'; x.fillText('GATEPOST BRAIN', cx, cy - R * 1.3);
        x.font = '10px ui-monospace, Menlo, monospace'; x.fillStyle = G + '.9)'; const sc = Math.min(n, Math.round(n * k * 2.2));
        x.fillText(`NEURAL INDEX \u00b7 ${n ? sc + ' / ' + n + ' FACTS' : 'SYNCING'}`, cx, cy + R * 1.32); x.fillText(`SCAN ${String(Math.min(100, Math.round(k * 180))).padStart(3, '0')}%`, cx, cy + R * 1.32 + 15);
        x.textAlign = 'left'; x.fillText('LINKS ' + B.L.length, 14, 24); x.textAlign = 'right'; x.fillText('NODES ' + B.P.length, W - 14, 24); x.globalAlpha = 1; }
      x.textAlign = 'center'; x.font = '12px system-ui, sans-serif'; x.fillStyle = C + '.45)'; x.fillText('Tap to skip', cx, H - 28);
      if (k < 1) raf = requestAnimationFrame(frame); else end(); }
    raf = requestAnimationFrame(frame); }
  window.ofBrIntro = brIntro;
})();
