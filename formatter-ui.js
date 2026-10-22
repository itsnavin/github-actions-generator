(function () {
  "use strict";
  const byId = id => document.getElementById(`format-${id}`);
  const editor = byId("input");
  const section = document.getElementById("formatter");
  const limit = Number(section.dataset.limitBytes);
  const status = byId("status");
  const feedback = byId("feedback");
  const analyzeButton = byId("analyze");
  let source = "";
  let proposal = null;
  let worker = null;
  let timer = null;
  let revision = 0;
  const bytes = text => new TextEncoder().encode(text).length;
  const validFilename = () => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,69}\.ya?ml$/.test(byId("filename").value);
  function stopWorker() {
    if (worker) worker.terminate();
    worker = null;
    clearTimeout(timer);
    timer = null;
    section.removeAttribute("aria-busy");
  }
  function exportState() {
    byId("copy").disabled = !proposal;
    byId("download").disabled = !proposal || !validFilename();
  }
  function invalidate(message = "Source or options changed. Analyze again to create a fresh proposal.") {
    ++revision;
    stopWorker();
    proposal = null;
    byId("review").hidden = true;
    byId("before").replaceChildren();
    byId("after").replaceChildren();
    byId("summary").textContent = "";
    byId("diagnostics").replaceChildren();
    byId("apply").disabled = true;
    feedback.textContent = "";
    status.textContent = message;
    const length = bytes(source);
    byId("size").textContent = `${length} / ${limit} UTF-8 bytes`;
    analyzeButton.disabled = length > limit;
    if (length > limit) status.textContent = "Source exceeds 100 KiB. Shorten or clear it; nothing was parsed.";
    exportState();
  }
  function setSource(text, message) {
    source = text;
    editor.value = text;
    invalidate(message);
  }
  function showError(message) {
    invalidate(message);
    const li = document.createElement("li");
    li.textContent = message;
    byId("diagnostics").append(li);
  }
  function showDiagnostics(diagnostics) {
    const list = byId("diagnostics");
    list.replaceChildren();
    for (const issue of diagnostics.slice(0, 100)) {
      const li = document.createElement("li");
      li.className = issue.severity;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "diagnostic-location";
      button.textContent = `${issue.severity === "warning" ? "Warning" : "Error"} at line ${issue.line}, column ${issue.col} (${issue.code})`;
      button.addEventListener("click", () => {
        const lines = editor.value.split("\n");
        const offset = lines.slice(0, issue.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + issue.col - 1;
        editor.focus();
        editor.setSelectionRange(Math.min(offset, editor.value.length), Math.min(offset + 1, editor.value.length));
      });
      const description = document.createElement("p");
      description.textContent = issue.message;
      li.append(button, description);
      list.append(li);
    }
    if (diagnostics.length > 100) {
      const li = document.createElement("li");
      li.textContent = `${diagnostics.length - 100} additional diagnostics omitted. Correct the first errors, then analyze again.`;
      list.append(li);
    }
  }
  function snapshot(node, text) {
    const fragment = document.createDocumentFragment();
    text.replace(/\r\n/g, "\n").split("\n").forEach((line, index) => {
      const row = document.createElement("span");
      row.className = "format-line";
      const number = document.createElement("span");
      number.className = "format-line-number";
      number.setAttribute("aria-hidden", "true");
      number.textContent = `${index + 1} `;
      row.append(number, document.createTextNode(line + "\n"));
      fragment.append(row);
    });
    node.replaceChildren(fragment);
  }
  editor.addEventListener("input", () => {
    source = editor.value;
    invalidate();
  });
  for (const id of ["indent", "endings", "profile", "quote-on"]) byId(id).addEventListener("change", () => invalidate());
  byId("clear").addEventListener("click", () => {
    byId("upload").value = "";
    byId("filename").value = "workflow-formatted.yml";
    setSource("", "Editor and results cleared. No analysis yet.");
    editor.focus();
  });
  byId("example").addEventListener("click", () => {
    byId("upload").value = "";
    setSource('name: "Formatting practice"\non: workflow_dispatch\npermissions:\n    contents: read\njobs:\n    greet:\n        runs-on: ubuntu-latest\n        steps:\n          - name: Safe greeting\n            shell: bash\n            env:\n                MESSAGE: "Hello, learner!"\n            run: |\n                printf \'%s\\n\' "$MESSAGE"\n', "Safe example loaded. Analyze to review consistent indentation.");
  });
  byId("upload").addEventListener("change", async () => {
    invalidate("Reading a local file. No analysis yet.");
    const version = revision;
    const file = byId("upload").files[0];
    if (!file) return;
    if (!/\.ya?ml$/i.test(file.name)) { showError("Choose a .yml or .yaml file. The editor has not been replaced."); return; }
    if (file.size > limit) { showError("File exceeds 100 KiB. The editor has not been replaced."); return; }
    try {
      const buffer = await file.arrayBuffer();
      if (version !== revision) return;
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      // Decoding may strip a UTF-8 BOM; the visible YAML content is unchanged.
      if (text.includes("\0")) throw new Error("The file contains NUL characters and is not supported text YAML.");
      const stem = file.name.replace(/\.ya?ml$/i, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50).replace(/^-+/, "") || "workflow";
      byId("filename").value = `${stem}-formatted.yml`;
      setSource(text, "Local UTF-8 file loaded. The original file is unchanged. Analyze to review a proposal.");
    } catch (error) {
      if (version !== revision) return;
      showError(`Could not read the file as supported UTF-8 YAML. ${error instanceof Error ? error.message : "File reading failed."}`);
    }
  });
  analyzeButton.addEventListener("click", () => {
    invalidate("Analyzing locally. No scripts or expressions are executed.");
    const current = revision;
    const original = source;
    const options = {
      indent: Number(byId("indent").value), endings: byId("endings").value,
      profile: byId("profile").value, quoteOn: byId("quote-on").checked
    };
    if (!original.trim()) { showError("The editor is empty. Paste YAML, upload a file or load the safe example."); return; }
    if (bytes(original) > limit) return;
    try {
      worker = new Worker("formatter-worker.js");
      section.setAttribute("aria-busy", "true");
      worker.onmessage = event => {
        if (current !== revision) return;
        stopWorker();
        const result = event.data;
        showDiagnostics(result.diagnostics);
        if (!result.ok) {
          status.textContent = "No formatting proposal. Correct the diagnostics manually; no nesting was guessed.";
          return;
        }
        proposal = result.output;
        snapshot(byId("before"), original);
        snapshot(byId("after"), proposal);
        byId("summary").textContent = result.summary;
        byId("review").hidden = false;
        byId("apply").disabled = false;
        status.textContent = `${result.changed ? "Formatting proposal ready." : "Already formatted with these options."} ${options.profile === "workflow" ? "Basic structure checked, not the full Actions schema." : "Generic YAML only; workflow structure was not checked."} Review before exporting.`;
        exportState();
      };
      worker.onerror = () => {
        if (current !== revision) return;
        showError("The local formatter worker failed to load or process this document. No proposal was created. Use HTTP(S), check browser worker support, or use a local editor.");
      };
      timer = setTimeout(() => {
        if (current === revision) showError("Analysis exceeded five seconds and was stopped. No proposal was created. Simplify the document or use a local editor.");
      }, 5000);
      worker.postMessage({ input: original, options });
    } catch (error) {
      showError(`Could not start the local formatter. No proposal was created. ${error instanceof Error ? error.message : "Worker unavailable."}`);
    }
  });
  byId("apply").addEventListener("click", () => {
    if (!proposal) return;
    source = proposal;
    editor.value = proposal;
    ++revision;
    byId("apply").disabled = true;
    byId("size").textContent = `${bytes(source)} / ${limit} UTF-8 bytes`;
    feedback.textContent = "Reviewed proposal applied to this editor only. No file was saved or workflow started.";
  });
  byId("copy").addEventListener("click", async () => {
    if (!proposal) return;
    const current = revision;
    try {
      await navigator.clipboard.writeText(proposal);
      if (current === revision) feedback.textContent = "Proposal copied. Review it again before committing.";
    } catch {
      if (current === revision) feedback.textContent = "Clipboard access failed. Download the proposal or copy the reviewed editor text manually.";
    }
  });
  byId("filename").addEventListener("input", () => {
    exportState();
    feedback.textContent = validFilename() ? "" : "Choose a simple .yml or .yaml filename without folders or spaces.";
  });
  byId("download").addEventListener("click", () => {
    if (!proposal || !validFilename()) return;
    try {
      const url = URL.createObjectURL(new Blob([proposal], { type: "text/yaml;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = byId("filename").value;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      feedback.textContent = "Formatted YAML download requested. The original file was not modified.";
    } catch {
      feedback.textContent = "Download failed. Copy the proposal or use a local editor; no file was saved by this app.";
    }
  });
  window.addEventListener("pagehide", stopWorker);
  invalidate("No analysis yet.");
})();
