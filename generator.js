(function (root) {
  "use strict";
  const actions = Object.freeze({
    checkout: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    node: "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1",
    python: "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97"
  });
  const templates = Object.freeze({
    hello: { name: "Say hello", commands: 'printf \'%s\\n\' "$LEARNING_MESSAGE"', help: "No project files needed. Replace the Bash command with your own when ready." },
    make: { name: "Build with Make", commands: "make", help: "Requires a Makefile in the working directory with a default build target. Ubuntu provides GCC and Make." },
    cmake: { name: "Configure and build", commands: "cmake -S . -B build -DCMAKE_BUILD_TYPE=Release\ncmake --build build --config Release", help: "Requires CMakeLists.txt and your C/C++ sources in the working directory. This builds; it does not invent or run tests." },
    node: { name: "Install and test", commands: "npm ci\nnpm test", help: "Uses Node.js 24. Requires package.json, a committed package-lock.json and a test script. No automatic dependency cache." },
    python: { name: "Run Python tests", commands: "python -m unittest discover -s tests -v", help: "Uses Python 3.13. Requires a tests folder containing unittest tests named test*.py. No third-party dependencies installed by default." }
  });
  const defaults = Object.freeze({
    template: "hello", name: "My first workflow", filename: "ci.yml",
    push: true, pullRequest: true, dispatch: true, schedule: false,
    branches: "", cron: "17 9 * * 1-5", runner: "ubuntu-latest", directory: ".",
    stepName: templates.hello.name, commands: templates.hello.commands,
    message: "Hello from GitHub Actions!"
  });
  const control = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/u;
  function plain(value, multiline = false) {
    return typeof value === "string" && !control.test(multiline ? value.replace(/\r\n/g, "\n") : value) &&
      (multiline || !/[\r\n\t]/.test(value)) && !value.includes("${{");
  }
  function cronValues(field, min, max) {
    const values = new Set();
    for (const part of field.split(",")) {
      const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
      if (!match) return null;
      const step = match[2] === undefined ? 1 : Number(match[2]);
      const range = match[1] === "*" ? [min, max] : match[1].split("-").map(Number);
      if (range.length === 1) range.push(match[2] === undefined ? range[0] : max);
      if (step < 1 || step > max - min + 1 || range[0] < min || range[1] > max || range[0] > range[1]) return null;
      for (let n = range[0]; n <= range[1]; n += step) values.add(n);
    }
    return [...values].sort((a, b) => a - b);
  }
  function validCron(value) {
    if (typeof value !== "string" || value.length > 120) return false;
    const fields = value.trim().split(/\s+/);
    if (fields.length !== 5) return false;
    const bounds = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
    const parsed = fields.map((f, i) => cronValues(f, ...bounds[i]));
    if (parsed.some(v => !v || !v.length)) return false;
    const times = parsed[1].flatMap(h => parsed[0].map(m => h * 60 + m)).sort((a, b) => a - b);
    return times.every((t, i) => (i ? t - times[i - 1] : t + 1440 - times[times.length - 1]) >= 5);
  }
  function validate(c) {
    const errors = [];
    if (!Object.hasOwn(templates, c.template)) errors.push("Choose a supported template.");
    for (const [key, label] of [["name", "Workflow name"], ["stepName", "Step name"]]) {
      if (!plain(c[key]) || !c[key].trim() || c[key].length > 100) errors.push(`${label} must be 1-100 characters of plain text, without Actions expressions.`);
    }
    if (typeof c.filename !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,69}\.ya?ml$/.test(c.filename)) errors.push("File name must be a simple .yml or .yaml name, without folders or spaces.");
    for (const key of ["push", "pullRequest", "dispatch", "schedule"]) {
      if (typeof c[key] !== "boolean") errors.push(`The ${key} trigger must be on or off.`);
    }
    if (!(c.push || c.pullRequest || c.dispatch || c.schedule)) errors.push("Select at least one trigger.");
    if (!["ubuntu-latest", "windows-latest", "macos-latest"].includes(c.runner)) errors.push("Choose a supported GitHub-hosted runner.");
    if (["make", "cmake"].includes(c.template) && c.runner !== "ubuntu-latest") errors.push("Make and CMake starter templates require Ubuntu. Choose Ubuntu or a custom Bash template.");
    if (typeof c.directory !== "string" || c.directory.length > 150 || !(c.directory === "." || /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(c.directory))) errors.push("Working directory must be . or a relative path such as src/app (letters, digits, _ and - only).");
    if (!plain(c.message) || c.message.length > 200) errors.push("Environment value must be plain text, at most 200 characters, with no expressions or newlines.");
    if (!plain(c.commands, true) || !c.commands.trim() || c.commands.length > 10000 || c.commands.includes("\t")) errors.push("Commands must be 1-10000 characters, without tabs, control characters or raw ${{ expressions. Use env variables for data.");
    if (!plain(c.branches, true) || c.branches.length > 1000) {
      errors.push("Branch filters must be plain text, at most 1000 characters.");
    } else {
      const branches = c.branches.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
      if (branches.length && !c.push && !c.pullRequest) errors.push("Branch filters require push or pull request. Clear the filters or enable one of those triggers.");
      if (branches.some(v => !/^[a-zA-Z0-9_*][a-zA-Z0-9_/*.-]*$/.test(v) || v.includes("..") || v.includes("//") || v.includes("@{") || v.endsWith("/") || v.endsWith(".") || v.split("/").some(p => p.startsWith(".") || p.endsWith(".lock")))) errors.push("Use simple branch names or * globs, one per line (e.g. main or release/**). Negation, spaces and special patterns are not supported.");
    }
    if (c.schedule && !validCron(c.cron)) errors.push("Cron needs five valid numeric fields, with runs at least 5 minutes apart. Example: 17 9 * * 1-5.");
    return errors;
  }
  // This restricted serializer emits only mappings, lists and explicitly typed scalars.
  // Quoting every key also keeps "on" a string for YAML 1.1 parsers.
  function yaml(value, depth = 0) {
    const pad = "  ".repeat(depth);
    if (Array.isArray(value)) return value.map(v => v && typeof v === "object" ?
      `${pad}-\n${yaml(v, depth + 1)}` : `${pad}- ${JSON.stringify(v)}`).join("\n");
    return Object.entries(value).map(([key, val]) => {
      const prefix = `${pad}${JSON.stringify(key)}:`;
      if (val && typeof val === "object") {
        if (!Object.keys(val).length) return `${prefix} {}`;
        return `${prefix}\n${yaml(val, depth + 1)}`;
      }
      if (key === "run") return `${prefix} |2\n${val.replace(/\n+$/, "").split("\n").map(line => `${pad}  ${line}`).join("\n")}`;
      return `${prefix} ${JSON.stringify(val)}`;
    }).join("\n");
  }
  function generate(config) {
    const c = { ...defaults, ...config };
    const errors = validate(c);
    if (errors.length) return { errors, yaml: null, workflow: null };
    const on = {};
    const branches = c.branches.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    for (const [enabled, event] of [[c.push, "push"], [c.pullRequest, "pull_request"]]) {
      if (enabled) on[event] = branches.length ? { branches: [...new Set(branches)] } : {};
    }
    if (c.dispatch) on.workflow_dispatch = {};
    if (c.schedule) on.schedule = [{ cron: c.cron.trim().replace(/\s+/g, " ") }];
    const steps = [];
    steps.push({ name: "Check out repository", uses: actions.checkout, with: { "persist-credentials": false } });
    if (c.template === "node") steps.push({ name: "Set up Node.js", uses: actions.node, with: { "node-version": "24", "package-manager-cache": false } });
    if (c.template === "python") steps.push({ name: "Set up Python", uses: actions.python, with: { "python-version": "3.13" } });
    steps.push({ name: c.stepName, shell: "bash", "working-directory": c.directory, env: { LEARNING_MESSAGE: c.message }, run: c.commands.replace(/\r\n/g, "\n").replace(/\n+$/, "") + "\n" });
    const workflow = { name: c.name, on, permissions: { contents: "read" }, jobs: { build: { "runs-on": c.runner, "timeout-minutes": 15, steps } } };
    const comments = "# Generated by Actions Lab. Review commands before committing.\n# Official action pins: checkout v7.0.1; setup-node v7.1.0; setup-python v7.0.0.\n# Parsing and linting do not prove successful workflow execution.\n";
    return { errors: [], workflow, yaml: comments + yaml(workflow) + "\n" };
  }
  const api = Object.freeze({ actions, templates, defaults, validate, validCron, generate });
  root.WorkflowGenerator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
