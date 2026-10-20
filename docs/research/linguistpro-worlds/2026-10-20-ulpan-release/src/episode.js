(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  const assets = window.EPISODE_ASSETS, story = assets.story, images = {};
  const names = { hero: 'Человек-паук', timsah: 'Тимсах', seller: 'Продавец', master: 'Мастер', teacher: 'Учитель' };
  const starts = [], lineStarts = [];
  let duration = 0;
  for (const scene of story) {
    starts.push(duration);
    let offset = scene.arrival ? 2.4 : 0;
    lineStarts.push(scene.beats.map(beat => { const start = duration + offset; offset += beat.seconds; return start; }));
    scene.duration = offset;
    duration += offset;
  }
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let time = 0, playing = false, ready = false, reduced = media.matches;
  let last = null, raf = 0, manual = true, lastTextKey = '', destroyed = false;
  const removers = [];
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const ease = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const formatTime = value => Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2, '0');
  function on(target, name, listener) {
    target.addEventListener(name, listener);
    removers.push(() => target.removeEventListener(name, listener));
  }
  function getState(at = time) {
    const index = clamp(starts.findLastIndex(start => at >= start), 0, story.length - 1);
    const scene = story[index], local = Math.max(0, at - starts[index]);
    const line = clamp(lineStarts[index].findLastIndex(start => at >= start), 0, scene.beats.length - 1);
    const lineTime = Math.max(0, at - lineStarts[index][line]);
    const walking = !reduced && scene.arrival && local < 2.4;
    const heroX = walking ? 218 + 52 * ease(local / 2.4) : 270;
    const timsahX = walking ? heroX + 70 : 340;
    let clip = 'idle';
    const beat = scene.beats[line];
    if (walking) clip = 'walk';
    else if (!reduced && (beat.pose === 'map' || beat.pose === 'note')) clip = 'map';
    else if (!reduced && beat.who === 'hero' && beat.pose === 'greet' && lineTime < 3) clip = 'greet';
    return { time: at, index, id: scene.id, local, line, lineTime, clip, walking, heroX, timsahX, playing, ready, reduced, manual,
      speaker: beat.who, pose: beat.pose, ended: at >= duration, duration };
  }
  function shadow(x, y, width) {
    ctx.fillStyle = '#091b2a55'; ctx.beginPath(); ctx.ellipse(x, y, width, 2, 0, 0, Math.PI * 2); ctx.fill();
  }
  function frame(image, sx, sy, sw, sh, x, feet, width, height, flip = false, tilt = 0) {
    ctx.save(); ctx.translate(Math.round(x), feet); if (flip) ctx.scale(-1, 1); ctx.rotate(tilt);
    ctx.drawImage(image, sx, sy, sw, sh, -width / 2, -height, width, height); ctx.restore();
  }
  function hero(s) {
    const frames = assets.atlas.clips[s.clip];
    const phase = s.clip === 'walk' ? (s.local * .85) % 1 : s.clip === 'greet' ? clamp(s.lineTime / 2.4, 0, .999) : (s.local * .18) % 1;
    const f = frames[reduced ? 0 : Math.min(frames.length - 1, Math.floor(phase * frames.length))];
    shadow(s.heroX, 221, 11);
    // Gentle weight shift anchored at the feet; no vertical bounce or invented rig.
    const tilt = reduced || s.walking ? 0 : Math.sin(s.local * .85) * .008;
    frame(images.hero, f.x, f.y, 96, 96, s.heroX, 227, 96, 96, false, tilt);
  }
  function timsah(s) {
    shadow(s.timsahX, 221, 12);
    if (!reduced && !s.walking && ['map', 'note'].includes(s.pose)) {
      const page = s.lineTime % 4 > 3.1 ? 1 : 0;
      frame(images.timsahAct, page * 31, 0, 30, 41, s.timsahX, 223, 43, 59, true);
    } else if (!reduced && !s.walking && s.pose === 'laugh' && s.lineTime < 2.5) {
      frame(images.timsahLeisure, 87, 0, 28, 36, s.timsahX, 223, 43, 55, true);
    } else {
      const n = s.walking ? (Math.floor(s.local * 4) % 2 ? 3 : 2) : !reduced && s.local % 5.3 > 5.1 ? 1 : 0;
      const nod = reduced || s.walking ? 0 : Math.sin(s.lineTime * 2) * .012 * Math.max(0, 1 - s.lineTime / 2);
      frame(images.timsah, n * 32, 0, 31, 42, s.timsahX, 223, 43, 59, !s.walking, nod);
    }
  }
  function person(x, feet, scale, variant, walking, local, flip = false, talking = false) {
    const n = walking && !reduced ? Math.floor(local * 3.5) % 2 : 0;
    shadow(x, feet, 8 * scale);
    const tilt = talking && !reduced ? Math.sin(local * 1.8) * .018 : 0;
    frame(images.people, variant * 50 + n * 25, 0, 24, 44, x, feet, 24 * scale, 44 * scale, flip, tilt);
  }
  function cat(s, side, feet = 213) {
    const start = side === 'left' ? 42 : 594, end = side === 'left' ? 138 : 507;
    const travel = reduced ? 1 : ease((s.local - 5) / 10);
    const x = start + (end - start) * travel;
    const walking = !reduced && s.local > 5 && s.local < 15;
    const n = walking ? Math.floor(s.local * 5) % 2 : 2;
    shadow(x, feet, 8);
    frame(images.cat, n * 18, 0, 17, 18, x, feet + 2, 23, 25, side === 'right');
  }
  function ambient(s) {
    const p = reduced ? .65 : ease((s.local - 3) / 17);
    switch (s.id) {
      case 'promenade':
        person(443 + 140 * p, 191, .82, 0, !reduced && p < 1, s.local);
        cat(s, 'left', 211); break;
      case 'market':
        person(124, 164, .9, 1, false, s.local, false, s.speaker === 'seller');
        person(581 - 123 * p, 190, .85, 0, !reduced && p < 1, s.local, true);
        cat(s, 'left', 215); break;
      case 'workshop':
        person(150, 187, 1.1, 1, false, s.local, false, s.speaker === 'master');
        // A moving sheet, drawn as a prop over the unchanged bench background.
        ctx.fillStyle = '#e8d8ab'; ctx.save(); ctx.translate(150, 161);
        ctx.rotate(reduced ? 0 : Math.sin(s.local * .6) * .08); ctx.fillRect(-6, -3, 12, 8); ctx.restore(); break;
      case 'jaffa':
        person(483 + 93 * p, 186, .74, 1, !reduced && p < 1, s.local);
        cat(s, 'left', 205); break;
      case 'reading':
        person(452, 186, .95, 0, false, s.local, true, s.speaker === 'teacher');
        // Reader at the left; a small page turn rather than street traffic indoors.
        person(120, 194, .88, 1, false, s.local);
        ctx.fillStyle = '#f3dfaf'; ctx.fillRect(109, 169, 22, 9);
        ctx.fillStyle = '#8c7252'; ctx.fillRect(120 + (!reduced && s.local % 7 > 6 ? 4 : 0), 169, 1, 9); break;
      case 'cinema':
        person(487 + 48 * p, 181, .82, 0, !reduced && p < 1, s.local);
        cat(s, 'right', 207); break;
    }
  }
  function panorama(image, t, speed, source, dest) {
    const offset = t * speed;
    // Alternating mirrored tiles meet at identical edge pixels, even on long scenes.
    // The train moves continuously forward; no resetting the eight-second v5 strip.
    for (let k = -2; k < 5; k++) {
      const x = k * 640 + 150 - offset;
      ctx.save(); ctx.translate(x + (Math.abs(k) % 2 ? 640 : 0), 0);
      if (Math.abs(k) % 2) ctx.scale(-1, 1);
      ctx.drawImage(image, ...source, 0, dest[0], 640, dest[1]); ctx.restore();
    }
  }
  function travel(s) {
    ctx.drawImage(images.trainInterior, 0, 0, 640, 228);
    ctx.save(); ctx.beginPath();
    for (const w of [[183, 29, 122, 80], [335, 29, 122, 80]]) ctx.roundRect(...w, 4);
    ctx.clip();
    const movement = reduced ? 3 : s.local <= 22 ? s.local : 22 + 3 * ease((s.local - 22) / 7);
    panorama(images.coast, movement, 21, [0, 0, images.coast.width, images.coast.height], [-18, 213]);
    ctx.save(); ctx.beginPath(); ctx.rect(180, 96, 280, 15); ctx.clip();
    panorama(images.coast, movement, 39, [0, 285, 1280, 141], [93, 42]); ctx.restore();
    ctx.fillStyle = '#ffdf9910'; ctx.fillRect(180, 29, 280, 80); ctx.restore();
    // Existing seated pose with a subtle anchored lean, not a new skeletal cycle.
    ctx.save(); ctx.translate(141, 214); ctx.rotate(reduced ? 0 : Math.sin(s.local * .7) * .004);
    ctx.drawImage(images.heroSeated, -96, -186, 192, 192); ctx.restore();
    const n = reduced ? 0 : s.pose === 'laugh' && s.lineTime < 2.5 ? 3 : s.local % 7 > 6 ? 1 : 0;
    frame(images.timsahLeisure, n * 29, 0, 28, 36, 502, 178, 84, 108, true);
  }
  function sceneSign(label) {
    ctx.save(); ctx.font = 'bold 18px Arial';
    const width = Math.ceil(ctx.measureText(label).width) + 20;
    const height = 36, x = Math.round(501 - width / 2), y = 63;
    ctx.fillStyle = '#173b47'; ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#dfba76'; ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
    ctx.strokeStyle = '#a6824d'; ctx.strokeRect(x + 3.5, y + 3.5, width - 7, height - 7);
    // Small stepped corners and diamond inlays: geometric Eastern ornament.
    ctx.strokeStyle = '#f3d79b';
    for (const [cx, cy, sx, sy] of [[x,y,1,1],[x+width,y,-1,1],[x,y+height,1,-1],[x+width,y+height,-1,-1]]) {
      ctx.beginPath(); ctx.moveTo(cx + sx * 2, cy + sy * 8);
      ctx.lineTo(cx + sx * 6, cy + sy * 8); ctx.lineTo(cx + sx * 6, cy + sy * 6);
      ctx.lineTo(cx + sx * 8, cy + sy * 6); ctx.lineTo(cx + sx * 8, cy + sy * 2); ctx.stroke();
    }
    for (const cy of [y + 3, y + height - 3]) {
      ctx.fillStyle = '#dfba76'; ctx.beginPath(); ctx.moveTo(501, cy - 2);
      ctx.lineTo(503, cy); ctx.lineTo(501, cy + 2); ctx.lineTo(499, cy); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#f7d389'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
    ctx.fillText(label, 501, y + 24); ctx.restore();
  }
  function paint() {
    if (!ready || destroyed) return;
    const s = getState(), scene = story[s.index];
    ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 640, 228);
    if (s.id === 'travel') travel(s);
    else {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 640, 228); ctx.clip();
      const zoom = 1.12; ctx.translate(320 * (1 - zoom), 228 * (1 - zoom)); ctx.scale(zoom, zoom);
      ctx.drawImage(images[s.id], 0, 0, 640, 228);
      ambient(s); hero(s); timsah(s);
      if (s.id === 'reading' || s.id === 'cinema') {
        sceneSign(s.id === 'reading' ? 'אולפן' : 'סרט');
      }
      ctx.restore();
    }
    const key = s.index + ':' + s.line + ':' + playing;
    if (key !== lastTextKey) {
      lastTextKey = key;
      $('#city').textContent = scene.city + ' · ' + (s.index + 1) + ' / ' + story.length;
      $('#scene-title').textContent = scene.title;
      $('#speaker').textContent = names[s.speaker];
      $('#line').textContent = scene.beats[s.line].text;
      $('#line-count').textContent = (s.line + 1) + ' / ' + scene.beats.length;
      const arrived = s.id === 'travel' && s.pose === 'arrival';
      $('#he').textContent = arrived ? scene.arrivalHe : scene.he;
      $('#translation').textContent = arrived ? scene.arrivalTranslation : scene.translation;
      canvas.setAttribute('aria-label', scene.city + '. Человек-паук и Тимсах. ' + scene.title);
      $('#scene').value = String(s.index);
      $('#dialogue').setAttribute('aria-live', playing ? 'off' : 'polite');
      $('#previous-line').disabled = s.index === 0 && s.line === 0;
      $('#next-line').disabled = s.index === story.length - 1 && s.line === scene.beats.length - 1;
      $('#prev').disabled = s.index === 0;
      $('#next').disabled = s.index === story.length - 1;
    }
    $('#seek').value = String(time);
    $('#clock').textContent = formatTime(time);
    $('#play').textContent = playing ? 'Пауза' : s.ended ? 'Смотреть сначала' : 'Смотреть';
    $('#play').setAttribute('aria-pressed', String(playing));
  }
  function announce(message) { $('#status').textContent = message; }
  function cancel() { if (raf) cancelAnimationFrame(raf); raf = 0; last = null; }
  function pause(message) {
    playing = false; cancel(); paint();
    if (message) announce(message);
  }
  function seek(value, message = true) {
    pause(); time = clamp(Number(value) || 0, 0, duration); paint();
    if (message) announce(story[getState().index].city + ' · ' + names[getState().speaker]);
  }
  function nextBoundary() {
    const s = getState(), scene = story[s.index];
    return s.line + 1 < scene.beats.length ? lineStarts[s.index][s.line + 1] : starts[s.index] + scene.duration;
  }
  function tick(ts) {
    raf = 0;
    if (!playing || destroyed) return;
    const dt = last === null ? 0 : Math.min(.1, (ts - last) / 1000); last = ts;
    const boundary = nextBoundary(), nextTime = time + dt;
    if (manual && nextTime >= boundary && boundary < duration) {
      time = Math.max(time, boundary - .001); pause('Реплика завершена. Продолжите, когда будете готовы.'); return;
    }
    time = Math.min(duration, nextTime);
    if (time >= duration) { pause('Ульпан найден. Можно повторить историю или перейти к спокойному уроку.'); return; }
    paint(); raf = requestAnimationFrame(tick);
  }
  function play() {
    if (!ready || destroyed) return;
    if (playing) { pause('Пауза.'); return; }
    if (time >= duration) time = 0;
    else if (manual && nextBoundary() - time < .02) time = Math.min(duration, nextBoundary() + .001);
    playing = true; last = null; paint(); announce(manual ? 'Показ реплики. Затем — пауза для чтения.' : 'Просмотр всей истории.');
    raf = requestAnimationFrame(tick);
  }
  function goScene(delta) { seek(starts[clamp(getState().index + delta, 0, story.length - 1)]); }
  function goLine(delta) {
    const s = getState(); let index = s.index, line = s.line + delta;
    if (line < 0 && index > 0) { index--; line = story[index].beats.length - 1; }
    if (line >= story[index].beats.length && index < story.length - 1) { index++; line = 0; }
    seek(lineStarts[index][clamp(line, 0, story[index].beats.length - 1)]);
  }
  function setReduced(value) {
    reduced = Boolean(value); $('#reduced').checked = reduced; pause(reduced ? 'Движение выключено. Реплики и сцены можно переключать.' : 'Движение включено.');
  }
  on($('#play'), 'click', play);
  on($('#next'), 'click', () => goScene(1)); on($('#prev'), 'click', () => goScene(-1));
  on($('#next-line'), 'click', () => goLine(1)); on($('#previous-line'), 'click', () => goLine(-1));
  on($('#replay'), 'click', () => seek(0));
  on($('#seek'), 'input', event => seek(event.target.value, false));
  on($('#scene'), 'change', event => seek(starts[Number(event.target.value)]));
  on($('#manual'), 'change', event => { manual = event.target.checked; pause(manual ? 'Чтение в своём темпе.' : 'Непрерывный просмотр.'); });
  on($('#reduced'), 'change', event => setReduced(event.target.checked));
  on(media, 'change', event => setReduced(event.matches));
  on(document, 'visibilitychange', () => { if (document.hidden && playing) pause('Просмотр приостановлен, пока вкладка скрыта.'); });
  on($('#learning'), 'click', () => {
    setReduced(true); seek(lineStarts[1][1]); $('#lesson').hidden = false;
    $('#solution').hidden = true; $('#answer').setAttribute('aria-expanded', 'false');
    $('#lesson').scrollIntoView({ behavior: 'instant', block: 'nearest' }); $('#answer').focus({ preventScroll: true });
  });
  on($('#answer'), 'click', () => { $('#solution').hidden = false; $('#answer').setAttribute('aria-expanded', 'true'); });
  $('#reduced').checked = reduced;
  $('#seek').max = String(duration); $('#total').textContent = formatTime(duration);
  story.forEach((scene, index) => {
    const option = document.createElement('option'); option.value = String(index); option.textContent = (index + 1) + '. ' + scene.title; $('#scene').append(option);
    const section = document.createElement('section'); section.className = 'transcript-scene';
    const heading = document.createElement('h3'); heading.textContent = scene.city + ' — ' + scene.title; section.append(heading);
    for (const beat of scene.beats) { const p = document.createElement('p'); const label = document.createElement('strong'); label.textContent = names[beat.who] + ': '; p.append(label, beat.text); section.append(p); }
    const he = document.createElement('p'); he.lang = 'he'; he.dir = 'rtl'; he.className = 'he'; he.textContent = scene.he; section.append(he);
    const ru = document.createElement('p'); ru.textContent = scene.translation; section.append(ru);
    if (scene.arrivalHe) { const arrival = document.createElement('p'); arrival.lang = 'he'; arrival.dir = 'rtl'; arrival.textContent = scene.arrivalHe; section.append(arrival); const translation = document.createElement('p'); translation.textContent = scene.arrivalTranslation; section.append(translation); }
    $('#transcript-content').append(section);
  });
  window.EPISODE = {
    seek, getState, duration, starts: [...starts], lineStarts: lineStarts.map(values => [...values]), play, pause,
    destroy() { pause(); destroyed = true; for (const remove of removers) remove(); for (const image of Object.values(images)) { image.onload = null; image.onerror = null; } },
  };
  Promise.all(Object.entries(assets.images).map(([key, src]) => new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => { images[key] = image; resolve(); }; image.onerror = () => reject(new Error('Не загрузилось изображение: ' + key)); image.src = src;
  }))).then(() => {
    if (destroyed) return;
    ready = true; for (const id of ['play', 'prev', 'next', 'replay', 'seek', 'scene', 'learning']) $('#' + id).disabled = false;
    paint(); announce('Готово. Можно смотреть или переключать реплики в своём темпе.');
  }).catch(error => {
    if (destroyed) return;
    $('#error').hidden = false; $('#error').textContent = error.message + '. Откройте всю историю текстом ниже.';
    $('#play').textContent = 'Изображения недоступны'; announce('История доступна текстом.');
  });
})();
