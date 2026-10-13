// Gatepost Town: a small canvas world where the bots "live". Visual only; counts come from S.requests.
(() => {
const TZ = 'America/Denver';
const INK = '#141414', CREAM = '#F6F4EF', PAPER = '#fbf8f1', WALL = '#ece6d8', ROAD = '#ddd3bf', GROUND = '#e9e5d8', GRASS = '#d5dcc6', TREE = '#6f8f74', TREE2 = '#56735b', LIT = '#f2c96b';
const BOTS = [
  { name: 'Gatepost', role: 'Office admin: bids, calendar and cash', color: '#2b2b2b', place: 'Town Hall', glyph: '$',
    b: { type: 'hall', x: 5, y: 1.4, w: 6, h: 5.1 }, door: [8, 6.9], work: 'At the town hall, keeping the calendar and the cash straight.' },
  { name: 'Gatepost Leads', role: 'Lead finder: Nextdoor, Facebook and Craigslist', color: '#6f8f74', place: 'Lookout Tower', glyph: '!',
    b: { type: 'tower', x: 1, y: 1.6, w: 3, h: 5.6 }, door: [2.5, 7.6], work: 'Up in the lookout tower, scanning the neighborhood for leads.' },
  { name: 'Gatepost Bids', role: 'Bids and OneDrive filing', color: '#b39a6b', place: 'Drafting Office', glyph: '✎',
    b: { type: 'shop', x: 11.9, y: 2.4, w: 3.7, h: 4.3 }, door: [13.75, 7.1], work: 'In the drafting office, filing bids in the cabinets.' },
  { name: 'Gatepost Tasks', role: 'Christian\u2019s to-do list', color: '#a85a52', place: 'Notice Board', glyph: '✓',
    b: { type: 'kiosk', x: 0.9, y: 11.4, w: 3.8, h: 3.2 }, door: [2.8, 10.9], work: 'At the notice board, pinning up to-dos.' },
  { name: 'Gatepost App', role: 'Builds and maintains this app', color: '#5f7a8a', place: 'Tech Garage', glyph: '</>',
    b: { type: 'yard', x: 10.8, y: 11.4, w: 4.8, h: 3.6 }, door: [13.2, 10.9], work: 'In the tech garage, tinkering with the app.' },
];
const COLS = 16, ROWS = 20;
BOTS.forEach((bt, i) => { const x = 0.35 + i * 3.1; bt.home = { x, y: 17.3, w: 2.7, h: 2.3 }; bt.hdoor = [x + 1.35, 17.2]; });
const TREES = [[4.7, 8.1], [11.2, 8.0], [0.5, 9.4], [15.5, 9.5], [5.6, 12.2], [5.3, 14.6], [10.1, 15.2], [15.6, 16.3], [0.4, 16.2], [6.3, 7.9]];

// ---- time ----
const qh = new URLSearchParams(location.search).get('townhour');
function denverHour() {
  if (qh !== null && !isNaN(+qh)) return +qh;
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  return (+p.find(x => x.type === 'hour').value % 24) + (+p.find(x => x.type === 'minute').value) / 60;
}
const atWork = h => h >= 7 && h < 21.5;
function darkness(h) { if (h >= 7 && h < 18) return 0; if (h >= 18 && h < 20.5) return (h - 18) / 2.5 * 0.62; if (h >= 20.5 || h < 5.5) return 0.62; return (7 - h) / 1.5 * 0.62; }
function clockLabel(h) { const H = Math.floor(h), M = Math.round((h - H) * 60); const d = new Date(2000, 0, 1, H, M); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' MT'; }

// ---- live info (real data only) ----
const matches = (r, name) => r.from === name || (r.sources || []).includes(name);
function stats(name) {
  const rs = ((typeof S !== 'undefined' && S.requests) || []).filter(r => matches(r, name));
  const week = Date.now() - 7 * 864e5;
  const pending = rs.filter(r => r.status === 'pending').length;
  const decided = rs.filter(r => r.status !== 'pending' && r.decidedAt && Date.parse(r.decidedAt) >= week).length;
  const latest = rs.slice().sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))[0];
  return { pending, decided, latest, total: rs.length };
}

