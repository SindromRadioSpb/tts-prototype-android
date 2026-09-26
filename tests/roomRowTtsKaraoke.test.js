"use strict";

// Зал: караоке TTS строки (подсветка произносимого слова) обязано работать и тогда, когда
// у строки НЕТ своей кнопки ▶ — учебный режим «Скрыта» играет строку из всплывающего
// оверлея (readerAudio.play(i)). Раньше attachRowAudio находил <tr> только через кнопку
// строки, поэтому в этом режиме слово не подсвечивалось, хотя тайминг был.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseHTML } = require("linkedom");

const source = fs.readFileSync(path.resolve(__dirname, "..", "public", "js", "reader-core.js"), "utf8");

function tableHtml(withButton) {
  const action = withButton
    ? '<td data-col="action"><button type="button" class="row-tts-btn" data-row-idx="0">▶</button></td>'
    : "";
  return '<div id="mount"><table id="proTable"><tbody>' +
    '<tr data-row-idx="0">' + action +
    '<td data-col="he"><span class="rm-w" data-w-offset="0">או</span> <span class="rm-w" data-w-offset="1">אם</span></td>' +
    '<td data-col="niqqud"><span class="rm-w" data-w-offset="0">אוֹ</span> <span class="rm-w" data-w-offset="1">אִם</span></td>' +
    "</tr></tbody></table></div>";
}

async function run(withButton) {
  const { window, document } = parseHTML("<!doctype html><html><body>" + tableHtml(withButton) + "</body></html>");
  const frames = [];
  const players = [];
  class FakeAudio {
    constructor() { this.currentTime = 0; this.paused = true; this.src = ""; players.push(this); }
    addEventListener() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const saved = {};
  const globals = {
    window, document, Audio: FakeAudio,
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    fetch: async (url, init) => {
      if (init && init.method === "HEAD") return { ok: true };
      if (/\/timing$/.test(url)) return { ok: true, json: async () => ({ words: [{ o: 0, t: 0 }, { o: 1, t: 0.5 }] }) };
      return { ok: false };
    },
  };
  for (const k of Object.keys(globals)) { saved[k] = globalThis[k]; globalThis[k] = globals[k]; }
  try {
    const core = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64") + "#" + Math.random());
    const mount = document.getElementById("mount");
    const handle = core.attachRowAudio(mount, {
      getRow: () => ({ he: "או אם", _v3_audioAssetKey: "sha-row0" }),
    });
    handle.play(0);
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
    players[0].currentTime = 0.7;
    const pending = frames.splice(0);
    pending.forEach((fn) => fn());
    const tr = mount.querySelector('tr[data-row-idx="0"]');
    return {
      spoken: [...mount.querySelectorAll(".rm-w-speaking")].map((s) => s.getAttribute("data-w-offset")),
      rowPlaying: tr.classList.contains("row-playing"),
    };
  } finally {
    for (const k of Object.keys(saved)) globalThis[k] = saved[k];
  }
}

test("row TTS karaoke paints the spoken word when the row has its own ▶ button", async () => {
  const r = await run(true);
  assert.deepEqual(r.spoken, ["1", "1"], "offset 1 lit in both he and niqqud cells");
  assert.equal(r.rowPlaying, true);
});

test("row TTS karaoke paints the spoken word when the row has NO button (study mode, hidden action column)", async () => {
  const r = await run(false);
  assert.deepEqual(r.spoken, ["1", "1"], "overlay playback must still light the spoken word");
  assert.equal(r.rowPlaying, true, "the row itself is marked playing so the overlay can follow it");
});
