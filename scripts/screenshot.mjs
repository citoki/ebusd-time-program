// Screenshot the dev page (needs `npm run dev` on port 5199).
// Usage: node scripts/screenshot.mjs <out.png> [query]   e.g. "tab=2&days=saturday,sunday"
import { chromium } from "playwright";

const [out = "shot.png", query = ""] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:5199/?${query}`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`saved ${out}`);