// ---- characters ----
const chars = BOTS.map((bt, i) => ({ i, x: 0, y: 0, path: [], where: null, walkT: 0, nextStroll: 6 + i * 4 + Math.random() * 8, blink: Math.random() * 4, emote: 2 + i * 1.3 }));
function routeTo(ch, dest) {
  const bt = BOTS[ch.i], d = bt.door, h = bt.hdoor;
  const toHome = [[d[0], d[1]], [d[0], 9.5], [8, 9.5], [8, 16.2], [h[0], 16.2], [h[0], h[1]]];
  ch.path = dest === 'home' ? toHome : toHome.slice().reverse(); ch.where = dest; ch.walking = true;
}
function place(ch, dest) { const bt = BOTS[ch.i], p = dest === 'home' ? bt.hdoor : bt.door; ch.x = p[0]; ch.y = p[1]; ch.where = dest; ch.path = []; ch.walking = false; }
function stroll(ch) {
  const d = BOTS[ch.i].door, tx = Math.max(1, Math.min(15, d[0] + (Math.random() < .5 ? -1 : 1) * (1.2 + Math.random() * 2)));
  ch.path = [[d[0], 9.5], [tx, 9.5], [tx, 9.5], [d[0], 9.5], [d[0], d[1]]]; ch.walking = true;
}
let started = false, lastWork = null;
function syncClock() {
  const h = denverHour(), w = atWork(h);
  if (!started) { chars.forEach(c => place(c, w ? 'work' : 'home')); started = true; }
  else if (w !== lastWork) chars.forEach(c => routeTo(c, w ? 'work' : 'home'));
  lastWork = w; return h;
}

