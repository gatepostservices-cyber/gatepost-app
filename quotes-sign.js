// Gatepost customer e-signing: full-screen sign view + finger signature pad. Used by the Quotes tab (quotes.js) and the public sign page (sign/).
(function () {
  const ACCEPT = 'I accept this quote and the scope, price and terms above.';
  const money = n => '$' + (+n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const denver = d => new Date(d).toLocaleString('en-US', { timeZone: 'America/Denver', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const css = `.gs-ov{position:fixed;inset:0;z-index:9999;background:#05070d;color:#eaf6ff;overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:inherit}
.gs-in{max-width:640px;margin:0 auto;padding:16px 16px calc(24px + env(safe-area-inset-bottom))}.gs-hd{display:flex;align-items:center;justify-content:space-between;gap:8px}
.gs-hd img{height:34px;max-width:62vw;background:#f6f4ef;border-radius:10px;padding:6px 10px;box-sizing:content-box}.gs-card{background:rgba(255,255,255,.05);border:1px solid rgba(95,243,255,.22);border-radius:14px;padding:12px;margin:12px 0}
.gs-card h2,.gs-card h3{margin:0 0 6px}.gs-t{width:100%;border-collapse:collapse;font-size:.92rem}.gs-t td{padding:5px 2px;border-bottom:1px dotted rgba(255,255,255,.15);vertical-align:top}.gs-t .n{text-align:right;white-space:nowrap}
.gs-t .tot td{font-weight:800;font-size:1.05rem;border-bottom:0}.gs-acc{font-weight:700;font-size:1.02rem;border-left:3px solid #5ff3ff;padding:6px 10px;margin:10px 0}
.gs-ov label{display:block;font-weight:700;margin:8px 0 4px}.gs-ov input[type=text]{width:100%;box-sizing:border-box;font-size:17px;padding:12px;border-radius:10px;border:1px solid rgba(95,243,255,.4);background:#eef6fb;color:#05070d}
.gs-pad{position:relative;width:100%;height:200px;background:#fff;border-radius:12px;border:2px solid rgba(95,243,255,.5);touch-action:none;overflow:hidden}
.gs-pad canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block}.gs-pad .gs-x{position:absolute;left:14px;right:14px;bottom:44px;border-top:1px solid #9aa;pointer-events:none}
.gs-pad .gs-hint{position:absolute;left:16px;bottom:22px;color:#789;font-size:.8rem;pointer-events:none}
.gs-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.gs-row button{min-height:48px;flex:1 1 140px;font-size:1rem;border-radius:12px;cursor:pointer}
.gs-p{background:#5ff3ff;color:#05070d;border:0;font-weight:800}.gs-s{background:transparent;color:#eaf6ff;border:1px solid rgba(95,243,255,.5)}.gs-p:disabled{opacity:.5}
.gs-msg{min-height:1.2em;margin-top:8px;color:#ffd27a}.gs-muted{opacity:.75;font-size:.85rem}`;
  function addCss() { if (document.getElementById('gs-css')) return; const s = document.createElement('style'); s.id = 'gs-css'; s.textContent = css; document.head.appendChild(s); }

  // HiDPI finger-draw pad (pointer events; touch-action none).
  function pad(canvas) {
    let ctx, strokes = [], cur = null, ratio = 1;
    function size() { ratio = Math.max(1, window.devicePixelRatio || 1); const r = canvas.getBoundingClientRect(); canvas.width = Math.round(r.width * ratio); canvas.height = Math.round(r.height * ratio); ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); redraw(); }
    function seg(pts) { if (!pts.length) return; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1b3a'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y + 0.1); for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2); } ctx.stroke(); }
    function redraw() { if (!ctx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); strokes.forEach(seg); }
    const pt = ev => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    canvas.addEventListener('pointerdown', ev => { ev.preventDefault(); canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId); cur = [pt(ev)]; strokes.push(cur); redraw(); });
    canvas.addEventListener('pointermove', ev => { if (!cur) return; ev.preventDefault(); const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]; (evs.length ? evs : [ev]).forEach(x => cur.push(pt(x))); redraw(); });
    const end = () => { cur = null; canvas.dispatchEvent(new Event('gs-change')); };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    ['touchstart', 'touchmove'].forEach(t => canvas.addEventListener(t, ev => ev.preventDefault(), { passive: false }));
    window.addEventListener('resize', size); requestAnimationFrame(size);
    const inkLen = () => strokes.reduce((n, s) => n + s.length, 0);
    return { clear() { strokes = []; redraw(); canvas.dispatchEvent(new Event('gs-change')); }, empty: () => inkLen() < 6,
      png() { const r = canvas.getBoundingClientRect(), c = document.createElement('canvas'); c.width = Math.round(r.width * 2); c.height = Math.round(r.height * 2); const x = c.getContext('2d'); x.drawImage(canvas, 0, 0, c.width, c.height); return c.toDataURL('image/png'); },
      destroy() { window.removeEventListener('resize', size); } };
  }

  // rec: { number, service, customer, result }. opts: { title, logo, onSubmit(sig) -> Promise, onClose, closeLabel }
  function open(rec, opts = {}) {
    addCss(); const r = rec.result || {}, c = rec.customer || {};
    const el = document.createElement('div'); el.className = 'gs-ov'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="gs-in"><div class="gs-hd"><img src="${e(opts.logo || 'logo.png')}" alt="Gatepost Property Services">${opts.onClose ? `<button class="gs-s" style="min-height:40px;padding:0 14px;border-radius:10px" data-x>${e(opts.closeLabel || 'Cancel')}</button>` : ''}</div>
      <div class="gs-card"><h2>Quote ${e(rec.number)}</h2><div class="gs-muted">${e(opts.title || '')}</div>
        <div style="margin-top:6px">${e(c.name || '')}${c.addr ? '<br>' + e(c.addr) : ''}${c.city ? '<br>' + e(c.city) : ''}</div>
        ${c.scope ? `<h3 style="margin-top:10px">Scope of work</h3><div style="white-space:pre-wrap">${e(c.scope)}</div>` : ''}</div>
      <div class="gs-card"><h3>Price</h3><table class="gs-t">${(r.lines || []).map(l => `<tr><td>${e(l.l)}</td><td class="n">${money(l.a)}</td></tr>`).join('')}
        <tr><td>Subtotal</td><td class="n">${money(r.subtotal)}</td></tr><tr><td>NM Gross Receipts Tax - ${e(r.grtLabel)} (${e(r.grtRate)}%)</td><td class="n">${money(r.tax)}</td></tr>
        <tr class="tot"><td>TOTAL</td><td class="n">${money(r.total)}</td></tr></table>
        <h3 style="margin-top:10px">Terms</h3><ol class="gs-muted" style="padding-left:18px;margin:4px 0">${TERMS.map(t => `<li>${e(t)}</li>`).join('')}</ol></div>
      <div class="gs-card"><div class="gs-acc">${e(ACCEPT)}</div>
        <label for="gs-name">Printed name</label><input type="text" id="gs-name" autocomplete="name" autocapitalize="words" value="${e(opts.name || '')}">
        <label>Sign with your finger</label><div class="gs-pad"><canvas aria-label="Signature pad"></canvas><div class="gs-x"></div><div class="gs-hint">Sign above the line</div></div>
        <div class="gs-row"><button class="gs-s" data-clear>Clear</button><button class="gs-p" data-ok disabled>Sign and accept</button></div>
        <div class="gs-msg" aria-live="polite"></div><div class="gs-muted">Date and time are recorded in Mountain Time when you tap Sign. Questions? Call or text (505) 750-3019.</div></div></div>`;
    document.body.appendChild(el); const prevOv = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const P = pad(el.querySelector('canvas')), nm = el.querySelector('#gs-name'), ok = el.querySelector('[data-ok]'), msg = el.querySelector('.gs-msg');
    const upd = () => { ok.disabled = P.empty() || nm.value.trim().length < 2; }; nm.addEventListener('input', upd); el.querySelector('canvas').addEventListener('gs-change', upd);
    el.querySelector('[data-clear]').onclick = () => P.clear();
    const close = () => { P.destroy(); el.remove(); document.body.style.overflow = prevOv; };
    const x = el.querySelector('[data-x]'); if (x) x.onclick = () => { close(); opts.onClose && opts.onClose(); };
    ok.onclick = async () => { if (ok.disabled) return; ok.disabled = true; msg.textContent = 'Saving your signature\u2026';
      const at = new Date(); const sig = { name: nm.value.trim(), png: P.png(), at: at.toISOString(), atText: denver(at), line: ACCEPT };
      try { await opts.onSubmit(sig, m => { msg.textContent = m; }); close(); } catch (err) { msg.textContent = 'Not saved: ' + (err.message || err); ok.disabled = false; } };
    return { close };
  }
  const TERMS = ['Valid 30 days from the date walked.', 'Payment is due in full when the job is done.', 'Gross Receipts Tax is shown as its own line and paid by Gatepost to the state.', 'Change orders are written and priced before extra work starts.', 'Weather, a locked gate, or loose pets can move the start with no penalty either way.'];
  const b64ToBlob = (dataUrl) => { const [h, b] = dataUrl.split(','), bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: h.slice(5).split(';')[0] }); };
  window.GPSign = { open, ACCEPT, denver, b64ToBlob };
})();
