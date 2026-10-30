// Done list (Admin Hub > Inbox > Done), owners only (Christian and Nate): what the bots finished, live.
// Tables (RLS: owners read, nobody writes from the app; bots write through tools/done.sh -> RPC done_add):
//   done_items   one card per item per local day (America/Denver): item_key, day, title
//   done_changes what changed inside that card, in time order: at, asked_by (Christian | Nate), bot_name, agent_id, change
// Live: a Supabase realtime channel on BOTH tables (no polling) opens when the tab opens and is removed when you leave it (gpNavAfter runs after every screen change).
(function () {
  const D = window.DONE = { items: null, busy: false, ch: null, live: false, fa: 'All', fb: 'All', fresh: {}, err: '', seq: 0 };
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const own = () => typeof isOwner === 'function' && isOwner();
  const here = () => typeof page === 'function' && page() === 'done';
  const TZ = 'America/Denver';
  const ymd = d => d.toLocaleDateString('en-CA', { timeZone: TZ });
  const dayLabel = s => { const today = ymd(new Date()), yest = ymd(new Date(Date.now() - 864e5));
    const nice = new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return s === today ? 'Today \u00b7 ' + nice : s === yest ? 'Yesterday \u00b7 ' + nice : nice; };
  const time = t => new Date(t).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  const byChange = (a, b) => new Date(a.at) - new Date(b.at) || a.id - b.id;
  const byItem = (a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : new Date(b.updated_at) - new Date(a.updated_at) || b.id - a.id);
  const norm = r => ({ ...r, done_changes: (r.done_changes || []).slice().sort(byChange) });
  function put(row) { // insert or refresh an item (keeps the changes we already hold)
    const L = D.items || (D.items = []), i = L.findIndex(x => x.id === row.id);
    if (i < 0) L.push({ ...row, done_changes: row.done_changes ? row.done_changes.slice().sort(byChange) : [] });
    else L[i] = { ...L[i], ...row, done_changes: row.done_changes ? row.done_changes.slice().sort(byChange) : L[i].done_changes };
    L.sort(byItem); return L.find(x => x.id === row.id);
  }
  function flash(id) { D.fresh[id] = true; clearTimeout(flash['t' + id]); flash['t' + id] = setTimeout(() => { delete D.fresh[id]; document.querySelector(`.dn-item[data-item="${id}"]`)?.classList.remove('dn-new'); }, 7000); }
  async function load() {
    if (!window.gpSb || !own() || D.busy) return; D.busy = true; const seq = ++D.seq;
    try { const { data, error } = await gpSb.from('done_items').select('*, done_changes(*)').order('day', { ascending: false }).order('updated_at', { ascending: false }).limit(300);
      if (seq !== D.seq) return;
      if (error) { D.items = D.items || []; D.err = 'Could not load the Done list.'; window.gpReportError && gpReportError(error, { op: 'done_items' }); } else { D.items = (data || []).map(norm).sort(byItem); D.err = ''; } }
    finally { D.busy = false; } repaint(true);
  }
  async function fetchOne(id) {
    if (!window.gpSb) return; const { data, error } = await gpSb.from('done_items').select('*, done_changes(*)').eq('id', id).maybeSingle();
    if (error || !data) return; put(norm(data)); flash(id); repaint(); }
  function onItem(p) { const r = p && p.new; if (!r || !r.id) return; const had = (D.items || []).some(x => x.id === r.id); put(r); flash(r.id); if (!had) fetchOne(r.id); repaint(); }
  function onChange(p) { const c = p && p.new; if (!c || !c.id) return; const it = (D.items || []).find(x => x.id === c.item_id);
    if (!it) { fetchOne(c.item_id); return; }
    if (!it.done_changes.some(x => x.id === c.id)) { it.done_changes.push(c); it.done_changes.sort(byChange); }
    it.updated_at = c.at || it.updated_at; D.items.sort(byItem); flash(it.id); repaint(); }
  function sub() {
    if (D.ch || !window.gpSb || !gpSb.channel || !own()) return;
    D.ch = gpSb.channel('done-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'done_items' }, onItem)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'done_changes' }, onChange)
      .subscribe(st => { const ok = st === 'SUBSCRIBED'; if (ok !== D.live) { D.live = ok; const b = document.getElementById('dn-live'); if (b) { b.className = 'dn-live' + (ok ? ' on' : ''); b.textContent = ok ? '\u25cf Live' : 'Connecting\u2026'; } } });
  }
  function unsub() { if (D.ch && window.gpSb) { try { gpSb.removeChannel(D.ch); } catch (_) {} } D.ch = null; D.live = false; }
  window.doneUnsub = unsub;
  // leave-tab cleanup: simplify.js sets gpNavAfter (runs after every screen render); wrap it
  const prev = window.gpNavAfter;
  window.gpNavAfter = function () { const r = prev && prev.apply(this, arguments); if (!here() && D.ch) unsub(); return r; };
  const matches = c => (D.fa === 'All' || c.asked_by === D.fa) && (D.fb === 'All' || c.bot_name === D.fb);
  const bots = () => [...new Set((D.items || []).flatMap(i => i.done_changes.map(c => c.bot_name)))].sort((a, b) => a.localeCompare(b));
  function card(it, chs) {
    return `<div class="dn-item${D.fresh[it.id] ? ' dn-new' : ''}" data-item="${e(it.id)}" data-key="${e(it.item_key)}"><div class="dn-top"><b class="dn-t">${e(it.title)}</b><span class="muted dn-n">${chs.length} ${chs.length === 1 ? 'change' : 'changes'}</span></div>
      <ol class="dn-ch">${chs.map(c => `<li data-ch="${e(c.id)}"><span class="dn-tm">${e(time(c.at))}</span><span class="dn-meta"><span class="dn-who dn-who-${e(String(c.asked_by).toLowerCase())}">${e(c.asked_by)}</span> \u00b7 ${e(c.bot_name)}</span><span class="dn-tx">${e(c.change)}</span></li>`).join('')}</ol></div>`;
  }
  function listHTML() {
    if (D.items == null) return '<p class="muted">Loading\u2026</p>';
    const groups = []; let any = false;
    D.items.forEach(it => { const chs = it.done_changes.filter(matches); if (!chs.length) return; any = true; let g = groups[groups.length - 1]; if (!g || g.day !== it.day) groups.push(g = { day: it.day, html: [] }); g.html.push(card(it, chs)); });
    if (!any) return `<p class="muted">${D.items.length ? 'Nothing matches this filter.' : 'Nothing done yet. New items show up here as soon as a bot records them.'}</p>`;
    return groups.map(g => `<h3 class="dn-day" data-day="${e(g.day)}">${e(dayLabel(g.day))}</h3>${g.html.join('')}`).join('');
  }
  const botOpts = () => ['All'].concat(bots()).map(b => `<option value="${e(b)}"${D.fb === b ? ' selected' : ''}>${b === 'All' ? 'All bots' : e(b)}</option>`).join('');
  function repaint(all) { if (!here()) return; const l = document.getElementById('dn-list'); if (!l) return; l.innerHTML = listHTML(); const s = document.getElementById('dn-bot'); if (s) s.innerHTML = botOpts();
    const er = document.getElementById('dn-err'); if (er) er.textContent = D.err; }
  window.doneFilter = (k, v) => { if (k === 'a') D.fa = v; else D.fb = v; document.querySelectorAll('#dn-root [data-a]').forEach(b => b.classList.toggle('on', b.dataset.a === D.fa)); repaint(); };
  window.donePage = function () {
    if (!own()) return '<div class="card"><h2>Done</h2><p class="muted">Owners only.</p></div>';
    if (!D.ch) { setTimeout(() => { sub(); load(); }, 0); }   // opening the tab: subscribe, then (re)load once
    return `<div class="card" id="dn-root"><div class="uf-top"><h2>Done</h2><span id="dn-live" class="dn-live${D.live ? ' on' : ''}">${D.live ? '\u25cf Live' : 'Connecting\u2026'}</span></div>
      <p class="muted">What the bots finished, newest first. One card per item per day; every change is listed inside.</p>
      <div class="of-tabs dn-chips" role="group" aria-label="Filter by who asked">${['All', 'Christian', 'Nate'].map(a => `<button type="button" data-a="${a}" class="${D.fa === a ? 'on' : ''}" onclick="doneFilter('a','${a}')">${a === 'All' ? 'Everyone' : a}</button>`).join('')}</div>
      <label class="dn-bl"><span class="muted">Bot</span><select id="dn-bot" aria-label="Filter by bot" onchange="doneFilter('b',this.value)">${botOpts()}</select></label>
      <p id="dn-err" class="wc-flag neg">${e(D.err)}</p>
      <div id="dn-list">${listHTML()}</div></div>`;
  };
})();
