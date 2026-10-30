// Team Hub: the owner-side view of Gatepost Team app data ONLY (no link to, or button that opens, the Team app).
// Reads team_shifts / team_shift_paths / team_members / route_assignments / team_shift_edits (admin RLS). Shift edit/delete/clear-hours and the
// walked-path map reuse the existing Office handlers (admin.js: ofThSave, ofThDel, ofThClear, ofTmMap) so there is one implementation.
// The Team app only reports a shift when a worker clocks out, so a shift in progress is not visible here until then.
(function () {
  const TH = window.TH = { tab: 'today', edits: null, eAt: 0, eBusy: false };
  const OFX = () => window.OF, F = () => window.OF.fmt;
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TABS = [['today', 'Today'], ['hours', 'Hours'], ['routes', 'Routes'], ['maps', 'Maps'], ['log', 'Edit log']];
  const dk = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  const n1 = (v, d = 1) => v == null || v === '' || isNaN(v) ? '\u2014' : Number(v).toFixed(d);
  async function loadEdits(force) {
    if (!window.gpSb || TH.eBusy || (!force && TH.edits && Date.now() - TH.eAt < 20000)) return; TH.eBusy = true;
    try { const { data, error } = await gpSb.from('team_shift_edits').select('id,shift_id,action,edited_by,edited_at,old,new').order('edited_at', { ascending: false }).limit(200);
      if (error) window.gpReportError && gpReportError(error, { op: 'team_shift_edits' }); else TH.edits = data || []; if (error) TH.edits = TH.edits || []; TH.eAt = Date.now(); }
    finally { TH.eBusy = false; } window.thPaint && thPaint(); }
  function loadAll(force) { ['team_shifts', 'team_members', 'route_assignments'].forEach(k => ofLoad(k, force)); if (TH.tab === 'log') loadEdits(force); if (TH.tab === 'routes' || TH.tab === 'maps') OFX().teamRoutes(); }
  window.thTab = k => { TH.tab = k; OFX().map = null; loadAll(); thPaint(); };
  window.thRefresh = () => { loadAll(true); loadEdits(true); };
  window.thPaint = () => { const r = document.getElementById('th-root'); if (!r) return; r.outerHTML = html(); };

  const stat = (b, l, hot) => `<div class="t-stat${hot ? ' hot' : ''}"><b>${b}</b><span>${l}</span></div>`;
  function sums(rows) { const h = rows.reduce((t, r) => t + (+r.hours || 0), 0), mi = rows.reduce((t, r) => t + (+r.miles || 0), 0), hs = rows.reduce((t, r) => t + (+r.houses || 0), 0), est = rows.reduce((t, r) => t + (+r.est_minutes || 0), 0), act = rows.reduce((t, r) => t + (+r.actual_minutes || 0), 0);
    return { mi, n: rows.length, workers: new Set(rows.map(r => r.worker_id)).size, h, hs, hph: h > 0 ? hs / h : null, pace: est > 0 ? act / est : null }; }
  function todayHTML(T) {
    const today = dk(new Date()), wk = Date.now() - 7 * 864e5, A = sums(T.filter(r => dk(r.clock_in) === today)), B = sums(T.filter(r => +new Date(r.clock_in) >= wk)), f = F();
    const recent = T.slice(0, 12).map(r => `<div class="of-item th-ci"><div class="uf-top"><span><b>${e(r.worker_name)}</b></span><span class="muted">${e(f.dOnly(r.clock_in))}</span></div>
      <div class="muted">Clocked in ${e(f.tOnly(r.clock_in))} \u00b7 out ${e(f.tOnly(r.clock_out))} \u00b7 <b>${n1(r.hours, 2)} h</b> \u00b7 ${r.miles == null ? '\u2014' : n1(r.miles, 2) + ' mi'} \u00b7 ${r.houses ?? '\u2014'} houses \u00b7 ${n1(r.houses_per_hour)}/hr \u00b7 pace ${r.pace_ratio == null ? '\u2014' : Number(r.pace_ratio).toFixed(2) + 'x'}</div></div>`).join('');
    return `<div class="card"><h2>Today</h2><div class="t-stats">${stat(A.n, 'Clock-ins today', A.n)}${stat(n1(A.h, 2), 'Hours')}${stat(n1(A.mi, 2), 'Miles')}${stat(A.hs, 'Houses')}${stat(n1(A.hph), 'Houses/hr')}</div>
      <h3>Last 7 days</h3><div class="t-stats">${stat(B.workers, 'Workers')}${stat(n1(B.h, 2), 'Hours')}${stat(B.hs, 'Houses')}${stat(n1(B.hph), 'Houses/hr')}${stat(B.pace == null ? '\u2014' : B.pace.toFixed(2) + 'x', 'Pace')}</div>
      <p class="muted">Pace = actual route time \u00f7 app estimate (under 1.0x is faster than estimate). A shift shows up when the worker clocks out; someone still on the clock appears after they clock out.</p></div>
      <div class="card"><h2>Clock-ins</h2>${recent || '<p class="muted">No shifts yet.</p>'}</div>`; }

  function progress(T, R) {
    const A = OFX().d.route_assignments || [], M = OFX().d.team_members || [], nm = id => (M.find(m => m.user_id === id) || {}).name || 'Worker';
    return R.map(x => { const best = {}; let last = null, shifts = 0;
      T.forEach(r => (Array.isArray(r.sessions) ? r.sessions : []).forEach(s => { if (!(s.route_id === x.slug || (!s.route_id && s.neighborhood === x.name))) return;
        const k = s.session_n || s.session; best[k] = Math.max(best[k] || 0, +s.steps_checked || 0); shifts++; if (!last || r.clock_in > last) last = r.clock_in; }));
      const done = Object.values(best).reduce((t, v) => t + v, 0), tot = +x.total_steps || 0, pct = tot ? Math.min(100, Math.round(done / tot * 100)) : 0;
      return { x, done, tot, pct, sess: Object.keys(best).length, shifts, last, who: A.filter(a => a.route_id === x.slug).map(a => nm(a.user_id)) }; }); }
  function routesHTML(T) {
    const R = OFX().routes; if (!R) return '<div class="card"><h2>Route progress</h2><p class="muted">Loading routes\u2026</p></div>';
    const P = progress(T, R), f = F();
    return `<div class="card"><h2>Route progress</h2><p class="muted">Steps checked on each route (best count per session across shifts) \u00f7 the route's total steps.</p>
      ${P.map(p => `<div class="of-item th-route"><div class="uf-top"><span><b>${e(p.x.name)}</b>${(p.x.round || 1) > 1 ? ` <span class="muted">R${p.x.round}</span>` : ''}</span><span class="muted">${p.pct}%</span></div>
        <div class="th-bar" role="progressbar" aria-valuenow="${p.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p.pct}%"></i></div>
        <div class="muted">${p.done} of ${p.tot} steps \u00b7 ${p.sess} of ${p.x.sessions || '?'} sessions walked${p.last ? ' \u00b7 last ' + e(f.dOnly(p.last)) : ''}<br>Assigned: ${p.who.length ? p.who.map(e).join(', ') : 'nobody'}</div></div>`).join('') || '<p class="muted">No routes.</p>'}</div>`; }
  function mapsHTML(T) {
    const S2 = T.filter(r => r.user_id), o = OFX(), f = F(); o.teamRoutes();
    return `<div class="card"><h2>Walked path vs route</h2><p class="muted">Blue = the path walked while clocked in. Coloured lines = the assigned route. Pick a shift.</p>
      ${S2.length ? `<div class="th-wrap"><table class="of-t th-t"><thead><tr><th>Worker</th><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Miles</th><th></th></tr></thead><tbody>${S2.slice(0, 100).map(r => `<tr><td><b>${e(r.worker_name)}</b></td><td>${e(f.dOnly(r.clock_in))}</td><td>${e(f.tOnly(r.clock_in))}</td><td>${e(f.tOnly(r.clock_out))}</td><td>${n1(r.hours, 2)}</td><td>${r.miles == null ? '\u2014' : n1(r.miles, 2) + ' mi'}</td><td><button type="button" class="secondary q-sm" onclick="ofTmMap('${e(r.id)}')">Map</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No signed-in shifts yet.</p>'}
      <div id="ta-mapwrap" ${o.map ? '' : 'hidden'}><p id="ta-mapcap" class="muted">${e(o.map && o.map.cap || '')}</p><div id="ta-map" class="ta-map"></div></div></div>`; }
  const who = id => { const u = (typeof S !== 'undefined' && S.users || []).find(x => x.id === id); return u && u.email ? u.email.split('@')[0] : 'an owner'; };
  const chg = (o, n, k, fmt) => o && n && o[k] !== n[k] ? `${fmt(o[k])} \u2192 ${fmt(n[k])}` : '';
  function logHTML() {
    if (TH.edits == null) { loadEdits(); return '<div class="card"><h2>Edit log</h2><p class="muted">Loading\u2026</p></div>'; }
    const f = F(), tm = v => v ? f.tOnly(v) : '\u2014';
    const row = x => { const o = x.old || {}, n = x.new || {}, nm = o.worker_name || n.worker_name || 'Worker';
      const d = x.action === 'delete' ? `Deleted ${e(nm)}'s shift on ${e(f.dOnly(o.clock_in))} (${n1(o.hours, 2)} h)` : `Edited ${e(nm)}'s shift on ${e(f.dOnly(o.clock_in))}: ` + ([chg(o, n, 'clock_in', tm) && 'in ' + chg(o, n, 'clock_in', tm), chg(o, n, 'clock_out', tm) && 'out ' + chg(o, n, 'clock_out', tm), chg(o, n, 'hours', v => n1(v, 2)) && 'hours ' + chg(o, n, 'hours', v => n1(v, 2))].filter(Boolean).join(', ') || 'no time change');
      return `<div class="of-item th-log"><div class="uf-top"><span><span class="badge ${x.action === 'delete' ? 'denied' : 'pending'}">${x.action === 'delete' ? 'Deleted' : 'Edited'}</span> ${e(who(x.edited_by))}</span><span class="muted">${e(f.day(x.edited_at))}</span></div><div>${d}</div></div>`; };
    return `<div class="card"><div class="uf-top"><h2>Edit log</h2><button type="button" class="secondary q-sm" onclick="thRefresh()">Refresh</button></div>
      <p class="muted">Every shift edit, delete, and clear-hours is recorded here automatically (table team_shift_edits). Read only.</p>${TH.edits.length ? TH.edits.map(row).join('') : '<p class="muted">No edits yet.</p>'}</div>`; }
  function html() {
    if (!window.OF || !OFX().fmt) return '<div class="card" id="th-root"><p class="muted">Loading\u2026</p></div>';
    const o = OFX(), T = o.d.team_shifts; setTimeout(() => loadAll(), 0);
    if (TH.tab === 'maps' && o.map && o.map.data) setTimeout(() => o.drawMap(), 0);
    let body;
    if (T == null) body = '<div class="card"><p class="muted">Loading\u2026</p></div>';
    else body = TH.tab === 'today' ? todayHTML(T) : TH.tab === 'hours' ? o.hoursHTML() : TH.tab === 'routes' ? routesHTML(T) : TH.tab === 'maps' ? mapsHTML(T) : logHTML();
    return `<div id="th-root"><div class="of-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" class="${TH.tab === k ? 'on' : ''}" onclick="thTab('${k}')">${n}</button>`).join('')}</div>
      <div id="of-msg" class="muted q-rt" aria-live="polite"></div>${body}</div>`; }
  hubRegister({ id: 'teamhub', name: 'Team Hub', desc: 'Clock-ins, hours, routes, walked paths and pace', page: 'teamhub', pages: ['teamhub'], visible: () => typeof isOwner === 'function' && isOwner(), render: html });
})();
