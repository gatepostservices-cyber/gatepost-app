// Gatepost AI Grid (town v4): a pannable 2.5D neon city. Buildings = bots; HQ = Christian's hub; a drone launch pad; the AI core.
// Everything shown comes from real data (requests, calendar, bot_activity, bot_messages, bot_boards). Admin-only data stays admin-only.
(() => {
const TZ = 'America/Denver';
// Night palette: Gatepost ink/cream (brand) + neon accents
const C = { ink: '#05080f', cream: '#F6F4EF', paper: '#18212f', wall: '#121a27', wall2: '#1a2433', stone: '#222c3c', lit: '#5ff3ff', door: '#0a111c', red: '#ff4d6d', tan: '#f2c96b', sage: '#3ddc97', slate: '#7aa7ff', tree: '#1b6f7a', tree2: '#0e3e4a', tree3: '#7ff7ff', dirt: '#0f2236', dirt2: '#163a55', g1: '#0a111d', g2: '#070c16', g3: '#0c1422', neon: '#5ff3ff' };
const NEON = 'rgba(95,243,255,', GOLD = 'rgba(242,201,107,';
const BOTS = [
  { name: 'Gatepost', short: 'Gatepost', role: 'Office admin: bids, calendar and cash', color: '#5ff3ff', place: 'Command Hall', glyph: '$', type: 'hall', at: [34, 22], work: 'At the town hall, keeping the calendar and the cash straight.' },
  { name: 'Gatepost Leads', short: 'Leads', role: 'Lead finder: Nextdoor, Facebook and Craigslist', color: C.sage, place: 'Signal Tower', glyph: '!', type: 'tower', at: [14, 15], work: 'Up in the lookout tower, scanning the neighborhood for leads.' },
  { name: 'Gatepost Bids', short: 'Bids', role: 'Bids and OneDrive filing', color: C.tan, place: 'Bid Lab', glyph: '✎', type: 'shop', at: [60, 18], work: 'In the drafting office, filing bids in the cabinets.' },
  { name: 'Gatepost Tasks', short: 'Tasks', role: 'Christian\u2019s to-do list', color: '#ff8a3d', place: 'Task Board', glyph: '✓', type: 'kiosk', at: [16, 50], work: 'At the notice board, pinning up to-dos.' },
  { name: 'Gatepost App', short: 'App', role: 'Builds and maintains this app', color: C.slate, place: 'Dev Forge', glyph: '</>', type: 'garage', at: [74, 52], work: 'In the tech garage, tinkering with the app.' },
];
const HOME_AT = [[28.5, 15.5], [8.5, 21.5], [66.5, 24.5], [10.5, 56.5], [80.5, 58.5]];
const WX = 96, WY = 92, TILT = 0.62, ZK = 0.82;
let ADMIN = false;

// ---------- seeded layout (fixed seed: identical on every device and reload) ----------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = mulberry32(0x6A7E2026), rr = (a, b) => a + R() * (b - a), rsign = () => (R() < 0.5 ? -1 : 1);
const SIZES = { hall: [5.0, 3.4], tower: [2.6, 2.6], shop: [4.0, 3.0], kiosk: [3.4, 1.4], garage: [4.2, 3.2], hq: [5.4, 3.8], home: [2.6, 2.0] };
function mkB(type, at, extra) { const s = rr(0.92, 1.1), [w, d] = SIZES[type]; return Object.assign({ type, cx: at[0] + rr(-0.5, 0.5), cy: at[1] + rr(-0.5, 0.5), rot: rsign() * rr(0.17, 0.46), w: w * s, d: d * s, s }, extra || {}); }
BOTS.forEach(bt => { bt.b = mkB(bt.type, bt.at); });
const HQ = mkB('hq', [42, 46]); HQ.rot = rsign() * rr(0.1, 0.22);
const AI = mkB('shop', [84.5, 16]); AI.rot = 0.05; AI.black = true;
BOTS.forEach((bt, i) => { bt.home = mkB('home', HOME_AT[i], { col: bt.color }); });
const loc = (b, lx, ly) => { const c = Math.cos(b.rot), s = Math.sin(b.rot); return [b.cx + lx * c - ly * s, b.cy + lx * s + ly * c]; };
const doorOf = b => loc(b, 0, b.d / 2 + 0.55);
const shoreY = x => 81.2 + Math.sin(x * 0.45 + 1) * 0.55 + Math.sin(x * 1.3) * 0.22;
const PIER = { x0: 45.4, x1: 46.6, y0: 80.4, y1: 86.6 }, DOCK_SPOT = [46, 86.1], SHIP_HOME = 42.8, SHIP_Y = 86.0;

// path network: nodes + winding edges (quadratic curves with seeded bends)
const N = {}; const nd = (k, p) => { N[k] = { k, p, e: [] }; };
BOTS.forEach((bt, i) => nd('w' + i, doorOf(bt.b))); BOTS.forEach((bt, i) => nd('h' + i, doorOf(bt.home))); nd('hq', doorOf(HQ));
[['A', [26, 32]], ['B', [46, 31]], ['C', [66, 31]], ['D', [24, 60]], ['E', [45, 61]], ['F', [67, 63]], ['G', [46, 72]], ['L', [22, 19]]].forEach(([k, p]) => nd(k, [p[0] + rr(-0.4, 0.4), p[1] + rr(-0.4, 0.4)]));
nd('dock', DOCK_SPOT); nd('SP', [52, 38]); nd('P', [46, 80.8]);
const EDGES = [];
function edge(a, b) { const A = N[a].p, B = N[b].p, mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), bend = (a === 'P' || b === 'dock') ? 0 : rsign() * rr(0.1, 0.24) * L;
  const cx = mx - dy / L * bend, cy = my + dx / L * bend, n = Math.max(3, Math.ceil(L / 0.35)), pts = [];
  for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; pts.push([u * u * A[0] + 2 * u * t * cx + t * t * B[0], u * u * A[1] + 2 * u * t * cy + t * t * B[1]]); }
  let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  const e = { a, b, pts, len, main: !/^h/.test(a + b) }; EDGES.push(e); N[a].e.push(e); N[b].e.push(e); }
[['w1', 'L'], ['L', 'A'], ['w0', 'A'], ['A', 'B'], ['B', 'C'], ['w2', 'C'], ['B', 'hq'], ['A', 'D'], ['w3', 'D'], ['D', 'E'], ['hq', 'E'], ['E', 'F'], ['C', 'F'], ['w4', 'F'], ['h0', 'w0'], ['h1', 'w1'], ['h2', 'w2'], ['h3', 'w3'], ['h4', 'w4'], ['B', 'SP'], ['E', 'G'], ['G', 'P'], ['P', 'dock']].forEach(([a, b]) => edge(a, b));
nd('ai', doorOf(AI));
edge('ai', 'C');
const AI_EDGE = EDGES[EDGES.length - 1]; AI_EDGE.faint = true; AI_EDGE.main = false;
function route(from, to) {
  if (from === to) return [N[to].p.slice()];
  const dist = { [from]: 0 }, prev = {}, todo = new Set(Object.keys(N));
  while (todo.size) { let u = null; todo.forEach(k => { if (dist[k] !== undefined && (u === null || dist[k] < dist[u])) u = k; }); if (u === null || u === to) break; todo.delete(u);
    N[u].e.forEach(e => { const v = e.a === u ? e.b : e.a, d = dist[u] + e.len; if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = { u, e }; } }); }
  const legs = []; let k = to; while (prev[k]) { const { u, e } = prev[k]; legs.unshift(e.a === u ? e.pts : e.pts.slice().reverse()); k = u; }
  const out = []; legs.forEach(l => l.forEach((p, j) => { if (j || !out.length) out.push(p.slice()); })); return out;
}
// ---------- districts: each bot gets a neighborhood with a landmark + themed structures ----------
const SPIRE = { x: 52, y: 36 }, CMD_PLAZA = { x: 40, y: 29 }, FOUNTAIN = { x: 50, y: 50 }, PADS = [[38.4, 86.4], [55, 86.4]];
const DISTRICTS = [
  { key: 'cmd', name: 'Command District', short: 'Command', col: '#5ff3ff', bot: 0, R: 10.5, props: [['council', 8, -5], ['ckiosk', 3, 8], ['ckiosk', 9, 6], ['billboard', -7, 6, 'ONE CREW. ONE INVOICE.']] },
  { key: 'leads', name: 'Signal Heights', short: 'Leads', col: '#3ddc97', bot: 1, R: 9.5, props: [['antenna', -5, -6], ['antenna', -7, 3], ['antenna', 5, -6], ['exchange', 6, 4], ['billboard', -1, 8, 'LEAD EXCHANGE']] },
  { key: 'bids', name: 'Blueprint Row', short: 'Bids', col: '#f2c96b', bot: 2, R: 9.5, props: [['workshop', -7, 2], ['workshop', -3, -6], ['vault', 7, -4], ['billboard', 4, 8, 'ESTIMATE VAULT']] },
  { key: 'tasks', name: 'Dispatch Yard', short: 'Tasks', col: '#ff8a3d', bot: 3, R: 9.5, props: [['depot', 6, 4], ['ckiosk', -5, -3], ['ckiosk', -6, 2], ['ckiosk', 3, -6], ['billboard', 5, -1.5, 'DISPATCH']] },
  { key: 'app', name: 'Forge Quarter', short: 'App', col: '#7aa7ff', bot: 4, R: 10, props: [['server', -6, -5], ['server', -2, -7], ['server', 6, -5], ['fab', 7, 3], ['billboard', -7, 3, 'DEV FORGE']] },
  { key: 'hq', name: 'Gatepost Plaza', short: 'HQ', col: '#F6F4EF', bot: 'hq', R: 10, props: [['billboard', 8, -5, 'GATEPOST PROPERTY SERVICES']] },
  { key: 'ai', name: 'AI Core Sector', short: 'AI Core', col: '#ff4d6d', bot: 'ai', R: 10.5, props: [['server', -5, 6], ['server', 5, 6]] },
  { key: 'port', name: 'Spaceport', short: 'Spaceport', col: '#b3ff5f', bot: 'dock', at: [46, 76.5], R: 11, props: [['hangar', -8, 0], ['hangar', 8, 0], ['antenna', -12, -3], ['billboard', 0, -4.5, 'LAUNCH PAD']] },
];
const PSZ = { antenna: [1.3, 1.3], exchange: [5, 3.4], workshop: [3.6, 2.6], vault: [2.8, 2.8], depot: [5, 3.2], ckiosk: [1.2, 0.9], council: [3, 3], server: [3.2, 1.8], fab: [4.8, 3.4], hangar: [5.8, 3.8], billboard: [3, 0.5] };
const PROPS = [];
DISTRICTS.forEach(d => { const lm = d.bot === 'hq' ? HQ : d.bot === 'ai' ? AI : d.bot === 'dock' ? null : BOTS[d.bot].b; d.lm = lm; const c0 = d.at || [lm.cx, lm.cy]; d.cx = c0[0]; d.cy = c0[1];
  d.tap = d.bot; d.props = d.props.map(([kind, ox, oy, text]) => { const [w, dd] = PSZ[kind], pr = { kind, type: 'prop', cx: d.cx + ox, cy: d.cy + oy, rot: kind === 'billboard' ? 0.06 : rsign() * rr(0.05, 0.3), w, d: dd, dist: d, text }; PROPS.push(pr); return pr; }); });
const districtOf = tap => DISTRICTS.find(d => d.bot === tap);
const AVOID = [[SPIRE.x, SPIRE.y, 5.5], [CMD_PLAZA.x, CMD_PLAZA.y, 3.6], [FOUNTAIN.x, FOUNTAIN.y, 3.2]];
const inAvoid = (x, y, pad) => AVOID.some(([ax, ay, r]) => Math.hypot(ax - x, ay - y) < r + pad);
// sky-rail loop (elevated maglev ring through the districts)
const RAIL = (() => { const c = [[12, 26], [24, 10], [46, 11], [70, 9], [78, 32], [90, 48], [84, 66], [62, 70], [34, 70], [8, 66], [5, 44]], out = [];
  for (let i = 0; i < c.length; i++) { const p0 = c[(i - 1 + c.length) % c.length], p1 = c[i], p2 = c[(i + 1) % c.length], p3 = c[(i + 2) % c.length];
    for (let k = 0; k < 16; k++) { const t = k / 16, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))); } }
  return out; })();
const RAIL_Z = 3.4;
// skybridges between district hubs (elevated data links)
const BRIDGES = [['cmd', 'leads'], ['cmd', 'bids'], ['bids', 'ai'], ['cmd', 'hq'], ['hq', 'tasks'], ['hq', 'app'], ['hq', 'port'], ['app', 'ai']].map(([a, b]) => ({ a: DISTRICTS.find(d => d.key === a), b: DISTRICTS.find(d => d.key === b), pk: [], nt: Math.random() * 4 }));
// terrain: hills, trees, rocks, flowers (rejection sampling against buildings, paths and water)
const ALLB = BOTS.map(b => b.b).concat([HQ, AI], BOTS.map(b => b.home), PROPS);
const nearPath = (x, y, r) => EDGES.some(e => e.pts.some(p => Math.abs(p[0] - x) < r && Math.abs(p[1] - y) < r && Math.hypot(p[0] - x, p[1] - y) < r));
const nearB = (x, y, pad) => ALLB.some(b => Math.hypot(b.cx - x, b.cy - y) < Math.max(b.w, b.d) / 2 + pad) || (x > HQ.cx - 5 && x < HQ.cx - 2.6 && y > HQ.cy && y < HQ.cy + 3);
const inCamp = (x, y) => x > 75.2 && x < 93.8 && y > 7.2 && y < 25.4;
const HILLS = [{ x: 4, y: 34, r: 4 }, { x: 91, y: 40, r: 4.2 }, { x: 30, y: 72, r: 3.2 }, { x: 86, y: 72, r: 3.6 }, { x: 46, y: 5, r: 3.2 }, { x: 4, y: 4, r: 3 }];
const TREES = [], ROCKS = [], FLOWERS = [];
for (let k = 0; k < 3000 && TREES.length < 240; k++) { const x = rr(0.3, WX - 0.3), y = rr(0.6, 79), r = rr(0.42, 0.72);
  if (inCamp(x, y) || inAvoid(x, y, r + 0.6) || y > shoreY(x) - 1.3 || nearB(x, y, 1.1 + r) || nearPath(x, y, 0.95 + r * 0.6) || TREES.some(t => Math.hypot(t.x - x, t.y - y) < t.r + r + 0.15)) continue;
  TREES.push({ x, y, r, pine: R() < 0.34, tone: R() }); }
for (let k = 0; k < 1600 && ROCKS.length < 90; k++) { const x = rr(0.3, WX - 0.3), y = rr(0.6, 82), r = rr(0.14, 0.4);
  if (inCamp(x, y) || inAvoid(x, y, 0.4) || y > shoreY(x) + 0.5 || nearB(x, y, 0.8) || nearPath(x, y, 0.7) || TREES.some(t => Math.hypot(t.x - x, t.y - y) < t.r + 0.3)) continue;
  ROCKS.push({ x, y, r, seed: R() * 99 }); }
