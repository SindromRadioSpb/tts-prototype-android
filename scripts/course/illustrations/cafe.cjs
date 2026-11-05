'use strict';
// Illustrations for L001-cafe in style A. Each entry returns {svg,width,height} or, for a sequence, {frames:[...]}.
const A = require('./style-a.cjs');
const { C } = A;
const SIZE = { '16:9': [1200, 675], '4:3': [1200, 900], '1:1': [900, 900] };

const table = (y, x0, x1, top = C.wood) => `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="26" rx="10" fill="${top}"/><rect x="${x0 + 20}" y="${y + 22}" width="${x1 - x0 - 40}" height="10" fill="${C.woodDark}" opacity=".6"/>`;
const ghostRing = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="${C.blueSoft}"/>`;
const cakeSlice = (cx, base, s) =>
  A.shadow(cx, base + 3 * s, 60 * s, 6 * s) +
  `<ellipse cx="${cx}" cy="${base - 2 * s}" rx="${70 * s}" ry="${12 * s}" fill="${C.porcelain}"/>` +
  `<path d="M${cx - 50 * s},${base - 8 * s} L${cx + 50 * s},${base - 8 * s} L${cx + 30 * s},${base - 70 * s} L${cx - 50 * s},${base - 50 * s} Z" fill="#f2d7a7"/>` +
  `<path d="M${cx - 50 * s},${base - 30 * s} L${cx + 42 * s},${base - 34 * s}" stroke="#8b4f3a" stroke-width="${8 * s}"/>` +
  `<path d="M${cx - 50 * s},${base - 50 * s} L${cx + 30 * s},${base - 70 * s} L${cx + 26 * s},${base - 78 * s} L${cx - 52 * s},${base - 58 * s} Z" fill="#7a3f2e"/>`;
const suitcase = (x, base, s) => `<rect x="${x}" y="${base - 150 * s}" width="${100 * s}" height="${150 * s}" rx="${14 * s}" fill="${C.navyLight}"/><rect x="${x + 30 * s}" y="${base - 182 * s}" width="${40 * s}" height="${36 * s}" rx="${8 * s}" fill="none" stroke="${C.navy}" stroke-width="${7 * s}"/>` +
  `<path d="M${x + 33 * s},${base - 140 * s} V${base - 12 * s} M${x + 67 * s},${base - 140 * s} V${base - 12 * s}" stroke="${C.navy}" stroke-width="${5 * s}" opacity=".5"/><circle cx="${x + 20 * s}" cy="${base + 4 * s}" r="${8 * s}" fill="${C.ink}"/><circle cx="${x + 80 * s}" cy="${base + 4 * s}" r="${8 * s}" fill="${C.ink}"/>`;
const chair = (x, base, s) => `<rect x="${x}" y="${base - 200 * s}" width="${16 * s}" height="${200 * s}" rx="${6 * s}" fill="${C.woodDark}"/><rect x="${x}" y="${base - 96 * s}" width="${110 * s}" height="${16 * s}" rx="${6 * s}" fill="${C.wood}"/><rect x="${x + 94 * s}" y="${base - 96 * s}" width="${16 * s}" height="${96 * s}" rx="${6 * s}" fill="${C.woodDark}"/>`;
const bag = (x, base, s) => `<path d="M${x},${base} L${x + 10 * s},${base - 70 * s} L${x + 90 * s},${base - 70 * s} L${x + 100 * s},${base} Z" fill="${C.amber}"/><path d="M${x + 26 * s},${base - 70 * s} Q${x + 50 * s},${base - 120 * s} ${x + 74 * s},${base - 70 * s}" stroke="${C.kraftDark}" stroke-width="${7 * s}" fill="none"/>`;
const awning = (w, h) => { let g = ''; for (let i = 0; i < 8; i++) g += `<path d="M${i * w / 8},0 h${w / 8} v${h} q${-w / 16},${h * 0.35} ${-w / 8},0 Z" fill="${i % 2 ? '#fdf3e2' : C.orange}"/>`; return g; };
const menuBoard = (x, y, w, h) => { let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.ink}"/>`; for (let i = 0; i < 4; i++) g += `<rect x="${x + 24}" y="${y + 26 + i * (h - 40) / 4}" width="${w * (i % 2 ? 0.5 : 0.7)}" height="10" rx="5" fill="#ffffff" opacity=".35"/>`; return g; };

