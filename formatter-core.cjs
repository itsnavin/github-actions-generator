"use strict";
const YAML = require("yaml");
const LIMIT_BYTES = 100 * 1024;
const MAX_DEPTH = 60;
const MAX_NODES = 12000;

function byteLength(text) { return new TextEncoder().encode(text).length; }
function position(node, counter) {
  return counter.linePos(node?.range?.[0] || 0);
}
function diagnostic(message, code, node, counter, severity = "error") {
  return { message, code, ...position(node, counter), severity };
}
function scalarValue(value) {
  if (typeof value === "bigint") return ["integer", value.toString()];
  if (typeof value === "number") return ["number", Object.is(value, -0) ? "-0" : String(value)];
  return [typeof value, value];
}

// Compare ordered ASTs without toJS(): aliases must not expand pasted content.
// Style changes are permitted, but scalar values, comments and anchors are not.
function fingerprint(doc) {
  let count = 0;
  const anchors = new Map();
  const activeAnchors = new Set();
  function inspect(node, depth = 0) {
    if (++count > MAX_NODES || depth > MAX_DEPTH) throw new Error("Document is too complex (maximum depth 60 and 12000 AST nodes).");
    if (node === null) return null;
    if (node.tag) throw new Error("Explicit YAML tags are not supported. Remove the tag deliberately; the formatter will not reinterpret it.");
    if (YAML.isAlias(node)) {
      if (!anchors.has(node.source) || activeAnchors.has(node.source)) throw new Error("Unresolved, forward or cyclic aliases are not supported.");
      return ["alias", node.source, node.commentBefore || "", node.comment || ""];
    }
    if (node.anchor) {
      if (anchors.has(node.anchor)) throw new Error("Duplicate anchor names are not supported.");
      anchors.set(node.anchor, node);
      activeAnchors.add(node.anchor);
    }
    const meta = [node.anchor || "", node.commentBefore || "", node.comment || ""];
    let result;
    if (YAML.isMap(node)) {
      result = ["map", meta, node.items.map(pair => {
        if (!YAML.isScalar(pair.key) || typeof pair.key.value !== "string") throw new Error("Only string mapping keys are supported, as required for workflow fields.");
        if (pair.key.value === "<<") throw new Error("YAML merge keys (<<) are not supported by this workflow formatter. No merge expansion or repair was attempted.");
        return [inspect(pair.key, depth + 1), inspect(pair.value, depth + 1)];
      })];
    } else if (YAML.isSeq(node)) {
      result = ["list", meta, node.items.map(item => inspect(item, depth + 1))];
    } else if (YAML.isScalar(node)) {
      result = ["scalar", meta, scalarValue(node.value)];
    } else {
      throw new Error("Unsupported YAML node; no formatting proposal was created.");
    }
    if (node.anchor) activeAnchors.delete(node.anchor);
    return result;
  }
  return JSON.stringify([doc.commentBefore || "", inspect(doc.contents), doc.comment || ""]);
}

