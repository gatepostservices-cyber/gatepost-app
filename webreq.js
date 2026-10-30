// Web requests (Admin Hub > Inbox > Web): quote requests that come in from the public website through the RPC submit_web_request (docs/web-requests.md).
// Table web_requests: admins/owners (is_admin()) read every row and update ONLY status, owner and notes (RLS + column grant); nobody else can read or write it.
(function () {
  const R = window.WR = { list: null, at: 0, busy: false, filter: 'All', open: null, dd: {}, msg: '', err: '' };
  const STATUS = ['new', 'contacted', 'quoted', 'won', 'lost'], NAME = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', won: 'Won', lost: 'Lost' };
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const adm = () => typeof isAdmin === 'function' && isAdmin();
  const here = () => typeof page === 'function' && page() === 'webreq';
  const repaint = () => { if (here() && typeof render === 'function') render(); };
  const when = t => new Date(t).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const digits = p => String(p || '').replace(/[^0-9+]/g, '');
  const badge = s => `<span class="badge wr-st wr-st-${e(s)}">${e(NAME[s] || s)}</span>`;
  const safeUrl = u => /^https?:\/\/\S+$/i.test(String(u || '')) ? u : '';
  async function load(force) {
    if (!window.gpSb || !adm() || R.busy || (!force && R.list && Date.now() - R.at < 20000)) return; R.busy = true;
    try { const { data, error } = await gpSb.from('web_requests').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) { R.list = R.list || []; R.err = 'Could not load web requests.'; window.gpReportError && gpReportError(error, { op: 'web_requests' }); } else { R.list = data || []; R.err = ''; } R.at = Date.now(); }
    finally { R.busy = false; } repaint(); paintSheet();
  }
  const get = id => (R.list || []).find(x => x.id === id);
  window.wrFilter = f => { R.filter = f; repaint(); };
  window.wrRefresh = () => load(true);
  function card(r) {
    const sub = [r.service, r.address].filter(Boolean).join(' \u00b7 ');
    return `<button type="button" class="wr-item" data-wr="${e(r.id)}" onclick="wrOpen('${e(r.id)}')"><span class="wr-h"><b>${e(r.name)}</b>${badge(r.status)}</span>
      ${sub ? `<span class="wr-s">${e(sub)}</span>` : ''}${r.details ? `<span class="wr-d">${e(r.details)}</span>` : ''}
      <span class="wr-f"><span class="muted">${e(when(r.created_at))}${r.owner ? ' \u00b7 ' + e(r.owner) : ''}</span><span class="wr-go" aria-hidden="true">\u203a</span></span></button>`;
  }
  window.webreqPage = function () {
    if (!adm()) return '<div class="card"><h2>Web requests</h2><p class="muted">Admins only.</p></div>';
    load();
    const L = R.list, cnt = s => L ? L.filter(x => x.status === s).length : 0, shown = L ? (R.filter === 'All' ? L : L.filter(x => x.status === R.filter)) : [];
    return `<div class="card" id="wr-root"><div class="uf-top"><h2>Web requests</h2><button type="button" class="secondary q-sm" onclick="wrRefresh()">Refresh</button></div>
      <p class="muted">Quote requests sent from the website, newest first.${L ? ` <b>${cnt('new')}</b> new.` : ''}</p>
      <div class="of-tabs wr-chips" role="group" aria-label="Filter by status">${['All'].concat(STATUS).map(s => `<button type="button" class="${R.filter === s ? 'on' : ''}" data-f="${s}" onclick="wrFilter('${s}')">${s === 'All' ? 'All ' + (L ? L.length : 0) : e(NAME[s]) + ' ' + cnt(s)}</button>`).join('')}</div>
      ${R.err ? `<p class="wc-flag neg">${e(R.err)}</p>` : ''}
      <div id="wr-list">${L == null ? '<p class="muted">Loading\u2026</p>' : shown.length ? shown.map(card).join('') : `<p class="muted">${L.length ? 'No requests with this status.' : 'No web requests yet.'}</p>`}</div></div>`;
  };
  // ---- detail sheet ----
  window.wrClose = () => { R.open = null; R.dd = {}; R.msg = ''; document.getElementById('wr-sheet')?.remove(); document.body.classList.remove('sheet-open'); };
  window.wrOpen = id => { if (!get(id)) return; R.open = id; R.dd = {}; R.msg = ''; paintSheet(true); };
  window.wrDraft = (k, v) => { R.dd[k] = v; };
  window.wrSave = async () => {
    const r = get(R.open); if (!r || !window.gpSb) return; const d = R.dd;
    const upd = { status: d.status !== undefined ? d.status : r.status, owner: (d.owner !== undefined ? d.owner : (r.owner || '')).trim() || null, notes: (d.notes !== undefined ? d.notes : (r.notes || '')).trim() || null };
    if (!STATUS.includes(upd.status)) { R.msg = 'Pick a valid status.'; return paintSheet(); }
    if (upd.owner && upd.owner.length > 60) { R.msg = 'Owner is too long (60 max).'; return paintSheet(); }
    if (upd.notes && upd.notes.length > 4000) { R.msg = 'Notes are too long (4000 max).'; return paintSheet(); }
    const b = document.getElementById('wr-save'); if (b) b.disabled = true;
    const { data, error } = await gpSb.from('web_requests').update(upd).eq('id', r.id).select('id,status,owner,notes,updated_at');
    if (b) b.disabled = false;
    if (error || !data || !data.length) { R.msg = 'Not saved. ' + (error ? error.message : 'No access.'); return paintSheet(); }
    Object.assign(r, data[0]); R.dd = {}; R.msg = 'Saved.'; paintSheet(); repaint();
  };
  function paintSheet(animate) {
    const prev = document.getElementById('wr-sheet'), scroll = (animate ? 0 : prev?.querySelector('.sheet-body')?.scrollTop) || 0; prev?.remove();
    const r = R.open && get(R.open); if (!r) { if (prev) document.body.classList.remove('sheet-open'); return; }
    document.body.classList.add('sheet-open');
    const d = R.dd, st = d.status !== undefined ? d.status : r.status, ow = d.owner !== undefined ? d.owner : (r.owner || ''), nt = d.notes !== undefined ? d.notes : (r.notes || '');
    const photos = (Array.isArray(r.photos) ? r.photos : []).filter(safeUrl);
    const rows = [['Service', r.service], ['Design', r.design], ['Address / area', [r.address, r.zip].filter(Boolean).join(' ')], ['Received', when(r.created_at)], ['Page', r.source_page]].filter(([, v]) => v);
    const el = document.createElement('div'); el.id = 'wr-sheet'; el.className = 'sheet wr-sheet' + (animate ? ' anim' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Web request');
    el.innerHTML = `<div class="sheet-head"><button class="sheet-back" type="button" onclick="wrClose()" aria-label="Back to web requests">\u2039 Web requests</button><span>${badge(r.status)}</span></div>
      <div class="sheet-body"><h2 class="sheet-title">${e(r.name)}</h2>
        <div class="wr-contact">${r.phone ? `<a class="wr-call" href="tel:${e(digits(r.phone))}">Call ${e(r.phone)}</a>` : ''}${r.email ? `<a class="wr-mail" href="mailto:${e(r.email)}">Email ${e(r.email)}</a>` : ''}</div>
        ${R.msg ? `<div class="muted q-rt" id="wr-msg" aria-live="polite">${e(R.msg)}</div>` : '<div id="wr-msg" class="muted q-rt" aria-live="polite"></div>'}
        <dl class="facts wr-dl">${rows.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')}</dl>
        ${r.details ? `<h3>Details</h3><p class="sheet-text">${e(r.details)}</p>` : ''}
        ${photos.length ? `<h3>Photos</h3><div class="links">${photos.map((u, i) => `<a href="${e(u)}" target="_blank" rel="noopener noreferrer">Photo ${i + 1}</a>`).join('')}</div>` : ''}
        <h3>Status</h3><select id="wr-st" aria-label="Status" onchange="wrDraft('status',this.value)">${STATUS.map(s => `<option value="${s}"${st === s ? ' selected' : ''}>${e(NAME[s])}</option>`).join('')}</select>
        <h3>Owner</h3><input id="wr-ow" type="text" maxlength="60" autocomplete="off" placeholder="Who is handling it" value="${e(ow)}" oninput="wrDraft('owner',this.value)">
        <h3>Notes</h3><textarea id="wr-nt" rows="5" maxlength="4000" placeholder="Calls, quote sent, next step" oninput="wrDraft('notes',this.value)">${e(nt)}</textarea></div>
      <div class="sheet-actions"><button type="button" class="secondary" onclick="wrClose()">Close</button><button type="button" class="primary" id="wr-save" onclick="wrSave()">Save</button></div>`;
    const nav = document.getElementById('sec-nav'); if (nav && !nav.classList.contains('hidden')) el.style.setProperty('bottom', nav.getBoundingClientRect().height + 'px', 'important');
    document.body.appendChild(el);
    if (scroll) el.querySelector('.sheet-body').scrollTop = scroll;
  }
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && R.open) wrClose(); });
  document.addEventListener('click', ev => { if (R.open && ev.target.closest && ev.target.closest('#main-nav, #sec-nav')) wrClose(); }, true);
})();
