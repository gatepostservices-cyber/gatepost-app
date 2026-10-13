// Gatepost AI Chat — bottom sheet over the town. Keyboard overlays, does not push the map.
(function(){
  const ENDPOINT = "https://hssevqgkoeuludwoxyuo.supabase.co/functions/v1/ai-chat";
  const history = [];
  let panel, log, compose;

  function addMsg(text, who) {
    const d = document.createElement('div');
    d.style.cssText = `max-width:82%;padding:9px 12px;border-radius:16px;font-size:.92rem;line-height:1.4;white-space:pre-wrap;${who==='me'?'align-self:flex-end;background:#f6f4ef;color:#0e0e0e;':'align-self:flex-start;background:#1f1f1f;border:1px solid #2c2c2c;'}`;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  function pinToKeyboard() {
    if (!panel || panel.style.display === 'none') return;
    const vv = window.visualViewport;
    if (!vv) { panel.style.bottom = '0px'; return; }
    const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    panel.style.bottom = overlap + 'px';
  }

  function buildUI() {
    if (document.getElementById('ai-chat-panel')) return;
    panel = document.createElement('div');
    panel.id = 'ai-chat-panel';
    panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:min(58dvh,520px);z-index:30;background:#0e0e0e;display:none;flex-direction:column;border-radius:18px 18px 0 0;border-top:1px solid #2c2c2c;box-shadow:0 -10px 30px rgba(0,0,0,.45);';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid #2c2c2c;">
        <strong style="font-family:serif;letter-spacing:.08em;">Gatepost AI</strong>
        <button id="ai-chat-close" style="width:auto;padding:8px 12px;background:transparent;border:1px solid #2c2c2c;color:#f6f4ef;border-radius:8px;">Close</button>
      </div>
      <div id="ai-chat-log" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;display:flex;flex-direction:column;gap:10px;"></div>
      <div id="ai-chat-compose" style="display:flex;gap:8px;padding:10px 16px calc(env(safe-area-inset-bottom) + 10px);border-top:1px solid #2c2c2c;background:#0e0e0e;">
        <input id="ai-chat-input" placeholder="Ask Gatepost AI…" enterkeyhint="send" style="flex:1;padding:12px;border-radius:10px;border:1px solid #2c2c2c;background:#1f1f1f;color:#f6f4ef;font-size:16px;">
        <button id="ai-chat-send" style="width:auto;padding:0 16px;background:#f6f4ef;color:#0e0e0e;border:none;border-radius:10px;font-weight:600;">Send</button>
      </div>
    `;
    document.body.appendChild(panel);
    log = panel.querySelector('#ai-chat-log');
    compose = panel.querySelector('#ai-chat-compose');
    panel.querySelector('#ai-chat-close').onclick = () => { panel.style.display = 'none'; };

    async function send() {
      const input = panel.querySelector('#ai-chat-input');
      const q = input.value.trim();
      if (!q) return;
      input.value = '';
      addMsg(q, 'me');
      const thinking = addMsg('...', 'bot');
      try {
        const r = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: q, history }),
        });
        const j = await r.json();
        const reply = j.reply || j.error || 'No reply.';
        thinking.textContent = reply;
        history.push({ role: 'user', text: q }, { role: 'model', text: reply });
        if (history.length > 16) history.splice(0, history.length - 16);
      } catch (e) {
        thinking.textContent = 'Could not reach AI. Check the connection or the Gemini key.';
      }
    }
    panel.querySelector('#ai-chat-send').onclick = send;
    panel.querySelector('#ai-chat-input').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); send(); } };
    panel.querySelector('#ai-chat-input').addEventListener('focus', () => { setTimeout(pinToKeyboard, 50); });
    panel.querySelector('#ai-chat-input').addEventListener('blur', () => { panel.style.bottom = '0px'; });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', pinToKeyboard);
      window.visualViewport.addEventListener('scroll', pinToKeyboard);
    }
  }

  window.openGatepostAI = function() {
    buildUI();
    panel.style.display = 'flex';
    panel.style.bottom = '0px';
    if (!log.children.length) addMsg('Gatepost AI (Gemini). Ask about jobs, bids, hours, services, or GRT.', 'bot');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
