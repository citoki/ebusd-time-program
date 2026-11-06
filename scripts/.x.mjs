import { chromium } from "playwright";
const [dir] = process.argv.slice(2);
const shots = [
  ["edit-wide", "layout=wide", "#wide"],
  ["edit-narrow", "", "#narrow"],
  ["preview-stacked", "mode=preview&stacked=1&labels=always", "#wide"],
  ["theme-default", "theme=default&ha=light&layout=wide", "#wide"],
];
const b = await chromium.launch();
const errs = [];
for (const [name, q, frame] of shots) {
  const p = await b.newPage({ viewport: { width: 1300, height: 1100 }, deviceScaleFactor: 2 });
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`http://localhost:5199/?${q}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  await p.locator(`${frame} ebusd-time-program-card`).screenshot({ path: `${dir}/${name}.png` });
}
console.log(errs);
await b.close();
