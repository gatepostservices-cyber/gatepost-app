// Gatepost AI Chat — Gemini via Supabase edge function
(function(){
  const ENDPOINT = "https://hssevqgkoeuludwoxyuo.supabase.co/functions/v1/ai-chat";
  const history = [];

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
        <input id="ai-chat-input" placeholder="Ask Gatepost AI…" style="flex:1;padding:12px;border-radius:10px;border:1px solid #2c2c2c;background:#1f1f1f;color:#f6f4ef;">
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
      return d;
    }

    btn.onclick = () => {
      panel.style.display = 'flex';
      if (!log.children.length) addMsg('Gatepost AI (Gemini). Ask about jobs, bids, hours, services, or GRT.', 'bot');
    };
    panel.querySelector('#ai-chat-close').onclick = () => panel.style.display = 'none';

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
    panel.querySelector('#ai-chat-input').onkeydown = e => { if (e.key === 'Enter') send(); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
