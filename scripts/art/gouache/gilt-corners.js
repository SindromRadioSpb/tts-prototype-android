// Derives the four gilt corners from the painted 9-slice frame (book.js → gilt-frame.webp).
// The book's rules are drawn by CSS (a double outline round the table), so only the tooled
// corners remain images: four 120px tiles instead of one frame layer as tall as the text.
const path = require("path");
const sharp = require("sharp");
const dir = path.join(__dirname, "..", "..", "..", "public", "art", "gouache");
const src = path.join(dir, "gilt-frame.webp");
const S = 120, W = 360;
const tiles = { tl: [0, 0], tr: [W - S, 0], bl: [0, W - S], br: [W - S, W - S] };
(async () => {
  for (const [name, [left, top]] of Object.entries(tiles)) {
    const out = path.join(dir, `gilt-${name}.webp`);
    await sharp(src).extract({ left, top, width: S, height: S }).webp({ quality: 80, alphaQuality: 90 }).toFile(out);
    console.log(out);
  }
})();