function workflowDiagnostics(doc, counter) {
  const issues = [];
  const add = (message, node, code = "WORKFLOW_STRUCTURE", severity = "error") =>
    issues.push(diagnostic(message, code, node, counter, severity));
  const value = (map, key) => YAML.isMap(map) ? map.get(key, true) : undefined;
  const has = (map, key) => YAML.isMap(map) && map.has(key);
  const text = node => YAML.isScalar(node) && typeof node.value === "string";
  const isAlias = node => {
    if (!YAML.isAlias(node)) return false;
    add("Aliased workflow content is preserved, but this small structural checker does not expand it. Check the complete schema with actionlint/GitHub.", node, "ALIASED_STRUCTURE", "warning");
    return true;
  };
  const root = doc.contents;
  if (!YAML.isMap(root)) { add("A workflow must be a top-level mapping with on and jobs.", root); return issues; }
  const on = value(root, "on");
  if (!on || (YAML.isScalar(on) && !on.value)) add("Missing on trigger. Formatting cannot choose an event for you.", root);
  else if (!isAlias(on) && !(text(on) || YAML.isMap(on) || YAML.isSeq(on))) add("on must be an event string, list or event mapping.", on);
  else if ((YAML.isMap(on) || YAML.isSeq(on)) && !on.items.length) add("on must select at least one event; an empty collection does not select one.", on);
  else if (YAML.isSeq(on) && on.items.some(item => !text(item))) add("An on event list must contain event-name strings.", on);
  for (const key of ["name", "run-name"]) {
    const node = value(root, key);
    if (has(root, key) && !text(node)) add(`${key} must be a string, not a mapping/list/boolean.`, node);
  }
  for (const key of ["steps", "runs-on", "run", "uses"]) {
    if (has(root, key)) add(`${key} is not a top-level workflow key. Edit its intended nesting; the formatter will not move it.`, value(root, key));
  }
  if (YAML.isMap(on) && on.has("pull_request_target")) {
    add("pull_request_target uses privileged base-repository context. Do not check out or execute untrusted PR code. Formatting does not make this safe.", value(on, "pull_request_target"), "PRIVILEGED_TRIGGER", "warning");
  }
  const jobs = value(root, "jobs");
  if (isAlias(jobs)) return issues;
  if (!YAML.isMap(jobs) || jobs.items.length === 0) { add("jobs must be a nonempty mapping of job IDs to configurations.", jobs || root); return issues; }
  for (const pair of jobs.items) {
    const job = pair.value;
    if (isAlias(job)) continue;
    if (!YAML.isMap(job)) { add("Each job must be a mapping, not a list or scalar.", job || pair.key); continue; }
    for (const key of ["run", "shell", "working-directory"]) {
      if (has(job, key)) add(`${key} belongs in a command step (or an appropriate defaults.run mapping), not directly on a job.`, value(job, key));
    }
    if (has(job, "uses")) {
      if (!text(value(job, "uses"))) add("A reusable workflow job's uses must be a reference string.", value(job, "uses"));
      for (const key of ["steps", "runs-on"]) if (has(job, key)) add(`A reusable-workflow caller job cannot also have ${key}.`, value(job, key));
      continue;
    }
    const runner = value(job, "runs-on");
    if (!has(job, "runs-on")) add("A normal job needs runs-on. Choose a compatible runner; none was guessed.", pair.key);
    else if (!isAlias(runner) && !(text(runner) || YAML.isMap(runner) || (YAML.isSeq(runner) && runner.items.length && runner.items.every(text)))) {
      add("runs-on must be a runner string, nonempty list of label strings, or supported runner-group mapping.", runner);
    }
    const steps = value(job, "steps");
    if (isAlias(steps)) continue;
    if (!YAML.isSeq(steps) || steps.items.length === 0) { add("A normal job's steps must be a nonempty list, with - for each step.", steps || pair.key); continue; }
    for (const step of steps.items) {
      if (isAlias(step)) continue;
      if (!YAML.isMap(step)) { add("Each step must be a mapping containing run or uses.", step); continue; }
      const run = has(step, "run");
      const uses = has(step, "uses");
      if (run === uses) add("A step needs exactly one of run or uses. Correct the intended nesting manually.", step);
      for (const key of ["run", "uses"]) {
        if (has(step, key) && !text(value(step, key))) add(`${key} must be a string. YAML may have parsed unquoted text as another type.`, value(step, key));
      }
      for (const key of ["env", "with"]) {
        const node = value(step, key);
        if (has(step, key) && !isAlias(node) && !YAML.isMap(node)) add(`Step ${key} must be a mapping.`, node);
      }
      if (uses) for (const key of ["shell", "working-directory"]) {
        if (has(step, key)) add(`${key} applies to run steps, not uses steps.`, value(step, key));
      }
      if (run && has(step, "with")) add("with configures an action's inputs; it does not belong on a run step.", value(step, "with"));
    }
  }
  return issues;
}

