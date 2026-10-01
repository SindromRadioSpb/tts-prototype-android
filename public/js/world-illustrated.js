/* App-owned illustrated exploration profile 1. Declarative JSON/PNG only.
 * No pack HTML, scripts, CSS, expressions, media autoplay or remote asset URLs.
 * Sources are explicit, user-clicked links to narrowly allowlisted factual references.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LPWorldIllustrated = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var PROFILE = "illustrated-exploration/1";
  var BLINK_CAPABILITY = "illustrated-blink/1";
  var SOURCE_HOSTS = [
    "jerusalempottery.biz",
    "www.jerusalempottery.biz",
    "imj.org.il",
    "www.imj.org.il",
    "ybz.org.il",
    "www.ybz.org.il",
    "ben-zvi.org.il",
    "www.ben-zvi.org.il",
    "nli.org.il",
    "www.nli.org.il",
    "whc.unesco.org",
    "jerusalem.muni.il",
    "www.jerusalem.muni.il",
    "iaa.org.il",
    "www.iaa.org.il",
    "israelmuseum.org.il",
    "www.israelmuseum.org.il",
    "armenianceramics.org",
    "static.parks.org.il",
  ];
  var LANGS = ["ru", "en", "he"],
    BANNED = ["__proto__", "constructor", "prototype"];
  function own(o, k) {
    return (
      !!o && Object.prototype.hasOwnProperty.call(o, k) && BANNED.indexOf(k) < 0
    );
  }
  function dict(o) {
    return (
      !!o &&
      typeof o === "object" &&
      !Array.isArray(o) &&
      Object.keys(o).every(function (k) {
        return BANNED.indexOf(k) < 0;
      })
    );
  }
  function id(s) {
    return (
      typeof s === "string" &&
      /^[a-z][a-z0-9-]{0,63}$/.test(s) &&
      BANNED.indexOf(s) < 0
    );
  }
  function text(s) {
    return (
      typeof s === "string" &&
      s.trim().length > 0 &&
      s.length <= 5000 &&
      !/[<>\u0000-\u0008]/.test(s)
    );
  }
  function localized(o) {
    return (
      dict(o) &&
      LANGS.every(function (l) {
        return own(o, l) && text(o[l]);
      }) &&
      Object.keys(o).every(function (k) {
        return LANGS.indexOf(k) >= 0;
      })
    );
  }
  function num(n, a, b) {
    return typeof n === "number" && Number.isFinite(n) && n >= a && n <= b;
  }
  function listRefs(a, o, max) {
    return (
      Array.isArray(a) &&
      a.length <= max &&
      a.every(function (k) {
        return id(k) && own(o, k);
      }) &&
      new Set(a).size === a.length
    );
  }
  function tuple(a, n, min, max) {
    return (
      Array.isArray(a) &&
      a.length === n &&
      a.every(function (v) {
        return num(v, min, max);
      })
    );
  }
  function safeSource(url) {
    try {
      var u = new URL(url);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        SOURCE_HOSTS.indexOf(u.hostname) >= 0
      );
    } catch (_) {
      return false;
    }
  }
  function exact(o, keys) {
    return (
      dict(o) &&
      Object.keys(o).every(function (k) {
        return keys.indexOf(k) >= 0;
      })
    );
  }
  // Registered overlays are source-frame rectangles, never replacement bodies.
  function validateBlink(layer, sheets) {
    try {
      var b = layer.blink, pose = layer.poses && layer.poses[b.pose];
      if (!layer.actor || !exact(b, ["schema", "pose", "base", "states", "sequence", "idleGapMs"]) ||
          b.schema !== "lp-character-blink/1" || !id(b.pose) || !pose ||
          !exact(b.base, ["sheet", "frame", "sha256"]) ||
          b.base.sheet !== pose.sheet || b.base.frame !== pose.frame ||
          !/^[a-f0-9]{64}$/.test(b.base.sha256) ||
          !own(sheets, b.base.sheet) || sheets[b.base.sheet].sha256 !== b.base.sha256 ||
          !own(sheets[b.base.sheet].frames, b.base.frame) ||
          !exact(b.states, ["half", "closed"]) || !own(b.states, "closed") ||
          !Array.isArray(b.sequence) || b.sequence.length < 1 || b.sequence.length > 3 ||
          !tuple(b.idleGapMs, 2, 2500, 15000) || !b.idleGapMs.every(Number.isInteger) ||
          b.idleGapMs[1] - b.idleGapMs[0] < 1000) return false;
      var base = sheets[b.base.sheet].frames[b.base.frame], total = 0;
      var good = Object.keys(b.states).every(function (state) {
        var patches = b.states[state], area = 0;
        if (!Array.isArray(patches) || patches.length !== 2) return false;
        var rectangles = [];
        return patches.every(function (p) {
          if (!exact(p, ["sheet", "frame", "rect"]) || !own(sheets, p.sheet) ||
              p.sheet === b.base.sheet || !own(sheets[p.sheet].frames, p.frame) ||
              !tuple(p.rect, 4, 0, 8192) || !p.rect.every(Number.isInteger)) return false;
          var sheet = sheets[p.sheet], frame = sheet.frames[p.frame], r = p.rect;
          area += r[2] * r[3];
          if (!/^[a-f0-9]{64}$/.test(sheet.sha256) || !Number.isInteger(sheet.bytes) ||
              !num(sheet.bytes, 1, 100000) || r[2] !== frame.w || r[3] !== frame.h ||
              r[2] < 1 || r[3] < 1 || r[0] + r[2] > base.w || r[1] + r[3] > base.h / 2 ||
              area > base.w * base.h * 0.025 || rectangles.some(function (a) {
                var overlap = Math.max(0, Math.min(r[0]+r[2],a[0]+a[2])-Math.max(r[0],a[0])) * Math.max(0, Math.min(r[1]+r[3],a[1]+a[3])-Math.max(r[1],a[1]));
                return overlap > Math.min(r[2]*r[3],a[2]*a[3]) * 0.05;
              })) return false;
          rectangles.push(r); return true;
        });
      });
      if (!good || !b.sequence.every(function (step) {
        total += step.ms;
        return exact(step, ["state", "ms"]) && own(b.states, step.state) &&
          Number.isInteger(step.ms) && num(step.ms, 25, 200);
      }) || total > 400) return false;
      return own(b.states, "half")
        ? b.sequence.length === 3 && b.sequence[0].state === "half" && b.sequence[1].state === "closed" && b.sequence[2].state === "half"
        : b.sequence.length === 1 && b.sequence[0].state === "closed";
    } catch (_) { return false; }
  }
  function blinkMatches(layer, poses) {
    var b = layer.blink, p = poses && poses[layer.actor];
    return !!b && (p ? p === b.pose : layer.sheet === b.base.sheet && layer.frame === b.base.frame);
  }
  // One wake per eyelid boundary, no idle RAF. Delayed wakes never replay missed blinks.
  function createBlinkClock(layers, random) {
    var slots = {}, definitions = layers.filter(function (l) { return !!l.blink; });
    random = random || Math.random;
    function schedule(layer, now) {
      var b = layer.blink, lo = now + b.idleGapMs[0], hi = now + b.idleGapMs[1],
        at = lo + Math.round(Math.max(0, Math.min(1, random())) * (hi - lo));
      Object.keys(slots).forEach(function (who) {
        if (who === layer.actor || Math.abs(slots[who].at - at) >= 450) return;
        var after = slots[who].at + 450, before = slots[who].at - 450;
        at = after <= hi ? Math.max(lo, after) : Math.min(hi, before);
      });
      slots[layer.actor] = { at: at };
    }
    return {
      reset: function () { slots = {}; },
      advance: function (now, poses, enabled) {
        var states = {}, nextAt = Infinity;
        if (!enabled) { slots = {}; return { states: states, nextAt: null }; }
        definitions.forEach(function (l) {
          if (!blinkMatches(l, poses)) { delete slots[l.actor]; return; }
          if (!slots[l.actor]) schedule(l, now);
          var slot = slots[l.actor], elapsed = now - slot.at, total = 0, state = null, boundary = slot.at;
          l.blink.sequence.forEach(function (step) {
            total += step.ms;
            if (elapsed >= 0 && elapsed < total && state === null) { state = step.state; boundary = slot.at + total; }
          });
          if (elapsed >= total) { schedule(l, now); boundary = slots[l.actor].at; }
          if (state) states[l.actor] = state;
          nextAt = Math.min(nextAt, boundary);
        });
        return { states: states, nextAt: nextAt === Infinity ? null : nextAt };
      },
      debug: function () { return JSON.parse(JSON.stringify(slots)); },
    };
  }
  function validate(pack, atlas, expected) {
    var e = [];
    function bad(s) {
      e.push(s);
    }
    try {
      if (
        !dict(pack) ||
        pack.schema !== "lp-world/2" ||
        pack.profile !== PROFILE
      )
        return {
          ok: false,
          errors: ["illustrated schema"],
        };
      if (pack.id !== expected || !id(pack.id) || !text(pack.version))
        bad("identity");
      if (
        !dict(pack.engine) ||
        pack.engine.min !== 2.2 ||
        pack.engine.max !== 2.2 ||
        !Array.isArray(pack.requiredCapabilities) ||
        (pack.requiredCapabilities.length !== 1 && pack.requiredCapabilities.length !== 2) ||
        pack.requiredCapabilities[0] !== PROFILE ||
        (pack.requiredCapabilities.length === 2 && pack.requiredCapabilities[1] !== BLINK_CAPABILITY)
      )
        bad("illustrated capability gate");
      if (
        !localized(pack.names) ||
        !localized(pack.blurb) ||
        !localized(pack.disclaimer)
      )
        bad("localized identity");
      if (
        !dict(atlas) ||
        atlas.schema !== "lp-world-atlas/1" ||
        atlas.world !== expected ||
        !dict(atlas.atlases)
      )
        bad("atlas");
      var sheets = atlas.atlases || {},
        decoded = 0;
      Object.keys(sheets).forEach(function (k) {
        var a = sheets[k];
        if (
          !id(k) ||
          !dict(a) ||
          !/[a-z0-9-]+\.png$/.test(a.file || "") ||
          !/^[a-z0-9-]+\.png$/.test(a.file || "") ||
          !Number.isInteger(a.width) ||
          !Number.isInteger(a.height) ||
          !num(a.width, 1, 8192) ||
          !num(a.height, 1, 8192) ||
          !dict(a.frames)
        ) {
          bad("sheet " + k);
          return;
        }
        decoded += a.width * a.height * 4;
        Object.keys(a.frames).forEach(function (f) {
          var r = a.frames[f];
          if (
            !id(f) ||
            !dict(r) ||
            !["x", "y", "w", "h"].every(function (n) {
              return Number.isInteger(r[n]);
            }) ||
            !num(r.x, 0, a.width) ||
            !num(r.y, 0, a.height) ||
            !num(r.w, 1, a.width) ||
            !num(r.h, 1, a.height) ||
            r.x + r.w > a.width ||
            r.y + r.h > a.height ||
            !tuple(r.anchor, 2, 0, 8192) ||
            r.anchor[0] >= r.w ||
            r.anchor[1] >= r.h
          )
            bad("frame " + k + "." + f);
        });
      });
      if (decoded > 240 * 1024 * 1024 || Object.keys(sheets).length > 40)
        bad("asset budget");
      function sprite(s) {
        return (
          exact(s, ["sheet", "frame", "width"]) &&
          (!own(s, "width") || num(s.width, 1, 4096)) &&
          own(sheets, s.sheet) &&
          own(sheets[s.sheet].frames, s.frame)
        );
      }
      if (!sprite(pack.preview)) bad("preview asset");
      var scene = pack.illustration,
        story = pack.story,
        objects = pack.objects,
        sources = pack.sources,
        characters = pack.cast;
      if (
        !exact(scene, [
          "width",
          "height",
          "background",
          "layers",
          "camera",
          "lighting",
          "surfaces",
        ]) ||
        !num(scene.width, 400, 4096) ||
        !num(scene.height, 300, 4096) ||
        !sprite(scene.background) ||
        !exact(scene.camera, ["welcome"]) ||
        !tuple(scene.camera.welcome, 3, 0, 4096) ||
        !num(scene.camera.welcome[2], 1, 3) ||
        scene.camera.welcome[0] > scene.width ||
        scene.camera.welcome[1] > scene.height
      )
        bad("scene");
      if (!Array.isArray(scene.layers) || scene.layers.length > 24)
        bad("layers");
      else
        scene.layers.forEach(function (l) {
          if (
            !exact(l, [
              "id",
              "sheet",
              "frame",
              "x",
              "y",
              "width",
              "z",
              "actor",
              "poses",
              "blink",
            ]) ||
            !id(l.id) ||
            !sprite({
              sheet: l.sheet,
              frame: l.frame,
            }) ||
            !num(l.x, -4096, 8192) ||
            !num(l.y, -4096, 8192) ||
            !num(l.width, 1, 4096) ||
            !num(l.z, 0, 30)
          )
            bad("layer");
          if (l.actor && !own(characters, l.actor)) bad("layer actor");
          if (
            l.poses &&
            (!dict(l.poses) ||
              Object.keys(l.poses).some(function (p) {
                return !id(p) || !sprite(l.poses[p]);
              }))
          )
            bad("poses");
          if (own(l, "blink") && !validateBlink(l, sheets)) bad("blink " + l.id);
        });
      var hasBlinks = Array.isArray(scene.layers) && scene.layers.some(function (l) { return own(l, "blink"); });
      if (hasBlinks !== (pack.requiredCapabilities.indexOf(BLINK_CAPABILITY) >= 0)) bad("blink capability gate");
      if (scene.surfaces) {
        if (!exact(scene.surfaces, ["studio", "room", "mediatheque"]))
          bad("surfaces");
        else
          Object.keys(scene.surfaces).forEach(function (k) {
            var su = scene.surfaces[k];
            if (
              !exact(su, [
                "background",
                "layers",
                "welcome",
                "label",
                "panels",
                "backgroundLighting",
              ]) ||
              !sprite(su.background) ||
              !Array.isArray(su.layers) ||
              su.layers.some(function (id) {
                return !scene.layers.some(function (l) {
                  return l.id === id;
                });
              }) ||
              !tuple(su.welcome, 3, 0, 4096) ||
              !localized(su.label)
            )
              bad("surface " + k);
            if (
              su.backgroundLighting &&
              (!exact(su.backgroundLighting, ["day", "dusk", "night"]) ||
                Object.keys(su.backgroundLighting).some(function (l) {
                  return !sprite(su.backgroundLighting[l]);
                }))
            )
              bad("surface lighting " + k);
            if (
              su.panels &&
              (!Array.isArray(su.panels) ||
                su.panels.length > 8 ||
                su.panels.some(function (p) {
                  return (
                    !exact(p, [
                      "rect",
                      "title",
                      "subtitle",
                      "art",
                      "tone",
                      "flag",
                    ]) ||
                    !tuple(p.rect, 4, 0, 4096) ||
                    p.rect[2] <= 0 ||
                    p.rect[3] <= 0 ||
                    p.rect[0] + p.rect[2] > scene.width ||
                    p.rect[1] + p.rect[3] > scene.height ||
                    !localized(p.title) ||
                    !localized(p.subtitle) ||
                    (p.art && !sprite(p.art)) ||
                    (p.flag && !own(story.flags, p.flag)) ||
                    ["paper", "screen"].indexOf(p.tone) < 0
                  );
                }))
            )
              bad("surface panels " + k);
          });
      }
      if (
        !dict(objects) ||
        !Object.keys(objects).length ||
        Object.keys(objects).length > 32
      )
        bad("objects");
      if (!dict(sources) || Object.keys(sources).length > 40) bad("sources");
      else
        Object.keys(sources).forEach(function (k) {
          var s = sources[k];
          if (
            !id(k) ||
            !exact(s, ["title", "url", "note"]) ||
            !localized(s.title) ||
            !safeSource(s.url) ||
            !localized(s.note)
          )
            bad("source " + k);
        });
      if (!dict(characters) || Object.keys(characters).length > 6) bad("cast");
      else
        Object.keys(characters).forEach(function (k) {
          var c = characters[k];
          if (
            !id(k) ||
            !exact(c, ["names", "identity", "portrait", "motivation"]) ||
            !localized(c.names) ||
            !localized(c.identity) ||
            !localized(c.motivation) ||
            !sprite(c.portrait)
          )
            bad("cast " + k);
        });
      if (
        !exact(story, [
          "title",
          "opening",
          "flags",
          "actions",
          "captions",
          "phrases",
          "ending",
          "draftLabel",
          "notebookTitle",
          "nextLabel",
          "needsEvidence",
          "completionFlag",
          "startObject",
          "exportSources",
          "progressVersion",
        ]) ||
        !localized(story.title) ||
        !localized(story.opening) ||
        !localized(story.ending) ||
        !localized(story.draftLabel) ||
        !localized(story.notebookTitle) ||
        !localized(story.nextLabel) ||
        !localized(story.needsEvidence) ||
        !id(story.completionFlag) ||
        !own(objects, story.startObject) ||
        !dict(story.flags) ||
        Object.keys(story.flags).length > 24 ||
        Object.keys(story.flags).some(function (k) {
          return !id(k) || typeof story.flags[k] !== "boolean";
        }) ||
        !dict(story.actions) ||
        Object.keys(story.actions).length > 48 ||
        !dict(story.captions) ||
        !dict(story.phrases)
      )
        bad("story");
      Object.keys(story.phrases || {}).forEach(function (k) {
        var p = story.phrases[k];
        if (
          !id(k) ||
          !exact(p, ["he", "translation", "context"]) ||
          !text(p.he) ||
          !localized(p.translation) ||
          !localized(p.context)
        )
          bad("phrase " + k);
      });
      Object.keys(story.captions || {}).forEach(function (k) {
        var c = story.captions[k];
        if (
          !id(k) ||
          !exact(c, ["text", "requires"]) ||
          !localized(c.text) ||
          !listRefs(c.requires, story.flags, 24)
        )
          bad("caption " + k);
      });
      if (own(story, "progressVersion") && !/^\d+\.\d+\.\d+$/.test(story.progressVersion)) bad("progress version");
      if (!listRefs(story.exportSources, sources, 3)) bad("export sources");
      if (!own(story.captions, "initial")) bad("initial caption");
      if (!own(story.flags, story.completionFlag)) bad("completion flag");
      Object.keys(story.actions || {}).forEach(function (k) {
        var a = story.actions[k];
        if (
          !id(k) ||
          !exact(a, [
            "label",
            "requires",
            "sets",
            "caption",
            "view",
            "object",
            "poses",
            "collect",
            "message",
          ]) ||
          !localized(a.label) ||
          !listRefs(a.requires, story.flags, 24) ||
          !dict(a.sets) ||
          Object.keys(a.sets).some(function (f) {
            return !own(story.flags, f) || typeof a.sets[f] !== "boolean";
          }) ||
          !own(objects, a.object) ||
          !localized(a.message) ||
          !listRefs(a.collect, story.phrases, 24)
        )
          bad("action " + k);
        if (
          a.caption &&
          (!own(story.captions, a.caption) ||
            story.captions[a.caption].requires.some(function (f) {
              return a.requires.indexOf(f) < 0 && a.sets[f] !== true;
            }))
        )
          bad("caption requires " + k);
        if (a.view && !own(objects[a.object].views, a.view))
          bad("view action " + k);
        if (
          a.poses &&
          (!dict(a.poses) ||
            Object.keys(a.poses).some(function (who) {
              return (
                !own(characters, who) ||
                !scene.layers.some(function (l) {
                  return l.actor === who && own(l.poses, a.poses[who]);
                })
              );
            }))
        )
          bad("action poses " + k);
      });
      Object.keys(objects || {}).forEach(function (k) {
        var o = objects[k];
        if (
          !id(k) ||
          !exact(o, [
            "title",
            "hook",
            "body",
            "fiction",
            "focal",
            "hit",
            "sources",
            "actions",
            "phrase",
            "views",
            "initialView",
            "kind",
            "layer",
            "affordance",
            "approach",
          ]) ||
          !localized(o.title) ||
          !localized(o.hook) ||
          !localized(o.body) ||
          !localized(o.fiction) ||
          !tuple(o.focal, 3, 0, 4096) ||
          !num(o.focal[2], 1, 3) ||
          !tuple(o.hit, 4, 0, 4096) ||
          o.hit[2] <= 0 ||
          o.hit[3] <= 0 ||
          o.hit[0] + o.hit[2] > scene.width ||
          o.hit[1] + o.hit[3] > scene.height ||
          o.focal[0] > scene.width ||
          o.focal[1] > scene.height ||
          !scene.layers.some(function (l) {
            return l.id === o.layer;
          }) ||
          !listRefs(o.sources, sources, 12) ||
          !listRefs(o.actions, story.actions, 12) ||
          !dict(o.views) ||
          !own(o.views, o.initialView) ||
          !localized(o.kind) ||
          (o.affordance && ["scene", "panel"].indexOf(o.affordance) < 0) ||
          (o.approach &&
            (!tuple(o.approach, 2, 0, 4096) ||
              o.approach[0] > scene.width ||
              o.approach[1] > scene.height)) ||
          (o.phrase && !own(story.phrases, o.phrase))
        )
          bad("object " + k);
        Object.keys(o.views || {}).forEach(function (v) {
          var p = o.views[v];
          if (
            !id(v) ||
            !exact(p, ["title", "text", "art", "layout", "badges"]) ||
            !localized(p.title) ||
            !localized(p.text) ||
            (p.art && !sprite(p.art)) ||
            (p.layout &&
              [
                "sign-before",
                "sign-after",
                "postcard",
                "source-window",
                "line-study",
                "provenance",
              ].indexOf(p.layout) < 0) ||
            (p.badges &&
              (!Array.isArray(p.badges) ||
                p.badges.length > 8 ||
                !p.badges.every(localized)))
          )
            bad("view " + k + "." + v);
        });
      });
    } catch (_) {
      bad("malformed illustrated pack");
    }
    return {
      ok: e.length === 0,
      errors: e,
    };
  }
  function initialState(pack) {
    return {
      flags: Object.assign({}, pack.story.flags),
      caption: "initial",
      notebook: [],
      views: {},
      poses: {},
      selected: null,
      message: null,
      complete: false,
    };
  }
  function hydrate(pack, raw) {
    var s = initialState(pack);
    if (!dict(raw)) return s;
    Object.keys(s.flags).forEach(function (k) {
      if (raw.flags && typeof raw.flags[k] === "boolean")
        s.flags[k] = raw.flags[k];
    });
    if (
      own(pack.story.captions, raw.caption) &&
      pack.story.captions[raw.caption].requires.every(function (k) {
        return s.flags[k];
      })
    )
      s.caption = raw.caption;
    if (Array.isArray(raw.notebook))
      s.notebook = raw.notebook
        .filter(function (k, i, a) {
          return own(pack.story.phrases, k) && a.indexOf(k) === i;
        })
        .slice(0, 24);
    Object.keys(pack.objects).forEach(function (k) {
      if (raw.views && own(pack.objects[k].views, raw.views[k]))
        s.views[k] = raw.views[k];
    });
    s.complete =
      s.caption !== "initial" && !!s.flags[pack.story.completionFlag];
    return s;
  }
  function reduce(pack, state, actionId) {
    if (!own(pack.story.actions, actionId))
      return {
        state: state,
        changed: false,
        reason: "unknown-action",
      };
    var a = pack.story.actions[actionId];
    if (
      !a.requires.every(function (k) {
        return state.flags[k];
      })
    )
      return {
        state: state,
        changed: false,
        reason: "needs-evidence",
      };
    var n = JSON.parse(JSON.stringify(state));
    Object.keys(a.sets).forEach(function (k) {
      n.flags[k] = a.sets[k];
    });
    if (
      a.caption &&
      (!state.complete || own(a.sets, pack.story.completionFlag))
    )
      n.caption = a.caption;
    if (a.view) n.views[a.object] = a.view;
    if (a.poses)
      Object.keys(a.poses).forEach(function (k) {
        n.poses[k] = a.poses[k];
      });
    a.collect.forEach(function (k) {
      if (n.notebook.indexOf(k) < 0) n.notebook.push(k);
    });
    n.selected = a.object;
    n.message = a.message;
    n.complete = !!n.flags[pack.story.completionFlag];
    return {
      state: n,
      changed: true,
    };
  }
  function camera(scene, w, h, focal) {
    var f = focal || scene.camera.welcome,
      z = Math.max(1, Math.min(3, f[2] || 1)),
      vh = scene.height / z,
      vw = (vh * w) / h;
    if (vw > scene.width) {
      vw = scene.width;
      vh = (vw * h) / w;
    }
    return {
      x: Math.max(0, Math.min(scene.width - vw, f[0] - vw / 2)),
      y: Math.max(0, Math.min(scene.height - vh, f[1] - vh / 2)),
      w: vw,
      h: vh,
    };
  }
  function stagePoint(cam, width, height, x, y) {
    return {
      x: ((x - cam.x) * width) / cam.w,
      y: ((y - cam.y) * height) / cam.h,
    };
  }
  function sceneFor(pack, surface, lighting) {
    var base = pack.illustration,
      su = base.surfaces && base.surfaces[surface || "studio"];
    if (!su) return base;
    return Object.assign({}, base, {
      background:
        (su.backgroundLighting && su.backgroundLighting[lighting || "dusk"]) ||
        su.background,
      authoredLight: !!(
        su.backgroundLighting && su.backgroundLighting[lighting || "dusk"]
      ),
      layers: base.layers.filter(function (l) {
        return su.layers.indexOf(l.id) >= 0;
      }),
      camera: {
        welcome: su.welcome,
      },
      panels: su.panels || [],
      locationLabel: su.label,
    });
  }
  function frameRect(atlas, s) {
    return atlas.atlases[s.sheet].frames[s.frame];
  }
  function draw(canvas, pack, atlas, images, state, opts) {
    opts = opts || {};
    var ctx = canvas.getContext("2d"),
      W = canvas.width,
      H = canvas.height,
      sc = sceneFor(pack, opts.surface, opts.lighting),
      cam = opts.camera || camera(sc, W, H, opts.focal),
      scale = W / cam.w;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    function sprite(spec, x, y, width, ground, flip, overlays) {
      var a = atlas.atlases[spec.sheet],
        f = a.frames[spec.frame],
        im = images[a.file];
      if (!im) return;
      var k = width / f.w,
        dx = x - (ground ? (flip ? f.w - f.anchor[0] : f.anchor[0]) * k : 0),
        dy = y - (ground ? f.anchor[1] * k : 0);
      if (flip) {
        ctx.save();
        ctx.translate(
          (dx - cam.x) * scale + f.w * k * scale,
          (dy - cam.y) * scale,
        );
        ctx.scale(-1, 1);
        ctx.drawImage(
          im,
          f.x,
          f.y,
          f.w,
          f.h,
          0,
          0,
          f.w * k * scale,
          f.h * k * scale,
        );
        patches(0, 0);
        ctx.restore();
      } else {
        ctx.drawImage(
          im,
          f.x,
          f.y,
          f.w,
          f.h,
          (dx - cam.x) * scale,
          (dy - cam.y) * scale,
          f.w * k * scale,
          f.h * k * scale,
        );
        patches((dx - cam.x) * scale, (dy - cam.y) * scale);
      }
      function patches(ox, oy) {
        (overlays || []).forEach(function (p) {
          var pa = atlas.atlases[p.sheet], pf = pa.frames[p.frame], pi = images[pa.file], r = p.rect;
          if (pi) ctx.drawImage(pi, pf.x, pf.y, pf.w, pf.h,
            ox + r[0] * k * scale, oy + r[1] * k * scale, r[2] * k * scale, r[3] * k * scale);
        });
      }
    }
    sprite(sc.background, 0, 0, sc.width, false);
    (sc.panels || []).forEach(function (p) {
      var r = p.rect,
        x = (r[0] - cam.x) * scale,
        y = (r[1] - cam.y) * scale,
        w = r[2] * scale,
        h = r[3] * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = p.tone === "screen" ? "#172936" : "#efe5d0";
      ctx.fillRect(x, y, w, h);
      if (p.art) {
        var aa = atlas.atlases[p.art.sheet],
          ff = aa.frames[p.art.frame],
          ii = images[aa.file];
        if (ii) {
          var fit = Math.min((w - 16 * scale) / ff.w, (h * 0.6) / ff.h);
          ctx.drawImage(
            ii,
            ff.x,
            ff.y,
            ff.w,
            ff.h,
            x + (w - ff.w * fit) / 2,
            y + h * 0.16,
            ff.w * fit,
            ff.h * fit,
          );
        }
      }
      var lang = opts.locale || "ru",
        compactPanel = r[3] < 65;
      ctx.fillStyle = p.tone === "screen" ? "#f1dfb8" : "#294454";
      ctx.textAlign = "center";
      ctx.font =
        Math.max(
          9,
          Math.round((compactPanel ? Math.min(16, r[3] * 0.38) : 18) * scale),
        ) +
        (lang === "he"
          ? 'px "Noto Sans Hebrew", "DejaVu Sans", sans-serif'
          : "px Georgia");
      var label = p.title[lang] || p.title.ru;
      ctx.fillText(
        label,
        x + w / 2,
        compactPanel ? y + h / 2 + 5 * scale : y + 27 * scale,
        Math.max(1, w - 12 * scale),
      );
      ctx.font =
        Math.max(9, Math.round(11 * scale)) +
        'px "Noto Sans Hebrew", "DejaVu Sans", sans-serif';
      if (!compactPanel)
        ctx.fillText(
          p.subtitle[lang] || p.subtitle.ru,
          x + w / 2,
          y + h - 16 * scale,
          Math.max(1, w - 12 * scale),
        );
      if (p.flag && state.flags[p.flag]) {
        ctx.fillStyle = "#c2b16f";
        ctx.fillRect(
          x + 12 * scale,
          y + h - 7 * scale,
          w - 24 * scale,
          3 * scale,
        );
      }
      ctx.restore();
    });
    sc.layers
      .slice()
      .sort(function (a, b) {
        return a.z - b.z;
      })
      .forEach(function (l) {
        var at = (l.actor && state.positions && state.positions[l.actor]) || [
            l.x,
            l.y,
          ],
          lx = at[0],
          ly = at[1],
          pose = l.actor && state.poses[l.actor],
          spec =
            pose && l.poses && own(l.poses, pose)
              ? l.poses[pose]
              : {
                  sheet: l.sheet,
                  frame: l.frame,
                },
          width =
            (spec.width || l.width) * (l.actor ? opts.actorScale || 1 : 1);
        if (l.actor) {
          ctx.save();
          var sx = (lx - cam.x) * scale,
            sy = (ly - cam.y + 3) * scale,
            rad = Math.max(24, Math.min(85, width * 0.21)) * scale;
          ctx.translate(sx + rad * 0.35, sy);
          ctx.scale(1, 0.22);
          var sh = ctx.createRadialGradient(0, 0, rad * 0.06, 0, 0, rad);
          sh.addColorStop(0, "rgba(35,24,19,.31)");
          sh.addColorStop(1, "rgba(35,24,19,0)");
          ctx.fillStyle = sh;
          ctx.beginPath();
          ctx.arc(0, 0, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        sprite(
          spec,
          lx,
          ly,
          width,
          true,
          l.actor && state.flips && state.flips[l.actor],
          blinkMatches(l, state.poses) && state.blinks && l.blink.states[state.blinks[l.actor]],
        );
      });
    if (
      !sc.authoredLight &&
      (opts.lighting === "night" || opts.lighting === "dusk")
    ) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle =
        opts.lighting === "night"
          ? "rgba(47,64,104,.57)"
          : "rgba(126,96,135,.18)";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    return cam;
  }
  // A hit belongs to a visible painted layer, not just its bounding rectangle.
  // Alpha buffers are derived from decoded local assets and cached per image.
  var alphaCache = typeof WeakMap === "function" ? new WeakMap() : null;
  function alphaAt(image, x, y, makeCanvas) {
    if (!image) return 0;
    var width = image.naturalWidth || image.width,
      height = image.naturalHeight || image.height;
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    var alpha = alphaCache && alphaCache.get(image);
    if (!alpha) {
      var c = makeCanvas(width, height);
      c.width = width;
      c.height = height;
      var ctx = c.getContext("2d");
      ctx.drawImage(image, 0, 0);
      var rgba = ctx.getImageData(0, 0, width, height).data;
      alpha = new Uint8Array(width * height);
      for (var i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
      if (alphaCache) alphaCache.set(image, alpha);
    }
    return alpha[Math.floor(y) * width + Math.floor(x)];
  }
  function pick(
    pack,
    atlas,
    images,
    state,
    x,
    y,
    makeCanvas,
    surface,
    actorScale,
  ) {
    var layers = sceneFor(pack, surface)
      .layers.slice()
      .sort(function (a, b) {
        return a.z - b.z;
      })
      .reverse();
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i],
        at = (l.actor && state.positions && state.positions[l.actor]) || [
          l.x,
          l.y,
        ],
        lx = at[0],
        ly = at[1],
        pose = l.actor && state.poses[l.actor],
        spec =
          pose && l.poses && own(l.poses, pose)
            ? l.poses[pose]
            : {
                sheet: l.sheet,
                frame: l.frame,
              },
        a = atlas.atlases[spec.sheet],
        r = a.frames[spec.frame],
        factor = l.actor ? actorScale || 1 : 1,
        k = ((spec.width || l.width) * factor) / r.w,
        flip = l.actor && state.flips && state.flips[l.actor],
        px = (flip ? -(x - lx) : x - lx) / k + r.anchor[0],
        py = (y - ly) / k + r.anchor[1];
      if (
        px < 0 ||
        py < 0 ||
        px >= r.w ||
        py >= r.h ||
        alphaAt(images[a.file], r.x + px, r.y + py, makeCanvas) < 32
      )
        continue;
      var candidates = Object.keys(pack.objects).filter(function (id) {
        var o = pack.objects[id],
          h = o.hit;
        var hx = lx + (flip ? -(h[0] - l.x + h[2]) : h[0] - l.x) * factor,
          hy = ly + (h[1] - l.y) * factor;
        return (
          o.affordance !== "panel" &&
          o.layer === l.id &&
          x >= hx &&
          x <= hx + h[2] * factor &&
          y >= hy &&
          y <= hy + h[3] * factor
        );
      }); // The top painted layer occludes lower targets, even if it has no object of its own here.
      return candidates.length ? candidates[0] : null;
    }
    return null;
  }
  var UI = {
    ru: {
      explore: "Присмотреться",
      close: "Назад во двор",
      notebook: "Мои находки",
      sources: "Проверить источник",
      pause: "Остановить движение",
      resume: "Продолжить движение",
      draft: "Открытка Тимсаха",
      change: "Подпись изменилась",
      needs: "Сначала найдите обе детали: оборот тарелки и слои таблички",
      reset: "Начать заново",
      collect: "Добавить фразу",
      chapter: "Архивное окно",
      inspect: "Рассмотреть",
      now: "Современный вымышленный двор",
      art: "Авторская иллюстрация, не архивное изображение",
    },
    en: {
      explore: "Look closer",
      close: "Back to the courtyard",
      notebook: "My discoveries",
      sources: "Check the source",
      pause: "Pause motion",
      resume: "Resume motion",
      draft: "Timsah’s postcard",
      change: "The caption changed",
      needs:
        "First discover both details: the plate’s reverse and the sign’s layers",
      reset: "Start again",
      collect: "Keep this phrase",
      chapter: "Archive window",
      inspect: "Inspect",
      now: "Contemporary fictional courtyard",
      art: "Original illustration, not an archival image",
    },
    he: {
      explore: "להתבונן מקרוב",
      close: "חזרה לחצר",
      notebook: "התגליות שלי",
      sources: "בדיקת המקור",
      pause: "עצירת תנועה",
      resume: "המשך תנועה",
      draft: "הגלויה של תמסח",
      change: "הכיתוב השתנה",
      needs: "קודם גלו את שני הפרטים: גב הצלחת ושכבות השלט",
      reset: "להתחיל מחדש",
      collect: "שמירת הביטוי",
      chapter: "חלון לארכיון",
      inspect: "להתבונן",
      now: "חצר עכשווית בדיונית",
      art: "איור מקורי, לא תמונה ארכיונית",
    },
  };
  function create(opts) {
    var pack = opts.pack,
      atlas = opts.atlas,
      images = opts.images,
      surface = opts.surface || "studio",
      scene = sceneFor(pack, surface, opts.lighting || "dusk"),
      host = opts.host,
      doc = opts.document || document,
      locale = opts.locale || "ru",
      paused = !!opts.paused,
      reduced = !!opts.reduced,
      mode = opts.mode || "live",
      lighting = opts.lighting || "day",
      focused = false,
      destroyed = false,
      raf = 0,
      transition = null,
      history = [],
      currentCam = null,
      lastButton = null,
      actionEpoch = 0,
      lightingEpoch = 0,
      positions = {},
      journey = null,
      journeyPose = null,
      blinkTimer = 0,
      blinkEpoch = 0,
      blinkLoad = null,
      blinkFailed = false,
      blinkClosed = false,
      posePending = false,
      blinkStates = {},
      blinkClock = createBlinkClock(scene.layers, opts.random),
      expanded = host.getAttribute("data-world-presentation") === "immersive";
    var key = "lpw_story_" + pack.id + "_" + (pack.story.progressVersion || pack.version),
      state = initialState(pack);
    try {
      state = hydrate(
        pack,
        JSON.parse((opts.storage || localStorage).getItem(key) || "null"),
      );
    } catch (_) {}
    var listeners = [];
    function on(el, ev, fn) {
      el.addEventListener(ev, fn);
      listeners.push([el, ev, fn]);
    }
    function t(x) {
      return (x && (x[locale] || x.ru)) || "";
    }
    function ui(k) {
      return UI[locale][k];
    }
    function el(tag, cls, txt) {
      var n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = txt;
      return n;
    }
    function button(label, fn, cls) {
      var b = el("button", cls, label);
      b.type = "button";
      b.addEventListener("click", fn);
      return b;
    }
    var root = el("section", "lp-illustrated");
    root.setAttribute("data-world-ui", "");
    root.setAttribute("aria-label", t(pack.names));
    root.dir = locale === "he" ? "rtl" : "ltr";
    root.lang = locale;
    var stage = el("div", "lp-illustrated-stage"),
      canvas = doc.createElement("canvas");
    canvas.className = "lp-illustrated-canvas";
    canvas.setAttribute("aria-hidden", "true");
    stage.appendChild(canvas);
    var atmosphere = el("div", "lp-illustrated-atmosphere");
    atmosphere.setAttribute("aria-hidden", "true");
    stage.appendChild(atmosphere);
    var top = el("div", "lp-illustrated-top"),
      chapter = el(
        "span",
        "lp-illustrated-kicker",
        t(scene.locationLabel) || ui("now"),
      ),
      pause = button(
        paused ? ui("resume") : ui("pause"),
        function () {
          opts.onPause();
        },
        "lp-illustrated-pause",
      );
    pause.setAttribute("aria-pressed", String(paused));
    top.appendChild(chapter);
    top.appendChild(pause);
    stage.appendChild(top);
    var markerLayer = el("div", "lp-illustrated-markers");
    stage.appendChild(markerLayer);
    var begin = button(
      t(pack.objects[pack.story.startObject].title),
      function () {
        inspect(pack.story.startObject, begin);
      },
      "lp-illustrated-begin",
    );
    stage.appendChild(begin);
    var collapse = button(
      locale === "ru"
        ? "К занятиям"
        : locale === "he"
          ? "חזרה ללמידה"
          : "Back to learning",
      function () {
        expanded = false;
        clearBlinks(true);
        posePending = false;
        state.selected = null;
        history = [];
        actionEpoch++;
        journey = null;
        journeyPose = null;
        sync();
        size();
        updateMotion();
      },
      "lp-illustrated-collapse",
    );
    stage.appendChild(collapse);
    var storyPanel = el("div", "lp-illustrated-story"),
      eyebrow = el("p", "lp-illustrated-eyebrow", t(pack.story.title)),
      heading = el("h2", "lp-illustrated-title", t(pack.names)),
      opening = el("p", "lp-illustrated-opening", t(pack.story.opening));
    storyPanel.appendChild(eyebrow);
    storyPanel.appendChild(heading);
    storyPanel.appendChild(opening);
    var draft = el("section", "lp-illustrated-draft"),
      draftLabel = el("p", "lp-illustrated-eyebrow", t(pack.story.draftLabel)),
      caption = el("p", "lp-illustrated-caption");
    draft.appendChild(draftLabel);
    draft.appendChild(caption);
    storyPanel.appendChild(draft);
    var nav = el("nav", "lp-illustrated-object-nav");
    nav.setAttribute("aria-label", ui("explore"));
    storyPanel.appendChild(nav);
    var inspector = el("section", "lp-illustrated-inspector");
    inspector.hidden = true;
    inspector.setAttribute("tabindex", "-1");
    var notebook = el("section", "lp-illustrated-notebook");
    notebook.hidden = true;
    var footer = el("div", "lp-illustrated-footer"),
      noteButton = button(
        t(pack.story.notebookTitle),
        function () {
          notebook.hidden = !notebook.hidden;
          renderNotebook();
        },
        "lp-illustrated-secondary",
      ),
      fiction = el("p", "lp-illustrated-fiction", t(pack.disclaimer));
    footer.appendChild(noteButton);
    var exportButton = button(
      locale === "ru"
        ? "Сохранить открытку PNG"
        : locale === "he"
          ? "שמירת גלויה PNG"
          : "Save postcard PNG",
      downloadPostcard,
      "lp-illustrated-export",
    );
    footer.appendChild(exportButton);
    var resetButton = button(
      ui("reset"),
      function () {
        actionEpoch++;
        blinkClosed = false;
        posePending = false;
        clearBlinks();
        journey = null;
        journeyPose = null;
        positions = {};
        history = [];
        state = initialState(pack);
        save();
        sync();
        reframe();
      },
      "lp-illustrated-secondary",
    );
    footer.appendChild(resetButton);
    footer.appendChild(fiction);
    storyPanel.appendChild(inspector);
    storyPanel.appendChild(notebook);
    storyPanel.appendChild(footer);
    var live = el("div", "lp-illustrated-sr");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    root.appendChild(stage);
    root.appendChild(storyPanel);
    root.appendChild(live);
    host.appendChild(root);
    host.setAttribute("data-world-profile", "illustrated");
    var markers = {},
      navs = {};
    Object.keys(pack.objects).forEach(function (id) {
      var o = pack.objects[id],
        b = button(
          t(o.title),
          function () {
            inspect(id, b);
          },
          "lp-illustrated-object",
        );
      b.dataset.object = id;
      nav.appendChild(b);
      navs[id] = b;
      var mk = button(
        "+",
        function () {
          inspect(id, mk);
        },
        "lp-illustrated-marker",
      );
      mk.setAttribute("aria-label", t(o.title));
      mk.title = t(o.title);
      mk.dataset.object = id;
      markerLayer.appendChild(mk);
      markers[id] = mk;
    });
    function save() {
      try {
        (opts.storage || localStorage).setItem(
          key,
          JSON.stringify({
            flags: state.flags,
            caption: state.caption,
            notebook: state.notebook,
            views: state.views,
          }),
        );
      } catch (_) {}
    }
    function animateAllowed() {
      return !destroyed && !paused && !reduced && !focused && !doc.hidden;
    }
    function size() {
      var r = stage.getBoundingClientRect(),
        w = Math.max(280, Math.round(r.width || host.clientWidth || 768)),
        h = expanded
          ? w < 640
            ? Math.round(w * 1.18)
            : Math.round((w * 941) / 1672)
          : Math.min(300, Math.max(220, Math.round(w * 0.42)));
      root.dataset.expanded = String(expanded);
      storyPanel.hidden = !expanded;
      stage.style.height = h + "px";
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      var dpr = Math.min(
        1.5,
        2560 / w,
        1536 / h,
        Math.max(1, opts.pixelRatio || window.devicePixelRatio || 1),
      );
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      return {
        w: w,
        h: h,
      };
    }
    function targetCamera() {
      var selectedObject = state.selected && pack.objects[state.selected];
      var focal =
        selectedObject &&
        scene.layers.some(function (l) {
          return l.id === selectedObject.layer;
        })
          ? selectedObject.focal
          : scene.camera.welcome;
      var base = camera(scene, canvas.width, canvas.height, focal);
      if (!expanded && !state.selected)
        return camera(scene, canvas.width, canvas.height, [
          focal[0],
          scene.height - 40 - base.h / 2,
          1,
        ]);
      return base;
    }
    function markersAt(cam) {
      var placed = [];
      var s = {
        w: parseFloat(canvas.style.width),
        h: parseFloat(canvas.style.height),
      };
      Object.keys(markers).forEach(function (id) {
        var o = pack.objects[id],
          layer = pack.illustration.layers.find(function (l) {
            return l.id === o.layer;
          }),
          at = layer && layer.actor && positions[layer.actor],
          dx = at ? at[0] - layer.x : 0,
          dy = at ? at[1] - layer.y : 0,
          p = stagePoint(
            cam,
            s.w,
            s.h,
            o.hit[0] + o.hit[2] / 2 + dx,
            o.hit[1] + o.hit[3] / 2 + dy,
          ),
          b = markers[id];
        b.hidden =
          !expanded ||
          o.affordance === "panel" ||
          !scene.layers.some(function (l) {
            return l.id === o.layer;
          }) ||
          p.x < 24 ||
          p.y < 64 ||
          p.x > s.w - 24 ||
          p.y > s.h - 24;
        // The same actions remain in the object navigation when a marker would
        // cover a control or another marker after camera framing on narrow screens.
        if (!b.hidden) {
          var sr = stage.getBoundingClientRect();
          var markerRect = { left: sr.left + p.x - 22, right: sr.left + p.x + 22,
            top: sr.top + p.y - 22, bottom: sr.top + p.y + 22 };
          b.hidden = placed.some(function (r) {
            return Math.abs(p.x - r.x) < 48 && Math.abs(p.y - r.y) < 48;
          }) || [top, begin, collapse].some(function (control) {
            if (control.hidden) return false;
            var r = control.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && markerRect.left < r.right + 4 &&
              markerRect.right > r.left - 4 && markerRect.top < r.bottom + 4 && markerRect.bottom > r.top - 4;
          });
          if (!b.hidden) placed.push(p);
        }
        b.style.left = p.x + "px";
        b.style.top = p.y + "px";
        b.dataset.selected = state.selected === id ? "true" : "false";
      });
    }
    function renderState() {
      return Object.assign({}, state, {
        positions: positions,
        blinks: blinkStates,
        flips: {
          timsah: !!(journey && journeyPose && journey.to[0] < journey.from[0]),
        },
        poses: Object.assign(
          {},
          state.poses,
          journeyPose
            ? {
                timsah: journeyPose,
              }
            : {},
        ),
      });
    }
    function clearBlinks(close) {
      if (blinkTimer) clearTimeout(blinkTimer);
      blinkTimer = 0;
      blinkEpoch++;
      blinkLoad = null;
      blinkClock.reset();
      blinkStates = {};
      if (close) blinkClosed = true;
    }
    function syncBlinks() {
      if (blinkTimer) clearTimeout(blinkTimer);
      blinkTimer = 0;
      if (!animateAllowed() || blinkClosed || posePending || transition || journey || blinkFailed) {
        blinkClock.reset(); blinkStates = {}; return;
      }
      var files = [], poses = renderState().poses;
      scene.layers.forEach(function (l) {
        if (!blinkMatches(l, poses)) return;
        Object.keys(l.blink.states).forEach(function (state) {
          l.blink.states[state].forEach(function (p) {
            var f = atlas.atlases[p.sheet].file;
            if (!images[f] && files.indexOf(f) < 0) files.push(f);
          });
        });
      });
      if (files.length) {
        if (blinkLoad) return;
        var epoch = blinkEpoch, ticket = {};
        blinkLoad = ticket;
        (opts.loadAssets ? opts.loadAssets(files) : Promise.reject(new Error("blink assets unavailable")))
          .then(function () {
            if (destroyed || epoch !== blinkEpoch || blinkLoad !== ticket) return;
            blinkLoad = null;
            if (files.some(function (f) { return !images[f]; })) { blinkFailed = true; return; }
            syncBlinks(); paint(currentCam);
          }).catch(function () { if (!destroyed && epoch === blinkEpoch && blinkLoad === ticket) { blinkLoad = null; blinkFailed = true; } });
        return;
      }
      var tick = blinkClock.advance(performance.now(), poses, true);
      blinkStates = tick.states;
      if (tick.nextAt !== null) {
        var epoch = blinkEpoch;
        blinkTimer = setTimeout(function () {
          blinkTimer = 0;
          if (destroyed || epoch !== blinkEpoch) return;
          syncBlinks(); paint(currentCam);
        }, Math.max(1, tick.nextAt - performance.now()));
      }
    }
    function paint(cam) {
      if (destroyed) return;
      currentCam = draw(canvas, pack, atlas, images, renderState(), {
        camera: cam || targetCamera(),
        lighting: lighting,
        surface: surface,
        locale: locale,
        actorScale: expanded ? 1 : Math.min(1, (cam || targetCamera()).h / 650),
      });
      markersAt(currentCam);
    }
    function motion(ts) {
      raf = 0;
      if (destroyed) return;
      if (!animateAllowed()) {
        transition = null;
        journey = null;
        journeyPose = null;
        paint(targetCamera());
        return;
      }
      var c = targetCamera();
      if (transition) {
        var p = Math.min(1, (ts - transition.start) / 600),
          k = 1 - Math.pow(1 - p, 3);
        ["x", "y", "w", "h"].forEach(function (n) {
          c[n] =
            transition.from[n] + (transition.to[n] - transition.from[n]) * k;
        });
        if (p >= 1) transition = null;
      }
      if (journey) {
        var walkProgress = Math.min(1, (ts - journey.start) / journey.ms);
        positions.timsah = [
          journey.from[0] + (journey.to[0] - journey.from[0]) * walkProgress,
          journey.from[1] + (journey.to[1] - journey.from[1]) * walkProgress,
        ];
        journeyPose =
          journey.frames[
            Math.floor((ts - journey.start) / 150) % journey.frames.length
          ];
        if (walkProgress >= 1) {
          journey = null;
          journeyPose = null;
        }
      }
      if (!transition && !journey) syncBlinks();
      paint(c);
      if (transition || journey) raf = requestAnimationFrame(motion);
    }
    function reframe() {
      clearBlinks();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      var dest = targetCamera();
      if (currentCam && animateAllowed()) {
        transition = {
          from: currentCam,
          to: dest,
          start: performance.now(),
        };
        raf = requestAnimationFrame(motion);
      } else {
        transition = null;
        syncBlinks();
        paint(dest);
      }
    }
    function imageNode(spec, label) {
      var a = atlas.atlases[spec.sheet],
        f = a.frames[spec.frame],
        c = doc.createElement("canvas");
      c.width = Math.min(900, f.w);
      c.height = Math.round((c.width * f.h) / f.w);
      c.className = "lp-illustrated-detail-art";
      c.setAttribute("role", "img");
      c.setAttribute("aria-label", label);
      var ctx = c.getContext("2d");
      if (images[a.file])
        ctx.drawImage(
          images[a.file],
          f.x,
          f.y,
          f.w,
          f.h,
          0,
          0,
          c.width,
          c.height,
        );
      else if (opts.loadAssets) {
        var selectedAtLoad = state.selected;
        opts
          .loadAssets([a.file])
          .then(function () {
            if (
              !destroyed &&
              state.selected === selectedAtLoad &&
              images[a.file]
            )
              ctx.drawImage(
                images[a.file],
                f.x,
                f.y,
                f.w,
                f.h,
                0,
                0,
                c.width,
                c.height,
              );
          })
          .catch(function () {
            if (!destroyed) live.textContent = "Image unavailable";
          });
      }
      return c;
    }
    function addSources(parent, ids) {
      if (!ids.length) return;
      var details = el("details", "lp-illustrated-sources");
      details.appendChild(el("summary", "", ui("sources")));
      ids.forEach(function (id) {
        var s = pack.sources[id],
          p = el("p", ""),
          a = el("a", "", t(s.title));
        a.href = s.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        p.appendChild(a);
        p.appendChild(el("span", "lp-illustrated-source-note", t(s.note)));
        details.appendChild(p);
      });
      parent.appendChild(details);
    }
    function renderNotebook() {
      notebook.replaceChildren(el("h3", "", t(pack.story.notebookTitle)));
      state.notebook.forEach(function (id) {
        var p = pack.story.phrases[id],
          card = el("div", "lp-illustrated-phrase"),
          he = el("strong", "", p.he);
        he.lang = "he";
        he.dir = "rtl";
        card.appendChild(he);
        card.appendChild(el("span", "", t(p.translation)));
        card.appendChild(el("p", "", t(p.context)));
        notebook.appendChild(card);
      });
      if (!state.notebook.length)
        notebook.appendChild(el("p", "", t(pack.story.nextLabel)));
    }
    function renderInspector() {
      if (!state.selected) {
        inspector.hidden = true;
        return;
      }
      inspector.hidden = false;
      var o = pack.objects[state.selected],
        v = o.views[state.views[state.selected] || o.initialView];
      inspector.replaceChildren();
      inspector.setAttribute("aria-label", t(o.title));
      var close = button(ui("close"), closeInspector, "lp-illustrated-close");
      inspector.appendChild(close);
      inspector.appendChild(el("p", "lp-illustrated-eyebrow", t(o.kind)));
      inspector.appendChild(
        el("h3", "lp-illustrated-inspector-title", t(o.title)),
      );
      inspector.appendChild(el("p", "lp-illustrated-hook", t(o.hook)));
      if (v.art) inspector.appendChild(imageNode(v.art, t(v.title)));
      var compare = el("div", "lp-illustrated-evidence-view");
      compare.dataset.layout = v.layout || "illustration";
      compare.appendChild(el("h4", "", t(v.title)));
      (v.badges || []).forEach(function (b) {
        compare.appendChild(el("span", "lp-illustrated-tile-layer", t(b)));
      });
      compare.appendChild(el("p", "", t(v.text)));
      inspector.appendChild(compare);
      inspector.appendChild(el("p", "lp-illustrated-body", t(o.body)));
      inspector.appendChild(el("p", "lp-illustrated-fiction", t(o.fiction)));
      var acts = el("div", "lp-illustrated-actions");
      o.actions.forEach(function (id) {
        var a = pack.story.actions[id],
          b = button(
            t(a.label),
            function () {
              act(id);
            },
            "lp-illustrated-action",
          );
        b.dataset.action = id;
        b.disabled = !a.requires.every(function (k) {
          return state.flags[k];
        });
        if (b.disabled) b.title = t(pack.story.needsEvidence);
        acts.appendChild(b);
      });
      inspector.appendChild(acts);
      if (o.phrase) {
        var phrase = pack.story.phrases[o.phrase],
          pb = button(
            phrase.he + " · " + t(phrase.translation),
            function () {
              if (state.notebook.indexOf(o.phrase) < 0)
                state.notebook.push(o.phrase);
              save();
              renderNotebook();
              live.textContent = phrase.he + " " + t(phrase.translation);
            },
            "lp-illustrated-phrase-button",
          );
        pb.setAttribute("aria-label", ui("collect") + ": " + phrase.he);
        inspector.appendChild(pb);
      }
      addSources(inspector, o.sources);
    }
    function sync() {
      exportButton.disabled = !state.complete;
      caption.textContent = t(pack.story.captions[state.caption].text);
      draft.dataset.revised = String(state.caption !== "initial");
      if (state.message) opening.textContent = t(state.message);
      else opening.textContent = t(pack.story.opening);
      eyebrow.textContent = state.complete
        ? t(pack.story.ending)
        : t(pack.story.title);
      Object.keys(navs).forEach(function (id) {
        navs[id].setAttribute("aria-pressed", String(state.selected === id));
      });
      renderInspector();
      renderNotebook();
    }
    function startWalk(objectId, epoch) {
      var object = pack.objects[objectId],
        layer = pack.illustration.layers.find(function (l) {
          return l.actor === "timsah";
        });
      if (!object.approach || !layer || !animateAllowed() || !layer.poses)
        return;
      var frames = ["walk-0", "walk-1", "walk-2", "walk-3"].filter(
        function (k) {
          return own(layer.poses, k);
        },
      );
      if (frames.length !== 4) return;
      var files = frames.map(function (k) {
        return atlas.atlases[layer.poses[k].sheet].file;
      });
      (opts.loadAssets ? opts.loadAssets(files) : Promise.resolve())
        .then(function () {
          if (destroyed || epoch !== actionEpoch || !animateAllowed()) return;
          var from = positions.timsah || [layer.x, layer.y],
            to = object.approach,
            dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
          if (dist < 12) return;
          clearBlinks();
          journey = {
            from: from.slice(),
            to: to.slice(),
            start: performance.now(),
            ms: Math.max(650, Math.min(1800, (dist / 170) * 1000)),
            frames: frames,
          };
          if (!raf) raf = requestAnimationFrame(motion);
        })
        .catch(function () {});
    }
    function inspect(id, from) {
      if (destroyed || !own(pack.objects, id)) return false;
      if (state.selected === id) return true;
      blinkClosed = false;
      posePending = false;
      if (!expanded) {
        expanded = true;
        size();
      }
      actionEpoch++;
      history.push(state.selected);
      if (history.length > 12) history.shift();
      state.selected = id;
      lastButton = from || navs[id];
      sync();
      reframe();
      startWalk(id, actionEpoch);
      if (inspector.focus)
        inspector.focus({
          preventScroll: true,
        });
      live.textContent = t(pack.objects[id].hook);
      return true;
    }
    function closeInspector() {
      if (destroyed) return;
      clearBlinks(true);
      posePending = false;
      actionEpoch++;
      journey = null;
      journeyPose = null;
      state.selected = history.length ? history.pop() : null;
      sync();
      reframe();
      if (!state.selected && lastButton && lastButton.focus)
        lastButton.focus({
          preventScroll: true,
        });
    }
    function act(id) {
      if (destroyed) return Promise.resolve(false);
      var result = reduce(pack, state, id);
      if (!result.changed) {
        live.textContent = t(pack.story.needsEvidence);
        return Promise.resolve(false);
      }
      clearBlinks();
      posePending = true;
      paint(currentCam);
      journey = null;
      journeyPose = null;
      var epoch = ++actionEpoch,
        definition = pack.story.actions[id],
        files = [],
        wasFocused =
          doc.activeElement &&
          doc.activeElement.getAttribute &&
          doc.activeElement.getAttribute("data-action") === id;
      if (definition.poses)
        Object.keys(definition.poses).forEach(function (who) {
          var layer = pack.illustration.layers.find(function (l) {
            return l.actor === who;
          });
          if (layer) {
            var pose = layer.poses[definition.poses[who]];
            files.push(atlas.atlases[pose.sheet].file);
          }
        });
      if (definition.view) {
        var view = pack.objects[definition.object].views[definition.view];
        if (view.art) files.push(atlas.atlases[view.art.sheet].file);
      }
      return (opts.loadAssets ? opts.loadAssets(files) : Promise.resolve())
        .then(function () {
          if (destroyed || epoch !== actionEpoch) return false;
          posePending = false;
          var prev = state.caption;
          state = result.state;
          save();
          sync();
          reframe();
          live.textContent =
            (prev !== state.caption
              ? ui("change") +
                ": " +
                t(pack.story.captions[state.caption].text) +
                " "
              : "") + t(state.message);
          if (wasFocused) {
            var next = inspector.querySelector('[data-action="' + id + '"]');
            if (next && !next.disabled && next.focus)
              next.focus({
                preventScroll: true,
              });
            else if (inspector.focus)
              inspector.focus({
                preventScroll: true,
              });
          }
          return true;
        })
        .catch(function () {
          if (!destroyed && epoch === actionEpoch) {
            posePending = false;
            syncBlinks(); paint(currentCam);
            live.textContent = "The illustration could not load. Please try again.";
          }
          return false;
        });
    }
    function postcardCanvas() {
      if (destroyed || !state.complete) return null;
      var c = doc.createElement("canvas");
      c.width = 1400;
      c.height = 1100;
      var ctx = c.getContext("2d"),
        art = doc.createElement("canvas");
      art.width = 1400;
      art.height = 700;
      draw(art, pack, atlas, images, Object.assign({}, renderState(), { blinks: {} }), {
        surface: surface,
        lighting: lighting,
        locale: locale,
        focal:
          state.selected &&
          ["postcard", "nura", "timsah"].indexOf(state.selected) < 0
            ? pack.objects[state.selected].focal
            : scene.camera.welcome,
      });
      ctx.drawImage(art, 0, 0);
      ctx.fillStyle = "#f4ecd9";
      ctx.fillRect(0, 700, 1400, 400);
      ctx.fillStyle = "#274859";
      ctx.textAlign = "left";
      ctx.direction = locale === "he" ? "rtl" : "ltr";
      var edge = 65;
      function writeAligned(value, y, maxWidth) {
        var width = Math.min(ctx.measureText(value).width, maxWidth);
        ctx.fillText(value, locale === "he" ? 1335 - width : 65, y, maxWidth);
      }
      ctx.font = '21px "Noto Sans Hebrew", "DejaVu Sans", sans-serif';
      writeAligned(t(pack.names) + " · " + t(pack.story.ending), 748, 1270);
      ctx.font =
        locale === "he"
          ? '36px "Noto Sans Hebrew", "DejaVu Sans", sans-serif'
          : "36px Georgia";
      var words = t(pack.story.captions[state.caption].text).split(" "),
        line = "",
        y = 807;
      words.forEach(function (word) {
        if (ctx.measureText(line + word).width > 1260) {
          writeAligned(line.trim(), y, 1260);
          line = "";
          y += 47;
        }
        line += word + " ";
      });
      if (line) writeAligned(line.trim(), y, 1260);
      var phrase =
        pack.story.phrases[state.notebook[state.notebook.length - 1]];
      if (phrase) {
        ctx.font = '29px "Noto Sans Hebrew", "DejaVu Sans", sans-serif';
        ctx.direction = "rtl";
        ctx.textAlign = "left";
        ctx.fillText(
          phrase.he,
          1335 - Math.min(1260, ctx.measureText(phrase.he).width),
          975,
          1260,
        );
      }
      ctx.direction = "ltr";
      ctx.textAlign = "left";
      ctx.font = '16px "Noto Sans Hebrew", "DejaVu Sans", sans-serif';
      ctx.fillStyle = "#655f51";
      ctx.fillText(
        locale === "ru"
          ? "Авторская учебная иллюстрация · Вымышленные герои · Источники:"
          : locale === "he"
            ? "איור לימודי מקורי · דמויות בדיוניות · מקורות:"
            : "Original learning illustration · Fictional characters · Documentary references:",
        65,
        1035,
        1270,
      );
      ctx.fillText(
        pack.story.exportSources
          .map(function (id) {
            return pack.sources[id].url.replace(/^https:\/\//, "");
          })
          .join(" · "),
        65,
        1065,
        1270,
      );
      return c;
    }
    function downloadPostcard() {
      var c = postcardCanvas();
      if (!c) return;
      if (opts.onExport) {
        opts.onExport(c);
        return;
      }
      var a = doc.createElement("a");
      a.download = pack.id + "-postcard-" + locale + ".png";
      a.href = c.toDataURL("image/png");
      doc.body.appendChild(a);
      a.click();
      a.remove();
      live.textContent =
        locale === "ru"
          ? "Открытка создана на этом устройстве. Ничего не опубликовано."
          : locale === "he"
            ? "הגלויה נוצרה במכשיר הזה. דבר לא פורסם."
            : "Postcard created on this device. Nothing was posted.";
    }
    function updateMotion() {
      if (destroyed) return;
      if (!animateAllowed() || transition || journey) clearBlinks();
      collapse.hidden =
        !expanded ||
        host.getAttribute("data-world-presentation") === "immersive";
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      transition = null;
      journey = null;
      journeyPose = null;
      syncBlinks();
      paint(targetCamera());
      pause.textContent = paused ? ui("resume") : ui("pause");
      pause.setAttribute("aria-pressed", String(paused));
      root.dataset.motion = animateAllowed() ? "live" : "still";
    }
    on(doc, "keydown", function (e) {
      if (e.key === "Escape" && state.selected) {
        e.preventDefault();
        closeInspector();
      }
    });
    on(doc, "visibilitychange", updateMotion);
    on(window, "resize", function () {
      size();
      updateMotion();
    });
    on(canvas, "click", function (e) {
      var r = canvas.getBoundingClientRect(),
        x = ((e.clientX - r.left) * currentCam.w) / r.width + currentCam.x,
        y = ((e.clientY - r.top) * currentCam.h) / r.height + currentCam.y;
      var selected = pick(
        pack,
        atlas,
        images,
        renderState(),
        x,
        y,
        function (w, h) {
          var c = doc.createElement("canvas");
          c.width = w;
          c.height = h;
          return c;
        },
        surface,
        expanded ? 1 : Math.min(1, currentCam.h / 650),
      );
      if (selected) inspect(selected);
    });
    size();
    sync();
    paint(targetCamera());
    syncBlinks();
    root.dataset.motion = animateAllowed() ? "live" : "still";
    return {
      inspect: inspect,
      act: act,
      close: closeInspector,
      exportCanvas: postcardCanvas,
      canvas: canvas,
      root: root,
      resize: function () {
        size();
        updateMotion();
      },
      setPaused: function (v) {
        paused = !!v;
        updateMotion();
      },
      setReduced: function (v) {
        reduced = !!v;
        updateMotion();
      },
      setFocusedStudy: function (v) {
        focused = !!v;
        updateMotion();
      },
      setLighting: function (v) {
        if (destroyed || ["day", "dusk", "night"].indexOf(v) < 0)
          return Promise.resolve(false);
        var epoch = ++lightingEpoch,
          next = sceneFor(pack, surface, v),
          file = atlas.atlases[next.background.sheet].file;
        return (opts.loadAssets ? opts.loadAssets([file]) : Promise.resolve())
          .then(function () {
            if (destroyed || epoch !== lightingEpoch) return false;
            var old = atlas.atlases[scene.background.sheet].file;
            lighting = v;
            scene = next;
            if (old !== file) delete images[old];
            updateMotion();
            return true;
          })
          .catch(function () {
            if (!destroyed && epoch === lightingEpoch)
              live.textContent =
                locale === "ru"
                  ? "Освещение не загрузилось. Сохранён прежний вид; попробуйте ещё раз."
                  : locale === "he"
                    ? "התאורה לא נטענה. המראה הקודם נשמר; אפשר לנסות שוב."
                    : "Lighting could not load. The previous view is preserved; please try again.";
            return false;
          });
      },
      setMode: function (v) {
        if (["live", "calm"].indexOf(v) >= 0) mode = v;
      },
      setLocale: function (v) {
        if (LANGS.indexOf(v) < 0) return;
        locale = v;
        root.lang = v;
        root.dir = v === "he" ? "rtl" : "ltr";
        root.setAttribute("aria-label", t(pack.names));
        chapter.textContent = t(scene.locationLabel) || ui("now");
        heading.textContent = t(pack.names);
        draftLabel.textContent = t(pack.story.draftLabel);
        noteButton.textContent = t(pack.story.notebookTitle);
        exportButton.textContent =
          locale === "ru"
            ? "Сохранить открытку PNG"
            : locale === "he"
              ? "שמירת גלויה PNG"
              : "Save postcard PNG";
        resetButton.textContent = ui("reset");
        nav.setAttribute("aria-label", ui("explore"));
        fiction.textContent = t(pack.disclaimer);
        collapse.textContent =
          locale === "ru"
            ? "К занятиям"
            : locale === "he"
              ? "חזרה ללמידה"
              : "Back to learning";
        begin.textContent = t(pack.objects[pack.story.startObject].title);
        Object.keys(navs).forEach(function (k) {
          navs[k].textContent = t(pack.objects[k].title);
          markers[k].setAttribute("aria-label", t(pack.objects[k].title));
          markers[k].title = t(pack.objects[k].title);
        });
        sync();
        updateMotion();
      },
      state: function () {
        return JSON.parse(JSON.stringify(state));
      },
      debug: function () {
        return {
          profile: PROFILE,
          selected: state.selected,
          caption: state.caption,
          flags: Object.assign({}, state.flags),
          notebook: state.notebook.slice(),
          paused: paused,
          reduced: reduced,
          focused: focused,
          lighting: lighting,
          camera: currentCam,
          canvas: [canvas.width, canvas.height],
          transition: !!transition,
          walking: !!journey,
          walkPose: journeyPose,
          positions: JSON.parse(JSON.stringify(positions)),
          blinks: Object.assign({}, blinkStates),
          blinkSchedule: blinkClock.debug(),
          blinkTimer: !!blinkTimer,
          blinkClosed: blinkClosed,
          blinkFailed: blinkFailed,
          surface: surface,
          expanded: expanded,
        };
      },
      destroy: function () {
        destroyed = true;
        clearBlinks(true);
        actionEpoch++;
        lightingEpoch++;
        journey = null;
        journeyPose = null;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        transition = null;
        listeners.forEach(function (x) {
          x[0].removeEventListener(x[1], x[2]);
        });
        listeners = [];
        root.remove();
        host.removeAttribute("data-world-profile");
      },
    };
  }
  return {
    core: {
      PROFILE: PROFILE,
      BLINK_CAPABILITY: BLINK_CAPABILITY,
      validateBlink: validateBlink,
      createBlinkClock: createBlinkClock,
      blinkMatches: blinkMatches,
      SOURCE_HOSTS: SOURCE_HOSTS,
      validate: validate,
      initialState: initialState,
      hydrate: hydrate,
      reduce: reduce,
      camera: camera,
      sceneFor: sceneFor,
      stagePoint: stagePoint,
      pick: pick,
    },
    draw: draw,
    create: create,
  };
});