for (let k = 0; k < 1400 && FLOWERS.length < 200; k++) { const x = rr(0.3, WX - 0.3), y = rr(0.6, 79); if (inCamp(x, y) || inAvoid(x, y, 0.3) || y > shoreY(x) - 1 || nearB(x, y, 0.5) || nearPath(x, y, 0.6)) continue; FLOWERS.push([x, y, Math.floor(R() * 3)]); }
const LAMPS = [N.A.p, N.B.p, N.C.p, N.D.p, N.E.p, N.F.p, N.G.p, N.L.p].map(p => [p[0] + 0.85, p[1] - 0.25]);
EDGES.forEach(e => { if (!e.main || e.faint || e.b === 'dock') return; for (let k = 8; k < e.pts.length - 6; k += 14) { const a = e.pts[k], b2 = e.pts[k + 1], dx = b2[0] - a[0], dy = b2[1] - a[1], l = Math.hypot(dx, dy) || 1, sd = (k / 14) % 2 ? 1 : -1; LAMPS.push([a[0] - dy / l * 1.15 * sd, a[1] + dx / l * 1.15 * sd]); } });
const LANTERNS = [[PIER.x0 - 0.05, PIER.y0 + 1.8], [PIER.x1 + 0.05, PIER.y0 + 3.3], [PIER.x0 - 0.05, PIER.y0 + 4.7]];
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
function darkness(h) { return 0.2; }
function darknessDay(h) { if (h >= 7 && h < 18) return 0; if (h >= 18 && h < 20.5) return (h - 18) / 2.5 * 0.55; if (h >= 20.5 || h < 5.5) return 0.55; return (7 - h) / 1.5 * 0.55; }
function warmth(h) { return 0; }
function warmthDay(h) { return (h >= 17 && h < 19.5) ? Math.sin((h - 17) / 2.5 * Math.PI) * 0.16 : (h >= 5.5 && h < 7.5) ? Math.sin((h - 5.5) / 2 * Math.PI) * 0.12 : 0; }
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
const ship = { x: SHIP_HOME, state: 'docked', t: 0, cargo: 0, wait: 0, lift: 0.55 };
const pierCrates = [], pops = [];
const ITEM_NAME = { scroll: 'scroll', crate: 'crate', letter: 'letter', pickup: 'message' };
function targetName(t) { return t === 'hq' ? (ADMIN ? 'Christian\u2019s HQ' : 'HQ') : t === 'dock' ? 'the launch pad' : 'the ' + BOTS[t].place; }
const PULSES = []; let pulseT = 0;
function pulseAt(b, col) { if (!b) return; PULSES.push({ x: b.cx, y: b.cy, t: 0, col: col || NEON }); if (PULSES.length > 12) PULSES.shift(); pulseT = 1.6; }
function queueErrand(i, target, item, label, real) {
  const ch = chars[i]; if (real) { pulseAt(BOTS[i].b); pulseAt(target === 'hq' ? HQ : target === 'dock' ? null : BOTS[target] && BOTS[target].b, GOLD); } if (target === i || !lastWork) return;
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
  if (target === 'dock' && ch.errand && ch.errand.real) { if (ship.state === 'docked') { ship.cargo++; ship.wait = 1.3; } else pierCrates.push(item || 'crate'); } }
