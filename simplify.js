// Gatepost Admin simplified navigation (5 sections + sub-tabs), Today start screen, Inbox (with Approvals) and Reports.
// Sections regroup the existing screens; every old screen keeps its page id (hash links still work). Role gating comes from the
// hidden #main-nav buttons (data-admin / data-owner), exactly as before.
(function () {
  const G = window.GP2 = { last: {}, d: {}, at: {}, busy: {}, edit: null, open: {}, test: null };
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = d => d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const dateOnly = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const money = n => n == null || n === '' || isNaN(Number(n)) ? '—' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const own = () => typeof isOwner === 'function' && isOwner(), adm = () => typeof isAdmin === 'function' && isAdmin();
  const SECTIONS = [
    ['today', 'Today', [['town', 'Today'], ['dashboard', 'Hub']]],
    ['sales', 'Sales', [['quotes', 'Quotes'], ['estimate', 'Estimate'], ['leads', 'Leads']]],
    ['schedule', 'Schedule', [['calendar', 'Calendar'], ['joblog', 'Job Log']]],
    ['inbox', 'Inbox', [['inbox', 'All'], ['requests', 'Requests'], ['unfinished', 'Unfinished']]],
    ['office', 'Office', [['office', 'Office'], ['admin', 'Team'], ['ask', 'AI']]]];
  const pageOK = pg => { const b = document.querySelector(`#main-nav button[data-page="${pg}"]`); return !!b && !b.classList.contains('hidden'); };
  const secOf = pg => (SECTIONS.find(s => s[2].some(t => t[0] === pg)) || SECTIONS[0])[0];
  const visTabs = s => s[2].filter(t => pageOK(t[0]));
  window.gpGo = pg => { if (window.townGo) townGo(pg); else document.querySelector(`#main-nav button[data-page="${pg}"]`)?.click(); };
  window.gpSection = k => { const s = SECTIONS.find(x => x[0] === k), tabs = visTabs(s); if (!tabs.length) return;
    const pg = tabs.some(t => t[0] === G.last[k]) ? G.last[k] : tabs[0][0]; gpGo(pg); };

  // ----- data (admin-only RLS; owners and admins read)
  const Q = { drafts: () => gpSb.from('followup_drafts').select('*').order('due_at', { ascending: true, nullsFirst: false }).limit(200),
    reports: () => gpSb.from('reports').select('*').order('created_at', { ascending: false }).limit(60) };
  async function load(k, force) {
    if (G.test) { G.d[k] = G.test[k] || []; return; }
    if (!window.gpSb || !adm() || G.busy[k] || (!force && G.d[k] && Date.now() - (G.at[k] || 0) < 20000)) return;
    G.busy[k] = 1; try { const { data, error } = await Q[k](); if (error) { G.d[k] = G.d[k] || []; window.gpReportError && gpReportError(error, { op: 'gp2 ' + k }); } else G.d[k] = data || []; G.at[k] = Date.now(); }
    finally { G.busy[k] = 0; } if (['town', 'inbox'].includes(page())) render(); else paintNav(); }
  window.gpLoadTestData = t => { G.test = t; G.d = {}; Object.keys(Q).forEach(k => G.d[k] = t[k] || []); render(); };
  const pendDrafts = () => (G.d.drafts || []).filter(d => d.status === 'pending');
  const pendReqs = () => ((typeof S !== 'undefined' && S.requests) || []).filter(r => r.status === 'pending');
  const openUF = () => (window.UF && UF.list || []).filter(x => x.status === 'open');
  const ufOK = () => typeof S !== 'undefined' && S.me && S.me.role === 'admin';
  const inboxCount = () => !adm() ? 0 : pendReqs().length + (ufOK() ? openUF().length : 0) + (own() ? pendDrafts().length : 0);
  window.gpInboxCount = inboxCount;

  // ----- section bar + sub-tabs
  function paintNav() {
    const nav = document.getElementById('sec-nav'), sub = document.getElementById('sub-nav'), main = document.getElementById('main-nav');
    if (!nav || !sub) return;
    if (!main || main.classList.contains('hidden')) { nav.classList.add('hidden'); sub.innerHTML = ''; return; }
    const pg = page(), cur = secOf(pg); G.last[cur] = pg;
    const n = inboxCount();
    nav.innerHTML = SECTIONS.filter(s => visTabs(s).length).map(s => `<button type="button" data-sec="${s[0]}" class="${s[0] === cur ? 'on' : ''}" onclick="gpSection('${s[0]}')" aria-current="${s[0] === cur ? 'page' : 'false'}">${s[1]}${s[0] === 'inbox' && n ? ` <span class="sec-n">${n}</span>` : ''}</button>`).join('');
    nav.classList.remove('hidden');
    const s = SECTIONS.find(x => x[0] === cur), tabs = visTabs(s);
    const extra = cur === 'today' && adm() ? `${window.openHQ ? '<button type="button" data-sub="hq" onclick="openHQ()">HQ</button>' : ''}${window.openDock ? '<button type="button" data-sub="dock" onclick="openDock()">Dock</button>' : ''}` : '';
    sub.innerHTML = tabs.length > 1 || extra ? `<div class="sub-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-sub="${k}" class="${k === pg ? 'on' : ''}" onclick="gpGo('${k}')">${l}${k === 'requests' && pendReqs().length ? ` <span class="sec-n">${pendReqs().length}</span>` : ''}</button>`).join('')}${extra}</div>` : '';
  }
  window.gpNavAfter = () => { paintNav(); if (adm()) { load('drafts'); if (['town'].includes(page())) load('reports'); if (window.ufLoad && ufOK()) ufLoad(); } };

  // ----- Today
  const stat = (n, label, pg) => `<button type="button" class="t-stat${n ? ' hot' : ''}" onclick="gpGo('${pg}')"><b>${n}</b><span>${label}</span></button>`;
  window.todayPage = function () {
    const name = S.me && S.me.email ? e(S.me.email.split('@')[0]) : '';
    const counts = adm() ? `<div class="t-stats">${stat(pendReqs().length, 'Requests', 'requests')}${own() ? stat(pendDrafts().length, 'Approvals', 'inbox') : ''}${ufOK() ? stat(openUF().length, 'Unfinished', 'unfinished') : ''}${stat(window.townWaitingCount ? townWaitingCount() : 0, 'Waiting on you', 'inbox')}</div>` : '';
    const bots = adm() && window.townBotList ? townBotList().map(bt => `<button type="button" class="tile tile-bot" data-bot="${bt.i}" onclick="openBot(${bt.i})">${window.botAva ? botAva(bt, 'tile-ava') : ''}<b>${e(bt.short)}${bt.unread ? ` <span class="tile-n">${bt.unread}</span>` : ''}</b><span>${e(bt.role)}</span></button>`).join('') : '';
    const desks = bots + (adm() && window.openHQ ? `<button type="button" class="tile tile-bot" data-tile="hq" onclick="openHQ()"><b>HQ</b><span>Full HQ view</span></button>` : '') + (adm() && window.openDock ? `<button type="button" class="tile tile-bot" data-tile="dock" onclick="openDock()"><b>Dock</b><span>What the bots sent out</span></button>` : '');
    return `<section class="home today"><div class="home-hello"><h1>Good to see you${name ? ', ' + name : ''}</h1><p class="muted">Gatepost Property Services · Rio Rancho &amp; Albuquerque</p></div>
      ${counts}${adm() ? reportsCard() : ''}<div class="t-hq">${window.townTodayHTML ? townTodayHTML() : ''}</div>
      ${desks ? `<h2 class="home-h">Bots &amp; desks</h2><div class="tiles">${desks}</div>` : ''}</section>`; };

  // ----- Reports (running list, newest first, expandable)
  const num = v => v == null || v === '' || isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-US');
  function reportBody(r) {
    const d = r.data && typeof r.data === 'object' ? r.data : {}, c = d.counts || {}, $ = d.dollars || {};
    const jt = (Array.isArray(d.by_job_type) ? d.by_job_type : []).filter(j => j && typeof j === 'object' && j.type), pf = (Array.isArray(d.pricing_flags) ? d.pricing_flags : []).filter(f => f && typeof f === 'object' && (f.type || f.reason));
    const names = v => Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : (x && (x.name || x.lead)) || '').filter(Boolean) : [];
    const won = names(d.won || d.won_leads), lost = names(d.lost || d.lost_leads);
    const hasC = ['quoted', 'won', 'lost', 'open'].some(k => c[k] != null);
    return `${r.summary ? `<p class="rp-sum">${e(r.summary)}</p>` : ''}
      ${hasC ? `<div class="rp-counts">${['quoted', 'won', 'lost', 'open'].map(k => `<div class="rp-c ${k}"><b>${num(c[k])}</b><span>${k}</span></div>`).join('')}</div>` : ''}
      ${$.won != null || $.lost != null ? `<div class="rp-usd"><span>Won <b class="ok">${money($.won)}</b></span><span>Lost <b class="bad">${money($.lost)}</b></span></div>` : ''}
      ${jt.length ? `<div class="rp-tw"><table class="rp-t"><thead><tr><th>Job type</th><th>Q</th><th>W</th><th>L</th><th>Won $</th></tr></thead><tbody>${jt.map(j => `<tr><td>${e(j && j.type)}</td><td>${num(j && j.quoted)}</td><td>${num(j && j.won)}</td><td>${num(j && j.lost)}</td><td>${money(j && j.won_usd)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${pf.length ? `<h4>Pricing flags</h4><ul class="rp-flags">${pf.map(f => `<li><span class="rp-dir ${f && f.direction === 'low' ? 'low' : 'high'}">${f && f.direction === 'low' ? '▼ Low' : '▲ High'}</span> <b>${e(f && f.type)}</b>${f && f.reason ? ` · ${e(f.reason)}` : ''}</li>`).join('')}</ul>` : ''}
      ${won.length ? `<p class="rp-names"><b class="ok">Won:</b> ${won.map(e).join(', ')}</p>` : ''}${lost.length ? `<p class="rp-names"><b class="bad">Lost:</b> ${lost.map(e).join(', ')}</p>` : ''}
      <p class="muted rp-meta">Posted by ${e(r.posted_by || 'bot')} · ${e(day(r.created_at))}${r.kind === 'win_loss' ? ' · A quote not won within one week counts as lost.' : ''}</p>`; }
  window.gpRpToggle = id => { G.open[id] = !G.open[id]; const el = document.querySelector(`[data-report="${id}"]`); if (el) el.outerHTML = reportItem((G.d.reports || []).find(r => r.id === id)); };
  const reportItem = r => !r ? '' : `<div class="rp-item${G.open[r.id] ? ' open' : ''}" data-report="${r.id}"><button type="button" class="rp-head" onclick="gpRpToggle(${Number(r.id)})" aria-expanded="${!!G.open[r.id]}"><span><b>${e(r.title || r.kind)}</b><span class="muted">${r.week_ending ? 'Week ending ' + e(dateOnly(r.week_ending)) : e(day(r.created_at))}</span></span><span class="chev">${G.open[r.id] ? '▾' : '›'}</span></button>${G.open[r.id] ? `<div class="rp-body">${reportBody(r)}</div>` : ''}</div>`;
  function reportsCard() { const R = G.d.reports;
    return `<div class="card rp-card" id="reports-card"><h2>Reports</h2>${R == null ? '<p class="muted">Loading…</p>' : R.length ? R.map(reportItem).join('') : '<p class="muted">No reports yet. Marv posts the weekly win/loss here.</p>'}</div>`; }

  // ----- Inbox: one list with per-item actions
  const who = () => (S.me && (S.me.full_name || S.me.name || (S.me.email || '').split('@')[0])) || 'owner';
  const msg = t => { const el = document.getElementById('ib2-msg'); if (el) el.textContent = t; };
  async function decide(id, patch) {
    const d = (G.d.drafts || []).find(x => x.id === id); if (!d || !own()) return;
    const row = Object.assign({ decided_by: who(), decided_at: new Date().toISOString() }, patch);
    if (G.test) { Object.assign(d, row); G.edit = null; render(); msg('Saved (test data)'); return; }
    const { error } = await gpSb.from('followup_drafts').update(row).eq('id', id).eq('status', 'pending'); if (error) return msg('Not saved: ' + error.message);
    G.edit = null; msg(row.status === 'denied' ? 'Denied (kept in history)' : 'Approved. Alabaster sends it on the 6:30 PM run.'); load('drafts', 1); }
  window.gpApprove = id => decide(id, { status: 'approved' });
  window.gpDeny = id => decide(id, { status: 'denied' });
  window.gpEdit = id => { G.edit = id; render(); setTimeout(() => document.getElementById('fd-edit')?.focus(), 0); };
  window.gpEditCancel = () => { G.edit = null; render(); };
  window.gpEditApprove = id => { const v = (document.getElementById('fd-edit') || {}).value || ''; if (!v.trim()) return msg('The message can\u2019t be empty.'); decide(id, { status: 'approved', edited_body: v.trim() }); };
  const CH = { text: 'Text', email: 'Email' };
  function draftItem(d) {
    const body = d.edited_body || d.body, ed = G.edit === d.id;
    return `<div class="ib2-item fd" data-draft="${d.id}"><div class="uf-top"><span><span class="badge">Approval</span> <b>${e(d.customer_name || d.recipient)}</b></span><span class="muted">${d.due_at ? 'due ' + e(day(d.due_at)) : ''}</span></div>
      <div class="muted uf-st">Follow-up day ${e(d.day_offset)} · ${e(CH[d.channel] || d.channel)} to ${e(d.recipient)}${d.quote_ref ? ' · quote ' + e(d.quote_ref) : ''}</div>
      ${ed ? `<textarea id="fd-edit" rows="5" aria-label="Edit message">${e(body)}</textarea><div class="q-actions"><button type="button" class="ok" onclick="gpEditApprove(${d.id})">Save &amp; approve</button><button type="button" class="secondary" onclick="gpEditCancel()">Cancel</button></div>`
        : `<div class="of-body fd-body">${e(body)}</div>${own() ? `<div class="mini-actions"><button type="button" class="ok" onclick="gpApprove(${d.id})">Approve</button><button type="button" class="secondary" onclick="gpEdit(${d.id})">Edit</button><button type="button" class="danger" onclick="gpDeny(${d.id})">Deny</button></div>` : ''}`}</div>`; }
  function reqItem(r) {
    return `<div class="ib2-item"><div class="uf-top"><span><span class="badge">Request</span> <b>${e(((r.title || '').trim() || r.text || '').slice(0, 120))}</b></span><span class="muted">${e(r.from || '')}</span></div>
      ${r.amount || r.when ? `<div class="muted uf-st">${[r.amount, r.when].filter(Boolean).map(e).join(' · ')}</div>` : ''}
      <div class="mini-actions"><button type="button" class="ok" onclick="townDecide(${Number(r.id)},'approved')">Allow</button><button type="button" class="danger" onclick="townDecide(${Number(r.id)},'denied')">Deny</button><button type="button" class="secondary" onclick="openReq(${Number(r.id)})">Open</button></div></div>`; }
  function ufItem(it) {
    return `<div class="ib2-item"><div class="uf-top"><span><span class="badge">Unfinished</span> <b>${e(it.bot_name)}</b></span><span class="muted">${e(day(it.updated_at || it.created_at))}</span></div><div>${e(it.summary)}</div>
      <div class="mini-actions"><button type="button" class="primary" onclick="ufContinue(${Number(it.id)})">Continue</button><button type="button" class="secondary" onclick="ufAbort(${Number(it.id)})">Abort</button></div></div>`; }
  function noteItem(n) {
    return `<div class="ib2-item note"><div class="uf-top"><span><span class="badge">Bot note</span> ${e(n.bot || n.bot_name || '')}</span><span class="muted">${e(day(n.created_at))} · ${n.read_at ? 'read' : 'unread'}</span></div><div>${e(n.text)}</div>
      ${own() ? `<div class="mini-actions"><button type="button" class="secondary" onclick="OF.tab='control';gpGo('office')">Open in Control</button></div>` : ''}</div>`; }
  window.inboxPage = function () {
    if (!adm()) return '<div class="card"><h2>Inbox</h2><p class="muted">Admins only.</p></div>';
    load('drafts'); if (window.ufLoad && ufOK()) ufLoad(); if (own() && window.ofLoad) ofLoad('bot_notes');
    const dr = own() ? pendDrafts() : [], rq = pendReqs(), uf = ufOK() ? openUF() : [], notes = own() && window.OF ? (OF.d.bot_notes || []).filter(n => !n.read_at) : [];
    const done = own() ? (G.d.drafts || []).filter(d => d.status !== 'pending').slice(0, 25) : [];
    const sec = (t, items, f) => items.length ? `<h3 class="ib2-h">${t} <span class="muted">${items.length}</span></h3>${items.map(f).join('')}` : '';
    const total = dr.length + rq.length + uf.length;
    return `<div class="card" id="inbox-root"><h2>Inbox</h2><p class="muted">Everything waiting on you. Nothing here sends on its own: approved follow-ups go out with Alabaster\u2019s 6:30 PM run.</p><div id="ib2-msg" class="muted q-rt" aria-live="polite"></div>
      ${total || notes.length ? '' : '<p class="muted">All clear. Nothing waiting on you.</p>'}
      ${sec('Approvals', dr, draftItem)}${sec('Requests', rq, reqItem)}${sec('Unfinished', uf, ufItem)}${sec('Bot notes (unread)', notes, noteItem)}
      ${done.length ? `<details class="ib2-done"><summary>Decided follow-ups (${done.length})</summary>${done.map(d => `<div class="ib2-item hist"><div class="uf-top"><b>${e(d.customer_name || d.recipient)}</b><span class="of-ost ${e(d.status)}">${e(d.status)}</span></div><div class="muted uf-st">Day ${e(d.day_offset)} · ${e(d.decided_by || '')} ${e(day(d.decided_at))}${d.sent_at ? ' · sent ' + e(day(d.sent_at)) : ''}</div><div class="of-body">${e(d.edited_body || d.body)}</div></div>`).join('')}</details>` : ''}</div>`; };
})();
