// Gatepost Home: customer app. Same Supabase project as the team hub; RLS limits every query to the signed-in customer's own rows.
'use strict';
const CFG = window.GATEPOST_CONFIG || {};
if (!window.supabase) document.getElementById('app').innerHTML = '<div class="card"><h2>You are offline</h2><p class="muted">Gatepost Home needs a connection to load your account. Reconnect and reopen the app, or call (505) 750-3019.</p></div>';
const sb = window.supabase && window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage, storageKey: 'gatepost-home-auth' } });
const PHONE = '(505) 750-3019', TEL = 'tel:+15057503019';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { new: 'Received', reviewing: 'Reviewing', scheduled: 'Scheduled', done: 'Done', closed: 'Closed', canceled: 'Canceled' };
const TYPE = { repair: 'Repair', urgent: 'Urgent', addon: 'Add-on', cancel: 'Cancel request' };
const fmtDay = d => new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const fmtDT = d => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// Billing (Stripe TEST mode): the create-checkout edge function makes a Checkout Session or a Customer Portal session.
// The stripe-webhook function writes plan/subscription status back to customer_profiles.
const hasSub = () => !!(S.prof && S.prof.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(S.prof.subscription_status));
async function billing(body) {
  const { data, error } = await sb.functions.invoke('create-checkout', { body });
  if (error) { let msg = error.message, status = error.context && error.context.status;
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) {}
    const e = new Error(msg); e.status = status; throw e; }
  if (!data || !data.url) throw new Error((data && data.error) || 'Billing is not available right now.');
  location.href = data.url;
}
async function startCheckout(plan) { return billing({ action: 'checkout', plan }); }
async function openBillingPortal() {
  if (BUSY) return; BUSY = true;
  try { await billing({ action: 'portal' }); } catch (e) { toast(e.message); } finally { BUSY = false; }
}

let S = { user: null, role: null, prof: null, reqs: [], visits: [], contracts: [] };
let TAB = 'home', AUTH_MODE = 'signin', BUSY = false, channel = null;

