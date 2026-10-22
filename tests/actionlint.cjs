const { mkdirSync, writeFileSync, readdirSync, unlinkSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("../generator.js");
const reference = require("../reference.js");
const formatter = require("../formatter-core.cjs");
const formatterFixtures = require("./formatter-fixtures.cjs");
const dir = join(__dirname, "..", ".generated-workflows");
mkdirSync(dir, { recursive: true });
for (const file of readdirSync(dir)) {
  if (/^fixture-\d+\.yml$/.test(file)) unlinkSync(join(dir, file));
}
const files = [];
for (const [template, spec] of Object.entries(api.templates)) {
  for (const runner of ["ubuntu-latest", "windows-latest", "macos-latest"]) {
    if (["make", "cmake"].includes(template) && runner !== "ubuntu-latest") continue;
    for (let flags = 1; flags < 16; flags++) {
      const result = api.generate({ template, runner, stepName: spec.name, commands: spec.commands,
        push: !!(flags & 1), pullRequest: !!(flags & 2), dispatch: !!(flags & 4), schedule: !!(flags & 8),
        branches: flags & 3 ? "main\nrelease/**" : "" });
      if (result.errors.length) throw new Error(result.errors.join("\n"));
      const file = join(dir, `fixture-${files.length}.yml`);
      writeFileSync(file, result.yaml);
      files.push(file);
    }
  }
}
const generatedCount = files.length;
for (const text of [reference.walkthrough, ...reference.topics.filter(t => t.complete).map(t => t.example)]) {
  const file = join(dir, `fixture-${files.length}.yml`);
  writeFileSync(file, text);
  files.push(file);
}
const learningCount = files.length - generatedCount;
const textsToFormat = [reference.walkthrough, ...formatterFixtures.fixtures.map(fixture => fixture.text)];
for (const text of textsToFormat) {
  const result = formatter.analyze(text);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  const file = join(dir, `fixture-${files.length}.yml`);
  writeFileSync(file, result.output);
  files.push(file);
}
// Generated commands are never executed; actionlint inspects files only.
for (let start = 0; start < files.length; start += 25) {
  const result = spawnSync(process.env.ACTIONLINT || "actionlint", ["-shellcheck=", "-pyflakes=", ...files.slice(start, start + 25)], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`actionlint passed for ${generatedCount} generated workflows, ${learningCount} complete learning examples and ${textsToFormat.length} formatter outputs (shellcheck/pyflakes disabled).`);
