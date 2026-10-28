// Wholesale Hub (Christian only): summary numbers + native tools (Deal Calculator, Deal Tracker, Buyers). No external links, no iframes.
// Data (all RLS = has_hub('wholesale'): hub_access row AND profiles.is_owner, so other owners/admins read and write nothing):
//   wholesale_stats  summary numbers per state, PK (state,key) (tools/wholesale.sh)      wholesale_deals  deals (tools/deals.sh creates/edits; the app edits status + notes only)
//   wholesale_buyers buyers + buy-box (added and edited here)
// Never owner names or mailing addresses: no such columns exist.
(function () {
  const W = window.WS = { d: null, at: 0, busy: false, tab: 'summary', deals: null, buyers: null, dBusy: false, bBusy: false, filter: 'All', msg: '', dd: {}, bf: {}, bedit: null,
    calc: { arv: '', rehab: '', list: '', fee: '', dc: '' } };
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => v == null ? '\u2014' : Number(v).toLocaleString('en-US');
  const STATUSES = ['Considering', 'Offered', 'Under contract', 'Assigned', 'Dead'];
  const TABS = [['summary', 'Summary'], ['calc', 'Calculator'], ['deals', 'Deals'], ['buyers', 'Buyers']];
  const money = v => v == null || v === '' || isNaN(v) ? '\u2014' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(Number(v))).toLocaleString('en-US');
  const parse = s => { const t = String(s ?? '').replace(/[$,\s]/g, ''); if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return null; return Number(t); };
  const here = () => typeof page === 'function' && page() === 'wholesale';
  const repaint = () => { if (here() && typeof render === 'function') render(); };
  const say = t => { W.msg = t; const m = document.getElementById('ws-msg'); if (m) m.textContent = t; };

  async function load(force) {
    if (!window.gpSb || W.busy || (!force && W.d && Date.now() - W.at < 20000)) return;
    W.busy = true;
    try { const { data, error } = await gpSb.from('wholesale_stats').select('state,key,value,updated_at'); W.d = error ? (W.d || {}) : (data || []).reduce((o, r) => { (o[r.state || 'NM'] = o[r.state || 'NM'] || {})[r.key] = r; return o; }, {}); W.at = Date.now(); if (error && window.gpReportError) gpReportError(error, { op: 'wholesale' }); }
    finally { W.busy = false; }
    repaint();
  }
  async function loadDeals(force) {
    if (!window.gpSb || W.dBusy || (!force && W.deals)) return; W.dBusy = true;
    try { const { data, error } = await gpSb.from('wholesale_deals').select('id,ext_id,address,list_price,arv,rehab,max_offer,creative_structure,status,notes,call_script,updated_at').order('updated_at', { ascending: false });
      if (error) { W.deals = W.deals || []; say('Could not load deals.'); window.gpReportError && gpReportError(error, { op: 'wholesale_deals' }); } else W.deals = data || []; }
    finally { W.dBusy = false; } repaint();
  }
  async function loadBuyers(force) {
    if (!window.gpSb || W.bBusy || (!force && W.buyers)) return; W.bBusy = true;
    try { const { data, error } = await gpSb.from('wholesale_buyers').select('*').order('created_at', { ascending: false });
      if (error) { W.buyers = W.buyers || []; say('Could not load buyers.'); window.gpReportError && gpReportError(error, { op: 'wholesale_buyers' }); } else W.buyers = data || []; }
    finally { W.bBusy = false; } repaint();
  }
  window.wsRefresh = () => { load(true); if (W.tab === 'deals') loadDeals(true); if (W.tab === 'buyers') loadBuyers(true); };
  window.wsTab = k => { W.tab = k; say(''); repaint(); };

  // ---- Deal Calculator (front end only; nothing is saved or sent) ----
  function calcOut() {
    const c = W.calc, arv = parse(c.arv), rehab = parse(c.rehab) ?? 0, list = parse(c.list), fee = parse(c.fee), dc = parse(c.dc) ?? 0;
    if (arv == null) return { empty: true };
    const maxOffer = arv * 0.7 - rehab, o = { maxOffer };
    if (list != null) { o.spread = maxOffer - list; }
    if (fee != null) { o.fee = fee; if (list != null) { o.buyerPrice = list + fee; o.room = maxOffer - (list + fee); } o.dcNet = fee - dc; }
    if (list != null) o.dcMax = maxOffer - list - dc;
    o.hasList = list != null; o.hasFee = fee != null; o.dc = dc; return o;
  }
  const cls = v => v == null ? '' : v < 0 ? ' neg' : ' pos';
  function calcOutHTML() {
    const o = calcOut();
    if (o.empty) return '<p class="muted">Enter the ARV to see the numbers.</p>';
    const row = (l, v, sub, hot) => `<div class="wc-row${hot ? ' hot' : ''}"><div><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div><b class="${cls(hot ? v : null).trim()}">${money(v)}</b></div>`;
    let h = row('Max offer', o.maxOffer, 'ARV \u00d7 70% \u2212 rehab', 1);
    h += o.hasList ? row('Spread', o.spread, 'Max offer \u2212 list price', 1) + `<p class="wc-flag ${o.spread < 0 ? 'neg' : 'pos'}">${o.spread < 0 ? 'List price is above the max offer.' : 'List price is under the max offer.'}</p>` : '<p class="muted">Add the list price to see the spread.</p>';
    if (o.hasFee) {
      h += '<h3>Assignment</h3>' + row('Assignment fee', o.fee) + (o.hasList ? row('Buyer price', o.buyerPrice, 'List price + fee') + row('Room left under max offer', o.room, 'Max offer \u2212 buyer price', 1) + `<p class="wc-flag ${o.room < 0 ? 'neg' : 'pos'}">${o.room < 0 ? 'Fee is too high: buyer price is above the max offer.' : 'Fee fits under the max offer.'}</p>` : '');
      h += '<h3>Double close</h3>' + row('Double-close costs', o.dc) + row('Net after double-close costs', o.dcNet, 'Fee \u2212 costs', 1) + (o.hasList ? row('Best case at max offer', o.dcMax, 'Spread \u2212 costs, if the buyer pays the max offer') : '');
    } else h += '<p class="muted">Add an assignment fee to see assignment and double-close numbers.</p>';
    return h;
  }
  window.wsCalc = (k, v) => { W.calc[k] = v; const el = document.getElementById('wc-out'); if (el) el.innerHTML = calcOutHTML(); };
  window.wsCalcClear = () => { W.calc = { arv: '', rehab: '', list: '', fee: '', dc: '' }; repaint(); };
  const cin = (k, label, hint) => `<label for="wc-${k}">${label}</label><input id="wc-${k}" type="text" inputmode="decimal" autocomplete="off" placeholder="$0" value="${e(W.calc[k])}" oninput="wsCalc('${k}',this.value)">${hint ? `<small class="wc-hint">${hint}</small>` : ''}`;
  function calcHTML() {
    return `<div class="card ws-card"><div class="uf-top"><h2>Deal Calculator</h2><button type="button" class="secondary q-sm" onclick="wsCalcClear()">Clear</button></div>
      <p class="muted">Quick math on a deal. Nothing here is saved.</p>
      ${cin('arv', 'ARV (after-repair value)')}${cin('rehab', 'Rehab')}${cin('list', 'List price')}${cin('fee', 'Assignment fee')}${cin('dc', 'Double-close costs', 'Title, closing, and transactional funding')}</div>
      <div class="card ws-card" aria-live="polite"><h2>Results</h2><div id="wc-out">${calcOutHTML()}</div></div>`;
  }

  // ---- Deal Tracker ----
  const dget = id => (W.deals || []).find(x => x.id === id);
  const dval = (d, k) => (W.dd[d.id] && W.dd[d.id][k] !== undefined) ? W.dd[d.id][k] : (d[k] ?? '');
  window.wsDraft = (id, k, v) => { (W.dd[id] = W.dd[id] || {})[k] = v; };
  window.wsFilter = f => { W.filter = f; repaint(); };
  window.wsDealSave = async id => {
    const d = dget(id); if (!d || !window.gpSb) return; const dr = W.dd[id] || {};
    const upd = { status: dr.status !== undefined ? dr.status : d.status, notes: dr.notes !== undefined ? dr.notes : d.notes };
    if (!STATUSES.includes(upd.status)) return say('Pick a valid status.');
    if (upd.notes != null && String(upd.notes).length > 4000) return say('Notes are too long (4000 max).');
    const btn = document.getElementById('wd-save-' + id); if (btn) btn.disabled = true;
    const { data, error } = await gpSb.from('wholesale_deals').update({ status: upd.status, notes: upd.notes || null }).eq('id', id).select('id,status,notes,updated_at');
    if (btn) btn.disabled = false;
    if (error || !data || !data.length) { say('Not saved. ' + (error ? error.message : 'No access.')); return; }
    Object.assign(d, data[0]); delete W.dd[id]; say('Saved.'); repaint();
  };
  window.wsCopy = async id => { const d = dget(id); if (!d || !d.call_script) return; try { await navigator.clipboard.writeText(d.call_script); say('Call script copied.'); } catch (_) { say('Copy failed. Select the text and copy it.'); } };
  window.wsToCalc = id => { const d = dget(id); if (!d) return; W.calc = { arv: d.arv ?? '', rehab: d.rehab ?? '', list: d.list_price ?? '', fee: W.calc.fee, dc: W.calc.dc }; W.calc = Object.fromEntries(Object.entries(W.calc).map(([k, v]) => [k, String(v)])); W.tab = 'calc'; say(''); repaint(); window.scrollTo && window.scrollTo(0, 0); };
  const badge = s => `<span class="badge ws-st ws-st-${e(String(s).toLowerCase().replace(/\s+/g, '-'))}">${e(s)}</span>`;
  function dealHTML(d) {
    const spread = d.max_offer != null && d.list_price != null ? Number(d.max_offer) - Number(d.list_price) : null;
    return `<div class="of-item ws-deal" data-deal="${e(d.id)}"><div class="uf-top"><span><b>${e(d.address || d.ext_id)}</b></span>${badge(d.status)}</div>
      <div class="ws-facts"><div><span>List</span><b>${money(d.list_price)}</b></div><div><span>ARV</span><b>${money(d.arv)}</b></div><div><span>Rehab</span><b>${money(d.rehab)}</b></div><div><span>Max offer</span><b>${money(d.max_offer)}</b></div><div><span>Spread</span><b class="${cls(spread).trim()}">${money(spread)}</b></div></div>
      ${d.creative_structure ? `<p class="ws-struct"><span class="muted">Structure:</span> ${e(d.creative_structure)}</p>` : ''}
      <label for="wd-st-${e(d.id)}">Status</label><select id="wd-st-${e(d.id)}" onchange="wsDraft('${e(d.id)}','status',this.value)">${STATUSES.map(s => `<option${dval(d, 'status') === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
      <label for="wd-nt-${e(d.id)}">Notes</label><textarea id="wd-nt-${e(d.id)}" rows="3" maxlength="4000" oninput="wsDraft('${e(d.id)}','notes',this.value)">${e(dval(d, 'notes'))}</textarea>
      <div class="of-row ws-btns"><button type="button" id="wd-save-${e(d.id)}" class="q-sm" onclick="wsDealSave('${e(d.id)}')">Save</button><button type="button" class="secondary q-sm" onclick="wsToCalc('${e(d.id)}')">Open in calculator</button></div>
      ${d.call_script ? `<details class="ws-script"><summary>Call script</summary><div class="br-val">${e(d.call_script)}</div><button type="button" class="secondary q-sm" onclick="wsCopy('${e(d.id)}')">Copy script</button></details>` : ''}
      <p class="muted ws-upd">${e(d.ext_id)}${d.updated_at ? ' \u00b7 updated ' + e(new Date(d.updated_at).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' })) : ''}</p></div>`;
  }
  function dealsHTML() {
    loadDeals();
    if (W.deals == null) return '<div class="card ws-card"><h2>Deal Tracker</h2><p class="muted">Loading\u2026</p></div>';
    const counts = Object.fromEntries(STATUSES.map(s => [s, W.deals.filter(d => d.status === s).length]));
    const shown = W.filter === 'All' ? W.deals : W.deals.filter(d => d.status === W.filter);
    return `<div class="card ws-card"><div class="uf-top"><h2>Deal Tracker</h2><button type="button" class="secondary q-sm" onclick="wsRefresh()">Refresh</button></div>
      <div class="of-tabs ws-chips" role="group" aria-label="Filter by status">${['All'].concat(STATUSES).map(s => `<button type="button" class="${W.filter === s ? 'on' : ''}" onclick="wsFilter('${s}')">${s}${s === 'All' ? ' ' + W.deals.length : ' ' + counts[s]}</button>`).join('')}</div>
      ${shown.length ? shown.map(dealHTML).join('') : `<p class="muted">${W.deals.length ? 'No deals with this status.' : 'No deals yet. New deals are added with tools/deals.sh; you change status and notes here.'}</p>`}</div>`;
  }

  // ---- Buyers + buy-box ----
  const BF = [['name', 'Name', 'text', 'name'], ['company', 'Company', 'text'], ['phone', 'Phone', 'tel', 'tel'], ['email', 'Email', 'email', 'email'], ['areas', 'Areas (zips, neighborhoods, cities)', 'text'], ['property_types', 'Property types', 'text'],
    ['price_min', 'Price min', 'money'], ['price_max', 'Price max', 'money'], ['rehab_tolerance', 'Rehab tolerance', 'text'], ['financing', 'Financing', 'text'], ['notes', 'Notes', 'area']];
  const bval = k => W.bf[k] !== undefined ? W.bf[k] : '';
  window.wsBf = (k, v) => { W.bf[k] = v; };
  window.wsBuyerEdit = id => { const b = (W.buyers || []).find(x => x.id === id); if (!b) return; W.bedit = id; W.bf = Object.fromEntries(BF.map(([k]) => [k, b[k] == null ? '' : String(b[k])])); say(''); repaint(); window.scrollTo && window.scrollTo(0, 0); };
  window.wsBuyerCancel = () => { W.bedit = null; W.bf = {}; say(''); repaint(); };
  window.wsBuyerSave = async () => {
    const f = W.bf, t = k => (f[k] || '').trim(), row = {};
    if (!t('name')) return say('Name is required.');
    for (const [k] of BF) if (k !== 'price_min' && k !== 'price_max') row[k] = t(k) || null;
    row.name = t('name');
    for (const k of ['price_min', 'price_max']) { if (t(k) === '') { row[k] = null; continue; } const n = parse(t(k)); if (n == null || n < 0) return say('Price ' + k.slice(6) + ' must be a number.'); row[k] = n; }
    if (row.price_min != null && row.price_max != null && row.price_min > row.price_max) return say('Price min is above price max.');
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return say('That email does not look right.');
    if (!window.gpSb) return say('Not connected.');
    const btn = document.getElementById('wb-save'); if (btn) btn.disabled = true;
    const q = W.bedit ? gpSb.from('wholesale_buyers').update(row).eq('id', W.bedit).select('*') : gpSb.from('wholesale_buyers').insert(row).select('*');
    const { data, error } = await q; if (btn) btn.disabled = false;
    if (error || !data || !data.length) return say('Not saved. ' + (error ? error.message : 'No access.'));
    const saved = data[0]; W.buyers = W.bedit ? W.buyers.map(b => b.id === saved.id ? saved : b) : [saved].concat(W.buyers || []);
    const was = W.bedit; W.bedit = null; W.bf = {}; say(was ? 'Buyer updated.' : 'Buyer added.'); repaint();
  };
  function buyerForm() {
    const fld = ([k, label, type, ac]) => type === 'area' ? `<label for="wb-${k}">${label}</label><textarea id="wb-${k}" rows="3" maxlength="4000" oninput="wsBf('${k}',this.value)">${e(bval(k))}</textarea>`
      : `<label for="wb-${k}">${label}</label><input id="wb-${k}" type="${type === 'money' ? 'text' : type}"${type === 'money' ? ' inputmode="decimal" placeholder="$0"' : ''}${ac ? ` autocomplete="${ac}"` : ' autocomplete="off"'} value="${e(bval(k))}" oninput="wsBf('${k}',this.value)">`;
    return `<div class="card ws-card" id="wb-form"><h2>${W.bedit ? 'Edit buyer' : 'Add a buyer'}</h2><p class="muted">Buy-box intake: what they want to buy.</p>${BF.slice(0, 6).map(fld).join('')}
      <div class="ws-two">${BF.slice(6, 8).map(x => `<div>${fld(x)}</div>`).join('')}</div>${BF.slice(8).map(fld).join('')}
      <div class="of-row ws-btns"><button type="button" id="wb-save" onclick="wsBuyerSave()">${W.bedit ? 'Save changes' : 'Add buyer'}</button>${W.bedit ? '<button type="button" class="secondary" onclick="wsBuyerCancel()">Cancel</button>' : ''}</div></div>`;
  }
  function buyerItem(b) {
    const range = b.price_min != null || b.price_max != null ? `${b.price_min != null ? money(b.price_min) : 'any'} \u2013 ${b.price_max != null ? money(b.price_max) : 'any'}` : '';
    const line = (l, v) => v ? `<div><span class="muted">${l}:</span> ${e(v)}</div>` : '';
    return `<div class="of-item ws-buyer"><div class="uf-top"><span><b>${e(b.name)}</b>${b.company ? ` <span class="muted">${e(b.company)}</span>` : ''}</span><button type="button" class="secondary q-sm" onclick="wsBuyerEdit('${e(b.id)}')">Edit</button></div>
      <div class="ws-contact">${b.phone ? `<a href="tel:${e(String(b.phone).replace(/[^0-9+]/g, ''))}">${e(b.phone)}</a>` : ''}${b.email ? `<a href="mailto:${e(b.email)}">${e(b.email)}</a>` : ''}</div>
      ${line('Areas', b.areas)}${line('Types', b.property_types)}${line('Price', range)}${line('Rehab', b.rehab_tolerance)}${line('Financing', b.financing)}${line('Notes', b.notes)}</div>`;
  }
  function buyersHTML() {
    loadBuyers();
    const list = W.buyers == null ? '<p class="muted">Loading\u2026</p>' : W.buyers.length ? W.buyers.map(buyerItem).join('') : '<p class="muted">No buyers yet. Add the first one above.</p>';
    return buyerForm() + `<div class="card ws-card"><div class="uf-top"><h2>Buyers${W.buyers ? ' (' + W.buyers.length + ')' : ''}</h2><button type="button" class="secondary q-sm" onclick="wsRefresh()">Refresh</button></div>${list}</div>`;
  }

  const STATE_NAME = { NM: 'New Mexico (ABQ / Rio Rancho)', OH: 'Ohio (Cleveland)' };
  const stOrder = c => c === 'NM' ? '0' : c === 'OH' ? '1' : '2' + c;
  const stamp = t => new Date(t).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  function summaryHTML() {
    load();
    const D = W.d, states = D ? Object.keys(D).sort((x, y) => stOrder(x).localeCompare(stOrder(y))) : [];
    const group = st => { const d = D[st], v = k => d[k] ? d[k].value : null, upd = Object.values(d).map(r => r.updated_at).filter(Boolean).sort().pop();
      const stat = (k, label, hot) => `<div class="t-stat${hot ? ' hot' : ''}" data-ws="${k}"><b>${num(v(k))}</b><span>${label}</span></div>`;
      return `<div class="card ws-card ws-state" data-state="${e(st)}"><h2>${e(STATE_NAME[st] || st)}</h2>
        <h3>Listings</h3><div class="t-stats ws-stats">${stat('listings', 'Listings considered')}</div>
        <h3>Leads</h3><div class="t-stats ws-stats">${stat('call_today', 'Call today', 1)}${stat('week', 'This week')}${stat('worth_a_look', 'Worth a look')}</div>
        ${upd ? `<p class="muted ws-upd">Updated ${e(stamp(upd))} (Denver time)</p>` : ''}</div>`; };
    return `<div class="card ws-card"><div class="uf-top"><h2>Wholesale Hub</h2><button type="button" class="secondary q-sm" onclick="wsRefresh()">Refresh</button></div>
      <p class="muted">Summary numbers by state. Owner access only.</p></div>
      ${D == null ? '<div class="card ws-card"><p class="muted">Loading\u2026</p></div>' : states.length ? states.map(group).join('') : '<div class="card ws-card"><p class="muted">No numbers yet.</p></div>'}
      <div class="card ws-card"><h2>Tools</h2><div class="ws-links">${[['calc', 'Deal Calculator', 'Max offer, spread, double close'], ['deals', 'Deal Tracker', 'Status and notes on every deal'], ['buyers', 'Buyers', 'Buy-box list and intake']].map(([k, n, s2]) => `<button type="button" class="ws-link" onclick="wsTab('${k}')"><span class="ws-ln"><b>${n}</b><small>${s2}</small></span><span>Open \u203a</span></button>`).join('')}</div></div>`;
  }
  function html() {
    const body = W.tab === 'calc' ? calcHTML() : W.tab === 'deals' ? dealsHTML() : W.tab === 'buyers' ? buyersHTML() : summaryHTML();
    return `<div class="of-tabs ws-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" aria-selected="${W.tab === k}" class="${W.tab === k ? 'on' : ''}" onclick="wsTab('${k}')">${n}</button>`).join('')}</div>
      <div id="ws-msg" class="muted q-rt" aria-live="polite">${e(W.msg)}</div>${body}`;
  }
  hubRegister({ id: 'wholesale', name: 'Wholesale Hub', desc: 'Deal calculator, deal tracker, buyers. Owner only', page: 'wholesale', pages: ['wholesale'], access: true,
    visible: () => hubAccess('wholesale'), render: html });
})();
