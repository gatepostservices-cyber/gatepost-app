// Wholesale Hub (Christian only): summary numbers + native tools (Deal Calculator, Deal Tracker, Buyers). No external links, no iframes.
// Data (all RLS = has_hub('wholesale'): hub_access row AND profiles.is_owner, so other owners/admins read and write nothing):
//   wholesale_stats  summary numbers per state and type (homes|land), PK (state,type,key) (tools/wholesale.sh)      wholesale_deals  deals (tools/deals.sh creates/edits; the app edits status + notes only)
//   wholesale_buyers buyers + buy-box (added and edited here)
//   wholesale_title_cos title companies per state (tools/title.sh creates/edits; the app edits status + call_notes only)
//   wholesale_builders  builders/buyers per state + type (tools/builders.sh creates/edits; the app edits status, call_notes, buy_box only)
//   wholesale_leads     leads per state + type + bucket (tools/wholesale_leads.sh loads from Dex's CSVs; the app edits status + call_notes only; linked to wholesale_deals by ext_id)
// Never owner names or mailing addresses: no such columns exist.
(function () {
  const W = window.WS = { d: null, at: 0, busy: false, tab: 'summary', ll: null, lc: null, lcBusy: false, lead: null, deals: null, buyers: null, dBusy: false, bBusy: false, filter: 'All', tfilter: 'All', st: {}, tc: null, tcBusy: false, td: {}, tcOpen: {}, bl: null, blBusy: false, bd: {}, blOpen: {}, msg: '', dd: {}, bf: {}, bedit: null,
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
    try { const { data, error } = await gpSb.from('wholesale_stats').select('state,type,key,value,updated_at'); W.d = error ? (W.d || {}) : (data || []).reduce((o, r) => { const s = r.state || 'NM', t = r.type || 'homes'; ((o[s] = o[s] || {})[t] = o[s][t] || {})[r.key] = r; return o; }, {}); W.at = Date.now(); if (error && window.gpReportError) gpReportError(error, { op: 'wholesale' }); }
    finally { W.busy = false; }
    repaint();
  }
  async function loadDeals(force) {
    if (!window.gpSb || W.dBusy || (!force && W.deals)) return; W.dBusy = true;
    try { const { data, error } = await gpSb.from('wholesale_deals').select('id,ext_id,type,address,list_price,arv,rehab,max_offer,creative_structure,status,notes,call_script,updated_at').order('updated_at', { ascending: false });
      if (error) { W.deals = W.deals || []; say('Could not load deals.'); window.gpReportError && gpReportError(error, { op: 'wholesale_deals' }); } else W.deals = data || []; }
    finally { W.dBusy = false; } repaint();
  }
  async function loadBuyers(force) {
    if (!window.gpSb || W.bBusy || (!force && W.buyers)) return; W.bBusy = true;
    try { const { data, error } = await gpSb.from('wholesale_buyers').select('*').order('created_at', { ascending: false });
      if (error) { W.buyers = W.buyers || []; say('Could not load buyers.'); window.gpReportError && gpReportError(error, { op: 'wholesale_buyers' }); } else W.buyers = data || []; }
    finally { W.bBusy = false; } repaint();
  }
  window.wsRefresh = () => { load(true); loadLeadCounts(true); loadTitle(true); loadBuilders(true); if (W.tab === 'deals') loadDeals(true); if (W.tab === 'buyers') loadBuyers(true); };
  window.wsTab = k => { closeLeadSheet(); W.tab = k; say(''); repaint(); };

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
  window.wsTFilter = f => { W.tfilter = f; repaint(); };
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
      <div class="ws-type"><span class="badge ws-ty">${e(d.type === 'land' ? 'Land' : 'Homes')}</span></div>
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
    const tcount = { Homes: W.deals.filter(d => d.type !== 'land').length, Land: W.deals.filter(d => d.type === 'land').length };
    const byType = W.tfilter === 'All' ? W.deals : W.deals.filter(d => (d.type === 'land' ? 'Land' : 'Homes') === W.tfilter);
    const counts = Object.fromEntries(STATUSES.map(s => [s, byType.filter(d => d.status === s).length]));
    const shown = W.filter === 'All' ? byType : byType.filter(d => d.status === W.filter);
    return `<div class="card ws-card"><div class="uf-top"><h2>Deal Tracker</h2><button type="button" class="secondary q-sm" onclick="wsRefresh()">Refresh</button></div>
      <div class="of-tabs ws-chips ws-types" role="group" aria-label="Filter by type">${['All', 'Homes', 'Land'].map(t => `<button type="button" class="${W.tfilter === t ? 'on' : ''}" onclick="wsTFilter('${t}')">${t === 'All' ? 'All types' : t} ${t === 'All' ? W.deals.length : tcount[t]}</button>`).join('')}</div>
      <div class="of-tabs ws-chips" role="group" aria-label="Filter by status">${['All'].concat(STATUSES).map(s => `<button type="button" class="${W.filter === s ? 'on' : ''}" onclick="wsFilter('${s}')">${s}${s === 'All' ? ' ' + byType.length : ' ' + counts[s]}</button>`).join('')}</div>
      ${shown.length ? shown.map(dealHTML).join('') : `<p class="muted">${W.deals.length ? 'No deals match these filters.' : 'No deals yet. New deals are added with tools/deals.sh; you change status and notes here.'}</p>`}</div>`;
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
  window.wsType = (st, t) => { W.st[st] = t; repaint(); };

  // ---- Title companies (per state; status + call notes editable) ----
  const TSTAT = ['To call', 'Called', 'Approved', 'Rejected'];
  async function loadTitle(force) {
    if (!window.gpSb || W.tcBusy || (!force && W.tc)) return; W.tcBusy = true;
    try { const { data, error } = await gpSb.from('wholesale_title_cos').select('id,ext_id,name,state,phone,website,office_address,contact_person,evidence_notes,status,call_notes,call_script,updated_at').order('name');
      if (error) { W.tc = W.tc || []; say('Could not load title companies.'); window.gpReportError && gpReportError(error, { op: 'wholesale_title_cos' }); } else W.tc = data || []; }
    finally { W.tcBusy = false; } repaint();
  }
  const tget = id => (W.tc || []).find(x => x.id === id);
  const tval = (c, k) => (W.td[c.id] && W.td[c.id][k] !== undefined) ? W.td[c.id][k] : (c[k] ?? '');
  window.wsTcDraft = (id, k, v) => { (W.td[id] = W.td[id] || {})[k] = v; };
  window.wsTcOpen = (st, open) => { W.tcOpen[st] = open; };
  window.wsTcSave = async id => {
    const c = tget(id); if (!c || !window.gpSb) return; const dr = W.td[id] || {};
    const upd = { status: dr.status !== undefined ? dr.status : c.status, call_notes: dr.call_notes !== undefined ? dr.call_notes : c.call_notes };
    if (!TSTAT.includes(upd.status)) return say('Pick a valid status.');
    if (upd.call_notes != null && String(upd.call_notes).length > 4000) return say('Call notes are too long (4000 max).');
    const btn = document.getElementById('tc-save-' + id); if (btn) btn.disabled = true;
    const { data, error } = await gpSb.from('wholesale_title_cos').update({ status: upd.status, call_notes: upd.call_notes || null }).eq('id', id).select('id,status,call_notes,updated_at');
    if (btn) btn.disabled = false;
    if (error || !data || !data.length) { say('Not saved. ' + (error ? error.message : 'No access.')); return; }
    Object.assign(c, data[0]); delete W.td[id]; say('Saved.'); repaint();
  };
  window.wsTcCopy = async id => { const c = tget(id); if (!c || !c.call_script) return; try { await navigator.clipboard.writeText(c.call_script); say('Call script copied.'); } catch (_) { say('Copy failed. Select the text and copy it.'); } };
  const tcBadge = s => `<span class="badge ws-tcs ws-tcs-${e(String(s).toLowerCase().replace(/\s+/g, '-'))}">${e(s)}</span>`;
  function tcCard(c) {
    const id = e(c.id), web = /^https?:\/\//i.test(c.website || '') ? c.website : '', line = (l, v) => v ? `<div><span class="muted">${l}:</span> ${v}</div>` : '';
    return `<div class="of-item ws-tc" data-tc="${id}"><div class="uf-top"><span><b>${e(c.name)}</b></span>${tcBadge(c.status)}</div>
      <div class="ws-contact">${c.phone ? `<a href="tel:${e(String(c.phone).replace(/[^0-9+]/g, ''))}">${e(c.phone)}</a>` : ''}${web ? `<a href="${e(web)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}</div>
      ${line('Office', e(c.office_address))}${line('Contact', e(c.contact_person))}${line('Evidence', e(c.evidence_notes))}
      <label for="tc-st-${id}">Status</label><select id="tc-st-${id}" onchange="wsTcDraft('${id}','status',this.value)">${TSTAT.map(s => `<option${tval(c, 'status') === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
      <label for="tc-nt-${id}">Call notes</label><textarea id="tc-nt-${id}" rows="3" maxlength="4000" oninput="wsTcDraft('${id}','call_notes',this.value)">${e(tval(c, 'call_notes'))}</textarea>
      <div class="of-row ws-btns"><button type="button" id="tc-save-${id}" class="q-sm" onclick="wsTcSave('${id}')">Save</button></div>
      ${c.call_script ? `<details class="ws-script"><summary>Call script</summary><div class="br-val">${e(c.call_script)}</div><button type="button" class="secondary q-sm" onclick="wsTcCopy('${id}')">Copy script</button></details>` : ''}</div>`;
  }
  function titleHTML(st) {
    loadTitle();
    if (W.tc == null) return '<h3>Title companies</h3><p class="muted">Loading\u2026</p>';
    const rows = W.tc.filter(c => c.state === st), open = W.tcOpen[st] ? ' open' : '';
    return `<details class="ws-tcwrap" data-tcstate="${e(st)}"${open} ontoggle="wsTcOpen('${e(st)}', this.open)"><summary>Title companies (${rows.length})</summary>
      ${rows.length ? rows.map(tcCard).join('') : '<p class="muted">None yet. They are added with tools/title.sh.</p>'}</details>`;
  }

  // ---- Builders / buyers (per state + type tab; status, call notes and buy box editable) ----
  const BSTAT = ['To call', 'Called', 'Buy box received', 'Not buying'];
  async function loadBuilders(force) {
    if (!window.gpSb || W.blBusy || (!force && W.bl)) return; W.blBusy = true;
    try { const { data, error } = await gpSb.from('wholesale_builders').select('id,ext_id,name,state,type,phone,website,evidence_notes,buy_box,status,call_notes,call_script,updated_at').order('name');
      if (error) { W.bl = W.bl || []; say('Could not load builders.'); window.gpReportError && gpReportError(error, { op: 'wholesale_builders' }); } else W.bl = data || []; }
    finally { W.blBusy = false; } repaint();
  }
  const bget = id => (W.bl || []).find(x => x.id === id);
  const bgv = (c, k) => (W.bd[c.id] && W.bd[c.id][k] !== undefined) ? W.bd[c.id][k] : (c[k] ?? '');
  window.wsBlDraft = (id, k, v) => { (W.bd[id] = W.bd[id] || {})[k] = v; };
  window.wsBlOpen = (key, open) => { W.blOpen[key] = open; };
  window.wsBlSave = async id => {
    const c = bget(id); if (!c || !window.gpSb) return; const dr = W.bd[id] || {};
    const upd = { status: dr.status !== undefined ? dr.status : c.status, call_notes: dr.call_notes !== undefined ? dr.call_notes : c.call_notes, buy_box: dr.buy_box !== undefined ? dr.buy_box : c.buy_box };
    if (!BSTAT.includes(upd.status)) return say('Pick a valid status.');
    if (upd.call_notes != null && String(upd.call_notes).length > 4000) return say('Call notes are too long (4000 max).');
    if (upd.buy_box != null && String(upd.buy_box).length > 8000) return say('Buy box is too long (8000 max).');
    const btn = document.getElementById('bl-save-' + id); if (btn) btn.disabled = true;
    const { data, error } = await gpSb.from('wholesale_builders').update({ status: upd.status, call_notes: upd.call_notes || null, buy_box: upd.buy_box || null }).eq('id', id).select('id,status,call_notes,buy_box,updated_at');
    if (btn) btn.disabled = false;
    if (error || !data || !data.length) { say('Not saved. ' + (error ? error.message : 'No access.')); return; }
    Object.assign(c, data[0]); delete W.bd[id]; say('Saved.'); repaint();
  };
  window.wsBlCopy = async id => { const c = bget(id); if (!c || !c.call_script) return; try { await navigator.clipboard.writeText(c.call_script); say('Call script copied.'); } catch (_) { say('Copy failed. Select the text and copy it.'); } };
  const blBadge = s => `<span class="badge ws-tcs ws-bls-${e(String(s).toLowerCase().replace(/\s+/g, '-'))}">${e(s)}</span>`;
  function blCard(c) {
    const id = e(c.id), web = /^https?:\/\//i.test(c.website || '') ? c.website : '';
    return `<div class="of-item ws-bl" data-bl="${id}"><div class="uf-top"><span><b>${e(c.name)}</b></span>${blBadge(c.status)}</div>
      <div class="ws-contact">${c.phone ? `<a href="tel:${e(String(c.phone).replace(/[^0-9+]/g, ''))}">${e(c.phone)}</a>` : ''}${web ? `<a href="${e(web)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}</div>
      ${c.evidence_notes ? `<div><span class="muted">Evidence:</span> ${e(c.evidence_notes)}</div>` : ''}
      <label for="bl-st-${id}">Status</label><select id="bl-st-${id}" onchange="wsBlDraft('${id}','status',this.value)">${BSTAT.map(s => `<option${bgv(c, 'status') === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
      <label for="bl-nt-${id}">Call notes</label><textarea id="bl-nt-${id}" rows="3" maxlength="4000" oninput="wsBlDraft('${id}','call_notes',this.value)">${e(bgv(c, 'call_notes'))}</textarea>
      <details class="ws-script ws-buybox"${W.blOpen['bb' + c.id] ? 'open' : ''} ontoggle="wsBlOpen('bb${id}', this.open)"><summary>Buy box</summary>
        <textarea id="bl-bb-${id}" rows="5" maxlength="8000" aria-label="Buy box" oninput="wsBlDraft('${id}','buy_box',this.value)">${e(bgv(c, 'buy_box'))}</textarea></details>
      <div class="of-row ws-btns"><button type="button" id="bl-save-${id}" class="q-sm" onclick="wsBlSave('${id}')">Save</button></div>
      ${c.call_script ? `<details class="ws-script"><summary>Call script</summary><div class="br-val">${e(c.call_script)}</div><button type="button" class="secondary q-sm" onclick="wsBlCopy('${id}')">Copy script</button></details>` : ''}</div>`;
  }
  function buildersHTML(st, ty) {
    loadBuilders();
    if (W.bl == null) return '<h3>Builders / Buyers</h3><p class="muted">Loading\u2026</p>';
    const rows = W.bl.filter(c => c.state === st && c.type === ty), key = st + ':' + ty, open = W.blOpen[key] ? ' open' : '';
    return `<details class="ws-blwrap" data-blstate="${e(st)}" data-bltype="${ty}"${open} ontoggle="wsBlOpen('${e(key)}', this.open)"><summary>Builders / Buyers (${rows.length})</summary>
      ${rows.length ? rows.map(blCard).join('') : '<p class="muted">None yet. They are added with tools/builders.sh.</p>'}</details>`;
  }

  // ---- Leads (tap Call today / This week / Worth a look -> list, 50 at a time -> detail sheet; status + call notes editable) ----
  // wholesale_leads: tools/wholesale_leads.sh loads/refreshes the rows; the app edits status + call_notes only (a reload never touches them). Property-record facts only.
  const LSTAT = ['New', 'Called', 'Mail sent', 'Offer drafted', 'Under contract', 'Dead'], LBUCKET = ['Call today', 'This week', 'Worth a look'], LPAGE = 50;
  const LKEY = { call_today: 'Call today', week: 'This week', worth_a_look: 'Worth a look' };
  const LSORT = [['score_desc', 'Best score first'], ['score_asc', 'Lowest score first'], ['addr', 'Address A\u2013Z'], ['worked', 'Recently worked']];
  const TYNAME = t => t === 'land' ? 'Land' : 'Homes';
  const lbuck = b => ({ 'Call today': 'Call today', 'This week': 'This week', 'Worth a look': 'Worth a look' }[b] || b);
  const lstat = s => `<span class="badge ws-ls ws-ls-${e(String(s).toLowerCase().replace(/\s+/g, '-'))}">${e(s)}</span>`;
  async function loadLeadCounts(force) {
    if (!window.gpSb || W.lcBusy || (!force && W.lc)) return; W.lcBusy = true;
    try { const { data, error } = await gpSb.rpc('wholesale_leads_counts');
      if (error) { W.lc = W.lc || []; window.gpReportError && gpReportError(error, { op: 'wholesale_leads_counts' }); } else W.lc = data || []; }
    finally { W.lcBusy = false; } if (W.tab !== 'leads') repaint();
  }
  const lcRow = (st, ty, b) => (W.lc || []).find(r => r.state === st && r.type === ty && r.bucket === b);
  const lcTotal = st => (W.lc || []).filter(r => r.state === st).reduce((n, r) => n + r.n, 0);
  window.wsLeads = (st, ty, b) => { W.tab = 'leads'; closeLeadSheet(); W.ll = { state: st, type: ty, bucket: b, rows: [], total: null, q: '', sort: 'score_desc', sf: 'All', busy: false, more: false, err: '', seq: 0 }; say(''); repaint(); fetchLeads(true); window.scrollTo && window.scrollTo(0, 0); };
  window.wsLeadsBack = () => { closeLeadSheet(); W.tab = 'summary'; say(''); loadLeadCounts(true); repaint(); };
  window.wsLeadBucket = b => { const L = W.ll; if (!L || !LBUCKET.includes(b)) return; L.bucket = b; L.rows = []; L.total = null; L.err = ''; repaint(); fetchLeads(true); };
  let qTimer = null;
  window.wsLeadQ = v => { const L = W.ll; if (!L) return; L.q = v; clearTimeout(qTimer); qTimer = setTimeout(() => fetchLeads(true), 350); };
  window.wsLeadSort = v => { const L = W.ll; if (!L || !LSORT.some(x => x[0] === v)) return; L.sort = v; fetchLeads(true); };
  window.wsLeadSF = v => { const L = W.ll; if (!L) return; L.sf = v; fetchLeads(true); };
  window.wsLeadMore = () => fetchLeads(false);
  async function fetchLeads(reset) {
    const L = W.ll; if (!L || !window.gpSb) return; if (!reset && (L.more || L.rows.length >= (L.total || 0))) return;
    const seq = ++L.seq, from = reset ? 0 : L.rows.length; L.busy = true; L.more = !reset; if (reset) L.err = '';
    paintList();
    let q = gpSb.from('wholesale_leads').select('id,ext_id,state,type,market,bucket,score,address,parcel_id,why,status,touched_at', { count: 'exact' }).eq('state', L.state).eq('type', L.type).eq('bucket', L.bucket);
    if (L.sf !== 'All') q = q.eq('status', L.sf);
    const t = L.q.replace(/[,()%*\\"'_]/g, ' ').trim();
    if (t) q = q.or(`address.ilike.%${t}%,parcel_id.ilike.%${t}%,why.ilike.%${t}%`);
    if (L.sort === 'addr') q = q.order('address', { ascending: true }).order('score', { ascending: false });
    else if (L.sort === 'worked') q = q.order('touched_at', { ascending: false, nullsFirst: false }).order('score', { ascending: false });
    else q = q.order('score', { ascending: L.sort === 'score_asc' }).order('address', { ascending: true });
    const { data, error, count } = await q.range(from, from + LPAGE - 1);
    if (seq !== L.seq) return;   // a newer search/sort/filter replaced this request
    L.busy = false; L.more = false;
    if (error) { L.err = 'Could not load leads. ' + (error.message || ''); window.gpReportError && gpReportError(error, { op: 'wholesale_leads' }); }
    else { L.rows = reset ? (data || []) : L.rows.concat(data || []); L.total = count == null ? L.rows.length : count; }
    paintList();
  }
  const snip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '\u2026' : s; };
  function leadRow(r) {
    return `<button type="button" class="ws-lead" data-lead="${e(r.id)}" onclick="wsLeadOpen('${e(r.id)}')"><span class="ws-lh"><b>${e(r.address)}</b><span class="ws-score" title="Score">${e(r.score)}</span></span>
      <span class="ws-lm">${e([r.market, r.parcel_id].filter(Boolean).join(' \u00b7 '))}</span><span class="ws-lw">${e(snip(r.why, 150))}</span><span class="ws-lf">${lstat(r.status)}<span class="ws-go" aria-hidden="true">\u203a</span></span></button>`;
  }
  function listInner() {
    const L = W.ll; if (!L) return '';
    if (L.err) return `<p class="wc-flag neg">${e(L.err)}</p>`;
    if (L.total == null) return '<p class="muted">Loading\u2026</p>';
    if (!L.rows.length) return `<p class="muted">${L.q.trim() || L.sf !== 'All' ? 'No leads match this search or filter.' : 'No leads loaded here yet. Load them with tools/wholesale_leads.sh.'}</p>`;
    const left = L.total - L.rows.length;
    return `<p class="muted ws-showing" aria-live="polite">Showing ${num(L.rows.length)} of ${num(L.total)}</p>${L.rows.map(leadRow).join('')}
      ${left > 0 ? `<button type="button" class="secondary ws-more" id="wl-more" onclick="wsLeadMore()"${L.more ? ' disabled' : ''}>${L.more ? 'Loading\u2026' : 'Show ' + Math.min(LPAGE, left) + ' more (' + num(left) + ' left)'}</button>` : '<p class="muted ws-end">End of list.</p>'}`;
  }
  function paintList() { const el = document.getElementById('wl-list'); if (el) el.innerHTML = listInner(); }
  function leadsHTML() {
    const L = W.ll; if (!L) { W.tab = 'summary'; return summaryHTML(); }
    const n = b => { const r = lcRow(L.state, L.type, b); return r ? ' ' + num(r.n) : ''; };
    return `<div class="card ws-card ws-leads" data-state="${e(L.state)}" data-type="${e(L.type)}" data-bucket="${e(L.bucket)}"><div class="uf-top"><button type="button" class="secondary q-sm" onclick="wsLeadsBack()">\u2039 Wholesale Hub</button><span class="badge ws-ty">${e(L.state)} ${TYNAME(L.type)}</span></div>
      <h2>${e(L.bucket)}</h2><p class="muted">${e(STATE_NAME[L.state] || L.state)} \u00b7 ${TYNAME(L.type)}. Tap a lead for everything on it.</p>
      <div class="of-tabs ws-chips ws-bkt" role="tablist" aria-label="Bucket">${LBUCKET.map(b => `<button type="button" role="tab" aria-selected="${L.bucket === b}" class="${L.bucket === b ? 'on' : ''}" data-bucket="${e(b)}" onclick="wsLeadBucket('${e(b)}')">${e(b)}${n(b)}</button>`).join('')}</div>
      <input id="wl-q" class="ws-q" type="search" inputmode="search" autocomplete="off" placeholder="Search address, parcel or reason" aria-label="Search leads" value="${e(L.q)}" oninput="wsLeadQ(this.value)">
      <div class="ws-two"><div><label for="wl-sort">Sort</label><select id="wl-sort" onchange="wsLeadSort(this.value)">${LSORT.map(([k, t]) => `<option value="${k}"${L.sort === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
        <div><label for="wl-sf">Status</label><select id="wl-sf" onchange="wsLeadSF(this.value)">${['All'].concat(LSTAT).map(s => `<option${L.sf === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div></div>
      <div id="wl-list">${listInner()}</div></div>`;
  }

  // ---- Lead detail sheet ----
  const LABELS = { owner_flag: 'Owner type', absentee: 'Absentee owner', out_of_state: 'Out-of-state owner', tax_delinquent: 'Tax delinquent', tax_status: 'Tax status', tax_flag: 'Tax flag', tax_balance: 'Tax balance', tax_delinquent_balance: 'Tax delinquent balance',
    permits: 'Permits', permit_statuses: 'Permit status', latest_permit_year: 'Latest permit year', work: 'Permit work', upc: 'UPC', apn: 'APN', account: 'County account', county: 'County', area: 'Area / subdivision', zip: 'ZIP', acres: 'Acres', death_cert: 'Death certificate on county account',
    last_transfer_year: 'Last transfer year', last_transfer_date: 'Last transfer date', last_transfer_type: 'Last transfer type', sale_date_basis: 'Transfer date basis', violations: 'Open violations', condemned: 'Condemned', boardups: 'Board-ups', foreclosure_flag: 'Foreclosure flag',
    last_sale: 'Last sale', sqft: 'Sq ft', year_built: 'Year built', source: 'Source' };
  const DORDER = { homes: ['owner_flag', 'absentee', 'out_of_state', 'tax_delinquent', 'tax_status', 'tax_delinquent_balance', 'condemned', 'violations', 'boardups', 'foreclosure_flag', 'year_built', 'sqft', 'last_sale', 'permits', 'permit_statuses', 'latest_permit_year', 'work', 'upc', 'source'],
    land: ['county', 'area', 'zip', 'acres', 'owner_flag', 'out_of_state', 'death_cert', 'tax_delinquent', 'tax_flag', 'tax_balance', 'last_transfer_date', 'last_transfer_year', 'last_transfer_type', 'sale_date_basis', 'account'] };
  const MONEY = new Set(['tax_balance', 'tax_delinquent_balance']);
  const prettyKey = k => LABELS[k] || String(k).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  function fmtVal(k, v) {
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.join(', ');
    if (MONEY.has(k) && v !== '' && !isNaN(v)) return money(v);
    if (v && typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  const safeUrl = u => /^https?:\/\/\S+$/i.test(u) ? u : '';
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return 'link'; } };
  const links = (s, label) => String(s || '').split(/\s;\s/).map(x => x.trim()).filter(x => safeUrl(x.split(/\s+/)[0])).map(x => { const u = x.split(/\s+/)[0]; return `<a class="ws-ext" href="${e(u)}" target="_blank" rel="noopener noreferrer">${e(label)} (${e(host(u))})</a>`; });
  const ldd = () => W.lead && W.lead.dd || {};
  function closeLeadSheet() { W.lead = null; document.getElementById('ws-lead-sheet')?.remove(); document.body.classList.remove('sheet-open'); }
  window.wsLeadClose = () => { closeLeadSheet(); };
  window.wsLeadOpen = async id => {
    const row = (W.ll && W.ll.rows.find(r => r.id === id)); if (!row || !window.gpSb) return;
    W.lead = { id, row: { ...row }, full: null, deal: undefined, dd: {}, msg: '' }; paintLeadSheet(true);
    const [a, b] = await Promise.all([gpSb.from('wholesale_leads').select('*').eq('id', id).maybeSingle(), gpSb.from('wholesale_deals').select('id,ext_id,type,address,list_price,arv,max_offer,status,notes').eq('ext_id', row.ext_id).maybeSingle()]);
    if (!W.lead || W.lead.id !== id) return;
    if (a.error || !a.data) { W.lead.msg = 'Could not load the full record.' + (a.error ? ' ' + a.error.message : ''); window.gpReportError && a.error && gpReportError(a.error, { op: 'wholesale_leads_detail' }); } else W.lead.full = a.data;
    W.lead.deal = b.error ? null : (b.data || null);
    paintLeadSheet(false);
  };
  window.wsLeadDraft = (k, v) => { if (W.lead) W.lead.dd[k] = v; };
  window.wsLeadDeal = () => { const d = W.lead && W.lead.deal; if (!d) return; closeLeadSheet(); W.filter = 'All'; W.tfilter = 'All'; W.tab = 'deals'; say(''); repaint(); setTimeout(() => { const el = document.querySelector(`[data-deal="${d.id}"]`); el && el.scrollIntoView && el.scrollIntoView({ block: 'start' }); }, 400); };
  window.wsLeadSave = async () => {
    const S0 = W.lead; if (!S0 || !window.gpSb) return; const r = S0.full || S0.row, dr = S0.dd;
    const upd = { status: dr.status !== undefined ? dr.status : r.status, call_notes: dr.call_notes !== undefined ? dr.call_notes : (r.call_notes ?? '') };
    if (!LSTAT.includes(upd.status)) { S0.msg = 'Pick a valid status.'; return paintLeadSheet(false, true); }
    if (String(upd.call_notes || '').length > 4000) { S0.msg = 'Call notes are too long (4000 max).'; return paintLeadSheet(false, true); }
    const btn = document.getElementById('wl-save'); if (btn) btn.disabled = true;
    const { data, error } = await gpSb.from('wholesale_leads').update({ status: upd.status, call_notes: upd.call_notes || null }).eq('id', S0.id).select('id,status,call_notes,touched_at');
    if (btn) btn.disabled = false;
    if (!W.lead || W.lead.id !== S0.id) return;
    if (error || !data || !data.length) { S0.msg = 'Not saved. ' + (error ? error.message : 'No access.'); return paintLeadSheet(false, true); }
    Object.assign(S0.row, data[0]); if (S0.full) Object.assign(S0.full, data[0]);
    const lr = W.ll && W.ll.rows.find(x => x.id === S0.id); if (lr) Object.assign(lr, { status: data[0].status, touched_at: data[0].touched_at });
    S0.dd = {}; S0.msg = 'Saved.'; paintLeadSheet(false, true); paintList(); loadLeadCounts(true);
  };
  function paintLeadSheet(animate, keepScroll) {
    const S0 = W.lead, prev = document.getElementById('ws-lead-sheet'), scroll = (animate ? 0 : prev?.querySelector('.sheet-body')?.scrollTop) || 0; prev?.remove();
    if (!S0) return; document.body.classList.add('sheet-open');
    const r = S0.full || S0.row, det = (S0.full && S0.full.details) || {}, dr = S0.dd;
    const stv = dr.status !== undefined ? dr.status : r.status, ntv = dr.call_notes !== undefined ? dr.call_notes : (r.call_notes || '');
    const order = DORDER[r.type] || [], keys = order.filter(k => det[k] !== undefined && det[k] !== null && det[k] !== '').concat(Object.keys(det).filter(k => !order.includes(k) && det[k] !== null && det[k] !== ''));
    const facts = [['Parcel', r.parcel_id], ['Market', r.market], ['Type', `${r.state} ${TYNAME(r.type)}`]].concat(keys.map(k => [prettyKey(k), fmtVal(k, det[k])]), S0.full ? [['Data as of', r.data_date]] : []).filter(([, v]) => v);
    const why = String(r.why || '').split(/;\s+/).map(x => x.trim()).filter(Boolean);
    const lk = links(r.source_url, 'Source').concat(links(r.assessor_url, 'Assessor / parcel record'));
    const d = S0.deal;
    const dealBox = d === undefined ? '<p class="muted">Checking for a deal\u2026</p>' : d ? `<div class="ws-dealbox"><div class="uf-top"><b>${e(d.address || d.ext_id)}</b>${badge(d.status)}</div>
        <div class="ws-facts"><div><span>ARV</span><b>${money(d.arv)}</b></div><div><span>List</span><b>${money(d.list_price)}</b></div><div><span>Max offer</span><b>${money(d.max_offer)}</b></div></div>
        <button type="button" class="secondary q-sm" id="wl-deal" onclick="wsLeadDeal()">Open deal \u203a</button></div>` : '<p class="muted">No deal on this lead yet. When one is added with the same ID it shows up here.</p>';
    const el = document.createElement('div'); el.id = 'ws-lead-sheet'; el.className = 'sheet ws-sheet' + (animate ? ' anim' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Lead detail');
    el.innerHTML = `<div class="sheet-head"><button class="sheet-back" type="button" onclick="wsLeadClose()" aria-label="Back to leads">\u2039 Leads</button><span>${lstat(r.status)}</span></div>
      <div class="sheet-body"><h2 class="sheet-title">${e(r.address)}</h2>
        <div class="ws-chipline"><span class="badge ws-bk ws-bk-${e(String(r.bucket).toLowerCase().replace(/\s+/g, '-'))}">${e(lbuck(r.bucket))}</span><span class="badge">Score ${e(r.score)}</span><span class="badge">${e(r.state)} ${TYNAME(r.type)}</span></div>
        ${S0.msg ? `<div class="muted q-rt" id="wl-msg" aria-live="polite">${e(S0.msg)}</div>` : '<div id="wl-msg" class="muted q-rt" aria-live="polite"></div>'}
        <h3>Why it is a lead</h3>${why.length ? `<ul class="check ws-why">${why.map(x => `<li>${e(x)}</li>`).join('')}</ul>` : '<p class="muted">No reason recorded.</p>'}
        ${r.note ? `<h3>Note</h3><p class="sheet-text">${e(r.note)}</p>` : ''}
        <h3>Property facts</h3>${S0.full ? '' : '<p class="muted">Loading the rest\u2026</p>'}<dl class="facts ws-dl">${facts.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')}</dl>
        <h3>Links</h3>${lk.length ? `<div class="links ws-links2">${lk.join('')}</div>` : '<p class="muted">No links.</p>'}
        <h3>Deal</h3>${dealBox}
        <h3>Status</h3><select id="wl-st" aria-label="Status" onchange="wsLeadDraft('status',this.value)">${LSTAT.map(s => `<option${stv === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
        <h3>Call notes</h3><textarea id="wl-nt" rows="5" maxlength="4000" placeholder="Who you talked to, what they said, next step" oninput="wsLeadDraft('call_notes',this.value)">${e(ntv)}</textarea>
        <p class="muted ws-priv">Public records only. Owner names and mailing addresses are not stored in the app.</p></div>
      <div class="sheet-actions"><button type="button" class="secondary" onclick="wsLeadClose()">Close</button><button type="button" class="primary" id="wl-save" onclick="wsLeadSave()">Save</button></div>`;
    const nav = document.getElementById('sec-nav'); if (nav && !nav.classList.contains('hidden')) el.style.setProperty('bottom', nav.getBoundingClientRect().height + 'px', 'important');   // beats the global '.sheet { bottom:0 !important }' so Save is not under the nav
    document.body.appendChild(el);
    if (scroll) el.querySelector('.sheet-body').scrollTop = scroll;
  }
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && W.lead) closeLeadSheet(); });
  document.addEventListener('click', ev => { if (W.lead && ev.target.closest && ev.target.closest('#main-nav, #sec-nav')) closeLeadSheet(); }, true);

  function summaryHTML() {
    load(); loadLeadCounts();
    const D = W.d, TC = W.tc || [], BL = W.bl || [];
    const states = D ? Array.from(new Set(Object.keys(D).concat(['NM', 'OH'], TC.map(c => c.state), BL.map(c => c.state)))).filter(st => D[st] || st === 'NM' || st === 'OH' || TC.some(c => c.state === st) || BL.some(c => c.state === st)).sort((x, y) => stOrder(x).localeCompare(stOrder(y))) : [];
    const group = st => { const byT = D[st] || {}, hasLand = !!byT.land || BL.some(c => c.state === st && c.type === 'land'), tabbed = st === 'NM' || hasLand, cur = tabbed && W.st[st] === 'land' ? 'land' : 'homes';
      const d = byT[cur] || {}, v = k => d[k] ? d[k].value : null, upd = Object.values(d).map(r => r.updated_at).filter(Boolean).sort().pop();
      const stat = (k, label, hot) => `<div class="t-stat${hot ? ' hot' : ''}" data-ws="${k}"><b>${num(v(k))}</b><span>${label}</span></div>`;
      const lstatBtn = (k, label, hot) => { const lr = lcRow(st, cur, LKEY[k]), val = lr ? lr.n : v(k);
        return `<button type="button" class="t-stat ws-tap${hot ? ' hot' : ''}" data-ws="${k}" data-lead="${LKEY[k]}" aria-label="${label}: ${val == null ? 'none' : val}. Show the leads" onclick="wsLeads('${e(st)}','${cur}','${LKEY[k]}')"><b>${num(val)}</b><span>${label}</span><i aria-hidden="true">View \u203a</i></button>`; };
      const tabs = tabbed ? `<div class="of-tabs ws-types" role="tablist" aria-label="Type">${[['homes', 'Homes'], ['land', 'Land']].map(([t, n]) => `<button type="button" role="tab" aria-selected="${cur === t}" class="${cur === t ? 'on' : ''}" data-type="${t}" onclick="wsType('${e(st)}','${t}')">${n}</button>`).join('')}</div>` : '';
      return `<div class="card ws-card ws-state" data-state="${e(st)}" data-type="${cur}"><h2>${e(STATE_NAME[st] || st)}</h2>${tabs}
        <h3>Listings</h3><div class="t-stats ws-stats">${stat('listings', 'Listings considered')}</div>
        <h3>Leads</h3><div class="t-stats ws-stats">${lstatBtn('call_today', 'Call today', 1)}${lstatBtn('week', 'This week')}${lstatBtn('worth_a_look', 'Worth a look')}</div>
        ${upd ? `<p class="muted ws-upd">Updated ${e(stamp(upd))} (Denver time)</p>` : ''}
        ${st === 'NM' || st === 'OH' || BL.some(c => c.state === st) ? buildersHTML(st, cur) : ''}
        ${st === 'NM' || st === 'OH' || TC.some(c => c.state === st) ? titleHTML(st) : ''}</div>`; };
    return `<div class="card ws-card"><div class="uf-top"><h2>Wholesale Hub</h2><button type="button" class="secondary q-sm" onclick="wsRefresh()">Refresh</button></div>
      <p class="muted">Summary numbers by state. Owner access only.</p></div>
      ${D == null ? '<div class="card ws-card"><p class="muted">Loading\u2026</p></div>' : states.map(group).join('')}
      <div class="card ws-card"><h2>Tools</h2><div class="ws-links">${[['calc', 'Deal Calculator', 'Max offer, spread, double close'], ['deals', 'Deal Tracker', 'Status and notes on every deal'], ['buyers', 'Buyers', 'Buy-box list and intake']].map(([k, n, s2]) => `<button type="button" class="ws-link" onclick="wsTab('${k}')"><span class="ws-ln"><b>${n}</b><small>${s2}</small></span><span>Open \u203a</span></button>`).join('')}</div></div>`;
  }
  function html() {
    const body = W.tab === 'leads' ? leadsHTML() : W.tab === 'calc' ? calcHTML() : W.tab === 'deals' ? dealsHTML() : W.tab === 'buyers' ? buyersHTML() : summaryHTML();
    return `<div class="of-tabs ws-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" aria-selected="${W.tab === k}" class="${W.tab === k ? 'on' : ''}" onclick="wsTab('${k}')">${n}</button>`).join('')}</div>
      <div id="ws-msg" class="muted q-rt" aria-live="polite">${e(W.msg)}</div>${body}`;
  }
  hubRegister({ id: 'wholesale', name: 'Wholesale Hub', desc: 'Deal calculator, deal tracker, buyers. Owner only', page: 'wholesale', pages: ['wholesale'], access: true,
    visible: () => hubAccess('wholesale'), render: html });
})();
