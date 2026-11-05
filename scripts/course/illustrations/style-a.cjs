'use strict';
// Style A primitives: flat editorial shapes, soft top-left light via in-shape gradients, no outlines, no text.
const C = {
  plate: '#f6f2ea', plateDeep: '#ece5d8', ink: '#22304d', navy: '#2c3d63', navyLight: '#3d5285', blue: '#1B4FB8', blueSoft: '#dbe5f8',
  kraft: '#c98b5a', kraftDark: '#a96f43', amber: '#c77d2e', yellow: '#e2b04a', porcelain: '#fbfaf7', porcelainShade: '#e7e3da',
  coffee: '#5a3a24', tea: '#c98a3a', milk: '#fdfbf6', water: '#cfe3f3', orange: '#ef8f2f', green: '#5d8a3a', no: '#c2413a',
  skin1: '#e9b48f', skin2: '#c98d67', skin3: '#8d5b3d', hairDark: '#2a2220', hairBrown: '#5b3a26', hairCurly: '#3a2a22',
  croc: '#6aa84f', crocDark: '#4f8a3a', crocBelly: '#d8e8b0', wood: '#d9b48a', woodDark: '#b88e62', wall: '#efe8dc'
};
let n = 0;
const uid = p => p + (++n);

function grad(id, from, to, dir = 'lr') {
  const [x1, y1, x2, y2] = dir === 'lr' ? [0, 0, 1, 0] : dir === 'tb' ? [0, 0, 0, 1] : [0, 0, 1, 1];
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
}
function shade(hex, k) {
  const v = parseInt(hex.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255;
  const f = x => Math.max(0, Math.min(255, Math.round(k < 0 ? x * (1 + k) : x + (255 - x) * k)));
  return '#' + [f(r), f(g), f(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// Gradient fill helper: returns [defs, fillRef] for a soft top-left lit color.
function lit(color, dir = 'diag', amount = 0.12) {
  const id = uid('g');
  return [grad(id, shade(color, amount), shade(color, -amount), dir), `url(#${id})`];
}
function grain(id) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .035 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>`;
}
// Whole picture on a rounded light plate, with a subtle grain over everything.
function frame(w, h, body, { bg = C.plate } = {}) {
  const g = uid('grain'), clip = uid('clip');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${grain(g)}<clipPath id="${clip}"><rect width="${w}" height="${h}" rx="${Math.round(Math.min(w, h) * 0.04)}"/></clipPath></defs>` +
    `<g clip-path="url(#${clip})"><rect width="${w}" height="${h}" fill="${bg}"/>${body}<rect width="${w}" height="${h}" fill="#000" filter="url(#${g})"/></g></svg>`;
}
const shadow = (cx, cy, rx, ry, o = 0.1) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity="${o}"/>`;

// Takeaway paper cup with sleeve and lid. s = scale (1 → 100 px tall).
function paperCup(cx, base, s, { sleeve = C.kraft, lid = C.navy, tag = false, steam = false } = {}) {
  const H = 100 * s, TW = 64 * s, BW = 46 * s, y0 = base - H;
  const lx = y => cx - (TW / 2 - (TW - BW) / 2 * ((y - y0) / H)), rx = y => cx + (TW / 2 - (TW - BW) / 2 * ((y - y0) / H));
  const [d1, cupFill] = lit(C.porcelain, 'lr', 0.06), [d2, slFill] = lit(sleeve, 'lr', 0.1), [d3, lidFill] = lit(lid, 'tb', 0.12);
  const sy0 = y0 + H * 0.36, sy1 = y0 + H * 0.66, lidW = TW + 8 * s, lidH = 9 * s;
  let g = `<defs>${d1}${d2}${d3}</defs>` + shadow(cx, base + 3 * s, BW * 0.8, 5 * s);
  g += `<path d="M${lx(y0)},${y0} L${rx(y0)},${y0} L${rx(base)},${base} L${lx(base)},${base} Z" fill="${cupFill}"/>`;
  g += `<path d="M${lx(sy0)},${sy0} L${rx(sy0)},${sy0} L${rx(sy1)},${sy1} L${lx(sy1)},${sy1} Z" fill="${slFill}"/>`;
  g += `<rect x="${cx - lidW / 2}" y="${y0 - lidH}" width="${lidW}" height="${lidH}" rx="${4 * s}" fill="${lidFill}"/>`;
  g += `<path d="M${cx - lidW / 2 + 7 * s},${y0 - lidH} Q${cx},${y0 - lidH - 12 * s} ${cx + lidW / 2 - 7 * s},${y0 - lidH} Z" fill="${shade(lid, 0.15)}"/>`;
  if (tag) {
    g += `<path d="M${cx + TW * 0.26},${y0 - lidH - 5 * s} C${cx + TW * 0.46},${y0 + H * 0.08} ${cx + TW * 0.62},${y0 + H * 0.16} ${cx + TW * 0.62},${y0 + H * 0.3}" stroke="${C.ink}" stroke-width="${1.6 * s}" fill="none"/>`;
    g += `<rect x="${cx + TW * 0.62 - 8 * s}" y="${y0 + H * 0.3}" width="${16 * s}" height="${18 * s}" rx="${2.5 * s}" fill="${C.yellow}"/>`;
    g += `<path d="M${cx + TW * 0.62 - 3.5 * s},${y0 + H * 0.3 + 9 * s} q${3.5 * s},${-4 * s} ${7 * s},0 q${-3.5 * s},${4 * s} ${-7 * s},0" fill="${C.green}"/>`;
  }
  if (steam) g += steamLines(cx, y0 - lidH - 14 * s, s);
  return g;
}
function steamLines(cx, top, s) {
  let g = '';
  for (const dx of [-12, 2, 16]) g += `<path d="M${cx + dx * s},${top} q${-5 * s},${-8 * s} 0,${-16 * s} q${5 * s},${-8 * s} 0,${-16 * s}" stroke="#a9b3c6" stroke-width="${3 * s}" stroke-linecap="round" fill="none" opacity=".8"/>`;
  return g;
}
// Ceramic cup on a saucer (drinking here). fill: coffee | tea | milk | none.
function ceramicCup(cx, base, s, { drink = C.coffee, saucer = true, steam = false } = {}) {
  const [d1, body] = lit(C.porcelain, 'lr', 0.07);
  const W = 70 * s, H = 52 * s, y0 = base - H - (saucer ? 6 * s : 0);
  let g = `<defs>${d1}</defs>` + shadow(cx, base + 2 * s, W * 0.75, 6 * s);
  if (saucer) g += `<ellipse cx="${cx}" cy="${base - 3 * s}" rx="${W * 0.75}" ry="${8 * s}" fill="${C.porcelainShade}"/><ellipse cx="${cx}" cy="${base - 5 * s}" rx="${W * 0.62}" ry="${6 * s}" fill="${C.porcelain}"/>`;
  g += `<path d="M${cx + W / 2 - 4 * s},${y0 + 12 * s} q${22 * s},${2 * s} ${16 * s},${20 * s} q${-6 * s},${10 * s} ${-20 * s},${6 * s}" stroke="${C.porcelainShade}" stroke-width="${7 * s}" fill="none" stroke-linecap="round"/>`;
  g += `<path d="M${cx - W / 2},${y0} L${cx + W / 2},${y0} Q${cx + W / 2 - 4 * s},${y0 + H} ${cx},${y0 + H} Q${cx - W / 2 + 4 * s},${y0 + H} ${cx - W / 2},${y0} Z" fill="${body}"/>`;
  g += `<ellipse cx="${cx}" cy="${y0}" rx="${W / 2}" ry="${8 * s}" fill="${C.porcelainShade}"/>`;
  if (drink) g += `<ellipse cx="${cx}" cy="${y0 + 1.5 * s}" rx="${W / 2 - 5 * s}" ry="${5.5 * s}" fill="${drink}"/>`;
  if (steam) g += steamLines(cx, y0 - 10 * s, s);
  return g;
}
// Clear glass: water/juice, optional ice cubes.
function glass(cx, base, s, { liquid = C.water, level = 0.75, ice = false } = {}) {
  const H = 110 * s, TW = 62 * s, BW = 50 * s, y0 = base - H;
  const ly = y0 + H * (1 - level);
  const lx = y => cx - (TW / 2 - (TW - BW) / 2 * ((y - y0) / H)), rx = y => cx + (TW / 2 - (TW - BW) / 2 * ((y - y0) / H));
  let g = shadow(cx, base + 3 * s, BW * 0.8, 5 * s);
  g += `<path d="M${lx(y0)},${y0} L${rx(y0)},${y0} L${rx(base)},${base} L${lx(base)},${base} Z" fill="#ffffff" opacity=".55"/>`;
  g += `<path d="M${lx(ly)},${ly} L${rx(ly)},${ly} L${rx(base)},${base} L${lx(base)},${base} Z" fill="${liquid}"/>`;
  if (ice) for (const [dx, dy, r] of [[-12, 10, 8], [8, 4, -12], [-2, 26, 20]]) g += `<rect x="${cx + dx * s - 9 * s}" y="${ly + dy * s}" width="${18 * s}" height="${18 * s}" rx="${3 * s}" fill="#ffffff" opacity=".75" transform="rotate(${r} ${cx + dx * s} ${ly + dy * s + 9 * s})"/>`;
  g += `<path d="M${lx(y0) + 6 * s},${y0 + 8 * s} L${lx(base) + 6 * s},${base - 8 * s}" stroke="#fff" stroke-width="${4 * s}" stroke-linecap="round" opacity=".7"/>`;
  return g;
}
// "Without" marker: a red ring with a slash over a small object group.
function noSign(cx, cy, r, inner) {
  return inner + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.no}" stroke-width="${r * 0.16}"/><path d="M${cx - r * 0.7},${cy + r * 0.7} L${cx + r * 0.7},${cy - r * 0.7}" stroke="${C.no}" stroke-width="${r * 0.16}" stroke-linecap="round"/>`;
}
function sugarCubes(cx, cy, s) {
  const cube = (x, y) => `<rect x="${x}" y="${y}" width="${18 * s}" height="${18 * s}" rx="${2.5 * s}" fill="#fff"/><path d="M${x},${y + 13 * s} h${18 * s} v${5 * s} h${-18 * s}z" fill="#ddd5c6"/>`;
  return cube(cx - 19 * s, cy - 4 * s) + cube(cx + 1 * s, cy - 4 * s) + cube(cx - 9 * s, cy - 22 * s);
}
function iceCubes(cx, cy, s) {
  const cube = (x, y, r) => `<rect x="${x}" y="${y}" width="${20 * s}" height="${20 * s}" rx="${4 * s}" fill="#e8f3fb" transform="rotate(${r} ${x + 10 * s} ${y + 10 * s})"/><rect x="${x + 4 * s}" y="${y + 4 * s}" width="${7 * s}" height="${4 * s}" rx="${2 * s}" fill="#fff" transform="rotate(${r} ${x + 10 * s} ${y + 10 * s})"/>`;
  return cube(cx - 22 * s, cy - 6 * s, -10) + cube(cx + 2 * s, cy - 2 * s, 12) + cube(cx - 10 * s, cy - 26 * s, 4);
}
function milkJug(cx, base, s) {
  const [d, f] = lit(C.porcelain, 'lr', 0.07);
  return `<defs>${d}</defs>` + shadow(cx, base + 2 * s, 30 * s, 4 * s) +
    `<path d="M${cx - 22 * s},${base} L${cx - 26 * s},${base - 44 * s} L${cx - 14 * s},${base - 58 * s} L${cx + 18 * s},${base - 58 * s} L${cx + 26 * s},${base - 44 * s} L${cx + 22 * s},${base} Z" fill="${f}"/>` +
    `<path d="M${cx - 14 * s},${base - 58 * s} L${cx - 28 * s},${base - 64 * s} L${cx - 22 * s},${base - 52 * s}" fill="${C.porcelainShade}"/>` +
    `<path d="M${cx + 24 * s},${base - 44 * s} q${16 * s},${2 * s} ${10 * s},${20 * s}" stroke="${C.porcelainShade}" stroke-width="${6 * s}" fill="none" stroke-linecap="round"/>` +
    `<ellipse cx="${cx + 2 * s}" cy="${base - 56 * s}" rx="${14 * s}" ry="${3 * s}" fill="${C.milk}"/>`;
}
function orangeHalf(cx, cy, s) {
  return `<circle cx="${cx}" cy="${cy}" r="${22 * s}" fill="${C.orange}"/><circle cx="${cx}" cy="${cy}" r="${18 * s}" fill="#f8b65a"/>` +
    [0, 60, 120, 180, 240, 300].map(a => `<path d="M${cx},${cy} L${cx + 16 * s * Math.cos(a * Math.PI / 180)},${cy + 16 * s * Math.sin(a * Math.PI / 180)}" stroke="#fde3b0" stroke-width="${2 * s}"/>`).join('');
}

// Half-length person. Faces stay simple: two eyes, a soft smile, no outlines.
function person(cx, base, s, o = {}) {
  const skin = o.skin || C.skin1, hair = o.hair || C.hairDark, top = o.top || C.blue;
  const [dt, topFill] = lit(top, 'diag', 0.1), [ds, skinFill] = lit(skin, 'diag', 0.06);
  const headR = 34 * s, headY = base - 150 * s;
  let g = `<defs>${dt}${ds}</defs>`;
  // torso
  g += `<path d="M${cx - 62 * s},${base} Q${cx - 66 * s},${base - 78 * s} ${cx - 34 * s},${base - 98 * s} L${cx + 34 * s},${base - 98 * s} Q${cx + 66 * s},${base - 78 * s} ${cx + 62 * s},${base} Z" fill="${topFill}"/>`;
  if (o.apron) g += `<path d="M${cx - 30 * s},${base} L${cx - 26 * s},${base - 80 * s} L${cx + 26 * s},${base - 80 * s} L${cx + 30 * s},${base} Z" fill="${o.apron}"/><path d="M${cx - 26 * s},${base - 80 * s} L${cx - 14 * s},${base - 98 * s} M${cx + 26 * s},${base - 80 * s} L${cx + 14 * s},${base - 98 * s}" stroke="${o.apron}" stroke-width="${5 * s}"/>`;
  // neck
  g += `<rect x="${cx - 11 * s}" y="${headY + headR - 8 * s}" width="${22 * s}" height="${26 * s}" rx="${8 * s}" fill="${shade(skin, -0.08)}"/>`;
  // hair behind head
  if (o.hairStyle === 'curly') {
    for (const [dx, dy, r] of [[-30, -6, 20], [30, -6, 20], [-24, 18, 17], [24, 18, 17], [-34, 34, 14], [34, 34, 14], [0, -26, 26], [-18, -22, 20], [18, -22, 20]])
      g += `<circle cx="${cx + dx * s}" cy="${headY + dy * s}" r="${r * s}" fill="${hair}"/>`;
  }
  if (o.hairStyle === 'long') g += `<path d="M${cx - 36 * s},${headY - 8 * s} Q${cx - 44 * s},${headY + 40 * s} ${cx - 40 * s},${headY + 58 * s} Q${cx - 30 * s},${headY + 50 * s} ${cx - 26 * s},${headY + 26 * s} L${cx + 26 * s},${headY + 26 * s} Q${cx + 30 * s},${headY + 50 * s} ${cx + 40 * s},${headY + 58 * s} Q${cx + 44 * s},${headY + 40 * s} ${cx + 36 * s},${headY - 8 * s} Z" fill="${hair}"/>`;
  // head
  g += `<ellipse cx="${cx}" cy="${headY}" rx="${headR * 0.92}" ry="${headR}" fill="${skinFill}"/>`;
  g += `<ellipse cx="${cx - headR * 0.9}" cy="${headY + 4 * s}" rx="${6 * s}" ry="${9 * s}" fill="${shade(skin, -0.06)}"/><ellipse cx="${cx + headR * 0.9}" cy="${headY + 4 * s}" rx="${6 * s}" ry="${9 * s}" fill="${shade(skin, -0.06)}"/>`;
  // hair on top
  if (o.hairStyle === 'short' || o.hairStyle === 'beard') g += `<path d="M${cx - 32 * s},${headY - 4 * s} Q${cx - 34 * s},${headY - 40 * s} ${cx},${headY - 38 * s} Q${cx + 36 * s},${headY - 40 * s} ${cx + 32 * s},${headY - 6 * s} Q${cx + 20 * s},${headY - 24 * s} ${cx - 6 * s},${headY - 22 * s} Q${cx - 24 * s},${headY - 20 * s} ${cx - 32 * s},${headY - 4 * s} Z" fill="${hair}"/>`;
  if (o.hairStyle === 'long') g += `<path d="M${cx - 33 * s},${headY} Q${cx - 30 * s},${headY - 40 * s} ${cx + 4 * s},${headY - 37 * s} Q${cx + 36 * s},${headY - 34 * s} ${cx + 33 * s},${headY} Q${cx + 12 * s},${headY - 22 * s} ${cx - 33 * s},${headY} Z" fill="${hair}"/>`;
  if (o.hairStyle === 'curly') for (const [dx, dy, r] of [[-20, -26, 11], [-4, -31, 12], [13, -28, 11], [26, -18, 9], [-29, -14, 9]]) g += `<circle cx="${cx + dx * s}" cy="${headY + dy * s}" r="${r * s}" fill="${hair}"/>`;
  if (o.hairStyle === 'beard') g += `<path d="M${cx - 28 * s},${headY + 6 * s} Q${cx - 26 * s},${headY + 38 * s} ${cx},${headY + 38 * s} Q${cx + 26 * s},${headY + 38 * s} ${cx + 28 * s},${headY + 6 * s} Q${cx + 16 * s},${headY + 22 * s} ${cx},${headY + 22 * s} Q${cx - 16 * s},${headY + 22 * s} ${cx - 28 * s},${headY + 6 * s} Z" fill="${hair}"/>`;
  // face
  g += `<ellipse cx="${cx - 11 * s}" cy="${headY - 2 * s}" rx="${3.2 * s}" ry="${4 * s}" fill="${C.ink}"/><ellipse cx="${cx + 11 * s}" cy="${headY - 2 * s}" rx="${3.2 * s}" ry="${4 * s}" fill="${C.ink}"/>`;
  g += `<path d="M${cx - 9 * s},${headY + 13 * s} Q${cx},${headY + 20 * s} ${cx + 9 * s},${headY + 13 * s}" stroke="${o.hairStyle === 'beard' ? '#f3e3d6' : shade(skin, -0.35)}" stroke-width="${2.6 * s}" fill="none" stroke-linecap="round"/>`;
  g += `<ellipse cx="${cx - 19 * s}" cy="${headY + 9 * s}" rx="${5 * s}" ry="${3 * s}" fill="#e88a7a" opacity=".35"/><ellipse cx="${cx + 19 * s}" cy="${headY + 9 * s}" rx="${5 * s}" ry="${3 * s}" fill="#e88a7a" opacity=".35"/>`;
  if (o.earring) g += `<circle cx="${cx - headR * 0.9}" cy="${headY + 16 * s}" r="${3 * s}" fill="${C.yellow}"/>`;
  return g;
}
// Timsah: friendly upright crocodile, same flat language as people.
function timsah(cx, base, s) {
  const [d1, body] = lit(C.croc, 'diag', 0.1);
  let g = `<defs>${d1}</defs>`;
  g += `<path d="M${cx + 30 * s},${base - 20 * s} Q${cx + 90 * s},${base - 10 * s} ${cx + 100 * s},${base - 40 * s} Q${cx + 70 * s},${base - 26 * s} ${cx + 40 * s},${base - 44 * s} Z" fill="${C.crocDark}"/>`;
  g += `<path d="M${cx - 46 * s},${base} Q${cx - 54 * s},${base - 90 * s} ${cx - 26 * s},${base - 110 * s} L${cx + 26 * s},${base - 110 * s} Q${cx + 54 * s},${base - 90 * s} ${cx + 46 * s},${base} Z" fill="${body}"/>`;
  g += `<path d="M${cx - 26 * s},${base} Q${cx - 30 * s},${base - 70 * s} ${cx},${base - 92 * s} Q${cx + 30 * s},${base - 70 * s} ${cx + 26 * s},${base} Z" fill="${C.crocBelly}"/>`;
  const hy = base - 140 * s;
  g += `<path d="M${cx - 34 * s},${hy + 20 * s} Q${cx - 38 * s},${hy - 24 * s} ${cx},${hy - 26 * s} Q${cx + 34 * s},${hy - 24 * s} ${cx + 36 * s},${hy + 4 * s} L${cx + 92 * s},${hy + 10 * s} Q${cx + 102 * s},${hy + 22 * s} ${cx + 90 * s},${hy + 34 * s} L${cx + 20 * s},${hy + 40 * s} Q${cx - 30 * s},${hy + 44 * s} ${cx - 34 * s},${hy + 20 * s} Z" fill="${body}"/>`;
  g += `<path d="M${cx + 30 * s},${hy + 22 * s} L${cx + 92 * s},${hy + 22 * s}" stroke="${C.crocDark}" stroke-width="${3 * s}" stroke-linecap="round"/>`;
  g += `<circle cx="${cx + 84 * s}" cy="${hy + 12 * s}" r="${2.6 * s}" fill="${C.crocDark}"/>`;
  for (const dx of [-12, 14]) g += `<circle cx="${cx + dx * s}" cy="${hy - 18 * s}" r="${12 * s}" fill="${C.croc}"/><circle cx="${cx + dx * s}" cy="${hy - 18 * s}" r="${7 * s}" fill="#fff"/><circle cx="${cx + dx * s + 2 * s}" cy="${hy - 17 * s}" r="${3.6 * s}" fill="${C.ink}"/>`;
  g += `<path d="M${cx - 46 * s},${base - 76 * s} Q${cx - 70 * s},${base - 60 * s} ${cx - 62 * s},${base - 40 * s}" stroke="${C.croc}" stroke-width="${14 * s}" fill="none" stroke-linecap="round"/>`;
  g += `<path d="M${cx + 46 * s},${base - 76 * s} Q${cx + 72 * s},${base - 60 * s} ${cx + 62 * s},${base - 40 * s}" stroke="${C.croc}" stroke-width="${14 * s}" fill="none" stroke-linecap="round"/>`;
  return g;
}
const CAST = {
  ori: (cx, base, s) => person(cx, base, s, { skin: C.skin2, hair: C.hairDark, hairStyle: 'beard', top: C.navy, apron: C.kraft }),
  tamar: (cx, base, s) => person(cx, base, s, { skin: C.skin1, hair: C.hairCurly, hairStyle: 'curly', top: C.amber, earring: true }),
  learnerM: (cx, base, s) => person(cx, base, s, { skin: C.skin1, hair: C.hairBrown, hairStyle: 'short', top: C.blue }),
  learnerF: (cx, base, s) => person(cx, base, s, { skin: C.skin3, hair: C.hairDark, hairStyle: 'long', top: C.green }),
  timsah
};
module.exports = { C, frame, shadow, paperCup, ceramicCup, glass, noSign, sugarCubes, iceCubes, milkJug, orangeHalf, person, timsah, CAST, lit, shade, steamLines };
