const { test } = require("node:test");
const assert = require("node:assert/strict");
const YAML = require("yaml");
const api = require("../generator.js");

function roundTrip(config) {
  const result = api.generate(config);
  assert.deepEqual(result.errors, []);
  const doc = YAML.parseDocument(result.yaml, { uniqueKeys: true });
  assert.deepEqual(doc.errors, []);
  assert.deepEqual(doc.toJS(), result.workflow);
  assert.equal(typeof YAML.parse(result.yaml, { version: "1.1" }).on, "object");
  assert.equal(result.workflow.permissions.contents, "read");
  for (const step of result.workflow.jobs.build.steps) {
    if (step.uses) assert.match(step.uses, /^actions\/[a-z-]+@[0-9a-f]{40}$/);
  }
  return result;
}

for (const [template, spec] of Object.entries(api.templates)) {
  for (const runner of ["ubuntu-latest", "windows-latest", "macos-latest"]) {
    if (["make", "cmake"].includes(template) && runner !== "ubuntu-latest") continue;
    for (let flags = 1; flags < 16; flags++) {
      test(`${template}/${runner}/triggers-${flags}`, () => {
        const c = { template, runner, commands: spec.commands, stepName: spec.name,
          push: !!(flags & 1), pullRequest: !!(flags & 2), dispatch: !!(flags & 4), schedule: !!(flags & 8) };
        const { workflow } = roundTrip(c);
        assert.deepEqual(Object.keys(workflow.on), [
          ...(c.push ? ["push"] : []), ...(c.pullRequest ? ["pull_request"] : []),
          ...(c.dispatch ? ["workflow_dispatch"] : []), ...(c.schedule ? ["schedule"] : [])
        ]);
        assert.equal(workflow.jobs.build.steps.some(s => s.uses === api.actions.checkout), true);
      });
    }
  }
}

test("quotes, booleans, Unicode and YAML-looking strings stay data", () => {
  for (const text of ['on', 'yes', 'null', '3.13', 'a: b # c', '"quoted" \\ path', "'single'", "<script>alert(1)</script>", "Hello \u{1f44b}"]) {
    const { workflow } = roundTrip({ name: text, stepName: text, message: text });
    assert.equal(workflow.name, text);
    assert.equal(workflow.jobs.build.steps.at(-1).env.LEARNING_MESSAGE, text);
  }
});
test("commands preserve indentation, blank lines, quotes and CRLF", () => {
  for (const commands of ["  echo indented\nprintf '%s\\n' ok", "cat <<'EOF'\nline: # value\n\nEOF", "echo first\r\necho second\r\n", "echo 'trailing spaces'  \n\n"]) {
    const { workflow } = roundTrip({ commands });
    assert.equal(workflow.jobs.build.steps.at(-1).run, commands.replace(/\r\n/g, "\n").replace(/\n+$/, "") + "\n");
  }
});
test("branch filtering is quoted, deduplicated, scoped to push/PR", () => {
  const { workflow } = roundTrip({ branches: "main\nrelease/**\nmain", schedule: true });
  assert.deepEqual(workflow.on.push.branches, ["main", "release/**"]);
  assert.deepEqual(workflow.on.pull_request.branches, ["main", "release/**"]);
  assert.deepEqual(workflow.on.workflow_dispatch, {});
  assert.deepEqual(workflow.on.schedule, [{ cron: "17 9 * * 1-5" }]);
});
for (const cron of ["17 9 * * 1-5", "*/5 * * * *", "0,30 8-17 * * 0,7", "0 0 1 1 *", "0-55/5 * * * *"]) {
  test(`valid cron ${cron}`, () => { assert.equal(api.validCron(cron), true); roundTrip({ schedule: true, cron }); });
}
for (const cron of ["* * * * *", "*/0 * * * *", "*/4 * * * *", "1,2 * * * *", "0,58 * * * *", "60 0 * * *", "0 24 * * *", "0 0 0 * *", "0 0 * 13 *", "0 0 * * 8", "@daily", "0 0 * * MON", "0 0 * * * *", "0 0 * * 5-1"]) {
  test(`invalid cron ${cron}`, () => assert.equal(api.validCron(cron), false));
}
for (const config of [
  { name: "" }, { stepName: " " }, { name: "a\nb" }, { name: "${{ github.event.issue.title }}" },
  { message: "${{ secrets.TOKEN }}" }, { message: "\u0000" }, { message: "\ud800" },
  { commands: "" }, { commands: "echo\tunsafe" }, { commands: "echo ${{ github.event.pull_request.title }}" },
  { commands: "echo a\recho b" }, { commands: "echo \u2028x" },
  { filename: "../ci.yml" }, { filename: "a.yml.exe" }, { filename: "bad name.yml" },
  { directory: "../src" }, { directory: "/src" }, { directory: "a;echo" }, { directory: "${{ github.workspace }}" },
  { branches: "!main" }, { branches: "../main" }, { branches: "a b" }, { branches: "foo/.hidden" },
  { branches: "a.lock" }, { branches: "main", push: false, pullRequest: false },
  { runner: "self-hosted" }, { template: "make", runner: "windows-latest" },
  { template: "__proto__" }, { push: "true" }, { push: false, pullRequest: false, dispatch: false, schedule: false },
  { schedule: true, cron: "invalid" }
]) {
  test(`invalid input ${JSON.stringify(config)}`, () => {
    const result = api.generate(config);
    assert.ok(result.errors.length);
    assert.equal(result.yaml, null);
    assert.equal(result.workflow, null);
  });
}
test("plain branch names and relative paths work", () => {
  roundTrip({ branches: "main\nfeature/safe-name\nv1.0", directory: "src/app" });
});