function analyze(input, options = {}) {
  const diagnostics = [];
  const fail = (message, code = "FORMAT_BLOCKED") => ({
    ok: false, output: null, diagnostics: [...diagnostics, { severity: "error", code, message, line: 1, col: 1 }]
  });
  if (typeof input !== "string") return fail("Paste or upload text to analyze.", "INPUT");
  if (byteLength(input) > LIMIT_BYTES) return fail("Maximum file size is 100 KiB (102400 UTF-8 bytes). Nothing was parsed.", "SIZE");
  if (!input.trim()) return fail("The editor is empty. Paste a YAML document first.", "EMPTY");
  const indent = options.indent ?? 2;
  const endings = options.endings ?? "lf";
  const profile = options.profile ?? "workflow";
  if (![2, 4, 8].includes(indent) || !["lf", "crlf", "preserve"].includes(endings) || !["workflow", "yaml"].includes(profile) ||
      (options.quoteOn !== undefined && typeof options.quoteOn !== "boolean")) return fail("Unsupported formatter option.", "OPTIONS");
  const counter = new YAML.LineCounter();
  const parseOptions = {
    version: "1.2", schema: "core", resolveKnownTags: false, merge: false,
    uniqueKeys: true, intAsBigInt: true, keepSourceTokens: true, lineCounter: counter,
    prettyErrors: false, logLevel: "silent"
  };
  try {
    const documents = YAML.parseAllDocuments(input, parseOptions);
    if (documents.length !== 1) return fail("Exactly one YAML document is supported. Split multi-document input yourself.", "DOCUMENTS");
    const doc = documents[0];
    for (const issue of [...doc.errors, ...doc.warnings]) {
      const offset = issue.pos?.[0] || 0;
      diagnostics.push({ severity: "error", code: issue.code, message: issue.message, ...counter.linePos(offset) });
    }
    if (diagnostics.length) return { ok: false, output: null, diagnostics };
    if (doc.directives?.yaml.explicit || Object.keys(doc.directives?.tags || {}).some(key => key !== "!!")) {
      return fail("YAML version/tag directives are not supported. Use a single YAML 1.2 core document without directives.", "DIRECTIVES");
    }
    const before = fingerprint(doc);
    if (profile === "workflow") diagnostics.push(...workflowDiagnostics(doc, counter));
    if (diagnostics.some(d => d.severity === "error")) return { ok: false, output: null, diagnostics };
    if (options.quoteOn !== false && YAML.isMap(doc.contents)) {
      for (const pair of doc.contents.items) if (pair.key.value === "on") pair.key.type = "QUOTE_DOUBLE";
    }
    if (indent !== 2) {
      YAML.visit(doc, {
        Scalar(_key, node) {
          // yaml 2.9.1 prints a |2 indicator even at wider indents for these
          // values. Escaped quotes avoid changing leading script whitespace.
          if (typeof node.value === "string" && /^\s/.test(node.value) && node.value.includes("\n")) node.type = "QUOTE_DOUBLE";
        }
      });
    }
    const lf = doc.toString({
      indent, indentSeq: true, lineWidth: 0, minContentWidth: 0,
      doubleQuotedMinMultiLineLength: Infinity
    });
    if (byteLength(lf) > LIMIT_BYTES) return fail("Formatted output exceeds the 100 KiB editor limit. Simplify the input or use a local editor.", "OUTPUT_SIZE");
    const check = YAML.parseDocument(lf, parseOptions);
    if (check.errors.length || check.warnings.length || fingerprint(check) !== before) {
      return fail("Formatting changed a scalar, ordered structure, anchor or comment attachment. No proposal was created; use a local editor to review this case.", "INVARIANT");
    }
    const crlf = endings === "crlf" || (endings === "preserve" && input.includes("\r\n"));
    const output = crlf ? lf.replace(/\n/g, "\r\n") : lf;
    if (byteLength(output) > LIMIT_BYTES) return fail("Formatted output exceeds the 100 KiB editor limit. Simplify the input or use a local editor.", "OUTPUT_SIZE");
    return {
      ok: true, output, diagnostics, changed: output !== input,
      summary: `${indent}-space collection indentation; ${crlf ? "CRLF" : "LF"} line endings. Ordered AST, scalar values, anchors/aliases and comment attachments rechecked.`,
      profile
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The YAML parser or formatter failed. No proposal was created.", "FORMAT_BLOCKED");
  }
}

module.exports = { analyze, byteLength, LIMIT_BYTES };
