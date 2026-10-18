(function () {
  "use strict";
  const api = window.WorkflowGenerator;
  const form = document.querySelector("#config");
  const preview = document.querySelector("#preview");
  const errors = document.querySelector("#errors");
  const feedback = document.querySelector("#feedback");
  const copy = document.querySelector("#copy");
  const download = document.querySelector("#download");
  let output = null;
  function configuration() {
    const data = new FormData(form);
    const c = Object.fromEntries(data);
    for (const key of ["push", "pullRequest", "dispatch", "schedule"]) c[key] = data.has(key);
    return c;
  }
  function update() {
    const c = configuration();
    const result = api.generate(c);
    output = result.yaml;
    errors.replaceChildren();
    for (const message of result.errors) {
      const p = document.createElement("p");
      p.textContent = message;
      errors.append(p);
    }
    errors.hidden = result.errors.length === 0;
    preview.textContent = output || "";
    copy.disabled = download.disabled = !output;
    document.querySelector("#validity").textContent = output ? "Inputs validated. Review this starter before using it." : "Fix the errors to generate YAML. Export is disabled.";
    document.querySelector("#save-path").textContent = output ? `.github/workflows/${c.filename}` : "No file generated";
    document.querySelector("#template-help").textContent = api.templates[c.template].help;
    form.elements.cron.disabled = !c.schedule;
    feedback.textContent = "";
  }
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("input", update);
  form.elements.template.addEventListener("change", () => {
    const template = api.templates[form.elements.template.value];
    form.elements.stepName.value = template.name;
    form.elements.commands.value = template.commands;
    if (["make", "cmake"].includes(form.elements.template.value)) form.elements.runner.value = "ubuntu-latest";
    update();
  });
  copy.addEventListener("click", async () => {
    if (!output) return;
    const text = output;
    try {
      await navigator.clipboard.writeText(text);
      feedback.textContent = "YAML copied. Save it inside .github/workflows/.";
    } catch {
      feedback.textContent = "Clipboard access failed. Select the preview and copy manually, or download the file.";
    }
  });
  download.addEventListener("click", () => {
    if (!output) return;
    const url = URL.createObjectURL(new Blob([output], { type: "text/yaml;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = form.elements.filename.value;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    feedback.textContent = "Download requested. Move the file into .github/workflows/.";
  });
  document.querySelectorAll("[data-answer]").forEach(button => button.addEventListener("click", () => {
    document.querySelector("#quiz-feedback").textContent = button.dataset.answer === "true" ? "Correct! runs-on selects the runner machine. steps lists its tasks." : "Not quite. uses selects an action; on selects events. Try again.";
  }));
  update();
})();
