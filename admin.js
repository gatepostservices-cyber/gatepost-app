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
    return ks.map(k => `<h3 class="pb-sec">${e(k.replace(/_/g, ' '))} <span class="muted">${G[k].length}</span></h3>` + G[k].map(r => `<div class="of-item br-item"><b>${e(r.title || r.key)}</b>
      <div class="of-body br-val">${e(r.value)}</div><div class="muted uf-st">updated ${e(brDay(r.updated_at))}${r.updated_by ? ' by ' + e(r.updated_by) : ''}</div></div>`).join('')).join(''); };
  function brHTML() {
    return `<div class="card"><h2>Brain</h2><p class="muted">Read-only. The shared facts every bot checks before asking.</p>
      <input id="br-q" type="search" placeholder="Search the brain\u2026" value="${e(O.q)}" oninput="OF.q=this.value;ofBrList()">
      <div id="br-list">${loading('knowledge') || brRows(brF())}</div></div>`; }
  window.ofBrList = () => { const el = document.getElementById('br-list'); if (el) el.innerHTML = brRows(brF()); };
  // Intro: zoom into a robot head; once per session, tap to skip, none with reduced motion.
  function brIntro(force) {
    try { if (!force && (sessionStorage.getItem('gp-br-intro') || matchMedia('(prefers-reduced-motion: reduce)').matches)) return; sessionStorage.setItem('gp-br-intro', '1'); } catch (_) {}
    if (document.getElementById('br-intro')) return;
    const d = document.createElement('div'); d.id = 'br-intro'; d.setAttribute('aria-hidden', 'true');
    d.innerHTML = `<svg class="br-head" viewBox="0 0 200 200"><line x1="100" y1="18" x2="100" y2="40" stroke="#1f3a2b" stroke-width="5"/><circle class="br-ant" cx="100" cy="14" r="8"/>
      <rect x="40" y="40" width="120" height="110" rx="26" fill="#1f3a2b"/><rect x="54" y="56" width="92" height="44" rx="14" fill="#fbf7ee"/>
      <circle class="br-eye" cx="80" cy="78" r="9"/><circle class="br-eye" cx="120" cy="78" r="9"/><rect x="74" y="116" width="52" height="10" rx="5" fill="#fbf7ee"/>
      <rect x="26" y="78" width="14" height="34" rx="6" fill="#1f3a2b"/><rect x="160" y="78" width="14" height="34" rx="6" fill="#1f3a2b"/></svg>
      <svg class="br-net" viewBox="0 0 200 200">${[[100,100,30,40],[100,100,170,50],[100,100,40,160],[100,100,165,165],[100,100,100,10],[30,40,40,160],[170,50,165,165],[100,10,170,50]].map(([a,b,c,f],i) => `<path d="M${a} ${b} L${(a+c)/2} ${b} L${(a+c)/2} ${f} L${c} ${f}" style="animation-delay:${.6+i*.05}s"/>`).join('')}
      ${[[100,100],[30,40],[170,50],[40,160],[165,165],[100,10]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="5"/>`).join('')}</svg><span class="br-skip">Tap to skip</span>`;
    const end = () => { d.classList.add('out'); setTimeout(() => d.remove(), 300); };
    d.onclick = end; document.body.appendChild(d); setTimeout(end, 2100); }
  window.ofBrIntro = brIntro;
})();