function scene(w, h, body, bg) { return { svg: A.frame(w, h, body, bg ? { bg } : {}), width: w, height: h }; }

const D = {
  'm-cafe'() {
    const [w, h] = SIZE['16:9'];
    let b = `<rect width="${w}" height="${h}" fill="${C.wall}"/>`;
    b += `<rect x="760" y="70" width="330" height="250" rx="18" fill="#cfe3f3"/><rect x="760" y="190" width="330" height="10" fill="#ffffff" opacity=".7"/><rect x="920" y="70" width="10" height="250" fill="#ffffff" opacity=".7"/>`;
    b += menuBoard(90, 70, 300, 190);
    b += `<circle cx="1150" cy="420" r="60" fill="${C.green}"/><circle cx="1110" cy="390" r="44" fill="#6f9e4a"/><rect x="1120" y="440" width="60" height="70" rx="10" fill="${C.kraftDark}"/>`;
    b += A.CAST.ori(560, 600, 2.3);
    b += `<rect x="0" y="470" width="${w}" height="205" fill="${C.woodDark}"/><rect x="0" y="450" width="${w}" height="34" rx="6" fill="${C.wood}"/>`;
    b += `<rect x="150" y="300" width="170" height="160" rx="18" fill="${C.navy}"/><rect x="175" y="330" width="120" height="40" rx="10" fill="${C.navyLight}"/><rect x="215" y="392" width="40" height="40" rx="6" fill="#1a2440"/>`;
    b += A.paperCup(790, 452, 1.0) + A.paperCup(930, 452, 1.6);
    return scene(w, h, b);
  },
  'm-cups'() {
    const [w, h] = SIZE['4:3'];
    return scene(w, h, `<rect y="720" width="${w}" height="180" fill="${C.plateDeep}"/>` + A.paperCup(430, 720, 2.2) + A.paperCup(800, 720, 4.0));
  },
  'm-coffee'() { const [w, h] = SIZE['1:1']; return scene(w, h, A.ceramicCup(450, 640, 4.6, { drink: C.coffee, steam: true })); },
  'm-tea'() {
    const [w, h] = SIZE['1:1'];
    let b = A.ceramicCup(450, 640, 4.6, { drink: C.tea, steam: true });
    b += `<path d="M560,410 C640,430 650,470 640,520" stroke="${C.ink}" stroke-width="5" fill="none"/><rect x="610" y="520" width="62" height="72" rx="10" fill="${C.yellow}"/><path d="M628,556 q13,-15 26,0 q-13,15 -26,0" fill="${C.green}"/>`;
    return scene(w, h, b);
  },
  'm-water'() { const [w, h] = SIZE['1:1']; return scene(w, h, A.glass(450, 700, 4.6, { liquid: C.water, level: 0.8 })); },
  'm-milk'() { const [w, h] = SIZE['1:1']; return scene(w, h, `<rect x="0" y="735" width="${w}" height="165" fill="${C.plateDeep}"/>` + A.glass(380, 720, 4.4, { liquid: C.milk, level: 0.82 }) + A.milkJug(660, 720, 3.6), '#d6e2f2'); },
  'm-card-tea'() {
    const [w, h] = SIZE['4:3'];
    let b = ghostRing(90, 120, 470, 680) + A.paperCup(325, 740, 4.6, { tag: true, steam: true });
    b += `<g opacity=".35">${A.paperCup(660, 740, 2.4)}</g>`;
    b += A.noSign(950, 470, 150, A.sugarCubes(950, 490, 4.2));
    return scene(w, h, b);
  },
  'm-swap'() {
    const [w, h] = SIZE['4:3'];
    const floor = `<rect y="700" width="${w}" height="200" fill="${C.plateDeep}"/>`;
    const coffee = (x, o = 1) => `<g opacity="${o}">${A.ceramicCup(x, 700, 6, { drink: C.coffee, steam: o === 1 })}</g>`;
    const tea = (x, o = 1) => `<g opacity="${o}">${A.ceramicCup(x, 700, 6, { drink: C.tea, steam: o === 1 })}</g>`;
    return { frames: [
      scene(w, h, floor + coffee(600)),
      scene(w, h, floor + coffee(330, 0.35) + `<path d="M520,450 h150 m-40,-36 l40,36 l-40,36" stroke="${C.blue}" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` + tea(880)),
      scene(w, h, floor + tea(600))
    ] };
  },
  'm-tamar'() {
    const [w, h] = SIZE['4:3'];
    let b = `<rect width="${w}" height="${h}" fill="${C.wall}"/><rect x="640" y="80" width="460" height="330" rx="20" fill="#cfe3f3"/><rect x="866" y="80" width="10" height="330" fill="#fff" opacity=".7"/>`;
    b += A.CAST.tamar(380, 720, 2.6);
    b += table(640, 120, 1120) + `<rect y="700" width="${w}" height="200" fill="${C.woodDark}" opacity=".35"/>`;
    b += A.ceramicCup(560, 640, 2.6, { drink: '#c9a27a' }) + A.glass(760, 640, 1.9, { liquid: C.water, level: 0.8 }) + cakeSlice(960, 640, 1.9);
    return scene(w, h, b);
  },
  'm-card-juice'() {
    const [w, h] = SIZE['4:3'];
    let b = `<rect width="${w}" height="${h}" fill="#cfe9f5"/><rect y="560" width="${w}" height="340" fill="#f1dfb8"/>` + awning(w, 120);
    b += ghostRing(150, 200, 420, 620) + A.glass(360, 760, 4.4, { liquid: C.orange, level: 0.85 }) + A.orangeHalf(640, 720, 2.6);
    b += A.noSign(930, 470, 150, A.iceCubes(930, 490, 4));
    return scene(w, h, b);
  },
  'm-card-airport'() {
    const [w, h] = SIZE['4:3'];
    let b = `<rect y="720" width="${w}" height="180" fill="${C.plateDeep}"/>` + suitcase(860, 720, 2.6);
    b += ghostRing(160, 260, 340, 540) + A.paperCup(330, 720, 2.6, { tag: true }) + A.milkJug(620, 720, 3.4);
    return scene(w, h, b);
  },
  'm-card-friend'() {
    const [w, h] = SIZE['4:3'];
    let b = `<rect width="${w}" height="${h}" fill="${C.wall}"/>` + chair(820, 800, 2.6) + bag(890, 552, 1.6);
    b += table(620, 60, 820) + ghostRing(110, 300, 420, 360) + A.ceramicCup(320, 620, 4.4, { drink: C.coffee, steam: true });
    b += A.noSign(680, 300, 100, A.sugarCubes(680, 320, 2.8));
    return scene(w, h, b);
  },
  'm-card-evening'() {
    const [w, h] = SIZE['4:3'];
    let b = `<rect width="${w}" height="${h}" fill="#f4c9a2"/><rect y="360" width="${w}" height="240" fill="#5b86b5"/><circle cx="900" cy="300" r="90" fill="#f9e3a0"/><rect y="360" width="${w}" height="14" fill="#ffffff" opacity=".4"/>`;
    b += table(660, 80, 1120) + `<rect y="690" width="${w}" height="210" fill="${C.woodDark}" opacity=".5"/>`;
    b += A.glass(470, 660, 4.4, { liquid: C.water, level: 0.82, ice: true }) + A.iceCubes(800, 640, 3);
    return scene(w, h, b);
  }
};
module.exports = { drawings: D, SIZE };
