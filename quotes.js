// Gatepost Quotes tab (admin only). Forms + math from quotes-engine.js (verbatim from the tested bid forms).
// Saves quote JSON + PDF to Supabase (table public.quotes, private bucket "quotes"). OneDrive and email are not set up yet.
(function () {
  const QE = window.QuotesEngine, PHONE = '(505) 750-3019';
  const BASE = document.currentScript ? new URL('.', document.currentScript.src).href : ''; // so the public sign/ page can reuse the PDF builder
  const ORDER = ['handyman', 'yard', 'junk', 'tree', 'pool', 'garage', 'moving', 'gutters', 'custom'];
  const money = n => '$' + (+n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const Q = window.QS = { view: 'list', k: null, v: null, c: null, list: null, busy: false, saved: null };
  const blankV = k => ({ items: k === 'custom' ? { c: [{ d: '', q: '', p: '' }] } : {}, mat: '', cont: '0', fuel: '20', miles: '', dump: 'none', tons: '', dump2: 'none', tons2: '', grt: 'rrs' });
  const blankC = () => ({ name: '', addr: '', city: 'Rio Rancho, NM', phone: '', email: '', date: today(), by: '', scope: '' });
  function hasPending(k, v) { const f = QE.FORMS[k]; if (f.pending) return calcOf(k, v).lines.length > 0; return f.items.some(d => d.pending && +(v.items[d.id] || 0) > 0); }
  function calcOf(k, v) { return QE.calc(k, v); }
  function get(path) { return path.split('.').reduce((o, p) => o == null ? o : o[p], Q); }
  function set(path, val) { const ps = path.split('.'), last = ps.pop(); let o = Q; ps.forEach(p => { if (o[p] == null || typeof o[p] !== 'object') o[p] = /^\d+$/.test(p) ? {} : {}; o = o[p]; }); o[last] = val; }

  // ---------- inputs ----------
  const inp = (path, attrs = '') => `<input data-q="${path}" value="${e(get(path) ?? '')}" ${attrs}>`;
  const num = (path, attrs = '') => inp(path, `type="number" inputmode="decimal" min="0" step="any" ${attrs}`);
  const sel = (path, opts) => `<select data-q="${path}">${opts.map(([v, l]) => `<option value="${e(v)}"${String(get(path) ?? '') === String(v) ? ' selected' : ''}>${e(l)}</option>`).join('')}</select>`;
  function itemRow(d) {
    const p = 'v.items.' + d.id; let h = `<div class="q-row${d.pending ? ' q-pend' : ''}"><label>${e(d.l)}${d.rate ? ` <span class="q-rt">$${d.rate}/${e(d.u)}</span>` : ''}</label>`;
    if (!d.type) h += num(p);
    else if (d.type === 'range') h += sel(p + '.k', Object.keys(d.opts).map(k => [k, d.opts[k][0]])) + `<div class="q-inl">Price $${num(p + '.p')}</div>`;
    else if (d.type === 'monthly') h += `<div class="q-inl">$/month ${num(p + '.p', 'placeholder="85"')} Months ${num(p + '.n')}</div>`;
    else if (d.type === 'dirt') h += num(p) + ' <span class="q-rt">$200 up to 2 yd, then $100/yd</span>';
    else if (d.type === 'pick') h += sel(p, Object.keys(d.opts).map(k => [k, d.opts[k][0] + (d.opts[k][1] ? ' - $' + d.opts[k][1] : '')]));
    else if (d.type === 'per') h += `<div class="q-inl">Trees ${num(p + '.n')} $ each ${num(p + '.p', `placeholder="${d.lo}-${d.hi}"`)}</div><span class="q-rt">$${d.lo}-${d.hi} each</span>`;
    else if (d.type === 'floor') h += '$' + num(p, 'placeholder="300+"');
    else if (d.type === 'gutter') h += sel(p + '.s', [['', '--'], ['1', 'One story - $140 flat'], ['2', 'Two story - $250 up to 175 ft, +$1.40/ft']]) + `<div class="q-inl">Feet ${num(p + '.ft')}</div>`;
    else if (d.type === 'custom') h += (Q.v.items.c || []).map((c, i) => `<div class="q-cl">${inp(`v.items.c.${i}.d`, 'placeholder="Description"')} qty ${num(`v.items.c.${i}.q`)} × $${num(`v.items.c.${i}.p`)}</div>`).join('') + `<button type="button" class="secondary q-sm" onclick="qAddLine()">+ Add line</button>`;
    return h + '</div>';
  }
  // Normalize state into the shape calc() expects (same as the original form's upd()).
  function vals() { const v = JSON.parse(JSON.stringify(Q.v)); const f = QE.FORMS[Q.k];
    f.items.forEach(d => { const x = v.items[d.id]; if (d.type === 'monthly' || d.type === 'per') { if (x) x.n = +x.n || 0; } else if (d.type === 'gutter') { if (x) x.s = +x.s || 0; } else if (d.type === 'custom') { v.items.c = (x || []).map(c => ({ d: c.d || 'Item', q: c.q, p: c.p })); } });
    return v; }

  // ---------- summary (customer-facing preview) ----------
  function summary() { const r = calcOf(Q.k, vals()), pend = hasPending(Q.k, vals());
    return `${pend ? '<div class="q-warnb">PENDING PRICES - NOT FINAL. Needs Christian\u2019s OK before this goes to a customer.</div>' : ''}
      <div class="q-tbl"><table class="q-inv"><tr><th>Item</th><th class="n">Amount</th></tr>${r.lines.map(l => `<tr><td>${e(l.l)}</td><td class="n">${money(l.a)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">Enter quantities above.</td></tr>'}
      <tr class="b"><td>Subtotal</td><td class="n">${money(r.subtotal)}</td></tr><tr><td>NM Gross Receipts Tax - ${e(r.grtLabel)} (${r.grtRate}%)</td><td class="n">${money(r.tax)}</td></tr>
      <tr class="tot"><td>TOTAL</td><td class="n">${money(r.total)}</td></tr></table></div>
      ${r.warn.length ? `<ul class="q-w">${r.warn.map(w => `<li>${e(w)}</li>`).join('')}</ul>` : ''}`; }

  // ---------- pages ----------
  window.quotesPage = function () {
    if (!(typeof S !== 'undefined' && S.me && S.me.role === 'admin')) return '<div class="card" id="quotes-root"><h2>Quotes</h2><p class="muted">Admins only.</p></div>';
    if (Q.view === 'form' && Q.k) return formPage();
    if (Q.list === null && !Q.busy) setTimeout(loadList, 0);
    return `<div id="quotes-root"><div class="card"><h2>Quotes</h2><p class="muted">Pick a service to build a quote. The math matches the approved bid forms.</p>
      <div class="q-menu">${ORDER.map(k => `<button class="secondary" onclick="qOpen('${k}')">${e(QE.FORMS[k].t)}${QE.FORMS[k].pending ? ' <span class="q-tag">PENDING</span>' : ''}</button>`).join('')}</div></div>
      <div class="card"><h2>Saved quotes</h2><div id="q-list">${listHTML()}</div></div></div>`;
  };
  function formPage() { const f = QE.FORMS[Q.k], c = 'c.';
    return `<div id="quotes-root"><div class="card q-form">
      <button class="secondary q-sm" onclick="qBack()">\u2190 All quotes</button>
      <h2 style="margin-top:10px">${e(f.t)}</h2>${f.pending ? '<div class="q-warnb">PENDING PRICES - NOT FINAL. Christian does these personally. Do not quote without Christian\u2019s OK.</div>' : ''}
      <fieldset><legend>Customer</legend><div class="q-grid">
        <label>Client ${inp(c + 'name')}</label><label>Address ${inp(c + 'addr')}</label><label>City / ZIP ${inp(c + 'city')}</label>
        <label>Phone ${inp(c + 'phone', 'type="tel" inputmode="tel"')}</label><label>Email ${inp(c + 'email', 'type="email"')}</label>
        <label>Date walked ${inp(c + 'date', 'type="date"')}</label><label>Prepared by ${inp(c + 'by')}</label></div>
        <label>Scope of work <textarea data-q="c.scope" rows="3" placeholder="Describe the work we walked">${e(Q.c.scope)}</textarea></label></fieldset>
      <details class="q-guide" open><summary>How to price this (on screen only - never printed)</summary><ol>${f.guide.map(g => `<li>${e(g)}</li>`).join('')}</ol><p class="q-own">${e(QE.OWNER_NOTE)}</p></details>
      <fieldset><legend>Work included</legend>${f.items.map(itemRow).join('')}</fieldset>
      <fieldset><legend>Materials, contingency, travel, dump</legend>
        <div class="q-row"><label>Materials - what YOU pay $ <span class="q-rt">+20% markup, +10% waste auto</span></label>${num('v.mat')}</div>
        <div class="q-row"><label>Contingency (fixed bid, site NOT seen in person)</label>${sel('v.cont', [['0', 'None - site seen / hourly'], ['5', '5%'], ['7.5', '7.5%'], ['10', '10%']])}</div>
        <div class="q-row"><label>Fuel / trip $ <span class="q-rt">$15-25 per job</span></label>${num('v.fuel')}</div>
        <div class="q-row"><label>Miles OUTSIDE service area <span class="q-rt">$0.76/mi</span></label>${num('v.miles')}</div>
        ${['', '2'].map(n => `<div class="q-row"><label>Dump site ${n || 1}</label>${sel('v.dump' + n, Object.keys(QE.DUMP).map(k => [k, QE.DUMP[k].l]))}<div class="q-inl">Tons ${num('v.tons' + n, 'step="0.1"')}</div></div>`).join('')}
        <p class="q-rt">Sandoval County Landfill: 2708 Iris Rd NE, Rio Rancho NM 87144. Dump fees at cost.</p></fieldset>
      <fieldset><legend>Tax (GRT) - pick by job address</legend>${sel('v.grt', Object.keys(QE.GRT).map(k => [k, QE.GRT[k].l.replace('Rio Rancho - ', 'RR ').replace(' County side', '') + ' ' + QE.GRT[k].r + '%']))}</fieldset>
      <h3>Customer sees</h3><div id="q-sum">${summary()}</div>
      <div class="q-actions"><button class="primary" id="q-save" onclick="qSave()"${Q.busy ? ' disabled' : ''}>${Q.saved ? 'Save again as new quote' : 'Save quote (PDF + data)'}</button>
        ${Q.saved ? `<button class="secondary" onclick="qDownload('${Q.saved.id}')">Download PDF</button><button class="secondary" onclick="qText('${Q.saved.id}')">Text customer</button>${signBtns(Q.saved, '')}` : ''}
        ${setupBtns()}</div><p class="muted q-rt" id="q-status">${Q.saved ? 'Saved as ' + e(Q.saved.number) + '.' + (Q.saved.signed_at ? ' SIGNED.' : '') : ''}</p></div></div>`; }
  const signBtns = (q, cls) => q.signed_at ? `<button class="secondary ${cls}" onclick="qDownloadSigned('${q.id}')">Download signed PDF</button>` + (q.signer_name ? `<span class="muted q-rt">Signed by ${e(q.signer_name)} ${e(window.GPSign ? GPSign.denver(q.signed_at) : '')}</span>` : '')
    : `<button class="secondary ${cls}" onclick="qSign('${q.id}')">Customer sign</button><button class="secondary ${cls}" onclick="qCopyLink('${q.id}', this)">Copy sign link</button>`;
  const setupBtns = () => `<button class="secondary" disabled title="Needs Christian's Azure app client ID">Save to OneDrive \u00b7 Setup needed</button><button class="secondary" disabled title="Needs the Gmail app password">Email customer \u00b7 Setup needed</button>`;
  function listHTML() { if (Q.list === null) return '<p class="muted">Loading\u2026</p>'; if (!Q.list.length) return '<p class="muted">No saved quotes yet.</p>';
    return Q.list.map(q => `<div class="q-item"><div><b>${e(q.number)}</b> \u00b7 ${e(QE.FORMS[q.service]?.t || q.service)}${q.has_pending ? ' <span class="q-tag">PENDING</span>' : ''}${q.signed_at ? ' <span class="q-tag q-signed">SIGNED</span>' : ''}<br><span class="muted">${e(q.customer?.name || 'No name')} \u00b7 ${money(q.total)} \u00b7 ${new Date(q.created_at).toLocaleDateString()}</span></div>
      <div class="q-actions">${q.pdf_path ? `<button class="secondary q-sm" onclick="qDownload('${q.id}')">Download PDF</button><button class="secondary q-sm" onclick="qText('${q.id}')">Text customer</button>${signBtns(q, 'q-sm')}` : '<span class="muted">PDF missing</span>'}</div></div>`).join('') + `<div class="q-actions" style="margin-top:8px">${setupBtns()}</div>`; }
  async function loadList() { if (!window.gpSb) { Q.list = []; return paintList(); } Q.busy = true;
    const { data, error } = await gpSb.from('quotes').select('id,number,service,customer,total,has_pending,pdf_path,created_at,status,signed_at,signer_name,signed_pdf_path').order('created_at', { ascending: false }).limit(50);
    Q.busy = false; if (error) { Q.list = []; window.gpReportError && gpReportError(error, { op: 'quotes' }); } else Q.list = data || []; paintList(); }
  function paintList() { const el = document.getElementById('q-list'); if (el) el.innerHTML = listHTML(); }
  function repaint() { if (typeof page === 'function' && page() !== 'quotes') return; const m = document.getElementById('app'); if (m) { m.innerHTML = quotesPage(); } }

  window.qOpen = k => { Q.k = k; Q.v = blankV(k); Q.c = blankC(); Q.c.by = (S.me && (S.me.name || S.me.email.split('@')[0])) || ''; Q.saved = null; Q.view = 'form'; repaint(); scrollTo(0, 0); };
  window.qBack = () => { Q.view = 'list'; Q.list = null; repaint(); scrollTo(0, 0); };
  window.qAddLine = () => { Q.v.items.c.push({ d: '', q: '', p: '' }); repaint(); };
  document.addEventListener('input', ev => { const t = ev.target; if (!t.dataset || !t.dataset.q || !t.isConnected || !document.getElementById('quotes-root')) return; set(t.dataset.q, t.value); if (t.dataset.q.startsWith('v.')) Q.saved = null; const s = document.getElementById('q-sum'); if (s) s.innerHTML = summary(); });
  document.addEventListener('change', ev => { const t = ev.target; if (t.tagName === 'SELECT' && t.dataset && t.dataset.q && t.isConnected && document.getElementById('quotes-root')) t.dispatchEvent(new Event('input', { bubbles: true })); });

  // ---------- PDF (Handyman proposal template style; customer-facing only) ----------
  let jsPdfP = null, logoP = null;
  const loadJsPdf = () => jsPdfP || (jsPdfP = new Promise((ok, no) => { if (window.jspdf) return ok(window.jspdf); const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'; s.onload = () => ok(window.jspdf); s.onerror = () => { jsPdfP = null; no(new Error('Could not load the PDF library. Check the connection and try again.')); }; document.head.appendChild(s); }));
  const loadLogo = () => logoP || (logoP = fetch(BASE + 'logo.png?v=1').then(r => r.blob()).then(b => new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); })).catch(() => null));
  async function buildPdf(rec, sig) { const { jsPDF } = await loadJsPdf(), logo = await loadLogo(); const d = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = 612, M = 48, R = W - M; let y = 40; const f = QE.FORMS[rec.service], r = rec.result, c = rec.customer;
    const serif = (s, sz) => { d.setFont('times', s); d.setFontSize(sz); }, sans = (s, sz) => { d.setFont('helvetica', s); d.setFontSize(sz); };
    const spaced = (t, x, yy, align) => { d.setCharSpace(2.2); d.text(t.toUpperCase(), x, yy, { align }); d.setCharSpace(0); };
    const page = need => { if (y + need > 742) { d.addPage(); y = 48; } };
    if (logo) d.addImage(logo, 'PNG', W / 2 - 150, y, 300, 56); y += 66; sans('normal', 7); d.setTextColor(85); spaced('One crew for the whole property', W / 2, y, 'center'); y += 8; d.setDrawColor(17); d.line(M, y, R, y); y += 34;
    d.setTextColor(17); serif('normal', 28); d.text('Proposal', M, y); y += 16; sans('normal', 9); d.setTextColor(85); d.text(f.t.replace(/ \(PENDING\)/, '').toUpperCase() + '  \u00b7  RIO RANCHO / ALBUQUERQUE', M, y); y += 22;
    sans('normal', 6.5); spaced('Prepared for', M, y); spaced('Proposal details', R, y, 'right'); y += 14; d.setTextColor(17); sans('normal', 10);
    const L = ['Client: ' + (c.name || ''), 'Address: ' + (c.addr || ''), 'City / ZIP: ' + (c.city || ''), 'Phone: ' + (c.phone || '') + (c.email ? '   ' + c.email : '')], Rr = ['Proposal no. ' + rec.number, 'Date walked ' + (c.date || ''), 'Valid 30 days from date walked'];
    for (let i = 0; i < 4; i++) { d.text(L[i], M, y + i * 14, { maxWidth: 300 }); if (Rr[i]) d.text(Rr[i], R, y + i * 14, { align: 'right' }); } y += 62; d.line(M, y, R, y); y += 24;
    if (c.scope) { serif('normal', 15); d.text('Scope of work', M, y); y += 16; sans('normal', 10); const sl = d.splitTextToSize(c.scope, R - M); page(sl.length * 13); d.text(sl, M, y); y += sl.length * 13 + 12; }
    serif('normal', 15); d.text('Investment', M, y); y += 14; sans('italic', 9); d.setTextColor(85); d.text('Price for the scope described. Extra work is only what you approve.', M, y); y += 12; d.setTextColor(17);
    const row = (a, b, opt = {}) => { sans(opt.bold ? 'bold' : 'normal', opt.size || 10); const al = d.splitTextToSize(a, R - M - 110), h = Math.max(20, al.length * 12 + 8); page(h); if (opt.fill) { d.setFillColor(244); d.rect(M, y, R - M, h, 'F'); } d.setDrawColor(153); d.rect(M, y, R - M, h); d.line(R - 100, y, R - 100, y + h); d.text(al, M + 6, y + 13); d.text(b, R - 6, y + 13, { align: 'right' }); y += h; };
    d.setFillColor(244); d.rect(M, y, R - M, 18, 'F'); d.setDrawColor(153); d.rect(M, y, R - M, 18); sans('bold', 7); spaced('Item', M + 6, y + 12); spaced('Amount', R - 6, y + 12, 'right'); y += 18;
    r.lines.forEach(l => row(l.l, money(l.a))); row('Subtotal', money(r.subtotal), { bold: true }); row('New Mexico Gross Receipts Tax - ' + r.grtLabel + ' (' + r.grtRate + '%)', money(r.tax)); row('TOTAL', money(r.total), { bold: true, size: 12, fill: true }); y += 10;
    sans('normal', 8.5); d.setTextColor(85); const gt = d.splitTextToSize('Gross Receipts Tax is New Mexico\u2019s tax on services. It is charged on the job and remitted by Gatepost. It is not an extra fee we keep.', R - M); d.text(gt, M, y); y += gt.length * 11 + 14; d.setTextColor(17);
    page(190); serif('normal', 15); d.text('Terms', M, y); y += 15; sans('normal', 9.5);
    ['Valid 30 days from the date walked.', 'Payment is due in full when the job is done.', 'Gross Receipts Tax is shown as its own line and paid by Gatepost to the state.', 'Change orders are written and priced before extra work starts.', 'Weather, a locked gate, or loose pets can move the start with no penalty either way.'].forEach((t, i) => { d.text((i + 1) + '. ' + t, M + 4, y); y += 13; });
    if (sig) { page(200); y += 10; serif('normal', 15); d.text('Customer acceptance - signed electronically', M, y); y += 18; sans('bold', 10.5); const al = d.splitTextToSize(sig.line, R - M); d.text(al, M, y); y += al.length * 13 + 6;
      if (sig.png) d.addImage(sig.png, 'PNG', M, y, 240, 80); y += 84; d.setDrawColor(17); d.line(M, y, M + 260, y); y += 13; sans('normal', 10);
      d.text('Signed by: ' + sig.name, M, y); y += 13; d.text('Date / time: ' + sig.atText, M, y); y += 13; d.text('Quote: ' + rec.number + '   Total: ' + money(r.total), M, y); y += 13; }
    else { serif('normal', 15); d.text('Acceptance', M, y); y += 36; sans('normal', 10); d.line(M, y, M + 220, y); d.line(R - 220, y, R, y); y += 12; sans('normal', 8.5); d.text('Client signature / date', M, y); d.text('Gatepost Property Services signature / date', R - 220, y); }
    const pages = d.getNumberOfPages(); for (let p = 1; p <= pages; p++) { d.setPage(p); d.setDrawColor(17); d.line(M, 752, R, 752); sans('normal', 6.5); d.setTextColor(85); spaced('Free estimates \u00b7 Locally owned \u00b7 Seven days a week', W / 2, 764, 'center'); sans('normal', 8.5); d.text('Gatepost Property Services \u00b7 ' + PHONE + ' \u00b7 Moving, yard work, hauling and repairs from one local team.', W / 2, 777, { align: 'center' }); }
    return d.output('blob'); }

  window.qBuildPdf = buildPdf; // used by the preview/test harness
  // ---------- save ----------
  const st = m => { const el = document.getElementById('q-status'); if (el) el.textContent = m; };
  window.qSave = async function () { if (Q.busy || !window.gpSb) return; Q.busy = true; const btn = document.getElementById('q-save'); if (btn) btn.disabled = true;
    try { st('Saving\u2026'); const v = vals(), result = calcOf(Q.k, v), pend = hasPending(Q.k, v);
      if (!result.lines.length) throw new Error('Add at least one line before saving.');
      const payload = { service: Q.k, customer: { ...Q.c }, inputs: v, result: { lines: result.lines, subtotal: result.subtotal, grtLabel: result.grtLabel, grtRate: result.grtRate, tax: result.tax, total: result.total }, warnings: result.warn, has_pending: pend, engine: 'bidforms-2026-10-16' };
      const { data: row, error } = await gpSb.from('quotes').insert({ service: Q.k, customer: payload.customer, data: payload, total: result.total, has_pending: pend, created_by: S.me.email }).select('id,number').single();
      if (error) throw error; const rec = { ...payload, id: row.id, number: row.number };
      st('Making the PDF\u2026'); const pdf = await buildPdf(rec), base = row.id + '/' + row.number;
      const up1 = await gpSb.storage.from('quotes').upload(base + '.pdf', pdf, { contentType: 'application/pdf', upsert: true }); if (up1.error) throw up1.error;
      const up2 = await gpSb.storage.from('quotes').upload(base + '.json', new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' }), { contentType: 'application/json', upsert: true }); if (up2.error) throw up2.error;
      const u = await gpSb.from('quotes').update({ pdf_path: base + '.pdf', json_path: base + '.json' }).eq('id', row.id); if (u.error) throw u.error;
      Q.saved = { id: row.id, number: row.number }; Q.list = null; Q.busy = false; repaint();
    } catch (err) { Q.busy = false; if (btn) btn.disabled = false; st('Not saved: ' + (err.message || err)); window.gpReportError && gpReportError(err, { op: 'quote-save' }); } };
  async function fetchQuote(id) { const { data, error } = await gpSb.from('quotes').select('*').eq('id', id).single(); if (error) throw error; return data; }
  window.qDownload = async function (id) { const w = window.open('', '_blank'); try { const q = await fetchQuote(id); const { data, error } = await gpSb.storage.from('quotes').createSignedUrl(q.pdf_path, 120, { download: q.number + '.pdf' }); if (error) throw error; if (w) w.location = data.signedUrl; else location.href = data.signedUrl; } catch (err) { if (w) w.close(); alert('Could not open the PDF: ' + (err.message || err)); } };

  // ---------- text customer (preview + confirm; his own texting app does the sending) ----------
  const LINK_HOURS = 72;
  window.qText = async function (id) { let q; try { q = await fetchQuote(id); } catch (err) { return alert(err.message || err); }
    const c = q.customer || {}, svc = (QE.FORMS[q.service]?.t || q.service).replace(/ \(PENDING\)/, '');
    const msg = `Hi${c.name ? ' ' + c.name.split(' ')[0] : ''}, this is Gatepost Property Services. Here is your quote ${q.number} for ${svc.toLowerCase()}: ${money(q.total)} including NM gross receipts tax. PDF (link works for 3 days): [link]\nQuestions? Call or text ${PHONE}.`;
    const el = document.createElement('div'); el.className = 'q-modal'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="card q-modal-in"><h2>Text customer - preview</h2>
      ${q.has_pending ? '<div class="q-warnb">This quote has PENDING prices. It is blocked unless you override.</div><label class="q-chk"><input type="checkbox" id="q-ovr"> Override: I (Christian) OK these PENDING prices for this customer.</label>' : ''}
      <label>To (customer phone)<input id="q-to" type="tel" inputmode="tel" value="${e(c.phone || '')}"></label>
      <label>Message<textarea id="q-msg" rows="6">${e(msg)}</textarea></label>
      <p class="muted q-rt">Nothing is sent from here. Tapping the button opens your phone's texting app with this message and a private PDF link (expires in ${LINK_HOURS} hours) filled in. You send it from there. Use Google Voice so it comes from ${PHONE}.</p>
      <div class="q-actions"><button class="secondary" id="q-cancel">Cancel</button><button class="primary" id="q-go">Confirm - open texting app</button></div><p class="q-rt" id="q-mstat"></p></div>`;
    document.body.appendChild(el); const close = () => el.remove(); el.querySelector('#q-cancel').onclick = close; el.onclick = ev => { if (ev.target === el) close(); };
    el.querySelector('#q-go').onclick = async () => { const to = el.querySelector('#q-to').value.replace(/[^\d+]/g, ''), ms = el.querySelector('#q-mstat');
      if (q.has_pending && !el.querySelector('#q-ovr').checked) { ms.textContent = 'Blocked: tick the override first, or fix the PENDING lines.'; return; }
      if (to.replace(/\D/g, '').length < 10) { ms.textContent = 'Enter the customer\u2019s 10-digit phone number.'; return; }
      ms.textContent = 'Making the private link\u2026'; const { data, error } = await gpSb.storage.from('quotes').createSignedUrl(q.pdf_path, LINK_HOURS * 3600);
      if (error) { ms.textContent = 'Could not make the link: ' + error.message; return; }
      const body = el.querySelector('#q-msg').value.replace('[link]', data.signedUrl);
      await gpSb.from('quotes').update({ texted_at: new Date().toISOString(), texted_to: to, pending_override: !!q.has_pending }).eq('id', q.id);
      location.href = 'sms:' + to + (/iPhone|iPad|Mac/.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent(body); setTimeout(close, 800); };
  };
  // ---------- customer e-signing ----------
  // OneDrive auto-upload stub: once Christian's Azure app client ID is set (ONEDRIVE.clientId) and the OneDrive connect flow exists, signed PDFs go to OneDrive here. Disabled for now.
  const ONEDRIVE = { clientId: '', enabled: false, folder: 'Gatepost/Quotes/Signed' };
  window.qOneDriveAutoUpload = async function (blob, filename) { if (!ONEDRIVE.enabled || !ONEDRIVE.clientId) return { skipped: 'OneDrive setup needed' }; /* TODO: MSAL sign-in + PUT /me/drive/root:/{folder}/{filename}:/content */ return { skipped: 'not implemented' }; };
  const okPending = q => !q.has_pending || q.pending_override || confirm('This quote has PENDING prices. Override: I (Christian) OK these PENDING prices for this customer?');
  window.qSign = async function (id) { let q; try { q = await fetchQuote(id); } catch (err) { return alert(err.message || err); }
    if (q.signed_at) return alert('Already signed by ' + q.signer_name + '.'); if (!okPending(q)) return;
    if (q.has_pending && !q.pending_override) await gpSb.from('quotes').update({ pending_override: true }).eq('id', q.id);
    const rec = { ...q.data, number: q.number, service: q.service, customer: q.customer || q.data.customer };
    GPSign.open(rec, { title: (QE.FORMS[q.service]?.t || q.service).replace(/ \(PENDING\)/, ''), logo: BASE + 'logo.png', closeLabel: 'Cancel', onClose: () => {}, name: (q.customer || {}).name || '',
      onSubmit: async (sig, say) => { say('Making the signed PDF\u2026'); const pdf = await buildPdf(rec, sig), stamp = Date.now(), base = q.id + '/' + q.number;
        const a = await gpSb.storage.from('quotes').upload(base + '-signature-' + stamp + '.png', GPSign.b64ToBlob(sig.png), { contentType: 'image/png' }); if (a.error) throw a.error;
        const b = await gpSb.storage.from('quotes').upload(base + '-signed-' + stamp + '.pdf', pdf, { contentType: 'application/pdf' }); if (b.error) throw b.error;
        const u = await gpSb.from('quotes').update({ signed_at: sig.at, signer_name: sig.name, signature_path: base + '-signature-' + stamp + '.png', signed_pdf_path: base + '-signed-' + stamp + '.pdf', status: 'Signed' }).eq('id', q.id).is('signed_at', null).select('id'); if (u.error) throw u.error; if (!u.data.length) throw new Error('Already signed.');
        qOneDriveAutoUpload(pdf, q.number + '-signed.pdf').catch(() => {});
        if (Q.saved && Q.saved.id === q.id) Q.saved = { ...Q.saved, signed_at: sig.at, signer_name: sig.name }; Q.list = null; repaint(); } });
  };
  window.qDownloadSigned = async function (id) { const w = window.open('', '_blank'); try { const q = await fetchQuote(id); if (!q.signed_pdf_path) throw new Error('No signed PDF yet.'); const { data, error } = await gpSb.storage.from('quotes').createSignedUrl(q.signed_pdf_path, 120, { download: q.number + '-signed.pdf' }); if (error) throw error; if (w) w.location = data.signedUrl; else location.href = data.signedUrl; } catch (err) { if (w) w.close(); alert('Could not open the signed PDF: ' + (err.message || err)); } };
  // Copies a private sign link to the clipboard. Nothing is sent to the customer from here.
  window.qCopyLink = async function (id, btn) { let q; try { q = await fetchQuote(id); } catch (err) { return alert(err.message || err); }
    if (!okPending(q)) return; if (q.has_pending && !q.pending_override) await gpSb.from('quotes').update({ pending_override: true }).eq('id', q.id);
    const { data, error } = await gpSb.rpc('create_quote_sign_link', { p_quote_id: id, p_days: 30 }); if (error) return alert('Could not make the link: ' + error.message);
    const url = new URL('sign/?t=' + data.token, BASE || location.href).href, exp = data.expires_at ? ' (expires ' + new Date(data.expires_at).toLocaleDateString() + ')' : '';
    try { await navigator.clipboard.writeText(url); if (btn) { const t = btn.textContent; btn.textContent = 'Link copied'; setTimeout(() => { btn.textContent = t; }, 2500); } } catch (_) { prompt('Copy this sign link' + exp + ':', url); } };
})();
