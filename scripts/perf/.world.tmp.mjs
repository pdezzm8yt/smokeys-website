import { chromium } from "playwright-core";
const OUT = "/private/tmp/claude-501/-Users-pdezzm8-Claude-Smokeys-Website/fab8cb6e-c6bb-40c2-afd7-670eee4793ae/scratchpad/world";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
await page.goto("http://localhost:3100/", { waitUntil: "load" });
await page.waitForFunction(() => !document.documentElement.hasAttribute("data-intro-loading") && !document.documentElement.hasAttribute("data-intro-pending"), null, { timeout: 60000 });
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const w = document.querySelector("[data-world]");
  const scenes = [...document.querySelectorAll("[data-scene]")].map((s) => ({ id: s.id, left: Math.round(s.getBoundingClientRect().left + w.scrollLeft), w: Math.round(s.offsetWidth), h: Math.round(s.offsetHeight), panelOverflow: (() => { const p = s.matches("[data-panel]") ? s : s.querySelector("[data-panel]"); return p ? p.scrollHeight - p.clientHeight : null; })() }));
  return { axis: document.documentElement.dataset.axis, scrollW: w.scrollWidth, clientW: w.clientWidth, docOverflowX: document.documentElement.scrollWidth - innerWidth, attrs: [...document.documentElement.attributes].map((a) => a.name + "=" + a.value).filter((a) => a.startsWith("data-")), scenes };
});
console.log(JSON.stringify(info, null, 1));
const intro = info.scenes.find((s) => s.id === "top");
const range = intro.w - 1280;
for (const [name, f] of [["0-start", 0], ["1-run", 0.15], ["2-tunnel", 0.27], ["3-entering", 0.33], ["4-black", 0.38], ["5-lights", 0.46], ["6-shape", 0.52], ["7-out", 0.64], ["8-brand", 0.78], ["9-ctas", 0.9], ["10-end", 1.0]]) {
  await page.evaluate((x) => document.querySelector("[data-world]").scrollTo({ left: x, behavior: "instant" }), Math.round(range * f));
  await page.waitForTimeout(1600);
  const st = await page.evaluate(() => ({ t: +document.querySelector("[data-film]")?.currentTime.toFixed(2), dark: +getComputedStyle(document.querySelector('[data-fx="dark"]')).opacity }));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, JSON.stringify(st));
}
for (const id of ["bus", "features", "gallery", "packages", "contact", "footer"]) {
  await page.evaluate((id) => { const w = document.querySelector("[data-world]"); const s = document.getElementById(id); w.scrollTo({ left: s.getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft, behavior: "instant" }); }, id);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/s-${id}.png` });
}
console.log("errors:", JSON.stringify(errors));
await browser.close();
