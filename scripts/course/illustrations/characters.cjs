'use strict';
// Character sheet for dots: Ori, Tamar, learner (two variants), Timsah — left to right, no text.
const A = require('./style-a.cjs');
module.exports = function characters() {
  const W = 1500, H = 470, base = 420;
  let body = `<rect y="${base}" width="${W}" height="${H - base}" fill="${A.C.plateDeep}"/>`;
  body += A.CAST.ori(190, base, 1.45) + A.CAST.tamar(490, base, 1.45) + A.CAST.learnerM(790, base, 1.45) + A.CAST.learnerF(1060, base, 1.45) + A.CAST.timsah(1300, base, 1.45);
  return { svg: A.frame(W, H, body), width: W, height: H };
};
