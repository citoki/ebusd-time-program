// Browser smoke test: starts its own Vite dev server, drives the dev page (simulated controller,
// test/fake-ebusd.ts) in headless Chromium and checks the main flows end to end.
// Usage: npm run test:e2e   (once: npx playwright install chromium)
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ configFile: "vite.config.ts", root: "dev", logLevel: "error", server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();

let failed = 0;
async function check(name, query, fn) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  try {
    await page.goto(`${base}?${query}`, { waitUntil: "networkidle" });
    const card = page.locator("#wide ebusd-time-program-card");
    await card.locator("ha-card").waitFor();
    await fn(card, page);
    if (errors.length) throw new Error(`console errors:\n  ${errors.join("\n  ")}`);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${String(e.message ?? e).split("\n").join("\n    ")}`);
  } finally {
    await page.close();
  }
}

function expectEqual(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const text = (locator) => locator.innerText();

console.log("smoke test (dev page, simulated controller)");

await check("edit mode: tabs and slots of Z1", "", async (card) => {
  expectEqual(await card.locator(".tab").allInnerTexts(), ["Z1", "HWC", "CC"], "tabs");
  expectEqual(await card.locator(".slot-row").count(), 2, "Z1 slots Mo–Fr");
});

await check("slot sheet: change a temperature and write it to the controller", "delay=0", async (card) => {
  await card.locator(".field.pill").first().click();
  const sheet = card.locator("dialog[open]");
  await sheet.locator(".round-btn").nth(1).click(); // +0.5 °C
  await sheet.locator(".btn.primary").click(); // Done
  expectEqual(await text(card.locator(".field.pill").first()), "21.5 °C", "draft temperature");
  await card.locator(".apply-bar .btn.primary").click(); // Apply to 5 days
  await card.locator(".busy-panel.done").waitFor({ timeout: 15_000 });
});

await check("set-back dialog: save a new value", "delay=0", async (card) => {
  await card.locator(".info-btn").click();
  const dialog = card.locator("dialog[open]");
  expectEqual(await text(dialog.locator(".temp-value")), "17.0 °C", "set-back before");
  await dialog.locator(".round-btn").nth(1).click();
  await dialog.locator(".btn.primary").click(); // Save
  await dialog.waitFor({ state: "detached" });
  const title = await card.locator(".info-btn").getAttribute("title");
  if (!title?.includes("17.5 °C")) throw new Error(`info tooltip should show 17.5 °C: ${title}`);
});

await check("info dialog of hot water: text only, Escape closes", "tab=1", async (card, page) => {
  await card.locator(".info-btn").click();
  const dialog = card.locator("dialog[open]");
  expectEqual(await dialog.locator(".temp-value").count(), 0, "temperature control");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
});

await check("preview: today and tomorrow, stacked, without label line", "mode=preview&stacked=1&range=today_tomorrow&nolabel=1", async (card) => {
  expectEqual(await card.locator(".week-day").count(), 6, "rows (3 programs × 2 days)");
  expectEqual(await card.locator(".detail").count(), 0, "label lines");
});

await check("German: card title", "lang=de", async (card) => {
  expectEqual(await text(card.locator(".title")), "Wochenprogramm", "title");
});

await check("ebusd offline: program shows the error", "state=offline", async (card) => {
  const status = await card.locator(".status").getAttribute("aria-label");
  if (!status?.includes("not available")) throw new Error(`status should say offline: ${status}`);
});

await check("source vaillant_ebus: read through the action and write a temperature", "source=vaillant_ebus&delay=0", async (card) => {
  await card.locator(".slot-row").first().waitFor();
  expectEqual(await card.locator(".slot-row").count(), 2, "Z1 slots Mo–Fr");
  await card.locator(".field.pill").first().click();
  const sheet = card.locator("dialog[open]");
  await sheet.locator(".round-btn").nth(1).click(); // +0.5 °C
  await sheet.locator(".btn.primary").click(); // Done
  await card.locator(".apply-bar .btn.primary").click(); // Apply to 5 days
  await card.locator(".busy-panel.done").waitFor({ timeout: 15_000 });
  expectEqual(await text(card.locator(".field.pill").first()), "21.5 °C", "temperature after write");
});

await check("source vaillant_ebus: a day the controller ignores stops the write", "source=vaillant_ebus&delay=0&ignore=Z1Timer_Tuesday", async (card) => {
  await card.locator(".slot-row").first().waitFor();
  await card.locator(".field.pill").first().click();
  const sheet = card.locator("dialog[open]");
  await sheet.locator(".round-btn").nth(1).click();
  await sheet.locator(".btn.primary").click();
  await card.locator(".apply-bar .btn.primary").click();
  await card.locator(".busy-panel.failed").waitFor({ timeout: 15_000 });
  const panel = await text(card.locator(".busy-panel"));
  if (!panel.includes("did not store")) throw new Error(`failure should name the reason: ${panel}`);
});

await browser.close();
await server.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
