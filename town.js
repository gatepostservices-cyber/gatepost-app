// Gatepost Town v2: the town is the home screen. Buildings = bots; HQ = Christian's hub.
// Visual only. Badges/counts come from real requests (S.requests) and bot_messages (admins only).
(() => {
const TZ = 'America/Denver';
const C = { ink: '#141414', cream: '#F6F4EF', paper: '#fbf8f1', wall: '#efe9dc', wall2: '#e2d9c6', road: '#ddd2bb', roadEdge: '#cbbf a5'.replace(' ', ''), g1: '#dfe3d1', g2: '#d6dcc6', g3: '#cdd5bc', tree: '#6f8f74', tree2: '#56735b', tree3: '#88a68b', lit: '#f2c96b', door: '#3a332a', shadow: 'rgba(40,34,24,.16)', red: '#a85a52', tan: '#b39a6b', sage: '#6f8f74', slate: '#5f7a8a' };
const BOTS = [
  { name: 'Gatepost', short: 'Gatepost', role: 'Office admin: bids, calendar and cash', color: '#2b2b2b', place: 'Town Hall', glyph: '$',
    b: { type: 'hall', x: 5.2, y: 1.2, w: 5.6, h: 5.2 }, door: [8, 6.75], work: 'At the town hall, keeping the calendar and the cash straight.' },
  { name: 'Gatepost Leads', short: 'Leads', role: 'Lead finder: Nextdoor, Facebook and Craigslist', color: C.sage, place: 'Lookout Tower', glyph: '!',
    b: { type: 'tower', x: 0.8, y: 1.4, w: 3, h: 5.6 }, door: [2.3, 7.35], work: 'Up in the lookout tower, scanning the neighborhood for leads.' },
  { name: 'Gatepost Bids', short: 'Bids', role: 'Bids and OneDrive filing', color: C.tan, place: 'Drafting Office', glyph: '✎',
    b: { type: 'shop', x: 12.0, y: 2.2, w: 3.6, h: 4.4 }, door: [13.8, 6.95], work: 'In the drafting office, filing bids in the cabinets.' },
  { name: 'Gatepost Tasks', short: 'Tasks', role: 'Christian\u2019s to-do list', color: C.red, place: 'Notice Board', glyph: '✓',
    b: { type: 'kiosk', x: 0.6, y: 11.1, w: 3.5, h: 3.1 }, door: [2.35, 10.55], work: 'At the notice board, pinning up to-dos.' },
  { name: 'Gatepost App', short: 'App', role: 'Builds and maintains this app', color: C.slate, place: 'Tech Garage', glyph: '</>',
    b: { type: 'yard', x: 11.1, y: 11.1, w: 4.5, h: 3.7 }, door: [13.3, 10.55], work: 'In the tech garage, tinkering with the app.' },
];
const HQ = { x: 5.6, y: 11.0, w: 4.8, h: 4.0, door: [8, 10.55] };
const COLS = 16, ROWS = 20, MAIN_Y = 9.3, LANE_X = 4.8, LOW_Y = 16.05;
BOTS.forEach((bt, i) => { const x = 0.35 + i * 3.1; bt.home = { x, y: 17.25, w: 2.7, h: 2.3 }; bt.hdoor = [x + 1.35, 17.15]; });
const TREES = [[4.55, 7.9], [11.4, 7.95], [0.45, 9.2], [15.55, 9.3], [10.85, 15.35], [15.6, 16.2], [0.35, 15.2], [6.1, 0.55], [10.2, 0.6], [15.3, 1.0], [0.4, 0.7]];
const FLOWERS = [[4.6, 2.2], [4.5, 4.8], [11.4, 3.2], [11.5, 5.6], [4.2, 13.4], [10.6, 13.0], [6.0, 15.25], [9.9, 15.3], [3.3, 15.1], [12.9, 15.3]];
let ADMIN = false;

// ---------- time ----------
const qh = new URLSearchParams(location.search).get('townhour');
function denverHour() {
  if (qh !== null && !isNaN(+qh)) return +qh;
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  return (+p.find(x => x.type === 'hour').value % 24) + (+p.find(x => x.type === 'minute').value) / 60;
}
const atWork = h => h >= 7 && h < 21.5;
function darkness(h) { if (h >= 7 && h < 18) return 0; if (h >= 18 && h < 20.5) return (h - 18) / 2.5 * 0.6; if (h >= 20.5 || h < 5.5) return 0.6; return (7 - h) / 1.5 * 0.6; }
function warmth(h) { return (h >= 17 && h < 19.5) ? Math.sin((h - 17) / 2.5 * Math.PI) * 0.18 : (h >= 5.5 && h < 7.5) ? Math.sin((h - 5.5) / 2 * Math.PI) * 0.14 : 0; }
const clockLabel = h => { const H = Math.floor(h), M = Math.round((h - H) * 60); return new Date(2000, 0, 1, H, M).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' MT'; };

// ---------- real data ----------
const reqs = () => (typeof S !== 'undefined' && S.requests) || [];
const matches = (r, name) => r.from === name || (r.sources || []).includes(name);
function stats(name) {
  const rs = reqs().filter(r => matches(r, name)), week = Date.now() - 7 * 864e5;
  return { rs, pending: rs.filter(r => r.status === 'pending').length, decided: rs.filter(r => r.status !== 'pending' && r.decidedAt && Date.parse(r.decidedAt) >= week).length,
    latest: rs.slice().sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))[0], total: rs.length };
}
const otherPending = () => reqs().filter(r => r.status === 'pending' && !BOTS.some(bt => matches(r, bt.name))).length;
let MSGS = [], ACTS = [], chatLoading = null;
const unread = name => MSGS.filter(m => m.bot === name && m.sender === 'bot' && !m.read_at).length;
async function loadChat() {
  if (!ADMIN || typeof sb === 'undefined' || !sb) { MSGS = []; ACTS = []; return; }
  const [m, a] = await Promise.all([sb.from('bot_messages').select('*').order('created_at', { ascending: true }).limit(500),
    sb.from('bot_activity').select('*').order('created_at', { ascending: false }).limit(300)]);
  if (!m.error) MSGS = m.data || []; if (!a.error) ACTS = a.data || [];
}
function queueChat() { if (chatLoading) return; chatLoading = setTimeout(async () => { await loadChat(); chatLoading = null; staticDirty = true; if (OPEN && OPEN.kind === 'bot') renderSheet(false); }, 250); }

// ---------- characters ----------
const chars = BOTS.map((bt, i) => ({ i, x: 0, y: 0, path: [], where: null, walking: false, dist: 0, face: 1, nextStroll: 5 + i * 3.5 + Math.random() * 6, blink: Math.random() * 4, emote: 1.5 + i * 1.4 }));
function homePath(i) { const bt = BOTS[i], d = bt.door, h = bt.hdoor; return [[d[0], d[1]], [d[0], MAIN_Y], [LANE_X, MAIN_Y], [LANE_X, LOW_Y], [h[0], LOW_Y], [h[0], h[1]]]; }
function routeTo(ch, dest) { const p = homePath(ch.i); ch.path = dest === 'home' ? p : p.reverse(); ch.where = dest; ch.walking = true; }
function place(ch, dest) { const p = dest === 'home' ? BOTS[ch.i].hdoor : BOTS[ch.i].door; ch.x = p[0]; ch.y = p[1]; ch.where = dest; ch.path = []; ch.walking = false; }
function stroll(ch) { const d = BOTS[ch.i].door, tx = Math.max(0.8, Math.min(15.2, d[0] + (Math.random() < .5 ? -1 : 1) * (1.2 + Math.random() * 2.2))); ch.path = [[d[0], MAIN_Y], [tx, MAIN_Y], [d[0], MAIN_Y], [d[0], d[1]]]; ch.walking = true; }
let started = false, lastWork = null;
function syncClock() { const h = denverHour(), w = atWork(h); if (!started) { chars.forEach(c => place(c, w ? 'work' : 'home')); started = true; } else if (w !== lastWork) chars.forEach(c => routeTo(c, w ? 'work' : 'home')); lastWork = w; return h; }

