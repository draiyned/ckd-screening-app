(function () {
  const CHAT_API = "https://ckd-screening-app.vercel.app/api/chat";

  const css = `
  #ckd-chat-btn{position:fixed;right:16px;bottom:16px;z-index:1000;width:auto;padding:12px 18px;border-radius:999px;background:#2b6cb0;color:#fff;border:none;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}
  #ckd-chat-btn:hover{background:#1a4971}
  #ckd-chat-panel{position:fixed;right:16px;bottom:72px;z-index:1000;width:340px;max-width:calc(100vw - 32px);height:460px;max-height:calc(100vh - 96px);background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  #ckd-chat-panel.open{display:flex}
  #ckd-chat-head{background:#2b6cb0;color:#fff;padding:10px 14px;font-weight:600;font-size:15px}
  #ckd-chat-log{flex:1;overflow-y:auto;padding:12px;background:#f7fafc}
  .ckd-msg{max-width:85%;padding:8px 12px;border-radius:12px;margin-bottom:8px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}
  .ckd-msg.bot{background:#fff;border:1px solid #e2e8f0;color:#1a202c}
  .ckd-msg.user{background:#2b6cb0;color:#fff;margin-left:auto}
  .ckd-msg.note{background:transparent;color:#718096;font-size:12px;text-align:center;max-width:100%}
  #ckd-chat-form{display:flex;gap:6px;padding:8px;border-top:1px solid #e2e8f0;background:#fff}
  #ckd-chat-input{flex:1;margin:0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:14px}
  #ckd-chat-send{width:auto;padding:8px 14px;font-size:14px}
  #ckd-chat-disclaimer{padding:4px 10px 8px;font-size:11px;color:#718096;background:#fff}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "ckd-chat-btn";
  btn.type = "button";
  btn.textContent = "Ask about CKD";

  const panel = document.createElement("div");
  panel.id = "ckd-chat-panel";
  panel.innerHTML =
    '<div id="ckd-chat-head">CKD Assistant</div>' +
    '<div id="ckd-chat-log"></div>' +
    '<form id="ckd-chat-form">' +
    '<input id="ckd-chat-input" type="text" maxlength="500" placeholder="Type your question" autocomplete="off">' +
    '<button id="ckd-chat-send" type="submit">Send</button>' +
    "</form>" +
    '<div id="ckd-chat-disclaimer">General information only. Not medical advice. See a doctor for your health concerns.</div>';

  document.body.appendChild(btn);
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

  btn.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) input.focus();
  });

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
        const msg =
          res.status === 429
            ? "The chat is busy. Try again in a minute."
            : "The chat is not available right now. Try again later.";
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