function updateShip(dt) {
  if (ship.state === 'docked') { if (ship.cargo > 0 && (ship.wait -= dt) <= 0) { ship.state = 'leaving'; ship.t = 0; } }
  else if (ship.state === 'leaving') { ship.t += dt; const k = Math.min(1, ship.t / 7); ship.lift = 0.55 + k * k * 22; ship.x = SHIP_HOME - k * k * 6; if (k >= 1) { ship.state = 'away'; ship.t = 0; ship.cargo = 0; } }
  else if (ship.state === 'away') { if ((ship.t += dt) > 9) { ship.state = 'returning'; ship.t = 0; } }
  else if (ship.state === 'returning') { ship.t += dt; const k = Math.min(1, ship.t / 7), e = 1 - (1 - k) * (1 - k); ship.lift = 0.55 + (1 - e) * 22; ship.x = SHIP_HOME + (1 - e) * 6; if (k >= 1) { ship.state = 'docked'; ship.x = SHIP_HOME; ship.lift = 0.55; if (pierCrates.length) { ship.cargo = pierCrates.length; pierCrates.length = 0; ship.wait = 1.6; } } }
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
let EDGE = '#5ff3ff', FUTDECO = false;
function rgbOf(col) { if (/^#[0-9a-f]{6}$/i.test(col)) { const n = parseInt(col.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; } const m = /rgba?\(([^)]+)\)/.exec(col); return m ? m[1].split(',').slice(0, 3).map(Number) : [20, 30, 45]; }
const lum = r => (0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2]) / 255;
function fut(col) { const r = rgbOf(col), l = lum(r); return '#' + r.map((v, k) => Math.round(Math.min(255, 10 + v * 0.16 + [6, 12, 26][k] + l * 18))).map(v => v.toString(16).padStart(2, '0')).join(''); }
function decoCol(col) { if (typeof col !== 'string') return col; const r = rgbOf(col), l = lum(r); if (l > 0.62) return EDGE; if (l > 0.42) return 'rgba(' + rgbOf(EDGE).join(',') + ',.45)'; return fut(col); }
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
// futuristic roofs: flat glowing decks and stepped setbacks instead of gables/hips
function gableS(b, lx, ly, w, d, z, rh, col, endCol, o = 0.18) { return boxS(b, lx, ly, w + o, d + o, z, z + Math.min(0.32, rh * 0.3), col); }
function hipS(b, lx, ly, w, d, z, rh, col, o = 0.2) { return boxS(b, lx, ly, w * 0.62, d * 0.62, z, z + Math.max(0.25, rh * 0.55), col, { front: (c, L, H) => R2(c, 0.08, H * 0.35, L - 0.16, Math.max(0.05, H * 0.12), '#ffffff') }); }
function gableOld(b, lx, ly, w, d, z, rh, col, endCol, o = 0.18) { const X0 = lx - w / 2 - o, X1 = lx + w / 2 + o, Y0 = ly - d / 2 - o, Y1 = ly + d / 2 + o, t = z + rh;
  return mkSolid(b, [{ l: [[X0, Y1, z], [X1, Y1, z], [X1, ly, t], [X0, ly, t]], col, roof: 1 }, { l: [[X1, Y0, z], [X0, Y0, z], [X0, ly, t], [X1, ly, t]], col, roof: 1 },
    { l: [[X0, Y0, z], [X0, Y1, z], [X0, ly, t]], col: endCol }, { l: [[X1, Y1, z], [X1, Y0, z], [X1, ly, t]], col: endCol }, { l: [[X0, Y0, z], [X1, Y0, z], [X1, Y1, z], [X0, Y1, z]], col }]); }
function hipOld(b, lx, ly, w, d, z, rh, col, o = 0.2) { const W = w / 2 + o, D = d / 2 + o, r = Math.max(0, W - D), t = z + rh;
  return mkSolid(b, [{ l: [[lx - W, ly + D, z], [lx + W, ly + D, z], [lx + r, ly, t], [lx - r, ly, t]], col, roof: 1 }, { l: [[lx + W, ly - D, z], [lx - W, ly - D, z], [lx - r, ly, t], [lx + r, ly, t]], col, roof: 1 },
    { l: [[lx - W, ly - D, z], [lx - W, ly + D, z], [lx - r, ly, t]], col, roof: 1 }, { l: [[lx + W, ly + D, z], [lx + W, ly - D, z], [lx + r, ly, t]], col, roof: 1 }, { l: [[lx - W, ly - D, z], [lx + W, ly - D, z], [lx + W, ly + D, z], [lx - W, ly + D, z]], col }]); }
function drawSolid(c, s) {
  s.faces.forEach(f => { if (dot(f.n, VV) <= 0.02) return; const lt = 0.8 + 0.22 * Math.max(0, dot(f.n, LL)) - (f.n[2] < 0.3 ? 0.04 : 0);
    c.beginPath(); f.pts.forEach((p, k) => { const q = S3(p[0], p[1], p[2]); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath();
    c.fillStyle = shade(fut(f.col), lt + (f.n[2] > 0.6 ? 0.25 : 0)); c.fill(); c.save(); c.shadowColor = EDGE; c.shadowBlur = K * 0.28; c.strokeStyle = EDGE; c.globalAlpha = f.roof ? 0.95 : 0.7; c.lineWidth = Math.max(1, K / 30); c.lineJoin = 'round'; c.stroke(); c.restore();
    if (f.deco && f.wall) { const { p0, p1, z0, z1 } = f.wall, len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), a = S3(p0[0], p0[1], z1), bq = S3(p1[0], p1[1], z1);
      c.save(); c.transform((bq[0] - a[0]) / len, (bq[1] - a[1]) / len, 0, ZK * K, a[0], a[1]); c.lineWidth = 1 / K; c.shadowColor = EDGE; c.shadowBlur = K * 0.18; FUTDECO = true; try { f.deco(c, len, z1 - z0, lt); } finally { FUTDECO = false; } c.restore(); } });
}
// wall painters work in wall units: u = 0..len left to right, s = 0..h top to bottom
const R2 = (c, x, y, w, h, col) => { c.fillStyle = FUTDECO ? decoCol(col) : col; c.fillRect(x, y, w, h); };
function winW(c, x, y, w, h, lit) { R2(c, x - 0.05, y - 0.05, w + 0.1, h + 0.1, C.ink); R2(c, x, y, w, h, lit ? C.lit : '#b9c6cb'); if (!lit) R2(c, x + 0.06, y + 0.06, w * 0.3, h * 0.3, 'rgba(255,255,255,.5)'); R2(c, x + w / 2 - 0.03, y, 0.06, h, C.ink); }
function doorW(c, len, h, w, dh, col = C.door) { const x = len / 2 - w / 2; R2(c, x - 0.05, h - dh - 0.05, w + 0.1, dh + 0.05, C.ink); R2(c, x, h - dh, w, dh, col); R2(c, x + w - 0.16, h - dh / 2, 0.07, 0.07, C.lit); }
let LIT = false, HOMELIT = false;
let archImg = null; try { archImg = new Image(); archImg.onload = () => { spritesDirty = true; }; archImg.src = 'arch-mark.png'; } catch (e) {}
function propSolids(b) { const w = b.w, d = b.d, out = [], ex = {}, W2 = '#ffffff';
  const stripes = (c, L, H) => { for (let k = 0.35; k < H - 0.2; k += 0.55) R2(c, 0.15, k, L - 0.3, 0.08, W2); };
  const panel = (c, L, H) => { R2(c, 0.2, 0.25, L - 0.4, H * 0.45, W2); };
  switch (b.kind) {
    case 'antenna': out.push(boxS(b, 0, 0, 1.1, 1.1, 0, 0.5, C.stone)); out.push(boxS(b, 0, 0, 0.22, 0.22, 0.5, 5.6, C.wall2)); [3.2, 4.4].forEach(z => out.push(boxS(b, 0, 0, 1.6, 0.12, z, z + 0.12, C.wall2))); { const p = loc(b, 0, 0); ex.blink = [p[0], p[1], 5.75]; ex.dish = [p[0], p[1], 4.5]; } ex.top = 6; break;
    case 'exchange': out.push(boxS(b, 0, 0, w, d, 0, 1.3, C.wall, { front: stripes, side: stripes })); out.push(boxS(b, 0, 0, w * 0.68, d * 0.68, 1.3, 2.5, C.wall2, { front: panel, side: panel })); { const p = loc(b, 0, 0); ex.holo = [p[0], p[1], 3.3]; } ex.top = 4; break;
    case 'workshop': out.push(boxS(b, 0, 0, w, d, 0, 1.9, C.wall, { front: (c, L, H) => { for (let k = 0; k < 3; k++) R2(c, 0.25 + k * (L - 0.5) / 3, 0.3, (L - 0.9) / 3, H * 0.5, W2); }, side: panel })); out.push(boxS(b, 0, 0, w + 0.2, d + 0.2, 1.9, 2.1, C.stone)); ex.top = 2.4; break;
    case 'vault': out.push(boxS(b, 0, 0, w, d, 0, 2.6, C.wall, { front: (c, L, H) => { c.strokeStyle = W2; c.lineWidth = 0.1; c.beginPath(); c.arc(L / 2, H * 0.55, Math.min(L, H) * 0.32, 0, 7); c.stroke(); c.beginPath(); c.arc(L / 2, H * 0.55, Math.min(L, H) * 0.12, 0, 7); c.stroke(); }, side: stripes })); out.push(boxS(b, 0, 0, w * 0.7, d * 0.7, 2.6, 2.9, C.wall2)); ex.top = 3.2; break;
    case 'depot': out.push(boxS(b, 0, 0, w, d, 0, 2.2, C.wall, { front: (c, L, H) => { for (let k = 0; k < 3; k++) { const x = 0.3 + k * (L - 0.6) / 3; R2(c, x, 0.6, (L - 1.2) / 3, H - 0.6, '#8899aa'); for (let j = 0.8; j < H; j += 0.3) R2(c, x, j, (L - 1.2) / 3, 0.05, W2); } }, side: stripes })); out.push(boxS(b, 0, 0, w + 0.2, d + 0.2, 2.2, 2.4, C.stone)); ex.top = 2.7; break;
    case 'ckiosk': out.push(boxS(b, 0, 0, w, d, 0, 1.6, C.wall2, { front: (c, L, H) => { R2(c, 0.12, 0.15, L - 0.24, H * 0.55, W2); for (let k = 0; k < 3; k++) R2(c, 0.2, 0.3 + k * 0.22, 0.12, 0.1, '#8899aa'); } })); ex.top = 1.9; break;
    case 'council': out.push(boxS(b, 0, 0, w, d, 0, 3, C.wall, { front: stripes, side: stripes })); out.push(boxS(b, 0, 0, w * 0.7, d * 0.7, 3, 6.5, C.wall2, { front: (c, L, H) => { for (let k = 0.3; k < H; k += 0.7) R2(c, 0.15, k, L - 0.3, 0.3, W2); }, side: panel })); out.push(boxS(b, 0, 0, w * 0.4, d * 0.4, 6.5, 8.6, C.wall, { front: panel, side: panel })); out.push(boxS(b, 0, 0, 0.14, 0.14, 8.6, 10.2, C.wall2)); { const p = loc(b, 0, 0); ex.beacon = [p[0], p[1], 10.3]; } ex.top = 10.6; break;
    case 'server': [-1.05, 0, 1.05].forEach(x => out.push(boxS(b, x, 0, 0.85, d, 0, 3.2, C.wall, { front: (c, L, H) => { for (let k = 0.2; k < H - 0.1; k += 0.28) { R2(c, 0.1, k, L - 0.2, 0.06, '#8899aa'); R2(c, 0.12 + ((k * 7) % 0.5), k, 0.08, 0.06, W2); } } }))); ex.top = 3.5; break;
    case 'fab': out.push(boxS(b, 0, 0, w, d, 0, 2.4, C.wall, { front: (c, L, H) => { R2(c, 0.3, 0.7, L * 0.5, H - 0.7, '#8899aa'); for (let j = 0.9; j < H; j += 0.3) R2(c, 0.3, j, L * 0.5, 0.05, W2); R2(c, L * 0.62, 0.4, L * 0.3, 0.5, W2); }, side: stripes })); out.push(boxS(b, w / 2 - 0.3, -d / 2 + 0.3, 0.22, 0.22, 2.4, 4.6, C.wall2)); out.push(boxS(b, w / 2 - 1.6, -d / 2 + 0.3, 2.8, 0.16, 4.4, 4.58, C.wall2)); ex.top = 4.8; break;
    case 'hangar': out.push(boxS(b, 0, 0, w, d, 0, 2.7, C.wall, { front: (c, L, H) => { R2(c, L * 0.18, 0.5, L * 0.64, H - 0.5, '#0a111c'); R2(c, L * 0.18, 0.5, L * 0.64, 0.08, W2); R2(c, L * 0.18, 0.5, 0.08, H - 0.5, W2); R2(c, L * 0.82 - 0.08, 0.5, 0.08, H - 0.5, W2); }, side: stripes })); out.push(boxS(b, 0, 0, w + 0.3, d + 0.3, 2.7, 3.0, C.stone)); ex.top = 3.3; break;
    case 'billboard': [-w / 2 + 0.2, w / 2 - 0.2].forEach(x => out.push(boxS(b, x, 0, 0.14, 0.14, 0, 3.0, C.wall2))); out.push(boxS(b, 0, 0, w, 0.16, 3.0, 4.5, C.wall, { front: (c, L, H) => { FUTDECO = false; c.shadowBlur = 0; c.fillStyle = 'rgba(4,16,30,.95)'; c.fillRect(0.06, 0.06, L - 0.12, H - 0.12); c.fillStyle = EDGE; c.font = '800 0.5px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; const words = String(b.text || '').split(' '), half = Math.ceil(words.length / 2), l1 = words.length > 2 ? words.slice(0, half).join(' ') : words.join(' '), l2 = words.length > 2 ? words.slice(half).join(' ') : ''; const fs = Math.min(0.52, (L - 0.3) / Math.max(1, Math.max(l1.length, l2.length) * 0.32)); c.font = `800 ${fs}px system-ui, sans-serif`; c.fillText(l1, L / 2, l2 ? H * 0.36 : H / 2); if (l2) c.fillText(l2, L / 2, H * 0.68); FUTDECO = true; } })); { const p = loc(b, 0, 0); ex.bill = [p[0], p[1], 3.75]; } ex.top = 4.8; break;
  }
  return { solids: out, ex };
}
function buildingSolids(bt, b) {
  if (b.type === 'prop') return propSolids(b);
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
    out.push(boxS(b, 0, 0, w, d, 0, 2.7, C.cream, { front: (c, L, H) => { R2(c, 0, 0, L, 0.14, C.tan); if (archImg && archImg.complete && archImg.naturalWidth) { const ih = 1.25, iw = ih * archImg.naturalWidth / archImg.naturalHeight; FUTDECO = false; c.shadowBlur = 0; c.fillStyle = '#F6F4EF'; c.fillRect(L / 2 - iw / 2 - 0.12, 0.2, iw + 0.24, ih + 0.1); c.drawImage(archImg, L / 2 - iw / 2, 0.25, iw, ih); FUTDECO = true; c.shadowBlur = K * 0.18; }
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
  c.fillStyle = 'rgba(95,243,255,.12)'; c.beginPath(); c.ellipse(X, Y, r * 0.9, r * 0.32, 0, 0, 7); c.fill();
  R2(c, X - r * 0.06, Y - r * 1.3, r * 0.12, r * 1.3, '#1d3346');
  c.save(); c.shadowColor = g < 0.5 ? '#5ff3ff' : '#3ddc97'; c.shadowBlur = r * 0.8; c.lineWidth = 1;
  if (t.pine) { for (let k = 0; k < 3; k++) { const yb = Y - r * (0.9 + k * 0.75), ww = r * (1.0 - k * 0.25); c.beginPath(); c.moveTo(X - ww, yb); c.lineTo(X, yb - r * 1.2); c.lineTo(X + ww, yb); c.closePath(); c.fillStyle = g < 0.5 ? 'rgba(40,190,210,.28)' : 'rgba(61,220,151,.26)'; c.fill(); c.strokeStyle = g < 0.5 ? 'rgba(127,247,255,.85)' : 'rgba(120,255,190,.85)'; c.stroke(); } }
  else { const cy = Y - r * 1.75; c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.5; c.lineTo(X + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95); } c.closePath(); c.fillStyle = g < 0.5 ? 'rgba(40,190,210,.26)' : 'rgba(150,120,255,.24)'; c.fill(); c.strokeStyle = g < 0.5 ? 'rgba(127,247,255,.9)' : 'rgba(190,170,255,.9)'; c.stroke();
    c.beginPath(); c.moveTo(X - r * 0.6, cy); c.lineTo(X + r * 0.6, cy); c.moveTo(X, cy - r * 0.8); c.lineTo(X, cy + r * 0.8); c.globalAlpha = 0.4; c.stroke(); }
  c.restore(); }
function lampDraw(c, x, y, h, lantern) { const [X, Y] = S3(x, y, 0), [, Yt] = S3(x, y, h); R2(c, X - 1.2, Yt, 2.4, Y - Yt, C.ink); const s = K * (lantern ? 0.2 : 0.17); R2(c, X - s - 1, Yt - s * 2 - 1, s * 2 + 2, s * 2 + 2, C.ink); R2(c, X - s, Yt - s * 2, s * 2, s * 2, lantern ? C.tan : C.lit); }
function buildSprites() {
  SPRITES = [];
  const add = (bt, b, tap) => { EDGE = b === AI ? '#ff4d6d' : b === HQ ? '#F6F4EF' : bt && bt.color && lum(rgbOf(bt.color)) > 0.35 ? bt.color : (b.col && lum(rgbOf(b.col)) > 0.35 ? b.col : '#5ff3ff'); const { solids, ex } = buildingSolids(bt, b); b.ex = ex; b.solids = solids; const bb = solidsBBox(solids, ex.pole ? 1.4 : 0);
    SPRITES.push(mkSprite(b.cy, tap, c => { solids.slice().sort((p, q) => dot(p.cen, VV) - dot(q.cen, VV)).forEach(s => drawSolid(c, s));
      if (ex.pole) { const a = S3(ex.pole[0], ex.pole[1], ex.pole[2]), z = S3(ex.pole[0], ex.pole[1], ex.pole[3]); R2(c, a[0] - 1, z[1], 2, a[1] - z[1], C.ink); }
      if (ex.bushes) ex.bushes.forEach(p => { const q = S3(p[0], p[1], p[2]); c.fillStyle = C.tree2; c.beginPath(); c.arc(q[0], q[1], K * 0.3, 0, 7); c.fill(); c.fillStyle = C.tree; c.beginPath(); c.arc(q[0] - K * 0.06, q[1] - K * 0.06, K * 0.22, 0, 7); c.fill(); }); }, bb));
    b.screen = bb; EDGE = '#5ff3ff'; };
  BOTS.forEach((bt, i) => { add(bt, bt.b, i); add(bt, bt.home, i); }); add(null, HQ, 'hq'); add({ color: '#141414', name: 'AI' }, AI, 'ai');
  PROPS.forEach(pr => { add({ color: pr.dist.col }, pr, pr.dist.tap); });
  { // central spire monument (static), beacon animated per frame
    const sb = { cx: SPIRE.x, cy: SPIRE.y, rot: 0.785 }, so = [boxS(sb, 0, 0, 4.6, 4.6, 0, 0.6, C.stone, { front: (c, L, H) => R2(c, 0.1, 0.2, L - 0.2, 0.1, '#ffffff'), side: (c, L, H) => R2(c, 0.1, 0.2, L - 0.2, 0.1, '#ffffff') }), boxS(sb, 0, 0, 2.4, 2.4, 0.6, 5, C.wall, { front: (c, L, H) => { for (let k = 0.3; k < H; k += 0.5) R2(c, L / 2 - 0.08, k, 0.16, 0.3, '#ffffff'); }, side: (c, L, H) => { for (let k = 0.3; k < H; k += 0.5) R2(c, L / 2 - 0.08, k, 0.16, 0.3, '#ffffff'); } }), boxS(sb, 0, 0, 1.5, 1.5, 5, 10, C.wall2, { front: (c, L, H) => R2(c, L / 2 - 0.06, 0, 0.12, H, '#ffffff'), side: (c, L, H) => R2(c, L / 2 - 0.06, 0, 0.12, H, '#ffffff') }), boxS(sb, 0, 0, 0.8, 0.8, 10, 14, C.wall, { front: (c, L, H) => R2(c, L / 2 - 0.05, 0, 0.1, H, '#ffffff'), side: (c, L, H) => R2(c, L / 2 - 0.05, 0, 0.1, H, '#ffffff') }), boxS(sb, 0, 0, 0.2, 0.2, 14, 16.5, C.wall2)];
    EDGE = '#f2c96b'; SPRITES.push(mkSprite(SPIRE.y, null, c => so.forEach(s => drawSolid(c, s)), solidsBBox(so, 0, 0.8))); SPIRE.solids = so; EDGE = '#5ff3ff'; }
  TREES.forEach(t => { const [X, Y] = S3(t.x, t.y, 0), r = t.r * K; SPRITES.push(mkSprite(t.y, null, c => treeDraw(c, t), [X - r * 1.3, Y - r * 3.4, X + r * 1.3, Y + 2])); });
  LAMPS.forEach(([x, y]) => { const [X, Y] = S3(x, y, 0), [, Yt] = S3(x, y, 1.6); SPRITES.push(mkSprite(y, null, c => lampDraw(c, x, y, 1.6), [X - K * 0.3, Yt - K * 0.5, X + K * 0.3, Y + 2])); });
  LANTERNS.forEach(([x, y]) => { const [X, Y] = S3(x, y, 0.3), [, Yt] = S3(x, y, 1.6); SPRITES.push(mkSprite(y, 'dock', c => lampDraw(c, x, y - 0.3 * ZK / TILT, 1.6, true), [X - K * 0.4, Yt - K * 0.6, X + K * 0.4, Y + 4])); });
  // HQ calendar board + harbor sign: posts and a blank board; live text is painted on top each frame
  const signSprite = (o, w, h, tap, after) => { const [X, Y] = S3(o.x, o.y, 0), top = Y - (h + 0.6) * K * ZK;
    return mkSprite(o.y, tap, c => { R2(c, X - w * K / 2 + K * 0.15, top + h * K * ZK * 0.5, 3, Y - top - h * K * ZK * 0.5, '#1d3346'); R2(c, X + w * K / 2 - K * 0.15 - 3, top + h * K * ZK * 0.5, 3, Y - top - h * K * ZK * 0.5, '#1d3346');
      c.save(); c.shadowColor = '#5ff3ff'; c.shadowBlur = K * 0.5; c.fillStyle = 'rgba(95,243,255,.9)'; c.fillRect(X - w * K / 2 - 2, top - 2, w * K + 4, h * K * ZK + 4); c.restore(); c.fillStyle = 'rgba(4,16,30,.96)'; c.fillRect(X - w * K / 2, top, w * K, h * K * ZK); c.fillStyle = 'rgba(95,243,255,.06)'; for (let yy = top + 2; yy < top + h * K * ZK; yy += 3) c.fillRect(X - w * K / 2, yy, w * K, 1); },
      [X - w * K / 2 - 4, top - 4, X + w * K / 2 + 4, Y + 2], after); };
  SPRITES.push(signSprite(BOARD, 3.0, 2.2, 'hq', drawHQBoard)); SPRITES.push(signSprite(HSIGN, 2.4, 1.2, 'dock', drawHarborSign));
  SPRITES.forEach(s => { if (s.after) s.face = (() => { const o = s.key === BOARD.y ? BOARD : HSIGN, [X, Y] = S3(o.x, o.y, 0), w = (o === BOARD ? 3.0 : 2.4), h = (o === BOARD ? 2.2 : 1.2); return { x: X - w * K / 2 + 3, y: Y - (h + 0.6) * K * ZK + 3, w: w * K - 6, h: h * K * ZK - 6 }; })(); });
  spritesDirty = false;
}
function drawGroundTo(c, lite) { const r = mulberry32(7);
  c.fillStyle = C.g2; c.fillRect(0, OY - K * 0.6, WPX, HPX);
  c.strokeStyle = 'rgba(95,243,255,.07)'; c.lineWidth = 1; c.beginPath(); for (let x = 0; x <= WX; x += 1) { const a = S3(x, 0, 0), b2 = S3(x, WY, 0); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); } for (let y = 0; y <= WY; y += 1) { const a = S3(0, y, 0), b2 = S3(WX, y, 0); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); } c.stroke();
  for (let k = 0; k < 700; k++) { const [X, Y] = S3(r() * WX, r() * WY, 0); c.fillStyle = r() < 0.5 ? 'rgba(20,40,70,.18)' : 'rgba(30,20,60,.14)'; c.beginPath(); c.ellipse(X, Y, K * (0.4 + r() * 1.2), K * TILT * (0.4 + r() * 1.0), 0, 0, 7); c.fill(); }
  for (let k = 0; k < 900; k++) { const [X, Y] = S3(r() * WX, r() * WY, 0); c.fillStyle = r() < 0.15 ? 'rgba(95,243,255,.35)' : 'rgba(120,140,190,.12)'; c.fillRect(X, Y, Math.max(1, K / 20), Math.max(1, K / 20)); }
  HILLS.forEach(h => { const [X, Y] = S3(h.x, h.y, 0), rx = h.r * K, ry = h.r * K * TILT;
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(X + rx * 0.12, Y + ry * 0.12, rx, ry, 0, 0, 7); c.fill();
    const g = c.createRadialGradient(X - rx * 0.35, Y - ry * 0.6, rx * 0.1, X, Y - ry * 0.25, rx); g.addColorStop(0, '#1a2840'); g.addColorStop(0.6, '#101a2c'); g.addColorStop(1, '#0a111e');
    c.fillStyle = g; c.beginPath(); c.ellipse(X, Y - ry * 0.25, rx * 0.97, ry * 0.95, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(95,243,255,.28)'; c.lineWidth = 1; [0.7, 0.42].forEach(f => { c.beginPath(); c.ellipse(X - rx * (1 - f) * 0.15, Y - ry * 0.25 - ry * (1 - f) * 0.45, rx * f, ry * f, 0, 0, 7); c.stroke(); }); });
  // shore + water
  const sand = [], wl = []; for (let x = -0.5; x <= WX + 0.5; x += 0.25) { sand.push(S3(x, shoreY(x) - 0.75, 0)); wl.push(S3(x, shoreY(x) + 0.2, 0)); }
  c.fillStyle = '#0c1524'; c.beginPath(); sand.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.lineTo(WPX, HPX); c.lineTo(0, HPX); c.closePath(); c.fill();
  const wg = c.createLinearGradient(0, S3(0, 37, 0)[1], 0, HPX); wg.addColorStop(0, '#06263a'); wg.addColorStop(1, '#020b14');
  c.fillStyle = wg; c.beginPath(); wl.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.lineTo(WPX, HPX); c.lineTo(0, HPX); c.closePath(); c.fill();
  c.save(); c.shadowColor = '#5ff3ff'; c.shadowBlur = K * 0.4; c.strokeStyle = 'rgba(95,243,255,.85)'; c.lineWidth = Math.max(1.5, K / 18); c.beginPath(); wl.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); c.restore();
  for (let k = 0; k < 60; k++) { const x = r() * WX, [X, Y] = S3(x, shoreY(x) - 0.6 + r() * 0.6, 0); c.fillStyle = 'rgba(95,243,255,.25)'; c.fillRect(X, Y, 2, 2); }
  [[3.2, 0], [5.0, 0], [9.6, 0], [24.5, 0], [26.2, 0]].forEach(([x]) => { const [X, Y] = S3(x, shoreY(x) - 0.1, 0); c.strokeStyle = C.tree2; c.lineWidth = Math.max(1, K / 18); c.beginPath(); for (let k = -1; k <= 1; k++) { c.moveTo(X + k * K * 0.1, Y); c.lineTo(X + k * K * 0.2, Y - K * 0.6); } c.stroke(); });
  // shadows (buildings, trees, rocks)
  c.fillStyle = 'rgba(0,0,0,.35)'; ALLB.forEach(b => b.solids && castShadow(c, b.solids));
  TREES.forEach(t => { const [X, Y] = S3(t.x + t.r * 0.9, t.y + 0.2, 0); c.beginPath(); c.ellipse(X, Y, t.r * K * 1.3, t.r * K * TILT * 0.9, 0, 0, 7); c.fill(); });
  // paths
  const stroke = (pts, wdt, col) => { c.strokeStyle = col; c.lineWidth = wdt; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); pts.forEach((p, k) => { const q = S3(p[0], p[1], 0); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.stroke(); };
  c.save(); c.shadowColor = '#5ff3ff'; c.shadowBlur = K * 0.5; EDGES.forEach(e => { if (e.b === 'dock' || e.faint) return; stroke(e.pts, K * (e.main ? 1.9 : 0.62) + 3, 'rgba(95,243,255,.45)'); }); c.restore();
  EDGES.forEach(e => { if (e.b === 'dock' || e.faint) return; stroke(e.pts, K * (e.main ? 1.9 : 0.62), C.dirt); });
  EDGES.forEach(e => { if (e.b === 'dock' || e.faint) return; stroke(e.pts, Math.max(1, K / 30), 'rgba(95,243,255,.35)'); if (e.main) { c.setLineDash([K * 0.5, K * 0.7]); stroke(e.pts, Math.max(1, K / 22), 'rgba(242,201,107,.35)'); c.setLineDash([]); } });
  EDGES.forEach(e => { if (!e.faint) return; stroke(e.pts, K * 0.28, 'rgba(255,77,109,.25)'); stroke(e.pts, K * 0.08, 'rgba(255,77,109,.8)'); });
  EDGES.forEach(e => e.pts.forEach((p, k) => { if (k % 2 || e.b === 'dock' || e.faint) return; const [X, Y] = S3(p[0] + (r() - 0.5) * 0.6, p[1] + (r() - 0.5) * 0.4, 0); c.fillStyle = 'rgba(95,243,255,.18)'; c.fillRect(X, Y, 2, 1.5); }));
  // pier (deck at z 0.3, posts into the water)
  const deck = [[PIER.x0, PIER.y0], [PIER.x1, PIER.y0], [PIER.x1, PIER.y1], [PIER.x0, PIER.y1]].map(p => S3(p[0], p[1], 0.3));
  for (let y = PIER.y0 + 0.6; y <= PIER.y1; y += 1.1) [PIER.x0 + 0.05, PIER.x1 - 0.05].forEach(x => { const a = S3(x, y, 0.3), b2 = S3(x, y, -0.5); R2(c, a[0] - K * 0.08, a[1], K * 0.16, b2[1] - a[1], '#0e1828'); });
  c.fillStyle = '#141e2e'; c.beginPath(); deck.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill();
  for (let y = PIER.y0; y < PIER.y1; y += 0.3) { const a = S3(PIER.x0, y, 0.3), b2 = S3(PIER.x1, y, 0.3); c.fillStyle = (Math.round((y - PIER.y0) / 0.3) % 3) ? 'rgba(95,243,255,.12)' : 'rgba(242,201,107,.6)'; c.fillRect(a[0], a[1], b2[0] - a[0], Math.max(1, K / 30)); }
  const f0 = S3(PIER.x0, PIER.y1, 0.3), f1 = S3(PIER.x1, PIER.y1, 0.05); c.fillStyle = '#0a1220'; c.fillRect(f0[0], f0[1], f1[0] - f0[0], f1[1] - f0[1]);
  c.strokeStyle = '#5ff3ff'; c.lineWidth = 1.5; c.beginPath(); deck.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.stroke();
  { const [X, Y] = S3(DOCK_SPOT[0] - 3.2, SHIP_Y, 0.02); c.save(); c.shadowColor = '#f2c96b'; c.shadowBlur = K * 0.5; c.fillStyle = 'rgba(10,18,30,.92)'; c.beginPath(); c.ellipse(X, Y, K * 2.3, K * 2.3 * TILT, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(242,201,107,.9)'; c.lineWidth = Math.max(1.5, K / 16); c.stroke(); c.beginPath(); c.ellipse(X, Y, K * 1.6, K * 1.6 * TILT, 0, 0, 7); c.strokeStyle = 'rgba(95,243,255,.6)'; c.stroke(); c.restore();
    c.fillStyle = 'rgba(242,201,107,.85)'; c.font = FONT(800, K * 0.9); c.textAlign = 'center'; c.textBaseline = 'middle'; c.save(); c.translate(X, Y); c.scale(1, TILT); c.fillText('G', 0, 0); c.restore(); }
  
  // pier props: crates + barrel
  [[PIER.x0 + 0.3, PIER.y0 + 0.9], [PIER.x0 + 0.8, PIER.y0 + 0.75]].forEach(([x, y]) => { const s = boxS({ cx: x, cy: y, rot: 0.1 }, 0, 0, 0.45, 0.45, 0.3, 0.75, '#3a5a80'); drawSolid(c, s); });
  // flowers + rocks
  FLOWERS.forEach(([x, y, t]) => { const [X, Y] = S3(x, y, 0); [[0, 0], [0.22, 0.1], [-0.18, 0.15]].forEach(([dx, dy], j) => { c.fillStyle = [C.red, C.lit, C.tan][(t + j) % 3]; c.beginPath(); c.arc(X + dx * K, Y + dy * K * TILT, Math.max(1, K * 0.045), 0, 7); c.fill(); }); });
  ROCKS.forEach(rk => { const [X, Y] = S3(rk.x, rk.y, 0), rx = rk.r * K, ry = rk.r * K * 0.75, rn = mulberry32(Math.floor(rk.seed * 1000)); const pts = Array.from({ length: 7 }, (_, k) => { const a = k / 7 * Math.PI * 2, f = 0.75 + rn() * 0.35; return [X + Math.cos(a) * rx * f, Y - ry * 0.5 + Math.sin(a) * ry * f]; });
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(X + rx * 0.35, Y + ry * 0.2, rx, ry * 0.5, 0, 0, 7); c.fill();
    c.fillStyle = '#16233a'; c.beginPath(); pts.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); c.strokeStyle = 'rgba(122,167,255,.55)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(122,167,255,.35)'; c.beginPath(); c.ellipse(X - rx * 0.25, Y - ry * 0.85, rx * 0.4, ry * 0.3, -0.3, 0, 7); c.fill(); });

  // AI core compound: dark plate, red energy fence, corner pylons
  const camp = [[75.6, 7.6], [93.4, 7.6], [93.4, 25.0], [75.6, 25.0]];
  c.fillStyle = '#0b0d16'; c.beginPath();
  camp.forEach((p, k) => { const q = S3(p[0], p[1], 0); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath(); c.fill();
  for (let k = 0; k < 40; k++) { const [X, Y] = S3(75.8 + (k * 4.1 % 17.4), 7.8 + (k * 2.9 % 17), 0); c.fillStyle = 'rgba(255,77,109,.12)'; c.fillRect(X - K * 0.3, Y, K * 0.6, 1); }
  const wire = (a, b) => {
    const n = 24; for (let i = 0; i <= n; i++) {
      const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, [X, Y] = S3(x, y, 0);
      if (i % 2 === 0) { c.fillStyle = '#2a1520'; c.fillRect(X - 1.5, Y - K * 0.55, 3, K * 0.55); }
    }
    [[0.22, 'rgba(255,77,109,.85)'], [0.42, 'rgba(255,77,109,.55)']].forEach(([h, col]) => {
      c.strokeStyle = col; c.lineWidth = Math.max(1, K / 28); c.beginPath();
      for (let i = 0; i <= n; i++) { const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, [X, Y] = S3(x, y, h); i ? c.lineTo(X, Y) : c.moveTo(X, Y); } c.stroke();
      for (let i = 1; i < n; i++) { const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, [X, Y] = S3(x, y, h); c.beginPath(); c.arc(X, Y, 1.4, 0, 7); c.stroke(); }
    });
  };
  wire([75.6, 7.6], [93.4, 7.6]); wire([93.4, 7.6], [93.4, 25.0]); wire([93.4, 25.0], [75.6, 25.0]); wire([75.6, 25.0], [75.6, 7.6]);
  [[75.6, 7.6], [93.4, 7.6], [93.4, 25.0], [75.6, 25.0]].forEach(([x, y]) => {
    const [X, Y] = S3(x, y, 0), [, Yt] = S3(x, y, 2.4);
    c.fillStyle = '#141826'; c.fillRect(X - K * 0.2, Yt, K * 0.4, Y - Yt);
    c.fillStyle = '#ff4d6d'; c.fillRect(X - K * 0.3, Yt - K * 0.1, K * 0.6, K * 0.12);
  });
  // districts: tinted plates, glowing borders, gates where boulevards cross, plazas
  DISTRICTS.forEach(d => { const [X, Y] = S3(d.cx, d.cy, 0), rx = d.R * K, ry = d.R * K * TILT, rgb = rgbOf(d.col).join(',');
    const g = c.createRadialGradient(X, Y, 0, X, Y, rx); g.addColorStop(0, `rgba(${rgb},.10)`); g.addColorStop(0.85, `rgba(${rgb},.05)`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.beginPath(); c.ellipse(X, Y, rx, ry, 0, 0, 7); c.fill();
    if (!lite) { c.fillStyle = `rgba(${rgb},.16)`; for (let gx = -d.R; gx <= d.R; gx += 1.2) for (let gy = -d.R; gy <= d.R; gy += 1.2) { if (gx * gx + gy * gy > d.R * d.R * 0.8) continue; const [hx, hy] = S3(d.cx + gx + ((Math.round(gy / 1.2)) % 2) * 0.6, d.cy + gy, 0); c.fillRect(hx - 1, hy - 0.5, 2, 1); } }
    c.save(); c.shadowColor = d.col; c.shadowBlur = lite ? 0 : K * 0.4; c.strokeStyle = `rgba(${rgb},.75)`; c.lineWidth = Math.max(1.5, K / 14); c.setLineDash([K * 0.9, K * 0.45]); c.beginPath(); c.ellipse(X, Y, rx, ry, 0, 0, 7); c.stroke(); c.setLineDash([]); c.restore();
    if (lite) return;
    EDGES.forEach(e => { for (let k = 1; k < e.pts.length; k++) { const a = e.pts[k - 1], b2 = e.pts[k], da = Math.hypot(a[0] - d.cx, a[1] - d.cy) - d.R, db = Math.hypot(b2[0] - d.cx, b2[1] - d.cy) - d.R; if ((da < 0) === (db < 0)) continue;
      const dx = b2[0] - a[0], dy = b2[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, hw = e.main ? 1.25 : 0.8;
      const tops = [-1, 1].map(sg => { const px = a[0] + nx * hw * sg, py = a[1] + ny * hw * sg, [GX, GY] = S3(px, py, 0), [, TY] = S3(px, py, 2.6); c.fillStyle = '#0c1424'; c.fillRect(GX - K * 0.14, TY, K * 0.28, GY - TY); c.fillStyle = d.col; c.fillRect(GX - K * 0.14, TY, K * 0.28, K * 0.12); return [GX, TY]; });
      c.save(); c.shadowColor = d.col; c.shadowBlur = K * 0.4; c.strokeStyle = `rgba(${rgb},.9)`; c.lineWidth = Math.max(1.5, K / 12); c.beginPath(); c.moveTo(tops[0][0], tops[0][1] + K * 0.06); c.lineTo(tops[1][0], tops[1][1] + K * 0.06); c.stroke(); c.restore(); break; } }); });
  // command plaza + HQ fountain basin + spire base ring + spaceport pads
  [[CMD_PLAZA, 3.2, '#5ff3ff'], [FOUNTAIN, 2.6, '#F6F4EF'], [SPIRE, 5, '#f2c96b']].forEach(([o, rad, col]) => { const [X, Y] = S3(o.x, o.y, 0), rgb = rgbOf(col).join(','); c.fillStyle = `rgba(${rgb},.08)`; c.beginPath(); c.ellipse(X, Y, rad * K, rad * K * TILT, 0, 0, 7); c.fill(); c.strokeStyle = `rgba(${rgb},.7)`; c.lineWidth = 1.5; [1, 0.72, 0.45].forEach(f => { c.beginPath(); c.ellipse(X, Y, rad * K * f, rad * K * TILT * f, 0, 0, 7); c.stroke(); }); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.beginPath(); c.moveTo(X + Math.cos(a) * rad * K * 0.45, Y + Math.sin(a) * rad * K * TILT * 0.45); c.lineTo(X + Math.cos(a) * rad * K, Y + Math.sin(a) * rad * K * TILT); c.stroke(); } });
  PADS.forEach(([x, y]) => { const [X, Y] = S3(x, y, 0.02); c.fillStyle = 'rgba(10,18,30,.92)'; c.beginPath(); c.ellipse(X, Y, K * 1.9, K * 1.9 * TILT, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(179,255,95,.85)'; c.lineWidth = Math.max(1.5, K / 16); c.stroke(); c.beginPath(); c.ellipse(X, Y, K * 1.2, K * 1.2 * TILT, 0, 0, 7); c.strokeStyle = 'rgba(95,243,255,.5)'; c.stroke(); });
  // sky-rail shadow + pillar feet
  c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = K * 0.5; c.beginPath(); RAIL.forEach((p, k) => { const q = S3(p[0] + RAIL_Z * SH[0], p[1] + RAIL_Z * SH[1], 0); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath(); c.stroke();
  RAIL.forEach((p, k) => { if (k % 6) return; const [X, Y] = S3(p[0], p[1], 0); c.fillStyle = 'rgba(95,243,255,.25)'; c.beginPath(); c.ellipse(X, Y, K * 0.35, K * 0.15, 0, 0, 7); c.fill(); });
}
let TILES = new Map(), TSW = 1024;
function buildGround() {
  gdpr = Math.min(dpr, Math.sqrt(1.0e7 / (WPX * HPX))); TILES = new Map(); ground = true;
  // minimap thumbnail: a lite render of the whole world + district markers
  miniImg = document.createElement('canvas'); miniImg.width = 200; miniImg.height = Math.round(200 * HPX / WPX); const mc = miniImg.getContext('2d'), ms = miniImg.width / WPX;
  mc.fillStyle = '#04070d'; mc.fillRect(0, 0, miniImg.width, miniImg.height); mc.save(); mc.scale(ms, ms); drawGroundTo(mc, true); mc.restore();
  mc.strokeStyle = 'rgba(242,201,107,.6)'; mc.lineWidth = 1; mc.beginPath(); RAIL.forEach((p, k) => { const q = S3(p[0], p[1], 0); k ? mc.lineTo(q[0] * ms, q[1] * ms) : mc.moveTo(q[0] * ms, q[1] * ms); }); mc.closePath(); mc.stroke();
  DISTRICTS.forEach(d => { const q = S3(d.cx, d.cy, 0); mc.fillStyle = d.col; mc.font = '700 9px system-ui, sans-serif'; mc.textAlign = 'center'; mc.textBaseline = 'middle'; mc.fillText(d.short.toUpperCase(), q[0] * ms, q[1] * ms - d.R * K * TILT * ms - 4); });
  ALLB.forEach(b => { const q = S3(b.cx, b.cy, 0); mc.fillStyle = b.dist ? b.dist.col : b === HQ ? '#F6F4EF' : b === AI ? '#ff4d6d' : b.type === 'home' ? '#3a5a80' : '#5ff3ff'; const sz = b.type === 'home' || b.dist ? 3 : 5; mc.fillRect(q[0] * ms - sz / 2, q[1] * ms - sz / 2, sz, sz); });
}
function groundTile(ix, iy) { const key = ix + ',' + iy; let tl = TILES.get(key); if (tl) return tl; const cv2 = document.createElement('canvas'); cv2.width = Math.ceil(TSW * gdpr); cv2.height = Math.ceil(TSW * gdpr); const c = cv2.getContext('2d'); c.setTransform(gdpr, 0, 0, gdpr, -ix * TSW * gdpr, -iy * TSW * gdpr); drawGroundTo(c, false); TILES.set(key, cv2); return cv2; }

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
  const c = cv2.getContext('2d'); c.scale(dpr, dpr); c.fillStyle = opt.bg || 'rgba(4,14,26,.82)'; c.beginPath(); c.roundRect ? c.roundRect(0.75, 0.75, pw - 1.5, ph - 1.5, Math.min(ph / 2, K * 0.18)) : c.rect(0, 0, pw, ph); c.fill(); c.strokeStyle = opt.edge || 'rgba(95,243,255,.8)'; c.lineWidth = 1.25; c.stroke();
  if (opt.pin) { c.beginPath(); c.moveTo(pw / 2 - 4, ph); c.lineTo(pw / 2, ph + 4); c.lineTo(pw / 2 + 4, ph); c.fill(); }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = opt.fg || '#bff9ff'; c.font = f1; c.fillText(lines[0], pw / 2, lines[1] ? K * 0.3 : ph / 2 + 0.5);
  if (lines[1]) { c.font = f2; c.fillStyle = opt.fg2 || 'rgba(246,244,239,.75)'; c.fillText(lines[1], pw / 2, K * 0.7); }
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
  c.fillStyle = C.lit; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = FONT(700, K * 0.27); c.fillText(fitText(c, 'TODAY · ' + (ev.todays.length ? `${ev.todays.length} event${ev.todays.length > 1 ? 's' : ''}` : 'no events'), wmax), x, y); y += K * 0.36;
  c.font = FONT(500, K * 0.24); (ev.todays.slice(0, 2)).forEach(e => { c.fillText(fitText(c, `${e.allDay ? 'All day' : e.time || ''} ${e.title || ''}`.trim(), wmax), x, y); y += K * 0.3; });
  c.font = FONT(700, K * 0.24); c.fillStyle = C.tan; c.fillText(fitText(c, ev.next ? 'NEXT · ' + evWhen(ev.next) : 'NEXT · nothing scheduled', wmax), x, y); y += K * 0.3;
  c.font = FONT(500, K * 0.24); c.fillStyle = C.cream; if (ev.next) { c.fillText(fitText(c, ev.next.title || '(untitled)', wmax), x, y); y += K * 0.3; }
  if (ADMIN) { const pf = promisedByDay()[today()] || []; c.font = FONT(600, K * 0.22); c.fillStyle = C.red; if (y < f.y + f.h - 4) c.fillText(fitText(c, board('Gatepost Tasks', 'promised_followups') ? `Promised today: ${pf.length}` : 'Promised: waiting for Tasks', wmax), x, y); } }
function drawHarborSign(c, s) { const f = s.face; c.fillStyle = C.tan; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = FONT(700, K * 0.28);
  c.fillText('LAUNCH PAD', f.x + f.w / 2, f.y + f.h * (ADMIN ? 0.3 : 0.5)); if (ADMIN) { const n = sentToday(); c.font = FONT(600, K * 0.25); c.fillText(fitText(c, `Sent today: ${n}`, f.w - 8), f.x + f.w / 2, f.y + f.h * 0.72); } }
function drawItem(c, item, X, Y, u) { // glowing data packets: letter = outbound message (gold), crate = files (green), scroll = update (cyan)
  const col = item === 'letter' ? '242,201,107' : item === 'crate' ? '61,220,151' : '95,243,255', s = 2.4 * u;
  c.fillStyle = `rgba(${col},.22)`; c.beginPath(); c.arc(X, Y - s * 0.4, s * 1.9, 0, 7); c.fill();
  c.fillStyle = `rgba(${col},.95)`; c.beginPath(); c.moveTo(X, Y - s * 1.5); c.lineTo(X + s, Y - s * 0.4); c.lineTo(X, Y + s * 0.7); c.lineTo(X - s, Y - s * 0.4); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.moveTo(X, Y - s * 1.5); c.lineTo(X + s, Y - s * 0.4); c.lineTo(X, Y - s * 0.4); c.closePath(); c.fill();
}
function drawRobot(c, ch, t) {
  const bt = BOTS[ch.i], u = K / 12, [X, Y] = S3(ch.x, ch.y, 0), idle = !ch.walking && ch.where === 'work' && isIdle(ch.i);
  const ph = ch.dist * (ch.running ? 4.4 : 3.2), sw = ch.walking ? Math.sin(ph) : 0, bob = ch.walking ? -Math.abs(Math.sin(ph)) * (ch.running ? 1.4 : 0.9) : idle ? Math.sin(t * 1.2 + ch.i) * 0.25 + 1.2 : Math.sin(t * 2.2 + ch.i) * 0.35;
  { const g = c.createRadialGradient(X, Y, 0, X, Y, 4 * u); g.addColorStop(0, bt.color === '#F6F4EF' ? 'rgba(246,244,239,.5)' : 'rgba(' + rgbOf(bt.color).join(',') + ',.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.ellipse(X, Y, 4 * u, 1.5 * u, 0, 0, 7); c.fill(); }
  const r = (x, y, w, h, col, rad = 0) => { c.fillStyle = col; c.beginPath(); c.roundRect ? c.roundRect(X + x * u, Y + (y + bob) * u, w * u, h * u, rad * u) : c.rect(X + x * u, Y + (y + bob) * u, w * u, h * u); c.fill(); };
  if (!idle) { r(-1.9 + sw * 0.6, -2.6, 1.4, 2.6, C.ink, 0.5); r(0.5 - sw * 0.6, -2.6, 1.4, 2.6, C.ink, 0.5); } else { r(-2.6, -1.6, 2.2, 1.4, C.ink, 0.5); r(0.4, -1.6, 2.2, 1.4, C.ink, 0.5); }
  r(-2.9, -6.7, 5.8, 4.4, C.ink, 1.2); r(-2.4, -6.2, 4.8, 3.4, bt.color, 0.9); r(-1.0, -5.4, 2.0, 1.2, 'rgba(255,255,255,.25)', 0.4);
  const work = !ch.walking && ch.where === 'work' && !idle, arm = work ? Math.max(0, Math.sin(t * (ch.busyT > 0 || current(bt.name) ? 9 : 5) + ch.i * 2)) * 1.6 : ch.walking ? sw * 0.8 : 0;
  if (ch.carry) { r(-3.9, -10.6, 1.1, 4.4, C.ink, 0.5); r(2.8, -10.6, 1.1, 4.4, C.ink, 0.5); }
  else { r(-3.9, -6.1 - arm, 1.1, 2.7, C.ink, 0.5); r(2.8, -6.1 + (work ? 0 : -arm), 1.1, 2.7, C.ink, 0.5); }
  r(-3.2, -11.8, 6.4, 5.3, '#1c2738', 1.6); r(-2.7, -11.3, 5.4, 4.3, '#060b14', 1.2);
  const blink = idle || (t + ch.blink) % 4 < 0.14, look = (ch.walking ? ch.face : ch.i === 1 ? Math.sin(t * 0.8) : 0) * 0.6;
  const eye = idle ? '#3a5068' : bt.color === '#F6F4EF' ? C.lit : bt.color; if (!blink) { r(-2.0 + look, -9.6, 4.0, 0.9, eye, 0.45); } else { r(-2.0, -9.2, 4.0, 0.3, eye); }
  
  r(-0.25, -13.6, 0.5, 1.9, C.ink);
  c.fillStyle = idle ? '#3a5068' : (ch.busyT > 0 || (ADMIN && current(bt.name))) ? (Math.sin(t * 10) > 0 ? C.tan : C.lit) : bt.color; c.beginPath(); c.arc(X, Y + (-13.9 + bob) * u, 1.05 * u, 0, 7); c.fill();
  if (ch.carry) drawItem(c, ch.carry, X, Y + (-15.6 + bob) * u, u);
}
function drawRobotOver(c, ch, t) { // tags, thought bubbles, Zz (drawn above everything)
  const bt = BOTS[ch.i], u = K / 12, [X, Y] = S3(ch.x, ch.y, 0); if (ch.where === 'home' && !ch.walking) return;
  if (ch.tagT > 0 && ch.errand && ch.errand.label) { const p = pill([ch.errand.label], { bg: C.lit, fg: C.ink, edge: '#fff' }); c.globalAlpha = Math.min(1, ch.tagT); c.drawImage(p.img, X - p.w / 2, Y - 21 * u - p.h, p.w, p.h); c.globalAlpha = 1; return; }
  if (ch.walking) return;
  const cur = ADMIN && current(bt.name);
  if (cur) { const txt = '> ' + ((cur.body || '').length > 26 ? cur.body.slice(0, 25) + '…' : cur.body), p = pill([txt, hm(cur.created_at) + ' · ETA ' + (cur.eta || '').slice(0, 20)], { bg: 'rgba(4,16,30,.92)', fg: '#bff9ff', fg2: C.tan }), bx = X - p.w / 2, by = Y - 17 * u - p.h - Math.sin(t * 2 + ch.i) * 1.5;
    c.fillStyle = 'rgba(4,16,30,.92)'; c.strokeStyle = C.lit; c.lineWidth = 1; [[X + 1.5 * u, Y - 15.6 * u, 1.0 * u], [X + 3 * u, Y - 16.8 * u, 1.4 * u]].forEach(([a, b, rr2]) => { c.beginPath(); c.arc(a, b, rr2, 0, 7); c.fill(); c.stroke(); });
    c.drawImage(p.img, bx, by, p.w, p.h); return; }
  if (!ch.walking && ch.where === 'work' && isIdle(ch.i)) { const la = lastActive(bt.name), p = pill(['IDLE', la ? 'last active ' + ago(new Date(la).toISOString()) : 'no activity logged'], { bg: 'rgba(10,14,24,.85)', fg: '#8aa0b8', fg2: '#6a7f96', edge: 'rgba(138,160,184,.5)' }); c.globalAlpha = 0.75 + 0.25 * Math.sin(t * 1.5 + ch.i); c.drawImage(p.img, X - p.w / 2, Y - 17 * u - p.h, p.w, p.h); c.globalAlpha = 1; return; }
  const la = ADMIN ? ACTS.find(a => a.bot === bt.name) : null;
  if (la && Date.now() - Date.parse(la.created_at) < 45 * 60e3 && (t + ch.emote) % 9 < 4) { const body = la.body || '', p = pill(['> ' + (body.length > 28 ? body.slice(0, 27) + '…' : body), hm(la.created_at) + ' · ' + ago(la.created_at)], { bg: 'rgba(4,16,30,.9)', fg: '#bff9ff', fg2: C.tan }); c.drawImage(p.img, X - p.w / 2, Y - 17 * u - p.h, p.w, p.h); return; }
  if (ch.where === 'work' && (t + ch.emote) % 7 < 1.9) { const k = ((t + ch.emote) % 7) / 1.9, pop = Math.min(1, k * 6) * (k > 0.85 ? (1 - k) / 0.15 : 1), p = pill([bt.glyph], { bg: 'rgba(4,16,30,.85)', fg: C.lit });
    c.globalAlpha = pop; c.drawImage(p.img, X + 3 * u, Y - 18 * u - p.h, p.w, p.h); c.globalAlpha = 1; }
}
function drawShip(c, t) { // delivery shuttle: hovers on the pad, launches when packets arrive
  if (ship.state === 'away') return; const moving = ship.state === 'leaving' || ship.state === 'returning', lift = ship.lift + Math.sin(t * 2) * 0.06;
  const [X, Yg] = S3(ship.x, SHIP_Y, 0), [, Y] = S3(ship.x, SHIP_Y, lift), u = K;
  c.fillStyle = 'rgba(95,243,255,.18)'; c.beginPath(); c.ellipse(X, Yg, u * 1.4, u * 0.4, 0, 0, 7); c.fill();
  c.save(); c.translate(X, Y);
  const fl = 0.6 + 0.4 * Math.sin(t * 30); if (moving) { c.fillStyle = 'rgba(242,201,107,.25)'; c.fillRect(-u * 0.5, u * 0.3, u, (Yg - Y) - u * 0.3); } c.fillStyle = `rgba(242,201,107,${0.5 * fl})`; [-1.1, 1.1].forEach(x => { c.beginPath(); c.moveTo(u * (x - 0.22), u * 0.18); c.lineTo(u * x, u * (0.6 + fl * 0.3 + (moving ? 0.3 : 0))); c.lineTo(u * (x + 0.22), u * 0.18); c.fill(); });
  if (moving) { c.strokeStyle = 'rgba(95,243,255,.5)'; c.lineWidth = Math.max(1, K / 16); for (let k = 0; k < 3; k++) { const o = (t * 3 + k * 0.4) % 1.5; c.beginPath(); c.moveTo(u * (1.8 + o), u * (-0.1 + k * 0.12)); c.lineTo(u * (2.6 + o), u * (-0.1 + k * 0.12)); c.stroke(); } }
  c.shadowColor = '#5ff3ff'; c.shadowBlur = K * 0.5;
  c.fillStyle = '#16213a'; c.strokeStyle = '#5ff3ff'; c.lineWidth = Math.max(1, K / 22); c.beginPath(); c.moveTo(-u * 2.1, 0); c.quadraticCurveTo(-u * 1.4, -u * 0.75, u * 0.2, -u * 0.7); c.quadraticCurveTo(u * 1.6, -u * 0.6, u * 1.9, 0); c.quadraticCurveTo(u * 0.2, u * 0.32, -u * 2.1, 0); c.closePath(); c.fill(); c.stroke();
  c.shadowBlur = 0; c.fillStyle = 'rgba(95,243,255,.75)'; c.beginPath(); c.ellipse(u * 0.75, -u * 0.38, u * 0.55, u * 0.2, -0.12, 0, 7); c.fill();
  [-1.1, 1.1].forEach(x => { c.fillStyle = '#0c1424'; c.fillRect(u * (x - 0.3), u * 0.02, u * 0.6, u * 0.2); c.fillStyle = C.tan; c.fillRect(u * (x - 0.3), u * 0.18, u * 0.6, u * 0.05); });
  for (let k = 0; k < ship.cargo && k < 3; k++) { c.fillStyle = 'rgba(242,201,107,.95)'; c.fillRect(u * (-1.25 + k * 0.4), -u * 0.42, u * 0.28, u * 0.22); }
  c.fillStyle = (t % 1) < 0.5 ? C.red : C.lit; c.beginPath(); c.arc(-u * 2.0, -u * 0.05, Math.max(1.5, u * 0.07), 0, 7); c.fill();
  c.restore();
}
const clouds = [{ x: 3, y: 8, s: 3.6, v: 0.16 }, { x: 16, y: 20, s: 3.0, v: 0.12 }, { x: 9, y: 30, s: 2.6, v: 0.2 }, { x: 22, y: 4, s: 2.8, v: 0.14 }];
const flies = Array.from({ length: 48 }, (_, k) => ({ x: (k * 7.3) % WX, y: 4 + (k * 11.7) % 74, p: k * 1.7 }));
const puffs = [];
let ZM = 1; const ZMIN = 0.3, ZMAX = 2.5, VW = () => W / ZM, VH = () => H / ZM;
function inView(x, y, w, h) { return x + w > cam.x - 20 && x < cam.x + VW() + 20 && y + h > cam.y - 20 && y < cam.y + VH() + 20; }
let LABELRECTS = [];

// black robot on a tower closer to town; constant red beam to a tower beside the black house
const BOSS = { x: 70, y: 27 };
const RELAY = { x: 78.6, y: 20.6 };
function towerAt(c, x, y, h, col) {
  const [X, Y] = S3(x, y, 0), [, Yt] = S3(x, y, h);
  c.fillStyle = 'rgba(255,77,109,.15)'; c.beginPath(); c.ellipse(X, Y, K * 1.1, K * 0.35, 0, 0, 7); c.fill();
  c.fillStyle = col; c.beginPath(); c.moveTo(X - K * 0.5, Y); c.lineTo(X - K * 0.18, Yt); c.lineTo(X + K * 0.18, Yt); c.lineTo(X + K * 0.5, Y); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,77,109,.75)'; c.lineWidth = Math.max(1, K / 28); c.stroke();
  for (let k = 0.6; k < h; k += 0.9) { const [, yy] = S3(x, y, k), w2 = K * (0.5 - 0.32 * k / h); c.fillStyle = 'rgba(255,77,109,.5)'; c.fillRect(X - w2, yy, w2 * 2, 1); }
  return [X, Yt];
}
function drawBoss(c, t) { // the AI core: a floating, pulsing sphere above a pylon, linked to the relay by the house
  const [bx, by] = towerAt(c, BOSS.x, BOSS.y, 4.6, '#10131f');
  const [rx, ry] = towerAt(c, RELAY.x, RELAY.y, 3.2, '#10131f');
  const hot = Math.max(0, pulseT), cy = by - K * (0.9 + Math.sin(t * 1.4) * 0.08), R = K * (0.55 + hot * 0.08);
  const pulse = 0.7 + 0.3 * Math.sin(t * (4 + hot * 6));
  c.save(); c.shadowColor = '#ff4d6d'; c.shadowBlur = K * 0.6;
  c.strokeStyle = 'rgba(255,77,109,' + (0.55 * pulse) + ')'; c.lineWidth = Math.max(2, K * 0.12); c.beginPath(); c.moveTo(bx, cy); c.lineTo(rx, ry - K * 0.3); c.stroke();
  c.strokeStyle = 'rgba(255,220,230,' + (0.8 * pulse) + ')'; c.lineWidth = Math.max(1, K * 0.035); c.stroke(); c.restore();
  for (let k = 0; k < 3; k++) { const f = (t * 0.6 + k / 3) % 1, [px, py] = [bx + (rx - bx) * f, cy + (ry - K * 0.3 - cy) * f]; c.fillStyle = 'rgba(255,240,245,.9)'; c.beginPath(); c.arc(px, py, Math.max(1.5, K * 0.06), 0, 7); c.fill(); }
  const g = c.createRadialGradient(bx, cy, 0, bx, cy, R * 3); g.addColorStop(0, 'rgba(255,77,109,' + (0.35 + hot * 0.25) + ')'); g.addColorStop(1, 'rgba(255,77,109,0)'); c.fillStyle = g; c.fillRect(bx - R * 3, cy - R * 3, R * 6, R * 6);
  const g2 = c.createRadialGradient(bx - R * 0.3, cy - R * 0.3, R * 0.1, bx, cy, R); g2.addColorStop(0, '#fff'); g2.addColorStop(0.35, '#ff8aa0'); g2.addColorStop(1, '#5a0c22'); c.fillStyle = g2; c.beginPath(); c.arc(bx, cy, R, 0, 7); c.fill();
  c.strokeStyle = 'rgba(255,180,195,.8)'; c.lineWidth = Math.max(1, K / 30);
  [[t * 0.9, 1.6, 0.45], [-t * 0.7 + 1, 1.35, 0.8]].forEach(([a, s2, sq]) => { c.beginPath(); c.ellipse(bx, cy, R * s2, R * s2 * sq, a % Math.PI, 0, 7); c.stroke(); });
  c.fillStyle = 'rgba(255,240,245,.9)'; c.font = FONT(700, K * 0.24); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('AI CORE', bx, by + K * 0.35);
  LABELRECTS.push({ x: bx - R * 1.8, y: cy - R * 1.8, w: R * 3.6, h: R * 3.6 + K * 0.6, tap: 'ai' });
  // sentinel at the core house door
  const door = doorOf(AI), [ax, ay] = S3(door[0], door[1], 0), au = K / 14;
  c.fillStyle = '#0e1220'; c.beginPath(); c.arc(ax, ay - 6 * au, 2.2 * au, 0, 7); c.fill(); c.fillRect(ax - 1.6 * au, ay - 4 * au, 3.2 * au, 4 * au);
  c.fillStyle = '#ff4d6d'; c.fillRect(ax - 1.4 * au, ay - 6.5 * au, 2.8 * au, 0.8 * au);
}
function drawFrame(t, dt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSky(t);
  { const k = dpr * ZM, x0 = Math.max(0, Math.floor(cam.x / TSW)), y0 = Math.max(0, Math.floor(cam.y / TSW)), x1 = Math.min(Math.ceil(WPX / TSW) - 1, Math.floor((cam.x + VW()) / TSW)), y1 = Math.min(Math.ceil(HPX / TSW) - 1, Math.floor((cam.y + VH()) / TSW));
    let budget = TILES.size ? 1 : 99; const wb = (HPX - cam.y) * k; if (wb < cv.height) { ctx.fillStyle = '#020b14'; ctx.fillRect(0, wb, cv.width, cv.height - wb); }
    for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) { let tl = TILES.get(ix + ',' + iy); if (!tl && budget-- > 0) tl = groundTile(ix, iy); if (tl) ctx.drawImage(tl, (ix * TSW - cam.x) * k, (iy * TSW - cam.y) * k, TSW * k + 0.5, TSW * k + 0.5); else { ctx.fillStyle = C.g2; ctx.fillRect((ix * TSW - cam.x) * k, Math.max(0, (iy * TSW - cam.y) * k), TSW * k, TSW * k); } } }
  ctx.setTransform(dpr * ZM, 0, 0, dpr * ZM, -cam.x * dpr * ZM, -cam.y * dpr * ZM);
  // data streams along the paths (packets of light)
  ctx.fillStyle = 'rgba(160,250,255,.9)';
  for (let n = 0; n < EDGES.length; n++) { const e = EDGES[n], P = e.pts; if (e.b === 'dock' || P.length < 2) continue; const cnt = e.faint ? 3 : 2;
    for (let j = 0; j < cnt; j++) { let f = ((t * (e.faint ? 0.35 : 0.12) + j / cnt + n * 0.137) % 1); if (n % 2) f = 1 - f; const fi = f * (P.length - 1), i0 = Math.floor(fi), a = P[i0], b2 = P[Math.min(P.length - 1, i0 + 1)], q = fi - i0, [X, Y] = S3(a[0] + (b2[0] - a[0]) * q, a[1] + (b2[1] - a[1]) * q, 0.05);
      if (!inView(X - 6, Y - 6, 12, 12)) continue; ctx.fillStyle = e.faint ? 'rgba(255,120,140,.9)' : 'rgba(160,250,255,.9)'; ctx.fillRect(X - K * 0.07, Y - K * 0.04, K * 0.14, K * 0.08); ctx.fillStyle = e.faint ? 'rgba(255,77,109,.2)' : 'rgba(95,243,255,.18)'; ctx.fillRect(X - K * 0.22, Y - K * 0.1, K * 0.44, K * 0.2); } }
  // real-event pulses
  for (let k = PULSES.length - 1; k >= 0; k--) { const p = PULSES[k]; p.t += dt; if (p.t > 2.4) { PULSES.splice(k, 1); continue; } const [X, Y] = S3(p.x, p.y, 0.05), rr2 = K * (0.6 + p.t * 2.2); ctx.strokeStyle = p.col + (1 - p.t / 2.4) * 0.9 + ')'; ctx.lineWidth = Math.max(1.5, K / 12); ctx.beginPath(); ctx.ellipse(X, Y, rr2, rr2 * TILT, 0, 0, 7); ctx.stroke(); }
  if (pulseT > 0) pulseT -= dt;
  // water life
  ctx.strokeStyle = 'rgba(95,243,255,.35)'; ctx.lineWidth = Math.max(1, K / 22);
  for (let k = 0; k < 80; k++) { const dir = k % 2 ? 1 : -1, wx = (((k * 5.37) % WX) + t * 0.22 * dir + WX * 4) % WX, wy = 82.8 + ((k * 3.91) % 9), s = 0.25 + (k % 5) * 0.08; if (wx > PIER.x0 - 0.3 && wx < PIER.x1 + 0.3) continue; const [X, Y] = S3(wx, wy, 0); if (!inView(X - 20, Y - 10, 40, 20)) continue;
    ctx.beginPath(); ctx.moveTo(X - s * K, Y); ctx.quadraticCurveTo(X, Y - K * (0.1 + Math.sin(t * 2 + k) * 0.04), X + s * K, Y); ctx.stroke(); }
  // depth-sorted world objects
  const list = [];
  SPRITES.forEach(s => { if (inView(s.x, s.y, s.w, s.h)) list.push({ k: s.key, s }); });
  chars.forEach(ch => { if (ch.where === 'home' && !ch.walking) return; list.push({ k: ch.y + 0.01, ch }); });
  list.push({ k: SHIP_Y, ship: 1 });
  pierCrates.forEach((it, k) => list.push({ k: PIER.y0 + 3.9 + k * 0.01, crate: [PIER.x0 + 0.3 + (k % 2) * 0.5, PIER.y0 + 3.8 - Math.floor(k / 2) * 0.45, it] }));
  list.sort((a, b) => a.k - b.k).forEach(o => {
    if (o.s) { ctx.drawImage(o.s.img, o.s.x, o.s.y, o.s.w, o.s.h); if (o.s.after) o.s.after(ctx, o.s); }
    else if (o.ch) drawRobot(ctx, o.ch, t); else if (o.ship) drawShip(ctx, t);
    else if (o.crate) { const [x, y, it] = o.crate; drawSolid(ctx, boxS({ cx: x, cy: y, rot: 0 }, 0, 0, 0.42, 0.42, 0.3, 0.72, it === 'letter' ? '#f2c96b' : '#3ddc97')); } });
  drawCity(t, dt);
  // building animation bits
  const flag = (p, col) => { const [fx, fy] = S3(p[0], p[1], p[2] + 1.0), wv = Math.sin(t * 4.5) * K * 0.08; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + K * 0.4, fy + wv, fx + K * 0.75, fy + K * 0.17 + wv); ctx.quadraticCurveTo(fx + K * 0.4, fy + K * 0.36, fx, fy + K * 0.36); ctx.fill(); };
  if (BOTS[0].b.ex) flag(BOTS[0].b.ex.flag, 'rgba(95,243,255,.75)'); if (HQ.ex) flag(HQ.ex.flag, 'rgba(242,201,107,.8)');
  const bc = BOTS[1].b.ex; if (bc) { const [X, Y] = S3(...bc.beacon), on = (Math.sin(t * 3) + 1) / 2; ctx.fillStyle = `rgba(61,220,151,${0.4 + on * 0.6})`; ctx.beginPath(); ctx.arc(X, Y, K * (0.12 + on * 0.06), 0, 7); ctx.fill(); ctx.strokeStyle = `rgba(61,220,151,${0.6 * (1 - (t * 0.6 % 1))})`; ctx.lineWidth = 1.5; const rr3 = K * (0.3 + (t * 0.6 % 1) * 3); ctx.beginPath(); ctx.ellipse(X, Y, rr3, rr3 * 0.4, 0, 0, 7); ctx.stroke(); }
  const hk = BOTS[4].b.ex; if (hk) { const [X, Y] = S3(...hk.hook), sx = X + Math.sin(t * 1.3) * K * 0.25; ctx.strokeStyle = C.lit; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(sx, Y + K * 1.2); ctx.stroke(); ctx.fillStyle = C.tan; ctx.fillRect(sx - K * 0.12, Y + K * 1.2, K * 0.24, K * 0.18); }
  if (Math.random() < dt * 2.0) { const i = Math.floor(Math.random() * BOTS.length), e = BOTS[i].home.ex; if (e && (chars[i].where === 'home' || Math.random() < 0.3)) puffs.push({ p: S3(...e.chimney), a: 1, r: 0.12 }); }
  for (let k = puffs.length - 1; k >= 0; k--) { const p = puffs[k]; p.p[1] -= dt * K * 0.45; p.p[0] += dt * K * 0.15; p.r += dt * 0.12; p.a -= dt * 0.45; if (p.a <= 0) { puffs.splice(k, 1); continue; } ctx.fillStyle = `rgba(95,243,255,${p.a * 0.5})`; ctx.fillRect(p.p[0] - p.r * K * 0.3, p.p[1] - p.r * K * 0.3, p.r * K * 0.6, p.r * K * 0.6); }
  if (dark < 0.2) { clouds.forEach(cl => { cl.x += cl.v * dt; if (cl.x > WX + cl.s) cl.x = -cl.s; const [X, Y] = S3(cl.x, cl.y, 0); ctx.fillStyle = 'rgba(60,70,60,.06)'; ctx.beginPath(); ctx.ellipse(X, Y, cl.s * K, cl.s * K * 0.4, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(X + cl.s * K * 0.5, Y - cl.s * K * 0.12, cl.s * K * 0.6, cl.s * K * 0.3, 0, 0, 7); ctx.fill(); });
    for (let k = 0; k < 3; k++) { const a = t * (0.3 + k * 0.08) + k * 2, [X, Y] = S3(9 + k * 5 + Math.cos(a) * 3, 40 + Math.sin(a) * 1.2, 2.5), f = Math.sin(t * 6 + k) * K * 0.1; ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(1, K / 26); ctx.beginPath(); ctx.moveTo(X - K * 0.25, Y - f); ctx.quadraticCurveTo(X - K * 0.1, Y - K * 0.12, X, Y); ctx.quadraticCurveTo(X + K * 0.1, Y - K * 0.12, X + K * 0.25, Y - f); ctx.stroke(); } }
  // light: tint + night, then glows
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (warm > 0) { ctx.fillStyle = `rgba(242,160,90,${warm})`; ctx.fillRect(0, 0, W, H); }
  if (dark > 0) { ctx.fillStyle = `rgba(14,18,46,${dark})`; ctx.fillRect(0, 0, W, H); }
  ctx.setTransform(dpr * ZM, 0, 0, dpr * ZM, -cam.x * dpr * ZM, -cam.y * dpr * ZM);
  if (dark > 0.15) { const glow = (x, y, z, s) => { const [X, Y] = S3(x, y, z); if (!inView(X - s * K, Y - s * K, 2 * s * K, 2 * s * K)) return; const g = ctx.createRadialGradient(X, Y, 1, X, Y, K * s); g.addColorStop(0, `rgba(95,243,255,${dark * 0.6})`); g.addColorStop(1, 'rgba(95,243,255,0)'); ctx.fillStyle = g; ctx.fillRect(X - K * s, Y - K * s, 2 * K * s, 2 * K * s); };
    BOTS.forEach((bt, i) => { glow(bt.b.cx, bt.b.cy + bt.b.d / 2, 1.2, 2.4); if (!atWork(hour)) glow(bt.home.cx, bt.home.cy + 1, 0.8, 1.6); }); glow(HQ.cx, HQ.cy + HQ.d / 2, 1.3, 2.8);
    LAMPS.forEach(([x, y]) => glow(x, y, 1.75, 1.4)); LANTERNS.forEach(([x, y], k) => glow(x, y, 1.9, 1.3 * (0.9 + Math.sin(t * 7 + k * 2) * 0.08))); glow(ship.x + 1.85, SHIP_Y, 1.1, 1.2);
    flies.forEach(f => { const a = (Math.sin(t * 2 + f.p) + 1) / 2, [X, Y] = S3(f.x + Math.sin(t * 0.5 + f.p) * 0.8, f.y + Math.cos(t * 0.4 + f.p) * 0.5, 0.6); ctx.fillStyle = `rgba(160,250,255,${a * 0.8})`; ctx.fillRect(X - 1, Y - 1, Math.max(1.5, K * 0.05), Math.max(1.5, K * 0.05)); }); }
  // floating signs: place name + live counts (admins), badges
  LABELRECTS = [];
  const sign = (b, lines, tap, badges, edge) => { const [X, Y] = S3(b.cx, b.cy, (b.ex && b.ex.top || 3) + 0.35 + Math.sin(t * 1.3 + b.cx) * 0.05), p = pill(lines, { pin: true, edge }); const x = X - p.w / 2, y = Y - p.h; if (!inView(x, y, p.w, p.h)) return;
    ctx.globalAlpha = 0.86 + 0.14 * Math.sin(t * 9 + b.cy * 3) * (Math.sin(t * 0.7 + b.cx) > 0.93 ? 1 : 0.15); ctx.drawImage(p.img, x, y, p.w, p.h); ctx.globalAlpha = 1; LABELRECTS.push({ x, y, w: p.w, h: p.h, tap }); (badges || []).forEach((bd, k) => badge(ctx, k ? x + 2 : x + p.w - 2, y + 2, bd.n, bd.col, t + k, bd.kind)); };
  BOTS.forEach((bt, i) => { const s = ADMIN ? stats(bt.name) : null, u = ADMIN ? unread(bt.name) : 0;
    const line2 = ADMIN ? signLine(i, s) : null;
    sign(bt.b, line2 ? [bt.place, line2] : [bt.place], i, ADMIN ? [s.pending && { n: s.pending, col: C.red, kind: 'count' }, u && { n: u, col: C.slate, kind: 'chat' }].filter(Boolean) : []); });
  const op = ADMIN ? otherPending() : 0, wq = ADMIN ? waitingQueue().length : 0;
  sign(HQ, ADMIN ? ['Christian\u2019s HQ', `${wq} waiting on you`] : ['Gatepost HQ'], 'hq', op ? [{ n: op, col: C.red, kind: 'count' }] : []);
  sign(AI, ['AI Core', 'tap to talk'], 'ai', [], 'rgba(255,77,109,.9)');
  districtSigns(t);
  drawBoss(ctx, t);
  chars.forEach(ch => drawRobotOver(ctx, ch, t));
  pops.forEach(p => { const k = p.t / 1.3, [X, Y] = S3(p.x, p.y, 1.6 + k * 0.9); ctx.globalAlpha = 1 - k; if (p.item) drawItem(ctx, p.item, X, Y, K / 14 * (1 - k * 0.5));
    ctx.fillStyle = 'rgba(61,220,151,.9)'; ctx.beginPath(); ctx.arc(X + K * 0.45, Y - K * 0.2, K * 0.24, 0, 7); ctx.fill(); ctx.fillStyle = C.cream; ctx.font = FONT(700, K * 0.3); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', X + K * 0.45, Y - K * 0.2 + 0.5); ctx.globalAlpha = 1; });
  drawHUD(t);
}
// ---------- HUD: scanlines, vignette, live clock + live counts (all from real data) ----------
// ---------- sky: parallax stars + aurora (screen space, behind the world) ----------
const STARS = Array.from({ length: 140 }, (_, k) => { const r = mulberry32(900 + k); return { x: r(), y: r(), z: 0.15 + r() * 0.5, s: r() < 0.1 ? 1.6 : 0.9, p: r() * 7 }; });
function drawSky(t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#02040b'); g.addColorStop(1, '#070c18'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  STARS.forEach(s => { const x = ((s.x * W * 1.5 - cam.x * ZM * s.z * 0.2) % (W * 1.5) + W * 1.5) % (W * 1.5) - W * 0.25, y = ((s.y * H * 1.4 - cam.y * ZM * s.z * 0.2) % (H * 1.4) + H * 1.4) % (H * 1.4) - H * 0.2; ctx.fillStyle = `rgba(220,240,255,${0.35 + 0.45 * Math.abs(Math.sin(t * 0.8 + s.p))})`; ctx.fillRect(x, y, s.s, s.s); });
  const top = (OY - cam.y) * ZM; if (top > -40) { const ay = Math.min(top, H) ; [[0.0, '61,220,151', 0.16], [1.7, '150,110,255', 0.12]].forEach(([ph, rgb, al]) => { ctx.beginPath(); ctx.moveTo(0, ay); for (let x = 0; x <= W; x += 24) ctx.lineTo(x, ay - 30 - Math.sin(x * 0.011 + t * 0.35 + ph - cam.x * ZM * 0.002) * 22 - Math.sin(x * 0.027 + t * 0.6 + ph) * 10 - 40); ctx.lineTo(W, ay); ctx.closePath(); const ag = ctx.createLinearGradient(0, ay - 110, 0, ay); ag.addColorStop(0, `rgba(${rgb},0)`); ag.addColorStop(1, `rgba(${rgb},${al})`); ctx.fillStyle = ag; ctx.fill(); }); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
// ---------- living city: district activity, workers, skybridges, sky-rail, drones, monuments ----------
function districtActive(d) { if (!ADMIN) return 0; if (typeof d.bot === 'number') { const bt = BOTS[d.bot], ch = chars[d.bot]; if (current(bt.name) || ch.busyT > 0 || (ch.errand && ch.errand.real)) return 1; const la = lastActive(bt.name); return la && Date.now() - la < 20 * 60e3 ? 0.6 : 0; }
  if (d.bot === 'hq') return reqs().some(r => r.status === 'pending') ? 0.5 : 0; if (d.bot === 'ai') return pulseT > 0 ? 1 : 0; if (d.bot === 'dock') return ship.state !== 'docked' ? 1 : 0; return 0; }
const WORKERS = [], DRONES = Array.from({ length: 16 }, (_, k) => ({ cx: 8 + (k * 13.7) % 80, cy: 8 + (k * 9.3) % 66, rx: 4 + (k % 4) * 2, ry: 3 + (k % 3) * 2, sp: 0.15 + (k % 5) * 0.05, p: k * 1.3, z: 5 + (k % 4) * 1.5 }));
const SPARKS = Array.from({ length: 36 }, (_, k) => ({ p: k / 36 * 9, a: k * 2.4 }));
let workerT = 0;
function drawCity(t, dt) {
  // district glows (brighter when that bot is really working)
  DISTRICTS.forEach(d => { const act = districtActive(d); d.act = (d.act || 0) + (act - (d.act || 0)) * Math.min(1, dt * 2); const [X, Y] = S3(d.cx, d.cy, 0), rx = d.R * K; if (!inView(X - rx, Y - rx * TILT, rx * 2, rx * 2 * TILT)) return;
    const a = 0.03 + d.act * (0.12 + 0.05 * Math.sin(t * 3)); if (a < 0.035 && !d.act) return; const g = ctx.createRadialGradient(X, Y, 0, X, Y, rx); const rgb = rgbOf(d.col).join(','); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X, Y, rx, rx * TILT, 0, 0, 7); ctx.fill(); });
  // workers carry packets out of active districts (only when real activity says so)
  if ((workerT -= dt) <= 0) { workerT = 0.9; DISTRICTS.forEach(d => { if ((d.act || 0) < 0.5 || WORKERS.length > 40 || !d.props.length || Math.random() > d.act) return; const from = d.lm || { cx: d.cx, cy: d.cy }, to = d.props[Math.floor(Math.random() * d.props.length)]; WORKERS.push({ x0: from.cx, y0: from.cy, x1: to.cx, y1: to.cy, t: 0, col: d.col }); }); }
  for (let k = WORKERS.length - 1; k >= 0; k--) { const w = WORKERS[k]; w.t += dt / 2.6; if (w.t >= 1) { WORKERS.splice(k, 1); continue; } const f = w.t < 0.5 ? w.t * 2 : 2 - w.t * 2, x = w.x0 + (w.x1 - w.x0) * f, y = w.y0 + (w.y1 - w.y0) * f, [X, Y] = S3(x, y, 1.6 + Math.sin(f * Math.PI) * 1.4); if (!inView(X - 10, Y - 10, 20, 20)) continue;
    ctx.fillStyle = '#0c1424'; ctx.fillRect(X - K * 0.18, Y - K * 0.08, K * 0.36, K * 0.16); ctx.fillStyle = w.col; ctx.fillRect(X - K * 0.24, Y - K * 0.1, K * 0.1, K * 0.04); ctx.fillRect(X + K * 0.14, Y - K * 0.1, K * 0.1, K * 0.04); if (w.t < 0.5) drawItem(ctx, 'scroll', X, Y + K * 0.32, K / 22); }
  // skybridges with data packets (faster out of active districts)
  BRIDGES.forEach(br => { const A = S3(br.a.cx, br.a.cy, 4.2), B = S3(br.b.cx, br.b.cy, 4.2), mx = (A[0] + B[0]) / 2, my = Math.min(A[1], B[1]) - K * 2.6; const vis = inView(Math.min(A[0], B[0]), my, Math.abs(A[0] - B[0]) + 1, Math.abs(A[1] - B[1]) + K * 3);
    const act = Math.max(br.a.act || 0, br.b.act || 0); if ((br.nt -= dt) <= 0) { br.nt = act > 0.4 ? 0.8 + Math.random() * 0.6 : 5 + Math.random() * 6; const fromA = (br.a.act || 0) >= (br.b.act || 0) ? Math.random() < 0.75 : Math.random() < 0.25; br.pk.push({ f: 0, dir: fromA ? 1 : -1, col: fromA ? br.a.col : br.b.col }); }
    for (let k = br.pk.length - 1; k >= 0; k--) { const pk = br.pk[k]; pk.f += dt * 0.12; if (pk.f >= 1) br.pk.splice(k, 1); }
    if (!vis) return; ctx.strokeStyle = 'rgba(95,243,255,.16)'; ctx.lineWidth = K * 0.3; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.quadraticCurveTo(mx, my, B[0], B[1]); ctx.stroke(); ctx.strokeStyle = 'rgba(160,250,255,.6)'; ctx.lineWidth = Math.max(1, K / 22); ctx.stroke();
    [A, B].forEach(P => { ctx.fillStyle = 'rgba(95,243,255,.8)'; ctx.beginPath(); ctx.arc(P[0], P[1], K * 0.12, 0, 7); ctx.fill(); });
    br.pk.forEach(pk => { const f = pk.dir > 0 ? pk.f : 1 - pk.f, u = 1 - f, x = u * u * A[0] + 2 * u * f * mx + f * f * B[0], y = u * u * A[1] + 2 * u * f * my + f * f * B[1]; ctx.fillStyle = pk.col; ctx.fillRect(x - K * 0.1, y - K * 0.1, K * 0.2, K * 0.2); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x - K * 0.2, y - K * 0.2, K * 0.4, K * 0.4); }); });
  // sky-rail loop: pillars, glowing rail, maglev pods
  for (let k = 0; k < RAIL.length; k += 6) { const p = RAIL[k], [X, Y] = S3(p[0], p[1], 0), [, Yt] = S3(p[0], p[1], RAIL_Z); if (!inView(X - 6, Yt, 12, Y - Yt)) continue; ctx.fillStyle = '#121b2b'; ctx.fillRect(X - K * 0.09, Yt, K * 0.18, Y - Yt); }
  ctx.strokeStyle = 'rgba(242,201,107,.22)'; ctx.lineWidth = K * 0.34; ctx.beginPath(); RAIL.forEach((p, k) => { const q = S3(p[0], p[1], RAIL_Z); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke(); ctx.strokeStyle = 'rgba(255,225,150,.85)'; ctx.lineWidth = Math.max(1, K / 20); ctx.stroke();
  for (let n = 0; n < 3; n++) { const f = ((t * 0.012 + n / 3) % 1) * RAIL.length; for (let s2 = 0; s2 < 4; s2++) { const fi = (f - s2 * 0.9 + RAIL.length) % RAIL.length, i0 = Math.floor(fi), a = RAIL[i0], b2 = RAIL[(i0 + 1) % RAIL.length], q = fi - i0, [X, Y] = S3(a[0] + (b2[0] - a[0]) * q, a[1] + (b2[1] - a[1]) * q, RAIL_Z + 0.25); if (!inView(X - 20, Y - 20, 40, 40)) continue;
    ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(X - K * 0.42, Y - K * 0.22, K * 0.84, K * 0.36, K * 0.16) : ctx.rect(X - K * 0.42, Y - K * 0.22, K * 0.84, K * 0.36); ctx.fill(); ctx.fillStyle = 'rgba(95,243,255,.9)'; ctx.fillRect(X - K * 0.34, Y - K * 0.14, K * 0.68, K * 0.1); } }
  // spire beacon + floating platforms + rising light motes
  { const [X, Y] = S3(SPIRE.x, SPIRE.y, 16.6), on = (Math.sin(t * 2.2) + 1) / 2; if (inView(X - K * 4, Y - K * 6, K * 8, K * 20)) { const g = ctx.createRadialGradient(X, Y, 0, X, Y, K * (1.6 + on)); g.addColorStop(0, `rgba(255,236,170,${0.7 + on * 0.3})`); g.addColorStop(1, 'rgba(242,201,107,0)'); ctx.fillStyle = g; ctx.fillRect(X - K * 3, Y - K * 3, K * 6, K * 6);
      const bg = ctx.createLinearGradient(0, Y - K * 12, 0, Y); bg.addColorStop(0, 'rgba(242,201,107,0)'); bg.addColorStop(1, `rgba(242,201,107,${0.25 + on * 0.2})`); ctx.fillStyle = bg; ctx.fillRect(X - K * 0.12, Y - K * 12, K * 0.24, K * 12); }
    for (let k = 0; k < 3; k++) { const a = t * 0.25 + k * 2.094, px = SPIRE.x + Math.cos(a) * 4.2, py = SPIRE.y + Math.sin(a) * 4.2, z = 5 + k * 2.5 + Math.sin(t * 1.3 + k) * 0.3; const pts = [[-1, -0.7], [1, -0.7], [1, 0.7], [-1, 0.7]].map(([dx, dy]) => S3(px + dx, py + dy, z)); if (!inView(pts[0][0] - 10, pts[0][1] - 10, K * 3, K * 3)) continue;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; const sh = S3(px + z * SH[0], py + z * SH[1], 0); ctx.beginPath(); ctx.ellipse(sh[0], sh[1], K, K * 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#16213a'; ctx.beginPath(); pts.forEach((q, j) => j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(242,201,107,.9)'; ctx.lineWidth = 1.5; ctx.stroke(); const [cx2, cy2] = S3(px, py, z); ctx.fillStyle = 'rgba(242,201,107,.35)'; ctx.fillRect(cx2 - K * 0.5, cy2, K, K * 0.5); } }
  // fountain of light (HQ plaza)
  { const [X, Y] = S3(FOUNTAIN.x, FOUNTAIN.y, 0); if (inView(X - K * 3, Y - K * 5, K * 6, K * 6)) SPARKS.forEach(s2 => { const f = ((t * 0.5 + s2.p) % 1.6) / 1.6, r2 = f * K * 1.6, h = Math.sin(f * Math.PI) * K * 3.2; ctx.fillStyle = `rgba(246,244,239,${0.9 * (1 - f)})`; ctx.fillRect(X + Math.cos(s2.a) * r2 - 1.5, Y + Math.sin(s2.a) * r2 * TILT - h - 1.5, 3, 3); }); }
  // holographic statue (Command plaza): a rotating wireframe android
  { const [X, Y] = S3(CMD_PLAZA.x, CMD_PLAZA.y, 0); if (inView(X - K * 3, Y - K * 6, K * 6, K * 7)) { const sx = Math.cos(t * 0.8), u = K * 0.42; ctx.strokeStyle = `rgba(95,243,255,${0.55 + 0.25 * Math.sin(t * 7) * (Math.sin(t * 0.9) > 0.9 ? 1 : 0.2)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(X, Y - u * 9.6, u * 1.4 * Math.abs(sx) + u * 0.3, u * 1.5, 0, 0, 7); ctx.stroke(); ctx.strokeRect(X - u * 2 * Math.abs(sx) - u * 0.4, Y - u * 8, u * 4 * Math.abs(sx) + u * 0.8, u * 4.4); ctx.beginPath(); ctx.moveTo(X - u * 0.8, Y - u * 3.6); ctx.lineTo(X - u * 1.1, Y - u * 0.6); ctx.moveTo(X + u * 0.8, Y - u * 3.6); ctx.lineTo(X + u * 1.1, Y - u * 0.6); ctx.moveTo(X - u * 2.4 * sx, Y - u * 7.6); ctx.lineTo(X - u * 3.4 * sx, Y - u * 4.6); ctx.moveTo(X + u * 2.4 * sx, Y - u * 7.6); ctx.lineTo(X + u * 3.4 * sx, Y - u * 4.6); ctx.stroke();
    ctx.fillStyle = 'rgba(95,243,255,.12)'; ctx.beginPath(); ctx.moveTo(X - K * 1.2, Y); ctx.lineTo(X - u * 2, Y - u * 11.5); ctx.lineTo(X + u * 2, Y - u * 11.5); ctx.lineTo(X + K * 1.2, Y); ctx.fill(); } }
  // prop animations: antenna blinks + dish sweeps, exchange holo rings, council beacon, billboards flicker
  PROPS.forEach(pr => { const ex = pr.ex; if (!ex) return; const [X, Y] = S3(...(ex.blink || ex.holo || ex.beacon || ex.bill || [pr.cx, pr.cy, 0])); if (!inView(X - K * 3, Y - K * 3, K * 6, K * 6)) return; const rgb = rgbOf(pr.dist.col).join(',');
    if (ex.blink) { ctx.fillStyle = (t + pr.cx) % 1.4 < 0.5 ? '#ff4d6d' : `rgba(${rgb},.5)`; ctx.beginPath(); ctx.arc(X, Y, K * 0.12, 0, 7); ctx.fill(); const [dx, dy] = S3(...ex.dish), f = (t * 0.7 + pr.cy) % 1; ctx.strokeStyle = `rgba(${rgb},${0.7 * (1 - f)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(dx, dy, K * (0.4 + f * 2.4), K * (0.16 + f * 0.9), 0, 0, 7); ctx.stroke(); }
    if (ex.holo) { ctx.strokeStyle = `rgba(${rgb},.8)`; ctx.lineWidth = 1.5; for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.ellipse(X, Y - k * K * 0.45, K * (1.2 - k * 0.35) * (0.6 + 0.4 * Math.abs(Math.cos(t * 0.9 + k))), K * 0.32, 0, 0, 7); ctx.stroke(); } }
    if (ex.beacon) { const on = (Math.sin(t * 2.6 + pr.cx) + 1) / 2; ctx.fillStyle = `rgba(${rgb},${0.4 + on * 0.6})`; ctx.beginPath(); ctx.arc(X, Y, K * (0.14 + on * 0.08), 0, 7); ctx.fill(); }
    if (ex.bill && Math.sin(t * 0.5 + pr.cx) > 0.96) { ctx.fillStyle = `rgba(${rgb},.18)`; ctx.fillRect(X - pr.w * K * 0.5, Y - K * 0.7, pr.w * K, K * 1.2); } });
  // ambient drones (pure decoration: no data)
  DRONES.forEach(dr => { const a = t * dr.sp + dr.p, x = dr.cx + Math.cos(a) * dr.rx, y = dr.cy + Math.sin(a * 1.3) * dr.ry, [X, Y] = S3(x, y, dr.z); if (!inView(X - 10, Y - 10, 20, 20)) return; ctx.fillStyle = '#0c1424'; ctx.fillRect(X - K * 0.16, Y - K * 0.05, K * 0.32, K * 0.1); ctx.fillStyle = (t * 2 + dr.p) % 1 < 0.5 ? '#ff4d6d' : '#5ff3ff'; ctx.fillRect(X - 1, Y - 1, 2.5, 2.5); });
  // parked shuttles on the extra pads (decor)
  PADS.forEach(([x, y], k) => { const [X, Y] = S3(x, y, 0.6 + Math.sin(t * 1.5 + k) * 0.05); if (!inView(X - K * 2, Y - K, K * 4, K * 2)) return; ctx.fillStyle = '#16213a'; ctx.strokeStyle = '#b3ff5f'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(X, Y, K * 1.1, K * 0.32, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(95,243,255,.7)'; ctx.beginPath(); ctx.ellipse(X + K * 0.3, Y - K * 0.12, K * 0.3, K * 0.1, 0, 0, 7); ctx.fill(); });
}
// district name signs (tappable) drawn with the other labels
function districtSigns(t) { DISTRICTS.forEach(d => { const [X, Y] = S3(d.cx, d.cy - d.R * 0.92, 2.8); const st = ADMIN ? ((d.act || 0) > 0.5 ? '● ACTIVE' : (d.act || 0) > 0.05 ? 'recently active' : 'quiet') : null; const p = pill(st ? [d.name.toUpperCase(), st] : [d.name.toUpperCase()], { edge: d.col, fg: d.col }); const x = X - p.w / 2, y = Y - p.h; if (!inView(x, y, p.w, p.h)) return; ctx.drawImage(p.img, x, y, p.w, p.h); LABELRECTS.push({ x, y, w: p.w, h: p.h, tap: 'D:' + d.key }); }); }
let scanPat = null, vign = null, vignKey = '';
const HUDF = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit' });
function drawHUD(t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!scanPat) { const s = document.createElement('canvas'); s.width = 4; s.height = 3; const c = s.getContext('2d'); c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(0, 0, 4, 1); scanPat = ctx.createPattern(s, 'repeat'); }
  if (vignKey !== W + 'x' + H) { vignKey = W + 'x' + H; const v = document.createElement('canvas'); v.width = W; v.height = H; const c = v.getContext('2d'), g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,4,12,.55)'); c.fillStyle = g; c.fillRect(0, 0, W, H); vign = v; }
  ctx.drawImage(vign, 0, 0, W, H); ctx.fillStyle = scanPat; ctx.fillRect(0, 0, W, H);
  const sweep = (t * 60) % (H + 120) - 60; const sg = ctx.createLinearGradient(0, sweep - 40, 0, sweep); sg.addColorStop(0, 'rgba(95,243,255,0)'); sg.addColorStop(1, 'rgba(95,243,255,.05)'); ctx.fillStyle = sg; ctx.fillRect(0, sweep - 40, W, 40);
  if (pulseT > 0) { ctx.strokeStyle = 'rgba(95,243,255,' + Math.min(0.6, pulseT * 0.4) + ')'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3); }
  // corner brackets
  ctx.strokeStyle = 'rgba(95,243,255,.55)'; ctx.lineWidth = 1.5; const L = 16; [[6, 6, 1, 1], [W - 6, 6, -1, 1], [6, H - 6, 1, -1], [W - 6, H - 6, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke(); });
  // live panel (top-right)
  const working = lastWork ? chars.filter(ch => !(ADMIN && isIdle(ch.i))).length : 0;
  const lines = [['LIVE', HUDF.format(new Date()) + ' MT']];
  if (ADMIN) { lines.push(['AGENTS ON', `${working}/${BOTS.length}`], ['TASKS RUNNING', String(BOTS.filter(b => current(b.name)).length)], ['LOG TODAY', String(actsToday().length)], ['WAITING', String(reqs().filter(r => r.status === 'pending').length)]); }
  else lines.push(['SHIFT', lastWork ? 'on duty' : 'after hours'], ['FEED', 'sign in']);
  ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace'; const pw = 150, lh = 14, ph = lines.length * lh + 10, px = 10, py = H - ph - 56;
  ctx.fillStyle = 'rgba(3,10,20,.72)'; ctx.fillRect(px, py, pw, ph); ctx.strokeStyle = 'rgba(95,243,255,.6)'; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  ctx.textBaseline = 'middle'; lines.forEach(([k, v2], i) => { const y = py + 9 + i * lh; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(95,243,255,.7)'; ctx.fillText(k, px + (i ? 8 : 18), y); ctx.textAlign = 'right'; ctx.fillStyle = i ? '#F6F4EF' : C.tan; ctx.fillText(v2, px + pw - 8, y); });
  ctx.fillStyle = (t % 1.2) < 0.7 ? '#ff4d6d' : 'rgba(255,77,109,.3)'; ctx.beginPath(); ctx.arc(px + 10, py + 9, 3, 0, 7); ctx.fill();
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
    if (ch.tagT > 0) ch.tagT -= dt; if (ch.busyT > 0) ch.busyT -= dt;
    const head = ch.path[0];
    if (head && !Array.isArray(head)) {
      if (head.act === 'wait') { head.t -= dt; if (head.t > 0) return; }
      else if (head.act === 'drop') handoff(ch, head.target);
      else if (head.act === 'take') { ch.carry = 'letter'; pops.push({ x: ch.x, y: ch.y, t: 0, item: null }); }
      else if (head.act === 'end') { ch.errand = null; ch.running = false; ch.carry = null; }
      ch.path.shift(); if (!ch.path.length) ch.walking = false; return;
    }
    if (head) { const [tx, ty] = head, dx = tx - ch.x, dy = ty - ch.y, d = Math.hypot(dx, dy), sp = (ch.running ? 9 : 5.5) * dt;
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
  if (nk !== K || nd2 !== dpr) { K = T = nk; dpr = nd2; OY = 7 * K; WPX = Math.round(WX * K); HPX = Math.round(OY + WY * TILT * K); pillCache.clear(); spritesDirty = true; ground = null; if (cam.init) cam.init = false; }
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx = cv.getContext('2d');
  if (!cam.init) { cam.init = true; focusOn(BOTS[0].b.cx, BOTS[0].b.cy + 1.5, 1, true); } clampCam();
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
    if (!d.moved && e.type === 'pointerup') { const [x, y] = rel(e), h = hit(x, y); if (typeof h === 'string' && h.startsWith('D:')) townFly(h.slice(2), true); else if (h === 'hq') openHQ(); else if (h === 'dock') openDock(); else if (h === 'ai') { if (window.openGatepostAI) window.openGatepostAI(); } else if (h !== null && h >= 0) openBot(h); } };
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
  return `<div class="town-full" id="town-full"><canvas id="town-canvas" role="img" aria-label="Gatepost town map. Drag to look around; tap a building, a bot, HQ or the launch pad."></canvas>
  <div class="town-top"><div class="town-title"><b>Gatepost AI Grid</b><span id="town-clock"></span></div>${ADMIN ? '<div class="town-ticker" id="town-ticker"></div>' : ''}</div>
  <div class="town-tools"><canvas id="town-mini" aria-label="Minimap: tap to jump"></canvas><button class="town-btn" onclick="townZoom(1.25)" aria-label="Zoom in" title="Zoom in">+</button><button class="town-btn" onclick="townZoom(0.8)" aria-label="Zoom out" title="Zoom out">−</button><button class="town-btn" onclick="townCenter()" aria-label="Center on HQ" title="Center on HQ">⌂</button><button class="town-btn" onclick="townJump()" aria-label="Districts" title="Fly to a district">◎</button></div>
  <div class="town-jump" id="town-jump">${DISTRICTS.map(d => `<button onclick="townFly('${d.key}')"><span class="dot" style="background:${d.col}"></span>${esc(d.name)}</button>`).join('')}</div>
  <div class="town-legend"><button class="town-chip hq" onclick="townChip('hq')"><span class="dot" style="background:#F6F4EF"></span>HQ</button>${chips}<button class="town-chip" onclick="townChip('dock')"><span class="dot" style="background:#6f9aac"></span>Launch Pad</button></div></div>`; };
window.townCenter = () => focusOn(HQ.cx, HQ.cy, 1);
window.townFly = (key, open) => { const d = DISTRICTS.find(x => x.key === key); if (!d) return; if (ZM < 0.8) zoomAt(1, W / 2, H / 2); focusOn(d.cx, d.cy, 1); const j = document.getElementById('town-jump'); if (j) j.classList.remove('on');
  if (open) { if (d.bot === 'hq') openHQ(); else if (d.bot === 'dock') openDock(); else if (d.bot === 'ai') { if (window.openGatepostAI) window.openGatepostAI(); } else openBot(d.bot); } };
window.townJump = () => { const j = document.getElementById('town-jump'); if (j) j.classList.toggle('on'); };
window.townChip = t => { if (t === 'hq') { focusOn(HQ.cx, HQ.cy, 1); openHQ(); } else if (t === 'dock') { focusOn(PIER.x0 - 1, PIER.y0 + 3, 0); openDock(); } else { const b = BOTS[t].b; focusOn(b.cx, b.cy, 1); openBot(t); } };

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
  return `<div class="sheet-head"><button class="sheet-back" onclick="closeBot()" aria-label="Back">‹ Town</button><span class="badge">Launch Pad</span></div>
  <div class="sheet-body"><div class="bot-hero"><span class="hq-ava" style="font-size:1.6rem">⛵</span><div><h2 class="sheet-title" style="margin:0">Launch Pad</h2><div class="muted">Where the bots send things out</div></div></div>
  <dl class="facts"><dt>Ship</dt><dd>${esc(st)}</dd>${pierCrates.length ? `<dt>On the pier</dt><dd>${pierCrates.length} waiting</dd>` : ''}${ADMIN ? `<dt>Sent today</dt><dd>${sentToday()}</dd>` : ''}</dl>
  ${ADMIN ? `<h3>Recently sent (from bot activity)</h3>${sends.length ? `<ol class="timeline">${sends.map(a => `<li><span class="tl-ico">✉</span><div><div>${esc(a.body)}</div><div class="muted">${esc(a.bot)} · ${esc(when(a.created_at))}</div></div></li>`).join('')}</ol>` : '<p class="muted">Nothing logged as sent yet. When a bot logs that it sent an email, text or follow-up, it runs it down to the ship.</p>'}` : ''}
  <p class="muted" style="font-size:.74rem;margin-top:14px;">The shuttle launches whenever a bot drops a data packet on the pad and comes back a little later.</p></div>`;
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
(() => { const st = document.createElement('style'); st.id = 'town-future-css'; st.textContent = `
.town-full{background:#070c16!important}
.town-full .town-title,.town-full .town-ticker,.town-full .town-chip,.town-full .town-btn{background:rgba(3,10,20,.82)!important;border:1px solid rgba(95,243,255,.45)!important;color:#dffcff!important;box-shadow:0 0 12px rgba(95,243,255,.15)}
.town-full .town-title b{letter-spacing:.08em;text-transform:uppercase;font-size:.78rem}
.town-full .town-ticker{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.68rem;max-width:min(100%,520px)}
.town-full .town-ticker .tk-t{color:#f2c96b;margin-right:6px}.town-full .town-ticker .tk-row:first-child::after{content:'_';animation:tkblink 1s steps(1) infinite;color:#5ff3ff;margin-left:2px}
@keyframes tkblink{50%{opacity:0}}
.town-full #town-mini{border-color:rgba(95,243,255,.6)!important;width:110px}
.town-jump{position:absolute;right:58px;bottom:54px;display:none;flex-direction:column;gap:4px;background:rgba(3,10,20,.92);border:1px solid rgba(95,243,255,.45);border-radius:12px;padding:6px;z-index:2;max-height:60%;overflow:auto}
.town-jump.on{display:flex}.town-jump button{display:flex;align-items:center;gap:8px;width:auto;background:transparent;border:0;color:#dffcff;padding:7px 10px;font-size:.8rem;text-align:left;border-radius:8px}.town-jump button:active{background:rgba(95,243,255,.15)}.town-jump .dot{width:9px;height:9px;border-radius:50%}`; document.head.appendChild(st); })();
document.addEventListener('visibilitychange', () => { if (!document.hidden && cv && cv.isConnected && !raf) { last = 0; raf = requestAnimationFrame(loop); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && OPEN && !document.getElementById('req-sheet')) closeBot(); });
})();
