// Masthead baseline shots (3.11.907). Run through the review harness:
//   node scripts/art/gouache/shots.js scripts/art/gouache/mast-baseline.js            — compare with the stored shots
//   WRITE=1 node scripts/art/gouache/shots.js scripts/art/gouache/mast-baseline.js    — store the current mastheads
// CSSFILE=path swaps lp-gouache.css (compare an older look). Phone width, light and dark; the light «breath» canvas is removed before the shot.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const DIR = path.join(__dirname, "..", "..", "..", "docs", "planning", "gouache-baseline");
const PAGES = [["studio", "/"], ["room", "/library.html"], ["media", "/mediatheque.html"], ["news", "/news.html"], ["dict", "/dictionary.html"]];
module.exports = async ({ open, ORIGIN, OUT }) => {
  for (const scheme of ["light", "dark"]) for (const [n, u] of PAGES) {
    const { context, page } = await open({ viewport: { width: 390, height: 844 }, dpr: 1, mobile: true, scheme, storage: { onboardingSeen_v1: '{"ts":1}' } });
    if (process.env.CSSFILE) await context.route("**/css/lp-gouache.css*", r => r.fulfill({ contentType: "text/css", body: fs.readFileSync(process.env.CSSFILE, "utf8") }));
    await page.goto(ORIGIN + u, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(6500);
    await page.evaluate(() => { document.querySelectorAll(".lp-gouache-air").forEach(c => c.remove()); window.scrollTo(0, 0); });
    await page.waitForTimeout(300);
    const name = "mast-" + n + "-" + scheme + ".jpg";
    const buf = await page.screenshot({ type: "jpeg", quality: 72, clip: { x: 0, y: 0, width: 390, height: 330 } });
    if (process.env.WRITE) { fs.writeFileSync(path.join(DIR, name), buf); console.log("stored", name); }
    else {
      const ref = path.join(DIR, name);
      if (!fs.existsSync(ref)) { console.log("no baseline", name); }
      else {
        const [a, b] = await Promise.all([sharp(ref).resize(195, 165).raw().toBuffer(), sharp(buf).resize(195, 165).raw().toBuffer()]);
        let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
        const mean = d / a.length;
        console.log((mean > 6 ? "DIFFERS " : "same    ") + name + "  mean abs diff " + mean.toFixed(2));
        if (mean > 6) fs.writeFileSync(path.join(OUT, "now-" + name), buf);
      }
    }
    await context.close();
  }
};
