// Gatepost Owners Hub: hub registry + main page (hub tiles) + hub navigation. Owners only (profiles.is_owner).
// Each hub lives in its own module and registers itself here, so adding a hub later = one new file + one hubRegister() call + one nav button.
//   hubRegister({ id, name, desc, page, pages, visible(), render(pageId), access? })
//   id     unique key; page = entry page id (also a hidden #main-nav button[data-page]); pages = every page id the hub owns
//   visible() decides whether the tile/nav entry shows; render(pageId) returns the hub page HTML; access = row in hub_access (db-enforced, optional)
// Admin Hub = every existing admin screen (Today, Sales, Schedule, Inbox, Office...), unchanged. Team Hub: hub-team.js. Wholesale Hub: hub-wholesale.js.
(function () {
  const H = window.HUBS = { list: [], access: null, busy: false };
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const own = () => typeof isOwner === 'function' && isOwner();
  const byId = id => H.list.find(h => h.id === id);
  window.hubRegister = h => { H.list = H.list.filter(x => x.id !== h.id).concat(h); };
  const hubOf = pg => H.list.find(h => h.id !== 'adminhub' && (h.pages || [h.page]).includes(pg));
  const isHubPage = pg => pg === 'hubs' || !!hubOf(pg);
  const vis = h => { try { return !!h.visible(); } catch (_) { return false; } };

  // Which hubs this user has database-level access to (own rows of hub_access; RLS returns only the signed-in user's rows).
  window.hubAccess = key => !!(H.access && H.access[key]);
  async function loadAccess() {
    if (H.access || H.busy || !window.gpSb || !own()) return;
    H.busy = true;
    try { const { data, error } = await gpSb.from('hub_access').select('hub'); H.access = {}; if (!error) (data || []).forEach(r => { H.access[r.hub] = true; }); }
    catch (_) { H.access = {}; } finally { H.busy = false; }
    const pg = typeof page === 'function' ? page() : ''; if (isHubPage(pg) && typeof render === 'function') render();
  }

  // Admin Hub: all existing admin screens, nothing removed. Entry = Today.
  hubRegister({ id: 'adminhub', name: 'Admin Hub', desc: 'Today, Sales, Schedule, Inbox, Office, AI: the whole admin app', page: 'town', pages: [], visible: () => own(),
    stat: () => { const n = window.gpInboxCount ? gpInboxCount() : 0; return n ? `${n} waiting on you` : ''; } });

  window.hubOpen = id => { const h = byId(id); const pg = id === 'hubs' ? 'hubs' : h && h.page; if (pg) (window.townGo ? townGo(pg) : document.querySelector(`#main-nav button[data-page="${pg}"]`)?.click()); };

  // Called from render() for hub pages; null = not a hub page (render the normal admin screens).
  window.hubPageFor = pg => {
    if (!isHubPage(pg)) return null;
    if (!own()) return '<div class="card"><h2>Owners Hub</h2><p class="muted">Owners only.</p></div>';
    loadAccess();
    if (pg === 'hubs') return mainPage();
    const h = hubOf(pg);
    if (h.access && H.access == null) return `<div class="card"><h2>${e(h.name)}</h2><p class="muted">Loading\u2026</p></div>`;
    if (!vis(h)) return `<div class="card"><h2>${e(h.name)}</h2><p class="muted">Not available for your account.</p></div>`;
    return `<section class="hub-page" data-hub="${e(h.id)}">${h.render(pg)}</section>`;
  };
  function mainPage() {
    const name = S.me && S.me.email ? e(S.me.email.split('@')[0]) : '';
    const tiles = H.list.filter(vis).map(h => { const st = h.stat ? h.stat() : '';
      return `<button type="button" class="hub-tile" data-hub="${e(h.id)}" onclick="hubOpen('${e(h.id)}')"><b>${e(h.name)}</b><span>${e(h.desc)}</span>${st ? `<i class="hub-n">${e(st)}</i>` : ''}<em class="hub-go" aria-hidden="true">\u203a</em></button>`; }).join('');
    return `<section class="home hubs"><div class="home-hello"><h1>Owners Hub</h1><p class="muted">${name ? 'Welcome, ' + name + ' \u00b7 ' : ''}Gatepost Property Services \u00b7 Rio Rancho &amp; Albuquerque</p></div>
      <div class="hub-tiles">${tiles}</div></section>`;
  }

  // First screen for owners = Owners Hub (once per page load, only when no #hash was asked for).
  let landed = false;
  window.hubLanding = () => { if (landed || typeof S === 'undefined' || !S.me || !S.me.access || !own()) return; landed = true;
    if (location.hash.length > 1) return;
    document.querySelectorAll('#main-nav button').forEach(b => b.classList.toggle('active', b.dataset.page === 'hubs')); };

  // Bottom bar, used by simplify.js paintNav(): on hub pages the hub bar replaces the section bar; on admin pages a "Hubs" button leads it.
  window.hubNav = (nav, sub) => { const pg = typeof page === 'function' ? page() : ''; if (!own() || !isHubPage(pg)) return false;
    const cur = pg === 'hubs' ? 'hubs' : hubOf(pg).id;
    nav.innerHTML = [`<button type="button" data-sec="hubs" class="${cur === 'hubs' ? 'on' : ''}" onclick="hubOpen('hubs')" aria-current="${cur === 'hubs' ? 'page' : 'false'}">Hubs</button>`]
      .concat(H.list.filter(vis).map(h => `<button type="button" data-sec="${e(h.id)}" class="${cur === h.id ? 'on' : ''}" onclick="hubOpen('${e(h.id)}')" aria-current="${cur === h.id ? 'page' : 'false'}">${e(h.name.replace(' Hub', ''))}</button>`)).join('');
    nav.classList.remove('hidden'); sub.innerHTML = ''; return true; };
  window.hubNavLead = () => own() ? '<button type="button" data-sec="hubs" class="hub-lead" onclick="hubOpen(\'hubs\')" aria-label="Owners Hub">Hubs</button>' : '';
})();