// ---- canvas ----
let cv = null, ctx = null, T = 20, W = 320, H = 400, dpr = 1, stat = null, sctx = null, raf = null, last = 0, hour = 12, dark = 0, clockT = 0, OPEN_BOT = null;
const px = v => Math.round(v * T);
function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(px(x), px(y), Math.max(1, px(x + w) - px(x)), Math.max(1, px(y + h) - px(y))); }
function box(c, x, y, w, h, col) { const o = Math.max(1, Math.round(T / 14)) / T; rect(c, x, y, w, h, INK); rect(c, x + o, y + o, w - 2 * o, h - 2 * o, col); }
function tri(c, x1, y1, x2, y2, x3, y3, col) { c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = Math.max(1, T / 14); c.beginPath(); c.moveTo(px(x1), px(y1)); c.lineTo(px(x2), px(y2)); c.lineTo(px(x3), px(y3)); c.closePath(); c.fill(); c.stroke(); }
function win(c, x, y, w, h, lit) { box(c, x, y, w, h, lit ? LIT : '#b9c4c9'); }
function label(c, text, cx, y) {
  c.font = `600 ${Math.max(8, Math.round(T * 0.42))}px -apple-system, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const tw = c.measureText(text).width + T * 0.5, hh = T * 0.62, x0 = px(cx) - tw / 2, y0 = px(y);
  c.fillStyle = 'rgba(20,20,20,.82)'; c.beginPath(); c.roundRect ? c.roundRect(x0, y0, tw, hh, hh / 2) : c.rect(x0, y0, tw, hh); c.fill();
  c.fillStyle = CREAM; c.fillText(text, px(cx), y0 + hh / 2 + 0.5);
}

function drawBuilding(c, bt, lit) {
  const { type, x, y, w, h } = bt.b, col = bt.color;
  if (type === 'hall') {
    rect(c, x + 0.6, y + h - 0.35, w - 1.2, 0.35, '#c9bfa9'); // steps
    box(c, x + 0.3, y + 1.6, w - 0.6, h - 1.95, PAPER);
    tri(c, x, y + 1.75, x + w / 2, y + 0.25, x + w, y + 1.75, INK);
    c.fillStyle = CREAM; c.beginPath(); c.arc(px(x + w / 2), px(y + 1.15), T * 0.32, 0, 7); c.fill();
    c.strokeStyle = INK; c.lineWidth = Math.max(1, T / 12); c.beginPath(); c.moveTo(px(x + w / 2), px(y + 1.15)); c.lineTo(px(x + w / 2), px(y + 0.92)); c.moveTo(px(x + w / 2), px(y + 1.15)); c.lineTo(px(x + w / 2 + 0.18), px(y + 1.15)); c.stroke();
    for (let k = 0; k < 4; k++) rect(c, x + 0.75 + k * (w - 1.9) / 3, y + 1.9, 0.32, h - 2.6, '#d8cfbb');
    win(c, x + 1.3, y + 2.3, 0.75, 0.9, lit); win(c, x + w - 2.05, y + 2.3, 0.75, 0.9, lit);
    box(c, x + w / 2 - 0.5, y + h - 1.65, 1, 1.3, '#3a332a');
    rect(c, x + w / 2 - 0.05, y - 0.9, 0.1, 1.2, INK); // flagpole (flag animates)
  } else if (type === 'tower') {
    box(c, x + 0.55, y + 1.8, w - 1.1, h - 1.8, WALL);
    for (let k = 0; k < 3; k++) rect(c, x + 0.6, y + 2.6 + k * 1, w - 1.2, 0.12, '#c9bfa9');
    box(c, x + 0.1, y + 0.8, w - 0.2, 1.15, PAPER);
    win(c, x + 0.35, y + 1.0, 0.9, 0.6, lit); win(c, x + w - 1.25, y + 1.0, 0.9, 0.6, lit);
    tri(c, x - 0.15, y + 0.85, x + w / 2, y - 0.3, x + w + 0.15, y + 0.85, col);
    rect(c, x + w - 0.2, y + 1.15, 0.7, 0.22, INK); // telescope
    box(c, x + w / 2 - 0.42, y + h - 1.2, 0.84, 1.2, '#3a332a');
    box(c, x + w - 0.3, y + h - 0.9, 0.5, 0.45, col); rect(c, x + w - 0.1, y + h - 0.45, 0.1, 0.45, INK); // mailbox
  } else if (type === 'shop') {
    box(c, x, y + 1.1, w, h - 1.1, WALL);
    tri(c, x, y + 1.15, x + w * 0.25, y + 0.25, x + w * 0.5, y + 1.15, col); tri(c, x + w * 0.5, y + 1.15, x + w * 0.75, y + 0.25, x + w, y + 1.15, col);
    box(c, x + 0.3, y + 1.5, 1.6, 1.1, lit ? LIT : '#c7d3dc'); // drafting window
    c.strokeStyle = '#5f7a8a'; c.lineWidth = 1; c.beginPath(); c.moveTo(px(x + 0.5), px(y + 2.3)); c.lineTo(px(x + 1.7), px(y + 1.75)); c.stroke();
    box(c, x + 2.25, y + 2.2, 0.7, h - 2.2, '#3a332a'); // door
    for (let k = 0; k < 2; k++) { const fx = x + 0.3 + k * 0.85; box(c, fx, y + h - 1.35, 0.75, 1.35, '#a8a69d'); rect(c, fx + 0.1, y + h - 0.95, 0.55, 0.06, INK); rect(c, fx + 0.1, y + h - 0.5, 0.55, 0.06, INK); }
  } else if (type === 'kiosk') {
    rect(c, x + 0.5, y + 0.8, 0.2, h - 0.8, INK); rect(c, x + w - 0.7, y + 0.8, 0.2, h - 0.8, INK);
    box(c, x + 0.2, y + 0.75, w - 0.4, 1.9, '#c9a777');
    rect(c, x, y + 0.45, w, 0.38, col);
    const notes = [PAPER, '#f2e6b8', '#dfe8d9', PAPER, '#f0d9d3', '#f2e6b8'];
    notes.forEach((n, k) => { const nx = x + 0.45 + (k % 3) * 1.05, ny = y + 1.0 + Math.floor(k / 3) * 0.8; rect(c, nx, ny, 0.75, 0.6, n); rect(c, nx + 0.33, ny - 0.05, 0.1, 0.1, '#a85a52'); });
  } else if (type === 'yard') {
    for (let k = 0; k <= w; k += 0.5) rect(c, x + k, y + h - 0.12, 0.08, 0.12, '#8a8172');
    rect(c, x, y + h - 0.1, w, 0.06, '#8a8172');
    box(c, x + 0.2, y + 1.0, 2.9, 2.4, WALL);
    tri(c, x + 0.05, y + 1.05, x + 1.65, y + 0.2, x + 3.25, y + 1.05, col);
    box(c, x + 0.5, y + 1.9, 1.5, 1.5, '#9aa3a6'); for (let k = 0; k < 4; k++) rect(c, x + 0.55, y + 2.1 + k * 0.32, 1.4, 0.05, '#7c8487');
    box(c, x + 2.2, y + 1.5, 0.7, 0.55, lit ? '#9fd3c7' : '#2d3b3f'); rect(c, x + 2.3, y + 1.65, 0.35, 0.05, '#9fd3c7'); rect(c, x + 2.3, y + 1.8, 0.45, 0.05, '#9fd3c7');
    rect(c, x + w - 0.75, y - 0.9, 0.18, h - 0.1 + 0.9, '#c79a3b'); rect(c, x + 1.5, y - 0.9, w - 2.1, 0.15, '#c79a3b'); // crane
    [[x + 3.4, y + 3.0], [x + 3.9, y + 2.7]].forEach(([cx, cy]) => tri(c, cx, cy + 0.4, cx + 0.2, cy - 0.05, cx + 0.4, cy + 0.4, '#a85a52'));
    box(c, x + 3.35, y + 1.6, 0.8, 0.5, '#c9a777');
  }
}
function drawHome(c, bt, lit) {
  const { x, y, w, h } = bt.home;
  box(c, x + 0.2, y + 0.75, w - 0.4, h - 0.75, PAPER);
  tri(c, x, y + 0.85, x + w / 2, y - 0.1, x + w, y + 0.85, bt.color);
  box(c, x + w / 2 - 0.35, y + h - 1.0, 0.7, 1.0, '#3a332a');
  win(c, x + 0.45, y + 1.05, 0.5, 0.45, lit); win(c, x + w - 0.95, y + 1.05, 0.5, 0.45, lit);
}
function drawStatic() {
  const c = sctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.imageSmoothingEnabled = false;
  rect(c, 0, 0, COLS, ROWS, GROUND);
  [[0, 0, 16, 1], [0, 7.6, 16, 0.5], [9.6, 10.9, 1, 4.7]].forEach(([a, b, w, h]) => rect(c, a, b, w, h, GRASS));
  rect(c, 0, 8.8, COLS, 1.4, ROAD); rect(c, 7.4, 6.9, 1.2, 10, ROAD); rect(c, 0, 15.6, COLS, 1.2, ROAD);
  BOTS.forEach(bt => { const d = bt.door; if (d[1] < 8.8) rect(c, d[0] - 0.35, d[1] - 0.2, 0.7, 8.8 - d[1] + 0.2, ROAD); });
  BOTS.forEach(bt => rect(c, bt.hdoor[0] - 0.3, 16.8, 0.6, 0.6, ROAD));
  for (let k = 0.5; k < COLS; k += 1.5) rect(c, k, 9.47, 0.7, 0.06, '#f7f2e6');
  // little plaza + fountain
  c.fillStyle = '#d3c8b1'; c.beginPath(); c.arc(px(8), px(13.1), T * 1.45, 0, 7); c.fill();
  c.fillStyle = INK; c.beginPath(); c.arc(px(8), px(13.1), T * 0.95, 0, 7); c.fill();
  c.fillStyle = '#9fc3cf'; c.beginPath(); c.arc(px(8), px(13.1), T * 0.82, 0, 7); c.fill();
  rect(c, 7.85, 12.6, 0.3, 0.5, '#d8cfbb');
  const lit = dark > 0.15;
  BOTS.forEach(bt => drawBuilding(c, bt, lit));
  BOTS.forEach((bt, i) => drawHome(c, bt, lit && chars[i].where === 'home'));
  TREES.forEach(([tx, ty]) => { rect(c, tx - 0.08, ty + 0.1, 0.16, 0.45, '#6b5a43'); c.fillStyle = TREE2; c.beginPath(); c.arc(px(tx), px(ty), T * 0.5, 0, 7); c.fill(); c.fillStyle = TREE; c.beginPath(); c.arc(px(tx - 0.1), px(ty - 0.1), T * 0.38, 0, 7); c.fill(); });
  [[4.9, 9.1], [11.1, 9.1], [7.1, 15.6], [8.9, 15.6]].forEach(([lx, ly]) => { rect(c, lx, ly - 0.9, 0.1, 0.9, INK); rect(c, lx - 0.1, ly - 1.05, 0.3, 0.2, lit ? LIT : '#8a8172'); });
  BOTS.forEach(bt => { const b = bt.b, ly = b.y + b.h + 0.12; label(c, bt.place, b.x + b.w / 2, b.type === 'hall' ? b.y + b.h + 0.05 : Math.min(ly, ROWS - 0.7)); });
  if (dark > 0) { c.fillStyle = `rgba(14,18,46,${dark})`; c.fillRect(0, 0, W, H); if (lit) BOTS.forEach((bt, i) => { [bt.b, ...(chars[i].where === 'home' ? [bt.home] : [])].forEach(r => { const g = c.createRadialGradient(px(r.x + r.w / 2), px(r.y + r.h / 2), 1, px(r.x + r.w / 2), px(r.y + r.h / 2), T * 2.2); g.addColorStop(0, `rgba(242,201,107,${dark * 0.5})`); g.addColorStop(1, 'rgba(242,201,107,0)'); c.fillStyle = g; c.fillRect(px(r.x - 1), px(r.y - 1), px(r.w + 2), px(r.h + 2)); }); }); }
  BOTS.forEach(bt => { const s = stats(bt.name); if (!s.pending) return; const b = bt.b, cx = px(b.x + b.w - 0.1), cy = px(b.y + 0.1), r = T * 0.45;
    c.fillStyle = '#a85a52'; c.strokeStyle = CREAM; c.lineWidth = Math.max(1.5, T / 10); c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill(); c.stroke();
    c.fillStyle = CREAM; c.font = `700 ${Math.round(T * 0.5)}px -apple-system, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(s.pending), cx, cy + 0.5); });
}
function drawRobot(c, ch, t) {
  const bt = BOTS[ch.i], u = T / 10, X = Math.round(ch.x * T), Y = Math.round(ch.y * T);
  const step = ch.walking ? Math.floor(t * 8) % 2 : 0, bob = ch.walking ? step : (Math.sin(t * 3 + ch.i) > 0.6 ? -1 : 0);
  c.fillStyle = 'rgba(20,20,20,.22)'; c.beginPath(); c.ellipse(X, Y, 3.2 * u, 1.1 * u, 0, 0, 7); c.fill();
  const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(X + Math.round(x * u), Y + Math.round((y + bob * 0.5) * u), Math.ceil(w * u), Math.ceil(h * u)); };
  r(-2, -2.6, 1.4, 2.6 - (step ? 0.8 : 0), INK); r(0.6, -2.6, 1.4, 2.6 - (step ? 0 : 0.8), INK);
  r(-2.9, -6.6, 5.8, 4.3, INK); r(-2.4, -6.1, 4.8, 3.3, bt.color);
  const arm = !ch.walking && ch.where === 'work' ? (Math.sin(t * 5 + ch.i * 2) > 0 ? -1.2 : 0) : 0;
  r(-3.9, -6.1 + arm, 1.1, 2.6, INK); r(2.8, -6.1 - arm, 1.1, 2.6, INK);
  r(-3.2, -11.6, 6.4, 5.2, INK); r(-2.7, -11.1, 5.4, 4.2, '#ece7db');
  const blink = (t + ch.blink) % 4 < 0.15; const look = ch.i === 1 && !ch.walking ? Math.round(Math.sin(t * 0.8)) : 0;
  if (!blink) { r(-1.7 + look * 0.5, -9.6, 1.1, 1.3, INK); r(0.6 + look * 0.5, -9.6, 1.1, 1.3, INK); } else { r(-1.7, -9.0, 1.1, 0.4, INK); r(0.6, -9.0, 1.1, 0.4, INK); }
  r(-0.25, -13.4, 0.5, 1.8, INK);
  c.fillStyle = dark > 0.15 ? LIT : bt.color; c.beginPath(); c.arc(X, Y + Math.round((-13.8 + bob * 0.5) * u), 1.0 * u, 0, 7); c.fill();
  if (!ch.walking && ch.where === 'work' && (t + ch.emote) % 7 < 1.8) {
    const bx = X + 3.6 * u, by = Y - 16 * u; c.font = `700 ${Math.round(T * 0.48)}px -apple-system, system-ui, sans-serif`; const tw = Math.max(c.measureText(bt.glyph).width + 6, 2.2 * T / 2);
    c.fillStyle = PAPER; c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.roundRect ? c.roundRect(bx, by, tw, T * 0.7, 4) : c.rect(bx, by, tw, T * 0.7); c.fill(); c.stroke();
    c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(bt.glyph, bx + tw / 2, by + T * 0.36);
  }
}
function drawFrame(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(stat, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hall = BOTS[0].b, fx = px(hall.x + hall.w / 2 + 0.05), fy = px(hall.y - 0.9), wave = Math.sin(t * 4) * T * 0.08; // flag
  ctx.fillStyle = '#a85a52'; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + T * 0.8, fy + T * 0.18 + wave); ctx.lineTo(fx, fy + T * 0.4); ctx.fill();
  const tw = BOTS[1].b; if (Math.floor(t * 1.5) % 2) { ctx.fillStyle = dark > 0.15 ? LIT : 'rgba(242,201,107,.8)'; ctx.beginPath(); ctx.arc(px(tw.x + tw.w / 2), px(tw.y - 0.35), T * 0.14, 0, 7); ctx.fill(); }
  const yd = BOTS[4].b, hx = px(yd.x + 1.9 + Math.sin(t * 1.2) * 0.25), hy = px(yd.y - 0.75); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px(yd.x + 1.9), hy); ctx.lineTo(hx, hy + T * 0.9); ctx.stroke(); ctx.fillStyle = INK; ctx.fillRect(hx - T * 0.12, hy + T * 0.9, T * 0.24, T * 0.18);
  ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let k = 0; k < 3; k++) { const a = t * 2 + k * 2.1, rr = (0.25 + ((t * 0.6 + k / 3) % 1) * 0.5) * T; ctx.fillRect(px(8) + Math.cos(a) * rr, px(13.1) + Math.sin(a) * rr * 0.6, 2, 2); }
  chars.slice().sort((a, b) => a.y - b.y).forEach(ch => { if (ch.where === 'home' && !ch.walking) return; drawRobot(ctx, ch, t); });
  chars.forEach((ch, i) => { if (ch.where !== 'home' || ch.walking) return; const hm = BOTS[i].home, o = (t * 0.7 + i * 0.37) % 1;
    ctx.globalAlpha = 1 - o; ctx.fillStyle = dark > 0.15 ? CREAM : INK; ctx.font = `700 ${Math.round(T * (0.35 + o * 0.25))}px -apple-system, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.fillText('z', px(hm.x + hm.w - 0.5 + o * 0.5), px(hm.y - 0.1 - o * 0.9)); ctx.globalAlpha = 1; });
}
function update(dt) {
  chars.forEach(ch => {
    if (ch.path.length) { const [tx, ty] = ch.path[0], dx = tx - ch.x, dy = ty - ch.y, d = Math.hypot(dx, dy), sp = 2.4 * dt;
      if (d <= sp) { ch.x = tx; ch.y = ty; ch.path.shift(); if (!ch.path.length) { ch.walking = false; staticDirty = true; } } else { ch.x += dx / d * sp; ch.y += dy / d * sp; } }
    else if (ch.where === 'work' && (ch.nextStroll -= dt) <= 0) { stroll(ch); ch.nextStroll = 14 + Math.random() * 18; }
  });
}
let staticDirty = true, tick = 0;
function loop(ts) {
  if (!cv || !cv.isConnected || document.hidden) { stop(); return; }
  raf = requestAnimationFrame(loop);
  if (ts - last < 33) return; const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
  if ((clockT -= dt) <= 0) { clockT = 30; const before = dark; hour = syncClock(); dark = darkness(hour); if (dark !== before) staticDirty = true; const el = document.getElementById('town-clock'); if (el) el.textContent = `${clockLabel(hour)} · ${atWork(hour) ? 'Work hours: bots are at work' : 'After hours: bots are home'}`; }
  update(dt); if (staticDirty) { drawStatic(); staticDirty = false; } drawFrame(ts / 1000);
}
function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }
function setup() {
  W = Math.floor(cv.parentElement.clientWidth); T = W / COLS; H = Math.round(T * ROWS); dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx = cv.getContext('2d'); stat = document.createElement('canvas'); stat.width = cv.width; stat.height = cv.height; sctx = stat.getContext('2d');
  cv.onclick = e => { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / T, y = (e.clientY - r.top) / T; const i = hit(x, y); if (i >= 0) openBot(i); };
  hour = syncClock(); dark = darkness(hour); clockT = 0; staticDirty = true;
}
function hit(x, y) {
  for (const ch of chars) if (!(ch.where === 'home' && !ch.walking) && Math.abs(x - ch.x) < 0.6 && y < ch.y + 0.3 && y > ch.y - 1.6) return ch.i;
  for (let i = 0; i < BOTS.length; i++) { const b = BOTS[i].b, hm = BOTS[i].home;
    if (x >= b.x - 0.2 && x <= b.x + b.w + 0.2 && y >= b.y - 0.9 && y <= b.y + b.h + 0.8) return i;
    if (x >= hm.x && x <= hm.x + hm.w && y >= hm.y - 0.2 && y <= hm.y + hm.h) return i; }
  return -1;
}

// ---- page + bot card ----
window.townPage = () => `<div class="card town-card"><div class="town-head"><h2>Town</h2><span class="muted" id="town-clock"></span></div>
  <div class="town-wrap"><canvas id="town-canvas" role="img" aria-label="Gatepost town. Tap a building or bot."></canvas></div>
  <div class="town-legend">${BOTS.map((bt, i) => { const s = stats(bt.name); return `<button class="town-chip" onclick="openBot(${i})"><span class="dot" style="background:${bt.color}"></span>${esc(bt.name.replace('Gatepost ', '') || bt.name)}${s.pending ? ` <b>${s.pending}</b>` : ''}</button>`; }).join('')}</div>
  <p class="muted town-note">Just for fun: the town is decorative. Badges and counts come from your Requests.</p></div>`;
window.openBot = i => { OPEN_BOT = i; renderBot(true); };
window.closeBot = () => { OPEN_BOT = null; document.getElementById('bot-sheet')?.remove(); if (!document.getElementById('req-sheet')) document.body.classList.remove('sheet-open'); };
window.botRequests = i => { const name = BOTS[i].name; closeBot(); document.querySelector('.nav button[data-page="requests"]')?.click(); REQ_FILTER = name; render(); window.scrollTo(0, 0); };
function renderBot(animate) {
  document.getElementById('bot-sheet')?.remove(); if (OPEN_BOT === null) return;
  const bt = BOTS[OPEN_BOT], ch = chars[OPEN_BOT], s = stats(bt.name), h = denverHour();
  const where = ch.walking ? (ch.where === 'home' ? 'Walking home' : `Walking to the ${bt.place}`) : ch.where === 'home' ? 'At home' : `At the ${bt.place}`;
  const line = ch.where === 'home' && !ch.walking ? `Off the clock until 7 AM. Snoozing at home.` : bt.work;
  const waiting = s.pending ? `${s.pending} request${s.pending > 1 ? 's' : ''} waiting on you.` : s.total ? 'Nothing waiting on you right now.' : 'No requests from this bot yet.';
  const el = document.createElement('div'); el.id = 'bot-sheet'; el.className = 'sheet' + (animate ? ' anim' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="sheet-head"><button class="sheet-back" onclick="closeBot()" aria-label="Back">‹ Town</button><span class="badge" style="border-color:${bt.color};color:${bt.color === '#2b2b2b' ? 'var(--paper)' : bt.color}">${esc(bt.place)}</span></div>
  <div class="sheet-body"><div class="bot-hero"><span class="bot-ava" style="background:${bt.color}"><i></i></span><div><h2 class="sheet-title" style="margin:0">${esc(bt.name)}</h2><div class="muted">${esc(bt.role)}</div></div></div>
    <p class="sheet-text">${esc(line)} ${esc(waiting)}</p>
    <dl class="facts"><dt>Right now</dt><dd>${esc(where)} · ${esc(clockLabel(h))}</dd><dt>Pending</dt><dd>${s.pending}</dd><dt>Decided (7 days)</dt><dd>${s.decided}</dd>
      <dt>Latest request</dt><dd>${s.latest ? `<a href="#" onclick="event.preventDefault();closeBot();document.querySelector('.nav button[data-page=requests]').click();openReq(${Number(s.latest.id)})">${esc((s.latest.title || s.latest.text || '').trim())}</a><div class="muted">${esc(new Date(s.latest.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div>` : '<span class="muted">None yet</span>'}</dd></dl>
  </div><div class="sheet-actions"><button class="primary" onclick="botRequests(${OPEN_BOT})">View ${esc(bt.name)} requests${s.total ? ` (${s.total})` : ''}</button></div>`;
  const nav = document.getElementById('main-nav'); if (nav && !nav.classList.contains('hidden')) el.style.bottom = nav.getBoundingClientRect().height + 'px';
  document.body.appendChild(el); document.body.classList.add('sheet-open');
}
window.townAfterRender = () => {
  const el = document.getElementById('town-canvas');
  if (!el) { stop(); cv = null; if (OPEN_BOT !== null) closeBot(); return; }
  if (el !== cv) { cv = el; setup(); } else staticDirty = true;
  if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
  if (OPEN_BOT !== null) renderBot(false);
};
window.addEventListener('resize', () => { if (cv && cv.isConnected) { setup(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && cv && cv.isConnected && !raf) { last = 0; raf = requestAnimationFrame(loop); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && OPEN_BOT !== null) closeBot(); });
})();
