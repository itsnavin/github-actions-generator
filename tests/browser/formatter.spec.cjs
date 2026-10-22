const { test, expect } = require("@playwright/test");
const YAML = require("yaml");
const { fixtures } = require("../formatter-fixtures.cjs");
const editor = page => page.getByLabel("Existing YAML editor", { exact: true });
const analyze = async page => {
  await page.getByRole("button", { name: "Analyze & propose formatting" }).click();
  await expect(page.locator("#format-status")).not.toContainText("Analyzing locally");
};
const example = async page => { await page.getByRole("button", { name: "Load safe example" }).click(); };
test.beforeEach(async ({ page }) => { await page.goto("./#formatter"); });

test("separate advanced workflow proposes, reviews and explicitly applies without changing generator", async ({ page }) => {
  const generated = await page.locator("#preview").textContent();
  await example(page);
  const before = await editor(page).inputValue();
  await analyze(page);
  await expect(page.locator("#format-review")).toBeVisible();
  await expect(page.locator("#format-status")).toContainText("Formatting proposal ready");
  expect(await editor(page).inputValue()).toBe(before);
  await expect(page.locator("#format-after")).toContainText('"on": workflow_dispatch');
  await page.getByRole("button", { name: "Apply proposal to editor" }).click();
  const applied = await editor(page).inputValue();
  expect(applied).not.toBe(before);
  expect(YAML.parse(applied).jobs.greet.steps[0].run).toContain('printf');
  await expect(page.locator("#format-feedback")).toContainText("applied to this editor only");
  expect(await page.locator("#preview").textContent()).toBe(generated);
  await analyze(page);
  await expect(page.locator("#format-status")).toContainText("Already formatted");
  await page.locator("#format-review").evaluate(el => el.scrollIntoView({ behavior: "instant", block: "start" }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("formatter-review.png") });
});
test("syntax errors show line/column, no proposal and no speculative indentation fix", async ({ page }) => {
  await example(page);
  await analyze(page);
  const invalid = "name: demo\njobs:\n\tbuild:\n    runs-on: ubuntu-latest\n";
  await editor(page).fill(invalid);
  await expect(page.locator("#format-review")).toBeHidden();
  await analyze(page);
  await expect(page.locator("#format-status")).toContainText("No formatting proposal");
  await expect(page.locator("#format-diagnostics")).toContainText("line 3, column 1");
  await expect(page.locator("#format-diagnostics")).toContainText("TAB_AS_INDENT");
  await expect(page.locator("#format-copy")).toBeDisabled();
  await expect(page.locator("#format-download")).toBeDisabled();
  expect(await editor(page).inputValue()).toBe(invalid);
  await page.locator("#format-diagnostics button").first().click();
  await expect(editor(page)).toBeFocused();
  expect(await editor(page).evaluate(el => el.selectionStart)).toBe(invalid.indexOf("\t"));
});
test("valid YAML wrong workflow nesting is not silently reparented; generic mode is explicit", async ({ page }) => {
  await editor(page).fill("on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      run: echo no\n");
  await analyze(page);
  await expect(page.locator("#format-diagnostics")).toContainText("steps must be a nonempty list");
  await expect(page.locator("#format-review")).toBeHidden();
  await page.getByLabel("Diagnostic mode").selectOption("yaml");
  await analyze(page);
  await expect(page.locator("#format-status")).toContainText("workflow structure was not checked");
  await expect(page.locator("#format-after")).toContainText("run: echo no");
});
test("local upload preserves heredoc payload and CRLF download bytes; no original modification", async ({ page }) => {
  const fixture = fixtures[0];
  await page.getByLabel("Output line endings").selectOption("preserve");
  await page.getByLabel("Upload a local").setInputFiles({
    name: "build.yaml", mimeType: "text/yaml", buffer: Buffer.from(fixture.text.replace(/\n/g, "\r\n"))
  });
  await expect(page.locator("#format-status")).toContainText("file loaded");
  await analyze(page);
  await expect(page.locator("#format-review")).toBeVisible();
  await expect(page.locator("#format-summary")).toContainText("CRLF");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download formatted YAML" }).click();
  const download = await event;
  expect(download.suggestedFilename()).toBe("build-formatted.yml");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const output = Buffer.concat(chunks);
  expect(output.includes(Buffer.from("\r\n"))).toBe(true);
  const parsed = YAML.parse(output.toString("utf8"));
  expect(Buffer.from(parsed.jobs.build.steps[0].run)).toEqual(Buffer.from(fixture.script));
  expect(parsed.on).toBe("workflow_dispatch");
  expect(parsed.jobs.build.steps[0].env.NOTE).toBe("${{ github.ref }}");
});
test("options invalidate proposal; wider indentation still preserves leading script whitespace", async ({ page }) => {
  await editor(page).fill(fixtures[1].text);
  await analyze(page);
  await page.getByLabel("Indentation width").selectOption("4");
  await expect(page.locator("#format-review")).toBeHidden();
  await analyze(page);
  await expect(page.locator("#format-summary")).toContainText("4-space");
  await page.getByRole("button", { name: "Apply proposal to editor" }).click();
  expect(YAML.parse(await editor(page).inputValue()).jobs.build.steps[0].run).toBe(fixtures[1].script);
  await page.getByLabel('Quote top-level "on"').uncheck();
  await expect(page.locator("#format-copy")).toBeDisabled();
});
test("upload size, extension and UTF-8 errors preserve editor and discard stale proposal", async ({ page }) => {
  await example(page);
  const text = await editor(page).inputValue();
  for (const [name, buffer, expected] of [
    ["too-big.yml", Buffer.alloc(102401, 32), "exceeds 100 KiB"],
    ["wrong.txt", Buffer.from("a: 1"), "Choose a .yml or .yaml"],
    ["invalid.yml", Buffer.from([0xc3, 0x28]), "Could not read"],
    ["binary.yml", Buffer.from([0, 1, 2]), "Could not read"]
  ]) {
    await page.getByLabel("Upload a local").setInputFiles({ name, mimeType: "text/plain", buffer });
    await expect(page.locator("#format-status")).toContainText(expected);
    expect(await editor(page).inputValue()).toBe(text);
    await expect(page.locator("#format-copy")).toBeDisabled();
  }
});
test("paste limit counts UTF-8 bytes, empty input and clear reset app buffers", async ({ page }) => {
  await analyze(page);
  await expect(page.locator("#format-status")).toContainText("editor is empty");
  await editor(page).fill("text: " + "\u{1f44b}".repeat(26000));
  await expect(page.locator("#format-analyze")).toBeDisabled();
  await expect(page.locator("#format-status")).toContainText("exceeds 100 KiB");
  await page.getByRole("button", { name: "Clear editor & results" }).click();
  await expect(editor(page)).toHaveValue("");
  await expect(page.locator("#format-analyze")).toBeEnabled();
  await expect(page.locator("#format-size")).toHaveText("0 / 102400 UTF-8 bytes");
  await expect(page.locator("#format-review")).toBeHidden();
  await expect(page.locator("#format-diagnostics")).toBeEmpty();
});
test("copy is exact with native newlines; clipboard denial is explicit", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await example(page);
  await analyze(page);
  await page.getByRole("button", { name: "Apply proposal to editor" }).click();
  await page.getByRole("button", { name: "Copy proposal" }).click();
  await expect(page.locator("#format-feedback")).toContainText("Proposal copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, "\n")).toBe(await editor(page).inputValue());
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) }
  }));
  await page.getByRole("button", { name: "Copy proposal" }).click();
  await expect(page.locator("#format-feedback")).toContainText("Clipboard access failed");
});
test("filename validation prevents path downloads", async ({ page }) => {
  await example(page);
  await analyze(page);
  await page.getByLabel("Formatted download filename").fill("../unsafe.yml");
  await expect(page.locator("#format-download")).toBeDisabled();
  await expect(page.locator("#format-feedback")).toContainText("without folders");
  await page.getByLabel("Formatted download filename").fill("reviewed.yaml");
  await expect(page.locator("#format-download")).toBeEnabled();
});
test("safe rendering, no execution, no persisted content or external data requests", async ({ page }) => {
  const outside = [];
  const failures = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("request", req => {
    const origin = new URL(req.url()).origin;
    if (origin !== new URL(page.url()).origin && origin !== process.env.INJECTED_BROWSER_ORIGIN) outside.push(req.url());
  });
  const baseline = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  await page.getByLabel("Diagnostic mode").selectOption("yaml");
  await editor(page).fill('text: "<img src=x onerror=alert(1)>"\nexpression: "${{ secrets.NOT_A_REAL_SECRET }}"\n');
  await analyze(page);
  await expect(page.locator("#format-after")).toContainText("<img");
  await expect(page.locator("#format-after img")).toHaveCount(0);
  await expect(page.locator("#format-after")).toContainText("${{ secrets.NOT_A_REAL_SECRET }}");
  expect(outside).toEqual([]);
  expect(failures).toEqual([]);
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))).toEqual(baseline);
  await page.reload();
  await expect(editor(page)).toHaveValue("");
  await expect(page.locator("#format-review")).toBeHidden();
});
test("worker unavailable and timeout failures do not return success-shaped YAML", async ({ page }) => {
  await page.evaluate(() => { window.Worker = class { constructor() { throw new Error("Worker unavailable"); } }; });
  await example(page);
  await analyze(page);
  await expect(page.locator("#format-status")).toContainText("Could not start the local formatter");
  await expect(page.locator("#format-review")).toBeHidden();
  await page.evaluate(() => { window.Worker = class { postMessage() {} terminate() {} }; });
  await page.clock.install();
  await page.getByRole("button", { name: "Analyze & propose formatting" }).click();
  await page.clock.fastForward(5100);
  await expect(page.locator("#format-status")).toContainText("exceeded five seconds");
  await expect(page.locator("#format-copy")).toBeDisabled();
});
test("editing or clearing cancels a pending worker and navigation is keyboard/mobile accessible", async ({ page }) => {
  await page.evaluate(() => {
    window.Worker = class {
      postMessage() {}
      terminate() { window.formatWorkerStopped = true; }
    };
  });
  await example(page);
  await page.getByRole("button", { name: "Analyze & propose formatting" }).click();
  await editor(page).fill("a: 1\n");
  expect(await page.evaluate(() => window.formatWorkerStopped)).toBe(true);
  await expect(page.locator("#format-review")).toBeHidden();
  await editor(page).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#format-analyze")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
