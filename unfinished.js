// Gatepost "Unfinished" screen (admin only): things Christian started with a bot that aren't finished yet.
// Bots write via tools/unfinished.sh (token RPCs unfinished_upsert / unfinished_close / unfinished_aborted). No push, no polling.
(function () {
  const U = window.UF = { list: null, at: 0, busy: false };
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = d => new Date(d).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const prompt = it => 'Continue where you left off on: ' + it.summary + '. Last state: ' + (it.state || 'not recorded') + '.';
  const link = it => 'grokbot://app/v1/agent?id=' + encodeURIComponent(it.agent_id);
  window.ufPrompt = prompt; window.ufLink = link;
  const isAdm = () => typeof S !== 'undefined' && S.me && S.me.role === 'admin';
  function card(it, hist) {
    return `<div class="uf-item${hist ? ' uf-hist' : ''}"><div class="uf-top"><b>${e(it.bot_name)}</b><span class="muted">${e(day(it.updated_at || it.created_at))}</span></div>
      <div class="uf-sum">${e(it.summary)}</div>${it.state ? `<div class="muted uf-st">Last state: ${e(it.state)}</div>` : ''}
      ${hist ? `<div class="muted uf-st">${it.status === 'aborted' ? 'Aborted ' + e(day(it.aborted_at)) : 'Done'}</div>` : `<div class="q-actions"><button class="primary" onclick="ufContinue(${it.id})">CONTINUE</button><button class="secondary" onclick="ufAbort(${it.id})">ABORT</button></div>`}</div>`;
  }
  window.unfinishedPage = function () {
    if (!isAdm()) return '<div class="card" id="uf-root"><h2>Unfinished</h2><p class="muted">Admins only.</p></div>';
    if ((U.list === null || Date.now() - U.at > 20000) && !U.busy) setTimeout(load, 0);
    const L = U.list || [], open = L.filter(x => x.status === 'open'), hist = L.filter(x => x.status !== 'open').slice(0, 20);
    return `<div id="uf-root"><div class="card"><h2>Unfinished</h2><p class="muted">Work you started with a bot that isn't finished. CONTINUE copies a pick-up prompt and opens that bot.</p>
      <div id="uf-msg" class="muted q-rt" aria-live="polite"></div>
      ${U.list === null ? '<p class="muted">Loading\u2026</p>' : open.length ? open.map(x => card(x)).join('') : '<p class="muted">Nothing unfinished.</p>'}</div>
      <div class="card"><details class="uf-h"><summary>History (${hist.length} done / aborted)</summary>${hist.length ? hist.map(x => card(x, 1)).join('') : '<p class="muted">None yet.</p>'}</details></div></div>`;
  };
  async function load() { if (!window.gpSb) { U.list = []; return paint(); } U.busy = true;
    const { data, error } = await gpSb.from('unfinished').select('*').order('updated_at', { ascending: false }).limit(100);
    U.busy = false; U.at = Date.now(); if (error) { U.list = U.list || []; window.gpReportError && gpReportError(error, { op: 'unfinished' }); } else U.list = data || []; paint(); }
  function paint() { if (typeof page === 'function' && page() !== 'unfinished') return; const m = document.getElementById('app'); if (m && document.getElementById('uf-root')) { const op = m.querySelector('.uf-h')?.open; m.innerHTML = unfinishedPage(); if (op) m.querySelector('.uf-h').open = true; } }
  const msg = t => { const el = document.getElementById('uf-msg'); if (el) el.textContent = t; };
  async function copy(t) { try { await navigator.clipboard.writeText(t); return true; } catch (_) {
    const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} ta.remove(); return ok; } }
  // Copy first, then navigate.
  window.ufContinue = async function (id) { const it = (U.list || []).find(x => x.id === id); if (!it) return;
    const ok = await copy(prompt(it)); msg(ok ? 'Prompt copied. Opening ' + it.bot_name + '\u2026 paste it there.' : 'Could not copy automatically. Prompt: ' + prompt(it));
    window.ufLastNav = link(it); location.href = link(it); };
  window.ufAbort = async function (id) { const it = (U.list || []).find(x => x.id === id); if (!it) return;
    if (!confirm('Abort "' + it.summary + '"? ' + it.bot_name + ' will be told to stop.')) return;
    const now = new Date().toISOString(); const { error } = await gpSb.from('unfinished').update({ status: 'aborted', aborted_at: now, updated_at: now }).eq('id', id).eq('status', 'open');
    if (error) return msg('Not aborted: ' + error.message); it.status = 'aborted'; it.aborted_at = now; it.updated_at = now; paint(); };
})();
