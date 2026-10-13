// Gatepost AI Chat — 24/7 assistant
// Works client-side with Gatepost knowledge. Optional: set AI_ENDPOINT in config for a real model.

(function(){
  const KNOWLEDGE = {
    company: "Gatepost Property Services. One crew, one invoice. Rio Rancho / ABQ metro. Phone (505) 750-3019. Hours 7:00 a.m.–9:30 p.m., seven days.",
    owners: "Christian Moseley and Nathan Messina.",
    services: "Yard work, trees, landscaping, junk haul, moving help, rental turnovers, fences, decks, patios, handyman, paint, doors, power wash, windows, gutters, roof patch, holiday lights, swamp coolers.",
    grt: "Rio Rancho / Sandoval 7.4375%. Albuquerque / Bernalillo 7.625%. GRT is its own line. Tax after any discount.",
    pricing: "Garden standard aims $625–$750. Short fence cut-down ~$275. Dirt ~2 CY $175–$250. Client sees fixed price for checked scope plus optional add-ons.",
    terms: "Valid 30 days. Pay when done (check/card/Zelle; cards may add 3%). Written change orders. Weather, locked gate, or loose pets move the start. 7-day labor cover on checked areas. Landfill by 3:30.",
    estimate: "Split work and materials. Two lines only. GRT separate. Never lump the unit into labor.",
    access: "Employees self-register. New accounts start with 0 access. Admin grants access."
  };

  function reply(q) {
    const t = (q || '').toLowerCase();
    if (t.includes('phone') || t.includes('call') || t.includes('number')) return KNOWLEDGE.company;
    if (t.includes('hour') || t.includes('open') || t.includes('time')) return "Hours: 7:00 a.m. to 9:30 p.m., seven days. Landfill cutoff 3:30 p.m.";
    if (t.includes('grt') || t.includes('tax')) return KNOWLEDGE.grt;
    if (t.includes('price') || t.includes('cost') || t.includes('estimate') || t.includes('bid')) return KNOWLEDGE.pricing + " " + KNOWLEDGE.estimate;
    if (t.includes('service') || t.includes('do you') || t.includes('what do')) return KNOWLEDGE.services;
    if (t.includes('owner') || t.includes('christian') || t.includes('nathan')) return KNOWLEDGE.owners;
    if (t.includes('access') || t.includes('login') || t.includes('register')) return KNOWLEDGE.access;
    if (t.includes('term') || t.includes('pay') || t.includes('valid')) return KNOWLEDGE.terms;
    return "I can help with Gatepost hours, services, estimates, GRT, access, and terms. Ask a specific question, or use the Estimate tab for a number.";
  }

  function buildUI() {
    if (document.getElementById('ai-chat-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'ai-chat-btn';
    btn.innerHTML = 'AI';
    btn.style.cssText = 'position:fixed;right:16px;bottom:calc(env(safe-area-inset-bottom) + 78px);z-index:25;width:52px;height:52px;border-radius:50%;background:#f6f4ef;color:#0e0e0e;border:none;font-weight:700;font-size:.9rem;box-shadow:0 4px 16px rgba(0,0,0,.4);';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'ai-chat-panel';
    panel.style.cssText = 'position:fixed;inset:0 0 calc(env(safe-area-inset-bottom) + 58px) 0;z-index:30;background:#0e0e0e;display:none;flex-direction:column;';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:calc(env(safe-area-inset-top) + 10px) 16px 10px;border-bottom:1px solid #2c2c2c;">
        <strong style="font-family:serif;letter-spacing:.08em;">Gatepost AI</strong>
        <button id="ai-chat-close" style="width:auto;padding:8px 12px;background:transparent;border:1px solid #2c2c2c;color:#f6f4ef;border-radius:8px;">Close</button>
      </div>
      <div id="ai-chat-log" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;"></div>
      <div style="display:flex;gap:8px;padding:10px 16px;border-top:1px solid #2c2c2c;">
        <input id="ai-chat-input" placeholder="Ask about hours, estimates, services…" style="flex:1;padding:12px;border-radius:10px;border:1px solid #2c2c2c;background:#1f1f1f;color:#f6f4ef;">
        <button id="ai-chat-send" style="width:auto;padding:0 16px;background:#f6f4ef;color:#0e0e0e;border:none;border-radius:10px;font-weight:600;">Send</button>
      </div>
    `;
    document.body.appendChild(panel);

    const log = panel.querySelector('#ai-chat-log');
    function addMsg(text, who) {
      const d = document.createElement('div');
      d.style.cssText = `max-width:82%;padding:9px 12px;border-radius:16px;font-size:.92rem;line-height:1.4;white-space:pre-wrap;${who==='me'?'align-self:flex-end;background:#f6f4ef;color:#0e0e0e;':'align-self:flex-start;background:#1f1f1f;border:1px solid #2c2c2c;'}`;
      d.textContent = text;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    }

    btn.onclick = () => { panel.style.display = 'flex'; if (!log.children.length) addMsg('Gatepost AI is on. Ask about hours, services, estimates, GRT, or access. I stay available even when other agents are quiet.', 'bot'); };
    panel.querySelector('#ai-chat-close').onclick = () => panel.style.display = 'none';

    async function send() {
      const input = panel.querySelector('#ai-chat-input');
      const q = input.value.trim();
      if (!q) return;
      input.value = '';
      addMsg(q, 'me');
      const cfg = window.GATEPOST_CONFIG || {};
      if (cfg.AI_ENDPOINT) {
        try {
          const r = await fetch(cfg.AI_ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message: q }) });
          const j = await r.json();
          addMsg(j.reply || j.text || reply(q), 'bot');
          return;
        } catch(e) {}
      }
      addMsg(reply(q), 'bot');
    }
    panel.querySelector('#ai-chat-send').onclick = send;
    panel.querySelector('#ai-chat-input').onkeydown = e => { if (e.key === 'Enter') send(); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
