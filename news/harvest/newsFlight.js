'use strict';
// Next.js App Router pages send part of the article only in the React flight stream
// (self.__next_f.push) and render it in the browser. Maariv does this for the first paragraphs.
// This reads the stream and puts those paragraphs back into the page at their section numbers.

function decodeFlight(html) {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m, out = '';
  while ((m = re.exec(String(html || '')))) { try { out += JSON.parse(m[1]); } catch (_) {} }
  return out;
}
// Text chunks "<id>:T<hex byte length>,<content>" are referenced elsewhere as "$<id>".
function textChunks(flight) {
  const map = new Map(), re = /(?:^|\n)([0-9a-f]+):T([0-9a-f]+),/g;
  let m;
  while ((m = re.exec(flight))) {
    const start = m.index + m[0].length, bytes = parseInt(m[2], 16);
    const content = Buffer.from(flight.slice(start, start + bytes)).subarray(0, bytes).toString('utf8');
    map.set(m[1], content);
  }
  return map;
}
// → [{ id, html }] paragraph sections (type 100) with their section number.
function flightSections(html) {
  const flight = decodeFlight(html);
  if (!flight) return [];
  const chunks = textChunks(flight), out = [], re = /\{"id":(\d+),"type":(\d+),"text":("(?:[^"\\]|\\.)*")/g;
  let m;
  while ((m = re.exec(flight))) {
    if (m[2] !== '100') continue;
    let text; try { text = JSON.parse(m[3]); } catch (_) { continue; }
    if (/^\$[0-9a-f]+$/.test(text)) text = chunks.get(text.slice(1)) || '';
    if (/[א-ת]/.test(text)) out.push({ id: Number(m[1]), html: text });
  }
  const seen = new Set();
  return out.filter(s => !seen.has(s.id) && seen.add(s.id));
}
// Inserts the missing sections into `container` (whose children carry id="section-N") in order.
function hydrateSections(document, container, html) {
  if (!container) return 0;
  const sections = flightSections(html);
  let added = 0;
  for (const s of sections) {
    if (document.getElementById('section-' + s.id)) continue;
    const el = document.createElement('div');
    el.setAttribute('id', 'section-' + s.id);
    el.setAttribute('data-lp-hydrated', '');
    el.innerHTML = s.html;
    const next = [...container.children].find(c => { const n = /^section-(\d+)$/.exec(c.getAttribute('id') || ''); return n && Number(n[1]) > s.id; });
    container.insertBefore(el, next || null);
    added++;
  }
  return added;
}

module.exports = { decodeFlight, flightSections, hydrateSections };
