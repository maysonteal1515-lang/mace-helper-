(() => {
  if (window.__maceScratchConnectorLoaded) return;
  window.__maceScratchConnectorLoaded = true;

  const tag = document.createElement("script");
  tag.src = chrome.runtime.getURL("bridge.js");
  tag.onload = () => tag.remove();
  (document.head || document.documentElement).appendChild(tag);

  const CHANNEL = "MACE_SCRATCH_CONNECTOR_V1";
  const pending = new Map();
  let requestNumber = 0;

  function request(action, payload = {}) {
    return new Promise(resolve => {
      const id = "mace-" + (++requestNumber);
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ok:false,error:"No response from Scratch editor. Refresh the editor and try again."});
      }, 3500);
      pending.set(id, result => {
        clearTimeout(timer);
        resolve(result);
      });
      window.postMessage({channel:CHANNEL,direction:"to-page",id,action,payload},"*");
    });
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.channel !== CHANNEL || event.data?.direction !== "to-extension") return;
    const finish = pending.get(event.data.id);
    if (finish) {
      pending.delete(event.data.id);
      finish(event.data.result || {ok:false,error:"Empty response from Scratch."});
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.from !== "mace-popup") return;
    request(message.action, message.payload || {}).then(sendResponse);
    return true;
  });

  const host = document.createElement("div");
  host.id = "mace-scratch-floating-panel";
  (document.documentElement || document.body).appendChild(host);
  const shadow = host.attachShadow({mode:"open"});
  shadow.innerHTML = \`
    <style>
      :host{all:initial}*{box-sizing:border-box}
      .panel{position:fixed;top:105px;right:22px;width:310px;max-height:calc(100vh - 30px);overflow:auto;z-index:2147483647;background:#071426;color:#d8ecff;border:1px solid #2374a5;border-radius:12px;box-shadow:0 12px 38px #0009;font:13px "Segoe UI",Arial,sans-serif}
      .top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 13px;background:#0b2542;border-bottom:1px solid #16466b;border-radius:12px 12px 0 0;cursor:move;user-select:none;touch-action:none}
      .brand{font-size:15px;font-weight:800;color:#42c8ff;letter-spacing:.5px}.sub{font-size:9px;color:#9cc8e5;font-weight:600}
      .headbuttons{display:flex;gap:5px}.headbuttons button{width:25px;height:24px;padding:0;font-size:15px}
      .body{padding:12px}.status{font-size:11px;color:#61e6a5;margin:0 0 10px}
      label{display:block;margin:10px 0 5px;color:#a9d8f5;font-weight:700}
      input,select{width:100%;border:1px solid #245176;border-radius:7px;background:#102945;color:#fff;padding:8px;font:12px "Segoe UI",Arial,sans-serif;outline:none}
      select{height:116px}button{border:0;border-radius:7px;padding:8px;background:#087bb7;color:white;font-weight:700;cursor:pointer;font-size:11px}
      button:hover{filter:brightness(1.12)}.secondary{background:#174568}.danger{background:#73344b}
      .wide{width:100%}.buttons{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:9px}
      .selected{margin-top:8px;color:#8bb9d8;font-size:10px;min-height:14px;overflow-wrap:anywhere}
      .message{min-height:15px;margin:8px 0 0;color:#61e6a5;font-size:10px}
      .note{font-size:9px;line-height:1.4;color:#819db5;margin:8px 0 0}
      .collapsed .body{display:none}.collapsed .top{border-radius:12px;border-bottom:0}
      @media(max-width:420px){.panel{width:min(310px,calc(100vw - 16px));right:8px;top:70px}}
    </style>
    <section class="panel" aria-label="MACE Scratch variable panel">
      <div class="top" id="dragbar">
        <div><div class="brand">MACE <span class="sub">// SCRATCH TOOLS</span></div></div>
        <div class="headbuttons">
          <button class="secondary" id="minimize" title="Collapse panel" aria-label="Collapse panel">−</button>
          <button class="danger" id="hide" title="Hide panel" aria-label="Hide panel">×</button>
        </div>
      </div>
      <div class="body">
        <p class="status" id="status">Connecting to Scratch editor…</p>
        <button class="secondary wide" id="refresh">Refresh variables</button>
        <label for="search">Find a variable</label>
        <input id="search" placeholder="Search coins, score, lives…">
        <label for="variables">Game variables</label>
        <select id="variables" size="6"></select>
        <div class="selected" id="selected">Select a variable to edit it.</div>
        <label for="value">Value</label>
        <input id="value" type="number" step="any" value="1000">
        <div class="buttons">
          <button id="set">Set value</button><button class="secondary" id="add">Add value</button><button class="danger" id="reset">Set to 0</button>
        </div>
        <p class="message" id="message" role="status"></p>
        <p class="note">For your own Scratch projects. Runtime changes may reset when the project reloads. Drag this title bar to move the panel.</p>
      </div>
    </section>
  \`;

  const $ = id => shadow.getElementById(id);
  const panel = shadow.querySelector(".panel");
  const dragbar = $("dragbar");
  const statusEl = $("status");
  const messageEl = $("message");
  const selectEl = $("variables");
  const selectedEl = $("selected");
  const searchEl = $("search");
  let variables = [];
  let visibleVariables = [];

  function currentVariable() {
    const index = Number(selectEl.value);
    return Number.isInteger(index) ? visibleVariables[index] : null;
  }
  function renderVariables() {
    const query = searchEl.value.trim().toLowerCase();
    visibleVariables = variables.filter(v => (v.name + " " + v.targetName).toLowerCase().includes(query));
    selectEl.replaceChildren();
    visibleVariables.forEach((v, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = v.name + " = " + String(v.value) + " [" + v.targetName + "]";
      selectEl.appendChild(option);
    });
    if (visibleVariables.length) {
      selectEl.selectedIndex = 0;
      updateSelected();
    } else {
      selectedEl.textContent = variables.length ? "No matching variables." : "No variables found in this project.";
    }
  }
  function updateSelected() {
    const v = currentVariable();
    selectedEl.textContent = v ? v.name + " on " + v.targetName + " • Current value: " + v.value : "Select a variable to edit it.";
  }
  async function refresh() {
    statusEl.textContent = "Connecting to Scratch editor…";
    statusEl.style.color = "#61e6a5";
    messageEl.textContent = "";
    const status = await request("status");
    if (!status?.ok) {
      statusEl.textContent = "Not connected";
      statusEl.style.color = "#ff9b9b";
      messageEl.textContent = status?.error || "Could not connect.";
      return;
    }
    statusEl.textContent = "Connected to Scratch editor";
    const result = await request("list");
    if (!result?.ok) {
      messageEl.textContent = result?.error || "Could not read variables.";
      return;
    }
    variables = result.variables || [];
    renderVariables();
    messageEl.textContent = "Found " + variables.length + " variable entries.";
  }
  async function change(action) {
    const variable = currentVariable();
    if (!variable) { messageEl.textContent = "Choose a variable first."; return; }
    const raw = $("value").value;
    if (raw === "" || !Number.isFinite(Number(raw))) { messageEl.textContent = "Enter a valid number."; return; }
    const result = await request(action, {targetId:variable.targetId,variableId:variable.variableId,value:Number(raw)});
    if (!result?.ok) { messageEl.textContent = result?.error || "Update failed."; return; }
    messageEl.textContent = result.name + " updated to " + result.value + ".";
    await refresh();
  }

  $("refresh").addEventListener("click", refresh);
  $("set").addEventListener("click", () => change("set"));
  $("add").addEventListener("click", () => change("add"));
  $("reset").addEventListener("click", () => { $("value").value = "0"; change("set"); });
  selectEl.addEventListener("change", updateSelected);
  searchEl.addEventListener("input", renderVariables);
  $("minimize").addEventListener("click", event => {
    event.stopPropagation();
    panel.classList.toggle("collapsed");
    $("minimize").textContent = panel.classList.contains("collapsed") ? "+" : "−";
  });
  $("hide").addEventListener("click", event => { event.stopPropagation(); host.remove(); });

  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
  dragbar.addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    startX = event.clientX; startY = event.clientY;
    startLeft = rect.left; startTop = rect.top;
    panel.style.left = rect.left + "px";
    panel.style.top = rect.top + "px";
    panel.style.right = "auto";
    dragbar.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  dragbar.addEventListener("pointermove", event => {
    if (!dragging) return;
    const left = Math.min(Math.max(0, window.innerWidth - panel.offsetWidth), Math.max(0, startLeft + event.clientX - startX));
    const top = Math.min(Math.max(0, window.innerHeight - 48), Math.max(0, startTop + event.clientY - startY));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  });
  const stopDrag = () => { dragging = false; };
  dragbar.addEventListener("pointerup", stopDrag);
  dragbar.addEventListener("pointercancel", stopDrag);
  window.addEventListener("resize", () => {
    if (!host.isConnected) return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = Math.min(rect.left, Math.max(0, window.innerWidth - panel.offsetWidth)) + "px";
    panel.style.top = Math.min(rect.top, Math.max(0, window.innerHeight - 48)) + "px";
    panel.style.right = "auto";
  });
  refresh();
})();