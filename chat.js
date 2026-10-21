// Gatepost AI Chat — bottom sheet over the town. Keyboard covers the sheet; the map does not move.
(function(){
  const ENDPOINT = "https://hssevqgkoeuludwoxyuo.supabase.co/functions/v1/ai-chat";
  const history = [];
  let panel, log, savedScroll = 0;

  function addMsg(text, who) {
    const d = document.createElement('div');
    d.style.cssText = `max-width:82%;padding:9px 12px;border-radius:16px;font-size:.92rem;line-height:1.4;white-space:pre-wrap;${who==='me'?'align-self:flex-end;background:#1f3a2b;color:#ffffff;':'align-self:flex-start;background:#f3eee2;color:#1d2a22;border:1px solid #e2dccd;'}`;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  function pinToKeyboard() {
    if (!panel || panel.style.display === 'none') return;
    const vv = window.visualViewport;
    if (!vv) return;
    if (window.scrollY) window.scrollTo(0, 0);
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    panel.style.bottom = kb + 'px';
    panel.style.height = Math.max(180, Math.min(window.innerHeight * 0.58, 520, vv.height - 16)) + 'px';
  }

  function lockPage() {
    savedScroll = window.scrollY || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = '0px';
    document.body.style.left = '0px';
    document.body.style.right = '0px';
    document.body.style.width = '100%';
    window.scrollTo(0, 0);
  }
  function unlockPage() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    panel.style.bottom = '0px';
    panel.style.height = '';
    window.scrollTo(0, savedScroll);
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
        <input id="ai-chat-input" placeholder="Ask Gatepost AI…" enterkeyhint="send" autocomplete="off" style="flex:1;padding:12px;border-radius:10px;border:1px solid #2c2c2c;background:#1f1f1f;color:#f6f4ef;font-size:16px;">
        <button id="ai-chat-send" style="width:auto;padding:0 16px;background:#f6f4ef;color:#0e0e0e;border:none;border-radius:10px;font-weight:600;">Send</button>
      </div>
    `;
    document.body.appendChild(panel);
    log = panel.querySelector('#ai-chat-log');
    panel.querySelector('#ai-chat-close').onclick = () => { panel.style.display = 'none'; unlockPage(); };

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
    const input = panel.querySelector('#ai-chat-input');
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); send(); } };
    input.addEventListener('focus', () => { lockPage(); setTimeout(pinToKeyboard, 30); setTimeout(pinToKeyboard, 180); });
    input.addEventListener('blur', () => setTimeout(unlockPage, 80));

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', pinToKeyboard);
      window.visualViewport.addEventListener('scroll', pinToKeyboard);
    }
    window.addEventListener('scroll', () => { if (panel && panel.style.display !== 'none' && window.scrollY) window.scrollTo(0, 0); }, { passive: true });
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
