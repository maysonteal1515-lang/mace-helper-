(() => {
  if (window.__maceScratchConnectorLoaded) return;
  window.__maceScratchConnectorLoaded = true;

  const tag = document.createElement("script");
  tag.src = chrome.runtime.getURL("bridge.js");
  tag.onload = () => tag.remove();
  (document.head || document.documentElement).appendChild(tag);

  const CHANNEL = "MACE_SCRATCH_CONNECTOR_V1";
  const pending = new Map();

  function request(action, payload = {}) {
    return new Promise((resolve) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, error: "No response from Scratch editor. Refresh the project editor and try again." });
      }, 3500);
      pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      window.postMessage({ channel: CHANNEL, direction: "to-page", id, action, payload }, "*");
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.channel !== CHANNEL || event.data?.direction !== "to-extension") return;
    const finish = pending.get(event.data.id);
    if (finish) {
      pending.delete(event.data.id);
      finish(event.data.result || { ok: false, error: "Empty response from page connector." });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.from !== "mace-popup") return;
    request(message.action, message.payload || {}).then(sendResponse);
    return true;
  });
})();