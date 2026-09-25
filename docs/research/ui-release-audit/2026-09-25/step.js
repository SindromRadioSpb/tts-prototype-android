"use strict";
// Usage: node step.js <profile> <width> <locale> <shotName> '<js actions>'
// Persistent fresh profile per walk (scratchpad), so a walk proceeds step by step.
const { chromium } = require("playwright");
const path = require("node:path");
const L = require("./lib");
const PROF = process.env.AUDIT_PROFILES || path.join(require("os").tmpdir(), "lp-audit-profiles");
(async () => {
  const [,, prof, w, loc, name, actions, dark] = process.argv;
  const width = +w;
  const ctx = await chromium.launchPersistentContext(path.join(PROF, prof), {
    viewport: { width, height: width < 600 ? 800 : 800 }, deviceScaleFactor: width < 600 ? 2 : 1,
    isMobile: width < 600, hasTouch: width < 600, locale: loc === "he" ? "he-IL" : "ru-RU",
    colorScheme: dark === "dark" ? "dark" : "light", forcedColors: process.env.FORCED ? "active" : "none",
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const logs = [];
  page.on("pageerror", (e) => logs.push("PAGEERROR " + String(e).slice(0, 200)));
  page.on("dialog", (d) => { logs.push("DIALOG " + d.message().slice(0, 120)); d.dismiss(); });
  const fn = new Function("page", "L", "return (async () => {" + (actions || "") + "})()");
  let ret;
  try { ret = await fn(page, L); } catch (e) { console.log("ACTION ERROR", String(e).slice(0, 400)); }
  if (ret !== undefined) console.log("RET", JSON.stringify(ret, null, 0).slice(0, 6000));
  await page.waitForTimeout(800);
  if (name && name !== "-") { await L.shot(page, name); console.log("shot", name); }
  if (process.env.TARGETS) {
    const t = await L.targets(page, process.env.TARGETS === "1" ? null : process.env.TARGETS);
    console.log("targets", t.length, "small<44:", t.filter((x) => x.small).length);
    for (const x of t) console.log((x.small ? "! " : "  ") + `${x.w}x${x.h} @${x.x},${x.y} fs${x.fs} [${x.id}] ${x.label}`);
  }
  if (process.env.CONTRAST) { const c = await L.contrast(page); console.log("contrast fails", c.length); for (const x of c.slice(0, 25)) console.log("  ", JSON.stringify(x)); }
  if (process.env.FONTS) console.log("fonts", JSON.stringify(await L.fonts(page)));
  if (logs.length) console.log("logs", logs);
  await ctx.close();
})();
