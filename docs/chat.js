(function () {
  const CHAT_API = "https://ckd-screening-app.vercel.app/api/chat";
  const BOT_NAME = "CKD Assistant";

  const css = `
  #ckd-launcher{position:fixed;right:16px;bottom:16px;z-index:1000;display:flex;align-items:center;gap:10px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  #ckd-pill{display:flex;align-items:center;gap:8px;width:auto;padding:10px 16px;border-radius:999px;background:#fff;color:#1a202c;border:none;font-size:14px;font-weight:700;letter-spacing:.2px;text-transform:uppercase;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.18)}
  #ckd-pill:hover{background:#f7fafc}
  #ckd-pill svg{width:18px;height:18px;flex:none}
  #ckd-fab{width:64px;height:64px;padding:0;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(145deg,#e53e3e,#c53030);color:#fff;box-shadow:0 4px 14px rgba(197,48,48,.5);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:9px;font-weight:700;letter-spacing:.6px;flex:none}
  #ckd-fab:hover{background:linear-gradient(145deg,#c53030,#9b1c1c)}
  #ckd-fab svg{width:26px;height:26px}
  #ckd-launcher.open #ckd-pill{display:none}
  #ckd-chat-panel{position:fixed;right:16px;bottom:92px;z-index:1000;width:350px;max-width:calc(100vw - 32px);height:480px;max-height:calc(100vh - 112px);background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  #ckd-chat-panel.open{display:flex}
  #ckd-chat-head{background:linear-gradient(145deg,#e53e3e,#c53030);color:#fff;padding:12px 14px;font-weight:700;font-size:15px;display:flex;justify-content:space-between;align-items:center}
  #ckd-chat-close{width:auto;background:transparent;border:none;color:#fff;font-size:22px;line-height:1;padding:0 4px;cursor:pointer}
  #ckd-chat-close:hover{background:transparent;opacity:.8}
  #ckd-chat-log{flex:1;overflow-y:auto;padding:12px;background:#f7fafc}
  .ckd-msg{max-width:85%;padding:8px 12px;border-radius:14px;margin-bottom:8px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}
  .ckd-msg.bot{background:#fff;border:1px solid #e2e8f0;color:#1a202c}
  .ckd-msg.user{background:#c53030;color:#fff;margin-left:auto}
  .ckd-msg.note{background:transparent;color:#718096;font-size:12px;text-align:center;max-width:100%}
  #ckd-chat-form{display:flex;gap:6px;padding:8px;border-top:1px solid #e2e8f0;background:#fff}
  #ckd-chat-input{flex:1;margin:0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px}
  #ckd-chat-send{width:auto;padding:8px 14px;font-size:14px;font-weight:600;background:#c53030;color:#fff;border:none;border-radius:8px;cursor:pointer}#ckd-chat-send:hover{background:#9b1c1c}#ckd-chat-send:disabled{opacity:.6}
  #ckd-chat-disclaimer{padding:4px 10px 8px;font-size:11px;color:#718096;background:#fff}
  @media (max-width:420px){#ckd-pill{padding:9px 12px;font-size:12px}}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const bubbleSvg =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>' +
    '<circle cx="8.5" cy="12" r=".6" fill="currentColor"/><circle cx="12" cy="12" r=".6" fill="currentColor"/><circle cx="15.5" cy="12" r=".6" fill="currentColor"/></svg>';

  const launcher = document.createElement("div");
  launcher.id = "ckd-launcher";
  launcher.innerHTML =
    '<button id="ckd-pill" type="button" aria-label="Open chat">' + bubbleSvg + "<span>Talk to our AI assistant</span></button>" +
    '<button id="ckd-fab" type="button" aria-label="Open chat">' + bubbleSvg + "<span>CKD AI</span></button>";

  const panel = document.createElement("div");
  panel.id = "ckd-chat-panel";
  panel.innerHTML =
    '<div id="ckd-chat-head"><span>' + BOT_NAME + '</span><button id="ckd-chat-close" type="button" aria-label="Close chat">&times;</button></div>' +
    '<div id="ckd-chat-log"></div>' +
    '<form id="ckd-chat-form">' +
    '<input id="ckd-chat-input" type="text" maxlength="500" placeholder="Type your question" autocomplete="off">' +
    '<button id="ckd-chat-send" type="submit">Send</button>' +
    "</form>" +
    '<div id="ckd-chat-disclaimer">General information only. Not medical advice. See a doctor for your health concerns.</div>';

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  const log = panel.querySelector("#ckd-chat-log");
  const form = panel.querySelector("#ckd-chat-form");
  const input = panel.querySelector("#ckd-chat-input");
  const send = panel.querySelector("#ckd-chat-send");

  const history = [];
  let busy = false;

  function addMsg(role, text) {
    const div = document.createElement("div");
    div.className = "ckd-msg " + role;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  addMsg(
    "bot",
    "Hi. I answer questions about chronic kidney disease, its risk factors, tests like eGFR, and prevention. I do not diagnose."
  );

  function setOpen(open) {
    panel.classList.toggle("open", open);
    launcher.classList.toggle("open", open);
    if (open) input.focus();
  }

  launcher.querySelector("#ckd-pill").addEventListener("click", () => setOpen(true));
  launcher.querySelector("#ckd-fab").addEventListener("click", () =>
    setOpen(!panel.classList.contains("open"))
  );
  panel.querySelector("#ckd-chat-close").addEventListener("click", () => setOpen(false));

  // Reads the latest screening result from the page, if there is one.
  function getRisk() {
    const levelEl = document.getElementById("risk-level");
    const scoreEl = document.getElementById("probability");
    const level = levelEl ? levelEl.textContent.trim().toLowerCase() : "";
    if (!["low", "moderate", "high"].includes(level)) return {};
    let score = null;
    const match = scoreEl ? scoreEl.textContent.match(/([\d.]+)\s*%/) : null;
    if (match) score = parseFloat(match[1]) / 100;
    return { risk_level: level, risk_score: score };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;

    input.value = "";
    addMsg("user", text);
    history.push({ role: "user", content: text });

    busy = true;
    send.disabled = true;
    const typing = addMsg("note", "Typing...");

    try {
      const res = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-8), ...getRisk() }),
      });
      typing.remove();

      if (!res.ok) {
        history.pop();
        let detail = "";
        try {
          const err = await res.json();
          detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
        } catch (e2) {}
        const msg =
          res.status === 429
            ? "The chat is busy. Try again in a minute."
            : "The chat is not available right now. Try again later. (Error " + res.status + (detail ? ": " + detail.slice(0, 200) : "") + ")";
        addMsg("note", msg);
        return;
      }

      const data = await res.json();
      history.push({ role: "assistant", content: data.reply });
      addMsg("bot", data.reply);
    } catch (err) {
      typing.remove();
      history.pop();
      addMsg("note", "Could not reach the chat. Check your connection.");
      console.error(err);
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  });
})();
