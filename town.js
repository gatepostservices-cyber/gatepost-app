// Gatepost Town v3b: a pannable 2.5D village. Buildings = bots; HQ = Christian's hub; a medieval harbor.
// Everything shown comes from real data (requests, calendar, bot_activity, bot_messages, bot_boards). Admin-only data stays admin-only.
(() => {
const TZ = 'America/Denver';
const C = { ink: '#141414', cream: '#F6F4EF', paper: '#fbf8f1', wall: '#efe9dc', wall2: '#e2d9c6', stone: '#cfc8b8', lit: '#f2c96b', door: '#3a332a', red: '#a85a52', tan: '#b39a6b', sage: '#6f8f74', slate: '#5f7a8a', tree: '#6f8f74', tree2: '#56735b', tree3: '#88a68b', dirt: '#d9c9a6', dirt2: '#c4b18a', g1: '#d9dfc8', g2: '#d1d9bf', g3: '#c8d2b5' };
const BOTS = [
  { name: 'Gatepost', short: 'Gatepost', role: 'Office admin: bids, calendar and cash', color: '#2b2b2b', place: 'Town Hall', glyph: '$', type: 'hall', at: [8.6, 11.2], work: 'At the town hall, keeping the calendar and the cash straight.' },
  { name: 'Gatepost Leads', short: 'Leads', role: 'Lead finder: Nextdoor, Facebook and Craigslist', color: C.sage, place: 'Lookout Tower', glyph: '!', type: 'tower', at: [3.9, 5.4], work: 'Up in the lookout tower, scanning the neighborhood for leads.' },
  { name: 'Gatepost Bids', short: 'Bids', role: 'Bids and OneDrive filing', color: C.tan, place: 'Drafting Office', glyph: '✎', type: 'shop', at: [21.6, 8.6], work: 'In the drafting office, filing bids in the cabinets.' },
  { name: 'Gatepost Tasks', short: 'Tasks', role: 'Christian\u2019s to-do list', color: C.red, place: 'Notice Board', glyph: '✓', type: 'kiosk', at: [5.6, 22.8], work: 'At the notice board, pinning up to-dos.' },
  { name: 'Gatepost App', short: 'App', role: 'Builds and maintains this app', color: C.slate, place: 'Tech Garage', glyph: '</>', type: 'garage', at: [22.4, 22.4], work: 'In the tech garage, tinkering with the app.' },
];
const HOME_AT = [[3.4, 31.2], [8.7, 33.6], [13.2, 30.6], [18.6, 33.2], [23.8, 30.4]];
const WX = 68, WY = 52, TILT = 0.62, ZK = 0.82;
let ADMIN = false;

// ---------- seeded layout (fixed seed: identical on every device and reload) ----------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = mulberry32(0x6A7E2026), rr = (a, b) => a + R() * (b - a), rsign = () => (R() < 0.5 ? -1 : 1);
const SIZES = { hall: [5.0, 3.4], tower: [2.6, 2.6], shop: [4.0, 3.0], kiosk: [3.4, 1.4], garage: [4.2, 3.2], hq: [5.4, 3.8], home: [2.6, 2.0] };
function mkB(type, at, extra) { const s = rr(0.92, 1.1), [w, d] = SIZES[type]; return Object.assign({ type, cx: at[0] + rr(-0.5, 0.5), cy: at[1] + rr(-0.5, 0.5), rot: rsign() * rr(0.17, 0.46), w: w * s, d: d * s, s }, extra || {}); }
BOTS.forEach(bt => { bt.b = mkB(bt.type, bt.at); });
const HQ = mkB('hq', [14.2, 19.6]); HQ.rot = rsign() * rr(0.1, 0.22);
const AI = mkB('shop', [36.4, 7.2]); AI.rot = 0.05; AI.black = true;
BOTS.forEach((bt, i) => { bt.home = mkB('home', HOME_AT[i], { col: bt.color }); });
const loc = (b, lx, ly) => { const c = Math.cos(b.rot), s = Math.sin(b.rot); return [b.cx + lx * c - ly * s, b.cy + lx * s + ly * c]; };
const doorOf = b => loc(b, 0, b.d / 2 + 0.55);
const shoreY = x => 37.3 + Math.sin(x * 0.45 + 1) * 0.55 + Math.sin(x * 1.3) * 0.22;
const PIER = { x0: 16.95, x1: 18.15, y0: 36.6, y1: 41.9 }, DOCK_SPOT = [17.55, 41.45], SHIP_HOME = 14.3, SHIP_Y = 41.35;

// path network: nodes + winding edges (quadratic curves with seeded bends)
const N = {}; const nd = (k, p) => { N[k] = { k, p, e: [] }; };
BOTS.forEach((bt, i) => nd('w' + i, doorOf(bt.b))); BOTS.forEach((bt, i) => nd('h' + i, doorOf(bt.home))); nd('hq', doorOf(HQ));
[['A', [7.6, 16.0]], ['B', [14.6, 14.6]], ['C', [20.4, 14.2]], ['D', [9.6, 27.0]], ['E', [14.6, 26.0]], ['F', [19.8, 27.4]], ['G', [16.4, 35.2]], ['L', [5.0, 9.6]]].forEach(([k, p]) => nd(k, [p[0] + rr(-0.4, 0.4), p[1] + rr(-0.4, 0.4)]));
nd('dock', DOCK_SPOT); nd('P', [17.55, 36.9]);
const EDGES = [];
function edge(a, b) { const A = N[a].p, B = N[b].p, mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), bend = (a === 'P' || b === 'dock') ? 0 : rsign() * rr(0.1, 0.24) * L;
  const cx = mx - dy / L * bend, cy = my + dx / L * bend, n = Math.max(3, Math.ceil(L / 0.35)), pts = [];
  for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; pts.push([u * u * A[0] + 2 * u * t * cx + t * t * B[0], u * u * A[1] + 2 * u * t * cy + t * t * B[1]]); }
  let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  const e = { a, b, pts, len, main: !/^h/.test(a + b) }; EDGES.push(e); N[a].e.push(e); N[b].e.push(e); }
[['w1', 'L'], ['L', 'A'], ['w0', 'A'], ['A', 'B'], ['B', 'C'], ['w2', 'C'], ['B', 'hq'], ['A', 'D'], ['w3', 'D'], ['D', 'E'], ['hq', 'E'], ['E', 'F'], ['C', 'F'], ['w4', 'F'], ['h0', 'D'], ['h1', 'D'], ['h2', 'E'], ['h3', 'F'], ['h4', 'F'], ['E', 'G'], ['G', 'P'], ['P', 'dock']].forEach(([a, b]) => edge(a, b));
nd('ai', doorOf(AI));
edge('ai', 'C');
const AI_EDGE = EDGES[EDGES.length - 1]; AI_EDGE.faint = true; AI_EDGE.main = false;

// city district: paved grid east of the village, rail, ambient traffic
const CITY = { x0: 30, x1: 64, y0: 14, y1: 34 };
const STREETS = [];
for (const y of [16, 22, 28]) STREETS.push({ a: [CITY.x0, y], b: [CITY.x1, y], main: y === 22 });
for (const x of [34, 42, 50, 58]) STREETS.push({ a: [x, CITY.y0], b: [x, CITY.y1], main: x === 42 });
const BLOCKS = [];
const ROLES = ['Bids', 'Leads', 'Tasks', 'App', 'Office', 'Filing', 'Dispatch', 'Review', 'Follow-up', 'Calendar', 'Cash', 'Crew'];
const bcols = ['#e8e2d4', '#efe9dc', '#e2d9c6', '#d9d0be', '#f4efe4', '#d4cfc3'];
for (let bx = 0; bx < 4; bx++) for (let by = 0; by < 3; by++) {
  const x = 32 + bx * 8, y = 15.2 + by * 6, tall = (bx + by) % 4 === 0;
  BLOCKS.push({ x, y, w: tall ? 3.6 : 4.2, d: 3.0, h: tall ? 4.2 : 2.2 + (bx * 3 + by) % 3 * 0.6, col: bcols[(bx + by) % bcols.length], roof: tall ? '#2b2b2b' : ((bx + by) % 2 ? '#3a3a3a' : '#5f7a8a'), role: ROLES[(bx * 3 + by) % ROLES.length] });
}
const CITY_AGENTS = [];
STREETS.forEach((st, si) => { for (let k = 0; k < 3; k++) CITY_AGENTS.push({ path: st, t: (si * 0.17 + k * 0.31) % 1, speed: 0.012 + (k % 3) * 0.004, col: ['#2b2b2b', '#6f8f74', '#a85a52', '#5f7a8a', '#b39a6b'][(si + k) % 5], side: k % 2 ? 0.55 : -0.55 }); });
const RAIL = []; for (let x = 8; x <= 62; x += 0.5) RAIL.push([x, 11.6]);
const STATIONS = [{ x: 14.2, y: 11.6, name: 'Village' }, { x: 32, y: 11.6, name: 'Midtown' }, { x: 50, y: 11.6, name: 'City' }];
const CARS = [
  { path: STREETS[2], t: 0.05, speed: 0.045, col: '#2b2b2b', face: 1 },
  { path: STREETS[2], t: 0.4, speed: 0.038, col: '#5f7a8a', face: 1 },
  { path: STREETS[2], t: 0.75, speed: 0.032, col: '#a85a52', face: -1 },
  { path: STREETS[0], t: 0.2, speed: 0.03, col: '#b39a6b', face: 1 },
  { path: STREETS[1], t: 0.6, speed: 0.028, col: '#6f8f74', face: -1 },
  { path: STREETS[5], t: 0.15, speed: 0.034, col: '#2b2b2b', face: 1 },
  { path: STREETS[3], t: 0.55, speed: 0.03, col: '#5f7a8a', face: -1 },
  { path: STREETS[4], t: 0.3, speed: 0.026, col: '#a85a52', face: 1 },
];
let trainT = 0;
function route(from, to) {
  if (from === to) return [N[to].p.slice()];
  const dist = { [from]: 0 }, prev = {}, todo = new Set(Object.keys(N));
  while (todo.size) { let u = null; todo.forEach(k => { if (dist[k] !== undefined && (u === null || dist[k] < dist[u])) u = k; }); if (u === null || u === to) break; todo.delete(u);
    N[u].e.forEach(e => { const v = e.a === u ? e.b : e.a, d = dist[u] + e.len; if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = { u, e }; } }); }
  const legs = []; let k = to; while (prev[k]) { const { u, e } = prev[k]; legs.unshift(e.a === u ? e.pts : e.pts.slice().reverse()); k = u; }
  const out = []; legs.forEach(l => l.forEach((p, j) => { if (j || !out.length) out.push(p.slice()); })); return out;
}
// terrain: hills, trees, rocks, flowers (rejection sampling against buildings, paths and water)
const ALLB = BOTS.map(b => b.b).concat([HQ, AI], BOTS.map(b => b.home));
const nearPath = (x, y, r) => EDGES.some(e => e.pts.some(p => Math.abs(p[0] - x) < r && Math.abs(p[1] - y) < r && Math.hypot(p[0] - x, p[1] - y) < r));
const nearB = (x, y, pad) => ALLB.some(b => Math.hypot(b.cx - x, b.cy - y) < Math.max(b.w, b.d) / 2 + pad) || (x > HQ.cx - 5 && x < HQ.cx - 2.6 && y > HQ.cy && y < HQ.cy + 3);
const inCamp = (x, y) => x > 33.0 && x < 40.2 && y > 4.4 && y < 10.6;
const inCity = (x, y) => x > 29.5 && x < 64.5 && y > 13.5 && y < 34.5;
const onRail = (x, y) => y > 10.8 && y < 12.6 && x > 7 && x < 63;
const HILLS = [{ x: BOTS[1].b.cx + 0.3, y: BOTS[1].b.cy + 0.6, r: 3.6 }, { x: 25.2, y: 3.2, r: 3.0 }, { x: 15.0, y: 4.0, r: 2.6 }, { x: 1.6, y: 16.2, r: 2.4 }, { x: 26.0, y: 16.6, r: 2.2 }, { x: 11.2, y: 37.6, r: 1.6 }];
const TREES = [], ROCKS = [], FLOWERS = [];
for (let k = 0; k < 900 && TREES.length < 78; k++) { const x = rr(0.3, WX - 0.3), y = rr(0.6, 36), r = rr(0.42, 0.72);
  if (inCamp(x, y) || inCity(x, y) || onRail(x, y) || y > shoreY(x) - 1.3 || nearB(x, y, 1.1 + r) || nearPath(x, y, 0.95 + r * 0.6) || TREES.some(t => Math.hypot(t.x - x, t.y - y) < t.r + r + 0.15)) continue;
  TREES.push({ x, y, r, pine: R() < 0.34, tone: R() }); }
for (let k = 0; k < 500 && ROCKS.length < 34; k++) { const x = rr(0.3, WX - 0.3), y = rr(0.6, 38.5), r = rr(0.14, 0.4);
  if (inCamp(x, y) || inCity(x, y) || onRail(x, y) || y > shoreY(x) + 0.5 || nearB(x, y, 0.8) || nearPath(x, y, 0.7) || TREES.some(t => Math.hypot(t.x - x, t.y - y) < t.r + 0.3)) continue;
  ROCKS.push({ x, y, r, seed: R() * 99 }); }
for (let k = 0; k < 400 && FLOWERS.length < 70; k++) { const x = rr(0.3, WX - 0.3), y = rr(0.6, 36); if (inCamp(x, y) || inCity(x, y) || onRail(x, y) || y > shoreY(x) - 1 || nearB(x, y, 0.5) || nearPath(x, y, 0.6)) continue; FLOWERS.push([x, y, Math.floor(R() * 3)]); }
const LAMPS = [N.A.p, N.B.p, N.C.p, N.D.p, N.E.p, N.F.p].map(p => [p[0] + 0.55, p[1] - 0.25]);
const LANTERNS = [[PIER.x0 - 0.05, 38.4], [PIER.x1 + 0.05, 39.9], [PIER.x0 - 0.05, 41.3]];
const BOARD = (() => { const p = loc(HQ, -HQ.w / 2 - 1.1, HQ.d / 2 + 0.6); return { x: p[0], y: p[1] }; })();
const HSIGN = { x: PIER.x0 - 1.6, y: shoreY(PIER.x0 - 1.6) - 0.6 };

