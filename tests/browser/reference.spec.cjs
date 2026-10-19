const { test, expect } = require("@playwright/test");
const ref = require("../../reference.js");
test.beforeEach(async ({ page }) => { await page.goto("./"); });

test("all generator controls get accessible help before their label", async ({ page }) => {
  for (const [name, field] of Object.entries(ref.fields)) {
    const input = page.locator(`#config [name="${name}"]`);
    const help = page.locator(`.field-guide[data-control="${name}"]`);
    await expect(help).toContainText(field.purpose);
    expect(await input.evaluate(el => {
      const purpose = document.getElementById(`purpose-${el.name}`);
      return !!(purpose.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        el.getAttribute("aria-describedby").split(" ").includes(purpose.id);
    })).toBe(true);
    await help.locator("summary").click();
    await expect(help).toContainText(field.value);
    await expect(help.locator("pre")).toBeVisible();
    await expect(help.locator("a")).toHaveAttribute("href", `#ref-${field.topic}`);
    await help.locator("summary").click();
  }
});
test("search and group navigation narrow results and explain no matches", async ({ page }) => {
  const search = page.getByLabel("Search syntax, purpose or examples");
  await search.fill("fail-fast");
  await expect(page.locator("#ref-matrix")).toBeVisible();
  await expect(page.locator("#ref-yaml")).toBeHidden();
  await page.getByLabel("Topic group").selectOption("Security");
  await expect(page.locator("#reference-count")).toContainText("No matches");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toBeFocused();
  await expect(page.locator(".reference-card:visible")).toHaveCount(ref.topics.length);
  await search.fill("<script>not a topic</script>");
  await expect(page.locator("#reference-count")).toContainText("No matches");
  await expect(page.locator("#reference-list script")).toHaveCount(0);
});
test("preview key opens matching help even when hidden by search, without changing YAML", async ({ page }) => {
  const original = await page.locator("#preview").textContent();
  await page.getByLabel("Search syntax, purpose or examples").fill("matrix");
  await page.locator('#preview a[href="#ref-runner"]').click();
  await expect(page).toHaveURL(/#ref-runner$/);
  await expect(page.locator("#ref-runner")).toHaveAttribute("open", "");
  await expect(page.locator("#ref-runner summary")).toBeFocused();
  await expect(page.locator("#ref-runner")).toContainText("where your job executes");
  expect(await page.locator("#preview").textContent()).toBe(original);
  await page.reload();
  await expect(page.locator("#ref-runner")).toHaveAttribute("open", "");
});
test("reference-only topics, scoped examples and source date are discoverable", async ({ page }) => {
  await page.goto("./#ref-reuse");
  await expect(page.locator("#ref-reuse")).toHaveAttribute("open", "");
  await expect(page.locator("#ref-reuse")).toContainText("Reference-only");
  await expect(page.locator("#ref-reuse")).toContainText("not a standalone workflow");
  await expect(page.locator("#reference-checked")).toContainText(ref.checked);
  await expect(page.locator("#ref-reuse .reference-links a").first()).toHaveAttribute("href", ref.sources.reuse);
  await expect(page.locator('#config [name="matrix"]')).toHaveCount(0);
});
test("walkthrough explains a complete example and reference stays keyboard/mobile accessible", async ({ page }) => {
  await page.locator(".walkthrough summary").click();
  await expect(page.locator("#walkthrough-code")).toContainText("First safe greeting");
  await expect(page.locator("#walkthrough-notes li")).toHaveCount(ref.annotations.length);
  await page.goto("./#ref-outputs");
  const summary = page.locator("#ref-outputs summary");
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#ref-outputs")).not.toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(page.locator("#ref-outputs")).toHaveAttribute("open", "");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("reference.png") });
});