// ---------- Data ----------
async function load() {
  const { data: { user }, error } = await sb.auth.getUser();
  // Network failure (not a sign-out): keep the session and show an offline note instead of the sign-in screen.
  S.offline = !user && !!error && !/session|jwt|token|auth/i.test(error.message || '') && !!(await sb.auth.getSession()).data.session;
  if (S.offline) return;
  S.user = user || null; if (!user) { S.role = null; return; }
  const { data: p } = await sb.from('profiles').select('role,email').eq('id', user.id).maybeSingle();
  S.role = p ? p.role : null; if (S.role !== 'customer') return;
  const [prof, reqs, visits, contracts] = await Promise.all([
    sb.from('customer_profiles').select('*').eq('id', user.id).maybeSingle(),
    sb.from('customer_requests').select('*').order('created_at', { ascending: false }),
    sb.from('customer_visits').select('*').order('scheduled_for'),
    sb.from('customer_contracts').select('*').order('created_at', { ascending: false })]);
  S.prof = prof.data || null; S.visits = visits.data || []; S.contracts = contracts.data || [];
  const rows = reqs.data || [], paths = rows.flatMap(r => r.photos || []), urls = {};
  if (paths.length) { const { data } = await sb.storage.from('customer-photos').createSignedUrls(paths, 3600); (data || []).forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; }); }
  S.reqs = rows.map(r => ({ ...r, photoUrls: (r.photos || []).map(p => urls[p]).filter(Boolean) }));
}
async function subscribe() {
  if (channel) { await sb.removeChannel(channel); channel = null; }
  const { data: { session } } = await sb.auth.getSession(); if (!session) return;
  sb.realtime.setAuth(session.access_token);
  let t = null; const bump = () => { clearTimeout(t); t = setTimeout(() => load().then(render), 250); };
  channel = sb.channel('gp-home');
  ['customer_requests', 'customer_visits', 'customer_contracts', 'customer_profiles'].forEach(table =>
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, bump));
  channel.subscribe();
}
async function createRequest({ type, description, address, files = [] }) {
  const paths = [];
  for (const f of files) {
    const ext = ((f.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const path = `${S.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from('customer-photos').upload(path, f, { contentType: f.type || 'image/jpeg' });
    if (error) return 'Photo upload failed: ' + error.message;
    paths.push(path);
  }
  const { error } = await sb.from('customer_requests').insert({ type, description, address: address || '', photos: paths });
  if (error) return error.message;
  await load(); return null;
}

// ---------- Render ----------
function render() {
  const app = document.getElementById('app'), tabs = document.getElementById('tabs'), who = document.getElementById('who');
  const inApp = S.user && S.role === 'customer';
  tabs.classList.toggle('hidden', !inApp); document.body.classList.toggle('has-tabs', !!inApp);
  who.innerHTML = S.user ? `<span id="sync" class="${channel ? 'on' : ''}"></span>${esc((S.prof && S.prof.full_name) || S.user.email.split('@')[0])}` : '';
  if (S.offline) { app.innerHTML = `<div class="card"><h2>You are offline</h2><p class="muted">Reconnect to see your visits and requests. This page refreshes on its own when you are back online.</p><p class="muted">Urgent? Call <a href="${TEL}" style="color:inherit">${PHONE}</a>.</p></div>`; return; }
  if (!S.user) { app.innerHTML = authView(); return; }
  if (S.role !== 'customer') { app.innerHTML = `<div class="card"><h2>Team account</h2><p class="muted">Gatepost Home is for customers. Team members use the Gatepost hub.</p>
      <a href="../" class="link" style="display:inline-block;margin:8px 0;">Open the Gatepost hub ›</a><button class="secondary" onclick="signOut()">Sign out</button></div>`; return; }
  tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === TAB));
  const view = { home: homeView, schedule: scheduleView, addons: addonsView, contracts: contractsView, settings: settingsView }[TAB] || homeView;
  // Never leave the previous tab's screen up under a different highlighted tab if a view throws.
  try { app.innerHTML = view(); } catch (e) { console.error(e); app.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">Please reload the app or call us at <a href="${TEL}" style="color:inherit;">${PHONE}</a>.</p></div>`; }
}

function authView() {
  const up = AUTH_MODE === 'signup';
  return `<div class="hero"><img src="../logo.png" alt="Gatepost Property Services"><p>Gatepost Home</p></div>
  <div class="card"><h2>${up ? 'Create your account' : 'Welcome back'}</h2>
    <p class="muted">${up ? 'Takes a minute. You can request help right away.' : 'Sign in to see your plan, visits and requests.'}</p>
    ${up ? `<label>Your name</label><input id="a-name" autocomplete="name" placeholder="First and last name">
    <label>Phone</label><input id="a-phone" type="tel" autocomplete="tel" placeholder="Mobile number">` : ''}
    <label>Email</label><input id="a-email" type="email" autocomplete="username email" autocapitalize="none" placeholder="you@example.com">
    <label>Password</label><input id="a-pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${up ? 'At least 8 characters' : 'Password'}">
    <button class="primary" style="margin-top:16px;" onclick="${up ? 'signUp()' : 'signIn()'}">${up ? 'Create account' : 'Sign in'}</button>
    <p id="a-msg" class="muted" style="margin-top:10px;min-height:1em;"></p>
    <button class="link" onclick="AUTH_MODE='${up ? 'signin' : 'signup'}';render()">${up ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
  </div>
  <p class="muted small" style="text-align:center;">Questions? Call <a href="${TEL}" style="color:inherit;">${PHONE}</a></p>`;
}
const val = id => (document.getElementById(id)?.value || '').trim();
async function signUp() {
  const m = document.getElementById('a-msg'), email = val('a-email').toLowerCase(), password = document.getElementById('a-pass').value;
  if (!val('a-name') || !email || !password) { m.textContent = 'Name, email and password are required.'; return; }
  if (password.length < 8) { m.textContent = 'Password must be at least 8 characters.'; return; }
  m.textContent = 'Creating your account…';
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { signup_as: 'customer', full_name: val('a-name'), phone: val('a-phone') } } });
  if (error) { m.textContent = error.message; return; }
  if (!data.session) { m.textContent = 'Check your email to confirm your account, then sign in.'; return; }
  await afterAuth();
}
async function signIn() {
  const m = document.getElementById('a-msg'); m.textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email: val('a-email').toLowerCase(), password: document.getElementById('a-pass').value });
  if (error) { m.textContent = error.message; return; }
  await afterAuth();
}
async function afterAuth() { TAB = 'home'; await load(); await subscribe(); render(); }
async function signOut() { if (channel) { await sb.removeChannel(channel); channel = null; } await sb.auth.signOut(); S = { user: null, role: null, prof: null, reqs: [], visits: [], contracts: [] }; render(); }

