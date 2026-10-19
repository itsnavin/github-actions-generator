const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const YAML = require("yaml");
const ref = require("../reference.js");
const generator = require("../generator.js");

test("every generator control has a specific before-use explanation", () => {
  const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");
  const form = html.split('<form id="config"')[1].split("</form>")[0];
  const controls = [...form.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(controls.sort(), Object.keys(ref.fields).sort());
  assert.deepEqual(controls.sort(), Object.keys(generator.defaults).sort());
  for (const [name, field] of Object.entries(ref.fields)) {
    assert.ok(field.purpose.length > 20, name);
    assert.ok(field.value.length > 30, name);
    assert.ok(field.example.length > 10, name);
    assert.ok(ref.topics.some(t => t.id === field.topic), name);
  }
});
test("every catalog topic has scope, types, example, pitfalls and official source", () => {
  assert.equal(ref.checked, "2026-10-20");
  assert.equal(new Set(ref.topics.map(t => t.id)).size, ref.topics.length);
  for (const topic of ref.topics) {
    assert.match(topic.id, /^[a-z][a-z0-9-]+$/);
    for (const key of ["purpose", "scope", "values", "example", "gotchas"]) assert.ok(topic[key].length >= 20, `${topic.id}.${key}`);
    assert.equal(new URL(topic.source).hostname, "docs.github.com");
    assert.equal(new URL(topic.source).protocol, "https:");
    assert.ok(topic.support.length > 5);
  }
});
test("every documented YAML fragment and complete example parses", () => {
  for (const topic of ref.topics) {
    const doc = YAML.parseDocument(topic.example, { uniqueKeys: true });
    assert.deepEqual(doc.errors, [], topic.id);
    assert.ok(doc.toJS() && typeof doc.toJS() === "object", topic.id);
    if (topic.complete) {
      const parsed = doc.toJS();
      assert.ok(parsed.on);
      assert.ok(parsed.jobs);
      assert.deepEqual(parsed.permissions, { contents: "read" });
      assert.ok(!parsed.on.pull_request_target);
    }
  }
  const workflow = YAML.parse(ref.walkthrough);
  assert.ok(workflow.jobs.greet);
  assert.deepEqual(workflow.on, { workflow_dispatch: {} });
  for (const [topic] of ref.annotations) assert.ok(ref.topics.some(t => t.id === topic));
});
test("YAML folding examples teach actual scalar behavior", () => {
  const parsed = YAML.parse(ref.topics.find(t => t.id === "multiline").example);
  assert.equal(parsed.literal, "line one\nline two\n");
  assert.equal(parsed.folded, "one long sentence\n");
});
test("search matches title, purpose, code, pitfalls and group filters", () => {
  assert.ok(ref.search("MATRIX").some(t => t.id === "matrix"));
  assert.ok(ref.search("GITHUB_OUTPUT").some(t => t.id === "outputs"));
  assert.ok(ref.search("pull_request_target").some(t => t.id === "secrets"));
  assert.ok(ref.search("branch path").some(t => t.id === "filters"));
  assert.ok(ref.search("fail-fast").some(t => t.id === "matrix"));
  assert.equal(ref.search("this-is-not-a-syntax-topic").length, 0);
  const jobs = ref.search("", "Jobs");
  assert.ok(jobs.length > 0);
  assert.ok(jobs.every(t => t.group === "Jobs"));
  assert.equal(ref.search("").length, ref.topics.length);
});
test("every generated preview key links to a real reference topic", () => {
  for (const [template, spec] of Object.entries(generator.templates)) {
    const output = generator.generate({ template, stepName: spec.name, commands: spec.commands, schedule: true, branches: "main" }).yaml;
    for (const line of output.split("\n")) {
      const match = /^(\s*)"([^"]+)":/.exec(line);
      if (!match) continue;
      const topic = ref.previewTopic(match[2], match[1].length);
      assert.ok(ref.topics.some(t => t.id === topic), `${template}: ${match[2]}`);
    }
  }
});
