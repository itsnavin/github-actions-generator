const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { Script, createContext } = require("node:vm");
const YAML = require("yaml");
const formatter = require("../formatter-core.cjs");
const { fixtures } = require("./formatter-fixtures.cjs");
const { walkthrough, topics } = require("../reference.js");
const { templates, generate } = require("../generator.js");
const parse = text => YAML.parseDocument(text, { version: "1.2", uniqueKeys: true, intAsBigInt: true });
const scriptOf = text => parse(text).getIn(["jobs", "build", "steps", 0, "run"]);

for (const fixture of fixtures) {
  for (const indent of [2, 4, 8]) {
    for (const endings of ["lf", "crlf", "preserve"]) {
      test(`${fixture.name}: ${indent} spaces / ${endings}`, () => {
        const input = endings === "preserve" ? fixture.text.replace(/\n/g, "\r\n") : fixture.text;
        const result = formatter.analyze(input, { indent, endings });
        assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
        assert.equal(result.diagnostics.length, 0);
        assert.equal(scriptOf(input), fixture.script);
        assert.equal(scriptOf(result.output), fixture.script);
        assert.deepEqual(Buffer.from(scriptOf(result.output), "utf8"), Buffer.from(scriptOf(input), "utf8"));
        assert.ok(result.output.includes("# Keep the heading and key order"));
        assert.ok(result.output.includes("# Keep the final comment"));
        assert.ok(result.output.includes("# a string key, not a boolean"));
        assert.equal(typeof parse(result.output).get("on"), "string");
        assert.ok(result.output.includes('"on":'));
        assert.equal(parse(result.output).getIn(["jobs", "build", "steps", 0, "env", "NOTE"]), "${{ github.ref }}");
        const twice = formatter.analyze(result.output, { indent, endings });
        assert.equal(twice.ok, true, JSON.stringify(twice.diagnostics));
        assert.equal(twice.output, result.output);
        assert.equal(twice.changed, false);
      });
    }
  }
}
test("formats every existing generated template and standalone lesson without changing data", () => {
  const texts = [walkthrough, ...topics.filter(t => t.complete).map(t => t.example),
    ...Object.keys(templates).map(template => generate({ template, commands: templates[template].commands }).yaml)];
  for (const text of texts) {
    const result = formatter.analyze(text);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.deepEqual(parse(result.output).toJS(), parse(text).toJS());
  }
});
test("generic YAML scalar types, huge integer, quotes, literal tabs, aliases, flow and order", () => {
  const source = [
    "# All values are deliberate",
    'on: [push, pull_request]',
    'string: "true"',
    "bool: false",
    "integer: 90071992547409931234567890123456789",
    "decimal: 3.140",
    "nothing: null",
    "literal: &word 'yes'",
    "copy: *word # alias stays an alias",
    "mapping: &settings {value: 1, text: '2'}",
    "second: *settings",
    'escaped: "a\\tb\\r\\nc"',
    "flow: {first: 1, second: 2}",
    "list: [null, true, 'false']",
    ""
  ].join("\n");
  const result = formatter.analyze(source, { profile: "yaml" });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(parse(result.output).toJS(), parse(source).toJS());
  assert.equal(parse(result.output).get("integer"), 90071992547409931234567890123456789n);
  assert.ok(result.output.includes("&settings"));
  assert.ok(result.output.includes("*settings"));
  assert.ok(result.output.includes("# alias stays an alias"));
  assert.deepEqual(parse(result.output).contents.items.map(p => p.key.value), parse(source).contents.items.map(p => p.key.value));
});
test("quote on is optional, YAML 1.1 compatibility does not convert values", () => {
  const source = "on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n";
  assert.ok(formatter.analyze(source).output.includes('"on":'));
  assert.ok(formatter.analyze(source, { quoteOn: false }).output.startsWith("on: push"));
  assert.ok(YAML.parse(formatter.analyze(source).output, { version: "1.1" }).on);
});
test("newline options preserve parsed strings while controlling file line endings", () => {
  const source = 'text: "one\\r\\ntwo"\r\n';
  for (const endings of ["lf", "crlf", "preserve"]) {
    const result = formatter.analyze(source, { profile: "yaml", endings });
    assert.equal(result.ok, true);
    assert.equal(parse(result.output).get("text"), "one\r\ntwo");
    assert.equal(result.output.includes("\r\n"), endings !== "lf");
  }
});
for (const [name, source] of [
  ["indentation-tab", "jobs:\n\tbuild:\n    steps: []\n"],
  ["ambiguous-dedent", "a:\n  b: 1\n c: 2\n"],
  ["duplicate-key", "name: first\nname: second\n"],
  ["duplicate-nested-key", "a:\n  key: one\n  key: two\n"],
  ["bad-quote", 'name: "unfinished\n'],
  ["multiple-documents", "a: 1\n---\nb: 2\n"],
  ["yaml-1.1-directive", "%YAML 1.1\n---\non: push\n"],
  ["yaml-1.2-directive", "%YAML 1.2\n---\non: push\n"],
  ["custom-tag", "a: !secret value\n"],
  ["explicit-tag", "a: !!str true\n"],
  ["merge-key", "a: &base {b: 1}\nc:\n  <<: *base\n"],
  ["cyclic-alias", "a: &base [*base]\n"],
  ["unknown-alias", "a: *missing\n"],
  ["forward-alias", "a: *future\nb: &future value\n"],
  ["duplicate-anchor", "a: &same one\nb: &same two\n"],
  ["complex-key", "? [a, b]\n: value\n"],
  ["non-string-key", "1: value\n"],
  ["empty", ""]
]) {
  test(`${name} is diagnostic-only (no original-output fallback)`, () => {
    const result = formatter.analyze(source, { profile: "yaml" });
    assert.equal(result.ok, false);
    assert.equal(result.output, null);
    assert.ok(result.diagnostics.length);
    assert.ok(result.diagnostics.every(d => d.line >= 1 && d.col >= 1));
  });
}
test("syntax diagnostics locate indentation tabs at their original line/column", () => {
  const result = formatter.analyze("a: 1\nb:\n\tc: 2\n", { profile: "yaml" });
  assert.ok(result.diagnostics.some(d => d.code === "TAB_AS_INDENT" && d.line === 3 && d.col === 1));
});
for (const [name, source] of [
  ["wrong-root", "- name: a\n"],
  ["no-trigger", "jobs: {}\n"],
  ["empty-triggers", "on: {}\njobs: {}\n"],
  ["non-string-event", "on: [true]\njobs: {}\n"],
  ["boolean-runner", "on: push\njobs:\n  build:\n    runs-on: true\n    steps:\n      - run: echo ok\n"],
  ["steps-as-map", "on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      run: echo ok\n"],
  ["misparented-step", "on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    run: echo ok\n"],
  ["run-and-uses", "on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n        uses: ./action\n"],
  ["boolean-command", "on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n"],
  ["caller-with-steps", "on: push\njobs:\n  build:\n    uses: ./.github/workflows/reusable.yml\n    steps:\n      - run: echo ok\n"],
  ["top-level-runner", "on: push\nruns-on: ubuntu-latest\njobs: {}\n"]
]) {
  test(`${name} flags workflow structure, not speculative reparenting`, () => {
    assert.equal(parse(source).errors.length, 0);
    const result = formatter.analyze(source);
    assert.equal(result.ok, false);
    assert.equal(result.output, null);
    assert.ok(result.diagnostics.some(d => d.code === "WORKFLOW_STRUCTURE"));
    assert.equal(formatter.analyze(source, { profile: "yaml" }).ok, true);
  });
}
test("legitimate reusable workflow caller and aliases are preserved, not expanded", () => {
  const caller = "on: push\njobs:\n  caller:\n    uses: ./.github/workflows/reusable.yml\n    secrets: inherit\n";
  assert.equal(formatter.analyze(caller).ok, true);
  const aliased = "on: push\njobs:\n  build: &job\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n  other: *job\n";
  const result = formatter.analyze(aliased);
  assert.equal(result.ok, true);
  assert.ok(result.diagnostics.some(d => d.code === "ALIASED_STRUCTURE" && d.severity === "warning"));
  assert.ok(result.output.includes("*job"));
});
test("privileged trigger warns rather than pretending formatting makes it safe", () => {
  const source = walkthrough.replace("workflow_dispatch", "pull_request_target");
  const result = formatter.analyze(source);
  assert.equal(result.ok, true);
  assert.ok(result.diagnostics.some(d => d.code === "PRIVILEGED_TRIGGER"));
});
test("limits, unsupported options and complexity fail explicitly", () => {
  assert.equal(formatter.analyze("a: " + "x".repeat(formatter.LIMIT_BYTES), { profile: "yaml" }).diagnostics[0].code, "SIZE");
  assert.equal(formatter.analyze("a: " + "\u{1f44b}".repeat(30000), { profile: "yaml" }).diagnostics[0].code, "SIZE");
  assert.equal(formatter.analyze("a: 1", { indent: 3 }).diagnostics[0].code, "OPTIONS");
  assert.equal(formatter.analyze("a: 1", { quoteOn: "yes" }).diagnostics[0].code, "OPTIONS");
  assert.equal(formatter.analyze(null).ok, false);
  const deep = "a: " + "[".repeat(65) + "null" + "]".repeat(65);
  assert.equal(formatter.analyze(deep, { profile: "yaml" }).ok, false);
  const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes(`data-limit-bytes="${formatter.LIMIT_BYTES}"`));
});
test("bundled browser build matches core results without Node or remote imports", () => {
  const source = readFileSync(join(__dirname, "..", "vendor", "formatter.bundle.js"), "utf8");
  const context = createContext({ TextEncoder });
  new Script(source).runInContext(context);
  const result = context.WorkflowFormatter.analyze(walkthrough);
  assert.equal(result.output, formatter.analyze(walkthrough).output);
  assert.equal(result.ok, true);
});
test("preservation guard blocks a formatter that changes parsed script content", () => {
  const original = YAML.Document.prototype.toString;
  try {
    YAML.Document.prototype.toString = function (options) {
      return original.call(this, options).replace("Hello, learner!", "Changed");
    };
    const result = formatter.analyze(walkthrough);
    assert.equal(result.ok, false);
    assert.equal(result.output, null);
    assert.ok(result.diagnostics.some(d => d.code === "INVARIANT"));
  } finally {
    YAML.Document.prototype.toString = original;
  }
});
test("preservation guard also rejects comment loss, key reordering and scalar type changes", () => {
  const original = YAML.Document.prototype.toString;
  const source = "# Keep me\nfirst: true\nsecond: 2\n";
  for (const mutate of [
    text => text.replace("# Keep me\n", ""),
    text => text.replace("first: true\nsecond: 2", "second: 2\nfirst: true"),
    text => text.replace("first: true", 'first: "true"')
  ]) {
    try {
      YAML.Document.prototype.toString = function (options) { return mutate(original.call(this, options)); };
      const result = formatter.analyze(source, { profile: "yaml" });
      assert.equal(result.output, null);
      assert.equal(result.ok, false);
      assert.equal(result.diagnostics.at(-1).code, "INVARIANT");
    } finally {
      YAML.Document.prototype.toString = original;
    }
  }
});
