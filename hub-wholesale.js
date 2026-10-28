// Wholesale Hub (Christian only). Summary numbers + two links. Never names or addresses.
// Data: public.wholesale_stats (key,value). RLS = has_hub('wholesale') (hub_access row AND profiles.is_owner), so other owners/admins read nothing.
// Numbers are set by tools/wholesale.sh on the shared box.
(function () {
  const W = window.WS = { d: null, at: 0, busy: false };
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => v == null ? '\u2014' : Number(v).toLocaleString('en-US');
  const LINKS = [['Dex Deal Tracker', 'https://cursor.com/canvas/store-5e87a1d6-2ddb-4e93-9086-c0724eb1753d/c25f4dd2-c36a-4f35-af95-a2bd2e0b396a'],
    ['Buyers & Deal Calculator', 'https://cursor.com/canvas/store-5e87a1d6-2ddb-4e93-9086-c0724eb1753d/75cf8dfd-d5a4-4d1f-a10a-15fe9efaf89c']];
  async function load(force) {
    if (!window.gpSb || W.busy || (!force && W.d && Date.now() - W.at < 20000)) return;
    W.busy = true;
    try { const { data, error } = await gpSb.from('wholesale_stats').select('key,value,updated_at'); W.d = error ? (W.d || {}) : Object.fromEntries((data || []).map(r => [r.key, r])); W.at = Date.now(); if (error && window.gpReportError) gpReportError(error, { op: 'wholesale' }); }
    finally { W.busy = false; }
    if (typeof page === 'function' && page() === 'wholesale') render();
  }
  window.wsRefresh = () => load(true);
  function html() {
    load();
    const d = W.d, v = k => d && d[k] ? d[k].value : null;
    const upd = d ? Object.values(d).map(r => r.updated_at).filter(Boolean).sort().pop() : null;
    const stat = (k, label, hot) => `<div class="t-stat${hot ? ' hot' : ''}" data-ws="${k}"><b>${d ? num(v(k)) : '\u2026'}</b><span>${label}</span></div>`;
    return `<div class="card ws-card"><div class="uf-top"><h2>Wholesale Hub</h2><button type="button" class="secondary q-sm" onclick="wsRefresh()">Refresh</button></div>
      <p class="muted">Summary only. Owner access only.</p>
      <h3>Listings</h3><div class="t-stats ws-stats">${stat('listings', 'Listings considered')}</div>
      <h3>Leads</h3><div class="t-stats ws-stats">${stat('call_today', 'Call today', 1)}${stat('week', 'This week')}${stat('worth_a_look', 'Worth a look')}</div>
      ${upd ? `<p class="muted ws-upd">Updated ${e(new Date(upd).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))} (Denver time)</p>` : ''}</div>
      <div class="card ws-card"><h2>Tools</h2><div class="ws-links">${LINKS.map(([n, u]) => `<a class="ws-link" href="${e(u)}" target="_blank" rel="noopener noreferrer"><b>${e(n)}</b><span>Open \u203a</span></a>`).join('')}</div></div>`;
  }
  hubRegister({ id: 'wholesale', name: 'Wholesale Hub', desc: 'Lead and listing summary numbers. Owner only', page: 'wholesale', pages: ['wholesale'], access: true,
    visible: () => hubAccess('wholesale'), render: html });
})();