// ---------- time (Denver) ----------
const qh = new URLSearchParams(location.search).get('townhour');
function denverHour() {
  if (qh !== null && !isNaN(+qh)) return +qh;
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  return (+p.find(x => x.type === 'hour').value % 24) + (+p.find(x => x.type === 'minute').value) / 60;
}
const atWork = h => h >= 7 && h < 21.5;
function darkness(h) { if (h >= 7 && h < 18) return 0; if (h >= 18 && h < 20.5) return (h - 18) / 2.5 * 0.55; if (h >= 20.5 || h < 5.5) return 0.55; return (7 - h) / 1.5 * 0.55; }
function warmth(h) { return (h >= 17 && h < 19.5) ? Math.sin((h - 17) / 2.5 * Math.PI) * 0.16 : (h >= 5.5 && h < 7.5) ? Math.sin((h - 5.5) / 2 * Math.PI) * 0.12 : 0; }
const clockLabel = h => { const H = Math.floor(h), M = Math.round((h - H) * 60); return new Date(2000, 0, 1, H, M).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' MT'; };
const DKF = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = d => DKF.format(new Date(d));
const today = () => dayKey(Date.now());
const nowLocal = () => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()), g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`; };
const dayDiff = (a, b) => Math.round((Date.UTC(...b.split('-').map((v, i) => i === 1 ? v - 1 : +v)) - Date.UTC(...a.split('-').map((v, i) => i === 1 ? v - 1 : +v))) / 864e5);
const when = d => new Date(d).toLocaleString([], { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' MT';
const hm = d => new Date(d).toLocaleTimeString([], { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) + ' MT';
function ago(d) { const s = (Date.now() - Date.parse(d)) / 1000; if (isNaN(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago'; }
const dayName = k => { const t = today(), dd = dayDiff(t, k); if (dd === 0) return 'Today'; if (dd === 1) return 'Tomorrow'; if (dd === -1) return 'Yesterday'; return new Date(k + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); };
const asDay = v => { if (!v) return ''; const s = String(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : isNaN(Date.parse(s)) ? '' : dayKey(s); };

// ---------- real data ----------
const reqs = () => (typeof S !== 'undefined' && S.requests) || [];
const matches = (r, name) => r.from === name || (r.sources || []).includes(name);
function stats(name) {
  const rs = reqs().filter(r => matches(r, name)), week = Date.now() - 7 * 864e5;
  return { rs, pending: rs.filter(r => r.status === 'pending').length, decided: rs.filter(r => r.status !== 'pending' && r.decidedAt && Date.parse(r.decidedAt) >= week).length, total: rs.length };
}
const otherPending = () => reqs().filter(r => r.status === 'pending' && !BOTS.some(bt => matches(r, bt.name))).length;
let MSGS = [], ACTS = [], BOARDS = [], chatLoading = null;
const unread = name => MSGS.filter(m => m.bot === name && m.sender === 'bot' && !m.read_at).length;
const board = (bot, key) => BOARDS.find(b => b.bot === bot && b.board_key === key) || null;
const bItems = b => !b ? [] : Array.isArray(b.payload) ? b.payload : Array.isArray(b.payload && b.payload.items) ? b.payload.items : [];
const actsToday = name => { const t = today(); return ACTS.filter(a => (!name || a.bot === name) && dayKey(a.created_at) === t); };
const SEND_RE = /\b(sent|send|sending|emailed|email|emails|mailed|texted|follow-?ups?|shipped|delivered)\b/i;
const sentToday = () => actsToday().filter(a => SEND_RE.test(a.body || '') && !/^Approved by Christian/.test(a.body || '')).length;
const current = name => { const a = ACTS.find(x => x.bot === name && (x.eta || x.done)); return a && !a.done && a.eta ? a : null; };
function lastActive(name) { let t = 0; const up = d => { const v = Date.parse(d); if (v > t) t = v; };
  ACTS.forEach(a => a.bot === name && up(a.created_at)); MSGS.forEach(m => m.bot === name && m.sender === 'bot' && up(m.created_at)); reqs().forEach(r => r.from === name && up(r.createdAt)); return t; }
const isIdle = i => ADMIN && !current(BOTS[i].name) && Date.now() - lastActive(BOTS[i].name) > 2 * 3600e3;
function eventsInfo() {
  const evs = (typeof S !== 'undefined' && S.events) || [], t = today(), now = nowLocal();
  const st = e => e.start || (e.date ? e.date + 'T' + (e.allDay ? '00:00' : '23:59') : '');
  const todays = evs.filter(e => e.date === t).sort((a, b) => st(a).localeCompare(st(b)));
  const next = evs.filter(e => e.date && (e.date > t || (e.date === t && (e.allDay || !e.start || e.start >= now)))).sort((a, b) => st(a).localeCompare(st(b)))[0] || null;
  return { todays, next };
}
const evWhen = e => `${dayName(e.date)}${e.allDay ? ' · all day' : e.time ? ' · ' + e.time : ''}`;
async function loadChat() {
  if (!ADMIN || typeof sb === 'undefined' || !sb) { MSGS = []; ACTS = []; BOARDS = []; return; }
  const [m, a, b] = await Promise.all([sb.from('bot_messages').select('*').order('created_at', { ascending: true }).limit(500),
    sb.from('bot_activity').select('*').order('created_at', { ascending: false }).limit(400), sb.from('bot_boards').select('*')]);
  if (!m.error) MSGS = m.data || []; if (!a.error) ACTS = a.data || []; if (!b.error) BOARDS = b.data || []; diffChat(); updateOverlay();
}
function queueChat() { if (chatLoading) return; chatLoading = setTimeout(async () => { await loadChat(); chatLoading = null; if (OPEN) renderSheet(false); }, 250); }

// ---------- characters + errands ----------
const chars = BOTS.map((bt, i) => ({ i, x: 0, y: 0, path: [], queue: [], errand: null, carry: null, running: false, tagT: 0, busyT: 0, where: null, walking: false, dist: 0, face: 1, nextStroll: 4 + i * 3 + Math.random() * 5, blink: Math.random() * 4, emote: 1.5 + i * 1.4 }));
const nodeOf = t => t === 'hq' ? 'hq' : t === 'dock' ? 'dock' : 'w' + t;
function routeTo(ch, dest) { ch.queue = []; ch.errand = null; ch.carry = null; ch.running = false; ch.path = dest === 'home' ? route('w' + ch.i, 'h' + ch.i) : route('h' + ch.i, 'w' + ch.i); ch.where = dest; ch.walking = true; }
function place(ch, dest) { const p = N[(dest === 'home' ? 'h' : 'w') + ch.i].p; ch.x = p[0]; ch.y = p[1]; ch.where = dest; ch.path = []; ch.walking = false; }
function stroll(ch) { const es = N['w' + ch.i].e, e = es[Math.floor(Math.random() * es.length)], pts = e.a === 'w' + ch.i ? e.pts : e.pts.slice().reverse(), k = Math.max(2, Math.floor(pts.length * (0.3 + Math.random() * 0.4))), go = pts.slice(0, k);
  ch.path = go.concat(go.slice(0, -1).reverse()).map(p => p.slice()); ch.walking = true; }
let started = false, lastWork = null;
function syncClock() { const h = denverHour(), w = atWork(h); if (!started) { chars.forEach(c => place(c, w ? 'work' : 'home')); started = true; } else if (w !== lastWork) chars.forEach(c => routeTo(c, w ? 'work' : 'home')); lastWork = w; return h; }
const ship = { x: SHIP_HOME, state: 'docked', t: 0, cargo: 0, wait: 0 };
const pierCrates = [], pops = [];
const ITEM_NAME = { scroll: 'scroll', crate: 'crate', letter: 'letter', pickup: 'message' };
function targetName(t) { return t === 'hq' ? (ADMIN ? 'Christian\u2019s HQ' : 'HQ') : t === 'dock' ? 'the harbor' : 'the ' + BOTS[t].place; }
function queueErrand(i, target, item, label, real) {
  const ch = chars[i]; if (target === i || !lastWork) return;
  if (ch.queue.length >= 3) ch.queue.shift(); ch.queue.push({ target, item, label, real });
}
function startErrand(ch) {
  const e = ch.queue.shift(), leg = route('w' + ch.i, nodeOf(e.target)), back = leg.slice(0, -1).reverse();
  ch.errand = e; ch.carry = e.item === 'pickup' ? null : e.item; ch.tagT = e.real ? 3.2 : 0;
  ch.path = [...leg, { act: e.item === 'pickup' ? 'take' : 'drop', target: e.target }, { act: 'wait', t: e.target === 'dock' ? 0.9 : 0.6 }, ...back, { act: 'end' }];
  ch.walking = true; ch.running = true;
}
const AMBIENT = [[['dock', 'letter'], ['hq', 'scroll']], [[2, 'scroll'], ['hq', 'scroll']], [[0, 'scroll'], ['dock', 'crate'], ['hq', 'scroll']], [['hq', 'scroll'], [0, 'scroll']], [['hq', 'crate'], [2, 'crate']]];
function ambient(ch) { if (Math.random() < 0.25) { stroll(ch); return; } const opts = AMBIENT[ch.i], [t, item] = opts[Math.floor(Math.random() * opts.length)]; queueErrand(ch.i, t, item, '', false); }
function handoff(ch, target) { const item = ch.carry; ch.carry = null; pops.push({ x: ch.x, y: ch.y, t: 0, item });
  if (target === 'dock') { if (ship.state === 'docked') { ship.cargo++; ship.wait = 1.3; } else pierCrates.push(item || 'crate'); } }
function updateShip(dt) {
  if (ship.state === 'docked') { if (ship.cargo > 0 && (ship.wait -= dt) <= 0) { ship.state = 'leaving'; ship.t = 0; } }
  else if (ship.state === 'leaving') { ship.t += dt; const k = Math.min(1, ship.t / 9); ship.x = SHIP_HOME - k * k * (SHIP_HOME + 7); if (k >= 1) { ship.state = 'away'; ship.t = 0; ship.cargo = 0; } }
  else if (ship.state === 'away') { if ((ship.t += dt) > 9) { ship.state = 'returning'; ship.t = 0; } }
  else if (ship.state === 'returning') { ship.t += dt; const k = Math.min(1, ship.t / 9), e = 1 - (1 - k) * (1 - k); ship.x = -7 + e * (SHIP_HOME + 7); if (k >= 1) { ship.state = 'docked'; ship.x = SHIP_HOME; if (pierCrates.length) { ship.cargo = pierCrates.length; pierCrates.length = 0; ship.wait = 1.6; } } }
  for (let k = pops.length - 1; k >= 0; k--) if ((pops[k].t += dt) > 1.3) pops.splice(k, 1);
}
// real-data triggers (only changes seen after the first load; history never replays)
let seenReq = null, seenAct = null, seenMsg = null;
const botIndex = name => BOTS.findIndex(b => b.name === name);
function diffRequests() {
  if (typeof S === 'undefined' || !S.me || !S.me.access) return;
  const rs = reqs(), cur = new Map(rs.map(r => [r.id, r.status]));
  if (seenReq) rs.forEach(r => { const i = botIndex(r.from); if (i < 0) return; const prev = seenReq.get(r.id);
    if (prev === undefined && r.status === 'pending') queueErrand(i, i === 2 ? 0 : 'hq', 'scroll', 'New request', true);
    else if (prev === undefined && r.status === 'approved' && r.board) queueErrand(i, 'dock', 'letter', 'Follow-up', true);
    else if (prev === 'pending' && r.status === 'approved') { const t = i === 1 ? 2 : (i === 2 || i === 0) ? 'dock' : 'hq'; queueErrand(i, t, i === 2 ? 'crate' : i === 0 ? 'letter' : 'scroll', i === 1 ? 'Lead to Bids' : t === 'dock' ? 'Sending' : 'Approved', true); }
    else if (prev === 'pending' && r.status === 'done') queueErrand(i, 'hq', 'scroll', 'Done', true); });
  seenReq = cur;
}
function diffChat() {
  if (seenMsg) MSGS.forEach(m => { if (seenMsg.has(m.id)) return; const i = botIndex(m.bot); if (i < 0) return;
    if (m.sender === 'bot') queueErrand(i, 'hq', 'letter', 'Chat reply', true); else queueErrand(i, 'hq', 'pickup', 'New message', true); });
  if (seenAct) ACTS.forEach(a => { if (seenAct.has(a.id)) return; const i = botIndex(a.bot); if (i < 0) return; const tx = a.body || '';
    if (/^(Marked approved|Marked declined|Cleared \(done\)|Approved by Christian):?/.test(tx)) return; // the request change already runs it
    if (a.eta && !a.done) { chars[i].busyT = 6; return; }
    let t = 'hq', item = 'scroll', label = 'Update';
    if (SEND_RE.test(tx)) { t = 'dock'; item = /\b(crate|package|deliver|shipped)/i.test(tx) ? 'crate' : 'letter'; label = 'Sending'; }
    else if (/\b(onedrive|filed|filing|saved|archiv)/i.test(tx)) { t = i === 2 ? 'hq' : 2; item = 'crate'; label = 'Filing'; }
    else if (/\b(quote|bid|proposal|estimate)/i.test(tx)) { t = i === 2 ? 0 : 2; label = 'Bid'; }
    else if (/\b(calendar|schedul|booked|appointment)/i.test(tx)) { t = i === 0 ? 'hq' : 0; label = 'Schedule'; }
    else if (/\blead/i.test(tx)) { t = i === 1 ? 2 : 1; label = 'Lead'; }
    queueErrand(i, t, item, label, true); });
  seenMsg = new Set(MSGS.map(m => m.id)); seenAct = new Set(ACTS.map(a => a.id));
}

// ---------- 2.5D projection + tiny solid renderer ----------
let K = 36, OY = 100, WPX = 1000, HPX = 1100, dpr = 1, gdpr = 1, T = 36;
const S3 = (x, y, z = 0) => [x * K, OY + (y * TILT - z * ZK) * K];
const VV = (() => { const l = Math.hypot(ZK, TILT); return [0, ZK / l, TILT / l]; })(), LL = (() => { const v = [-0.55, -0.3, 1], l = Math.hypot(...v); return v.map(a => a / l); })();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function shade(hex, f) { const n = parseInt(hex.slice(1), 16), ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f))); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; }
function mkSolid(b, faces) { // faces: { l: [[lx,ly,z],...], col, deco, wall:[lx0,ly0,lx1,ly1,z0,z1] }
  const W = p => { const q = loc(b, p[0], p[1]); return [q[0], q[1], p[2]]; };
  const fs = faces.map(f => ({ ...f, pts: f.l.map(W), wall: f.wall ? { p0: W([f.wall[0], f.wall[1], 0]), p1: W([f.wall[2], f.wall[3], 0]), z0: f.wall[4], z1: f.wall[5] } : null }));
  const all = fs.flatMap(f => f.pts), cen = all.reduce((a, p) => [a[0] + p[0] / all.length, a[1] + p[1] / all.length, a[2] + p[2] / all.length], [0, 0, 0]);
  fs.forEach(f => { const p = f.pts; let n = [0, 0, 0]; for (let k = 1; k + 1 < p.length; k++) { const c = cross(sub(p[k], p[0]), sub(p[k + 1], p[0])); n = [n[0] + c[0], n[1] + c[1], n[2] + c[2]]; }
    const l = Math.hypot(...n) || 1; n = n.map(a => a / l); const fc = p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length, a[2] + q[2] / p.length], [0, 0, 0]); if (dot(n, sub(fc, cen)) < 0) n = n.map(a => -a); f.n = n; });
  return { faces: fs, cen, all };
}
function boxS(b, lx, ly, w, d, z0, z1, col, deco) { // deco: {front, side, top} wall painters
  const x0 = lx - w / 2, x1 = lx + w / 2, y0 = ly - d / 2, y1 = ly + d / 2;
  return mkSolid(b, [
    { l: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], col, deco: deco && deco.front, wall: [x0, y1, x1, y1, z0, z1] },
    { l: [[x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]], col, deco: deco && deco.side, wall: [x1, y1, x1, y0, z0, z1] },
    { l: [[x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1]], col, deco: deco && deco.back, wall: [x1, y0, x0, y0, z0, z1] },
    { l: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], col, deco: deco && deco.side, wall: [x0, y0, x0, y1, z0, z1] },
    { l: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], col: deco && deco.topCol || col },
    { l: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], col }]);
}
function gableS(b, lx, ly, w, d, z, rh, col, endCol, o = 0.18) { const X0 = lx - w / 2 - o, X1 = lx + w / 2 + o, Y0 = ly - d / 2 - o, Y1 = ly + d / 2 + o, t = z + rh;
  return mkSolid(b, [{ l: [[X0, Y1, z], [X1, Y1, z], [X1, ly, t], [X0, ly, t]], col, roof: 1 }, { l: [[X1, Y0, z], [X0, Y0, z], [X0, ly, t], [X1, ly, t]], col, roof: 1 },
    { l: [[X0, Y0, z], [X0, Y1, z], [X0, ly, t]], col: endCol }, { l: [[X1, Y1, z], [X1, Y0, z], [X1, ly, t]], col: endCol }, { l: [[X0, Y0, z], [X1, Y0, z], [X1, Y1, z], [X0, Y1, z]], col }]); }
function hipS(b, lx, ly, w, d, z, rh, col, o = 0.2) { const W = w / 2 + o, D = d / 2 + o, r = Math.max(0, W - D), t = z + rh;
  return mkSolid(b, [{ l: [[lx - W, ly + D, z], [lx + W, ly + D, z], [lx + r, ly, t], [lx - r, ly, t]], col, roof: 1 }, { l: [[lx + W, ly - D, z], [lx - W, ly - D, z], [lx - r, ly, t], [lx + r, ly, t]], col, roof: 1 },
    { l: [[lx - W, ly - D, z], [lx - W, ly + D, z], [lx - r, ly, t]], col, roof: 1 }, { l: [[lx + W, ly + D, z], [lx + W, ly - D, z], [lx + r, ly, t]], col, roof: 1 }, { l: [[lx - W, ly - D, z], [lx + W, ly - D, z], [lx + W, ly + D, z], [lx - W, ly + D, z]], col }]); }
function drawSolid(c, s) {
  s.faces.forEach(f => { if (dot(f.n, VV) <= 0.02) return; const lt = 0.8 + 0.22 * Math.max(0, dot(f.n, LL)) - (f.n[2] < 0.3 ? 0.04 : 0);
    c.beginPath(); f.pts.forEach((p, k) => { const q = S3(p[0], p[1], p[2]); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath();
    c.fillStyle = shade(f.col, lt); c.fill(); c.strokeStyle = 'rgba(20,20,20,.85)'; c.lineWidth = Math.max(1, K / 34); c.lineJoin = 'round'; c.stroke();
    if (f.deco && f.wall) { const { p0, p1, z0, z1 } = f.wall, len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), a = S3(p0[0], p0[1], z1), bq = S3(p1[0], p1[1], z1);
      c.save(); c.transform((bq[0] - a[0]) / len, (bq[1] - a[1]) / len, 0, ZK * K, a[0], a[1]); c.lineWidth = 1 / K; f.deco(c, len, z1 - z0, lt); c.restore(); } });
}
// wall painters work in wall units: u = 0..len left to right, s = 0..h top to bottom
const R2 = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
function winW(c, x, y, w, h, lit) { R2(c, x - 0.05, y - 0.05, w + 0.1, h + 0.1, C.ink); R2(c, x, y, w, h, lit ? C.lit : '#b9c6cb'); if (!lit) R2(c, x + 0.06, y + 0.06, w * 0.3, h * 0.3, 'rgba(255,255,255,.5)'); R2(c, x + w / 2 - 0.03, y, 0.06, h, C.ink); }
function doorW(c, len, h, w, dh, col = C.door) { const x = len / 2 - w / 2; R2(c, x - 0.05, h - dh - 0.05, w + 0.1, dh + 0.05, C.ink); R2(c, x, h - dh, w, dh, col); R2(c, x + w - 0.16, h - dh / 2, 0.07, 0.07, C.lit); }
let LIT = false, HOMELIT = false;
let archImg = null; try { archImg = new Image(); archImg.onload = () => { spritesDirty = true; }; archImg.src = 'arch-mark.png'; } catch (e) {}
function buildingSolids(bt, b) {
  const w = b.w, d = b.d, lit = b.type === 'home' ? HOMELIT : LIT, out = [], ex = {};
  if (b.type === 'hall') {
    out.push(boxS(b, 0, d / 2 + 0.3, w * 0.5, 0.6, 0, 0.18, C.stone));
    out.push(boxS(b, 0, 0, w, d, 0, 2.3, C.paper, { front: (c, L, H) => { for (let k = 0; k < 4; k++) { const x = 0.45 + k * (L - 1.2) / 3; R2(c, x, 0.15, 0.3, H - 0.15, '#e6dece'); R2(c, x, 0.15, 0.08, H - 0.15, '#fff'); } winW(c, 1.2, 0.6, 0.6, 0.85, lit); winW(c, L - 1.8, 0.6, 0.6, 0.85, lit); doorW(c, L, H, 0.9, 1.3); },
      side: (c, L, H) => { winW(c, L / 2 - 0.3, 0.6, 0.6, 0.8, lit); } }));
    out.push(gableS(b, 0, 0, w, d, 2.3, 1.4, '#2b2b2b', C.paper));
    out.push(boxS(b, 0, -0.1, 1.25, 1.25, 2.3, 4.3, C.paper, { front: (c, L, H) => { c.fillStyle = C.ink; c.beginPath(); c.arc(L / 2, 0.75, 0.42, 0, 7); c.fill(); c.fillStyle = C.cream; c.beginPath(); c.arc(L / 2, 0.75, 0.34, 0, 7); c.fill(); R2(c, L / 2 - 0.03, 0.5, 0.06, 0.27, C.ink); R2(c, L / 2, 0.72, 0.2, 0.06, C.ink); } }));
    out.push(hipS(b, 0, -0.1, 1.25, 1.25, 4.3, 0.9, '#2b2b2b', 0.15));
    const tp = loc(b, 0, -0.1); ex.flag = [tp[0], tp[1], 5.2]; ex.pole = [tp[0], tp[1], 5.2, 6.2]; ex.top = 6.4;
  } else if (b.type === 'tower') {
    out.push(boxS(b, 0, 0, 1.9, 1.9, 0, 3.9, C.wall, { front: (c, L, H) => { for (let k = 0.6; k < H; k += 0.6) R2(c, 0, k, L, 0.05, '#d3c9b4'); R2(c, L / 2 - 0.08, 0.9, 0.16, 0.6, C.ink); doorW(c, L, H, 0.75, 1.15); }, side: (c, L, H) => { for (let k = 0.6; k < H; k += 0.6) R2(c, 0, k, L, 0.05, '#d3c9b4'); R2(c, L / 2 - 0.08, 1.2, 0.16, 0.6, C.ink); } }));
    out.push(boxS(b, 0, 0, 2.9, 2.9, 3.8, 3.95, '#3a332a'));
    out.push(boxS(b, 0, 0, 2.5, 2.5, 3.95, 5.0, C.paper, { front: (c, L, H) => { winW(c, 0.35, 0.25, 0.75, 0.55, lit); winW(c, L - 1.1, 0.25, 0.75, 0.55, lit); }, side: (c, L, H) => { winW(c, L / 2 - 0.37, 0.25, 0.75, 0.55, lit); } }));
    out.push(hipS(b, 0, 0, 2.5, 2.5, 5.0, 1.4, bt.color, 0.25));
    const tp = loc(b, 0, 0); ex.beacon = [tp[0], tp[1], 6.55]; ex.top = 6.9;
  } else if (b.type === 'shop') {
    const wall = b.black ? '#1a1a1a' : C.wall, roof = b.black ? '#0e0e0e' : (bt ? bt.color : C.ink);
    out.push(boxS(b, 0, 0, w, d, 0, 2.3, wall, { front: (c, L, H) => { R2(c, 0.3, 0.45, 1.6, 1.0, C.ink); R2(c, 0.35, 0.5, 1.5, 0.9, b.black ? '#2a2a2a' : (lit ? C.lit : '#c9d6df')); c.strokeStyle = C.slate; c.lineWidth = 0.05; c.beginPath(); c.moveTo(0.5, 1.25); c.lineTo(1.7, 0.65); c.stroke();
      doorW(c, L * 1.25, H, 0.75, 1.45); if (!b.black) { R2(c, L - 1.0, 0.25, 0.75, 0.42, C.paper); R2(c, L - 0.92, 0.42, 0.55, 0.05, C.tan); } for (let k = 0; k < 2; k++) { R2(c, 0.3 + k * 0.8, H - 0.75, 0.7, 0.75, b.black ? '#2c2c2c' : '#a9a79f'); R2(c, 0.55 + k * 0.8, H - 0.5, 0.2, 0.05, C.ink); } },
      side: (c, L, H) => winW(c, L / 2 - 0.35, 0.55, 0.7, 0.75, lit) }));
    out.push(gableS(b, 0, 0, w, d, 2.3, 1.3, roof, wall));
    out.push(boxS(b, w * 0.28, -0.35, 0.4, 0.4, 2.4, 3.8, b.black ? '#2a2a2a' : '#8a6d45'));
    const tp = loc(b, 0, 0); ex.top = 3.9;
  } else if (b.type === 'kiosk') {
    out.push(boxS(b, -w / 2 + 0.2, 0, 0.2, 0.2, 0, 2.4, '#6b5a43')); out.push(boxS(b, w / 2 - 0.2, 0, 0.2, 0.2, 0, 2.4, '#6b5a43'));
    out.push(boxS(b, 0, 0, w - 0.2, 0.25, 0.6, 2.2, '#c9a777', { front: (c, L, H) => { const notes = [C.paper, '#f2e6b8', '#dfe8d9', '#f0d9d3', C.paper, '#f2e6b8', '#dfe8d9', C.paper]; notes.forEach((n, k) => { const x = 0.2 + (k % 4) * (L - 0.4) / 4, y = 0.15 + Math.floor(k / 4) * 0.72; R2(c, x, y, 0.58, 0.55, n); R2(c, x + 0.08, y + 0.18, 0.4, 0.04, '#9b9585'); R2(c, x + 0.08, y + 0.3, 0.3, 0.04, '#9b9585'); R2(c, x + 0.24, y - 0.04, 0.1, 0.1, C.red); }); } }));
    out.push(gableS(b, 0, 0, w + 0.1, 0.8, 2.2, 0.55, bt.color, bt.color, 0.08));
    out.push(boxS(b, 0.4, 1.15, 1.4, 0.4, 0.3, 0.42, '#8a6d45')); out.push(boxS(b, -0.15, 1.15, 0.1, 0.35, 0, 0.3, C.ink)); out.push(boxS(b, 0.95, 1.15, 0.1, 0.35, 0, 0.3, C.ink));
    ex.top = 3.0;
  } else if (b.type === 'garage') {
    out.push(boxS(b, 0, 0, w, d, 0, 2.1, C.wall, { front: (c, L, H) => { R2(c, 0.35, 0.55, 1.7, H - 0.55, C.ink); R2(c, 0.4, 0.6, 1.6, H - 0.6, '#9aa3a6'); for (let k = 0; k < 5; k++) R2(c, 0.4, 0.75 + k * 0.28, 1.6, 0.05, '#7c8487'); R2(c, 2.4, 0.45, 0.9, 0.6, C.ink); R2(c, 2.45, 0.5, 0.8, 0.5, lit ? '#9fd3c7' : '#2d3b3f'); R2(c, 2.55, 0.62, 0.4, 0.05, '#9fd3c7'); R2(c, 2.55, 0.76, 0.55, 0.05, '#9fd3c7'); doorW(c, L * 1.68, H, 0.6, 1.2); },
      side: (c, L, H) => winW(c, L / 2 - 0.3, 0.5, 0.6, 0.6, lit), topCol: '#8f9aa0' }));
    out.push(boxS(b, 0, 0, w + 0.2, d + 0.2, 2.1, 2.28, '#5f7a8a')); out.push(boxS(b, -w * 0.25, -0.3, 0.7, 0.6, 2.28, 2.65, '#a9a79f'));
    out.push(boxS(b, w / 2 + 0.35, -d / 2 + 0.35, 0.22, 0.22, 0, 4.6, '#c79a3b')); out.push(boxS(b, w / 2 + 0.35 - 1.5, -d / 2 + 0.35, 3.3, 0.16, 4.4, 4.58, '#c79a3b'));
    [[w / 2 - 0.2, d / 2 + 0.7], [w / 2 + 0.25, d / 2 + 0.35]].forEach(([x, y]) => out.push(hipS(b, x, y, 0.32, 0.32, 0, 0.5, C.red, 0.02)));
    const hk = loc(b, w / 2 + 0.35 - 2.95, -d / 2 + 0.35); ex.hook = [hk[0], hk[1], 4.4]; ex.top = 4.9;
  } else if (b.type === 'hq') {
    out.push(boxS(b, 0, d / 2 + 0.3, w * 0.42, 0.6, 0, 0.2, C.stone));
    out.push(boxS(b, 0, 0, w, d, 0, 2.7, C.cream, { front: (c, L, H) => { R2(c, 0, 0, L, 0.14, C.tan); if (archImg && archImg.complete && archImg.naturalWidth) { const ih = 1.25, iw = ih * archImg.naturalWidth / archImg.naturalHeight; c.drawImage(archImg, L / 2 - iw / 2, 0.25, iw, ih); }
      winW(c, 0.45, 0.5, 0.65, 0.75, lit); winW(c, L - 1.1, 0.5, 0.65, 0.75, lit); c.fillStyle = C.ink; c.beginPath(); c.moveTo(L / 2 - 0.55, H); c.lineTo(L / 2 - 0.55, H - 0.75); c.arc(L / 2, H - 0.75, 0.55, Math.PI, 0); c.lineTo(L / 2 + 0.55, H); c.fill(); c.fillStyle = C.door; c.beginPath(); c.moveTo(L / 2 - 0.48, H); c.lineTo(L / 2 - 0.48, H - 0.75); c.arc(L / 2, H - 0.75, 0.48, Math.PI, 0); c.lineTo(L / 2 + 0.48, H); c.fill(); },
      side: (c, L, H) => { winW(c, 0.5, 0.6, 0.6, 0.75, lit); winW(c, L - 1.1, 0.6, 0.6, 0.75, lit); } }));
    out.push(hipS(b, 0, 0, w, d, 2.7, 1.5, '#2b2b2b', 0.25));
    [-1, 1].forEach(sg => out.push(boxS(b, sg * (w / 2 - 0.55), d / 2 + 0.45, 0.6, 0.5, 0, 0.4, '#8a6d45')));
    const tp = loc(b, 0, 0); ex.flag = [tp[0], tp[1], 4.2]; ex.pole = [tp[0], tp[1], 4.2, 5.4]; ex.top = 5.6;
    ex.bushes = [-1, 1].map(sg => { const p = loc(b, sg * (w / 2 - 0.55), d / 2 + 0.45); return [p[0], p[1], 0.6]; });
  } else if (b.type === 'home') {
    out.push(boxS(b, 0, 0, w, d, 0, 1.5, C.paper, { front: (c, L, H) => { doorW(c, L, H, 0.6, 0.95); winW(c, 0.3, 0.35, 0.45, 0.42, lit); winW(c, L - 0.75, 0.35, 0.45, 0.42, lit); }, side: (c, L, H) => winW(c, L / 2 - 0.22, 0.35, 0.45, 0.42, lit) }));
    out.push(gableS(b, 0, 0, w, d, 1.5, 1.0, b.col, C.paper, 0.15));
    out.push(boxS(b, w * 0.25, -0.2, 0.32, 0.32, 1.7, 2.7, '#8a6d45'));
    const cp = loc(b, w * 0.25, -0.2); ex.chimney = [cp[0], cp[1], 2.8]; ex.top = 2.7;
  }
  return { solids: out, ex };
}

// ---------- layers: ground (static, whole world) + sprites (depth-sorted every frame) ----------
let ground = null, SPRITES = [], spritesDirty = true, miniImg = null;
function hull(pts) { pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  pts.forEach(p => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
  pts.slice().reverse().forEach(p => { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }); return lo.slice(0, -1).concat(up.slice(0, -1)); }
const SH = [0.5, 0.2];
function castShadow(c, solids) { solids.forEach(s => { const h = hull(s.all.map(p => [p[0] + p[2] * SH[0], p[1] + p[2] * SH[1]]));
  c.beginPath(); h.forEach((p, k) => { const q = S3(p[0], p[1], 0); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath(); c.fill(); }); }
function mkSprite(key, tap, solidsOrFn, bbox, after) {
  // bbox in world-screen px [x0,y0,x1,y1]
  const [x0, y0, x1, y1] = bbox, w = Math.ceil(x1 - x0), h = Math.ceil(y1 - y0), cv2 = document.createElement('canvas'); const sd = Math.min(3, dpr * 1.5); cv2.width = Math.max(1, Math.ceil(w * sd)); cv2.height = Math.max(1, Math.ceil(h * sd));
  const c = cv2.getContext('2d'); c.setTransform(sd, 0, 0, sd, -x0 * sd, -y0 * sd); solidsOrFn(c);
  return { key, tap, img: cv2, x: x0, y: y0, w, h, after };
}
function solidsBBox(solids, extraZ = 0, pad = 0.6) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; solids.forEach(s => s.all.forEach(p => { const q = S3(p[0], p[1], p[2]), q2 = S3(p[0], p[1], p[2] + extraZ); a = Math.min(a, q[0], q2[0]); c = Math.max(c, q[0]); b = Math.min(b, q[1], q2[1]); d = Math.max(d, q[1]); })); return [a - pad * K, b - pad * K, c + pad * K, d + pad * K * 0.4]; }
function treeDraw(c, t) { const [X, Y] = S3(t.x, t.y, 0), r = t.r * K, g = t.tone;
  R2(c, X - r * 0.12, Y - r * 1.25, r * 0.24, r * 1.25, '#6b5a43');
  if (t.pine) { const cols = [C.tree2, g < 0.5 ? C.tree : '#5f8466', C.tree3]; for (let k = 0; k < 3; k++) { const yb = Y - r * (0.9 + k * 0.75), ww = r * (1.15 - k * 0.28); c.beginPath(); c.moveTo(X - ww, yb); c.lineTo(X, yb - r * 1.25); c.lineTo(X + ww, yb); c.closePath(); c.fillStyle = cols[k]; c.fill(); c.strokeStyle = 'rgba(20,20,20,.55)'; c.lineWidth = 1; c.stroke(); } }
  else { const cy = Y - r * 1.75; [[0, 0, 1, C.tree2], [-0.12, -0.12, 0.8, g < 0.5 ? C.tree : '#7d9b7f'], [-0.3, -0.35, 0.32, C.tree3]].forEach(([dx, dy, s, col]) => { c.fillStyle = col; c.beginPath(); c.arc(X + dx * r, cy + dy * r, r * s, 0, 7); c.fill(); }); c.strokeStyle = 'rgba(20,20,20,.45)'; c.lineWidth = 1; c.beginPath(); c.arc(X, cy, r, 0, 7); c.stroke(); } }
function lampDraw(c, x, y, h, lantern) { const [X, Y] = S3(x, y, 0), [, Yt] = S3(x, y, h); R2(c, X - 1.2, Yt, 2.4, Y - Yt, C.ink); const s = K * (lantern ? 0.2 : 0.17); R2(c, X - s - 1, Yt - s * 2 - 1, s * 2 + 2, s * 2 + 2, C.ink); R2(c, X - s, Yt - s * 2, s * 2, s * 2, LIT ? C.lit : '#8a8172'); }
function buildSprites() {
  SPRITES = [];
  const add = (bt, b, tap) => { const { solids, ex } = buildingSolids(bt, b); b.ex = ex; b.solids = solids; const bb = solidsBBox(solids, ex.pole ? 1.4 : 0);
    SPRITES.push(mkSprite(b.cy, tap, c => { solids.slice().sort((p, q) => dot(p.cen, VV) - dot(q.cen, VV)).forEach(s => drawSolid(c, s));
      if (ex.pole) { const a = S3(ex.pole[0], ex.pole[1], ex.pole[2]), z = S3(ex.pole[0], ex.pole[1], ex.pole[3]); R2(c, a[0] - 1, z[1], 2, a[1] - z[1], C.ink); }
      if (ex.bushes) ex.bushes.forEach(p => { const q = S3(p[0], p[1], p[2]); c.fillStyle = C.tree2; c.beginPath(); c.arc(q[0], q[1], K * 0.3, 0, 7); c.fill(); c.fillStyle = C.tree; c.beginPath(); c.arc(q[0] - K * 0.06, q[1] - K * 0.06, K * 0.22, 0, 7); c.fill(); }); }, bb));
    b.screen = bb; };
  BOTS.forEach((bt, i) => { add(bt, bt.b, i); add(bt, bt.home, i); }); add(null, HQ, 'hq'); add({ color: '#141414', name: 'AI' }, AI, 'ai');
  TREES.forEach(t => { const [X, Y] = S3(t.x, t.y, 0), r = t.r * K; SPRITES.push(mkSprite(t.y, null, c => treeDraw(c, t), [X - r * 1.3, Y - r * 3.4, X + r * 1.3, Y + 2])); });
  LAMPS.forEach(([x, y]) => { const [X, Y] = S3(x, y, 0), [, Yt] = S3(x, y, 1.6); SPRITES.push(mkSprite(y, null, c => lampDraw(c, x, y, 1.6), [X - K * 0.3, Yt - K * 0.5, X + K * 0.3, Y + 2])); });
  LANTERNS.forEach(([x, y]) => { const [X, Y] = S3(x, y, 0.3), [, Yt] = S3(x, y, 1.6); SPRITES.push(mkSprite(y, 'dock', c => lampDraw(c, x, y - 0.3 * ZK / TILT, 1.6, true), [X - K * 0.4, Yt - K * 0.6, X + K * 0.4, Y + 4])); });
  // HQ calendar board + harbor sign: posts and a blank board; live text is painted on top each frame
  const signSprite = (o, w, h, tap, after) => { const [X, Y] = S3(o.x, o.y, 0), top = Y - (h + 0.6) * K * ZK;
    return mkSprite(o.y, tap, c => { R2(c, X - w * K / 2 + K * 0.15, top + h * K * ZK * 0.5, 3, Y - top - h * K * ZK * 0.5, '#5b432c'); R2(c, X + w * K / 2 - K * 0.15 - 3, top + h * K * ZK * 0.5, 3, Y - top - h * K * ZK * 0.5, '#5b432c');
      c.fillStyle = 'rgba(20,20,20,.9)'; c.fillRect(X - w * K / 2 - 2, top - 2, w * K + 4, h * K * ZK + 4); c.fillStyle = '#7a5634'; c.fillRect(X - w * K / 2, top, w * K, h * K * ZK); c.fillStyle = '#efe6cf'; c.fillRect(X - w * K / 2 + 3, top + 3, w * K - 6, h * K * ZK - 6); },
      [X - w * K / 2 - 4, top - 4, X + w * K / 2 + 4, Y + 2], after); };
  SPRITES.push(signSprite(BOARD, 3.0, 2.2, 'hq', drawHQBoard)); SPRITES.push(signSprite(HSIGN, 2.4, 1.2, 'dock', drawHarborSign));
  SPRITES.forEach(s => { if (s.after) s.face = (() => { const o = s.key === BOARD.y ? BOARD : HSIGN, [X, Y] = S3(o.x, o.y, 0), w = (o === BOARD ? 3.0 : 2.4), h = (o === BOARD ? 2.2 : 1.2); return { x: X - w * K / 2 + 3, y: Y - (h + 0.6) * K * ZK + 3, w: w * K - 6, h: h * K * ZK - 6 }; })(); });
  spritesDirty = false;
}
function buildGround() {
  gdpr = Math.min(dpr, Math.sqrt(6.5e6 / (WPX * HPX)));
  ground = document.createElement('canvas'); ground.width = Math.ceil(WPX * gdpr); ground.height = Math.ceil(HPX * gdpr);
  const c = ground.getContext('2d'); c.setTransform(gdpr, 0, 0, gdpr, 0, 0); const r = mulberry32(7);
  c.fillStyle = C.g2; c.fillRect(0, 0, WPX, HPX);
  for (let k = 0; k < 700; k++) { const [X, Y] = S3(r() * WX, r() * WY, 0); c.fillStyle = r() < 0.5 ? C.g1 : C.g3; c.beginPath(); c.ellipse(X, Y, K * (0.4 + r() * 1.2), K * TILT * (0.4 + r() * 1.0), 0, 0, 7); c.fill(); }
  for (let k = 0; k < 900; k++) { const [X, Y] = S3(r() * WX, r() * WY, 0); c.fillStyle = 'rgba(86,115,91,.33)'; c.fillRect(X, Y, Math.max(1, K / 14), Math.max(2, K / 8)); }
  HILLS.forEach(h => { const [X, Y] = S3(h.x, h.y, 0), rx = h.r * K, ry = h.r * K * TILT;
    c.fillStyle = 'rgba(70,90,60,.16)'; c.beginPath(); c.ellipse(X + rx * 0.12, Y + ry * 0.12, rx, ry, 0, 0, 7); c.fill();
    const g = c.createRadialGradient(X - rx * 0.35, Y - ry * 0.6, rx * 0.1, X, Y - ry * 0.25, rx); g.addColorStop(0, '#e6eadb'); g.addColorStop(0.6, '#cdd6bb'); g.addColorStop(1, '#b9c4a6');
    c.fillStyle = g; c.beginPath(); c.ellipse(X, Y - ry * 0.25, rx * 0.97, ry * 0.95, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(90,110,80,.22)'; c.lineWidth = 1; [0.7, 0.42].forEach(f => { c.beginPath(); c.ellipse(X - rx * (1 - f) * 0.15, Y - ry * 0.25 - ry * (1 - f) * 0.45, rx * f, ry * f, 0, 0, 7); c.stroke(); }); });
  // shore + water
  const sand = [], wl = []; for (let x = -0.5; x <= WX + 0.5; x += 0.25) { sand.push(S3(x, shoreY(x) - 0.75, 0)); wl.push(S3(x, shoreY(x) + 0.2, 0)); }
  c.fillStyle = '#e7dbbd'; c.beginPath(); sand.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.lineTo(WPX, HPX); c.lineTo(0, HPX); c.closePath(); c.fill();
  const wg = c.createLinearGradient(0, S3(0, 37, 0)[1], 0, HPX); wg.addColorStop(0, '#a3c6cf'); wg.addColorStop(1, '#5f8ea3');
  c.fillStyle = wg; c.beginPath(); wl.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.lineTo(WPX, HPX); c.lineTo(0, HPX); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = Math.max(1.5, K / 18); c.beginPath(); wl.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
  for (let k = 0; k < 60; k++) { const x = r() * WX, [X, Y] = S3(x, shoreY(x) - 0.6 + r() * 0.6, 0); c.fillStyle = 'rgba(150,130,95,.4)'; c.fillRect(X, Y, 2, 2); }
  [[3.2, 0], [5.0, 0], [9.6, 0], [24.5, 0], [26.2, 0]].forEach(([x]) => { const [X, Y] = S3(x, shoreY(x) - 0.1, 0); c.strokeStyle = C.tree2; c.lineWidth = Math.max(1, K / 18); c.beginPath(); for (let k = -1; k <= 1; k++) { c.moveTo(X + k * K * 0.1, Y); c.lineTo(X + k * K * 0.2, Y - K * 0.6); } c.stroke(); });
  // shadows (buildings, trees, rocks)
  c.fillStyle = 'rgba(40,34,24,.12)'; ALLB.forEach(b => b.solids && castShadow(c, b.solids));
  TREES.forEach(t => { const [X, Y] = S3(t.x + t.r * 0.9, t.y + 0.2, 0); c.beginPath(); c.ellipse(X, Y, t.r * K * 1.3, t.r * K * TILT * 0.9, 0, 0, 7); c.fill(); });
  // paths
  const stroke = (pts, wdt, col) => { c.strokeStyle = col; c.lineWidth = wdt; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, k) => { const q = S3(p[0], p[1], 0); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.stroke(); };
  EDGES.forEach(e => { if (e.b === 'dock' || e.faint) return; stroke(e.pts, K * (e.main ? 0.95 : 0.62) + 3, C.dirt2); });
  EDGES.forEach(e => { if (e.b === 'dock' || e.faint) return; stroke(e.pts, K * (e.main ? 0.95 : 0.62), C.dirt); });
  EDGES.forEach(e => { if (!e.faint) return; stroke(e.pts, K * 0.28, 'rgba(160,145,115,.55)'); stroke(e.pts, K * 0.16, 'rgba(180,165,135,.7)'); });
  EDGES.forEach(e => e.pts.forEach((p, k) => { if (k % 2 || e.b === 'dock' || e.faint) return; const [X, Y] = S3(p[0] + (r() - 0.5) * 0.6, p[1] + (r() - 0.5) * 0.4, 0); c.fillStyle = 'rgba(140,120,85,.35)'; c.fillRect(X, Y, 2, 1.5); }));
  // pier (deck at z 0.3, posts into the water)
  const deck = [[PIER.x0, PIER.y0], [PIER.x1, PIER.y0], [PIER.x1, PIER.y1], [PIER.x0, PIER.y1]].map(p => S3(p[0], p[1], 0.3));
  for (let y = PIER.y0 + 0.6; y <= PIER.y1; y += 1.1) [PIER.x0 + 0.05, PIER.x1 - 0.05].forEach(x => { const a = S3(x, y, 0.3), b2 = S3(x, y, -0.5); R2(c, a[0] - K * 0.08, a[1], K * 0.16, b2[1] - a[1], '#4a3622'); });
  c.fillStyle = '#a07a52'; c.beginPath(); deck.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill();
  for (let y = PIER.y0; y < PIER.y1; y += 0.3) { const a = S3(PIER.x0, y, 0.3), b2 = S3(PIER.x1, y, 0.3); c.fillStyle = '#6b4f33'; c.fillRect(a[0], a[1], b2[0] - a[0], Math.max(1, K / 30)); }
  const f0 = S3(PIER.x0, PIER.y1, 0.3), f1 = S3(PIER.x1, PIER.y1, 0.05); c.fillStyle = '#5b432c'; c.fillRect(f0[0], f0[1], f1[0] - f0[0], f1[1] - f0[1]);
  c.strokeStyle = C.ink; c.lineWidth = 1; c.beginPath(); deck.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.stroke();
  const rp = S3(PIER.x0, 40.6, 0.3), rq = S3(PIER.x0 - 0.9, 41.0, 0); c.strokeStyle = '#6b4f33'; c.lineWidth = Math.max(1, K / 20); c.beginPath(); c.moveTo(rp[0], rp[1]); c.quadraticCurveTo((rp[0] + rq[0]) / 2, rq[1] + K * 0.3, rq[0], rq[1]); c.stroke();
  // pier props: crates + barrel
  [[PIER.x0 + 0.3, PIER.y0 + 0.9], [PIER.x0 + 0.8, PIER.y0 + 0.75]].forEach(([x, y]) => { const s = boxS({ cx: x, cy: y, rot: 0.1 }, 0, 0, 0.45, 0.45, 0.3, 0.75, '#b98f5c'); drawSolid(c, s); });
  // flowers + rocks
  FLOWERS.forEach(([x, y, t]) => { const [X, Y] = S3(x, y, 0); [[0, 0], [0.22, 0.1], [-0.18, 0.15]].forEach(([dx, dy], j) => { c.fillStyle = [C.red, C.lit, C.paper][(t + j) % 3]; c.beginPath(); c.arc(X + dx * K, Y + dy * K * TILT, Math.max(1.5, K * 0.07), 0, 7); c.fill(); }); });
  ROCKS.forEach(rk => { const [X, Y] = S3(rk.x, rk.y, 0), rx = rk.r * K, ry = rk.r * K * 0.75, rn = mulberry32(Math.floor(rk.seed * 1000)); const pts = Array.from({ length: 7 }, (_, k) => { const a = k / 7 * Math.PI * 2, f = 0.75 + rn() * 0.35; return [X + Math.cos(a) * rx * f, Y - ry * 0.5 + Math.sin(a) * ry * f]; });
    c.fillStyle = 'rgba(40,34,24,.18)'; c.beginPath(); c.ellipse(X + rx * 0.35, Y + ry * 0.2, rx, ry * 0.5, 0, 0, 7); c.fill();
    c.fillStyle = '#b4ad9e'; c.beginPath(); pts.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); c.strokeStyle = 'rgba(20,20,20,.6)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#d4cfc3'; c.beginPath(); c.ellipse(X - rx * 0.25, Y - ry * 0.85, rx * 0.4, ry * 0.3, -0.3, 0, 7); c.fill(); });

  // black house compound: mud yard, barbed wire, corner towers
  const camp = [[33.2, 4.6], [39.9, 4.6], [39.9, 10.4], [33.2, 10.4]];
  c.fillStyle = '#b7a88a'; c.beginPath();
  camp.forEach((p, k) => { const q = S3(p[0], p[1], 0); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath(); c.fill();
  for (let k = 0; k < 40; k++) { const [X, Y] = S3(33.4 + (k * 1.7 % 6.2), 4.8 + (k * 1.3 % 5.2), 0); c.fillStyle = 'rgba(90,70,45,.25)'; c.beginPath(); c.ellipse(X, Y, K * 0.35, K * 0.12, 0, 0, 7); c.fill(); }
  const wire = (a, b) => {
    const n = 10; for (let i = 0; i <= n; i++) {
      const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, [X, Y] = S3(x, y, 0);
      if (i % 2 === 0) { c.fillStyle = '#4a4034'; c.fillRect(X - 1.5, Y - K * 0.55, 3, K * 0.55); }
    }
    [[0.22, '#2a2a2a'], [0.42, '#3a3a3a']].forEach(([h, col]) => {
      c.strokeStyle = col; c.lineWidth = Math.max(1, K / 28); c.beginPath();
      for (let i = 0; i <= n; i++) { const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, [X, Y] = S3(x, y, h); i ? c.lineTo(X, Y) : c.moveTo(X, Y); } c.stroke();
      for (let i = 1; i < n; i++) { const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, [X, Y] = S3(x, y, h); c.beginPath(); c.arc(X, Y, 1.4, 0, 7); c.stroke(); }
    });
  };
  wire([33.2, 4.6], [39.9, 4.6]); wire([39.9, 4.6], [39.9, 10.4]); wire([39.9, 10.4], [33.2, 10.4]); wire([33.2, 10.4], [33.2, 4.6]);
  [[33.2, 4.6], [39.9, 4.6], [39.9, 10.4], [33.2, 10.4]].forEach(([x, y]) => {
    const [X, Y] = S3(x, y, 0), [, Yt] = S3(x, y, 2.4);
    c.fillStyle = '#2c2c2c'; c.fillRect(X - K * 0.28, Yt, K * 0.56, Y - Yt);
    c.fillStyle = '#1a1a1a'; c.fillRect(X - K * 0.42, Yt - K * 0.16, K * 0.84, K * 0.18);
  });

  // paved city streets
  const street = (a, b, wdt, col) => { const A = S3(a[0], a[1], 0), B = S3(b[0], b[1], 0); c.strokeStyle = col; c.lineWidth = wdt; c.lineCap = 'butt'; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); };
  STREETS.forEach(st => { street(st.a, st.b, K * (st.main ? 2.4 : 1.7), '#3a3a3a'); street(st.a, st.b, K * (st.main ? 2.0 : 1.35), '#555'); });
  // sidewalks
  STREETS.forEach(st => street(st.a, st.b, K * 0.12, '#d9d3c4'));
  // city blocks as 3D buildings with windows
  const cityWin = (c, len, h) => { const n = Math.max(2, Math.floor(len / 1.1)); for (let i = 0; i < n; i++) { const x = 0.35 + i * (len - 0.7) / n; for (let r = 0; r < 2; r++) winW(c, x, 0.35 + r * 0.7, 0.45, 0.4, false); } };
  BLOCKS.forEach(b => {
    const bb = { cx: b.x, cy: b.y, rot: 0 };
    const solid = boxS(bb, 0, 0, b.w, b.d, 0, b.h, b.col, { front: cityWin, side: cityWin, topCol: b.roof });
    drawSolid(c, solid);
    const roof = boxS(bb, 0, 0, b.w + 0.2, b.d + 0.2, b.h, b.h + 0.15, b.roof);
    drawSolid(c, roof);
  });
  // rail bed + rails + ties
  c.strokeStyle = '#5a4a38'; c.lineWidth = K * 1.1; c.lineCap = 'butt'; c.beginPath();
  RAIL.forEach((p, k) => { const q = S3(p[0], p[1], 0); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.stroke();
  for (let i = 0; i < RAIL.length; i += 4) { const [X, Y] = S3(RAIL[i][0], RAIL[i][1], 0); c.fillStyle = '#6b5a43'; c.fillRect(X - 1, Y - K * 0.28, 2, K * 0.56); }
  c.strokeStyle = '#d4cfc3'; c.lineWidth = Math.max(2, K * 0.12);
  [-0.28, 0.28].forEach(off => { c.beginPath(); RAIL.forEach((p, k) => { const q = S3(p[0], p[1] + off, 0.04); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.stroke(); });
  // station platforms + full names
  STATIONS.forEach(st => {
    const [X, Y] = S3(st.x, st.y + 0.85, 0);
    c.fillStyle = '#efe9dc'; c.fillRect(X - K * 1.4, Y - K * 0.22, K * 2.8, K * 0.44);
    c.strokeStyle = '#141414'; c.lineWidth = 1; c.strokeRect(X - K * 1.4, Y - K * 0.22, K * 2.8, K * 0.44);
    const sp = pill([st.name], { bg: '#efe9dc', fg: '#141414' }); c.drawImage(sp.img, X - sp.w / 2, Y - K * 0.9, sp.w, sp.h);
  });
  // minimap thumbnail
  miniImg = document.createElement('canvas'); miniImg.width = 176; miniImg.height = Math.round(176 * HPX / WPX); miniImg.getContext('2d').drawImage(ground, 0, 0, miniImg.width, miniImg.height);
  const mc = miniImg.getContext('2d'), ms = miniImg.width / WPX; ALLB.forEach(b => { const q = S3(b.cx, b.cy, 0); mc.fillStyle = b === HQ ? '#141414' : b.type === 'home' ? '#8a8172' : '#3a332a'; mc.fillRect(q[0] * ms - 3, q[1] * ms - 3, b.type === 'home' ? 4 : 6, b.type === 'home' ? 4 : 6); });
}

// ---------- dynamic drawing ----------
let cv = null, ctx = null, W = 360, H = 600, raf = null, last = 0, hour = 12, dark = 0, warm = 0, clockT = 0, OPEN = null;
const cam = { x: 0, y: 0, vx: 0, vy: 0, tx: null, ty: null, init: false };
const FONT = (wt, px) => `${wt} ${Math.round(px)}px -apple-system, system-ui, sans-serif`;
const pillCache = new Map();
function pill(lines, opt = {}) { // cached text sign canvas: lines = [main, sub?]
  const key = lines.join('|') + (opt.bg || '') + K; if (pillCache.has(key)) return pillCache.get(key); if (pillCache.size > 300) pillCache.clear();
  const c0 = document.createElement('canvas').getContext('2d'), f1 = FONT(650, K * 0.36), f2 = FONT(600, K * 0.3);
  c0.font = f1; let w = c0.measureText(lines[0]).width; if (lines[1]) { c0.font = f2; w = Math.max(w, c0.measureText(lines[1]).width); }
  const pw = Math.ceil(w + K * 0.6), ph = Math.ceil(K * (lines[1] ? 0.98 : 0.58)), cv2 = document.createElement('canvas'); cv2.width = pw * dpr; cv2.height = (ph + 4) * dpr;
  const c = cv2.getContext('2d'); c.scale(dpr, dpr); c.fillStyle = opt.bg || 'rgba(20,20,20,.86)'; c.beginPath(); c.roundRect ? c.roundRect(0, 0, pw, ph, Math.min(ph / 2, K * 0.3)) : c.rect(0, 0, pw, ph); c.fill();
  if (opt.pin) { c.beginPath(); c.moveTo(pw / 2 - 4, ph); c.lineTo(pw / 2, ph + 4); c.lineTo(pw / 2 + 4, ph); c.fill(); }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = opt.fg || C.cream; c.font = f1; c.fillText(lines[0], pw / 2, lines[1] ? K * 0.3 : ph / 2 + 0.5);
  if (lines[1]) { c.font = f2; c.fillStyle = opt.fg2 || '#d9d3c4'; c.fillText(lines[1], pw / 2, K * 0.7); }
  const o = { img: cv2, w: pw, h: ph + 4 }; pillCache.set(key, o); return o;
}
function badge(c, cx, cy, n, col, t, kind) {
  const r = K * 0.3 * (1 + Math.sin(t * 3) * 0.06);
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.arc(cx + 1.5, cy + 2, r, 0, 7); c.fill();
  c.fillStyle = col; c.strokeStyle = C.cream; c.lineWidth = Math.max(1.5, K / 16);
  if (kind === 'chat') { c.beginPath(); c.roundRect ? c.roundRect(cx - r * 1.15, cy - r * 0.85, r * 2.3, r * 1.7, r * 0.6) : c.rect(cx - r, cy - r, 2 * r, 2 * r); c.fill(); c.stroke(); }
  else { c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill(); c.stroke(); }
  c.fillStyle = C.cream; c.font = FONT(700, K * 0.34); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), cx, cy + 0.5);
}
function fitText(c, s, w) { if (c.measureText(s).width <= w) return s; while (s.length > 1 && c.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
function drawHQBoard(c, s) { const f = s.face, ev = eventsInfo(), x = f.x + 6, wmax = f.w - 12; let y = f.y + K * 0.32;
  c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = FONT(700, K * 0.27); c.fillText(fitText(c, 'TODAY · ' + (ev.todays.length ? `${ev.todays.length} event${ev.todays.length > 1 ? 's' : ''}` : 'no events'), wmax), x, y); y += K * 0.36;
  c.font = FONT(500, K * 0.24); (ev.todays.slice(0, 2)).forEach(e => { c.fillText(fitText(c, `${e.allDay ? 'All day' : e.time || ''} ${e.title || ''}`.trim(), wmax), x, y); y += K * 0.3; });
  c.font = FONT(700, K * 0.24); c.fillStyle = '#5b432c'; c.fillText(fitText(c, ev.next ? 'NEXT · ' + evWhen(ev.next) : 'NEXT · nothing scheduled', wmax), x, y); y += K * 0.3;
  c.font = FONT(500, K * 0.24); c.fillStyle = C.ink; if (ev.next) { c.fillText(fitText(c, ev.next.title || '(untitled)', wmax), x, y); y += K * 0.3; }
  if (ADMIN) { const pf = promisedByDay()[today()] || []; c.font = FONT(600, K * 0.22); c.fillStyle = C.red; if (y < f.y + f.h - 4) c.fillText(fitText(c, board('Gatepost Tasks', 'promised_followups') ? `Promised today: ${pf.length}` : 'Promised: waiting for Tasks', wmax), x, y); } }
function drawHarborSign(c, s) { const f = s.face; c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = FONT(700, K * 0.28);
  c.fillText('HARBOR', f.x + f.w / 2, f.y + f.h * (ADMIN ? 0.3 : 0.5)); if (ADMIN) { const n = sentToday(); c.font = FONT(600, K * 0.25); c.fillText(fitText(c, `Sent today: ${n}`, f.w - 8), f.x + f.w / 2, f.y + f.h * 0.72); } }
function drawItem(c, item, X, Y, u) {
  if (item === 'crate') { c.fillStyle = C.ink; c.fillRect(X - 3 * u, Y - 2.6 * u, 6 * u, 4.4 * u); c.fillStyle = '#b98f5c'; c.fillRect(X - 2.5 * u, Y - 2.1 * u, 5 * u, 3.4 * u); c.fillStyle = '#7a5a35'; c.fillRect(X - 2.5 * u, Y - 0.6 * u, 5 * u, 0.6 * u); c.fillRect(X - 0.3 * u, Y - 2.1 * u, 0.6 * u, 3.4 * u); }
  else if (item === 'letter') { c.fillStyle = C.ink; c.fillRect(X - 3.1 * u, Y - 2.3 * u, 6.2 * u, 4 * u); c.fillStyle = C.paper; c.fillRect(X - 2.6 * u, Y - 1.8 * u, 5.2 * u, 3 * u); c.strokeStyle = '#9b9585'; c.lineWidth = Math.max(1, u * 0.5); c.beginPath(); c.moveTo(X - 2.6 * u, Y - 1.8 * u); c.lineTo(X, Y - 0.2 * u); c.lineTo(X + 2.6 * u, Y - 1.8 * u); c.stroke(); c.fillStyle = C.red; c.beginPath(); c.arc(X, Y - 0.3 * u, 0.8 * u, 0, 7); c.fill(); }
  else { c.fillStyle = C.ink; c.fillRect(X - 3.4 * u, Y - 1.6 * u, 6.8 * u, 3.2 * u); c.fillStyle = '#f1e6c8'; c.fillRect(X - 2.9 * u, Y - 1.1 * u, 5.8 * u, 2.2 * u); c.fillStyle = '#c9a777'; c.beginPath(); c.arc(X - 3.2 * u, Y, 1.5 * u, 0, 7); c.arc(X + 3.2 * u, Y, 1.5 * u, 0, 7); c.fill(); c.fillStyle = C.red; c.fillRect(X - 0.4 * u, Y - 1.1 * u, 0.8 * u, 2.2 * u); }
}
function drawRobot(c, ch, t) {
  const bt = BOTS[ch.i], u = K / 12, [X, Y] = S3(ch.x, ch.y, 0), idle = !ch.walking && ch.where === 'work' && isIdle(ch.i);
  const ph = ch.dist * (ch.running ? 4.4 : 3.2), sw = ch.walking ? Math.sin(ph) : 0, bob = ch.walking ? -Math.abs(Math.sin(ph)) * (ch.running ? 1.4 : 0.9) : idle ? Math.sin(t * 1.2 + ch.i) * 0.25 + 1.2 : Math.sin(t * 2.2 + ch.i) * 0.35;
  c.fillStyle = 'rgba(20,20,20,.22)'; c.beginPath(); c.ellipse(X, Y, 3.1 * u, 1.05 * u, 0, 0, 7); c.fill();
  const r = (x, y, w, h, col, rad = 0) => { c.fillStyle = col; c.beginPath(); c.roundRect ? c.roundRect(X + x * u, Y + (y + bob) * u, w * u, h * u, rad * u) : c.rect(X + x * u, Y + (y + bob) * u, w * u, h * u); c.fill(); };
  if (!idle) { r(-1.9 + sw * 0.6, -2.6, 1.4, 2.6, C.ink, 0.5); r(0.5 - sw * 0.6, -2.6, 1.4, 2.6, C.ink, 0.5); } else { r(-2.6, -1.6, 2.2, 1.4, C.ink, 0.5); r(0.4, -1.6, 2.2, 1.4, C.ink, 0.5); }
  r(-2.9, -6.7, 5.8, 4.4, C.ink, 1.2); r(-2.4, -6.2, 4.8, 3.4, bt.color, 0.9); r(-1.0, -5.4, 2.0, 1.2, 'rgba(255,255,255,.25)', 0.4);
  const work = !ch.walking && ch.where === 'work' && !idle, arm = work ? Math.max(0, Math.sin(t * (ch.busyT > 0 || current(bt.name) ? 9 : 5) + ch.i * 2)) * 1.6 : ch.walking ? sw * 0.8 : 0;
  if (ch.carry) { r(-3.9, -10.6, 1.1, 4.4, C.ink, 0.5); r(2.8, -10.6, 1.1, 4.4, C.ink, 0.5); }
  else { r(-3.9, -6.1 - arm, 1.1, 2.7, C.ink, 0.5); r(2.8, -6.1 + (work ? 0 : -arm), 1.1, 2.7, C.ink, 0.5); }
  r(-3.2, -11.8, 6.4, 5.3, C.ink, 1.6); r(-2.7, -11.3, 5.4, 4.3, '#ece7db', 1.2);
  const blink = idle || (t + ch.blink) % 4 < 0.14, look = (ch.walking ? ch.face : ch.i === 1 ? Math.sin(t * 0.8) : 0) * 0.6;
  if (!blink) { r(-1.75 + look, -9.8, 1.15, 1.4, C.ink, 0.4); r(0.6 + look, -9.8, 1.15, 1.4, C.ink, 0.4); } else { r(-1.75, -9.1, 1.15, 0.4, C.ink); r(0.6, -9.1, 1.15, 0.4, C.ink); }
  r(-1.9 + look, -8.0, 0.8, 0.45, 'rgba(168,90,82,.35)', 0.2); r(1.1 + look, -8.0, 0.8, 0.45, 'rgba(168,90,82,.35)', 0.2);
  r(-0.25, -13.6, 0.5, 1.9, C.ink);
  c.fillStyle = dark > 0.15 ? C.lit : idle ? '#8a8172' : bt.color; c.beginPath(); c.arc(X, Y + (-13.9 + bob) * u, 1.05 * u, 0, 7); c.fill();
  if (ch.carry) drawItem(c, ch.carry, X, Y + (-15.6 + bob) * u, u);
}
function drawRobotOver(c, ch, t) { // tags, thought bubbles, Zz (drawn above everything)
  const bt = BOTS[ch.i], u = K / 12, [X, Y] = S3(ch.x, ch.y, 0); if (ch.where === 'home' && !ch.walking) return;
  if (ch.tagT > 0 && ch.errand && ch.errand.label) { const p = pill([ch.errand.label], { bg: C.lit, fg: C.ink }); c.globalAlpha = Math.min(1, ch.tagT); c.drawImage(p.img, X - p.w / 2, Y - 21 * u - p.h, p.w, p.h); c.globalAlpha = 1; return; }
  if (ch.walking) return;
  const cur = ADMIN && current(bt.name);
  if (cur) { const txt = (cur.body || '').length > 26 ? cur.body.slice(0, 25) + '…' : cur.body, p = pill([txt, 'ETA ' + (cur.eta || '').slice(0, 24)], { bg: '#fbf8f1', fg: C.ink, fg2: '#5f7a8a' }), bx = X - p.w / 2, by = Y - 17 * u - p.h - Math.sin(t * 2 + ch.i) * 1.5;
    c.fillStyle = '#fbf8f1'; c.strokeStyle = C.ink; c.lineWidth = 1; [[X + 1.5 * u, Y - 15.6 * u, 1.0 * u], [X + 3 * u, Y - 16.8 * u, 1.4 * u]].forEach(([a, b, rr2]) => { c.beginPath(); c.arc(a, b, rr2, 0, 7); c.fill(); c.stroke(); });
    c.strokeRect(bx + 0.5, by + 0.5, p.w - 1, p.h - 5); c.drawImage(p.img, bx, by, p.w, p.h); return; }
  if (!ch.walking && ch.where === 'work' && isIdle(ch.i)) { for (let k = 0; k < 2; k++) { const o = (t * 0.5 + ch.i * 0.37 + k * 0.5) % 1; c.globalAlpha = Math.sin(o * Math.PI); c.fillStyle = dark > 0.15 ? C.cream : C.ink; c.font = FONT(700, K * (0.3 + o * 0.22)); c.textAlign = 'left'; c.fillText('z', X + 3 * u + o * 6, Y - 14 * u - o * K * 0.8); } c.globalAlpha = 1; return; }
  if (ch.where === 'work' && (t + ch.emote) % 7 < 1.9) { const k = ((t + ch.emote) % 7) / 1.9, pop = Math.min(1, k * 6) * (k > 0.85 ? (1 - k) / 0.15 : 1), p = pill([bt.glyph], { bg: C.paper, fg: C.ink });
    c.globalAlpha = pop; c.drawImage(p.img, X + 3 * u, Y - 18 * u - p.h, p.w, p.h); c.globalAlpha = 1; }
}
function drawShip(c, t) {
  if (ship.x < -6.5) return; const [X0, Y0] = S3(ship.x, SHIP_Y, 0); c.save(); c.translate(X0, Y0); const p = v => v * K, moving = ship.state === 'leaving' || ship.state === 'returning', Y = Math.sin(t * 1.7) * 0.05;
  const poly = (pts, col) => { c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(p(x), p(y)) : c.moveTo(p(x), p(y))); c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = C.ink; c.lineWidth = Math.max(1, K / 22); c.lineJoin = 'round'; c.stroke(); };
  const rect = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(p(x), p(y), p(w), p(h)); };
  c.fillStyle = 'rgba(30,50,60,.2)'; c.beginPath(); c.ellipse(0, p(0.3), p(2.3), p(0.25), 0, 0, 7); c.fill();
  if (moving) { c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = Math.max(1, K / 16); for (let k = 0; k < 3; k++) { const o = ((t * 2 + k * 0.6) % 1.8); c.beginPath(); c.moveTo(p(1.7 + o), p(0.15 + k * 0.08)); c.lineTo(p(2.2 + o), p(0.2 + k * 0.08)); c.stroke(); } }
  poly([[-2.25, Y - 0.6], [1.75, Y - 0.55], [1.55, Y + 0.25], [-1.45, Y + 0.25]], '#7a5634');
  rect(-1.7, Y - 0.32, 3.3, 0.09, '#5b3f26'); rect(-2.0, Y - 0.58, 3.7, 0.06, '#d9c7a4');
  rect(0.95, Y - 1.05, 0.8, 0.5, '#8a6240'); rect(1.15, Y - 0.95, 0.3, 0.25, dark > 0.15 ? C.lit : '#b9c6cb');
  c.strokeStyle = C.ink; c.lineWidth = Math.max(1, K / 16); c.beginPath(); c.moveTo(p(-2.25), p(Y - 0.6)); c.lineTo(p(-2.9), p(Y - 1.0)); c.stroke();
  const mast = (mx, top, w1, w2, sT, sB) => { rect(mx - 0.05, Y - top, 0.1, top - 0.55, C.ink); rect(mx - w1 / 2, Y - sT - 0.05, w1, 0.07, C.ink); const bil = Math.sin(t * 1.3 + mx) * 0.06 + (moving ? 0.16 : 0.05);
    c.beginPath(); c.moveTo(p(mx - w1 / 2 + 0.05), p(Y - sT)); c.lineTo(p(mx + w1 / 2 - 0.05), p(Y - sT)); c.quadraticCurveTo(p(mx + w2 / 2 + bil), p(Y - (sT + sB) / 2), p(mx + w2 / 2), p(Y - sB)); c.lineTo(p(mx - w2 / 2), p(Y - sB)); c.quadraticCurveTo(p(mx - w2 / 2 - bil * 0.3), p(Y - (sT + sB) / 2), p(mx - w1 / 2 + 0.05), p(Y - sT)); c.closePath();
    c.fillStyle = '#f3ece0'; c.fill(); c.strokeStyle = C.ink; c.lineWidth = Math.max(1, K / 22); c.stroke(); c.save(); c.clip(); rect(mx - 0.13, Y - sT, 0.26, sT - sB, C.tan); c.restore(); return Y - top; };
  const top = mast(0.05, 3.15, 1.9, 2.1, 2.75, 1.0); mast(-1.15, 2.45, 1.2, 1.35, 2.1, 1.05);
  const wv = Math.sin(t * 5) * 0.08; c.fillStyle = C.red; c.beginPath(); c.moveTo(p(0.05), p(top)); c.lineTo(p(0.7), p(top + 0.1 + wv)); c.lineTo(p(0.05), p(top + 0.22)); c.fill();
  c.fillStyle = dark > 0.15 ? C.lit : '#8a8172'; c.fillRect(p(1.78), p(Y - 1.0), Math.max(2, K * 0.14), Math.max(2, K * 0.18));
  for (let k = 0; k < ship.cargo && k < 3; k++) { rect(-0.75 + k * 0.42, Y - 0.95, 0.36, 0.34, C.ink); rect(-0.72 + k * 0.42, Y - 0.92, 0.3, 0.28, '#b98f5c'); }
  c.restore();
}
const clouds = [{ x: 3, y: 8, s: 3.6, v: 0.16 }, { x: 16, y: 20, s: 3.0, v: 0.12 }, { x: 9, y: 30, s: 2.6, v: 0.2 }, { x: 22, y: 4, s: 2.8, v: 0.14 }];
const flies = Array.from({ length: 18 }, (_, k) => ({ x: (k * 7.3) % WX, y: 6 + (k * 11.7) % 28, p: k * 1.7 }));
const puffs = [];
let ZM = 1; const ZMIN = 0.5, ZMAX = 2.5, VW = () => W / ZM, VH = () => H / ZM;
function inView(x, y, w, h) { return x + w > cam.x - 20 && x < cam.x + VW() + 20 && y + h > cam.y - 20 && y < cam.y + VH() + 20; }
let LABELRECTS = [];

// black robot on a tower closer to town; constant red beam to a tower beside the black house
const BOSS = { x: 27.2, y: 11.6 };
const RELAY = { x: 34.6, y: 8.4 };
function towerAt(c, x, y, h, col) {
  const [X, Y] = S3(x, y, 0), [, Yt] = S3(x, y, h);
  c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(X, Y, K * 1.1, K * 0.35, 0, 0, 7); c.fill();
  c.fillStyle = col; c.fillRect(X - K * 0.55, Yt, K * 1.1, Y - Yt);
  c.fillStyle = '#2a2a2a'; c.fillRect(X - K * 0.7, Yt - K * 0.18, K * 1.4, K * 0.22);
  c.strokeStyle = '#3a3a3a'; c.lineWidth = 1;
  for (let k = 0.4; k < h; k += 0.7) { const [, yy] = S3(x, y, k); c.beginPath(); c.moveTo(X - K * 0.5, yy); c.lineTo(X + K * 0.5, yy); c.stroke(); }
  return [X, Yt];
}
function drawBoss(c, t) {
  const [bx, by] = towerAt(c, BOSS.x, BOSS.y, 4.6, '#1a1a1a');
  const [rx, ry] = towerAt(c, RELAY.x, RELAY.y, 3.2, '#222');
  // black robot on the town-side tower
  const u = K / 11;
  const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(bx + x * u, by + y * u, w * u, h * u); };
  r(-2.4, -5.2, 1.6, 4.6, '#0e0e0e'); r(0.8, -5.2, 1.6, 4.6, '#0e0e0e');
  r(-3.4, -12.5, 6.8, 7.4, '#141414'); r(-2.7, -11.6, 5.4, 5.6, '#1c1c1c');
  r(-4.6, -11, 1.4, 4.2, '#0e0e0e'); r(3.2, -11, 1.4, 4.2, '#0e0e0e');
  r(-2.8, -19.5, 5.6, 7, '#0e0e0e'); r(-2.1, -18.6, 4.2, 5.2, '#1a1a1a');
  c.fillStyle = '#f6f4ef'; c.beginPath(); c.arc(bx - 1.0 * u, by - 16.2 * u, 0.55 * u, 0, 7); c.arc(bx + 1.0 * u, by - 16.2 * u, 0.55 * u, 0, 7); c.fill();
  // constant red beam
  const pulse = 0.75 + 0.25 * Math.sin(t * 6);
  c.strokeStyle = 'rgba(180,20,20,' + pulse + ')'; c.lineWidth = Math.max(2, K * 0.12);
  c.beginPath(); c.moveTo(bx, by - 16 * u); c.lineTo(rx, ry - K * 0.4); c.stroke();
  c.strokeStyle = 'rgba(255,60,40,' + (pulse * 0.6) + ')'; c.lineWidth = Math.max(1, K * 0.05);
  c.beginPath(); c.moveTo(bx, by - 16 * u); c.lineTo(rx, ry - K * 0.4); c.stroke();
  c.fillStyle = '#ff3a28'; c.beginPath(); c.arc(rx, ry - K * 0.4, Math.max(3, K * 0.12), 0, 7); c.fill();
  // black agent at the house door
  const door = doorOf(AI), [ax, ay] = S3(door[0], door[1], 0), au = K / 14;
  c.fillStyle = '#0e0e0e'; c.beginPath(); c.arc(ax, ay - 6 * au, 2.2 * au, 0, 7); c.fill();
  c.fillRect(ax - 1.6 * au, ay - 4 * au, 3.2 * au, 4 * au);
}

function drawCar(c, x, y, col, face) {
  const [X, Y] = S3(x, y, 0), u = K / 10;
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(X, Y, u * 3.2, u * 1.1, 0, 0, 7); c.fill();
  c.fillStyle = col; c.beginPath(); c.roundRect ? c.roundRect(X - 3.2 * u, Y - 2.4 * u, 6.4 * u, 2.2 * u, u * 0.4) : c.rect(X - 3.2 * u, Y - 2.4 * u, 6.4 * u, 2.2 * u); c.fill();
  c.fillStyle = '#c9d6df'; c.fillRect(X - 1.6 * u, Y - 2.2 * u, 3.2 * u, 1.1 * u);
  c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(X - 2.1 * u, Y - 0.3 * u, 0.7 * u, 0, 7); c.arc(X + 2.1 * u, Y - 0.3 * u, 0.7 * u, 0, 7); c.fill();
  c.fillStyle = face > 0 ? '#f2c96b' : '#a85a52'; c.fillRect(face > 0 ? X + 2.6 * u : X - 3.2 * u, Y - 1.6 * u, 0.5 * u, 0.6 * u);
}
function drawCityTraffic(c, t) {
  // ambient cars
  CARS.forEach(car => {
    car.t = (car.t + car.speed * 0.016) % 1;
    const a = car.path.a, b = car.path.b, k = car.face > 0 ? car.t : 1 - car.t;
    const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k + 0.25;
    drawCar(c, x, y, car.col, car.face);
  });
  // train on the rail
  trainT = (trainT + 0.004) % 1;
  const ri = Math.min(RAIL.length - 2, Math.floor(trainT * (RAIL.length - 1)));
  const [tx, ty] = RAIL[ri], [X, Y] = S3(tx, ty, 0), u = K / 9;
  c.fillStyle = '#2b2b2b'; c.fillRect(X - 4 * u, Y - 3.2 * u, 8 * u, 2.4 * u);
  c.fillStyle = '#f6f4ef'; c.fillRect(X - 3.4 * u, Y - 2.9 * u, 6.8 * u, 1.2 * u);
  c.fillStyle = '#a85a52'; c.fillRect(X + 3.2 * u, Y - 3.2 * u, 0.8 * u, 2.4 * u);
  c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(X - 2.4 * u, Y - 0.6 * u, 0.55 * u, 0, 7); c.arc(X + 2.4 * u, Y - 0.6 * u, 0.55 * u, 0, 7); c.fill();
  // bots riding for long trips
  chars.forEach(ch => { if (ch.riding) drawCar(c, ch.x, ch.y, BOTS[ch.i].color, ch.face || 1); });
  // city agents walking the sidewalks
  CITY_AGENTS.forEach(ag => {
    ag.t = (ag.t + ag.speed * 0.016) % 1;
    const a = ag.path.a, b = ag.path.b;
    const x = a[0] + (b[0] - a[0]) * ag.t, y = a[1] + (b[1] - a[1]) * ag.t + ag.side;
    const [X, Y] = S3(x, y, 0), u = K / 14, bob = Math.abs(Math.sin(ag.t * 40)) * u * 0.4;
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(X, Y, u * 1.6, u * 0.5, 0, 0, 7); c.fill();
    c.fillStyle = '#0e0e0e'; c.fillRect(X - u * 0.7, Y - u * 2.2 - bob, u * 1.4, u * 2.2);
    c.fillStyle = ag.col; c.beginPath(); c.arc(X, Y - u * 3.2 - bob, u * 1.1, 0, 7); c.fill();
  });
  // role signs on buildings
  BLOCKS.forEach(b => { const [X, Y] = S3(b.x, b.y, b.h + 0.4); const p = pill([b.role], { bg: 'rgba(20,20,20,.8)' }); c.drawImage(p.img, X - p.w / 2, Y - p.h, p.w, p.h); });
}
function drawFrame(t, dt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  { const sx = Math.max(0, cam.x), sy = Math.max(0, cam.y), sw = Math.min(WPX - sx, VW() - (sx - cam.x)), sh = Math.min(HPX - sy, VH() - (sy - cam.y)), k = dpr * ZM; if (cam.x < 0 || cam.y < 0 || sw < VW() || sh < VH()) { ctx.fillStyle = '#c9d2b6'; ctx.fillRect(0, 0, cv.width, cv.height); const wb = (HPX - cam.y) * k; if (wb < cv.height) { ctx.fillStyle = '#5f8ea3'; ctx.fillRect(0, wb, cv.width, cv.height - wb); } } ctx.drawImage(ground, sx * gdpr, sy * gdpr, sw * gdpr, sh * gdpr, (sx - cam.x) * k, (sy - cam.y) * k, sw * k, sh * k); }
  ctx.setTransform(dpr * ZM, 0, 0, dpr * ZM, -cam.x * dpr * ZM, -cam.y * dpr * ZM);
  // water life
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = Math.max(1, K / 22);
  for (let k = 0; k < 34; k++) { const dir = k % 2 ? 1 : -1, wx = (((k * 5.37) % WX) + t * 0.22 * dir + WX * 4) % WX, wy = 38.8 + ((k * 3.91) % 5), s = 0.25 + (k % 5) * 0.08; if (wx > PIER.x0 - 0.3 && wx < PIER.x1 + 0.3) continue; const [X, Y] = S3(wx, wy, 0); if (!inView(X - 20, Y - 10, 40, 20)) continue;
    ctx.beginPath(); ctx.moveTo(X - s * K, Y); ctx.quadraticCurveTo(X, Y - K * (0.1 + Math.sin(t * 2 + k) * 0.04), X + s * K, Y); ctx.stroke(); }
  // depth-sorted world objects
  const list = [];
  SPRITES.forEach(s => { if (inView(s.x, s.y, s.w, s.h)) list.push({ k: s.key, s }); });
  chars.forEach(ch => { if ((ch.where === 'home' && !ch.walking) || ch.riding) return; list.push({ k: ch.y + 0.01, ch }); });
  list.push({ k: SHIP_Y, ship: 1 });
  pierCrates.forEach((it, k) => list.push({ k: 40.5 + k * 0.01, crate: [PIER.x0 + 0.3 + (k % 2) * 0.5, 40.4 - Math.floor(k / 2) * 0.45, it] }));
  list.sort((a, b) => a.k - b.k).forEach(o => {
    if (o.s) { ctx.drawImage(o.s.img, o.s.x, o.s.y, o.s.w, o.s.h); if (o.s.after) o.s.after(ctx, o.s); }
    else if (o.ch) drawRobot(ctx, o.ch, t); else if (o.ship) drawShip(ctx, t);
    else if (o.crate) { const [x, y, it] = o.crate; drawSolid(ctx, boxS({ cx: x, cy: y, rot: 0 }, 0, 0, 0.42, 0.42, 0.3, 0.72, it === 'letter' ? C.paper : '#b98f5c')); } });
  // building animation bits
  const flag = (p, col) => { const [fx, fy] = S3(p[0], p[1], p[2] + 1.0), wv = Math.sin(t * 4.5) * K * 0.08; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + K * 0.4, fy + wv, fx + K * 0.75, fy + K * 0.17 + wv); ctx.quadraticCurveTo(fx + K * 0.4, fy + K * 0.36, fx, fy + K * 0.36); ctx.fill(); };
  if (BOTS[0].b.ex) flag(BOTS[0].b.ex.flag, C.red); if (HQ.ex) flag(HQ.ex.flag, C.tan);
  const bc = BOTS[1].b.ex; if (bc) { const [X, Y] = S3(...bc.beacon), on = (Math.sin(t * 3) + 1) / 2; ctx.fillStyle = `rgba(242,201,107,${0.4 + on * 0.6})`; ctx.beginPath(); ctx.arc(X, Y, K * (0.12 + on * 0.06), 0, 7); ctx.fill(); }
  const hk = BOTS[4].b.ex; if (hk) { const [X, Y] = S3(...hk.hook), sx = X + Math.sin(t * 1.3) * K * 0.25; ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(sx, Y + K * 1.2); ctx.stroke(); ctx.fillStyle = C.ink; ctx.fillRect(sx - K * 0.12, Y + K * 1.2, K * 0.24, K * 0.18); }
  if (Math.random() < dt * 2.0) { const i = Math.floor(Math.random() * BOTS.length), e = BOTS[i].home.ex; if (e && (chars[i].where === 'home' || Math.random() < 0.3)) puffs.push({ p: S3(...e.chimney), a: 1, r: 0.12 }); }
  for (let k = puffs.length - 1; k >= 0; k--) { const p = puffs[k]; p.p[1] -= dt * K * 0.45; p.p[0] += dt * K * 0.15; p.r += dt * 0.12; p.a -= dt * 0.45; if (p.a <= 0) { puffs.splice(k, 1); continue; } ctx.fillStyle = `rgba(246,244,239,${p.a * 0.7})`; ctx.beginPath(); ctx.arc(p.p[0], p.p[1], p.r * K, 0, 7); ctx.fill(); }
  if (dark < 0.2) { clouds.forEach(cl => { cl.x += cl.v * dt; if (cl.x > WX + cl.s) cl.x = -cl.s; const [X, Y] = S3(cl.x, cl.y, 0); ctx.fillStyle = 'rgba(60,70,60,.06)'; ctx.beginPath(); ctx.ellipse(X, Y, cl.s * K, cl.s * K * 0.4, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(X + cl.s * K * 0.5, Y - cl.s * K * 0.12, cl.s * K * 0.6, cl.s * K * 0.3, 0, 0, 7); ctx.fill(); });
    for (let k = 0; k < 3; k++) { const a = t * (0.3 + k * 0.08) + k * 2, [X, Y] = S3(9 + k * 5 + Math.cos(a) * 3, 40 + Math.sin(a) * 1.2, 2.5), f = Math.sin(t * 6 + k) * K * 0.1; ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(1, K / 26); ctx.beginPath(); ctx.moveTo(X - K * 0.25, Y - f); ctx.quadraticCurveTo(X - K * 0.1, Y - K * 0.12, X, Y); ctx.quadraticCurveTo(X + K * 0.1, Y - K * 0.12, X + K * 0.25, Y - f); ctx.stroke(); } }
  // light: tint + night, then glows
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (warm > 0) { ctx.fillStyle = `rgba(242,160,90,${warm})`; ctx.fillRect(0, 0, W, H); }
  if (dark > 0) { ctx.fillStyle = `rgba(14,18,46,${dark})`; ctx.fillRect(0, 0, W, H); }
  ctx.setTransform(dpr * ZM, 0, 0, dpr * ZM, -cam.x * dpr * ZM, -cam.y * dpr * ZM);
  if (dark > 0.15) { const glow = (x, y, z, s) => { const [X, Y] = S3(x, y, z); if (!inView(X - s * K, Y - s * K, 2 * s * K, 2 * s * K)) return; const g = ctx.createRadialGradient(X, Y, 1, X, Y, K * s); g.addColorStop(0, `rgba(242,201,107,${dark * 0.55})`); g.addColorStop(1, 'rgba(242,201,107,0)'); ctx.fillStyle = g; ctx.fillRect(X - K * s, Y - K * s, 2 * K * s, 2 * K * s); };
    BOTS.forEach((bt, i) => { glow(bt.b.cx, bt.b.cy + bt.b.d / 2, 1.2, 2.4); if (!atWork(hour)) glow(bt.home.cx, bt.home.cy + 1, 0.8, 1.6); }); glow(HQ.cx, HQ.cy + HQ.d / 2, 1.3, 2.8);
    LAMPS.forEach(([x, y]) => glow(x, y, 1.75, 1.4)); LANTERNS.forEach(([x, y], k) => glow(x, y, 1.9, 1.3 * (0.9 + Math.sin(t * 7 + k * 2) * 0.08))); glow(ship.x + 1.85, SHIP_Y, 1.1, 1.2);
    flies.forEach(f => { const a = (Math.sin(t * 2 + f.p) + 1) / 2, [X, Y] = S3(f.x + Math.sin(t * 0.5 + f.p) * 0.8, f.y + Math.cos(t * 0.4 + f.p) * 0.5, 0.6); ctx.fillStyle = `rgba(242,220,120,${a * 0.9})`; ctx.beginPath(); ctx.arc(X, Y, Math.max(1.2, K * 0.05), 0, 7); ctx.fill(); }); }
  // floating signs: place name + live counts (admins), badges
  LABELRECTS = [];
  const sign = (b, lines, tap, badges) => { const [X, Y] = S3(b.cx, b.cy, (b.ex && b.ex.top || 3) + 0.35), p = pill(lines, { pin: true }); const x = X - p.w / 2, y = Y - p.h; if (!inView(x, y, p.w, p.h)) return;
    ctx.drawImage(p.img, x, y, p.w, p.h); LABELRECTS.push({ x, y, w: p.w, h: p.h, tap }); (badges || []).forEach((bd, k) => badge(ctx, k ? x + 2 : x + p.w - 2, y + 2, bd.n, bd.col, t + k, bd.kind)); };
  BOTS.forEach((bt, i) => { const s = ADMIN ? stats(bt.name) : null, u = ADMIN ? unread(bt.name) : 0;
    const line2 = ADMIN ? signLine(i, s) : null;
    sign(bt.b, line2 ? [bt.place, line2] : [bt.place], i, ADMIN ? [s.pending && { n: s.pending, col: C.red, kind: 'count' }, u && { n: u, col: C.slate, kind: 'chat' }].filter(Boolean) : []); });
  const op = ADMIN ? otherPending() : 0, wq = ADMIN ? waitingQueue().length : 0;
  sign(HQ, ADMIN ? ['Christian\u2019s HQ', `${wq} waiting on you`] : ['Gatepost HQ'], 'hq', op ? [{ n: op, col: C.red, kind: 'count' }] : []);
  sign(AI, ['AI Desk'], 'ai');
  drawBoss(ctx, t);
  drawCityTraffic(ctx, t);
  chars.forEach(ch => drawRobotOver(ctx, ch, t));
  pops.forEach(p => { const k = p.t / 1.3, [X, Y] = S3(p.x, p.y, 1.6 + k * 0.9); ctx.globalAlpha = 1 - k; if (p.item) drawItem(ctx, p.item, X, Y, K / 14 * (1 - k * 0.5));
    ctx.fillStyle = C.sage; ctx.beginPath(); ctx.arc(X + K * 0.45, Y - K * 0.2, K * 0.24, 0, 7); ctx.fill(); ctx.fillStyle = C.cream; ctx.font = FONT(700, K * 0.3); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', X + K * 0.45, Y - K * 0.2 + 0.5); ctx.globalAlpha = 1; });
}
function signLine(i, s) { const bn = BOTS[i].name, n = actsToday(bn).length; let x = `${s.pending} waiting · ${n} today`;
  if (i === 0) { const b = board(bn, 'follow_ups_due'); if (b) x += ` · ${bItems(b).length} follow-up${bItems(b).length === 1 ? '' : 's'}`; }
  if (i === 1) { const b = board(bn, 'nextdoor_replies'); if (b) x += ` · ${bItems(b).length} repl${bItems(b).length === 1 ? 'y' : 'ies'}`; }
  if (i === 2) { const b = board(bn, 'quote_clock'); if (b) { const f = bItems(b).filter(q => { const d = daysLeft(q.expires); return d !== null && d <= 7; }).length; x += ` · ${f} expiring`; } }
  return x; }
const daysLeft = e => { const d = asDay(e); return d ? dayDiff(today(), d) : null; };

// ---------- simulation ----------
function update(dt) {
  chars.forEach(ch => {
    const long = ch.path && ch.path.filter(p => p && p.length === 2).length > 18;
    ch.riding = !!(ch.walking && long);
    if (ch.tagT > 0) ch.tagT -= dt; if (ch.busyT > 0) ch.busyT -= dt;
    const head = ch.path[0];
    if (head && !Array.isArray(head)) {
      if (head.act === 'wait') { head.t -= dt; if (head.t > 0) return; }
      else if (head.act === 'drop') handoff(ch, head.target);
      else if (head.act === 'take') { ch.carry = 'letter'; pops.push({ x: ch.x, y: ch.y, t: 0, item: null }); }
      else if (head.act === 'end') { ch.errand = null; ch.running = false; ch.carry = null; }
      ch.path.shift(); if (!ch.path.length) ch.walking = false; return;
    }
    if (head) { const [tx, ty] = head, dx = tx - ch.x, dy = ty - ch.y, d = Math.hypot(dx, dy), sp = (ch.running ? 4.2 : 2.6) * dt;
      if (Math.abs(dx) > 0.01) ch.face = Math.sign(dx);
      if (d <= sp) { ch.x = tx; ch.y = ty; ch.dist += d; ch.path.shift(); if (!ch.path.length) ch.walking = false; } else { ch.x += dx / d * sp; ch.y += dy / d * sp; ch.dist += sp; } }
    else if (ch.where === 'work' && lastWork) {
      if (ch.queue.length) startErrand(ch); // real events wake idle bots too
      else if ((ch.nextStroll -= dt) <= 0) { if (!isIdle(ch.i)) ambient(ch); ch.nextStroll = (ADMIN ? 14 : 20) + Math.random() * 20; }
    }
  });
  updateShip(dt);
}
let camMoved = true, drag = null;
function clampCam() { const mx = WPX - VW(), my = HPX - VH(); cam.x = mx < 0 ? mx / 2 : Math.max(0, Math.min(mx, cam.x)); cam.y = my < 0 ? my / 2 : Math.max(0, Math.min(my, cam.y)); }
function focusOn(x, y, z = 1, instant) { const [X, Y] = S3(x, y, z); cam.tx = X - VW() / 2; cam.ty = Y - VH() * 0.45; if (instant) { cam.x = cam.tx; cam.y = cam.ty; cam.tx = cam.ty = null; clampCam(); } camMoved = true; }
function loop(ts) {
  if (!cv || !cv.isConnected || document.hidden) { stop(); return; }
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016); last = ts;
  if ((clockT -= dt) <= 0) { clockT = 30; const pl = LIT, ph = HOMELIT; hour = syncClock(); dark = darkness(hour); warm = warmth(hour); LIT = dark > 0.15; HOMELIT = LIT && !atWork(hour);
    if (pl !== LIT || ph !== HOMELIT) spritesDirty = true; updateOverlay(); }
  if (spritesDirty || !ground) { buildSprites(); buildGround(); camMoved = true; }
  if (cam.tx !== null && !drag) { const k = Math.min(1, dt * 6); cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; if (Math.abs(cam.tx - cam.x) < 0.5 && Math.abs(cam.ty - cam.y) < 0.5) cam.tx = cam.ty = null; clampCam(); camMoved = true; }
  else if (!drag && (Math.abs(cam.vx) > 5 || Math.abs(cam.vy) > 5)) { cam.x -= cam.vx * dt; cam.y -= cam.vy * dt; const f = Math.pow(0.9, dt * 60); cam.vx *= f; cam.vy *= f; clampCam(); camMoved = true; }
  update(dt); drawFrame(ts / 1000, dt); if (camMoved) { drawMini(); camMoved = false; }
}
function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }
function drawMini() { const m = document.getElementById('town-mini'); if (!m || !miniImg) return; if (m.width !== miniImg.width) { m.width = miniImg.width; m.height = miniImg.height; }
  const c = m.getContext('2d'), s = m.width / WPX; c.drawImage(miniImg, 0, 0); c.strokeStyle = '#141414'; c.lineWidth = 3; c.strokeRect(Math.max(1, cam.x * s), Math.max(1, cam.y * s), Math.min(m.width - 2, VW() * s), Math.min(m.height - 2, VH() * s)); c.strokeStyle = '#F6F4EF'; c.lineWidth = 1.5; c.strokeRect(Math.max(1, cam.x * s), Math.max(1, cam.y * s), Math.min(m.width - 2, VW() * s), Math.min(m.height - 2, VH() * s)); }
function layoutFull() { const full = document.getElementById('town-full'); if (!full) return; const hd = document.querySelector('header'), nav = document.getElementById('main-nav');
  full.style.top = Math.max(0, hd ? hd.getBoundingClientRect().bottom : 0) + 'px'; full.style.bottom = (nav && !nav.classList.contains('hidden') ? Math.max(0, window.innerHeight - nav.getBoundingClientRect().top) : 0) + 'px'; }
function setup() {
  layoutFull(); W = Math.max(200, Math.floor(cv.clientWidth)); H = Math.max(200, Math.floor(cv.clientHeight)); const nd2 = Math.min(2, window.devicePixelRatio || 1), nk = Math.round(Math.max(26, Math.min(34, W / 13)));
  if (nk !== K || nd2 !== dpr) { K = T = nk; dpr = nd2; OY = 3.8 * K; WPX = Math.round(WX * K); HPX = Math.round(OY + WY * TILT * K); pillCache.clear(); spritesDirty = true; ground = null; if (cam.init) cam.init = false; }
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx = cv.getContext('2d');
  if (!cam.init) { cam.init = true; focusOn(HQ.cx, HQ.cy, 1, true); } clampCam();
  hour = syncClock(); dark = darkness(hour); warm = warmth(hour); const nl = dark > 0.15, nh = nl && !atWork(hour); if (nl !== LIT || nh !== HOMELIT) { LIT = nl; HOMELIT = nh; spritesDirty = true; } clockT = 30; updateOverlay();
  const pts = new Map(); let pinch = null;
  const rel = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const pinchState = () => { const [a, b2] = [...pts.values()]; return { d: Math.hypot(a[0] - b2[0], a[1] - b2[1]) || 1, mx: (a[0] + b2[0]) / 2, my: (a[1] + b2[1]) / 2 }; };
  cv.onpointerdown = e => { try { cv.setPointerCapture(e.pointerId); } catch (_) {} pts.set(e.pointerId, rel(e)); cam.vx = cam.vy = 0; cam.tx = cam.ty = null;
    if (pts.size === 2) { pinch = { ...pinchState(), z: ZM }; if (drag) drag.moved = true; return; }
    if (pts.size === 1) drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), moved: false }; };
  cv.onpointermove = e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, rel(e));
    if (pinch && pts.size >= 2) { const p2 = pinchState(); zoomAt(pinch.z * p2.d / pinch.d, p2.mx, p2.my); cam.x -= (p2.mx - pinch.mx) / ZM; cam.y -= (p2.my - pinch.my) / ZM; pinch.mx = p2.mx; pinch.my = p2.my; clampCam(); camMoved = true; return; }
    if (!drag || drag.id !== e.pointerId) return; const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly, now = performance.now(), dtm = Math.max(1, now - drag.lt) / 1000;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 7) drag.moved = true;
    if (drag.moved) { cam.x -= dx / ZM; cam.y -= dy / ZM; clampCam(); cam.vx = cam.vx * 0.6 + dx / ZM / dtm * 0.4; cam.vy = cam.vy * 0.6 + dy / ZM / dtm * 0.4; camMoved = true; }
    drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = now; };
  cv.onpointerup = cv.onpointercancel = e => { pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) { pinch = null; drag = null; cam.vx = cam.vy = 0; } return; }
    if (!drag || drag.id !== e.pointerId) return; const d = drag; drag = null; if (performance.now() - d.lt > 90) { cam.vx = cam.vy = 0; }
    if (!d.moved && e.type === 'pointerup') { const [x, y] = rel(e), h = hit(x, y); if (h === 'hq') openHQ(); else if (h === 'dock') openDock(); else if (h === 'ai') { if (window.openGatepostAI) window.openGatepostAI(); } else if (h !== null && h >= 0) openBot(h); } };
  cv.onwheel = e => { e.preventDefault(); const [x, y] = rel(e), k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1, dy = e.deltaY * k;
    const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey || mouseWheel) { zoomAt(ZM * Math.exp(-dy * (e.ctrlKey && !mouseWheel ? 0.012 : 0.0018)), x, y); }
    else { cam.x += (e.shiftKey && !e.deltaX ? dy : e.deltaX * k) / ZM; if (!e.shiftKey) cam.y += dy / ZM; }
    cam.tx = cam.ty = null; clampCam(); camMoved = true; };
  const m = document.getElementById('town-mini'); if (m) { const go = e => { const r = m.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height; cam.tx = fx * WPX - VW() / 2; cam.ty = fy * HPX - VH() / 2; cam.vx = cam.vy = 0; camMoved = true; };
    m.onpointerdown = e => { m.setPointerCapture(e.pointerId); m._d = 1; go(e); }; m.onpointermove = e => { if (m._d) go(e); }; m.onpointerup = m.onpointercancel = () => { m._d = 0; }; }
}
function zoomAt(z, sx, sy) { z = Math.max(ZMIN, Math.min(ZMAX, z)); if (z === ZM) return; const wx = sx / ZM + cam.x, wy = sy / ZM + cam.y; ZM = z; cam.x = wx - sx / ZM; cam.y = wy - sy / ZM; clampCam(); camMoved = true; }
window.townZoomLevel = () => ZM;
window.townZoom = f => { cam.tx = cam.ty = null; zoomAt(ZM * f, W / 2, H / 2); };
function hit(sx, sy) {
  const x = sx / ZM + cam.x, y = sy / ZM + cam.y, u = K / 12;
  for (const ch of chars) { if (ch.where === 'home' && !ch.walking) continue; const [X, Y] = S3(ch.x, ch.y, 0); if (Math.abs(x - X) < 5 * u && y < Y + 3 * u && y > Y - 16 * u) return ch.i; }
  for (const l of LABELRECTS) if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) return l.tap;
  const cand = SPRITES.filter(s => s.tap !== null && s.tap !== undefined && x >= s.x + s.w * 0.08 && x <= s.x + s.w * 0.92 && y >= s.y + s.h * 0.06 && y <= s.y + s.h).sort((a, b) => b.key - a.key);
  if (cand.length) return cand[0].tap;
  const wx = x / K, wy = (y - OY) / (K * TILT); if (wy > shoreY(wx) - 0.4) return 'dock';
  return null;
}
function updateOverlay() {
  const el = document.getElementById('town-clock'); if (el) el.textContent = `${clockLabel(denverHour())} · ${atWork(denverHour()) ? 'Work hours' : 'After hours'}`;
  const tk = document.getElementById('town-ticker'); if (tk) tk.innerHTML = ACTS.length ? ACTS.slice(0, 3).map(a => `<div class="tk-row"><span class="tk-t">${esc(hm(a.created_at))}</span><b>${esc((BOTS.find(b => b.name === a.bot) || { short: a.bot }).short)}</b> ${esc(a.body)}</div>`).join('') : '<div class="tk-row muted">No bot activity logged yet.</div>';
}

// ---------- boards (bot_boards: published by the bots, admins read) ----------
const KNOWN = { 'Gatepost': ['follow_ups_due', 'todays_jobs'], 'Gatepost Leads': ['nextdoor_replies', 'lead_tally'], 'Gatepost Bids': ['quote_clock', 'waiting_on_christian'], 'Gatepost Tasks': ['promised_followups'], 'Gatepost App': [] };
const TITLES = { follow_ups_due: 'Follow-ups due', todays_jobs: 'Today\u2019s jobs', nextdoor_replies: 'Nextdoor replies waiting', lead_tally: 'Lead tally', quote_clock: 'Quote clock', waiting_on_christian: 'Waiting on Christian', promised_followups: 'Promised follow-ups' };
const shortOf = bot => (BOTS.find(b => b.name === bot) || { short: bot }).short;
function block(bot, key, inner) { const b = board(bot, key);
  return `<div class="tboard"><div class="tb-h"><b>${esc(TITLES[key] || key.replace(/_/g, ' '))}</b><span class="muted">${b ? 'updated ' + esc(ago(b.updated_at)) : ''}</span></div>${b ? inner(b) : `<p class="muted tb-empty">Waiting for ${esc(bot)} to publish.</p>`}</div>`; }
const emptyRow = t => `<p class="muted tb-empty">${esc(t)}</p>`;
const v = x => (x === null || x === undefined) ? '' : String(x);
const sinceTxt = s => { if (!s) return ''; const d = Date.parse(s); return isNaN(d) ? v(s) : /^\d{4}-\d{2}-\d{2}$/.test(s) ? dayName(s) : ago(s); };
function followApproved(it) { return reqs().some(r => r.board === 'follow_ups_due' && r.boardItem && r.boardItem.who === it.who && v(r.boardItem.sent) === v(it.sent)); }
const RENDER = {
  follow_ups_due: (bot) => block(bot, 'follow_ups_due', b => { const it = bItems(b); return it.length ? `<ul class="tb-list">${it.map((x, k) => `<li><div><b>${esc(v(x.who))}</b>${x.channel ? ` <span class="tb-tag">${esc(v(x.channel))}</span>` : ''}<div class="muted">Sent ${esc(x.sent ? sinceTxt(v(x.sent)) : '?')}${x.days !== undefined && x.days !== null ? ` · ${esc(v(x.days))} day${+x.days === 1 ? '' : 's'}` : ''}</div></div>${followApproved(x) ? '<span class="tb-ok">Approved ✓</span>' : `<button class="ok tb-btn" onclick="townApprove(${k})">Approve</button>`}</li>`).join('')}</ul>` : emptyRow('No follow-ups due.'); }),
  todays_jobs: (bot) => block(bot, 'todays_jobs', b => { const it = bItems(b); return it.length ? `<ul class="tb-list">${it.map(x => `<li><div><b>${esc(v(x.address))}</b><div class="muted">${[x.time, x.price].filter(Boolean).map(s => esc(v(s))).join(' · ')}</div></div>${x.phone ? `<a class="tb-btn secondary" href="tel:${esc(v(x.phone).replace(/[^0-9+]/g, ''))}">Call</a>` : ''}</li>`).join('')}</ul>` : emptyRow('No jobs today.'); }),
  nextdoor_replies: (bot) => block(bot, 'nextdoor_replies', b => { const it = bItems(b); return `<div class="tb-count"><b>${it.length}</b><span class="muted">waiting for a reply</span></div>` + (it.length ? `<ul class="tb-list">${it.map(x => `<li><div><b>${esc(v(x.name))}</b><div class="muted">Waiting since ${esc(sinceTxt(v(x.waiting_since)))}</div></div></li>`).join('')}</ul>` : ''); }),
  lead_tally: (bot) => block(bot, 'lead_tally', b => { const p = b.payload || {}, s = +p.sent_today || 0, g = +p.goal || 0, holds = Array.isArray(p.stale_holds) ? p.stale_holds : [];
    return `<div class="tb-count"><b>${s}${g ? ` / ${g}` : ''}</b><span class="muted">sent today${g ? '' : ' (no goal set)'}</span></div>${g ? `<div class="tb-bar"><i style="width:${Math.min(100, Math.round(s / g * 100))}%"></i></div>` : ''}
      <div class="muted" style="margin-top:8px">Stale holds: ${holds.length}</div>${holds.length ? `<ul class="tb-list">${holds.map(x => `<li><div><b>${esc(v(x.name))}</b><div class="muted">Held since ${esc(sinceTxt(v(x.held_since)))}</div></div></li>`).join('')}</ul>` : ''}`; }),
  quote_clock: (bot) => block(bot, 'quote_clock', b => { const it = bItems(b).map(x => ({ ...x, dl: daysLeft(x.expires) })).sort((a, b2) => (a.dl === null ? 1e9 : a.dl) - (b2.dl === null ? 1e9 : b2.dl));
    return it.length ? `<ul class="tb-list">${it.map(x => `<li class="${x.dl !== null && x.dl <= 7 ? 'flag' : ''}"><div><b>${esc(v(x.street))}</b><div class="muted">${esc(v(x.total))}${x.expires ? ' · expires ' + esc(dayName(asDay(x.expires)) || v(x.expires)) : ''}</div></div><span class="tb-days">${x.dl === null ? '?' : x.dl < 0 ? 'Expired' : x.dl === 0 ? 'Today' : x.dl + ' d left'}</span></li>`).join('')}</ul>` : emptyRow('No open quotes.'); }),
  waiting_on_christian: (bot) => block(bot, 'waiting_on_christian', b => { const it = bItems(b); return it.length ? `<ul class="tb-list">${it.map(x => `<li><div><b>${esc(v(x.quote || x.what || x.title))}</b><div class="muted">Needs: ${esc(v(x.needs))}</div></div></li>`).join('')}</ul>` : emptyRow('Nothing waiting on you.'); }),
  promised_followups: (bot) => block(bot, 'promised_followups', b => { const g = promisedByDay(), ks = Object.keys(g).sort(); return ks.length ? ks.map(k => `<div class="tb-day">${esc(k === 'undated' ? 'No date' : dayName(k))}${k !== 'undated' && k < today() ? ' <span class="tb-tag red">overdue</span>' : ''}</div><ul class="tb-list">${g[k].map(x => `<li><div><b>${esc(v(x.what))}</b><div class="muted">${esc(v(x.owner))}</div></div></li>`).join('')}</ul>`).join('') : emptyRow('No promises logged.'); }),
};
function genericBlock(b) { return `<div class="tboard"><div class="tb-h"><b>${esc(b.board_key.replace(/_/g, ' '))}</b><span class="muted">updated ${esc(ago(b.updated_at))}</span></div>${(() => { const it = bItems(b); const rows = it.length ? it : [b.payload]; return `<ul class="tb-list">${rows.slice(0, 30).map(x => `<li><div>${x && typeof x === 'object' ? Object.entries(x).map(([k2, val]) => `<span class="muted">${esc(k2)}:</span> ${esc(typeof val === 'object' ? JSON.stringify(val) : v(val))}`).join('<br>') : esc(v(x))}</div></li>`).join('')}</ul>`; })()}</div>`; }
function boardsHtml(bot) { const keys = KNOWN[bot] || [], extra = BOARDS.filter(b => b.bot === bot && !keys.includes(b.board_key));
  return (keys.map(k => RENDER[k](bot)).join('') + extra.map(genericBlock).join('')) || `<p class="muted tb-empty">${esc(bot)} hasn\u2019t published any boards yet.</p>`; }
function promisedByDay() { const g = {}; bItems(board('Gatepost Tasks', 'promised_followups')).forEach(x => { const k = asDay(x.due) || 'undated'; (g[k] = g[k] || []).push(x); }); return g; }
function waitingQueue() {
  const q = [];
  bItems(board('Gatepost', 'todays_jobs')).forEach(x => q.push({ top: 1, icon: '🧰', title: 'Today\u2019s job: ' + v(x.address), sub: [x.time, x.price].filter(Boolean).map(v).join(' · '), phone: x.phone }));
  reqs().filter(r => r.status === 'pending').forEach(r => q.push({ at: r.createdAt, icon: '✅', title: (r.title || '').trim() || r.text, sub: 'Request · ' + shortOf(r.from || '') + ' · ' + ago(r.createdAt), id: r.id }));
  BOARDS.filter(b => b.board_key === 'waiting_on_christian').forEach(b => bItems(b).forEach(x => { const at = x.since && !isNaN(Date.parse(x.since)) ? x.since : b.updated_at; q.push({ at, icon: '⏳', title: v(x.quote || x.what || x.title), sub: `${shortOf(b.bot)} needs: ${v(x.needs)} · ${ago(at)}` }); }));
  return q.sort((a, b) => (b.top || 0) - (a.top || 0) || (Date.parse(a.at || 0) - Date.parse(b.at || 0)));
}
window.townApprove = async k => { const it = bItems(board('Gatepost', 'follow_ups_due'))[k]; if (!it) return;
  const title = `Follow up with ${v(it.who)}${it.channel ? ' by ' + v(it.channel) : ''}`;
  const { error } = await sb.rpc('approve_board_item', { p_bot: 'Gatepost', p_board_key: 'follow_ups_due', p_title: title, p_item: it });
  if (error) { alert(error.message); return; } await API.refresh(); render(); };

// ---------- page ----------
window.townPage = () => { ADMIN = typeof isAdmin === 'function' && isAdmin();
  const chips = BOTS.map((bt, i) => { const s = ADMIN ? stats(bt.name) : null, u = ADMIN ? unread(bt.name) : 0;
    return `<button class="town-chip" onclick="townChip(${i})"><span class="dot" style="background:${bt.color}"></span>${esc(bt.short)}${s && s.pending ? ` <b>${s.pending}</b>` : ''}${u ? ` <b class="chat">${u}</b>` : ''}</button>`; }).join('');
  return `<div class="town-full" id="town-full"><canvas id="town-canvas" role="img" aria-label="Gatepost town map. Drag to look around; tap a building, a bot, HQ or the harbor."></canvas>
  <div class="town-top"><div class="town-title"><b>Gatepost Town</b><span id="town-clock"></span></div>${ADMIN ? '<div class="town-ticker" id="town-ticker"></div>' : ''}</div>
  <div class="town-tools"><canvas id="town-mini" aria-label="Minimap: tap to jump"></canvas><button class="town-btn" onclick="townZoom(1.25)" aria-label="Zoom in" title="Zoom in">+</button><button class="town-btn" onclick="townZoom(0.8)" aria-label="Zoom out" title="Zoom out">−</button><button class="town-btn" onclick="townCenter()" aria-label="Center on HQ" title="Center on HQ">⌂</button></div>
  <div class="town-legend"><button class="town-chip hq" onclick="townChip('hq')"><span class="dot" style="background:#F6F4EF"></span>HQ</button>${chips}<button class="town-chip" onclick="townChip('dock')"><span class="dot" style="background:#6f9aac"></span>Harbor</button></div></div>`; };
window.townCenter = () => focusOn(HQ.cx, HQ.cy, 1);
window.focusOn = focusOn;
window.townChip = t => { if (t === 'hq') { focusOn(HQ.cx, HQ.cy, 1); openHQ(); } else if (t === 'dock') { focusOn(PIER.x0 - 1, 39.5, 0); openDock(); } else { const b = BOTS[t].b; focusOn(b.cx, b.cy, 1); openBot(t); } };

// ---------- sheets ----------
window.openBot = i => { OPEN = { kind: 'bot', i, tab: ADMIN ? (unread(BOTS[i].name) && !stats(BOTS[i].name).pending ? 'chat' : 'requests') : 'about' }; renderSheet(true); if (OPEN.tab === 'chat') markRead(BOTS[i].name); };
window.openHQ = () => { OPEN = { kind: 'hq' }; renderSheet(true); };
window.openDock = () => { OPEN = { kind: 'dock' }; renderSheet(true); };
window.closeBot = () => { OPEN = null; document.getElementById('bot-sheet')?.remove(); if (!document.getElementById('req-sheet')) document.body.classList.remove('sheet-open'); };
window.townTab = tab => { if (!OPEN) return; OPEN.tab = tab; renderSheet(false); if (tab === 'chat') { markRead(BOTS[OPEN.i].name); setTimeout(() => { const l = document.querySelector('.chat-log'); if (l) l.scrollTop = l.scrollHeight; }, 0); } };
window.townGo = (pageName, filter) => { closeBot(); document.querySelector(`.nav button[data-page="${pageName}"]`)?.click(); if (filter) { REQ_FILTER = filter; render(); } window.scrollTo(0, 0); };
window.townDecide = async (id, status) => { if (await API.updateRequest(id, { status })) render(); };
window.townModify = id => { openReq(id); REQ_EDIT = true; renderReqDetail(false); };
async function markRead(name) { const ids = MSGS.filter(m => m.bot === name && m.sender === 'bot' && !m.read_at).map(m => m.id); if (!ids.length) return;
  const now = new Date().toISOString(); MSGS.forEach(m => { if (ids.includes(m.id)) m.read_at = now; });
  await sb.from('bot_messages').update({ read_at: now }).in('id', ids); }
window.townSend = async () => { const ta = document.getElementById('chat-text'); const body = (ta?.value || '').trim(); if (!body || !OPEN) return;
  const btn = document.getElementById('chat-send'); if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  const { error } = await sb.from('bot_messages').insert({ bot: BOTS[OPEN.i].name, sender: 'admin', author: S.me.email, body });
  if (error) { alert(error.message); if (btn) { btn.disabled = false; btn.textContent = 'Send'; } return; }
  if (ta) ta.value = ''; await loadChat(); renderSheet(false); setTimeout(() => { const l = document.querySelector('.chat-log'); if (l) l.scrollTop = l.scrollHeight; document.getElementById('chat-text')?.focus(); }, 0); };
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
function reqRow(r) {
  return `<div class="item req-card town-req"><div class="req-top" onclick="openReq(${Number(r.id)})"><span class="badge ${esc(r.status)}">${esc(r.status)}</span>${(r.notes || []).length ? ` <span class="muted">· ${r.notes.length} note${r.notes.length > 1 ? 's' : ''}</span>` : ''}<span class="chev">›</span></div>
    <div class="req-title" onclick="openReq(${Number(r.id)})">${esc((r.title || '').trim() || r.text)}</div>
    ${r.amount || r.when ? `<div class="req-meta">${r.amount ? `<span>${esc(r.amount)}</span>` : ''}${r.when ? `<span>${esc(r.when)}</span>` : ''}</div>` : ''}
    ${r.status === 'pending' ? `<div class="mini-actions"><button class="ok" onclick="townDecide(${Number(r.id)},'approved')">Approve</button><button class="danger" onclick="townDecide(${Number(r.id)},'denied')">Decline</button><button class="secondary" onclick="townModify(${Number(r.id)})">Modify</button></div>` : ''}</div>`;
}
function calendarHtml() { const ev = eventsInfo(), row = e => `<li><div><b>${esc(e.title || '(untitled)')}</b><div class="muted">${esc(evWhen(e))}${ADMIN && e.location ? ' · ' + esc(e.location) : ''}</div></div></li>`;
  return `<div class="tboard"><div class="tb-h"><b>Calendar</b><span class="muted">${esc(dayName(today()))}</span></div>${ev.todays.length ? `<ul class="tb-list">${ev.todays.map(row).join('')}</ul>` : emptyRow('Nothing on the calendar today.')}
    <div class="tb-day">Next up</div>${ev.next ? `<ul class="tb-list">${row(ev.next)}</ul>` : emptyRow('Nothing scheduled yet.')}</div>`; }
function dockSheetHtml() {
  const st = { docked: ship.cargo ? `Loading ${ship.cargo} item${ship.cargo > 1 ? 's' : ''}, about to sail` : 'Docked at the pier', leaving: 'Sailing out', away: 'At sea, back soon', returning: 'Sailing back to port' }[ship.state];
  const sends = ADMIN ? ACTS.filter(a => SEND_RE.test(a.body || '') && !/^Approved by Christian/.test(a.body || '')).slice(0, 8) : [];
  return `<div class="sheet-head"><button class="sheet-back" onclick="closeBot()" aria-label="Back">‹ Town</button><span class="badge">Harbor</span></div>
  <div class="sheet-body"><div class="bot-hero"><span class="hq-ava" style="font-size:1.6rem">⛵</span><div><h2 class="sheet-title" style="margin:0">The Harbor</h2><div class="muted">Where the bots send things out</div></div></div>
  <dl class="facts"><dt>Ship</dt><dd>${esc(st)}</dd>${pierCrates.length ? `<dt>On the pier</dt><dd>${pierCrates.length} waiting</dd>` : ''}${ADMIN ? `<dt>Sent today</dt><dd>${sentToday()}</dd>` : ''}</dl>
  ${ADMIN ? `<h3>Recently sent (from bot activity)</h3>${sends.length ? `<ol class="timeline">${sends.map(a => `<li><span class="tl-ico">✉</span><div><div>${esc(a.body)}</div><div class="muted">${esc(a.bot)} · ${esc(when(a.created_at))}</div></div></li>`).join('')}</ol>` : '<p class="muted">Nothing logged as sent yet. When a bot logs that it sent an email, text or follow-up, it runs it down to the ship.</p>'}` : ''}
  <p class="muted" style="font-size:.74rem;margin-top:14px;">The ship sails off whenever a bot drops something at the pier and comes back a little later.</p></div>`;
}
function renderSheet(animate) {
  const prev = document.getElementById('bot-sheet'), sc = prev?.querySelector('.sheet-body')?.scrollTop || 0, draft = document.getElementById('chat-text')?.value; prev?.remove(); if (!OPEN) return;
  ADMIN = typeof isAdmin === 'function' && isAdmin();
  const el = document.createElement('div'); el.id = 'bot-sheet'; el.className = 'sheet' + (animate ? ' anim' : '') + (document.getElementById('town-full') ? ' town-sheet' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  if (OPEN.kind === 'dock') { el.innerHTML = dockSheetHtml(); }
  else if (OPEN.kind === 'hq') {
    const up = (S.events || []).filter(e => (e.date || '') >= today()).length, pend = reqs().filter(r => r.status === 'pending').length, waiting = (S.users || []).filter(u => u.role === 'pending').length;
    const row = (icon, title, sub, onclick, n) => `<button class="hq-row" onclick="${onclick}"><span class="hq-ico">${icon}</span><span class="hq-txt"><b>${esc(title)}</b><span class="muted">${esc(sub)}</span></span>${n ? `<span class="hq-n">${n}</span>` : ''}<span class="chev">›</span></button>`;
    const q = ADMIN ? waitingQueue() : [];
    const queue = ADMIN ? `<div class="tboard"><div class="tb-h"><b>Waiting on Christian</b><span class="muted">${q.filter(x => !x.top).length} open</span></div>${q.length ? `<ul class="tb-list">${q.map(x => `<li${x.id ? ` class="tap" onclick="openReq(${Number(x.id)})"` : ''}><span class="tb-ico">${x.icon}</span><div><b>${esc(x.title)}</b><div class="muted">${esc(x.sub || '')}</div></div>${x.phone ? `<a class="tb-btn secondary" href="tel:${esc(v(x.phone).replace(/[^0-9+]/g, ''))}" onclick="event.stopPropagation()">Call</a>` : x.id ? '<span class="chev">›</span>' : ''}</li>`).join('')}</ul>` : emptyRow('Nothing is waiting on you.')}
      ${!board('Gatepost', 'todays_jobs') ? '<p class="muted tb-empty" style="margin-top:4px">Today\u2019s jobs: waiting for Gatepost to publish.</p>' : ''}${!BOARDS.some(b => b.board_key === 'waiting_on_christian') ? '<p class="muted tb-empty" style="margin-top:2px">Bot waiting lists: none published yet.</p>' : ''}</div>` : '';
    el.innerHTML = `<div class="sheet-head"><button class="sheet-back" onclick="closeBot()" aria-label="Back">‹ Town</button><span class="badge">HQ</span></div>
    <div class="sheet-body"><div class="bot-hero"><span class="hq-ava"><img src="arch-mark.png" alt=""></span><div><h2 class="sheet-title" style="margin:0">${ADMIN ? 'Christian\u2019s HQ' : 'Gatepost HQ'}</h2><div class="muted">${ADMIN ? 'Run the business from here.' : 'Schedule and your account.'}</div></div></div>
      ${ADMIN ? RENDER.todays_jobs('Gatepost') : ''}${queue}${calendarHtml()}${ADMIN ? RENDER.promised_followups('Gatepost Tasks') : ''}
      <div class="hq-list">${row('📅', 'Calendar', up ? `${up} upcoming` : 'Schedule and jobs', "townGo('calendar')")}
      ${ADMIN ? row('✅', 'All requests', pend ? `${pend} waiting on you` : 'Nothing waiting', "townGo('requests')", pend) : ''}
      ${ADMIN ? row('👥', 'Team', waiting ? `${waiting} waiting for access` : 'Roles and access', "townGo('admin')", waiting) : ''}
      ${ADMIN ? row('🧮', 'Estimates', 'Pricing calculator', "townGo('estimate')") : ''}
      ${row('⚙️', ADMIN ? 'Settings & account' : 'My info & settings', S.me ? S.me.email : '', "townGo('dashboard')")}</div></div>`;
  } else {
    const bt = BOTS[OPEN.i], ch = chars[OPEN.i], s = stats(bt.name), h = denverHour(), u = unread(bt.name), idle = isIdle(OPEN.i), la = lastActive(bt.name);
    const where = ch.errand ? (ch.carry ? `Running a ${ITEM_NAME[ch.carry]} to ${targetName(ch.errand.target)}` : ch.errand.item === 'pickup' ? `Picking up your message at ${targetName(ch.errand.target)}` : `Heading back to the ${bt.place}`) + (ch.errand.real && ch.errand.label ? ` (${ch.errand.label})` : '') : ch.walking ? (ch.where === 'home' ? 'Walking home' : `Walking to the ${bt.place}`) : ch.where === 'home' ? 'At home' : idle ? `Idle at the ${bt.place}` : `At the ${bt.place}`;
    const line = ch.where === 'home' && !ch.walking ? 'Off the clock until 7 AM. Snoozing at home.' : bt.work;
    let body = '';
    if (!ADMIN) body = `<p class="sheet-text">${esc(line)}</p><dl class="facts"><dt>Job</dt><dd>${esc(bt.role)}</dd><dt>Right now</dt><dd>${esc(where)} · ${esc(clockLabel(h))}</dd></dl>`;
    else {
      const nb = BOARDS.filter(b => b.bot === bt.name).length;
      const tabs = `<div class="town-tabs"><button class="${OPEN.tab === 'requests' ? 'on' : ''}" onclick="townTab('requests')">Requests${s.pending ? ` <b>${s.pending}</b>` : ''}</button><button class="${OPEN.tab === 'board' ? 'on' : ''}" onclick="townTab('board')">Board${nb ? ` <i>${nb}</i>` : ''}</button><button class="${OPEN.tab === 'chat' ? 'on' : ''}" onclick="townTab('chat')">Chat${u ? ` <b class="chat">${u}</b>` : ''}</button><button class="${OPEN.tab === 'activity' ? 'on' : ''}" onclick="townTab('activity')">Activity</button></div>`;
      const cur = current(bt.name), curHtml = cur ? `<div class="now-card"><span class="muted">In progress</span><b>${esc(cur.body)}</b><span class="muted">ETA ${esc(cur.eta)} · since ${esc(when(cur.created_at))}</span></div>` : '';
      const status = `<dt>Right now</dt><dd>${esc(where)} · ${esc(clockLabel(h))}</dd><dt>Last active</dt><dd>${la ? esc(ago(new Date(la).toISOString())) : 'No activity yet'}${idle ? ' · idle (2 h+)' : ''}</dd><dt>Today</dt><dd>${actsToday(bt.name).length} activity entr${actsToday(bt.name).length === 1 ? 'y' : 'ies'}</dd>`;
      if (OPEN.tab === 'activity') {
        const tl = timeline(bt.name);
        body = tabs + (curHtml || '<p class="muted" style="margin-top:12px;font-size:.82rem;">Nothing in progress right now.</p>') + `<ol class="timeline">${tl.slice(0, 40).map(e => `<li${e.id ? ` onclick="openReq(${Number(e.id)})" class="tap"` : ''}><span class="tl-ico">${esc(e.icon)}</span><div><div>${esc(e.text)}</div><div class="muted">${esc(when(e.at))}${e.sub ? ' · ' + esc(e.sub) : ''}</div></div></li>`).join('') || '<li class="muted">No activity yet.</li>'}</ol>`;
      } else if (OPEN.tab === 'board') {
        body = tabs + `<div style="margin-top:12px">${boardsHtml(bt.name)}</div>`;
      } else if (OPEN.tab === 'chat') {
        const ms = MSGS.filter(m => m.bot === bt.name);
        body = tabs + `<div class="chat-log">${ms.length ? ms.map(m => `<div class="msg ${m.sender}"><div class="bubble">${esc(m.body)}</div><div class="meta">${esc(m.sender === 'bot' ? bt.short + ' bot' : (m.author === S.me.email ? 'You' : m.author))} · ${esc(when(m.created_at))}</div></div>`).join('') : `<p class="muted" style="text-align:center;margin:24px 0;">No messages yet. Say hi to ${esc(bt.name)}.</p>`}</div>
        <p class="muted chat-hint">Bots read this desk and reply with their posting token.</p>`;
      } else {
        const list = s.rs.slice().sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
        body = tabs + curHtml + `<p class="sheet-text" style="margin-top:12px;">${esc(line)} ${s.pending ? `${s.pending} waiting on you.` : s.total ? 'Nothing waiting on you.' : 'No requests from this bot yet.'}</p>
        <dl class="facts">${status}<dt>Decided (7 days)</dt><dd>${s.decided}</dd></dl>
        <div class="town-reqs">${list.slice(0, 12).map(reqRow).join('') || ''}</div>${list.length > 12 ? `<p class="muted">+ ${list.length - 12} more</p>` : ''}`;
      }
    }
    el.innerHTML = `<div class="sheet-head"><button class="sheet-back" onclick="closeBot()" aria-label="Back">‹ Town</button><span class="badge" style="border-color:${bt.color};color:${bt.color === '#2b2b2b' ? 'var(--paper)' : bt.color};white-space:nowrap">${esc(bt.place)}</span></div>
    <div class="sheet-body"><div class="bot-hero"><span class="bot-ava" style="background:${bt.color}"><i></i></span><div><h2 class="sheet-title" style="margin:0">${esc(bt.name)}</h2><div class="muted">${esc(bt.role)}</div></div></div>${body}</div>
    ${ADMIN && OPEN.tab === 'chat' ? `<div class="sheet-actions chat-compose"><textarea id="chat-text" rows="1" placeholder="Message ${esc(bt.short)}…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();townSend()}"></textarea><button class="primary" id="chat-send" onclick="townSend()">Send</button></div>`
      : ADMIN && OPEN.tab === 'requests' ? `<div class="sheet-actions"><button class="secondary" onclick="townGo('requests', '${esc(bt.name)}')">Open in Requests${s.total ? ` (${s.total})` : ''}</button></div>` : ''}`;
  }
  const nav = document.getElementById('main-nav'); if (nav && !nav.classList.contains('hidden')) el.style.bottom = nav.getBoundingClientRect().height + 'px';
  document.body.insertBefore(el, document.getElementById('req-sheet')); document.body.classList.add('sheet-open');
  const b = el.querySelector('.sheet-body'); if (!animate && sc && b) b.scrollTop = sc;
  if (draft) { const ta = document.getElementById('chat-text'); if (ta) ta.value = draft; }
  const log = el.querySelector('.chat-log'); if (log && animate) log.scrollTop = log.scrollHeight;
}
window.townAfterRender = () => {
  ADMIN = typeof isAdmin === 'function' && isAdmin();
  if (ADMIN) diffRequests();
  if (ADMIN) queueChat(); else { MSGS = []; ACTS = []; BOARDS = []; }
  const el = document.getElementById('town-canvas');
  if (!el) { document.body.classList.remove('town-mode'); stop(); cv = null; if (OPEN && !document.getElementById('req-sheet')) closeBot(); return; }
  document.body.classList.add('town-mode'); if (window.scrollY) window.scrollTo(0, 0);
  if (el !== cv) { cv = el; setup(); }
  if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
  if (OPEN && !(document.activeElement && document.activeElement.id === 'chat-text')) renderSheet(false);
};
window.addEventListener('resize', () => { if (cv && cv.isConnected) setup(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && cv && cv.isConnected && !raf) { last = 0; raf = requestAnimationFrame(loop); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && OPEN && !document.getElementById('req-sheet')) closeBot(); });
})();