// ---------- drawing helpers ----------
let cv = null, ctx = null, T = 20, W = 320, H = 400, dpr = 1, stat = null, sctx = null, raf = null, last = 0, hour = 12, dark = 0, warm = 0, clockT = 0, staticDirty = true, OPEN = null;
const px = v => Math.round(v * T);
const LW = () => Math.max(1, Math.round(T / 13));
function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(px(x), px(y), Math.max(1, px(x + w) - px(x)), Math.max(1, px(y + h) - px(y))); }
function rrect(c, x, y, w, h, r, col, stroke) { c.beginPath(); c.roundRect ? c.roundRect(px(x), px(y), px(w), px(h), r * T) : c.rect(px(x), px(y), px(w), px(h)); if (col) { c.fillStyle = col; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = LW(); c.stroke(); } }
function box(c, x, y, w, h, col) { const o = LW() / T; rect(c, x, y, w, h, C.ink); rect(c, x + o, y + o, w - 2 * o, h - 2 * o, col); }
function poly(c, pts, col, stroke = true) { c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(px(x), px(y)) : c.moveTo(px(x), px(y))); c.closePath(); c.fillStyle = col; c.fill(); if (stroke) { c.strokeStyle = C.ink; c.lineWidth = LW(); c.lineJoin = 'round'; c.stroke(); } }
function roof(c, x1, y1, xm, ym, x2, col) { poly(c, [[x1, y1], [xm, ym], [x2, y1]], col); c.save(); c.globalAlpha = 0.18; poly(c, [[xm, ym], [x2, y1], [xm + (x2 - xm) * 0.02, y1]], '#000', false); c.restore(); }
function win(c, x, y, w, h, lit) { box(c, x, y, w, h, lit ? C.lit : '#bcc8cc'); if (!lit) { c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(px(x) + 2, px(y) + 2, Math.max(1, px(w) * .3), Math.max(1, px(h) * .3)); } rect(c, x + w / 2 - 0.03, y, 0.06, h, C.ink); }
function shadow(c, x, y, w, h) { c.fillStyle = C.shadow; c.beginPath(); c.ellipse(px(x + w / 2 + 0.2), px(y + h), px(w / 2 + 0.2), px(0.35), 0, 0, 7); c.fill(); }
function label(c, text, cx, y) {
  c.font = `600 ${Math.max(8, Math.round(T * 0.4))}px -apple-system, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const tw = c.measureText(text).width + T * 0.55, hh = T * 0.6, x0 = px(cx) - tw / 2, y0 = px(y);
  c.fillStyle = 'rgba(20,20,20,.84)'; c.beginPath(); c.roundRect ? c.roundRect(x0, y0, tw, hh, hh / 2) : c.rect(x0, y0, tw, hh); c.fill();
  c.fillStyle = C.cream; c.fillText(text, px(cx), y0 + hh / 2 + 0.5);
}
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }

// ---------- buildings ----------
function drawBuilding(c, bt, lit) {
  const { type, x, y, w, h } = bt.b, col = bt.color;
  shadow(c, x, y, w, h);
  if (type === 'hall') {
    rect(c, x + 0.7, y + h - 0.3, w - 1.4, 0.3, '#cfc5ae'); rect(c, x + 0.9, y + h - 0.5, w - 1.8, 0.22, '#d9d0bb');
    box(c, x + 0.3, y + 1.6, w - 0.6, h - 2.05, C.paper);
    roof(c, x, y + 1.75, x + w / 2, y + 0.2, x + w, C.ink);
    c.fillStyle = C.cream; c.beginPath(); c.arc(px(x + w / 2), px(y + 1.13), T * 0.3, 0, 7); c.fill();
    c.strokeStyle = C.ink; c.lineWidth = Math.max(1, T / 14); c.beginPath(); c.moveTo(px(x + w / 2), px(y + 1.13)); c.lineTo(px(x + w / 2), px(y + 0.93)); c.moveTo(px(x + w / 2), px(y + 1.13)); c.lineTo(px(x + w / 2 + 0.16), px(y + 1.13)); c.stroke();
    for (let k = 0; k < 4; k++) { const cx = x + 0.75 + k * (w - 1.85) / 3; rect(c, cx, y + 1.85, 0.34, h - 2.5, '#e3dac6'); rect(c, cx, y + 1.85, 0.1, h - 2.5, '#f3eee3'); }
    win(c, x + 1.3, y + 2.3, 0.72, 0.9, lit); win(c, x + w - 2.02, y + 2.3, 0.72, 0.9, lit);
    box(c, x + w / 2 - 0.5, y + h - 1.75, 1, 1.3, C.door); rect(c, x + w / 2 - 0.5, y + h - 1.75, 1, 0.35, '#4a4136');
    rect(c, x + w / 2 - 0.05, y - 0.95, 0.1, 1.25, C.ink);
  } else if (type === 'tower') {
    box(c, x + 0.55, y + 1.8, w - 1.1, h - 1.8, C.wall);
    for (let k = 0; k < 4; k++) { rect(c, x + 0.62, y + 2.4 + k * 0.85, w - 1.24, 0.1, C.wall2); }
    c.strokeStyle = '#c9bfa9'; c.lineWidth = Math.max(1, T / 18); c.beginPath(); for (let k = 0; k < 3; k++) { c.moveTo(px(x + 0.62), px(y + 2.4 + k * 0.85)); c.lineTo(px(x + w - 0.62), px(y + 3.25 + k * 0.85)); } c.stroke();
    box(c, x + 0.1, y + 0.8, w - 0.2, 1.15, C.paper); rect(c, x - 0.05, y + 1.85, w + 0.1, 0.18, C.ink);
    win(c, x + 0.35, y + 1.0, 0.9, 0.6, lit); win(c, x + w - 1.25, y + 1.0, 0.9, 0.6, lit);
    roof(c, x - 0.2, y + 0.85, x + w / 2, y - 0.35, x + w + 0.2, col);
    rect(c, x + w - 0.15, y + 1.12, 0.75, 0.22, C.ink); rect(c, x + w + 0.5, y + 1.08, 0.12, 0.3, C.ink);
    box(c, x + w / 2 - 0.42, y + h - 1.2, 0.84, 1.2, C.door);
    box(c, x + w - 0.25, y + h - 0.95, 0.55, 0.45, col); rect(c, x + w - 0.05, y + h - 0.5, 0.1, 0.5, C.ink); rect(c, x + w + 0.2, y + h - 1.05, 0.06, 0.3, C.red);
  } else if (type === 'shop') {
    box(c, x, y + 1.1, w, h - 1.1, C.wall);
    roof(c, x, y + 1.15, x + w * 0.25, y + 0.2, x + w * 0.5, col); roof(c, x + w * 0.5, y + 1.15, x + w * 0.75, y + 0.2, x + w, col);
    box(c, x + 0.3, y + 1.5, 1.7, 1.15, lit ? C.lit : '#c9d6df');
    c.strokeStyle = C.slate; c.lineWidth = Math.max(1, T / 18); c.beginPath(); c.moveTo(px(x + 0.45), px(y + 2.45)); c.lineTo(px(x + 1.85), px(y + 1.7)); c.moveTo(px(x + 0.45), px(y + 1.9)); c.lineTo(px(x + 1.3), px(y + 1.9)); c.stroke();
    box(c, x + 2.35, y + 2.25, 0.75, h - 2.25, C.door); rect(c, x + 2.9, y + 3.3, 0.08, 0.08, C.lit);
    for (let k = 0; k < 2; k++) { const fx = x + 0.3 + k * 0.85; box(c, fx, y + h - 1.4, 0.75, 1.4, '#a9a79f'); for (let d = 0; d < 3; d++) { rect(c, fx + 0.08, y + h - 1.3 + d * 0.43, 0.59, 0.04, '#8c8a83'); rect(c, fx + 0.3, y + h - 1.15 + d * 0.43, 0.15, 0.06, C.ink); } }
    rrect(c, x + w - 0.95, y + 1.35, 0.7, 0.45, 0.08, C.paper, C.ink); rect(c, x + w - 0.85, y + 1.5, 0.5, 0.04, C.tan);
  } else if (type === 'kiosk') {
    rect(c, x + 0.45, y + 0.8, 0.2, h - 0.8, C.ink); rect(c, x + w - 0.65, y + 0.8, 0.2, h - 0.8, C.ink);
    box(c, x + 0.15, y + 0.75, w - 0.3, 1.95, '#c9a777');
    for (let k = 0; k < 18; k++) { c.fillStyle = 'rgba(120,90,50,.25)'; c.fillRect(px(x + 0.3 + hash(k, 1) * (w - 0.6)), px(y + 0.9 + hash(k, 2) * 1.6), 1, 1); }
    poly(c, [[x - 0.15, y + 0.8], [x + 0.2, y + 0.3], [x + w - 0.2, y + 0.3], [x + w + 0.15, y + 0.8]], col);
    const notes = [C.paper, '#f2e6b8', '#dfe8d9', C.paper, '#f0d9d3', '#f2e6b8'];
    notes.forEach((n, k) => { const nx = x + 0.4 + (k % 3) * 1.0, ny = y + 1.0 + Math.floor(k / 3) * 0.8; rect(c, nx, ny, 0.72, 0.58, n); rect(c, nx + 0.1, ny + 0.2, 0.5, 0.04, '#9b9585'); rect(c, nx + 0.1, ny + 0.33, 0.38, 0.04, '#9b9585'); rect(c, nx + 0.31, ny - 0.05, 0.1, 0.1, C.red); });
  } else if (type === 'yard') {
    for (let k = 0; k <= w + 0.01; k += 0.45) rect(c, x + k, y + h - 0.35, 0.08, 0.35, '#8a8172');
    rect(c, x, y + h - 0.28, w + 0.08, 0.06, '#8a8172'); rect(c, x, y + h - 0.12, w + 0.08, 0.06, '#8a8172');
    box(c, x + 0.15, y + 1.0, 2.9, 2.35, C.wall);
    roof(c, x, y + 1.05, x + 1.6, y + 0.2, x + 3.2, col);
    box(c, x + 0.45, y + 1.85, 1.5, 1.5, '#9aa3a6'); for (let k = 0; k < 4; k++) rect(c, x + 0.5, y + 2.05 + k * 0.32, 1.4, 0.05, '#7c8487');
    box(c, x + 2.15, y + 1.5, 0.72, 0.56, lit ? '#9fd3c7' : '#2d3b3f'); rect(c, x + 2.25, y + 1.64, 0.36, 0.05, '#9fd3c7'); rect(c, x + 2.25, y + 1.8, 0.46, 0.05, '#9fd3c7');
    rect(c, x + w - 0.75, y - 0.95, 0.18, h + 0.6, '#c79a3b'); rect(c, x + 1.55, y - 0.95, w - 2.12, 0.15, '#c79a3b');
    for (let k = 0; k < 6; k++) rect(c, x + w - 0.75, y - 0.8 + k * 0.7, 0.18, 0.05, '#8f6d25');
    [[x + 3.35, y + 2.95], [x + 3.85, y + 2.65]].forEach(([cx, cy]) => { poly(c, [[cx, cy + 0.4], [cx + 0.2, cy - 0.05], [cx + 0.4, cy + 0.4]], C.red); rect(c, cx + 0.08, cy + 0.15, 0.24, 0.07, C.paper); });
    box(c, x + 3.3, y + 1.55, 0.85, 0.52, '#c9a777'); rect(c, x + 3.3, y + 1.8, 0.85, 0.04, '#8a6d45');
  }
}
let archImg = null; try { archImg = new Image(); archImg.onload = () => { staticDirty = true; }; archImg.src = 'arch-mark.png'; } catch (e) {}
function drawHQ(c, lit) {
  const { x, y, w, h } = HQ;
  shadow(c, x, y, w, h);
  rect(c, x + 1.4, y + h - 0.25, w - 2.8, 0.25, '#cfc5ae');
  box(c, x + 0.25, y + 1.0, w - 0.5, h - 1.25, C.cream);
  poly(c, [[x - 0.05, y + 1.1], [x + 0.6, y + 0.15], [x + w - 0.6, y + 0.15], [x + w + 0.05, y + 1.1]], C.ink);
  rect(c, x + 0.25, y + 1.0, w - 0.5, 0.14, C.tan);
  // facade: the Gatepost arch mark
  if (archImg && archImg.complete && archImg.naturalWidth) { const ih = 1.75, iw = ih * archImg.naturalWidth / archImg.naturalHeight; c.drawImage(archImg, px(x + w / 2 - iw / 2), px(y + 1.3), px(iw), px(ih)); }
  win(c, x + 0.55, y + 1.5, 0.7, 0.75, lit); win(c, x + w - 1.25, y + 1.5, 0.7, 0.75, lit);
  box(c, x + w / 2 - 0.55, y + h - 1.25, 1.1, 1.0, C.door);
  c.fillStyle = C.door; c.beginPath(); c.arc(px(x + w / 2), px(y + h - 1.25), px(0.55), Math.PI, 0); c.fill();
  rect(c, x + 0.45, y + h - 0.85, 0.5, 0.6, C.tree2); rect(c, x + w - 0.95, y + h - 0.85, 0.5, 0.6, C.tree2); // planters
  c.fillStyle = C.tree; [[x + 0.7, y + h - 0.9], [x + w - 0.7, y + h - 0.9]].forEach(([a, b]) => { c.beginPath(); c.arc(px(a), px(b), T * 0.32, 0, 7); c.fill(); });
  rect(c, x + w / 2 - 0.05, y - 1.0, 0.1, 1.2, C.ink);
}
function drawHome(c, bt, lit) {
  const { x, y, w, h } = bt.home;
  shadow(c, x, y, w, h);
  box(c, x + 0.2, y + 0.75, w - 0.4, h - 0.75, C.paper);
  rect(c, x + w - 0.75, y - 0.05, 0.32, 0.6, '#8a6d45');
  roof(c, x, y + 0.85, x + w / 2, y - 0.1, x + w, bt.color);
  box(c, x + w / 2 - 0.35, y + h - 1.0, 0.7, 1.0, C.door); rect(c, x + w / 2 + 0.18, y + h - 0.55, 0.07, 0.07, C.lit);
  win(c, x + 0.42, y + 1.05, 0.52, 0.45, lit); win(c, x + w - 0.94, y + 1.05, 0.52, 0.45, lit);
  for (let k = 0; k < 4; k++) rect(c, x + 0.05 + k * 0.18, y + h - 0.3, 0.06, 0.3, '#b8ad97'); rect(c, x, y + h - 0.22, 0.7, 0.05, '#b8ad97');
}
function drawStatic() {
  const c = sctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.imageSmoothingEnabled = true;
  for (let gx = 0; gx < COLS; gx++) for (let gy = 0; gy < ROWS; gy++) { const r = hash(gx, gy); rect(c, gx, gy, 1, 1, r < 0.33 ? C.g1 : r < 0.66 ? C.g2 : C.g3); }
  for (let k = 0; k < 140; k++) { const tx = hash(k, 7) * COLS, ty = hash(k, 9) * ROWS; c.fillStyle = 'rgba(86,115,91,.35)'; c.fillRect(px(tx), px(ty), Math.max(1, T / 10), Math.max(2, T / 6)); }
  const road = (x, y, w, h) => { rect(c, x, y, w, h, C.road); };
  road(0, 8.6, COLS, 1.4); road(LANE_X - 0.45, 10, 0.9, 5.6); road(0, 15.5, COLS, 1.1);
  BOTS.forEach(bt => { const d = bt.door; if (d[1] < 8.6) road(d[0] - 0.35, d[1] - 0.25, 0.7, 8.6 - d[1] + 0.25); else road(d[0] - 0.35, 10, 0.7, d[1] - 10 + 0.3); });
  road(HQ.door[0] - 0.5, 10, 1.0, HQ.door[1] - 10 + 0.5);
  BOTS.forEach(bt => road(bt.hdoor[0] - 0.3, 16.6, 0.6, 0.7));
  c.fillStyle = 'rgba(160,145,115,.35)'; [[0, 8.6, COLS, 0.06], [0, 9.94, COLS, 0.06], [0, 15.5, COLS, 0.06], [0, 16.54, COLS, 0.06]].forEach(([a, b, w, h]) => c.fillRect(px(a), px(b), px(w), Math.max(1, px(h))));
  for (let k = 0.4; k < COLS; k += 1.4) rect(c, k, MAIN_Y - 0.03, 0.65, 0.06, '#f7f2e6');
  for (let k = 0; k < 4; k++) rect(c, 7.1 + k * 0.5, 8.75, 0.3, 1.1, 'rgba(247,242,230,.85)'); // crosswalk to HQ
  FLOWERS.forEach(([fx, fy], k) => { [[0, 0], [0.25, 0.12], [-0.2, 0.18]].forEach(([dx, dy], j) => { c.fillStyle = [C.red, C.lit, C.paper][(k + j) % 3]; c.beginPath(); c.arc(px(fx + dx), px(fy + dy), Math.max(1.5, T * 0.08), 0, 7); c.fill(); }); });
  const lit = dark > 0.15;
  BOTS.forEach(bt => drawBuilding(c, bt, lit));
  drawHQ(c, lit);
  BOTS.forEach((bt, i) => drawHome(c, bt, lit && chars[i].where === 'home'));
  TREES.forEach(([tx, ty]) => { c.fillStyle = C.shadow; c.beginPath(); c.ellipse(px(tx + 0.15), px(ty + 0.5), T * 0.5, T * 0.18, 0, 0, 7); c.fill(); rect(c, tx - 0.07, ty + 0.1, 0.14, 0.42, '#6b5a43'); c.fillStyle = C.tree2; c.beginPath(); c.arc(px(tx), px(ty), T * 0.52, 0, 7); c.fill(); c.fillStyle = C.tree; c.beginPath(); c.arc(px(tx - 0.08), px(ty - 0.08), T * 0.4, 0, 7); c.fill(); c.fillStyle = C.tree3; c.beginPath(); c.arc(px(tx - 0.18), px(ty - 0.2), T * 0.15, 0, 7); c.fill(); });
  [[4.15, 8.5], [11.9, 8.5], [LANE_X + 0.55, 13.0], [10.7, 10.5], [5.3, 10.5]].forEach(([lx, ly]) => { rect(c, lx, ly - 0.95, 0.09, 0.95, C.ink); rect(c, lx - 0.1, ly - 1.1, 0.29, 0.2, lit ? C.lit : '#8a8172'); });
  rrect(c, 9.0, 15.62, 0.9, 0.22, 0.05, '#8a6d45'); rect(c, 9.05, 15.84, 0.06, 0.15, C.ink); rect(c, 9.8, 15.84, 0.06, 0.15, C.ink); // bench
  BOTS.forEach(bt => { const b = bt.b; label(c, bt.place, b.x + b.w / 2, b.type === 'hall' ? b.y + b.h + 0.02 : b.y + b.h + 0.08); });
  label(c, ADMIN ? 'Christian\u2019s HQ' : 'Gatepost HQ', HQ.x + HQ.w / 2, HQ.y + HQ.h + 0.02);
  if (warm > 0) { c.fillStyle = `rgba(242,160,90,${warm})`; c.fillRect(0, 0, W, H); }
  if (dark > 0) {
    c.fillStyle = `rgba(14,18,46,${dark})`; c.fillRect(0, 0, W, H);
    if (lit) { const glow = (r, s = 2.2) => { const cx = px(r.x + r.w / 2), cy = px(r.y + r.h / 2), g = c.createRadialGradient(cx, cy, 1, cx, cy, T * s); g.addColorStop(0, `rgba(242,201,107,${dark * 0.5})`); g.addColorStop(1, 'rgba(242,201,107,0)'); c.fillStyle = g; c.fillRect(cx - T * s, cy - T * s, T * s * 2, T * s * 2); };
      BOTS.forEach((bt, i) => { glow(bt.b); if (chars[i].where === 'home') glow(bt.home, 1.6); }); glow(HQ, 2.6);
      [[4.15, 8.5], [11.9, 8.5], [LANE_X + 0.55, 13.0], [10.7, 10.5], [5.3, 10.5]].forEach(([lx, ly]) => glow({ x: lx - 0.5, y: ly - 1.6, w: 1, h: 1 }, 1.4)); }
  }
}
// ---------- dynamic layer ----------
const clouds = [{ x: 2, y: 4, s: 3.2, v: 0.12 }, { x: 11, y: 13, s: 2.6, v: 0.09 }, { x: 7, y: 18, s: 2.2, v: 0.15 }];
const flies = Array.from({ length: 10 }, (_, k) => ({ x: hash(k, 3) * COLS, y: 8 + hash(k, 5) * 9, p: hash(k, 11) * 6.28 }));
const puffs = [];
function badge(c, cx, cy, n, col, t, kind) {
  const r = T * 0.46 * (1 + Math.sin(t * 3) * 0.06);
  c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.arc(cx + 1.5, cy + 2, r, 0, 7); c.fill();
  c.fillStyle = col; c.strokeStyle = C.cream; c.lineWidth = Math.max(1.5, T / 10);
  if (kind === 'chat') { c.beginPath(); c.roundRect ? c.roundRect(cx - r * 1.15, cy - r * 0.85, r * 2.3, r * 1.7, r * 0.6) : c.rect(cx - r, cy - r, 2 * r, 2 * r); c.fill(); c.stroke(); c.beginPath(); c.moveTo(cx - r * 0.3, cy + r * 0.8); c.lineTo(cx - r * 0.7, cy + r * 1.35); c.lineTo(cx + r * 0.1, cy + r * 0.8); c.fill(); }
  else { c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill(); c.stroke(); }
  c.fillStyle = C.cream; c.font = `700 ${Math.round(T * 0.48)}px -apple-system, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), cx, cy + 0.5);
}
function drawRobot(c, ch, t) {
  const bt = BOTS[ch.i], u = T / 10, X = ch.x * T, Y = ch.y * T;
  const ph = ch.dist * 3.2, sw = ch.walking ? Math.sin(ph) : 0, bob = ch.walking ? -Math.abs(Math.sin(ph)) * 0.9 : Math.sin(t * 2.2 + ch.i) * 0.35;
  c.fillStyle = 'rgba(20,20,20,.22)'; c.beginPath(); c.ellipse(X, Y, 3.1 * u, 1.05 * u, 0, 0, 7); c.fill();
  const r = (x, y, w, h, col, rad = 0) => { c.fillStyle = col; c.beginPath(); c.roundRect ? c.roundRect(X + x * u, Y + (y + bob) * u, w * u, h * u, rad * u) : c.rect(X + x * u, Y + (y + bob) * u, w * u, h * u); c.fill(); };
  r(-1.9 + sw * 0.6, -2.6, 1.4, 2.6, C.ink, 0.5); r(0.5 - sw * 0.6, -2.6, 1.4, 2.6, C.ink, 0.5);
  r(-2.9, -6.7, 5.8, 4.4, C.ink, 1.2); r(-2.4, -6.2, 4.8, 3.4, bt.color, 0.9); r(-1.0, -5.4, 2.0, 1.2, 'rgba(255,255,255,.25)', 0.4);
  const work = !ch.walking && ch.where === 'work', arm = work ? Math.max(0, Math.sin(t * 5 + ch.i * 2)) * 1.6 : ch.walking ? sw * 0.8 : 0;
  r(-3.9, -6.1 - arm, 1.1, 2.7, C.ink, 0.5); r(2.8, -6.1 + (work ? 0 : -arm), 1.1, 2.7, C.ink, 0.5);
  r(-3.2, -11.8, 6.4, 5.3, C.ink, 1.6); r(-2.7, -11.3, 5.4, 4.3, '#ece7db', 1.2);
  const blink = (t + ch.blink) % 4 < 0.14, look = (ch.walking ? ch.face : ch.i === 1 ? Math.sin(t * 0.8) : 0) * 0.6;
  if (!blink) { r(-1.75 + look, -9.8, 1.15, 1.4, C.ink, 0.4); r(0.6 + look, -9.8, 1.15, 1.4, C.ink, 0.4); } else { r(-1.75, -9.1, 1.15, 0.4, C.ink); r(0.6, -9.1, 1.15, 0.4, C.ink); }
  r(-1.9 + look, -8.0, 0.8, 0.45, 'rgba(168,90,82,.35)', 0.2); r(1.1 + look, -8.0, 0.8, 0.45, 'rgba(168,90,82,.35)', 0.2);
  r(-0.25, -13.6, 0.5, 1.9, C.ink);
  const glowA = dark > 0.15; c.fillStyle = glowA ? C.lit : bt.color; c.beginPath(); c.arc(X, Y + (-13.9 + bob) * u, 1.05 * u * (1 + Math.sin(t * 4 + ch.i) * 0.08), 0, 7); c.fill();
  if (glowA) { c.fillStyle = 'rgba(242,201,107,.25)'; c.beginPath(); c.arc(X, Y + (-13.9 + bob) * u, 2.4 * u, 0, 7); c.fill(); }
  if (work && (t + ch.emote) % 7 < 1.9) {
    const k = ((t + ch.emote) % 7) / 1.9, pop = Math.min(1, k * 6) * (k > 0.85 ? (1 - k) / 0.15 : 1);
    const bx = X + 3.4 * u, by = Y - 16.5 * u; c.save(); c.globalAlpha = pop; c.translate(bx, by); c.scale(0.6 + pop * 0.4, 0.6 + pop * 0.4);
    c.font = `700 ${Math.round(T * 0.46)}px -apple-system, system-ui, sans-serif`; const tw = Math.max(c.measureText(bt.glyph).width + 8, T * 0.8);
    c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 1; c.beginPath(); c.roundRect ? c.roundRect(0, 0, tw, T * 0.68, 5) : c.rect(0, 0, tw, T * 0.68); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(3, T * 0.62); c.lineTo(0, T * 0.9); c.lineTo(9, T * 0.66); c.fill(); c.stroke();
    c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(bt.glyph, tw / 2, T * 0.35); c.restore();
  }
}
function drawFrame(t, dt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(stat, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const flag = (bx, by, col) => { const fx = px(bx + 0.05), fy = px(by), wv = Math.sin(t * 4.5) * T * 0.1, wv2 = Math.sin(t * 4.5 + 1.2) * T * 0.08;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + T * 0.45, fy + wv2, fx + T * 0.85, fy + T * 0.2 + wv); ctx.quadraticCurveTo(fx + T * 0.45, fy + T * 0.42 + wv2, fx, fy + T * 0.42); ctx.fill(); };
  flag(BOTS[0].b.x + BOTS[0].b.w / 2, BOTS[0].b.y - 0.95, C.red); flag(HQ.x + HQ.w / 2, HQ.y - 1.0, C.tan);
  const tw = BOTS[1].b, on = (Math.sin(t * 3) + 1) / 2; ctx.fillStyle = `rgba(242,201,107,${0.35 + on * 0.6})`; ctx.beginPath(); ctx.arc(px(tw.x + tw.w / 2), px(tw.y - 0.42), T * (0.12 + on * 0.06), 0, 7); ctx.fill();
  const yd = BOTS[4].b, ax = px(yd.x + 1.9), hx = ax + Math.sin(t * 1.3) * T * 0.3, hy = px(yd.y - 0.8); ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, hy); ctx.lineTo(hx, hy + T * 1.0); ctx.stroke(); ctx.fillStyle = C.ink; ctx.fillRect(hx - T * 0.13, hy + T * 1.0, T * 0.26, T * 0.2);
  // gear on the garage
  ctx.save(); ctx.translate(px(yd.x + 2.5), px(yd.y + 2.75)); ctx.rotate(t * 1.5); ctx.fillStyle = C.slate; for (let k = 0; k < 6; k++) { ctx.rotate(Math.PI / 3); ctx.fillRect(-T * 0.06, -T * 0.26, T * 0.12, T * 0.12); } ctx.beginPath(); ctx.arc(0, 0, T * 0.17, 0, 7); ctx.fill(); ctx.fillStyle = C.wall; ctx.beginPath(); ctx.arc(0, 0, T * 0.06, 0, 7); ctx.fill(); ctx.restore();
  // chimney smoke
  if (Math.random() < dt * 2.2) { const i = Math.floor(Math.random() * BOTS.length), hm = BOTS[i].home; if (chars[i].where === 'home' || Math.random() < 0.3) puffs.push({ x: hm.x + hm.w - 0.6, y: hm.y - 0.1, a: 1, r: 0.12 }); }
  for (let k = puffs.length - 1; k >= 0; k--) { const p = puffs[k]; p.y -= dt * 0.5; p.x += dt * 0.18; p.r += dt * 0.12; p.a -= dt * 0.45; if (p.a <= 0) { puffs.splice(k, 1); continue; } ctx.fillStyle = `rgba(246,244,239,${p.a * 0.7})`; ctx.beginPath(); ctx.arc(px(p.x), px(p.y), p.r * T, 0, 7); ctx.fill(); }
  // day: drifting cloud shadows; night: fireflies
  if (dark < 0.2) { clouds.forEach(cl => { cl.x += cl.v * dt; if (cl.x > COLS + cl.s) cl.x = -cl.s; ctx.fillStyle = 'rgba(60,70,60,.06)'; ctx.beginPath(); ctx.ellipse(px(cl.x), px(cl.y), px(cl.s), px(cl.s * 0.45), 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(px(cl.x + cl.s * 0.5), px(cl.y - cl.s * 0.15), px(cl.s * 0.6), px(cl.s * 0.35), 0, 0, 7); ctx.fill(); }); }
  else flies.forEach(f => { const a = (Math.sin(t * 2 + f.p) + 1) / 2; ctx.fillStyle = `rgba(242,220,120,${a * 0.9})`; ctx.beginPath(); ctx.arc(px(f.x + Math.sin(t * 0.5 + f.p) * 0.6), px(f.y + Math.cos(t * 0.4 + f.p) * 0.4), Math.max(1.2, T * 0.06), 0, 7); ctx.fill(); });
  chars.slice().sort((a, b) => a.y - b.y).forEach(ch => { if (ch.where === 'home' && !ch.walking) return; drawRobot(ctx, ch, t); });
  chars.forEach((ch, i) => { if (ch.where !== 'home' || ch.walking) return; const hm = BOTS[i].home; for (let k = 0; k < 2; k++) { const o = (t * 0.55 + i * 0.37 + k * 0.5) % 1;
    ctx.globalAlpha = Math.sin(o * Math.PI); ctx.fillStyle = dark > 0.15 ? C.cream : C.ink; ctx.font = `700 ${Math.round(T * (0.32 + o * 0.25))}px -apple-system, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.fillText('z', px(hm.x + 0.3 + o * 0.5 + Math.sin(o * 6) * 0.1), px(hm.y + 0.2 - o * 1.0)); } ctx.globalAlpha = 1; });
  if (ADMIN) {
    BOTS.forEach(bt => { const b = bt.b, s = stats(bt.name), u = unread(bt.name); if (s.pending) badge(ctx, px(b.x + b.w - 0.05), px(b.y + 0.15), s.pending, C.red, t, 'count'); if (u) badge(ctx, px(b.x + 0.15), px(b.y + 0.2), u, C.slate, t + 1, 'chat'); });
    const o = otherPending(); if (o) badge(ctx, px(HQ.x + HQ.w - 0.1), px(HQ.y + 0.25), o, C.red, t + 2, 'count');
  }
}
function update(dt) {
  chars.forEach(ch => {
    if (ch.path.length) { const [tx, ty] = ch.path[0], dx = tx - ch.x, dy = ty - ch.y, d = Math.hypot(dx, dy), sp = 2.1 * dt;
      if (Math.abs(dx) > 0.01) ch.face = Math.sign(dx);
      if (d <= sp) { ch.x = tx; ch.y = ty; ch.dist += d; ch.path.shift(); if (!ch.path.length) { ch.walking = false; staticDirty = true; } } else { ch.x += dx / d * sp; ch.y += dy / d * sp; ch.dist += sp; } }
    else if (ch.where === 'work' && (ch.nextStroll -= dt) <= 0) { stroll(ch); ch.nextStroll = 14 + Math.random() * 20; }
  });
}
function loop(ts) {
  if (!cv || !cv.isConnected || document.hidden) { stop(); return; }
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016); last = ts;
  if ((clockT -= dt) <= 0) { clockT = 30; const pd = dark, pw = warm; hour = syncClock(); dark = darkness(hour); warm = warmth(hour); if (pd !== dark || pw !== warm) staticDirty = true;
    const el = document.getElementById('town-clock'); if (el) el.textContent = `${clockLabel(hour)} · ${atWork(hour) ? 'Work hours' : 'After hours'}`; }
  update(dt); if (staticDirty) { drawStatic(); staticDirty = false; } drawFrame(ts / 1000, dt);
}
function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }
function setup() {
  W = Math.floor(cv.parentElement.clientWidth); T = W / COLS; H = Math.round(T * ROWS); dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx = cv.getContext('2d'); stat = document.createElement('canvas'); stat.width = cv.width; stat.height = cv.height; sctx = stat.getContext('2d');
  cv.onclick = e => { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / T, y = (e.clientY - r.top) / T, h = hit(x, y); if (h === 'hq') openHQ(); else if (h >= 0) openBot(h); };
  hour = syncClock(); dark = darkness(hour); warm = warmth(hour); clockT = 0; staticDirty = true;
}
function hit(x, y) {
  for (const ch of chars) if (!(ch.where === 'home' && !ch.walking) && Math.abs(x - ch.x) < 0.6 && y < ch.y + 0.3 && y > ch.y - 1.6) return ch.i;
  if (x >= HQ.x - 0.1 && x <= HQ.x + HQ.w + 0.1 && y >= HQ.y - 1.0 && y <= HQ.y + HQ.h + 0.7) return 'hq';
  for (let i = 0; i < BOTS.length; i++) { const b = BOTS[i].b, hm = BOTS[i].home;
    if (x >= b.x - 0.2 && x <= b.x + b.w + 0.2 && y >= b.y - 1.0 && y <= b.y + b.h + 0.8) return i;
    if (x >= hm.x && x <= hm.x + hm.w && y >= hm.y - 0.2 && y <= hm.y + hm.h) return i; }
  return -1;
}

// ---------- page ----------
window.townPage = () => { ADMIN = typeof isAdmin === 'function' && isAdmin();
  const chips = BOTS.map((bt, i) => { const s = ADMIN ? stats(bt.name) : null, u = ADMIN ? unread(bt.name) : 0;
    return `<button class="town-chip" onclick="openBot(${i})"><span class="dot" style="background:${bt.color}"></span>${esc(bt.short)}${s && s.pending ? ` <b>${s.pending}</b>` : ''}${u ? ` <b class="chat">${u}</b>` : ''}</button>`; }).join('');
  const pend = ADMIN ? reqs().filter(r => r.status === 'pending').length : 0;
  return `<div class="card town-card"><div class="town-head"><h2>Gatepost Town</h2><span class="muted" id="town-clock"></span></div>
  ${ADMIN ? `<p class="muted town-sub">${pend ? `<b>${pend}</b> request${pend > 1 ? 's' : ''} waiting. Tap a building with a red badge.` : 'All caught up. Tap a building to chat with its bot.'}</p>` : '<p class="muted town-sub">Tap HQ for the calendar and your info.</p>'}
  <div class="town-wrap"><canvas id="town-canvas" role="img" aria-label="Gatepost town. Tap a building, a bot or HQ."></canvas></div>
  <div class="town-legend"><button class="town-chip hq" onclick="openHQ()"><span class="dot" style="background:#F6F4EF"></span>HQ</button>${chips}</div>
  <p class="muted town-note">${ADMIN ? 'The town is decorative. Badges come from your Requests and bot chats.' : 'The town is decorative: it shows where the bots work.'}</p></div>`; };

// ---------- sheets ----------
window.openBot = i => { OPEN = { kind: 'bot', i, tab: ADMIN ? (unread(BOTS[i].name) && !stats(BOTS[i].name).pending ? 'chat' : 'requests') : 'about' }; renderSheet(true); if (OPEN.tab === 'chat') markRead(BOTS[i].name); };
window.openHQ = () => { OPEN = { kind: 'hq' }; renderSheet(true); };
window.closeBot = () => { OPEN = null; document.getElementById('bot-sheet')?.remove(); if (!document.getElementById('req-sheet')) document.body.classList.remove('sheet-open'); };
window.townTab = tab => { if (!OPEN) return; OPEN.tab = tab; renderSheet(false); if (tab === 'chat') { markRead(BOTS[OPEN.i].name); setTimeout(() => { const l = document.querySelector('.chat-log'); if (l) l.scrollTop = l.scrollHeight; }, 0); } };
window.townGo = (pageName, filter) => { closeBot(); document.querySelector(`.nav button[data-page="${pageName}"]`)?.click(); if (filter) { REQ_FILTER = filter; render(); } window.scrollTo(0, 0); };
window.townDecide = async (id, status) => { if (await API.updateRequest(id, { status })) render(); };
window.townModify = id => { openReq(id); REQ_EDIT = true; renderReqDetail(false); };
async function markRead(name) { const ids = MSGS.filter(m => m.bot === name && m.sender === 'bot' && !m.read_at).map(m => m.id); if (!ids.length) return;
  const now = new Date().toISOString(); MSGS.forEach(m => { if (ids.includes(m.id)) m.read_at = now; }); staticDirty = true;
  await sb.from('bot_messages').update({ read_at: now }).in('id', ids); }
window.townSend = async () => { const ta = document.getElementById('chat-text'); const body = (ta?.value || '').trim(); if (!body || !OPEN) return;
  const btn = document.getElementById('chat-send'); if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  const { error } = await sb.from('bot_messages').insert({ bot: BOTS[OPEN.i].name, sender: 'admin', author: S.me.email, body });
  if (error) { alert(error.message); if (btn) { btn.disabled = false; btn.textContent = 'Send'; } return; }
  if (ta) ta.value = ''; await loadChat(); renderSheet(false); setTimeout(() => { const l = document.querySelector('.chat-log'); if (l) l.scrollTop = l.scrollHeight; document.getElementById('chat-text')?.focus(); }, 0); };
const when = d => new Date(d).toLocaleString([], { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' MT';
// Real timeline: bot_activity rows + requests posted/decided + chat replies. Newest first.
function timeline(name) {
  const ev = [];
  ACTS.filter(a => a.bot === name).forEach(a => ev.push({ at: a.created_at, icon: a.done ? '✔' : a.eta ? '⏳' : '•', text: a.body, sub: a.done ? 'Finished' : a.eta ? 'ETA ' + a.eta : '' }));
  reqs().filter(r => r.from === name).forEach(r => {
    if (r.createdAt) ev.push({ at: r.createdAt, icon: '＋', text: 'Posted request: ' + ((r.title || '').trim() || r.text), id: r.id });
    if (r.status !== 'pending' && r.decidedAt && !/\(bot\)$/.test(r.decidedBy || '')) ev.push({ at: r.decidedAt, icon: r.status === 'approved' ? '✓' : '✕', text: (r.status === 'approved' ? 'Approved: ' : r.status === 'denied' ? 'Declined: ' : r.status + ': ') + ((r.title || '').trim() || r.text), sub: r.decidedBy ? 'by ' + r.decidedBy : '', id: r.id });
    (r.notes || []).forEach(n => n.at && ev.push({ at: n.at, icon: '✎', text: 'Note on ' + ((r.title || '').trim() || 'request') + ': ' + n.text, sub: n.by ? 'by ' + n.by : '', id: r.id }));
  });
  MSGS.filter(m => m.bot === name && m.sender === 'bot').forEach(m => ev.push({ at: m.created_at, icon: '💬', text: 'Replied in chat: ' + m.body }));
  return ev.filter(e => !isNaN(Date.parse(e.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
const current = name => { const a = ACTS.find(x => x.bot === name && (x.eta || x.done)); return a && !a.done && a.eta ? a : null; };
function reqRow(r) {
  return `<div class="item req-card town-req"><div class="req-top" onclick="openReq(${Number(r.id)})"><span class="badge ${esc(r.status)}">${esc(r.status)}</span>${(r.notes || []).length ? ` <span class="muted">· ${r.notes.length} note${r.notes.length > 1 ? 's' : ''}</span>` : ''}<span class="chev">›</span></div>
    <div class="req-title" onclick="openReq(${Number(r.id)})">${esc((r.title || '').trim() || r.text)}</div>
    ${r.amount || r.when ? `<div class="req-meta">${r.amount ? `<span>${esc(r.amount)}</span>` : ''}${r.when ? `<span>${esc(r.when)}</span>` : ''}</div>` : ''}
    ${r.status === 'pending' ? `<div class="mini-actions"><button class="ok" onclick="townDecide(${Number(r.id)},'approved')">Approve</button><button class="danger" onclick="townDecide(${Number(r.id)},'denied')">Decline</button><button class="secondary" onclick="townModify(${Number(r.id)})">Modify</button></div>` : ''}</div>`;
}
function renderSheet(animate) {
  const prev = document.getElementById('bot-sheet'), sc = prev?.querySelector('.sheet-body')?.scrollTop || 0, draft = document.getElementById('chat-text')?.value; prev?.remove(); if (!OPEN) return;
  ADMIN = typeof isAdmin === 'function' && isAdmin();
  const el = document.createElement('div'); el.id = 'bot-sheet'; el.className = 'sheet' + (animate ? ' anim' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  if (OPEN.kind === 'hq') {
    const up = (S.events || []).filter(e => (e.date || '') >= new Date().toISOString().slice(0, 10)).length, pend = reqs().filter(r => r.status === 'pending').length, waiting = (S.users || []).filter(u => u.role === 'pending').length;
    const row = (icon, title, sub, onclick, n) => `<button class="hq-row" onclick="${onclick}"><span class="hq-ico">${icon}</span><span class="hq-txt"><b>${esc(title)}</b><span class="muted">${esc(sub)}</span></span>${n ? `<span class="hq-n">${n}</span>` : ''}<span class="chev">›</span></button>`;
    el.innerHTML = `<div class="sheet-head"><button class="sheet-back" onclick="closeBot()" aria-label="Back">‹ Town</button><span class="badge">HQ</span></div>
    <div class="sheet-body"><div class="bot-hero"><span class="hq-ava"><img src="arch-mark.png" alt=""></span><div><h2 class="sheet-title" style="margin:0">${ADMIN ? 'Christian\u2019s HQ' : 'Gatepost HQ'}</h2><div class="muted">${ADMIN ? 'Run the business from here.' : 'Schedule and your account.'}</div></div></div>
      <div class="hq-list">${row('📅', 'Calendar', up ? `${up} upcoming` : 'Schedule and jobs', "townGo('calendar')")}
      ${ADMIN ? row('✅', 'All requests', pend ? `${pend} waiting on you` : 'Nothing waiting', "townGo('requests')", pend) : ''}
      ${ADMIN ? row('👥', 'Team', waiting ? `${waiting} waiting for access` : 'Roles and access', "townGo('admin')", waiting) : ''}
      ${ADMIN ? row('🧮', 'Estimates', 'Pricing calculator', "townGo('estimate')") : ''}
      ${row('⚙️', ADMIN ? 'Settings & account' : 'My info & settings', S.me ? S.me.email : '', "townGo('dashboard')")}</div></div>`;
  } else {
    const bt = BOTS[OPEN.i], ch = chars[OPEN.i], s = stats(bt.name), h = denverHour(), u = unread(bt.name);
    const where = ch.walking ? (ch.where === 'home' ? 'Walking home' : `Walking to the ${bt.place}`) : ch.where === 'home' ? 'At home' : `At the ${bt.place}`;
    const line = ch.where === 'home' && !ch.walking ? 'Off the clock until 7 AM. Snoozing at home.' : bt.work;
    let body = '';
    if (!ADMIN) body = `<p class="sheet-text">${esc(line)}</p><dl class="facts"><dt>Job</dt><dd>${esc(bt.role)}</dd><dt>Right now</dt><dd>${esc(where)} · ${esc(clockLabel(h))}</dd></dl>`;
    else {
      const tabs = `<div class="town-tabs"><button class="${OPEN.tab === 'requests' ? 'on' : ''}" onclick="townTab('requests')">Requests${s.pending ? ` <b>${s.pending}</b>` : ''}</button><button class="${OPEN.tab === 'chat' ? 'on' : ''}" onclick="townTab('chat')">Chat${u ? ` <b class="chat">${u}</b>` : ''}</button><button class="${OPEN.tab === 'activity' ? 'on' : ''}" onclick="townTab('activity')">Activity</button></div>`;
      const cur = current(bt.name), curHtml = cur ? `<div class="now-card"><span class="muted">In progress</span><b>${esc(cur.body)}</b><span class="muted">ETA ${esc(cur.eta)} · since ${esc(when(cur.created_at))}</span></div>` : '';
      if (OPEN.tab === 'activity') {
        const tl = timeline(bt.name);
        body = tabs + (curHtml || '<p class="muted" style="margin-top:12px;font-size:.82rem;">Nothing in progress right now.</p>') + `<ol class="timeline">${tl.slice(0, 40).map(e => `<li${e.id ? ` onclick="openReq(${Number(e.id)})" class="tap"` : ''}><span class="tl-ico">${esc(e.icon)}</span><div><div>${esc(e.text)}</div><div class="muted">${esc(when(e.at))}${e.sub ? ' · ' + esc(e.sub) : ''}</div></div></li>`).join('') || '<li class="muted">No activity yet.</li>'}</ol>`;
      } else if (OPEN.tab === 'chat') {
        const ms = MSGS.filter(m => m.bot === bt.name);
        body = tabs + `<div class="chat-log">${ms.length ? ms.map(m => `<div class="msg ${m.sender}"><div class="bubble">${esc(m.body)}</div><div class="meta">${esc(m.sender === 'bot' ? bt.short + ' bot' : (m.author === S.me.email ? 'You' : m.author))} · ${esc(when(m.created_at))}</div></div>`).join('') : `<p class="muted" style="text-align:center;margin:24px 0;">No messages yet. Say hi to ${esc(bt.name)}.</p>`}</div>
        <p class="muted chat-hint">Bots read this desk and reply with their posting token.</p>`;
      } else {
        const list = s.rs.slice().sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
        body = tabs + curHtml + `<p class="sheet-text" style="margin-top:12px;">${esc(line)} ${s.pending ? `${s.pending} waiting on you.` : s.total ? 'Nothing waiting on you.' : 'No requests from this bot yet.'}</p>
        <dl class="facts"><dt>Right now</dt><dd>${esc(where)} · ${esc(clockLabel(h))}</dd><dt>Decided (7 days)</dt><dd>${s.decided}</dd></dl>
        <div class="town-reqs">${list.slice(0, 12).map(reqRow).join('') || ''}</div>${list.length > 12 ? `<p class="muted">+ ${list.length - 12} more</p>` : ''}`;
      }
    }
    el.innerHTML = `<div class="sheet-head"><button class="sheet-back" onclick="closeBot()" aria-label="Back">‹ Town</button><span class="badge" style="border-color:${bt.color};color:${bt.color === '#2b2b2b' ? 'var(--paper)' : bt.color};white-space:nowrap">${esc(bt.place)}</span></div>
    <div class="sheet-body"><div class="bot-hero"><span class="bot-ava" style="background:${bt.color}"><i></i></span><div><h2 class="sheet-title" style="margin:0">${esc(bt.name)}</h2><div class="muted">${esc(bt.role)}</div></div></div>${body}</div>
    ${ADMIN && OPEN.tab === 'chat' ? `<div class="sheet-actions chat-compose"><textarea id="chat-text" rows="1" placeholder="Message ${esc(bt.short)}…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();townSend()}"></textarea><button class="primary" id="chat-send" onclick="townSend()">Send</button></div>`
      : ADMIN ? `<div class="sheet-actions"><button class="secondary" onclick="townGo('requests', '${esc(bt.name)}')">Open in Requests${s.total ? ` (${s.total})` : ''}</button></div>` : ''}`;
  }
  const nav = document.getElementById('main-nav'); if (nav && !nav.classList.contains('hidden')) el.style.bottom = nav.getBoundingClientRect().height + 'px';
  document.body.insertBefore(el, document.getElementById('req-sheet')); document.body.classList.add('sheet-open');
  const b = el.querySelector('.sheet-body'); if (!animate && sc && b) b.scrollTop = sc;
  if (draft) { const ta = document.getElementById('chat-text'); if (ta) ta.value = draft; }
  const log = el.querySelector('.chat-log'); if (log && animate) log.scrollTop = log.scrollHeight;
}
window.townAfterRender = () => {
  ADMIN = typeof isAdmin === 'function' && isAdmin();
  if (ADMIN) queueChat(); else MSGS = [];
  const el = document.getElementById('town-canvas');
  if (!el) { stop(); cv = null; if (OPEN && !document.getElementById('req-sheet')) closeBot(); return; }
  if (el !== cv) { cv = el; setup(); } else staticDirty = true;
  if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
  if (OPEN && !(document.activeElement && document.activeElement.id === 'chat-text')) renderSheet(false);
};
window.addEventListener('resize', () => { if (cv && cv.isConnected) setup(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && cv && cv.isConnected && !raf) { last = 0; raf = requestAnimationFrame(loop); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && OPEN && !document.getElementById('req-sheet')) closeBot(); });
})();
