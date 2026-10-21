// Gatepost "Unfinished" screen (admin only): things Christian started with a bot that aren't finished yet.
// Bots write via tools/unfinished.sh (token RPCs unfinished_upsert / unfinished_close / unfinished_aborted). No push, no polling.
(function () {
  const U = window.UF = { list: null, at: 0, busy: false, inbox: null, draft: '' };
  const ALFRED = '7ed5d130-2b5c-4285-9285-1e9b8b65814b';
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = d => new Date(d).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const prompt = it => 'Continue where you left off on: ' + it.summary + '. Last state: ' + (it.state || 'not recorded') + '.';
  const link = it => 'grokbot://app/v1/agent?id=' + encodeURIComponent(it.agent_id);
  window.ufPrompt = prompt; window.ufLink = link;
  const isAdm = () => typeof S !== 'undefined' && S.me && S.me.role === 'admin';
  function card(it, hist) {
    return `<div class="uf-item${hist ? ' uf-hist' : ''}"><div class="uf-top"><b>${e(it.bot_name)}</b><span class="muted">${e(day(it.updated_at || it.created_at))}</span></div>
      <div class="uf-sum">${e(it.summary)}</div>${it.state ? `<div class="muted uf-st">Last state: ${e(it.state)}</div>` : ''}
      ${hist ? '' : `<div class="uf-pr"><div class="uf-prt">${e(prompt(it))}</div><button type="button" class="secondary q-sm" onclick="ufCopy(${it.id})">Copy</button></div>`}
      ${hist ? `<div class="muted uf-st">${it.status === 'aborted' ? 'Aborted ' + e(day(it.aborted_at)) : 'Done'}</div>` : `<div class="q-actions"><button type="button" class="primary" onclick="ufContinue(${it.id})">CONTINUE</button><button class="secondary" onclick="ufAbort(${it.id})">ABORT</button></div>`}</div>`;
  }
  window.unfinishedPage = function () {
    if (!isAdm()) return '<div class="card" id="uf-root"><h2>Unfinished</h2><p class="muted">Admins only.</p></div>';
    if ((U.list === null || Date.now() - U.at > 20000) && !U.busy) setTimeout(load, 0);
    const L = U.list || [], open = L.filter(x => x.status === 'open'), hist = L.filter(x => x.status !== 'open').slice(0, 20);
    return `<div id="uf-root">${inboxHTML()}<div class="card"><h2>Unfinished</h2><p class="muted">Work you started with a bot that isn't finished. CONTINUE copies a pick-up prompt and opens that bot.</p>
      <div id="uf-msg" class="muted q-rt" aria-live="polite"></div>
      ${U.list === null ? '<p class="muted">Loading\u2026</p>' : open.length ? open.map(x => card(x)).join('') : '<p class="muted">Nothing unfinished.</p>'}</div>
      <div class="card"><details class="uf-h"><summary>History (${hist.length} done / aborted)</summary>${hist.length ? hist.map(x => card(x, 1)).join('') : '<p class="muted">None yet.</p>'}</details></div></div>`;
  };
  function inboxHTML() { const I = U.inbox, un = (I || []).filter(x => !x.sent_at), sent = (I || []).filter(x => x.sent_at).slice(0, 30);
    return `<div class="card" id="ib-card"><h2>Prompts for Alfred</h2><p class="muted">Jot prompts for Alfred, then send them all as one message.</p>
      <textarea id="ib-new" rows="3" placeholder="Type a prompt\u2026" oninput="UF.draft=this.value">${e(U.draft)}</textarea>
      <div class="q-actions"><button type="button" class="secondary" onclick="ibAdd()">Add</button><button type="button" class="primary" onclick="ibSend()"${un.length ? '' : ' disabled'}>Send to Alfred${un.length ? ' (' + un.length + ')' : ''}</button></div>
      ${I === null ? '<p class="muted">Loading\u2026</p>' : un.length ? `<ol class="ib-list">${un.map(x => `<li><span class="ib-t">${e(x.text)}</span><button type="button" class="ib-x" aria-label="Delete prompt" onclick="ibDel(${x.id})">\u00d7</button></li>`).join('')}</ol>` : '<p class="muted">No unsent prompts.</p>'}
      <details class="uf-h ib-h"><summary>Sent (${sent.length})</summary>${sent.length ? `<ul class="ib-list ib-sent">${sent.map(x => `<li><span class="ib-t">${e(x.text)}</span><span class="muted uf-st">${e(day(x.sent_at))}</span></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}</details></div>`; }
  async function loadInbox() { if (!window.gpSb) { U.inbox = []; return; } const { data, error } = await gpSb.from('prompt_inbox').select('*').order('created_at', { ascending: true }).limit(200);
    if (error) { U.inbox = U.inbox || []; window.gpReportError && gpReportError(error, { op: 'prompt_inbox' }); } else U.inbox = data || []; }
  window.ibAdd = async function () { const ta = document.getElementById('ib-new'), t = (ta ? ta.value : U.draft).trim(); if (!t) return;
    const { data, error } = await gpSb.from('prompt_inbox').insert({ text: t }).select('*').single(); if (error) return toast('Not added: ' + error.message);
    U.draft = ''; U.inbox = [...(U.inbox || []), data]; paint(); };
  window.ibDel = async function (id) { const { error } = await gpSb.from('prompt_inbox').delete().eq('id', id).is('sent_at', null); if (error) return toast('Not deleted: ' + error.message); U.inbox = (U.inbox || []).filter(x => x.id !== id); paint(); };
  // Same copy routine + delay as CONTINUE.
  window.ibSend = function () { const un = (U.inbox || []).filter(x => !x.sent_at); if (!un.length) return;
    const text = un.map((x, i) => (i + 1) + '. ' + x.text).join('\n'); window.ibLastText = text;
    const c = copyNow(text); report(c); const now = new Date().toISOString(), ids = un.map(x => x.id);
    gpSb.from('prompt_inbox').update({ sent_at: now }).in('id', ids).is('sent_at', null).then(({ error }) => { if (error) return toast('Copied, but not marked sent: ' + error.message); un.forEach(x => { x.sent_at = now; }); paint(); });
    setTimeout(() => { window.ufLastNav = 'grokbot://app/v1/agent?id=' + ALFRED; location.href = window.ufLastNav; }, 600); };
  async function load() { if (!window.gpSb) { U.list = []; return paint(); } U.busy = true;
    const [{ data, error }] = await Promise.all([gpSb.from('unfinished').select('*').order('updated_at', { ascending: false }).limit(100), loadInbox()]);
    U.busy = false; U.at = Date.now(); if (error) { U.list = U.list || []; window.gpReportError && gpReportError(error, { op: 'unfinished' }); } else U.list = data || []; paint(); }
  window.ufLoad = () => { if (!U.busy && (U.list === null || Date.now() - U.at > 20000)) load(); };
  function paint() { if (typeof page === 'function' && ['town', 'inbox'].includes(page())) return render(); if (typeof page === 'function' && page() !== 'unfinished') return; const m = document.getElementById('app'); if (m && document.getElementById('uf-root')) { const op = [...m.querySelectorAll('details')].map(d => d.open), f = document.activeElement && document.activeElement.id === 'ib-new'; m.innerHTML = unfinishedPage(); m.querySelectorAll('details').forEach((d, i) => { if (op[i]) d.open = true; }); if (f) document.getElementById('ib-new')?.focus(); } }
  const msg = t => { const el = document.getElementById('uf-msg'); if (el) el.textContent = t; };
  // iOS-reliable copy: must run synchronously inside the click, before any await/navigation.
  function execCopy(t) { const ta = document.createElement('textarea'); ta.value = t; ta.contentEditable = 'true'; ta.readOnly = false;
    ta.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:0;outline:0;box-shadow:none;background:transparent;opacity:0;font-size:16px;z-index:-1';
    document.body.appendChild(ta); let ok = false;
    try { ta.focus({ preventScroll: true }); const r = document.createRange(); r.selectNodeContents(ta); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); ta.setSelectionRange(0, t.length); ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); try { window.getSelection().removeAllRanges(); } catch (_) {} if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return ok; }
  function copyNow(t) { const ok = execCopy(t); let p = null; try { if (navigator.clipboard && navigator.clipboard.writeText) p = navigator.clipboard.writeText(t); } catch (_) {}
    return { ok, p: p ? p.then(() => true, () => false) : Promise.resolve(false) }; }
  function toast(t) { let el = document.getElementById('uf-toast'); if (!el) { el = document.createElement('div'); el.id = 'uf-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); }
  const report = (c, after) => { if (c.ok) { toast('Copied'); after && after(true); } else c.p.then(ok2 => { toast(ok2 ? 'Copied' : 'Copy failed - select the text and copy it'); after && after(ok2); }); };
  window.ufCopy = function (id) { const it = (U.list || []).find(x => x.id === id); if (!it) return; report(copyNow(prompt(it))); };
  // Copy synchronously first, then open the bot ~600ms later so the navigation can't cancel the copy.
  window.ufContinue = function (id) { const it = (U.list || []).find(x => x.id === id); if (!it) return;
    const c = copyNow(prompt(it)); window.ufLastNav = null;
    report(c, ok => msg(ok ? 'Prompt copied. Opening ' + it.bot_name + '\u2026 paste it there.' : 'Could not copy automatically - copy the text in the box by hand.'));
    setTimeout(() => { window.ufLastNav = link(it); location.href = link(it); }, 600); };
  window.ufAbort = async function (id) { const it = (U.list || []).find(x => x.id === id); if (!it) return;
    if (!confirm('Abort "' + it.summary + '"? ' + it.bot_name + ' will be told to stop.')) return;
    const now = new Date().toISOString(); const { error } = await gpSb.from('unfinished').update({ status: 'aborted', aborted_at: now, updated_at: now }).eq('id', id).eq('status', 'open');
    if (error) return msg('Not aborted: ' + error.message); it.status = 'aborted'; it.aborted_at = now; it.updated_at = now; paint(); };
})();
