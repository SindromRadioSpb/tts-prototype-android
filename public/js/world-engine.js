/*
 * LinguistPro Worlds — World Engine v2 (docs/planning/linguistpro-worlds/ENGINE_CONTRACT.md).
 *
 * A world is a versioned, DECLARATIVE pack under /worlds/<id>/: manifest.json + atlas.json + PNG.
 * No script, HTML, CSS or network target comes from a pack. The engine owns:
 *   - which worlds may load at all (REGISTRY; a retired id never loads again after an update);
 *   - where the world may draw (only elements the app marks with data-world-slot);
 *   - how skin values reach CSS (allowlisted tokens, validated colour values only);
 *   - motion: a living canvas scene (parallax, lighting, ambient life, a journey that follows the
 *     Studio phase), a visible pause control, OS reduced motion = one still frame;
 *   - reactions: one scene at a time, <= 3 s, cooldown and per-session cap for automatic ones.
 * Worlds decorate meaning, never alter it: no learner data, no telemetry, no queue of late events.
 * World choice lives only in this device's localStorage (lp_world_v1) and is sent nowhere.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LPWorld = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ENGINE_VERSION = 2.2;
  var ENGINE_BUILD = "world-engine/2.2.1";
  var ILLUSTRATED_PROFILE = "illustrated-exploration/1";
  var CAPABILITIES = ["character-interactions/1", ILLUSTRATED_PROFILE, "illustrated-blink/1"];
  function illustratedModule() {
    if (typeof window !== "undefined" && window.LPWorldIllustrated)
      return window.LPWorldIllustrated;
    if (typeof require === "function") return require("./world-illustrated.js");
    return null;
  }
  var STORAGE_KEY = "lp_world_v1";
  var SCHEMA = "lp-world/2";
  var ATLAS_SCHEMA = "lp-world-atlas/1";
  // Kill switch: an id missing here, or retired, never loads — the next successful app update
  // withdraws a world everywhere (offline clients keep the old shell until they update).
  var REGISTRY = {
  "israel-elections-2026": {
    "base": "/worlds/israel-elections-2026/",
    "pack": "0.11.0",
    "retired": false,
    "category": "current-events",
    "names": {
      "ru": "Мир выборов в Израиле",
      "en": "Israel Elections 2026",
      "he": "עולם הבחירות 2026"
    },
    "noteKey": "world.elections.note",
    "badgeKey": "world.satireBadge",
    "greeting": "בְּחִירוֹת"
  },
  "sukkot": {
    "base": "/worlds/sukkot/",
    "pack": "0.1.0",
    "retired": false,
    "category": "events",
    "names": {
      "ru": "Мир Суккота",
      "en": "Sukkot World",
      "he": "עולם סוכות"
    },
    "note": {
      "ru": "Дворик, сукка и друзья. Тимсах читает и встречает гостей.",
      "en": "A courtyard, a sukkah, and friends. Timsah reads and welcomes guests.",
      "he": "חצר, סוכה וחברים. תמסח קורא ומקבל אורחים."
    },
    "badge": {
      "ru": "Сезонный мир",
      "en": "Seasonal world",
      "he": "עולם עונתי"
    },
    "routeLabel": {
      "ru": "Маршрут Суккота",
      "en": "Sukkot route",
      "he": "מסלול סוכות"
    },
    "greeting": "סֻכּוֹת",
    "previewLocation": "welcome"
  },
  "jerusalem-up-close": {
    "base": "/worlds/jerusalem-up-close/",
    "pack": "0.2.1",
    "retired": false,
    "profile": "illustrated-exploration/1",
    "capabilities": [
      "illustrated-exploration/1",
      "illustrated-blink/1"
    ],
    "category": "israel",
    "names": {
      "ru": "Иерусалим крупным планом",
      "en": "Jerusalem Up Close",
      "he": "ירושלים מקרוב"
    },
    "note": {
      "ru": "У тарелки есть оборот. У города — несколько времён.",
      "en": "A plate has a reverse. A city has more than one time.",
      "he": "לצלחת יש צד שני. לעיר יש יותר מזמן אחד."
    },
    "badge": {
      "ru": "Иллюстрированная история",
      "en": "Illustrated story",
      "he": "סיפור מאויר"
    },
    "routeLabel": {
      "ru": "Во двор мастерской",
      "en": "Into the workshop courtyard",
      "he": "אל חצר הסדנה"
    },
    "greeting": "ירושלים מקרוב",
    "previewLocation": "courtyard"
  }
};
  var CATEGORIES = {
    israel: { ru: "Израиль", en: "Israel", he: "ישראל" },
    pixel: { ru: "Пиксельные миры", en: "Pixel", he: "עולמות פיקסלים" },
    events: { ru: "Праздники", en: "Holidays", he: "חגים" },
    "current-events": {
      ru: "Актуальные события",
      en: "Current events",
      he: "אקטואליה",
    },
    literature: { ru: "Литература", en: "Literature", he: "ספרות" },
    other: { ru: "Другие миры", en: "Other worlds", he: "עולמות נוספים" },
  };
  // Owner decision 2026-09-30: the election world is ON by default (live); a learner switches to
  // Classic by hand and that explicit choice ({id:"classic"}) is kept. Retiring the default world
  // in REGISTRY sends everyone without an explicit choice back to Classic.
  var DEFAULT_WORLD = "israel-elections-2026";
  var CLASSIC = "classic";
  var MODES = ["calm", "live"];
  var LOCALES = ["ru", "en", "he"];
  var LIGHTINGS = ["day", "dusk", "night"];
  var PHASES = ["add", "correct", "table", "save", "learn"];
  var SLOTS = ["studio-stage", "room-stage", "media-stage", "page-backdrop"];
  var STAGE_SLOTS = ["studio-stage", "room-stage", "media-stage"];
  var TRIGGER_RE =
    /^(manual|ambient|tap|studio\.table-ready|arrive\.[a-z0-9-]+)$/;
  var COLOR_TOKENS = [
    "page",
    "surface",
    "surfaceSoft",
    "ink",
    "line",
    "shadow",
    "accent",
    "accentInk",
    "plate",
    "plateInk",
  ];
  var BUDGET = {
    maxAutoPerSession: 3,
    cooldownMs: 120000,
    maxDurationMs: 3000,
    maxManualDurationMs: 8000,
    ambientEveryMs: 22000,
  };
  var DEFAULT_SCALE = 2;
  var FRAME_MS = 33; // ~30 fps: pixel art does not need more, batteries prefer less
  var CSS_URL = "/css/world-skin.css?v=713"; // lockstep with the sw.js precache keys
  var RENDER_URL = "/js/world-render.js?v=713";
  var ILLUSTRATED_URL = "/js/world-illustrated.js?v=713";

  // ── pure core ──────────────────────────────────────────────────────────────

  function defaultChoice() {
    var reg = REGISTRY[DEFAULT_WORLD];
    return reg && !reg.retired
      ? {
          id: DEFAULT_WORLD,
          mode: "live",
          paused: false,
          lighting: "auto",
          implicit: true,
        }
      : null;
  }
  function readChoice(raw) {
    if (!raw) return defaultChoice();
    var v;
    try {
      v = JSON.parse(raw);
    } catch (_) {
      return defaultChoice();
    }
    if (!v || typeof v !== "object" || typeof v.id !== "string")
      return defaultChoice();
    if (v.id === CLASSIC) return null;
    var reg = own(REGISTRY, v.id) ? REGISTRY[v.id] : null;
    if (!reg || reg.retired) return defaultChoice();
    return {
      id: v.id,
      mode: MODES.indexOf(v.mode) >= 0 ? v.mode : "live",
      paused: v.paused === true,
      lighting:
        ["day", "dusk", "night"].indexOf(v.lighting) >= 0 ? v.lighting : "auto",
    };
  }

  function isPlainText(s) {
    return (
      typeof s === "string" &&
      s.length > 0 &&
      s.length <= 400 &&
      !/[<>]/.test(s)
    );
  }
  function isColor(s) {
    return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
  }
  function isName(s) {
    return (
      typeof s === "string" &&
      /^[a-z0-9][a-z0-9._-]{0,63}$/.test(s) &&
      ["constructor", "prototype", "__proto__"].indexOf(s) < 0
    );
  }
  function localized(obj) {
    return (
      !!obj &&
      LOCALES.every(function (l) {
        return isPlainText(obj[l]);
      })
    );
  }
  function localizedList(obj) {
    return (
      !!obj &&
      LOCALES.every(function (l) {
        return (
          Array.isArray(obj[l]) &&
          obj[l].length > 0 &&
          obj[l].every(isPlainText)
        );
      })
    );
  }
  function isNum(n, lo, hi) {
    return typeof n === "number" && isFinite(n) && n >= lo && n <= hi;
  }

  function own(obj, key) {
    return (
      !!obj &&
      typeof key === "string" &&
      Object.prototype.hasOwnProperty.call(obj, key)
    );
  }
  function ref(obj, key) {
    return isName(key) && own(obj, key);
  }
  function atlasFrame(atlas, sheet, frame) {
    var a = atlas && ref(atlas.atlases, sheet) && atlas.atlases[sheet];
    return a && ref(a.frames, frame)
      ? { sheet: a, rect: a.frames[frame] }
      : null;
  }
  function sheetsOf(spec) {
    if (typeof spec === "string") return [spec];
    if (spec && typeof spec === "object")
      return LIGHTINGS.map(function (l) {
        return spec[l];
      }).filter(Boolean);
    return [];
  }

  // Validates manifest + atlas against the engine contract. Returns { ok, errors }.
  function validatePackInner(manifest, atlas, expectedId) {
    if (manifest && manifest.profile === ILLUSTRATED_PROFILE) {
      var module = illustratedModule();
      return module
        ? module.core.validate(manifest, atlas, expectedId)
        : { ok: false, errors: ["illustrated module unavailable"] };
    }
    if (manifest && manifest.profile != null)
      return { ok: false, errors: ["unknown presentation profile"] };
    var errors = [];
    function err(m) {
      errors.push(m);
    }
    if (!manifest || manifest.schema !== SCHEMA)
      return { ok: false, errors: ["schema"] };
    if (manifest.id !== expectedId) err("id mismatch");
    var eng = manifest.engine || {};
    var extended =
      manifest.interactionVersion != null ||
      manifest.characters != null ||
      manifest.requiredCapabilities != null ||
      Object.keys(manifest.surfaces || {}).some(function (key) {
        return manifest.surfaces[key] && manifest.surfaces[key].scenery != null;
      });
    var revision = extended ? 2.1 : 2; // legacy declared contract, even on a newer shared host
    if (
      !(
        isNum(eng.min, 1, ENGINE_VERSION) &&
        isNum(eng.max, eng.min, 100) &&
        eng.min <= revision &&
        revision <= eng.max
      )
    )
      err("engine incompatible");
    if (
      extended &&
      (manifest.interactionVersion !== 1 ||
        eng.min < 2.1 ||
        !Array.isArray(manifest.requiredCapabilities) ||
        manifest.requiredCapabilities.length !== 1 ||
        manifest.requiredCapabilities[0] !== CAPABILITIES[0])
    )
      err("interaction capability required");
    if (!localized(manifest.names)) err("names");
    if (!localized(manifest.blurb)) err("blurb");
    if (!atlas || atlas.schema !== ATLAS_SCHEMA || atlas.world !== expectedId)
      err("atlas");
    var atlases = (atlas && atlas.atlases) || {};
    Object.keys(atlases).forEach(function (k) {
      if (!isName(k) || !/^[a-z0-9-]+\.png$/.test(atlases[k].file || ""))
        err("atlas file " + k);
      var a = atlases[k];
      if (
        !integer(a.width, 1, 8192) ||
        !integer(a.height, 1, 8192) ||
        !plainObject(a.frames) ||
        !Object.keys(a.frames).length
      ) {
        err("atlas geometry " + k);
        return;
      }
      Object.keys(a.frames).forEach(function (name) {
        var f = a.frames[name];
        if (
          !isName(name) ||
          !plainObject(f) ||
          !integer(f.x, 0, a.width - 1) ||
          !integer(f.y, 0, a.height - 1) ||
          !integer(f.w, 1, a.width) ||
          !integer(f.h, 1, a.height) ||
          f.x + f.w > a.width ||
          f.y + f.h > a.height ||
          !Array.isArray(f.anchor) ||
          f.anchor.length !== 2 ||
          !integer(f.anchor[0], 0, f.w - 1) ||
          !integer(f.anchor[1], 0, f.h - 1)
        )
          err("atlas frame " + k + "." + name);
      });
    });
    function sheetOk(spec, frame, tag) {
      var list = sheetsOf(spec);
      if (
        extended &&
        typeof spec !== "string" &&
        (!exactKeys(spec, LIGHTINGS) ||
          !LIGHTINGS.every(function (l) {
            return typeof spec[l] === "string";
          }))
      )
        err(tag + " lighting sheets");
      if (!list.length) {
        err(tag + " sheet");
        return;
      }
      list.forEach(function (s) {
        if (!ref(atlases, s) || (frame && !ref(atlases[s].frames, frame)))
          err(tag + " sheet " + s + (frame ? "." + frame : ""));
      });
    }
    ["light", "dark"].forEach(function (mode) {
      var skin = manifest.skin && manifest.skin[mode];
      if (!skin) {
        err("skin." + mode);
        return;
      }
      Object.keys(skin).forEach(function (k) {
        if (COLOR_TOKENS.indexOf(k) >= 0) {
          if (!isColor(skin[k])) err("skin." + mode + "." + k);
        } else err("skin token not allowed: " + k);
      });
    });
    Object.keys(manifest.ui || {}).forEach(function (k) {
      if (
        ["signBoard", "signLegs", "bubbleFrame", "bubbleTail"].indexOf(k) < 0 ||
        !ref(atlases, manifest.ui[k])
      )
        err("ui " + k);
    });
    function validateScenery(sc) {
      if (!sc) err("scenery");
      else {
        if (!isNum(sc.sceneHeight, 40, 400) || !isNum(sc.groundY, 0, 200))
          err("scenery size");
        LIGHTINGS.forEach(function (l) {
          var li = sc.lighting && sc.lighting[l];
          if (
            !li ||
            !Array.isArray(li.sky) ||
            li.sky.length < 2 ||
            li.sky.length > 8 ||
            !li.sky.every(isColor)
          )
            err("lighting." + l);
          ["star", "actorTint", "lampLight"].forEach(function (k) {
            if (li && li[k] != null && !isColor(li[k]))
              err("lighting." + l + "." + k);
          });
        });
        Object.keys(sc.celestial || {}).forEach(function (l) {
          var c = sc.celestial[l];
          if (LIGHTINGS.indexOf(l) < 0 || !c) {
            err("celestial " + l);
            return;
          }
          sheetOk(c.sheet, c.frame, "celestial " + l);
          if (!isNum(c.at, 0, 1) || !isNum(c.top, 0, 400))
            err("celestial " + l + " position");
        });
        if (!Array.isArray(sc.layers || [])) err("scenery layers");
        if (sc.titleVeil != null && typeof sc.titleVeil !== "boolean")
          err("scenery titleVeil");
        if (sc.curb != null && typeof sc.curb !== "boolean")
          err("scenery curb");
        (sc.layers || []).forEach(function (L) {
          var tag = "layer " + (L && L.id);
          if (!L || !isName(L.id)) {
            err(tag);
            return;
          }
          if (
            extended &&
            !exactKeys(L, [
              "id",
              "sheet",
              "frame",
              "frames",
              "frameMs",
              "parallax",
              "bottom",
              "drift",
              "lamps",
              "front",
              "backdrop",
              "backdropBottom",
              "scrollParallax",
            ])
          )
            err(tag + " fields");
          sheetOk(L.sheet, L.frame, tag);
          if (L.frames != null) {
            if (
              !Array.isArray(L.frames) ||
              !L.frames.length ||
              L.frames.length > 32 ||
              !integer(L.frameMs, 80, 3000)
            )
              err(tag + " frames");
            else
              L.frames.forEach(function (f) {
                sheetOk(L.sheet, f, tag);
              });
          }
          ["front", "backdrop"].forEach(function (k) {
            if (L[k] != null && typeof L[k] !== "boolean") err(tag + " " + k);
          });
          if (L.backdropBottom != null && !isNum(L.backdropBottom, -200, 400))
            err(tag + " backdropBottom");
          if (L.scrollParallax != null && !isNum(L.scrollParallax, 0, 2))
            err(tag + " scrollParallax");
          // a layer may sink below the street line (its foot hidden by the street) to free the sky
          if (!isNum(L.parallax, 0, 2) || !isNum(L.bottom || 0, -200, 400))
            err(tag + " geometry");
          if (L.drift != null && !isNum(L.drift, -60, 60)) err(tag + " drift");
          (L.lamps || []).forEach(function (lp) {
            if (!isNum(lp.x, 0, 4096) || !isNum(lp.head, 0, 4096))
              err(tag + " lamp");
          });
        });
        var em = sc.emitters || {};
        if (!exactKeys(em, ["clouds", "birds", "stars"]))
          err("emitters fields");
        function pair(v, lo, hi) {
          return (
            Array.isArray(v) &&
            v.length === 2 &&
            isNum(v[0], lo, hi) &&
            isNum(v[1], v[0], hi)
          );
        }
        ["clouds", "birds"].forEach(function (key) {
          var e = em[key];
          if (!e) return;
          if (
            !exactKeys(
              e,
              key === "clouds"
                ? ["sheet", "frames", "count", "y", "speed", "lighting"]
                : ["sheet", "frames", "lighting", "every", "y", "speed"],
            ) ||
            !Array.isArray(e.frames) ||
            !e.frames.length ||
            e.frames.length > 32 ||
            !pair(e.y, 0, 400) ||
            (e.lighting != null &&
              (!Array.isArray(e.lighting) ||
                !e.lighting.length ||
                !e.lighting.every(function (l) {
                  return LIGHTINGS.indexOf(l) >= 0;
                })))
          )
            err(key + " fields");
          if (key === "clouds" && !pair(e.speed, -60, 60)) err(key + " speed");
          if (
            key === "birds" &&
            (!Array.isArray(e.lighting) ||
              !e.lighting.length ||
              !pair(e.every, 1000, 600000) ||
              !isNum(e.speed, 1, 120))
          )
            err(key + " timing");
        });
        if (
          em.stars &&
          (!exactKeys(em.stars, ["count", "band"]) ||
            (em.stars.band != null && !isNum(em.stars.band, 0, 1)))
        )
          err("stars fields");
        if (em.clouds) {
          em.clouds.frames.forEach(function (f) {
            sheetOk(em.clouds.sheet, f, "clouds");
          });
          if (!isNum(em.clouds.count, 0, 40)) err("clouds count");
        }
        if (em.birds) {
          em.birds.frames.forEach(function (f) {
            sheetOk(em.birds.sheet, f, "birds");
          });
        }
        if (em.stars && !isNum(em.stars.count, 0, 400)) err("stars count");
        (sc.walkers || []).forEach(function (w, i) {
          var a = ref(manifest.actors, w.actor) && manifest.actors[w.actor];
          var frames = (w.frames || []).concat(w.rest ? [w.rest] : []);
          if (
            !a ||
            !frames.length ||
            !frames.every(function (f) {
              return sheetsOf(a.sheet).every(function (s) {
                return ref(atlases, s) && ref(atlases[s].frames, f);
              });
            })
          )
            err("walker " + i);
          if (
            !isNum(w.speed, 1, 120) ||
            !Array.isArray(w.every) ||
            !isNum(w.every[0], 1000, 600000) ||
            !isNum(w.every[1], w.every[0], 600000)
          )
            err("walker " + i + " timing");
        });
      }
    }
    validateScenery(manifest.scenery);
    Object.keys(manifest.surfaces || {}).forEach(function (key) {
      var override = manifest.surfaces[key] && manifest.surfaces[key].scenery;
      if (override == null) return;
      if (
        !plainObject(override) ||
        Object.keys(override).some(function (k) {
          return (
            [
              "layers",
              "emitters",
              "celestial",
              "lighting",
              "titleVeil",
              "curb",
            ].indexOf(k) < 0
          );
        })
      )
        err("surface scenery " + key);
      else validateScenery(Object.assign({}, manifest.scenery, override));
    });
    var actors = manifest.actors || {};
    Object.keys(actors).forEach(function (id) {
      var a = actors[id];
      if (
        !isName(id) ||
        !a ||
        !sheetsOf(a.sheet).length ||
        !sheetsOf(a.sheet).every(function (s) {
          return ref(atlases, s);
        })
      ) {
        err("actor " + id);
        return;
      }
      if (a.fictional !== true && !a.prototypeRef)
        err(
          "actor " + id + " must be fictional or reference a CHARACTERS card",
        );
      if (a.names && !localized(a.names)) err("actor " + id + " names");
      if (a.lines && !localizedList(a.lines)) err("actor " + id + " lines");
    });
    function frameOk(actor, frame) {
      var a = ref(actors, actor) && actors[actor];
      return (
        !!a &&
        sheetsOf(a.sheet).length > 0 &&
        sheetsOf(a.sheet).every(function (s) {
          return !!atlasFrame(atlas, s, frame);
        })
      );
    }
    var parties = manifest.parties || {};
    Object.keys(parties).forEach(function (id) {
      var pt = parties[id];
      if (
        !isName(id) ||
        !pt ||
        !isColor(pt.color) ||
        !isColor(pt.ink) ||
        !isPlainText(pt.mark) ||
        !/[\u05d0-\u05ea]/.test(pt.speak || "") ||
        !localized(pt.names) ||
        !localized(pt.says) ||
        (pt.slogan && !localized(pt.slogan)) ||
        (pt.short && !localized(pt.short))
      )
        err("party " + id);
    });
    var locs = manifest.locations || {};
    Object.keys(locs).forEach(function (id) {
      var L = locs[id];
      if (
        !isName(id) ||
        !L ||
        (L.phase != null && PHASES.indexOf(L.phase) < 0) ||
        !isNum(L.x, -100000, 100000)
      ) {
        err("location " + id);
        return;
      }
      if (!localized(L.names)) err("location " + id + " names");
      if (L.lighting && LIGHTINGS.indexOf(L.lighting) < 0)
        err("location " + id + " lighting");
      if (L.sign) {
        var sg = L.sign;
        if (
          !isPlainText(sg.he) ||
          !/[\u05d0-\u05ea]/.test(sg.he) ||
          !isPlainText(sg.translit) ||
          !localized(sg.gloss) ||
          !isNum(sg.x, -400, 400)
        )
          err("location " + id + " sign");
      }
      (L.props || []).forEach(function (p) {
        if (
          !frameOk(p.actor, p.frame) ||
          !isNum(p.x, -1000, 1000) ||
          (p.y != null && !isNum(p.y, 0, 400)) ||
          (p.z != null && !isNum(p.z, 0, 100)) ||
          (p.ground != null && !isNum(p.ground, 0, 400))
        )
          err("location " + id + " prop " + p.actor);
      });
      (L.posters || []).forEach(function (po) {
        if (
          !ref(parties, po.party) ||
          !isNum(po.x, -400, 400) ||
          !isNum(po.y || 0, 0, 200)
        )
          err("location " + id + " poster");
      });
      if (L.quip && !localized(L.quip)) err("location " + id + " quip");
      if (L.icon && !ref(atlases, L.icon)) err("location " + id + " icon");
      (L.fx || []).forEach(function (fx) {
        if (
          ["papers", "searchlights", "tally", "chalk", "debate"].indexOf(
            fx.kind,
          ) < 0
        )
          err("location " + id + " fx kind");
        if (fx.stamp && !localized(fx.stamp))
          err("location " + id + " fx stamp");
        if (fx.tieLines && !localizedList(fx.tieLines))
          err("location " + id + " fx tieLines");
        if (fx.screen && !isColor(fx.screen))
          err("location " + id + " fx screen");
        (fx.cast || []).forEach(function (cst) {
          if (
            !(cst.frames || []).every(function (f) {
              return frameOk(cst.actor, f);
            })
          )
            err("location " + id + " fx cast");
        });
        (fx.parties || []).forEach(function (p) {
          if (!ref(parties, p)) err("location " + id + " fx party " + p);
        });
        if (fx.color != null && !isColor(fx.color))
          err("location " + id + " fx color");
      });
    });
    var slots = manifest.slots || {};
    Object.keys(manifest.surfaces || {}).forEach(function (k) {
      var su = manifest.surfaces[k];
      if (
        !su ||
        !ref(slots, su.slot) ||
        (su.location && !ref(locs, su.location))
      )
        err("surface " + k);
      if (su && su.react && !frameOk(su.react.actor, su.react.frame))
        err("surface " + k + " react");
    });
    Object.keys(slots).forEach(function (slot) {
      if (SLOTS.indexOf(slot) < 0) {
        err("slot not allowed: " + slot);
        return;
      }
      var s = slots[slot];
      if (!isNum(s.origin, 0, 1)) err("slot " + slot + " origin");
      (s.rest || []).forEach(function (r) {
        var fr = r.frames || [r.frame];
        if (
          !fr.every(function (f) {
            return frameOk(r.actor, f);
          }) ||
          !isNum(r.x, -400, 400) ||
          (r.y != null && !isNum(r.y, 0, 200))
        )
          err("slot " + slot + " rest " + r.actor);
      });
    });
    var ids = {};
    (manifest.scenes || []).forEach(function (s) {
      var tag = "scene " + (s && s.id);
      if (!s || !isName(s.id) || ids[s.id]) {
        err(tag + " id");
        return;
      }
      ids[s.id] = true;
      if (!ref(slots, s.slot)) err(tag + " slot");
      if (typeof s.trigger !== "string" || !TRIGGER_RE.test(s.trigger))
        err(tag + " trigger");
      if (s.location && !ref(locs, s.location)) err(tag + " location");
      var cap =
        s.trigger === "manual"
          ? BUDGET.maxManualDurationMs
          : BUDGET.maxDurationMs;
      if (!(s.durationMs > 0 && s.durationMs <= cap)) err(tag + " duration");
      if (!localized(s.title) || !localized(s.caption)) err(tag + " text");
      if (s.expires && !/^\d{4}-\d{2}-\d{2}$/.test(s.expires))
        err(tag + " expires");
      if (
        s.modes &&
        !s.modes.every(function (m) {
          return MODES.indexOf(m) >= 0;
        })
      )
        err(tag + " modes");
      (s.tracks || []).forEach(function (tr) {
        if (!ref(actors, tr.actor)) {
          err(tag + " actor " + tr.actor);
          return;
        }
        var last = -1;
        (tr.keys || []).forEach(function (k) {
          if (!(k.t >= last && k.t <= s.durationMs))
            err(tag + " key order " + tr.actor);
          last = k.t;
          if (k.frame && !frameOk(tr.actor, k.frame))
            err(tag + " frame " + tr.actor + "." + k.frame);
          (k.cycle || []).forEach(function (f) {
            if (!frameOk(tr.actor, f)) err(tag + " cycle " + f);
          });
        });
      });
      if (
        !s.staticPose ||
        !(s.staticPose || []).every(function (r) {
          return frameOk(r.actor, r.frame);
        })
      )
        err(tag + " staticPose");
    });
    if (extended) validateCharacters(manifest, atlas, errors);
    return { ok: errors.length === 0, errors: errors };
  }
  // All malformed JSON fails closed, including structurally invalid legacy optional fields.
  function validatePack(manifest, atlas, expectedId) {
    try {
      return validatePackInner(manifest, atlas, expectedId);
    } catch (_) {
      return { ok: false, errors: ["malformed pack structure"] };
    }
  }
  function plainObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }
  function exactKeys(v, allowed) {
    return (
      plainObject(v) &&
      Object.keys(v).every(function (k) {
        return allowed.indexOf(k) >= 0;
      })
    );
  }
  function integer(v, lo, hi) {
    return isNum(v, lo, hi) && Math.floor(v) === v;
  }
  function validateCharacters(m, atlas, errors) {
    function err(s) {
      errors.push("character " + s);
    }
    function txt(v) {
      return exactKeys(v, LOCALES) && localized(v);
    }
    function frames(a, value) {
      return (
        Array.isArray(value) &&
        value.length >= 1 &&
        value.length <= 16 &&
        value.every(function (f) {
          return (
            isName(f) &&
            a &&
            sheetsOf(a.sheet).length > 0 &&
            sheetsOf(a.sheet).every(function (sh) {
              return !!atlasFrame(atlas, sh, f);
            })
          );
        })
      );
    }
    function placement(v) {
      return (
        exactKeys(v, ["x", "y", "z", "flip", "idleState", "reactionIds"]) &&
        integer(v.x, -400, 400) &&
        (v.y == null || integer(v.y, 0, 200)) &&
        (v.z == null || integer(v.z, 0, 20)) &&
        (v.flip == null || typeof v.flip === "boolean")
      );
    }
    var chars = m.characters;
    if (
      !plainObject(chars) ||
      !Object.keys(chars).length ||
      Object.keys(chars).length > 24
    ) {
      err("map");
      return;
    }
    Object.keys(chars).forEach(function (id) {
      var c = chars[id],
        tag = id + " ";
      if (
        !isName(id) ||
        id === "timsah" ||
        !exactKeys(c, [
          "actor",
          "names",
          "location",
          "x",
          "y",
          "z",
          "flip",
          "placements",
          "initialState",
          "states",
          "hitRegion",
          "bubbleAnchor",
          "reactions",
        ])
      ) {
        err(tag + "fields");
        return;
      }
      var a = ref(m.actors, c.actor) && m.actors[c.actor];
      if (!a || !txt(c.names)) err(tag + "identity");
      if (c.placements != null) {
        if (
          ["location", "x", "y", "z", "flip"].some(function (k) {
            return c[k] != null;
          }) ||
          !plainObject(c.placements) ||
          !Object.keys(c.placements).length ||
          Object.keys(c.placements).length > 32
        )
          err(tag + "placements");
        else
          Object.keys(c.placements).forEach(function (loc) {
            if (!ref(m.locations, loc) || !placement(c.placements[loc]))
              err(tag + "placement " + loc);
          });
      } else if (
        !ref(m.locations, c.location) ||
        !placement({ x: c.x, y: c.y, z: c.z, flip: c.flip })
      )
        err(tag + "placement");
      var h = c.hitRegion;
      if (
        !exactKeys(h, ["x", "y", "w", "h"]) ||
        !integer(h.x, -128, 128) ||
        !integer(h.y, 0, 256) ||
        !integer(h.w, 1, 128) ||
        !integer(h.h, 1, 128)
      )
        err(tag + "hitRegion");
      if (
        !Array.isArray(c.bubbleAnchor) ||
        c.bubbleAnchor.length !== 2 ||
        !c.bubbleAnchor.every(function (n) {
          return integer(n, -128, 256);
        })
      )
        err(tag + "bubbleAnchor");
      var states = c.states;
      if (
        !plainObject(states) ||
        !Object.keys(states).length ||
        Object.keys(states).length > 12 ||
        !isName(c.initialState) ||
        !ref(states, c.initialState)
      ) {
        err(tag + "states");
        return;
      }
      Object.keys(states).forEach(function (k) {
        var st = states[k];
        if (
          !isName(k) ||
          !exactKeys(st, ["frames", "frameMs", "next"]) ||
          !frames(a, st.frames) ||
          !integer(st.frameMs, 80, 3000)
        )
          err(tag + "state " + k);
        if (
          st &&
          st.next != null &&
          (!isName(st.next) ||
            !ref(states, st.next) ||
            states[st.next].next != null)
        )
          err(tag + "transition " + k);
      });
      if (
        !Array.isArray(c.reactions) ||
        !c.reactions.length ||
        c.reactions.length > 8
      ) {
        err(tag + "reactions");
        return;
      }
      var ids = {};
      c.reactions.forEach(function (r) {
        if (
          !exactKeys(r, ["id", "state", "durationMs", "lines", "timsah"]) ||
          !isName(r.id) ||
          ids[r.id] ||
          !ref(states, r.state) ||
          !integer(r.durationMs, 300, 3000)
        ) {
          err(tag + "reaction");
          return;
        }
        ids[r.id] = true;
        if (
          !exactKeys(r.lines, LOCALES) ||
          !localizedList(r.lines) ||
          r.lines.ru.length > 8 ||
          !LOCALES.every(function (l) {
            return r.lines[l].length === r.lines.ru.length;
          })
        )
          err(tag + "reaction lines");
        if (
          r.timsah != null &&
          (!exactKeys(r.timsah, ["frames", "frameMs", "lines"]) ||
            !frames(m.actors.timsah, r.timsah.frames) ||
            !integer(r.timsah.frameMs, 80, 3000) ||
            (r.timsah.lines != null && !txt(r.timsah.lines)))
        )
          err(tag + "Timsah reaction");
      });
      Object.keys(c.placements || {}).forEach(function (loc) {
        var pl = c.placements[loc];
        if (
          pl.idleState != null &&
          (!isName(pl.idleState) || !ref(states, pl.idleState))
        )
          err(tag + "placement idleState");
        if (
          pl.reactionIds != null &&
          (!Array.isArray(pl.reactionIds) ||
            !pl.reactionIds.length ||
            pl.reactionIds.length > 8 ||
            pl.reactionIds.some(function (rid, i) {
              return (
                !isName(rid) ||
                !ref(ids, rid) ||
                pl.reactionIds.indexOf(rid) !== i
              );
            }))
        )
          err(tag + "placement reactionIds");
      });
    });
  }
  function sampleCharacterState(character, stateId, elapsed, still) {
    var st = character.states[stateId],
      t = Math.max(0, elapsed);
    if (!still && st.next && t >= st.frames.length * st.frameMs) {
      t -= st.frames.length * st.frameMs;
      st = character.states[st.next];
    }
    return st.frames[still ? 0 : Math.floor(t / st.frameMs) % st.frames.length];
  }
  function characterPlacement(character, location) {
    return character.placements
      ? character.placements[location]
      : character.location === location
        ? character
        : null;
  }

  // Scene timeline sampling: steps for frames, linear for x/y, visibility via `hidden`.
  function sampleTrack(track, t) {
    var keys = track.keys || [];
    if (!keys.length) return null;
    var i = 0;
    while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
    var k = keys[i],
      n = keys[i + 1];
    var frame = k.frame,
      x = k.x,
      y = k.y || 0,
      hidden = !!k.hidden;
    if (k.cycle && k.cycle.length)
      frame =
        k.cycle[Math.floor((t - k.t) / (k.cycleMs || 160)) % k.cycle.length];
    if (n && !k.hold && t >= k.t) {
      var p = (t - k.t) / Math.max(1, n.t - k.t);
      if (typeof n.x === "number" && typeof x === "number")
        x = x + (n.x - x) * p;
      y = y + ((n.y || 0) - y) * p;
      if (typeof k.arc === "number") y += k.arc * 4 * p * (1 - p);
    }
    return {
      actor: track.actor,
      frame: frame,
      x: Math.round(x),
      y: Math.round(y),
      hidden: hidden,
      flip: !!k.flip,
    };
  }
  function sampleScene(scene, t) {
    return (scene.tracks || [])
      .map(function (tr) {
        return sampleTrack(tr, t);
      })
      .filter(Boolean);
  }

  function sceneActive(scene, mode, todayIso) {
    if (scene.expires && todayIso > scene.expires) return false;
    if (scene.modes && scene.modes.indexOf(mode) < 0) return false;
    return true;
  }

  // Journey between two locations: walk duration and a synthetic walking track.
  function journey(fromX, toX, cycle) {
    var dx = toX - fromX;
    var ms = Math.max(600, Math.min(1200, Math.abs(dx) * 1.2));
    return {
      ms: ms,
      track: {
        actor: "timsah",
        keys: [
          {
            t: 0,
            cycle: cycle || ["walk-a", "walk-b"],
            cycleMs: 110,
            x: fromX,
            flip: dx < 0,
          },
          { t: ms, frame: "idle", x: toX, hold: true },
        ],
      },
    };
  }

  function locationForPhase(manifest, phase) {
    var locs = manifest.locations || {};
    var ids = Object.keys(locs);
    for (var i = 0; i < ids.length; i++)
      if (locs[ids[i]].phase === phase) return ids[i];
    // "correct" shares the table stop; anything unknown starts at the first location.
    if (phase === "correct") return locationForPhase(manifest, "table");
    return ids[0] || null;
  }

  // Budget governor. Late events are dropped, never queued. Kinds:
  //   auto    — spontaneous reactions (table ready …): cooldown + per-session cap;
  //   story   — the payoff of a user's own step (arriving at the polling station): no budget,
  //             but still never while paused, hidden or under reduced motion;
  //   ambient — background life in live mode: no budget, yields to everything else;
  //   manual  — the user asked (gallery / picker preview): only a hidden page stops it.
  function createGovernor(budget) {
    var b = Object.assign({}, BUDGET, budget || {});
    var autoCount = 0,
      lastEndAt = -Infinity,
      playing = false;
    return {
      request: function (kind, now, ctx) {
        ctx = ctx || {};
        if (playing) return { play: false, reason: "busy-scene" };
        if (ctx.hidden) return { play: false, reason: "hidden" };
        if (kind !== "manual") {
          if (ctx.reducedMotion)
            return { play: false, reason: "reduced-motion" };
          if (ctx.paused) return { play: false, reason: "paused" };
        }
        if (kind === "auto" || kind === "ambient") {
          if (ctx.busy) return { play: false, reason: ctx.busy };
        }
        if (kind === "auto") {
          if (autoCount >= b.maxAutoPerSession)
            return { play: false, reason: "session-cap" };
          if (now - lastEndAt < b.cooldownMs)
            return { play: false, reason: "cooldown" };
        }
        return { play: true };
      },
      started: function (kind) {
        playing = true;
        if (kind === "auto") autoCount++;
      },
      ended: function (now, kind) {
        playing = false;
        if (kind === "auto") lastEndAt = now;
      },
      state: function () {
        return { autoCount: autoCount, playing: playing, lastEndAt: lastEndAt };
      },
    };
  }

  var core = {
    ENGINE_VERSION: ENGINE_VERSION,
    ENGINE_BUILD: ENGINE_BUILD,
    CATEGORIES: CATEGORIES,
    CAPABILITIES: CAPABILITIES,
    sampleCharacterState: sampleCharacterState,
    characterPlacement: characterPlacement,
    STORAGE_KEY: STORAGE_KEY,
    REGISTRY: REGISTRY,
    BUDGET: BUDGET,
    DEFAULT_WORLD: DEFAULT_WORLD,
    CLASSIC: CLASSIC,
    COLOR_TOKENS: COLOR_TOKENS,
    SLOTS: SLOTS,
    TRIGGER_RE: TRIGGER_RE,
    PHASES: PHASES,
    readChoice: readChoice,
    validatePack: validatePack,
    sampleScene: sampleScene,
    sampleTrack: sampleTrack,
    sceneActive: sceneActive,
    createGovernor: createGovernor,
    journey: journey,
    locationForPhase: locationForPhase,
  };
  if (typeof document === "undefined") return { core: core };

  // ── DOM layer ──────────────────────────────────────────────────────────────

  var state = {
    choice: null,
    pack: null,
    atlas: null,
    base: "",
    images: {},
    loadEpoch: 0,
    lightEpoch: 0,
    governor: createGovernor(),
    stage: null,
    backdrop: null,
    raf: 0,
    lastFrame: 0,
    listeners: [],
    observers: [],
    styleEl: null,
    linkEl: null,
    location: null,
    walk: null,
    scene: null,
    staticPose: null,
    react: null,
    bubble: null,
    nextAmbient: 0,
    visible: true,
    walkers: [],
    walkerNext: [],
    characterReaction: null,
    characterTurns: {},
    characterTime: 0,
    stillTime: 0,
    bubbleCharacter: null,
  };

  var UI_TEXT = {
    "world.signListen": {
      ru: "Послушать",
      en: "Listen",
      he: "האזנה",
    },
    "world.routeLabel": {
      ru: "Маршрут выборов",
      en: "Election route",
      he: "מסלול הבחירות",
    },
    "world.resume": {
      ru: "Оживить мир",
      en: "Resume world",
      he: "המשך תנועה",
    },
    "world.pause": {
      ru: "Остановить мир",
      en: "Pause world",
      he: "השהה תנועה",
    },
    "world.pickerTitle": {
      ru: "Оформление",
      en: "Appearance",
      he: "מראה",
    },
    "world.pickerLead": {
      ru: "Выберите мир. Учебные материалы останутся прежними.",
      en: "Choose a world. Your learning materials stay the same.",
      he: "בחרו עולם. חומרי הלימוד נשארים כפי שהם.",
    },
    "world.classic": {
      ru: "LinguistPro Classic",
      en: "LinguistPro Classic",
      he: "LinguistPro Classic",
    },
    "world.classicNote": {
      ru: "Без декоративного мира",
      en: "Without decorative scenery",
      he: "ללא תפאורה",
    },
    "world.modeLegend": {
      ru: "Движение",
      en: "Motion",
      he: "תנועה",
    },
    "world.modeLive": {
      ru: "Живой",
      en: "Live",
      he: "חי",
    },
    "world.modeCalm": {
      ru: "Спокойный",
      en: "Calm",
      he: "רגוע",
    },
    "world.lightLegend": {
      ru: "Освещение",
      en: "Lighting",
      he: "תאורה",
    },
    "world.lightAuto": {
      ru: "По времени суток",
      en: "Time of day",
      he: "לפי השעה",
    },
    "world.lightDay": {
      ru: "День",
      en: "Day",
      he: "יום",
    },
    "world.lightDusk": {
      ru: "Закат",
      en: "Dusk",
      he: "דמדומים",
    },
    "world.lightNight": {
      ru: "Ночь",
      en: "Night",
      he: "לילה",
    },
    "world.privacy": {
      ru: "Выбор мира хранится только на этом устройстве.",
      en: "Your world choice is stored only on this device.",
      he: "בחירת העולם נשמרת רק במכשיר הזה.",
    },
    "world.preview": {
      ru: "Показать сценку",
      en: "Preview scene",
      he: "תצוגה מקדימה",
    },
    "world.done": {
      ru: "Готово",
      en: "Done",
      he: "סיום",
    },
    "world.talkTo": {
      ru: "Поговорить: ",
      en: "Talk to: ",
      he: "שיחה עם: ",
    },
    "world.characters": {
      ru: "Персонажи",
      en: "Characters",
      he: "דמויות",
    },
    "world.elections.note": {
      ru: "Вымышленная языковая сатира: улица, штаб и ночь подсчёта.",
      en: "Fictional language satire: streets, headquarters and counting night.",
      he: "סאטירה לשונית בדיונית: רחובות, מטה וליל הספירה.",
    },
    "world.satireBadge": {
      ru: "Сатира",
      en: "Satire",
      he: "סאטירה",
    },
  };
  function tr(key, fallback) {
    try {
      var v = window.t ? window.t(key) : null;
      if (v && v !== key) return v;
    } catch (_) {}
    return UI_TEXT[key] ? UI_TEXT[key][locale()] : fallback || key;
  }
  function locale() {
    var l = (document.documentElement.getAttribute("lang") || "ru").slice(0, 2);
    return LOCALES.indexOf(l) >= 0 ? l : "ru";
  }
  function storageGet() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }
  function storageSet(v) {
    try {
      var out = v
        ? {
            id: v.id,
            mode: v.mode,
            paused: !!v.paused,
            lighting: v.lighting || "auto",
          }
        : { id: CLASSIC };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch (_) {}
  }
  function reducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }
  function today() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }
  function now() {
    return performance.now();
  }

  // Why an automatic reaction must not start now. Reads states only — never content.
  function busyReason() {
    var a = document.activeElement;
    if (
      a &&
      (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) &&
      !a.closest("[data-world-ui]")
    )
      return "typing";
    var dialogs = document.querySelectorAll(
      "dialog[open], [aria-modal='true'], .v3-modal[data-open='1']",
    );
    for (var j = 0; j < dialogs.length; j++)
      if (
        dialogs[j].offsetParent !== null &&
        !dialogs[j].hasAttribute("data-world-ui")
      )
        return "dialog";
    return null;
  }

  function packedAssetUrl(base, file, version) {
    var url = base + file + "?v=" + encodeURIComponent(version);
    return url;
  }
  function assetUrl(file) {
    return packedAssetUrl(state.base, file, state.pack.version);
  }

  // ── skin ──
  function applySkin() {
    var decl = [];
    ["light", "dark"].forEach(function (mode) {
      var skin = state.pack.skin[mode];
      Object.keys(skin).forEach(function (k) {
        decl.push(
          "--lpw-" +
            mode +
            "-" +
            k.replace(/[A-Z]/g, function (c) {
              return "-" + c.toLowerCase();
            }) +
            ":" +
            skin[k],
        );
      });
    });
    decl.push(
      "--lpw-scene-h:" + state.pack.scenery.sceneHeight,
      "--lpw-ground:" + state.pack.scenery.groundY,
    );
    // pixel UI pieces of the pack (validated atlas refs only) → CSS url() tokens
    Object.keys(state.pack.ui || {}).forEach(function (k) {
      var a = state.atlas.atlases[state.pack.ui[k]];
      decl.push(
        "--lpw-ui-" +
          k.replace(/[A-Z]/g, function (c) {
            return "-" + c.toLowerCase();
          }) +
          ':url("' +
          assetUrl(a.file) +
          '")',
      );
    });
    if (!state.styleEl) {
      state.styleEl = document.createElement("style");
      state.styleEl.setAttribute("data-world-ui", "");
      document.head.appendChild(state.styleEl);
    }
    state.styleEl.textContent = "html[data-world]{" + decl.join(";") + "}";
    ensureCss();
    document.documentElement.setAttribute("data-world", state.pack.id);
  }
  // The mapping stylesheet is requested only when a world turns on or the picker opens. Once
  // loaded it stays: every world rule is scoped to html[data-world], so it is inert under Classic.
  function ensureCss() {
    if (state.linkEl) return;
    state.linkEl = document.createElement("link");
    state.linkEl.rel = "stylesheet";
    state.linkEl.href = CSS_URL;
    state.linkEl.setAttribute("data-world-ui", "");
    document.head.appendChild(state.linkEl);
  }
  function clearSkin() {
    document.documentElement.removeAttribute("data-world");
    if (state.styleEl) {
      state.styleEl.remove();
      state.styleEl = null;
    }
  }

  // ── loading ──
  function loadScript(src) {
    if (window.LPWorldRender) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.setAttribute("data-world-ui", "");
      s.onload = function () {
        window.LPWorldRender
          ? resolve()
          : reject(new Error("renderer missing"));
      };
      s.onerror = function () {
        reject(new Error("renderer load failed"));
      };
      document.head.appendChild(s);
    });
  }
  function loadImage(file) {
    var epoch = state.loadEpoch,
      images = state.images;
    if (state.images[file]) return Promise.resolve(state.images[file]);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = "async";
      img.onload = function () {
        if (epoch === state.loadEpoch) images[file] = img;
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("image " + file));
      };
      img.src = assetUrl(file);
    });
  }
  // Only the sheets the current lighting needs are fetched (plus actors); others load on switch.
  function sheetsForLighting(lighting) {
    var p = state.pack,
      sc = activeScenery(),
      set = {};
    function add(spec) {
      if (!spec) return;
      var s =
        typeof spec === "string"
          ? spec
          : spec[lighting] || spec.dusk || spec.day || spec.night;
      if (s) set[s] = true;
    }
    (sc.layers || []).forEach(function (L) {
      add(L.sheet);
    });
    if (sc.celestial && sc.celestial[lighting])
      add(sc.celestial[lighting].sheet);
    var em = sc.emitters || {};
    if (em.clouds) add(em.clouds.sheet);
    if (em.birds && em.birds.lighting.indexOf(lighting) >= 0)
      add(em.birds.sheet);
    Object.keys(p.actors).forEach(function (a) {
      add(p.actors[a].sheet);
    });
    return Object.keys(set).map(function (s) {
      return state.atlas.atlases[s].file;
    });
  }
  function loadLighting(lighting) {
    return Promise.all(sheetsForLighting(lighting).map(loadImage));
  }

  // A location may force its lighting (counting night); a dark app theme means election night;
  // otherwise the learner's local clock picks day / dusk / night.
  // Order: a story location that must be lit its way (counting night) → the learner's own choice
  // (day / dusk / night) → a dark app theme means election night → the local clock.
  function currentLighting() {
    if (state.pack && state.pack.profile === ILLUSTRATED_PROFILE) {
      if (state.choice && LIGHTINGS.indexOf(state.choice.lighting) >= 0)
        return state.choice.lighting;
      if (document.body && document.body.classList.contains("theme-dark"))
        return "night";
      var hour = new Date().getHours();
      return hour >= 7 && hour < 17
        ? "day"
        : hour >= 17 && hour < 19
          ? "dusk"
          : "night";
    }
    var loc = state.location && state.pack.locations[state.location];
    var forced = loc && loc.lighting;
    var own = state.choice && state.choice.lighting;
    if (!forced && own && own !== "auto") forced = own;
    if (
      !forced &&
      document.body &&
      document.body.classList.contains("theme-dark")
    )
      forced = "night";
    return window.LPWorldRender.core.lightingFor(new Date().getHours(), forced);
  }

  // ── stage geometry: full-bleed behind the Studio head, from the page top to the street band ──
  function layoutStage() {
    var st = state.stage;
    if (!st) return;
    var host = st.el.parentElement;
    var hr = host.getBoundingClientRect();
    // The app may declare a nearer bottom edge (the street band under the title): everything
    // after it in the head (e.g. the Studio tools panel) sits below the world, never over it.
    var bottom = hr.bottom;
    var untilSel = st.el.getAttribute("data-world-bottom");
    if (untilSel) {
      var until = host.querySelector(untilSel);
      if (until) bottom = until.getBoundingClientRect().bottom;
    }
    var docW = document.documentElement.clientWidth;
    var top = hr.top + window.scrollY; // head top in page coordinates
    var height = bottom - hr.top + top;
    st.el.style.left = -hr.left + "px";
    st.el.style.top = -top + "px";
    st.el.style.width = docW + "px";
    st.el.style.height = height + "px";
    var scale = stageScale(st.el);
    st.scale = scale;
    st.renderer.resize(docW, height, scale);
    st.originPx = Math.round(docW * state.pack.slots[state.slotName].origin);
    if (state.backdrop)
      state.backdrop.renderer.resize(docW, window.innerHeight, scale);
    if (state.location && !state.walk)
      st.renderer.panTo(cameraFor(locX()), 0, now());
    drawOnce();
  }
  function stageScale(el) {
    var v = parseInt(getComputedStyle(el).getPropertyValue("--lpw-scale"), 10);
    return v >= 1 && v <= 6 ? v : DEFAULT_SCALE;
  }

  // ── actors & camera ──
  function locX() {
    var L = state.pack.locations[state.location];
    return L ? L.x : 0;
  }
  function cameraFor(worldX) {
    var st = state.stage;
    return worldX - Math.round(st ? st.originPx / st.scale : 60);
  }

  function activeScenery() {
    return Object.assign(
      {},
      state.pack.scenery,
      (state.surface && state.surface.scenery) || {},
    );
  }
  function composeCharacters() {
    var list = [],
      chars = state.pack.characters || {},
      reaction = state.characterReaction;
    Object.keys(chars).forEach(function (id) {
      var c = chars[id],
        pl = characterPlacement(c, state.location);
      if (!pl) return;
      var selected = reaction && reaction.id === id,
        def = selected ? reaction.def : null;
      var elapsed = selected
        ? state.characterTime - reaction.start
        : state.characterTime;
      list.push({
        actor: c.actor,
        characterId: id,
        frame: sampleCharacterState(
          c,
          def ? def.state : pl.idleState || c.initialState,
          elapsed,
          !animating() || !!(selected && reaction.static),
        ),
        worldX: locX() + pl.x,
        y: pl.y || 0,
        z: pl.z == null ? 3 : pl.z,
        flip: !!pl.flip,
        hitRegion: c.hitRegion,
        bubbleAnchor: c.bubbleAnchor,
      });
    });
    return list;
  }
  function composePose(t) {
    var p = state.pack,
      pose = [],
      base = locX();
    var controlled = {};
    if (state.scene) {
      var sc = state.scene;
      var sLoc = sc.def.location ? p.locations[sc.def.location].x : base;
      sampleScene(sc.def, t - sc.start).forEach(function (s, i) {
        var track = sc.def.tracks[i];
        controlled[s.actor] = true;
        pose.push(
          Object.assign({ z: track.z || 1 }, s, { worldX: sLoc + s.x }),
        );
      });
    }
    if (state.walk && !controlled.timsah) {
      var w = state.walk;
      var s2 = sampleTrack(w.track, t - w.start);
      controlled.timsah = true;
      pose.push(Object.assign({ z: 3 }, s2, { worldX: s2.x }));
    }
    if (
      state.characterReaction &&
      state.characterReaction.def.timsah &&
      !controlled.timsah
    ) {
      var cr = state.characterReaction,
        reply = cr.def.timsah;
      controlled.timsah = true;
      pose.push({
        actor: "timsah",
        frame:
          reply.frames[
            !animating() || cr.static
              ? 0
              : Math.floor((state.characterTime - cr.start) / reply.frameMs) %
                reply.frames.length
          ],
        worldX: base,
        y: 0,
        z: 3,
      });
    }
    if (state.react && !controlled.timsah) {
      var r = state.react,
        rt = t - r.start;
      var su = state.surface && state.surface.react;
      controlled.timsah = true;
      if (su)
        pose.push({
          actor: su.actor,
          frame: su.frame,
          worldX: base,
          y: su.y || 0,
          z: 3,
        });
      else {
        var hop =
          animating() && rt < 420
            ? Math.round(8 * 4 * (rt / 420) * (1 - rt / 420))
            : 0;
        pose.push({
          actor: "timsah",
          frame: animating() && rt < 420 ? "jump" : "blink",
          worldX: base,
          y: hop,
          z: 3,
        });
      }
    }
    walkersPose(t).forEach(function (w) {
      pose.push(w);
    });
    // the hero at rest (Timsah in the surface's own pose); hidden while a scene/walk/reaction moves him
    (p.slots[state.slotName].rest || []).forEach(function (r) {
      if (controlled[r.actor] || (r.hero && controlled.timsah)) return;
      var frame = r.frames
        ? r.frames[Math.floor(t / (r.cycleMs || 1200)) % r.frames.length]
        : blinkFrame(r.frame, t);
      pose.push({
        actor: r.actor,
        hero: !!r.hero,
        frame: frame,
        worldX: base + r.x,
        y: r.y || 0,
        z: 3,
      });
    });
    Object.keys(p.locations).forEach(function (id) {
      var L = p.locations[id];
      (L.props || []).forEach(function (pr) {
        if (
          state.scene &&
          state.scene.def.location === id &&
          controlled[pr.actor]
        )
          return;
        pose.push({
          actor: pr.actor,
          frame: pr.frame,
          worldX: L.x + pr.x,
          y: pr.y || 0,
          z: pr.z || 2,
          back: !!pr.back,
          ground: pr.ground,
        });
      });
    });
    pose = pose.concat(composeCharacters());
    if (state.staticPose) {
      var replaced = {};
      state.staticPose.forEach(function (item) {
        replaced[item.actor] = true;
      });
      pose = pose
        .filter(function (item) {
          return (
            !own(replaced, item.actor) ||
            (!!item.characterId && item.characterId !== "timsah")
          );
        })
        .concat(state.staticPose);
    }
    pose.forEach(function (item) {
      if (item.actor === "timsah" || item.hero) {
        item.characterId = "timsah";
        item.hitRegion = { x: -22, y: 46, w: 45, h: 51 };
        item.bubbleAnchor = [0, 49];
      }
    });
    return pose;
  }
  // Street life: neighbours and a cat cross the view now and then (live mode only), in both
  // directions; the cat may sit down halfway. Positions live in world space, so a journey pans
  // past them naturally. Never while paused / reduced motion (the loop does not run then).
  function walkersPose(t) {
    var defs = state.pack.scenery.walkers || [];
    var st = state.stage;
    if (!st || !defs.length || !(state.choice && state.choice.mode === "live"))
      return [];
    var cam = st.renderer.camera(),
      viewW = st.renderer.size().w;
    defs.forEach(function (d, i) {
      if (state.walkerNext[i] == null)
        state.walkerNext[i] =
          t + d.every[0] * (0.3 + (0.7 * ((i * 7919) % 97)) / 97);
      var busy = state.walkers.some(function (w) {
        return w.def === i;
      });
      if (!busy && t > state.walkerNext[i]) {
        // enter from the right, never walk through Timsah (they turn back before reaching him)
        var rightward = false;
        var sits =
          d.rest && ((Math.floor(t) >> 3) % 100) / 100 < (d.sitChance || 0);
        state.walkers.push({
          def: i,
          x: rightward ? cam - 24 : cam + viewW + 24,
          dir: rightward ? 1 : -1,
          start: t,
          last: t,
          sitAt: sits
            ? cam + viewW * (0.35 + 0.3 * (((Math.floor(t) >> 5) % 10) / 10))
            : null,
          sitUntil: 0,
        });
      }
    });
    var out = [];
    state.walkers = state.walkers.filter(function (w) {
      var d = defs[w.def],
        dt = Math.min(100, t - w.last);
      w.last = t;
      var frame;
      if (w.sitUntil && t < w.sitUntil) frame = d.rest;
      else {
        var keepOut = locX() + 30;
        if (w.dir < 0 && w.x <= keepOut) {
          w.dir = 1;
          w.sitAt = null;
        }
        if (w.sitAt != null && w.sitAt <= keepOut) w.sitAt = null;
        if (w.sitAt != null && (w.dir > 0 ? w.x >= w.sitAt : w.x <= w.sitAt)) {
          w.sitUntil = t + 2600;
          w.sitAt = null;
          frame = d.rest;
        } else {
          w.x += (w.dir * d.speed * dt) / 1000;
          frame =
            d.frames[
              Math.floor((t - w.start) / (d.cycleMs || 200)) % d.frames.length
            ];
        }
      }
      var gone = w.dir > 0 ? w.x > cam + viewW + 40 : w.x < cam - 40;
      if (gone) {
        state.walkerNext[w.def] =
          t +
          d.every[0] +
          (d.every[1] - d.every[0]) * (((Math.floor(t) >> 6) % 17) / 17);
        return false;
      }
      out.push({
        actor: d.actor,
        frame: frame,
        worldX: w.x,
        y: 0,
        lane: d.lane || 0,
        z: 1,
        flip: w.dir < 0,
      });
      return true;
    });
    return out;
  }

  // Idle life: a blink every few seconds, deterministic so screenshots are reproducible.
  function blinkFrame(frame, t) {
    return frame === "idle" && t % 4200 < 160 ? "blink" : frame;
  }

  // ── ticker ──
  function animating() {
    return (
      !!state.pack &&
      !document.hidden &&
      !(state.choice && state.choice.paused) &&
      !reducedMotion()
    );
  }
  function renderFrame(t, dt) {
    var st = state.stage;
    if (animating()) {
      state.characterTime += Math.max(0, dt);
      state.stillTime = t;
    }
    if (
      state.characterReaction &&
      !state.characterReaction.static &&
      state.characterTime - state.characterReaction.start >=
        state.characterReaction.def.durationMs
    ) {
      state.characterReaction = null;
      hideBubble();
    }
    if (state.walk) {
      var w = state.walk,
        wt = t - w.start;
      st &&
        st.renderer.panTo(
          cameraFor(sampleTrack(w.track, Math.min(wt, w.ms)).x),
          0,
          t,
        );
      if (wt >= w.ms) {
        state.walk = null;
        onArrive(w.to);
      }
    }
    if (state.scene && t - state.scene.start >= state.scene.def.durationMs)
      endScene();
    if (state.react && !state.react.static && t - state.react.start > 3200) {
      state.react = null;
      hideBubble();
    }
    if (st && state.visible) {
      st.renderer.setPose(composePose(t));
      st.renderer.render("stage", t, dt);
      syncCharacterControls();
      positionBubble();
      syncSign();
      syncPosters();
      syncBoard();
    }
    if (state.backdrop) {
      state.backdrop.renderer.setScroll(window.scrollY);
      if (st)
        state.backdrop.renderer.panTo(
          st.renderer.camera() + window.scrollY / 6,
          0,
          t,
        );
      state.backdrop.renderer.render("backdrop", t, dt);
    }
    if (
      state.choice &&
      state.choice.mode === "live" &&
      !state.scene &&
      !state.walk &&
      t > state.nextAmbient
    ) {
      state.nextAmbient = t + BUDGET.ambientEveryMs;
      signal("ambient");
    }
  }
  function loop(ts) {
    state.raf = 0;
    if (!animating()) return;
    state.raf = requestAnimationFrame(loop);
    if (ts - state.lastFrame < FRAME_MS) return;
    var dt = state.lastFrame ? Math.min(100, ts - state.lastFrame) : FRAME_MS;
    state.lastFrame = ts;
    renderFrame(ts, dt);
  }
  function kick() {
    if (!state.raf && animating()) {
      state.lastFrame = 0;
      state.raf = requestAnimationFrame(loop);
    }
  }
  function drawOnce() {
    if (!state.pack) return;
    if (animating()) {
      kick();
      return;
    }
    // Still frame (paused / reduced motion / hidden): finish transitions instantly, draw once.
    if (state.walk) {
      var to = state.walk.to;
      state.walk = null;
      onArrive(to, true);
    }
    renderFrame(state.stillTime, 0);
  }

  // ── scenes ──
  // A scene tied to a location only plays there; ambient picks among the stop's own life and the
  // generic street life, rotating so the same bit does not repeat back to back.
  function scenesFor(trigger) {
    var mode = state.choice ? state.choice.mode : "live";
    var list = (state.pack.scenes || []).filter(function (s) {
      return (
        s.trigger === trigger &&
        sceneActive(s, mode, today()) &&
        (!s.location || s.location === state.location) &&
        (!s.surfaces || s.surfaces.indexOf(state.surfaceKey) >= 0)
      );
    });
    if (trigger === "ambient" && list.length > 1) {
      state.ambientTurn = ((state.ambientTurn || 0) + 1) % list.length;
      list = list
        .slice(state.ambientTurn)
        .concat(list.slice(0, state.ambientTurn));
    }
    return list;
  }
  function startScene(def, kind) {
    state.characterReaction = null;
    state.staticPose = null;
    hideBubble();
    if (state.scene) return { played: false, reason: "busy-scene" };
    if (reducedMotion() || (state.choice && state.choice.paused)) {
      // No movement: show the static substitute until the next change.
      var staticActors = {};
      var staticPose = def.staticPose.map(function (r) {
        staticActors[r.actor] = true;
        var base = def.location ? state.pack.locations[def.location].x : locX();
        var item = {
          actor: r.actor,
          frame: r.frame,
          worldX: base + r.x,
          y: r.y || 0,
          z: r.z == null ? 1 : r.z,
        };
        item.hero = (state.pack.slots[state.slotName].rest || []).some(
          function (rest) {
            return rest.hero && rest.actor === r.actor;
          },
        );
        if (r.actor === "timsah" || item.hero) {
          item.characterId = "timsah";
          item.hitRegion = { x: -22, y: 46, w: 45, h: 51 };
          item.bubbleAnchor = [0, 49];
        }
        return item;
      });
      state.staticPose = staticPose;
      state.stage && state.stage.renderer.setPose(composePose(state.stillTime));
      state.stage && state.stage.renderer.render("stage", state.stillTime, 0);
      syncCharacterControls();
      return { played: true, static: true };
    }
    state.governor.started(kind);
    state.scene = { def: def, start: now(), kind: kind };
    kick();
    return { played: true };
  }
  function endScene() {
    state.staticPose = null;
    if (!state.scene) return;
    var kind = state.scene.kind;
    state.scene = null;
    state.governor.ended(now(), kind);
    state.nextAmbient = Math.max(
      state.nextAmbient,
      now() + BUDGET.ambientEveryMs,
    );
  }
  function signal(trigger) {
    if (state.illustrated) {
      if (trigger === "study.focus" || trigger === "study.blur") {
        state.illustrated.setFocusedStudy(trigger === "study.focus");
        return { played: true, profile: ILLUSTRATED_PROFILE };
      }
      return { played: false, reason: "story-is-user-led" };
    }
    if (!state.pack || !TRIGGER_RE.test(trigger) || trigger === "manual")
      return { played: false, reason: "inactive" };
    if (state.characterReaction)
      return { played: false, reason: "busy-character" };
    var list = scenesFor(trigger);
    if (!list.length) return { played: false, reason: "no-scene" };
    var kind = /^arrive\./.test(trigger)
      ? "story"
      : trigger === "ambient"
        ? "ambient"
        : "auto";
    // A story beat or reaction pre-empts background life; ambient never pre-empts anything.
    if (kind !== "ambient" && state.scene && state.scene.kind === "ambient")
      endScene();
    var d = state.governor.request(kind, now(), {
      hidden: document.hidden,
      reducedMotion: reducedMotion(),
      paused: state.choice && state.choice.paused,
      busy: busyReason(),
    });
    if (!d.play) return { played: false, reason: d.reason };
    return startScene(list[0], kind);
  }
  function play(sceneId) {
    if (state.illustrated)
      return {
        played: state.illustrated.inspect(sceneId || "plate"),
        profile: ILLUSTRATED_PROFILE,
      };
    if (!state.pack) return { played: false, reason: "inactive" };
    var sc = (state.pack.scenes || []).filter(function (s) {
      return s.id === sceneId;
    })[0];
    if (!sc) return { played: false, reason: "unknown-scene" };
    endScene();
    if (sc.location && sc.location !== state.location) goTo(sc.location, true);
    var d = state.governor.request("manual", now(), {
      hidden: document.hidden,
    });
    if (!d.play) return { played: false, reason: d.reason };
    return startScene(sc, "manual");
  }

  // ── journey ──
  function goTo(locId, instant) {
    if (!state.pack.locations[locId]) return;
    if (locId === state.location && !state.walk && !instant) return;
    var from = state.walk
      ? sampleTrack(state.walk.track, now() - state.walk.start).x
      : locX();
    var toX = state.pack.locations[locId].x;
    endScene();
    state.react = null;
    state.characterReaction = null;
    hideBubble();
    if (instant || !animating()) {
      state.walk = null;
      state.location = locId;
      onArrive(locId, true);
      return;
    }
    var j = journey(from, toX);
    state.walk = { track: j.track, ms: j.ms, start: now(), to: locId };
    kick();
  }
  function onArrive(locId, silent) {
    var prevLighting = state.stage && state.stage.renderer.lighting();
    state.location = locId;
    if (state.stage)
      state.stage.renderer.panTo(
        cameraFor(state.pack.locations[locId].x),
        0,
        now(),
      );
    var lighting = currentLighting();
    if (lighting !== prevLighting) setLighting(lighting);
    if (!silent) signal("arrive." + locId);
    syncRoute();
    drawOnce();
  }
  function setLighting(lighting, preference, rollbackPreference) {
    if (state.illustrated) {
      var controller = state.illustrated,
        requestLightEpoch = ++state.lightEpoch,
        requestLoadEpoch = state.loadEpoch,
        previousLight =
          rollbackPreference === undefined
            ? state.choice.lighting || "auto"
            : rollbackPreference;
      return controller.setLighting(lighting).then(function (ok) {
        if (
          controller === state.illustrated &&
          requestLightEpoch === state.lightEpoch &&
          requestLoadEpoch === state.loadEpoch
        ) {
          state.choice.lighting = ok ? preference || lighting : previousLight;
          storageSet(state.choice);
          if (ok)
            document.documentElement.setAttribute("data-world-light", lighting);
        }
        return ok;
      });
    }
    var epoch = state.loadEpoch,
      lightEpoch = ++state.lightEpoch;
    loadLighting(lighting)
      .then(function () {
        if (
          !state.pack ||
          epoch !== state.loadEpoch ||
          lightEpoch !== state.lightEpoch
        )
          return;
        if (state.stage) state.stage.renderer.setLighting(lighting);
        if (state.backdrop) state.backdrop.renderer.setLighting(lighting);
        document.documentElement.setAttribute("data-world-light", lighting);
        drawOnce();
      })
      .catch(function () {});
  }
  function watchPhase() {
    // Surfaces other than the Studio stand at their own stop (no journey, no phase hook).
    if (state.surface && !state.surface.route) {
      var fixed =
        state.surface.location || Object.keys(state.pack.locations)[0];
      state.progressLocation = fixed;
      goTo(fixed, true);
      return;
    }
    var el = document.getElementById("classicNextStep");
    if (!el || typeof MutationObserver === "undefined") {
      state.progressLocation = Object.keys(state.pack.locations)[0];
      goTo(state.progressLocation, true);
      return;
    }
    function sync(first) {
      var loc = locationForPhase(
        state.pack,
        el.getAttribute("data-phase") || "add",
      );
      state.progressLocation = loc;
      if (loc) goTo(loc, !!first);
    }
    var mo = new MutationObserver(function () {
      sync(false);
    });
    mo.observe(el, { attributes: true, attributeFilter: ["data-phase"] });
    state.observers.push(mo);
    sync(true);
  }

  // ── tap → reaction ──
  function lineFor(actorId) {
    var lines = state.pack.actors[actorId].lines;
    if (!lines) return null;
    var list = lines[locale()] || lines.ru;
    state.lineIndex =
      ((state.lineIndex == null ? -1 : state.lineIndex) + 1) % list.length;
    return list[state.lineIndex];
  }
  function characterName(id) {
    var c =
      id === "timsah" ? state.pack.actors.timsah : state.pack.characters[id];
    return c && c.names
      ? c.names[locale()] || c.names.ru
      : id === "timsah"
        ? { ru: "Тимсах", en: "Timsah", he: "תמסח" }[locale()]
        : id;
  }
  function targetById(id) {
    return (
      state.stage &&
      state.stage.renderer.targets().filter(function (t) {
        return t.id === id;
      })[0]
    );
  }
  function interact(id) {
    if (state.illustrated)
      return {
        played: state.illustrated.inspect(id),
        profile: ILLUSTRATED_PROFILE,
      };
    if (
      !state.pack ||
      !state.stage ||
      state.walk ||
      document.hidden ||
      !targetById(id)
    )
      return { played: false, reason: "not-visible" };
    endScene();
    state.react = null;
    state.characterReaction = null;
    state.bubbleCharacter = id;
    if (id === "timsah") {
      state.react = { start: now(), static: !animating() };
      showBubble(lineFor("timsah"), id);
    } else {
      var c = state.pack.characters[id],
        turn = state.characterTurns[id] || 0;
      var placement = characterPlacement(c, state.location);
      var reactions =
        placement && placement.reactionIds
          ? c.reactions.filter(function (r) {
              return placement.reactionIds.indexOf(r.id) >= 0;
            })
          : c.reactions;
      var reaction = reactions[turn % reactions.length];
      var lineIndex =
        Math.floor(turn / reactions.length) % reaction.lines.ru.length;
      state.characterTurns[id] = turn + 1;
      state.characterReaction = {
        id: id,
        def: reaction,
        start: state.characterTime,
        static: !animating(),
      };
      var line = reaction.lines[locale()][lineIndex];
      if (reaction.timsah && reaction.timsah.lines)
        line +=
          " · " +
          characterName("timsah") +
          ": " +
          reaction.timsah.lines[locale()];
      showBubble(line, id);
    }
    if (!animating()) drawOnce();
    else kick();
    return { played: true, static: !animating(), character: id };
  }
  function onStageTap(e) {
    var st = state.stage;
    if (!st || state.walk || (e.button != null && e.button !== 0)) return;
    var r = st.canvas.getBoundingClientRect(),
      size = st.renderer.size();
    // Map actual CSS rectangle to intrinsic logical canvas, including zoom/CSS transforms.
    var id = st.renderer.pickCharacter(
      ((e.clientX - r.left) * size.w) / r.width,
      ((e.clientY - r.top) * size.h) / r.height,
    );
    if (id) interact(id);
  }
  function syncCharacterControls() {
    var st = state.stage;
    if (!st) return;
    var visible = st.renderer.targets(),
      ids = {};
    visible.forEach(function (target) {
      if (ids[target.id]) return;
      ids[target.id] = true;
      var button = st.characterButtons[target.id];
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "lp-world-character";
        button.setAttribute("data-world-ui", "");
        button.setAttribute("data-character", target.id);
        var label = document.createElement("span");
        button.appendChild(label);
        button.addEventListener("click", function () {
          interact(target.id);
        });
        st.characters.appendChild(button);
        st.characterButtons[target.id] = button;
      }
      var name = characterName(target.id);
      button.firstChild.textContent = name;
      button.setAttribute(
        "aria-label",
        tr("world.talkTo", "Поговорить: ") + name,
      );
      button.title = name;
      button.hidden = false;
      button.disabled = !!state.walk;
      button.style.left = target.x * st.scale + "px";
      button.style.top = target.y * st.scale + "px";
      button.style.width = target.w * st.scale + "px";
      button.style.height = target.h * st.scale + "px";
    });
    Object.keys(st.characterButtons).forEach(function (id) {
      if (!ids[id]) st.characterButtons[id].hidden = true;
    });
    st.characters.setAttribute(
      "aria-label",
      tr("world.characters", "Персонажи"),
    );
  }
  function showBubble(text, characterId) {
    if (!text || !state.stage) return;
    hideBubble();
    state.bubbleCharacter = characterId || "timsah";
    var b = document.createElement("div");
    b.className = "lp-world-bubble";
    b.setAttribute("aria-hidden", "true");
    b.lang = locale();
    b.dir = "auto";
    b.textContent = text;
    state.stage.el.appendChild(b);
    state.bubble = b;
    // Announce complete text once. No typewriter timers or partial screen-reader announcements.
    state.stage.announcer.textContent =
      characterName(state.bubbleCharacter) + ": " + text;
    state.stage.announcer.lang = locale();
    state.stage.announcer.dir = "auto";
    positionBubble();
  }
  // The bubble sits beside the speaker's head inside the street band (never over the panels):
  // to the right when there is room, otherwise to the left, tail pointing back at the head.
  function positionBubble() {
    var b = state.bubble,
      st = state.stage;
    if (!b || !st) return;
    var sc = st.scale,
      cam = st.renderer.camera();
    var target = targetById(state.bubbleCharacter || "timsah");
    var head = target ? target.headX * sc : (locX() - cam) * sc;
    var L = state.pack.locations[state.location];
    var headRows = target
        ? st.renderer.size().h - target.headY
        : state.pack.scenery.groundY + 49,
      rows = headRows;
    // Never over a poster and never up into the title: with posters on this stop the bubble wraps
    // into the free space left of them at head height; it rises above them only if that space is too narrow.
    var posters = (L && L.posters) || [];
    // the counting-night bars and their vowel labels are an obstacle too (5+8 art px wide, labels above)
    var tally =
      L &&
      (L.fx || []).filter(function (f) {
        return f.kind === "tally" && f.labels;
      })[0];
    if (tally)
      posters = posters.concat([{ x: tally.x + 12, y: 0, tally: true }]);
    var limit = st.el.clientWidth - 8;
    if (posters.length) {
      var pl =
        Math.min.apply(
          null,
          posters.map(function (po) {
            return (L.x + po.x - 14 - cam) * sc;
          }),
        ) -
        (posters.some(function (po) {
          return po.stand;
        })
          ? 4 * sc
          : 0);
      if (pl - 12 >= 150) {
        limit = pl - 6;
        b.style.whiteSpace = "normal";
        b.style.maxWidth = Math.round(limit - 8) + "px";
      } else
        posters.forEach(function (po) {
          rows = Math.max(
            rows,
            (po.stand
              ? state.pack.scenery.groundY
              : state.pack.scenery.backGround || 30) +
              (po.y || 0) +
              32,
          );
        });
    } else {
      b.style.whiteSpace = "";
      b.style.maxWidth = "";
    }
    var left = Math.round(
      Math.max(8, Math.min(limit - b.offsetWidth, head - 12 * sc)),
    );
    b.dataset.side = "up";
    b.style.setProperty(
      "--lpw-tail",
      Math.max(10, Math.min(b.offsetWidth - 18, head - left)) + "px",
    );
    b.style.left = "0px";
    b.style.transform = "translateX(" + left + "px)";
    // the bubble's top never climbs out of the street band into the app's own title/copy
    var bottomPx = rows * sc;
    var untilSel = st.el.getAttribute("data-world-bottom");
    var until = untilSel && st.el.parentElement.querySelector(untilSel);
    if (until) {
      var band = parseFloat(getComputedStyle(until).paddingBottom) || 0;
      if (band)
        bottomPx = Math.max(8, Math.min(bottomPx, band - b.offsetHeight - 8));
    }
    b.style.bottom = Math.round(bottomPx) + "px";
  }
  function hideBubble() {
    if (state.bubble) {
      state.bubble.remove();
      state.bubble = null;
    }
    state.bubbleCharacter = null;
    if (state.stage && state.stage.announcer)
      state.stage.announcer.textContent = "";
  }

  // ── learning in the world: a Hebrew sign per location (a real control) + a route strip ──
  function speakHebrew(text) {
    try {
      if (
        !window.speechSynthesis ||
        typeof SpeechSynthesisUtterance === "undefined"
      )
        return false;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "he-IL";
      u.rate = 0.85;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      return true;
    } catch (_) {
      return false;
    }
  }
  function syncSign() {
    var st = state.stage;
    if (!st || !st.sign) return;
    var L = state.location && state.pack.locations[state.location];
    var sg = L && L.sign;
    if (!sg || state.walk) {
      st.sign.hidden = true;
      return;
    }
    if (st.sign.dataset.loc !== state.location) {
      st.sign.dataset.loc = state.location;
      st.signHe.textContent = sg.he;
      st.signTr.textContent = sg.translit;
      st.sign.setAttribute(
        "aria-label",
        sg.he +
          " — " +
          (sg.gloss[locale()] || sg.gloss.ru) +
          ". " +
          tr("world.signListen", "Послушать"),
      );
    }
    st.sign.hidden = false;
    // An A-frame on the pavement just left of Timsah: the landmark stays uncovered, the bubble
    // (above his head) never overlaps it. transform-only: following the camera never shifts layout.
    var head = (L.x - st.renderer.camera()) * st.scale;
    var x = head - 22 * st.scale - st.sign.offsetWidth;
    st.sign.style.left = "0px";
    st.sign.style.transform =
      "translateX(" + Math.round(Math.max(8, x)) + "px)";
    st.sign.style.bottom =
      Math.round((state.pack.scenery.groundY - 2) * st.scale) + "px";
    syncRoute();
  }
  // Campaign posters of the fictional vowel parties, pasted on the street wall at their location.
  // Real controls: tap = hear the vowel sign's name + Timsah explains the joke.
  function syncPosters() {
    var st = state.stage;
    if (!st || !st.posters) return;
    var L = state.location && state.pack.locations[state.location];
    var list = (L && !state.walk && L.posters) || [];
    if (
      st.posters.dataset.loc !== (state.walk ? "" : state.location) ||
      st.posters.dataset.lang !== locale()
    ) {
      st.posters.dataset.loc = state.walk ? "" : state.location;
      st.posters.dataset.lang = locale();
      while (st.posters.firstChild)
        st.posters.removeChild(st.posters.firstChild);
      list.forEach(function (po) {
        var pt = state.pack.parties[po.party];
        var b = document.createElement("button");
        b.type = "button";
        b.className = "lp-world-poster";
        b.style.setProperty("--lpw-party", pt.color);
        b.style.setProperty("--lpw-party-ink", pt.ink);
        var mark = document.createElement("span");
        mark.className = "lp-world-poster-mark";
        mark.lang = "he";
        mark.dir = "rtl";
        mark.textContent = pt.mark;
        var name = document.createElement("span");
        name.className = "lp-world-poster-name";
        name.textContent = pt.short
          ? pt.short[locale()] || pt.short.ru
          : pt.names[locale()] || pt.names.ru;
        var slogan = document.createElement("span");
        slogan.className = "lp-world-poster-slogan";
        slogan.dir = "ltr";
        slogan.textContent = pt.slogan
          ? pt.slogan[locale()] || pt.slogan.ru
          : "";
        b.appendChild(name);
        b.appendChild(mark);
        b.appendChild(slogan);
        b.setAttribute(
          "aria-label",
          (pt.names[locale()] || pt.names.ru) +
            ". " +
            tr("world.signListen", "Послушать"),
        );
        b.dataset.x = po.x;
        b.dataset.y = po.y || 0;
        b.dataset.stand = po.stand ? "1" : "";
        b.addEventListener("click", function () {
          speakHebrew(pt.speak);
          state.react = { start: now(), static: !animating() };
          showBubble(pt.says[locale()] || pt.says.ru);
          if (!animating()) drawOnce();
          else kick();
        });
        st.posters.appendChild(b);
      });
    }
    // the DOM button exactly covers the pixel poster the renderer drew (22×26 art px)
    Array.prototype.forEach.call(st.posters.children, function (b) {
      var x =
        (L.x + Number(b.dataset.x) - 14 - st.renderer.camera()) * st.scale;
      b.style.width = 28 * st.scale + "px";
      b.style.height = 30 * st.scale + "px";
      b.style.transform = "translateX(" + Math.round(x) + "px)";
      var base =
        b.dataset.stand === "1"
          ? state.pack.scenery.groundY
          : state.pack.scenery.backGround || 30;
      b.style.bottom =
        Math.round((base + Number(b.dataset.y)) * st.scale) + "px";
    });
  }

  function syncBoard() {
    var st = state.stage;
    if (!st) return;
    var L = state.location && state.pack.locations[state.location];
    var fx =
      L &&
      !state.walk &&
      (L.fx || []).filter(function (f) {
        return f.kind === "tally" && f.labels;
      })[0];
    if (!fx) {
      if (st.board) st.board.hidden = true;
      return;
    }
    if (!st.board) {
      st.board = document.createElement("div");
      st.board.className = "lp-world-board";
      st.board.setAttribute("aria-hidden", "true");
      st.el.appendChild(st.board);
    }
    if (st.board.dataset.lang !== locale()) {
      st.board.dataset.lang = locale();
      st.board.textContent = "";
      (fx.parties || []).forEach(function (pid) {
        var s = document.createElement("span");
        s.className = "lp-world-board-mark";
        s.lang = "he";
        s.textContent = state.pack.parties[pid].mark;
        s.style.borderBottomColor = state.pack.parties[pid].color;
        st.board.appendChild(s);
      });
    }
    st.board.hidden = false;
    var sc = st.scale;
    // two labels, each centred over its 5px bar (bars at +0 and +8 art px from fx.x)
    st.board.style.width = 13 * sc + "px";
    st.board.style.height = 6 * sc + "px";
    st.board.style.transform =
      "translateX(" +
      Math.round((L.x + fx.x - st.renderer.camera()) * sc) +
      "px)";
    st.board.style.bottom = (fx.y + 16) * sc + "px";
    // when the bars reach the top together, Timsah calls the tie (once per counting cycle)
    var cycle = Math.floor(now() / 6000),
      phase = (now() % 6000) / 6000;
    if (
      fx.tieLines &&
      phase > 0.72 &&
      state.tieCycle !== cycle &&
      !state.react &&
      !state.scene &&
      animating()
    ) {
      state.tieCycle = cycle;
      var list = fx.tieLines[locale()] || fx.tieLines.ru;
      state.react = { start: now(), static: !animating() };
      showBubble(list[cycle % list.length]);
    }
  }

  function syncRoute() {
    var st = state.stage;
    if (!st || !st.route) return;
    var ids = Object.keys(state.pack.locations).filter(function (id) {
      return state.pack.locations[id].phase;
    });
    var progress = ids.indexOf(state.progressLocation || ids[0]);
    var routeLabel = REGISTRY[state.pack.id].routeLabel;
    st.route.setAttribute(
      "aria-label",
      routeLabel
        ? routeLabel[locale()] || routeLabel.ru
        : tr("world.routeLabel", "Маршрут выборов"),
    );
    Array.prototype.forEach.call(st.route.children, function (b, i) {
      var L = state.pack.locations[b.dataset.loc];
      var name =
        (L.names && (L.names[locale()] || L.names.ru)) || b.dataset.loc;
      b.dataset.state =
        i < progress ? "done" : i === progress ? "here" : "next";
      b.dataset.at = b.dataset.loc === state.location ? "1" : "";
      if (i === progress) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
      if (b.getAttribute("aria-label") !== name) {
        b.setAttribute("aria-label", name);
        b.title = name;
      }
    });
  }
  // Explore the route by hand: Timsah walks there; the next Studio phase change takes over again.
  function visit(id) {
    if (state.illustrated) return state.illustrated.inspect(id);
    if (!state.pack || !state.pack.locations[id]) return;
    if (id === state.location && !state.walk) {
      onSign();
      return;
    }
    goTo(id, true); // instant: the route is a menu, not a walk
    syncRoute();
    var L = state.pack.locations[id];
    signal("arrive." + id); // the stop's own action plays at once
    if (L.quip) {
      state.react = { start: now(), static: !animating() };
      showBubble(L.quip[locale()] || L.quip.ru);
    }
    if (!animating()) drawOnce();
    else kick();
  }

  function onSign() {
    var L = state.pack.locations[state.location];
    if (!L || !L.sign) return;
    speakHebrew(L.sign.he);
    state.react = { start: now(), static: !animating() };
    showBubble(
      L.sign.translit + " — " + (L.sign.gloss[locale()] || L.sign.gloss.ru),
    );
    if (!animating()) drawOnce();
    else kick();
  }

  // ── pause control (visible, WCAG 2.2.2) ──
  function syncPauseButton() {
    var st = state.stage;
    if (!st || !st.pause) return;
    var paused = !!(state.choice && state.choice.paused);
    st.pause.setAttribute("aria-pressed", paused ? "true" : "false");
    var label = paused
      ? tr("world.resume", "Оживить мир")
      : tr("world.pause", "Остановить мир");
    st.pause.setAttribute("aria-label", label);
    st.pause.title = label;
    st.pause.dataset.state = paused ? "paused" : "playing";
  }
  function togglePause() {
    if (!state.choice) return;
    state.choice.paused = !state.choice.paused;
    storageSet(state.choice);
    if (state.illustrated) {
      state.illustrated.setPaused(state.choice.paused);
      return;
    }
    syncPauseButton();
    if (state.choice.paused) {
      state.stillTime = now();
      endScene();
      state.react = null;
      state.characterReaction = null;
      hideBubble();
      drawOnce();
    } else kick();
  }

  // ── mount / unmount ──
  // One stage per page: whichever app-declared stage slot this shell carries (Studio, Reading Room
  // or Mediatheque); the pack's surface for that slot decides route vs. a fixed stop.
  function surfaceForSlot(slot) {
    var su = state.pack.surfaces || {};
    for (var k in su)
      if (su[k].slot === slot) {
        state.surfaceKey = k;
        return su[k];
      }
    state.surfaceKey = slot === "studio-stage" ? "studio" : slot;
    return { slot: slot, route: slot === "studio-stage" };
  }
  function mountStage() {
    var el = document.querySelector(
      STAGE_SLOTS.map(function (s) {
        return '[data-world-slot="' + s + '"]';
      }).join(","),
    );
    if (!el) return;
    var slotName = el.getAttribute("data-world-slot");
    if (!state.pack.slots[slotName]) return;
    state.slotName = slotName;
    state.surface = surfaceForSlot(slotName);
    el.hidden = false;
    var canvas = document.createElement("canvas");
    canvas.className = "lp-world-canvas";
    canvas.setAttribute("aria-hidden", "true");
    el.appendChild(canvas);
    var pause = document.createElement("button");
    pause.type = "button";
    pause.className = "lp-world-pause";
    pause.setAttribute("data-world-ui", "");
    pause.innerHTML =
      '<span aria-hidden="true" class="lp-world-pause-icon"></span>';
    pause.addEventListener("click", togglePause);
    el.appendChild(pause);
    var sign = document.createElement("button");
    sign.type = "button";
    sign.className = "lp-world-sign";
    sign.setAttribute("data-world-ui", "");
    sign.hidden = true;
    var signHe = document.createElement("span");
    signHe.className = "lp-world-sign-he";
    signHe.lang = "he";
    signHe.dir = "rtl";
    var signTr = document.createElement("span");
    signTr.className = "lp-world-sign-tr";
    signTr.lang = "he-Latn";
    signTr.setAttribute("aria-hidden", "true");
    sign.appendChild(signHe);
    sign.appendChild(signTr);
    sign.addEventListener("click", onSign);
    el.appendChild(sign);
    // Route stops are real controls: tap one to send Timsah there. The Studio's own progress
    // (the «Следующий шаг» phase) stays marked with aria-current; where Timsah stands is framed.
    var route = document.createElement("div");
    route.className = "lp-world-route";
    route.setAttribute("role", "group");
    route.setAttribute("data-world-ui", "");
    if (!state.surface.route) route.hidden = true;
    Object.keys(state.pack.locations)
      .filter(function (id) {
        return state.pack.locations[id].phase;
      })
      .forEach(function (id) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "lp-world-stop";
        b.dataset.loc = id;
        var L0 = state.pack.locations[id];
        if (L0.icon && state.atlas.atlases[L0.icon]) {
          var ic = document.createElement("span");
          ic.className = "lp-world-stop-icon";
          ic.setAttribute("aria-hidden", "true");
          ic.style.backgroundImage =
            'url("' + assetUrl(state.atlas.atlases[L0.icon].file) + '")';
          b.appendChild(ic);
        }
        if (state.pack.here && state.atlas.atlases[state.pack.here]) {
          var hd = document.createElement("span");
          hd.className = "lp-world-stop-here";
          hd.setAttribute("aria-hidden", "true");
          hd.style.backgroundImage =
            'url("' +
            assetUrl(state.atlas.atlases[state.pack.here].file) +
            '")';
          b.appendChild(hd);
        }
        b.addEventListener("click", function () {
          visit(id);
        });
        route.appendChild(b);
      });
    el.appendChild(route);
    var posters = document.createElement("div");
    posters.className = "lp-world-posters";
    posters.setAttribute("data-world-ui", "");
    el.appendChild(posters);
    var characters = document.createElement("div");
    characters.className = "lp-world-characters";
    characters.setAttribute("role", "group");
    characters.setAttribute("data-world-ui", "");
    el.appendChild(characters);
    var announcer = document.createElement("div");
    announcer.className = "lp-world-sr";
    announcer.setAttribute("role", "status");
    announcer.setAttribute("aria-live", "polite");
    announcer.setAttribute("aria-atomic", "true");
    el.appendChild(announcer);
    var renderer = window.LPWorldRender.createRenderer(canvas, {
      pack: state.pack,
      atlas: state.atlas,
      images: state.images,
      scenery: state.surface.scenery,
      seed: 26,
    });
    state.stage = {
      el: el,
      canvas: canvas,
      pause: pause,
      sign: sign,
      signHe: signHe,
      signTr: signTr,
      route: route,
      posters: posters,
      characters: characters,
      characterButtons: {},
      announcer: announcer,
      renderer: renderer,
      scale: DEFAULT_SCALE,
      originPx: 0,
    };
    canvas.addEventListener("pointerdown", onStageTap);
    syncPauseButton();
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(function () {
        layoutStage();
      });
      ro.observe(el.parentElement);
      state.observers.push(ro);
    }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (entries) {
        state.visible = entries[0].isIntersecting;
      });
      io.observe(el);
      state.observers.push(io);
    }
  }
  function mountBackdrop() {
    var el = document.querySelector('[data-world-slot="page-backdrop"]');
    if (!el || !state.pack.scenery.backdrop) return;
    el.hidden = false;
    var canvas = document.createElement("canvas");
    canvas.className = "lp-world-canvas";
    canvas.setAttribute("aria-hidden", "true");
    el.appendChild(canvas);
    state.backdrop = {
      el: el,
      canvas: canvas,
      renderer: window.LPWorldRender.createRenderer(canvas, {
        pack: state.pack,
        atlas: state.atlas,
        images: state.images,
        scenery: state.surface && state.surface.scenery,
        seed: 7,
      }),
    };
  }
  function unmount() {
    [state.stage, state.backdrop].forEach(function (m) {
      if (!m) return;
      while (m.el.firstChild) m.el.removeChild(m.el.firstChild);
      m.el.hidden = true;
      m.el.removeAttribute("style");
    });
    state.stage = null;
    state.backdrop = null;
    state.bubble = null;
    state.observers.forEach(function (o) {
      try {
        o.disconnect();
      } catch (_) {}
    });
    state.observers = [];
  }

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    state.listeners.push([target, type, fn, opts]);
  }
  function wireEvents() {
    // Studio's own table-job telemetry snapshot: only `state` is read — no text, no rows.
    on(window, "table-job-progress", function (e) {
      if (e && e.detail && e.detail.state === "done")
        signal("studio.table-ready");
    });
    on(document, "visibilitychange", function () {
      if (document.hidden) {
        endScene();
        state.characterReaction = null;
        state.react = null;
        hideBubble();
      } else {
        state.lastFrame = 0;
        drawOnce();
        kick();
      }
    });
    on(window, "resize", function () {
      layoutStage();
    });
    on(document, "keydown", function (e) {
      if (e.key === "Escape" && state.bubble) {
        state.characterReaction = null;
        state.react = null;
        hideBubble();
        drawOnce();
      }
    });
    on(
      window,
      "scroll",
      function () {
        if (!animating()) drawOnce();
      },
      { passive: true },
    );
    on(document, "i18n:changed", function () {
      syncPauseButton();
      hideBubble();
      syncCharacterControls();
      syncRoute();
      if (state.stage && state.stage.sign) state.stage.sign.dataset.loc = "";
      syncSign();
      syncPosters();
      syncBoard();
    });
    if (typeof MutationObserver !== "undefined" && document.body) {
      var themeMo = new MutationObserver(function () {
        var l = currentLighting();
        if (state.stage && l !== state.stage.renderer.lighting())
          setLighting(l);
      });
      themeMo.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
      state.observers.push(themeMo);
    }
    try {
      var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      var onMq = function () {
        state.stillTime = now();
        state.characterReaction = null;
        state.react = null;
        hideBubble();
        endScene();
        drawOnce();
        kick();
      };
      if (mq.addEventListener) {
        mq.addEventListener("change", onMq);
        state.listeners.push([mq, "change", onMq]);
      }
    } catch (_) {}
  }
  function unwireEvents() {
    state.listeners.forEach(function (l) {
      l[0].removeEventListener(l[1], l[2], l[3]);
    });
    state.listeners = [];
  }

  function fetchJson(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function deactivate() {
    state.loadEpoch++; // an old asynchronous pack can never revive a dismissed world
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (state.illustrated) {
      state.illustrated.destroy();
      state.illustrated = null;
    }
    document.documentElement.removeAttribute("data-world-profile");
    state.scene = null;
    state.staticPose = null;
    state.walk = null;
    state.react = null;
    state.characterReaction = null;
    state.characterTurns = {};
    state.characterTime = 0;
    state.stillTime = now();
    unwireEvents();
    unmount();
    clearSkin();
    document.documentElement.removeAttribute("data-world-light");
    state.pack = null;
    state.atlas = null;
    state.images = {};
    state.location = null;
    state.governor = createGovernor();
    state.walkers = [];
    state.walkerNext = [];
    state.lineIndex = null;
    state.visible = true;
    state.nextAmbient = 0;
    document.dispatchEvent(
      new CustomEvent("lp-world:changed", { detail: { id: null } }),
    );
  }

  function loadIllustratedModule() {
    if (window.LPWorldIllustrated) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = ILLUSTRATED_URL;
      script.async = true;
      script.setAttribute("data-world-ui", "");
      script.onload = function () {
        window.LPWorldIllustrated
          ? resolve()
          : reject(new Error("illustrated module missing"));
      };
      script.onerror = function () {
        reject(new Error("illustrated module load failed"));
      };
      document.head.appendChild(script);
    });
  }
  function initialIllustratedFiles(pack, atlas, surface, lighting) {
    var selected = surface || "studio",
      sc = window.LPWorldIllustrated.core.sceneFor(
        pack,
        selected,
        lighting || "dusk",
      ),
      seen = {};
    [sc.background]
      .concat(sc.layers)
      .concat(
        (sc.panels || [])
          .map(function (p) {
            return p.art;
          })
          .filter(Boolean),
      )
      .forEach(function (s) {
        seen[atlas.atlases[s.sheet].file] = true;
      });
    return Object.keys(seen);
  }
  function illustratedSurface() {
    var host = document.querySelector(
      STAGE_SLOTS.map(function (s) {
        return '[data-world-slot="' + s + '"]';
      }).join(","),
    );
    var slot = host && host.getAttribute("data-world-slot");
    return slot === "room-stage"
      ? "room"
      : slot === "media-stage"
        ? "mediatheque"
        : "studio";
  }
  function mountIllustrated() {
    var host = document.querySelector(
      STAGE_SLOTS.map(function (s) {
        return '[data-world-slot="' + s + '"]';
      }).join(","),
    );
    if (!host)
      throw new Error("illustrated world needs an app-owned stage slot");
    ensureCss();
    document.documentElement.setAttribute("data-world", state.pack.id);
    document.documentElement.setAttribute("data-world-profile", "illustrated");
    host.hidden = false;
    state.illustrated = window.LPWorldIllustrated.create({
      pack: state.pack,
      atlas: state.atlas,
      images: state.images,
      host: host,
      surface: illustratedSurface(),
      locale: locale(),
      mode: state.choice.mode,
      paused: state.choice.paused,
      reduced: reducedMotion(),
      lighting: currentLighting(),
      onPause: togglePause,
      loadAssets: function (files) {
        return Promise.all(files.map(loadImage));
      },
    });
    on(document, "i18n:changed", function () {
      if (state.illustrated) state.illustrated.setLocale(locale());
    });
    function syncStudyFocus() {
      if (state.illustrated) state.illustrated.setFocusedStudy(!!busyReason());
    }
    on(document, "focusin", syncStudyFocus);
    on(document, "focusout", syncStudyFocus);
    on(document, "input", syncStudyFocus);
    on(document, "click", syncStudyFocus);
    if (typeof MutationObserver !== "undefined") {
      var modalObserver = new MutationObserver(syncStudyFocus);
      modalObserver.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ["open", "aria-modal", "data-open"],
      });
      state.observers.push(modalObserver);
    }
    syncStudyFocus();
    if (typeof MutationObserver !== "undefined") {
      var illustratedThemeObserver = new MutationObserver(function () {
        if (
          state.illustrated &&
          state.choice &&
          state.choice.lighting === "auto"
        ) {
          var automaticLight = currentLighting();
          if (automaticLight !== state.illustrated.debug().lighting)
            setLighting(automaticLight, "auto", "auto");
        }
      });
      illustratedThemeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
      state.observers.push(illustratedThemeObserver);
    }
    on(document, "lp-world:study-focus", function (e) {
      if (state.illustrated)
        state.illustrated.setFocusedStudy(!!(e.detail && e.detail.focused));
    });
    var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.addEventListener) {
      var fn = function () {
        if (state.illustrated) state.illustrated.setReduced(mq.matches);
      };
      mq.addEventListener("change", fn);
      state.listeners.push([mq, "change", fn]);
    }
  }

  function activate(choice) {
    var epoch = ++state.loadEpoch;
    var reg = REGISTRY[choice.id];
    state.base = reg.base;
    var v = encodeURIComponent(reg.pack);
    return Promise.all([
      fetchJson(reg.base + "manifest.json?v=" + v),
      fetchJson(reg.base + "atlas.json?v=" + v),
      reg.profile === ILLUSTRATED_PROFILE
        ? loadIllustratedModule()
        : loadScript(RENDER_URL),
    ])
      .then(function (res) {
        if (epoch !== state.loadEpoch) throw new Error("world load superseded");
        var check = validatePack(res[0], res[1], choice.id);
        if (!check.ok)
          throw new Error(
            "pack invalid: " + check.errors.slice(0, 5).join("; "),
          );
        if (
          res[0].interactionVersion === 1 &&
          (!reg.capabilities ||
            reg.capabilities.indexOf("character-interactions/1") < 0)
        )
          throw new Error("registry capability missing");
        if (res[0].version !== reg.pack)
          throw new Error("pack version " + res[0].version + " != " + reg.pack);
        state.pack = res[0];
        state.atlas = res[1];
        state.choice = choice;
        state.stillTime = now();
        if (state.pack.profile === ILLUSTRATED_PROFILE) {
          if (
            reg.profile !== ILLUSTRATED_PROFILE ||
            !reg.capabilities ||
            reg.capabilities.indexOf(ILLUSTRATED_PROFILE) < 0 ||
            state.pack.requiredCapabilities.some(function (c) { return CAPABILITIES.indexOf(c) < 0 || reg.capabilities.indexOf(c) < 0; })
          )
            throw new Error("illustrated registry gate");
          return Promise.all(
            initialIllustratedFiles(
              state.pack,
              state.atlas,
              illustratedSurface(),
              currentLighting(),
            ).map(loadImage),
          );
        }
        var host = document.querySelector(
          STAGE_SLOTS.map(function (s) {
            return '[data-world-slot="' + s + '"]';
          }).join(","),
        );
        state.surface = surfaceForSlot(
          host ? host.getAttribute("data-world-slot") : "studio-stage",
        );
        state.location = null; // set by the phase hook (or the first location) after layout
        return loadLighting(currentLighting());
      })
      .then(function () {
        if (epoch !== state.loadEpoch) return false;
        if (state.pack.profile === ILLUSTRATED_PROFILE) {
          mountIllustrated();
          document.documentElement.setAttribute(
            "data-world-light",
            currentLighting(),
          );
          document.dispatchEvent(
            new CustomEvent("lp-world:changed", {
              detail: {
                id: choice.id,
                mode: choice.mode,
                profile: ILLUSTRATED_PROFILE,
              },
            }),
          );
          return true;
        }
        applySkin();
        mountBackdrop();
        mountStage();
        var lighting = currentLighting();
        if (state.stage) state.stage.renderer.setLighting(lighting);
        if (state.backdrop) state.backdrop.renderer.setLighting(lighting);
        document.documentElement.setAttribute("data-world-light", lighting);
        wireEvents();
        layoutStage();
        watchPhase();
        state.nextAmbient = now() + 8000;
        kick();
        document.dispatchEvent(
          new CustomEvent("lp-world:changed", {
            detail: { id: choice.id, mode: choice.mode },
          }),
        );
        return true;
      })
      .catch(function (e) {
        if (epoch !== state.loadEpoch) return false;
        // A broken pack is a missing decoration, never a broken app: fall back to Classic.
        try {
          console.warn("[LPWorld] Classic fallback:", e && e.message);
        } catch (_) {}
        deactivate();
        state.choice = null;
        storageSet(null);
        return false;
      });
  }

  function boot() {
    try {
      if (/[?&]world=off\b/.test(location.search)) {
        storageSet(null);
        return Promise.resolve(false);
      }
    } catch (_) {}
    var choice = readChoice(storageGet());
    state.choice = choice;
    if (!choice) return Promise.resolve(false);
    return activate(choice);
  }

  function set(id, mode, lighting) {
    state.loadEpoch++; // invalidate pending work even before any pack has mounted
    var choice = id
      ? readChoice(
          JSON.stringify({
            id: id,
            mode: mode || "live",
            lighting: lighting || "auto",
          }),
        )
      : null;
    if (state.pack) deactivate();
    storageSet(choice);
    state.choice = choice;
    return choice ? activate(choice) : Promise.resolve(false);
  }

  // ── picker (app-owned UI; strings from the app locales, pack text via textContent) ──

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      n.setAttribute(k, attrs[k]);
    });
    if (text != null) n.textContent = text;
    return n;
  }

  // Live thumbnail for a world option: the same renderer, loaded only when the picker opens.
  // A still frame under reduced motion; otherwise a gentle loop that stops when the dialog closes.
  function mountPreview(host, id, dlg) {
    var reg = REGISTRY[id];
    if (!reg) return;
    var canvas = document.createElement("canvas");
    canvas.className = "lp-world-preview";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    var disposed = false,
      visible = false,
      started = false,
      raf = 0,
      last = 0,
      renderFrame = null;
    var viewRaf = 0,
      previewTime = 0,
      previewStart = performance.now();
    var observer = null,
      motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function tick(t) {
      raf = 0;
      if (
        disposed ||
        !visible ||
        document.hidden ||
        !dlg.open ||
        motion.matches ||
        (state.choice && state.choice.paused) ||
        !renderFrame
      )
        return;
      if (t - last >= 50) {
        var dt = last ? Math.min(100, t - last) : 0;
        previewTime += dt;
        renderFrame(previewTime, dt);
        last = t;
      }
      raf = requestAnimationFrame(tick);
    }
    function sync() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      if (disposed || !visible || !dlg.open || document.hidden) return;
      if (!started) {
        started = true;
        load();
      }
      if (renderFrame) {
        renderFrame(previewTime, 0);
        if (!motion.matches && !(state.choice && state.choice.paused))
          raf = requestAnimationFrame(tick);
      }
    }
    function inView() {
      var a = canvas.getBoundingClientRect(),
        b = dlg.getBoundingClientRect();
      visible =
        a.bottom > b.top &&
        a.top < b.bottom &&
        a.right > b.left &&
        a.left < b.right;
      sync();
    }
    function dispose() {
      disposed = true;
      renderFrame = null;
      if (viewRaf) cancelAnimationFrame(viewRaf);
      if (raf) cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      dlg.removeEventListener("scroll", inView);
      window.removeEventListener("resize", inView);
      document.removeEventListener("visibilitychange", sync);
      if (motion.removeEventListener)
        motion.removeEventListener("change", sync);
    }
    dlg.addEventListener("close", dispose, { once: true });
    document.addEventListener("visibilitychange", sync);
    if (motion.addEventListener) motion.addEventListener("change", sync);
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        function (entries) {
          visible = entries[entries.length - 1].isIntersecting;
          sync();
        },
        { root: dlg, threshold: 0 },
      );
      observer.observe(canvas);
    } else {
      dlg.addEventListener("scroll", inView, { passive: true });
      window.addEventListener("resize", inView);
      viewRaf = requestAnimationFrame(inView);
    }
    function load() {
      var v = encodeURIComponent(reg.pack);
      Promise.all([
        fetchJson(reg.base + "manifest.json?v=" + v),
        fetchJson(reg.base + "atlas.json?v=" + v),
        reg.profile === ILLUSTRATED_PROFILE
          ? loadIllustratedModule()
          : loadScript(RENDER_URL),
      ])
        .then(function (res) {
          var pack = res[0],
            atlas = res[1];
          if (
            disposed ||
            !dlg.isConnected ||
            !validatePack(pack, atlas, id).ok ||
            pack.version !== reg.pack ||
            (pack.interactionVersion === 1 &&
              (!reg.capabilities ||
                reg.capabilities.indexOf("character-interactions/1") < 0))
          )
            return;
          if (pack.profile === ILLUSTRATED_PROFILE) {
            var previewAsset = atlas.atlases[pack.preview.sheet],
              previewFrame = previewAsset.frames[pack.preview.frame];
            return new Promise(function (resolve) {
              var image = new Image();
              image.onload = function () {
                if (disposed || !dlg.isConnected) {
                  resolve();
                  return;
                }
                canvas.width = 384;
                canvas.height = 216;
                canvas.style.imageRendering = "auto";
                renderFrame = function () {
                  canvas
                    .getContext("2d")
                    .drawImage(
                      image,
                      previewFrame.x,
                      previewFrame.y,
                      previewFrame.w,
                      previewFrame.h,
                      0,
                      0,
                      384,
                      216,
                    );
                };
                sync();
                resolve();
              };
              image.onerror = resolve;
              image.src = packedAssetUrl(
                reg.base,
                previewAsset.file,
                pack.version,
              );
            });
          }
          var ids = Object.keys(pack.locations),
            pick = reg.previewLocation || ids[ids.length - 1],
            loc = pack.locations[pick];
          var previewScenery = Object.assign(
            {},
            pack.scenery,
            (pack.surfaces &&
              pack.surfaces.studio &&
              pack.surfaces.studio.scenery) ||
              {},
          );
          var images = {},
            lighting = loc.lighting || "dusk";
          var files = {};
          (previewScenery.layers || []).forEach(function (L) {
            files[
              atlas.atlases[
                typeof L.sheet === "string" ? L.sheet : L.sheet[lighting]
              ].file
            ] = true;
          });
          var em = previewScenery.emitters || {};
          if (em.clouds)
            files[
              atlas.atlases[
                typeof em.clouds.sheet === "string"
                  ? em.clouds.sheet
                  : em.clouds.sheet[lighting]
              ].file
            ] = true;
          Object.keys(pack.actors).forEach(function (a) {
            var sh = pack.actors[a].sheet;
            sh =
              typeof sh === "string"
                ? sh
                : sh[lighting] || sh.dusk || sh.day || sh.night;
            if (sh) files[atlas.atlases[sh].file] = true;
          });
          return Promise.all(
            Object.keys(files).map(function (f) {
              return new Promise(function (ok) {
                var img = new Image();
                img.onload = function () {
                  images[f] = img;
                  ok();
                };
                img.onerror = ok;
                img.src = packedAssetUrl(reg.base, f, pack.version);
              });
            }),
          ).then(function () {
            if (disposed || !dlg.isConnected) return;
            var r = window.LPWorldRender.createRenderer(canvas, {
              pack: pack,
              atlas: atlas,
              images: images,
              scenery: previewScenery,
              seed: 3,
            });
            var rect = host.getBoundingClientRect();
            // a close-up at the world's own 2x scale: the mascot and the stop's set-piece, not a street
            r.resize(Math.max(160, Math.round(rect.width)), 144, 2);
            r.setLighting(lighting);
            var originX = loc.x;
            r.panTo(
              originX - Math.round((Math.max(160, rect.width) / 2) * 0.28),
              0,
              performance.now(),
            );
            var props = (loc.props || []).map(function (pr) {
              return {
                actor: pr.actor,
                frame: pr.frame,
                worldX: loc.x + pr.x,
                y: pr.y || 0,
                z: pr.z == null ? 1 : pr.z,
                back: !!pr.back,
                ground: pr.ground,
              };
            });
            var act = pack.actors["timsah-act"] ? "timsah-act" : null;
            function pose(t) {
              var me = act
                ? {
                    actor: act,
                    frame: t % 1400 < 700 ? "clip" : "clip-wow",
                    worldX: originX,
                    y: 0,
                    z: 3,
                  }
                : {
                    actor: "timsah",
                    frame: t % 3600 < 150 ? "blink" : "idle",
                    worldX: originX,
                    y: 0,
                    z: 3,
                  };
              var cast = Object.keys(pack.characters || {})
                .map(function (id) {
                  var c = pack.characters[id],
                    pl = characterPlacement(c, pick);
                  return pl
                    ? {
                        actor: c.actor,
                        frame: sampleCharacterState(
                          c,
                          pl.idleState || c.initialState,
                          t,
                          motion.matches ||
                            !!(state.choice && state.choice.paused),
                        ),
                        worldX: loc.x + pl.x,
                        y: pl.y || 0,
                        z: pl.z == null ? 3 : pl.z,
                        flip: !!pl.flip,
                      }
                    : null;
                })
                .filter(Boolean);
              return props.concat([me], cast);
            }
            renderFrame = function (t, dt) {
              r.setPose(pose(t));
              r.render("stage", previewStart + t, dt);
            };
            sync();
          });
        })
        .catch(function () {
          dispose();
          canvas.remove();
        });
    }
  }

  function openPicker() {
    ensureCss();
    var existing = document.getElementById("lpWorldPicker");
    if (existing) {
      if (typeof existing.close === "function") existing.close();
      existing.remove();
    }
    var dlg = el("dialog", {
      id: "lpWorldPicker",
      class: "lp-world-picker",
      "data-world-ui": "",
      "aria-labelledby": "lpWorldPickerTitle",
    });
    var form = el("form", { method: "dialog", class: "lp-world-picker-form" });
    form.appendChild(
      el(
        "h2",
        { id: "lpWorldPickerTitle" },
        tr("world.pickerTitle", "Оформление"),
      ),
    );
    form.appendChild(
      el("p", { class: "lp-world-picker-lead" }, tr("world.pickerLead", "")),
    );

    var current = state.choice ? state.choice.id : "";
    var list = el("fieldset", { class: "lp-world-options" });
    list.appendChild(
      el(
        "legend",
        { class: "lp-world-sr" },
        tr("world.pickerTitle", "Оформление"),
      ),
    );
    function option(value, title, note, badge, parent) {
      var label = el("label", { class: "lp-world-option" });
      var input = el("input", { type: "radio", name: "lpWorld", value: value });
      if (value === current) input.checked = true;
      var copy = el("span", { class: "lp-world-option-copy" });
      if (badge)
        copy.appendChild(el("span", { class: "lp-world-badge" }, badge));
      copy.appendChild(el("span", { class: "lp-world-option-title" }, title));
      if (note)
        copy.appendChild(el("span", { class: "lp-world-option-note" }, note));
      label.appendChild(input);
      label.appendChild(copy);
      (parent || list).appendChild(label);
      return copy;
    }
    option(
      "",
      tr("world.classic", "LinguistPro Classic"),
      tr("world.classicNote", ""),
    );
    Object.keys(CATEGORIES).forEach(function (category) {
      var ids = Object.keys(REGISTRY).filter(function (id) {
        var reg = REGISTRY[id];
        return (
          !reg.retired &&
          (own(CATEGORIES, reg.category) ? reg.category : "other") === category
        );
      });
      if (!ids.length) return;
      var group = el("fieldset", {
        class: "lp-world-category",
        "data-category": category,
      });
      group.appendChild(
        el(
          "legend",
          {},
          CATEGORIES[category][locale()] || CATEGORIES[category].ru,
        ),
      );
      list.appendChild(group);
      ids.forEach(function (id) {
        var reg = REGISTRY[id];
        var copy = option(
          id,
          (reg.names && reg.names[locale()]) || id,
          reg.note ? reg.note[locale()] || reg.note.ru : tr(reg.noteKey, ""),
          reg.badge
            ? reg.badge[locale()] || reg.badge.ru
            : tr(reg.badgeKey, ""),
          group,
        );
        mountPreview(copy, id, dlg);
      });
    });
    form.appendChild(list);

    var modes = el("fieldset", { class: "lp-world-modes" });
    modes.appendChild(el("legend", {}, tr("world.modeLegend", "Движение")));
    [
      ["live", tr("world.modeLive", "Живой")],
      ["calm", tr("world.modeCalm", "Спокойный")],
    ].forEach(function (m) {
      var label = el("label", {
        class: "lp-world-option lp-world-option-compact",
      });
      var input = el("input", {
        type: "radio",
        name: "lpWorldMode",
        value: m[0],
      });
      if ((state.choice ? state.choice.mode : "live") === m[0])
        input.checked = true;
      label.appendChild(input);
      label.appendChild(el("span", { class: "lp-world-option-title" }, m[1]));
      modes.appendChild(label);
    });
    form.appendChild(modes);

    var lights = el("fieldset", { class: "lp-world-modes lp-world-lights" });
    lights.appendChild(el("legend", {}, tr("world.lightLegend", "Освещение")));
    [
      ["auto", tr("world.lightAuto", "По времени суток")],
      ["day", tr("world.lightDay", "День")],
      ["dusk", tr("world.lightDusk", "Закат")],
      ["night", tr("world.lightNight", "Ночь")],
    ].forEach(function (m) {
      var label = el("label", {
        class: "lp-world-option lp-world-option-compact",
      });
      var input = el("input", {
        type: "radio",
        name: "lpWorldLight",
        value: m[0],
      });
      if (((state.choice && state.choice.lighting) || "auto") === m[0])
        input.checked = true;
      label.appendChild(input);
      label.appendChild(el("span", { class: "lp-world-option-title" }, m[1]));
      lights.appendChild(label);
    });
    form.appendChild(lights);
    form.appendChild(
      el("p", { class: "lp-world-privacy" }, tr("world.privacy", "")),
    );

    var actions = el("div", { class: "lp-world-actions" });
    var preview = el(
      "button",
      { type: "button", class: "lp-world-btn", "data-action": "preview" },
      tr("world.preview", "Показать сценку"),
    );
    var done = el(
      "button",
      {
        type: "submit",
        class: "lp-world-btn lp-world-btn-primary",
        value: "done",
      },
      tr("world.done", "Готово"),
    );
    actions.appendChild(preview);
    actions.appendChild(done);
    form.appendChild(actions);
    dlg.appendChild(form);
    document.body.appendChild(dlg);

    function selected() {
      var w = form.querySelector("input[name=lpWorld]:checked");
      var m = form.querySelector("input[name=lpWorldMode]:checked");
      var li = form.querySelector("input[name=lpWorldLight]:checked");
      return {
        id: w ? w.value : "",
        mode: m ? m.value : "live",
        lighting: li ? li.value : "auto",
      };
    }
    function syncModes() {
      modes.disabled = !selected().id;
      lights.disabled = !selected().id;
      preview.disabled = !selected().id;
    }
    function applySelection() {
      var s = selected();
      var same =
        state.choice &&
        state.choice.id === s.id &&
        state.choice.mode === s.mode &&
        (state.choice.lighting || "auto") === s.lighting;
      if (same) return Promise.resolve(true);
      if (!s.id && !state.choice) return Promise.resolve(false);
      if (state.choice && state.choice.id === s.id) {
        var previousPreference = state.choice.lighting || "auto";
        state.choice.mode = s.mode;
        state.choice.lighting = s.lighting;
        storageSet(state.choice);
        if (state.pack) {
          var l = currentLighting();
          if (state.illustrated) {
            state.illustrated.setMode(s.mode);
            return setLighting(l, s.lighting, previousPreference);
          }
          if (state.stage && l !== state.stage.renderer.lighting())
            setLighting(l);
        }
        return Promise.resolve(true);
      }
      return set(s.id || null, s.mode, s.lighting);
    }
    form.addEventListener("change", function (e) {
      syncModes();
      // choosing the world greets with its word (a direct user gesture, never on page load)
      if (e && e.target && e.target.name === "lpWorld" && e.target.value) {
        var selectedReg = REGISTRY[e.target.value];
        if (selectedReg && selectedReg.greeting)
          speakHebrew(selectedReg.greeting);
      }
      applySelection();
    });
    preview.addEventListener("click", function () {
      applySelection().then(function () {
        if (state.illustrated) {
          dlg.close();
          state.illustrated.inspect(state.pack.story.startObject);
          return;
        }
        var first =
          state.pack &&
          (state.pack.scenes || []).filter(function (s) {
            return (
              s.trigger !== "ambient" &&
              (!s.surfaces || s.surfaces.indexOf(state.surfaceKey) >= 0)
            );
          })[0];
        dlg.close();
        var epoch = state.loadEpoch;
        if (first)
          setTimeout(function () {
            if (epoch === state.loadEpoch) play(first.id);
          }, 150);
      });
    });
    dlg.addEventListener("close", function () {
      dlg.remove();
    });
    syncModes();
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    return dlg;
  }

  function current() {
    return state.choice
      ? {
          id: state.choice.id,
          mode: state.choice.mode,
          paused: !!state.choice.paused,
          active: !!state.pack,
        }
      : null;
  }
  function debugState() {
    if (state.illustrated)
      return Object.assign(
        {
          choice: current(),
          engineBuild: ENGINE_BUILD,
          stage: true,
          backdrop: false,
        },
        state.illustrated.debug(),
      );
    return {
      choice: current(),
      governor: state.governor.state(),
      scene: state.scene
        ? { id: state.scene.def.id, kind: state.scene.kind }
        : null,
      walking: !!state.walk,
      location: state.location,
      lighting: state.stage ? state.stage.renderer.lighting() : null,
      busy: busyReason(),
      animating: animating(),
      camera: state.stage ? Math.round(state.stage.renderer.camera()) : null,
      stage: !!state.stage,
      backdrop: !!state.backdrop,
      engineBuild: ENGINE_BUILD,
      character: state.characterReaction ? state.characterReaction.id : null,
      characterTime: state.characterTime,
      targets: state.stage ? state.stage.renderer.targets() : [],
    };
  }

  var api = {
    core: core,
    boot: boot,
    set: set,
    current: current,
    play: play,
    signal: signal,
    goTo: function (id) {
      if (state.pack) goTo(id, false);
    },
    setLighting: function (l) {
      return state.pack && LIGHTINGS.indexOf(l) >= 0
        ? setLighting(l)
        : Promise.resolve(false);
    },
    visit: visit,
    interact: interact,
    explore: function (actionId) {
      return state.illustrated
        ? state.illustrated.act(actionId)
        : Promise.resolve(false);
    },
    storyState: function () {
      return state.illustrated ? state.illustrated.state() : null;
    },
    exportPostcard: function () {
      return state.illustrated ? state.illustrated.exportCanvas() : null;
    },
    togglePause: togglePause,
    stop: endScene,
    openPicker: openPicker,
    debugState: debugState,
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function () {
      boot();
    });
  else boot();
  return api;
});
