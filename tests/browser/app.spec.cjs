const { test, expect } = require("@playwright/test");
const YAML = require("yaml");
test.beforeEach(async ({ page }) => {
  await page.goto("./");
});
test("loads locally without external requests or JS errors and fits viewport", async ({ page }) => {
  const errors = [];
  const external = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", req => {
    const origin = new URL(req.url()).origin;
    // Optional local-only exception for an explicitly identified OS-injected script.
    // CI leaves this unset and checks every external request.
    if (origin === process.env.INJECTED_BROWSER_ORIGIN) {
      test.info().annotations.push({ type: "environment", description: `OS-injected request excluded: ${origin}` });
    } else if (origin !== new URL(page.url()).origin) external.push(req.url());
  });
  await page.reload();
  await expect(page.locator("#preview")).toContainText('"on":');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("landing.png") });
  await page.locator("#builder").scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("workbench.png") });
});
test("all templates update preview and produce parseable YAML", async ({ page }) => {
  for (const template of ["hello", "make", "cmake", "node", "python"]) {
    await page.getByLabel("Template", { exact: true }).selectOption(template);
    const value = YAML.parse(await page.locator("#preview").innerText());
    expect(value.jobs.build.steps.at(-1).run.trim()).not.toBe("");
    expect(value.permissions).toEqual({ contents: "read" });
    await expect(page.locator("#errors")).toBeHidden();
  }
});
test("validation removes stale output and disables exports; fixes restore output", async ({ page }) => {
  await page.getByLabel("Workflow name", { exact: true }).fill("");
  await expect(page.locator("#errors")).toContainText("Workflow name");
  await expect(page.locator("#copy")).toBeDisabled();
  await expect(page.locator("#download")).toBeDisabled();
  await expect(page.locator("#preview")).toBeEmpty();
  await page.getByLabel("Workflow name", { exact: true }).fill('A: "quoted" name');
  await expect(page.locator("#copy")).toBeEnabled();
  expect(YAML.parse(await page.locator("#preview").innerText()).name).toBe('A: "quoted" name');
});
test("trigger and runner compatibility, cron and unsafe expressions", async ({ page }) => {
  await page.getByLabel("Template", { exact: true }).selectOption("make");
  await page.getByLabel("GitHub-hosted runner").selectOption("windows-latest");
  await expect(page.locator("#errors")).toContainText("require Ubuntu");
  await page.getByLabel("GitHub-hosted runner").selectOption("ubuntu-latest");
  await page.getByLabel("Schedule:").check();
  await page.getByLabel("Cron (").fill("* * * * *");
  await expect(page.locator("#errors")).toContainText("Cron needs");
  await page.getByLabel("Cron (").fill("17 9 * * 1-5");
  await page.getByLabel("Commands to run").fill("echo ${{ github.event.pull_request.title }}");
  await expect(page.locator("#errors")).toContainText("raw ${{");
});
test("download is actual YAML with chosen filename", async ({ page }) => {
  await page.getByLabel("File name", { exact: true }).fill("learning.yaml");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .yml" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("learning.yaml");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const yaml = Buffer.concat(chunks).toString("utf8");
  expect(YAML.parse(yaml).name).toBe("My first workflow");
});
test("copy writes the YAML to the clipboard with native line endings", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy YAML" }).click();
  await expect(page.locator("#feedback")).toContainText("YAML copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, "\n")).toBe(await page.locator("#preview").innerText());
});
test("clipboard failure is reported explicitly", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"))
    } });
  });
  await page.getByRole("button", { name: "Copy YAML" }).click();
  await expect(page.locator("#feedback")).toContainText("Clipboard access failed");
});
test("lessons, quiz, labels, keyboard access and no HTML injection", async ({ page }) => {
  await page.getByLabel("Example environment value").fill('<img src=x onerror="alert(1)">');
  await expect(page.locator("#preview")).toContainText("<img");
  await expect(page.locator("#preview img")).toHaveCount(0);
  await page.getByText("5. Expressions, contexts, env & secrets", { exact: true }).click();
  await expect(page.getByText("Never insert event text directly", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "runs-on", exact: true }).click();
  await expect(page.locator("#quiz-feedback")).toContainText("Correct!");
  expect(await page.locator("input, select, textarea").evaluateAll(elements =>
    elements.every(el => el.labels.length > 0))).toBe(true);
  await page.goto("./");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to generator" })).toBeFocused();
});