const planName = () => (S.prof && S.prof.plan) || null;
const nextVisit = () => S.visits.find(v => v.status === 'scheduled' && new Date(v.scheduled_for) >= new Date(Date.now() - 12 * 3600e3));
const reqItem = r => `<div class="item"><div class="top"><span class="badge ${esc(r.status)}">${esc(STATUS[r.status] || r.status)}</span>
    ${r.priority === 'urgent' ? '<span class="badge urgent">Urgent</span>' : r.type !== 'repair' ? `<span class="badge">${esc(TYPE[r.type] || r.type)}</span>` : ''}
    <span class="right muted small">${esc(fmtDay(r.created_at))}</span></div>
  <div style="margin-top:6px;white-space:pre-wrap;">${esc(r.description)}</div>${r.address ? `<div class="muted small" style="margin-top:3px;">📍 ${esc(r.address)}</div>` : ''}
  ${r.photoUrls.length ? `<div class="photos">${r.photoUrls.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Photo" loading="lazy"></a>`).join('')}</div>` : ''}</div>`;

function homeView() {
  const nv = nextVisit(), name = (S.prof && S.prof.full_name || '').split(' ')[0];
  return `<h1>${name ? 'Hi, ' + esc(name) : 'Welcome home'}</h1>
  <button class="urgent" onclick="openRequest('urgent')"><b>Get us out — within 24 hours</b><span>Something urgent? Tell us what happened. We aim to be there within 24 hours.</span></button>
  <div class="card"><div class="top"><h2 style="margin:0;">Your plan</h2></div>
    <p style="margin:8px 0 4px;"><strong>${planName() ? esc(planName()) : 'Plan: not selected'}</strong></p>
    <p class="muted small" style="margin:0;">${hasSub() ? (S.prof.cancel_at_period_end ? 'Cancels at the end of this billing period' + (S.prof.current_period_end ? ' (' + esc(fmtDay(S.prof.current_period_end)) + ')' : '') + '. No partial-month refunds.' : (S.prof.subscription_status === 'past_due' ? 'Payment is past due. Please update your card.' : 'Renews monthly' + (S.prof.current_period_end ? ' on ' + esc(fmtDay(S.prof.current_period_end)) : '') + '. Call us to change plans.')) : planName() ? 'Ask us anytime about changing your plan.' : 'Pick a plan below to subscribe.'}</p>
    ${S.prof && S.prof.stripe_customer_id ? '<button class="secondary" style="margin-top:10px;" onclick="openBillingPortal()">Manage billing</button>' : ''}</div>
  ${plansCard()}
  <div class="card"><h2>Next visit</h2>${nv ? `<p style="margin:0;"><strong>${esc(nv.type)}</strong></p><p class="muted" style="margin:4px 0 0;">${esc(fmtDT(nv.scheduled_for))}</p>${nv.notes ? `<p class="muted small">${esc(nv.notes)}</p>` : ''}` : '<p class="muted" style="margin:0;">No visits scheduled yet.</p>'}
    <button class="link" onclick="go('schedule')">See full schedule ›</button></div>
  <div class="card"><div class="top"><h2 style="margin:0;">My requests</h2></div>
    <button class="secondary" style="margin:10px 0 4px;" onclick="openRequest('repair')">Something broke (not urgent)</button>
    ${S.reqs.length ? S.reqs.slice(0, 10).map(reqItem).join('') : '<p class="muted">No requests yet.</p>'}</div>`;
}
function scheduleView() {
  const now = Date.now() - 12 * 3600e3, up = S.visits.filter(v => new Date(v.scheduled_for) >= now && v.status !== 'canceled'), past = S.visits.filter(v => !up.includes(v)).reverse();
  const row = v => `<div class="item"><div class="top"><strong>${esc(v.type)}</strong><span class="right badge ${esc(v.status)}">${esc(STATUS[v.status] || v.status)}</span></div>
    <div class="muted" style="margin-top:4px;">${esc(fmtDT(v.scheduled_for))}</div>${v.notes ? `<div class="muted small" style="margin-top:4px;white-space:pre-wrap;">${esc(v.notes)}</div>` : ''}</div>`;
  return `<h1>Schedule</h1>
  <div class="card"><h2>Upcoming visits</h2>${up.length ? up.map(row).join('') : '<p class="muted">No visits scheduled yet. Maintenance like AC and furnace filter changes, weeding and gutter checks will show up here once booked.</p>'}</div>
  ${past.length ? `<div class="card"><h2>Past visits</h2>${past.map(row).join('')}</div>` : ''}`;
}
const PLANS = [
  { key: 'oncall', name: 'On-Call', price: 29, items: ['One 1-hour handyman visit a year', '10% off labor, 10% off materials', 'Extra hand weeding at 10% off: $40.50/hr, $67.50 minimum (no minimum when added to a booked visit)'] },
  { key: 'keepup', name: 'Keep-Up', price: 89, items: ['1 hour of hand weeding every month', '1-hour handyman visit every quarter', 'Air-filter change every quarter (filter part included)', '15% off labor, 15% off materials', 'Extra hand weeding at 15% off: $38.25/hr, $63.75 minimum for a separate trip'] },
  { key: 'fullcare', name: 'Full Care', price: 169, items: ['1.5 hours of hand weeding every month', '1.5-hour handyman visit every quarter', 'Filter part included at no charge', '2-hour pressure wash every quarter', 'Outside window cleaning twice a year', '20% off labor, 15% off materials', 'Extra hand weeding at 20% off: $36/hr, $60 minimum for a separate trip'] },
  { key: 'landlord', name: 'Landlord', price: 245, items: ['1-hour handyman visit every month', 'Filter part included at no charge', '2 hours of hand weeding every month', '2-hour pressure wash every quarter', 'Outside window cleaning four times a year', '20% off labor, 15% off materials', 'Extra hand weeding at 20% off: $36/hr, $60 minimum for a separate trip'] }];
function plansCard() {
  return `<div class="card"><h2>Plans</h2><p class="muted small" style="margin-top:0;">Monthly prices, before NM gross receipts tax. Included work is done on one visit each month. Members get outside window cleaning ($179 for a typical home when not included in the plan). Repair parts are billed at cost + 20%, less your plan's materials discount. Included filters are no charge. Handyman work does not include electrical, plumbing or gas work.</p>
    ${PLANS.map(p => `<div class="item"><div class="top"><strong>${esc(p.name)}</strong><span class="right"><strong>$${p.price}</strong><span class="muted small">/mo</span></span></div>
    <ul class="muted small" style="margin:6px 0 8px;padding-left:18px;">${p.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    ${hasSub() ? (planName() === p.name ? '<button class="secondary" disabled>Your current plan</button>' : `<button class="secondary" onclick="requestPlan('${p.key}')">Ask about switching to ${esc(p.name)}</button>`) : `<button onclick="subscribePlan('${p.key}')">Subscribe to ${esc(p.name)}</button>`}</div>`).join('')}</div>`;
}
async function subscribePlan(key) {
  if (BUSY) return; const p = PLANS.find(x => x.key === key); if (!p) return;
  BUSY = true;
  try { await startCheckout(key); }
  catch (e) { BUSY = false; if (e.status === 503) return requestPlan(key); toast(e.message); }
}
async function requestPlan(key) {
  if (BUSY) return; const p = PLANS.find(x => x.key === key); if (!p) return;
  if (!confirm(`Ask about the ${p.name} plan ($${p.price}/mo)? We will contact you to set it up. You will not be charged now.`)) return;
  BUSY = true; const err = await createRequest({ type: 'addon', description: `Plan request: ${p.name} ($${p.price}/mo)`, address: S.prof && S.prof.address }); BUSY = false;
  toast(err ? err : 'Request sent. We will be in touch.'); render();
}
const ADDONS = [
  { key: 'windows', ico: '🪟', name: 'Window cleaning', text: 'Outside windows. About $179 for a typical home.' },
  { key: 'pressure', ico: '💦', name: 'Pressure washing', text: 'Driveways, walkways, patios and walls.' },
  { key: 'weeding', ico: '🌿', name: 'Weeding', text: 'Beds, gravel and yard cleanup.' },
  { key: 'gutters', ico: '🏠', name: 'Gutter check', text: 'Clear and check gutters and downspouts.' },
  { key: 'acfilter', ico: '🌬️', name: 'AC / furnace filters', text: 'Filter changes on a regular schedule.' },
  { key: 'upgrade', ico: '⬆️', name: 'Upgrade my plan', text: 'On-Call $29, Keep-Up $89, Full Care $169, Landlord $245 a month. See Plans on the Home tab.', wide: true }];
function addonsView() {
  return `<h1>Add-ons</h1><p class="muted">Tap “Request this” and we will follow up with details and timing.</p>
  <div class="addons">${ADDONS.map(a => `<div class="addon${a.wide ? ' wide' : ''}"><span class="ico">${a.ico}</span><b>${esc(a.name)}</b><span class="muted">${esc(a.text)}</span>
    <button class="primary" onclick="requestAddon('${a.key}')">Request this</button></div>`).join('')}</div>`;
}
async function requestAddon(key) {
  if (BUSY) return; const a = ADDONS.find(x => x.key === key); if (!a) return;
  if (!confirm(`Request ${a.name}? We will contact you with details.`)) return;
  BUSY = true; const err = await createRequest({ type: 'addon', description: `Add-on request: ${a.name}`, address: S.prof && S.prof.address }); BUSY = false;
  toast(err ? err : 'Request sent. We will be in touch.'); render();
}
function contractsView() {
  return `<h1>Contracts</h1>${S.contracts.length ? S.contracts.map(c => `<div class="card"><div class="top"><h2 style="margin:0;font-size:1.2rem;">${esc(c.title)}</h2></div>
    <p class="muted small" style="margin:6px 0 10px;">${c.signed_at ? `Signed by ${esc(c.signed_name)} · ${esc(fmtDT(c.signed_at))}` : 'Not signed yet'}</p>
    <button class="primary" onclick="openContract(${Number(c.id)})">${c.signed_at ? 'View / print' : 'Review and sign'}</button></div>`).join('') : '<div class="card"><p class="muted">No contracts yet.</p></div>'}`;
}
function openContract(id) {
  const c = S.contracts.find(x => x.id === id); if (!c) return;
  const isDraft = /draft/i.test(c.title + ' ' + (c.body || ''));
  sheet(c.signed_at ? 'Contract' : 'Review and sign', `<div id="print-area">
    ${isDraft ? '<p class="draft">DRAFT — not final</p>' : ''}<h2>${esc(c.title)}</h2>
    ${c.body ? `<div class="contract-body">${esc(c.body)}</div>` : ''}${c.pdf_path ? `<p class="muted">A PDF copy is on file.</p>` : ''}
    ${c.signed_at ? `<dl class="facts" style="margin-top:14px;"><dt>Signed by</dt><dd>${esc(c.signed_name)}</dd><dt>Signed</dt><dd>${esc(fmtDT(c.signed_at))}</dd></dl>` : ''}</div>
    ${c.signed_at ? '' : `<label>Type your full name to sign</label><input id="sig-name" autocomplete="name" value="">
      <p class="muted small">By typing your name and tapping Sign, you agree this is your electronic signature on the document above.</p>
      <button class="primary" id="sig-btn" onclick="signContract(${Number(c.id)})">Sign</button><p id="sig-msg" class="muted"></p>`}
    <button class="secondary" style="margin-top:10px;" onclick="window.print()">Print</button>`);
}
async function signContract(id) {
  const name = val('sig-name'), m = document.getElementById('sig-msg');
  if (name.length < 2) { m.textContent = 'Please type your full name.'; return; }
  document.getElementById('sig-btn').disabled = true;
  const { error } = await sb.rpc('sign_customer_contract', { p_id: id, p_name: name, p_user_agent: navigator.userAgent });
  if (error) { m.textContent = error.message; document.getElementById('sig-btn').disabled = false; return; }
  await load(); closeSheet(); render(); openContract(id); toast('Signed. Thank you.');
}
function settingsView() {
  const p = S.prof || {};
  return `<h1>Settings</h1>
  <div class="card"><h2>Profile</h2>
    <label>Name</label><input id="s-name" autocomplete="name" value="${esc(p.full_name)}">
    <label>Phone</label><input id="s-phone" type="tel" autocomplete="tel" value="${esc(p.phone)}">
    <label>Service address</label><textarea id="s-addr" rows="2" autocomplete="street-address">${esc(p.address)}</textarea>
    <label>Email</label><input value="${esc(S.user.email)}" disabled>
    <button class="primary" style="margin-top:14px;" onclick="saveProfile()">Save</button></div>
  <div class="card"><p class="muted" style="margin-top:0;">Questions? Call <a href="${TEL}" style="color:inherit;">${PHONE}</a>.</p>
    <button class="secondary" onclick="signOut()">Sign out</button></div>
  <div style="text-align:center;margin:24px 0 8px;"><button class="cancel-link" onclick="cancelSubscription()">Cancel subscription</button></div>`;
}
async function saveProfile() {
  const row = { id: S.user.id, full_name: val('s-name'), phone: val('s-phone'), address: val('s-addr') };
  const { error } = S.prof ? await sb.from('customer_profiles').update(row).eq('id', S.user.id) : await sb.from('customer_profiles').insert(row);
  if (error) { toast(error.message); return; } await load(); render(); toast('Saved');
}
async function cancelSubscription() {
  if (!confirm('Cancel your Gatepost subscription?')) return;
  if (!confirm('Are you sure? We will receive a cancel request and contact you to confirm.')) return;
  const err = await createRequest({ type: 'cancel', description: 'Customer asked to cancel their subscription.', address: S.prof && S.prof.address });
  toast(err ? err : 'Cancel request sent. We will contact you to confirm.'); render();
}

// ---------- Request sheet (urgent / repair) ----------
function openRequest(type) {
  const urgent = type === 'urgent';
  sheet(urgent ? 'Urgent request' : 'Something broke', `
    ${urgent ? '<h2>Get us out — within 24 hours</h2><p class="muted">We aim to be there within 24 hours. For anything dangerous, call us too: <a href="' + TEL + '" style="color:inherit;">' + PHONE + '</a>.</p>' : '<h2>Something broke</h2><p class="muted">Tell us what happened and we will follow up.</p>'}
    <label>What happened?</label><textarea id="r-desc" rows="4" maxlength="4000" placeholder="e.g. Back gate latch snapped and the gate will not close"></textarea>
    <label>Address</label><input id="r-addr" maxlength="500" autocomplete="street-address" value="${esc(S.prof && S.prof.address)}" placeholder="Street, city">
    <label>Photos (up to 5)</label><input id="r-photos" type="file" accept="image/*" multiple>
    <p id="r-msg" class="muted"></p>
    <button class="primary" id="r-send" onclick="sendRequest('${urgent ? 'urgent' : 'repair'}')">${urgent ? 'Send urgent request' : 'Send request'}</button>`);
}
async function sendRequest(type) {
  if (BUSY) return;
  const description = val('r-desc'), address = val('r-addr'), files = [...(document.getElementById('r-photos').files || [])], m = document.getElementById('r-msg');
  if (!description || !address) { m.textContent = 'Please describe what happened and add the address.'; return; }
  if (files.length > 5) { m.textContent = 'Please pick 5 photos or fewer.'; return; }
  if (files.some(f => f.size > 10 * 1024 * 1024)) { m.textContent = 'Each photo must be under 10 MB.'; return; }
  if (files.some(f => f.type && !/^image\//.test(f.type))) { m.textContent = 'Photos only, please.'; return; }
  BUSY = true; const b = document.getElementById('r-send'); b.disabled = true; b.textContent = 'Sending…';
  const err = await createRequest({ type, description, address, files }); BUSY = false;
  if (err) { m.textContent = err; b.disabled = false; b.textContent = 'Try again'; return; }
  closeSheet(); TAB = 'home'; render(); toast(type === 'urgent' ? 'Urgent request sent. We aim to be there within 24 hours.' : 'Request sent.');
}

// ---------- UI helpers ----------
function sheet(title, html) { closeSheet(); const el = document.createElement('div'); el.className = 'sheet'; el.id = 'sheet'; el.setAttribute('role', 'dialog');
  el.innerHTML = `<div class="sheet-head"><button class="back-btn" onclick="closeSheet()" aria-label="Back">‹ Back</button><strong>${esc(title)}</strong><span style="width:48px"></span></div><div class="sheet-body">${html}</div>`;
  document.body.appendChild(el); }
function closeSheet() { document.getElementById('sheet')?.remove(); }
function toast(t) { document.querySelectorAll('.toast').forEach(x => x.remove()); const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 3200); }
function go(tab) { TAB = tab; closeSheet(); render(); window.scrollTo(0, 0); }
document.getElementById('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) load().then(render); });
window.addEventListener('online', () => { if (sb) load().then(render); });
if (sb) sb.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT') { S.user = null; render(); } if (ev === 'TOKEN_REFRESHED' && s) sb.realtime.setAuth(s.access_token); });
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
if (sb) (async () => {
  await load(); if (S.user) await subscribe(); render();
  const ck = new URLSearchParams(location.search).get('checkout');
  if (ck) {
    history.replaceState(null, '', location.pathname);
    if (ck === 'success') { toast('Thanks! Your plan is being set up.'); setTimeout(() => load().then(render), 4000); }
    else toast('Checkout canceled. You were not charged.');
  }
})();
