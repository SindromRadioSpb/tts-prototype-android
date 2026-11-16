#!/usr/bin/env node
/* Paints the gouache scenes in headless Chromium and writes optimised WebP files.
   Usage: node scripts/art/gouache/run.js [scene ...] [--preview]
   Output: public/art/gouache/<scene>-<day|night>.webp (1920w) and -m.webp (960w, phone crop).
   --preview also writes small JPEGs to .tmp/gouache/ for review. */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT = path.join(ROOT, "public", "art", "gouache");
const TMP = path.join(ROOT, ".tmp", "gouache");
const W = 2880, H = 1080;

(async () => {
  const args = process.argv.slice(2);
  const preview = args.includes("--preview");
  const only = args.filter((a) => !a.startsWith("--"));
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.setContent("<!doctype html><canvas id=c></canvas>");
  await page.addScriptTag({ path: path.join(__dirname, "painter.js") });
  await page.addScriptTag({ path: path.join(__dirname, "scenes.js") });
  if (fs.existsSync(path.join(__dirname, "spots.js"))) await page.addScriptTag({ path: path.join(__dirname, "spots.js") });
  const names = await page.evaluate(() => Object.keys(window.SCENES));
  for (const name of names) {
    const base = name.split(":")[0];
    if (only.length && !only.includes(base) && !only.includes(name)) continue;
    const meta = await page.evaluate((n) => window.SCENES[n].meta || null, name);
    const variants = meta && meta.single ? [false] : [false, true];
    for (const night of variants) {
      const t0 = Date.now();
      const size = (meta && meta.size) || [W, H];
      const dataUrl = await page.evaluate(([n, w, h, ni]) => {
        const c = document.getElementById("c"); c.width = w; c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.clearRect(0, 0, w, h);
        window.SCENES[n](ctx, w, h, ni);
        return c.toDataURL("image/png");
      }, [name, size[0], size[1], night]);
      const png = Buffer.from(dataUrl.split(",")[1], "base64");
      const tag = meta && meta.single ? name : `${name}-${night ? "night" : "day"}`;
      if (meta && meta.out) {
        for (const o of meta.out) {
          let im = sharp(png).resize({ width: o.width });
          im = o.lossless ? im.webp({ lossless: true }) : im.webp({ quality: o.quality || 82, alphaQuality: 90, effort: 6 });
          await im.toFile(path.join(OUT, `${tag}${o.suffix || ""}.webp`));
        }
      } else {
        await sharp(png).resize({ width: 1920 }).webp({ quality: 80, effort: 6 }).toFile(path.join(OUT, `${tag}.webp`));
        /* phone: the focal two thirds, so the light is not lost on a narrow screen */
        await sharp(png).extract({ left: Math.round(W * 0.3), top: 0, width: Math.round(W * 0.7), height: H }).resize({ width: 1080 }).webp({ quality: 78, effort: 6 }).toFile(path.join(OUT, `${tag}-m.webp`));
      }
      if (preview) await sharp(png).resize({ width: 1440 }).flatten({ background: "#888888" }).jpeg({ quality: 86 }).toFile(path.join(TMP, `${tag.replace(":", "_")}.jpg`));
      console.log(`${tag}: ${Date.now() - t0} ms`);
    }
  }
  await browser.close();
  for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + " KB");
})().catch((e) => { console.error(e); process.exit(1); });
