const statusEl = document.getElementById("status");
const messageEl = document.getElementById("message");
const selectEl = document.getElementById("variables");
const selectedEl = document.getElementById("selected");
const searchEl = document.getElementById("search");
let variables = [];

function send(action, payload = {}) {
  return new Promise((resolve) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id || !tab.url?.startsWith("https://scratch.mit.edu/projects/")) {
        resolve({ok:false, error:"Open one of your projects on the Scratch editor page first."});
        return;
      }
      chrome.tabs.sendMessage(tab.id, {from:"mace-popup", action, payload}, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ok:false, error:"Refresh the Scratch editor page, then reopen MACE."});
        } else resolve(response || {ok:false,error:"No response from the Scratch page."});
      });
    });
  });
}

function currentVariable() {
  const index = Number(selectEl.value);
  return Number.isInteger(index) ? visibleVariables[index] : null;
}
let visibleVariables = [];

function renderVariables() {
  const q = searchEl.value.trim().toLowerCase();
  visibleVariables = variables.filter(v =>
    (v.name + " " + v.targetName).toLowerCase().includes(q)
  );
  selectEl.innerHTML = "";
  visibleVariables.forEach((v, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = `${v.name}  =  ${String(v.value)}  [${v.targetName}]`;
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
  selectedEl.textContent = v ? `${v.name} on ${v.targetName} • Current value: ${v.value}` : "Select a variable to edit it.";
}

async function refresh() {
  statusEl.textContent = "Connecting to Scratch editor…";
  messageEl.textContent = "";
  const status = await send("status");
  if (!status?.ok) {
    statusEl.textContent = "Not connected";
    statusEl.style.color = "#ff9b9b";
    messageEl.textContent = status?.error || "Could not connect.";
    return;
  }
  statusEl.textContent = "Connected to Scratch editor";
  statusEl.style.color = "#61e6a5";
  const result = await send("list");
  if (!result?.ok) {
    messageEl.textContent = result?.error || "Could not read variables.";
    return;
  }
  variables = result.variables || [];
  renderVariables();
  messageEl.textContent = `Found ${variables.length} variable entries.`;
}

async function change(action) {
  const v = currentVariable();
  if (!v) {
    messageEl.textContent = "Choose a variable first.";
    return;
  }
  const raw = document.getElementById("value").value;
  if (raw === "" || !Number.isFinite(Number(raw))) {
    messageEl.textContent = "Enter a valid number.";
    return;
  }
  const result = await send(action, {targetId:v.targetId, variableId:v.variableId, value:Number(raw)});
  if (!result?.ok) {
    messageEl.textContent = result?.error || "Update failed.";
    return;
  }
  messageEl.textContent = `${result.name} updated to ${result.value}.`;
  await refresh();
}

document.getElementById("refresh").addEventListener("click", refresh);
document.getElementById("set").addEventListener("click", () => change("set"));
document.getElementById("add").addEventListener("click", () => change("add"));
document.getElementById("reset").addEventListener("click", () => {
  document.getElementById("value").value = "0";
  change("set");
});
selectEl.addEventListener("change", updateSelected);
searchEl.addEventListener("input", renderVariables);
refresh();