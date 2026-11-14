(() => {
  const CHANNEL = "MACE_SCRATCH_CONNECTOR_V1";
  if (window.__maceScratchPageBridge) return;
  window.__maceScratchPageBridge = true;

  function findVM() {
    if (window.vm?.runtime) return window.vm;
    if (window.Scratch?.vm?.runtime) return window.Scratch.vm;

    // Scratch GUI keeps its VM in React component props/state in some builds.
    // Search mounted React fibers without depending on one fixed DOM element.
    const roots = document.querySelectorAll("*");
    const queue = [];
    for (const el of roots) {
      for (const key of Object.keys(el)) {
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactContainer$")) {
          queue.push(el[key]);
        }
      }
      if (queue.length > 20) break;
    }
    const seen = new Set();
    let steps = 0;
    while (queue.length && steps++ < 12000) {
      const node = queue.shift();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      const props = node.memoizedProps || node.pendingProps || {};
      const state = node.memoizedState || {};
      const candidates = [
        props.vm, props.value?.vm, props.store?.getState?.()?.scratchGui?.vm,
        state.element?.vm, state.memoizedState?.vm
      ];
      for (const candidate of candidates) {
        if (candidate?.runtime?.targets) return candidate;
      }
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
    return null;
  }

  function getVariables(vm) {
    const result = [];
    const seen = new Set();
    for (const target of (vm.runtime.targets || [])) {
      for (const variable of Object.values(target.variables || {})) {
        const key = target.id + ":" + variable.id;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          targetId: target.id,
          targetName: target.isStage ? "Stage" : (target.sprite?.name || target.getName?.() || "Sprite"),
          variableId: variable.id,
          name: variable.name,
          value: variable.value
        });
      }
    }
    return result;
  }

  function reply(id, result) {
    window.postMessage({ channel: CHANNEL, direction: "to-extension", id, result }, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.channel !== CHANNEL || event.data?.direction !== "to-page") return;
    const { id, action, payload = {} } = event.data;
    try {
      const vm = findVM();
      if (!vm?.runtime) {
        reply(id, { ok: false, error: "Scratch editor runtime was not found. Make sure this is your project editor page, then refresh it." });
        return;
      }

      if (action === "status") {
        reply(id, { ok: true, connected: true, project: location.href });
        return;
      }

      if (action === "list") {
        reply(id, { ok: true, variables: getVariables(vm) });
        return;
      }

      if (action === "set" || action === "add") {
        const { targetId, variableId, value } = payload;
        const target = (vm.runtime.targets || []).find(t => t.id === targetId);
        const variable = target?.variables?.[variableId];
        if (!target || !variable) {
          reply(id, { ok: false, error: "That variable is no longer available. Refresh the variable list." });
          return;
        }
        let next = value;
        if (action === "add") {
          const delta = Number(value);
          if (!Number.isFinite(delta)) throw new Error("Enter a valid number to add.");
          next = (Number(variable.value) || 0) + delta;
        }
        if (typeof vm.setVariableValue === "function") {
          vm.setVariableValue(targetId, variableId, next);
        } else {
          variable.value = next;
          vm.runtime.requestRedraw?.();
        }
        reply(id, { ok: true, name: variable.name, value: next });
        return;
      }

      reply(id, { ok: false, error: "Unknown action." });
    } catch (error) {
      reply(id, { ok: false, error: error?.message || String(error) });
    }
  });
})();