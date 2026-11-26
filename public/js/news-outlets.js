// News section: the registry of outlets (format v1, docs/planning/NEWS_PACK_FORMAT_V1_2026_11_12.md §4).
// One source for the server (domain checks) and the browser (names and colour tags).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NewsOutlets = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  // Colours: neutral, distinct tags; text on them is white and passes AA (≥4.5:1).
  var OUTLETS = [
    { id: "ynet", name_he: "ynet", name_latin: "ynet", color: "#9b2335", group: "national", priority: "A", home: "https://www.ynet.co.il/news", domains: ["ynet.co.il"] },
    { id: "mako", name_he: "mako", name_latin: "mako", color: "#1f5f8b", group: "national", priority: "A", home: "https://www.mako.co.il/", domains: ["mako.co.il"] },
    { id: "walla", name_he: "וואלה", name_latin: "Walla", color: "#5b3f8c", group: "national", priority: "A", home: "https://www.walla.co.il/news", domains: ["walla.co.il"] },
    { id: "maariv", name_he: "מעריב", name_latin: "Maariv", color: "#7a4b0f", group: "national", priority: "A", home: "https://www.maariv.co.il/", domains: ["maariv.co.il"] },
    { id: "c14", name_he: "עכשיו 14", name_latin: "Channel 14", color: "#205e3b", group: "national", priority: "B", home: "https://www.c14.co.il/", domains: ["c14.co.il", "now14.co.il"] },
    { id: "n12", name_he: "N12 · חדשות 12", name_latin: "N12", color: "#3d4a5c", group: "national", priority: "A", home: "https://www.n12.co.il/", domains: ["n12.co.il"] },
    { id: "haaretz", name_he: "הארץ", name_latin: "Haaretz", color: "#0f5a66", group: "national", priority: "B", home: "https://www.haaretz.co.il/", domains: ["haaretz.co.il"] },
  ];
  // Groups of the home page and the owner's list (spec 2026-11-26 §7.1); a local outlet also names its region.
  var GROUPS = ["national", "local", "religious", "haredi", "economy_tech", "science_env", "society", "radio"];
  var REGIONS = ["north", "jerusalem", "center", "south"];
  // News of channel 12 also lives on mako under /news-*: such an article belongs to n12.
  var PATH_RULES = [{ domain: "mako.co.il", prefix: "/news-", outlet: "n12" }];

  function byId(id) {
    for (var i = 0; i < OUTLETS.length; i++) if (OUTLETS[i].id === id) return OUTLETS[i];
    return null;
  }
  function hostMatches(host, domain) { return host === domain || host.slice(-(domain.length + 1)) === "." + domain; }
  function outletForUrl(url) {
    var u;
    try { u = new URL(String(url)); } catch (_) { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    var host = u.hostname.toLowerCase();
    for (var r = 0; r < PATH_RULES.length; r++)
      if (hostMatches(host, PATH_RULES[r].domain) && u.pathname.indexOf(PATH_RULES[r].prefix) === 0) return PATH_RULES[r].outlet;
    for (var i = 0; i < OUTLETS.length; i++)
      for (var d = 0; d < OUTLETS[i].domains.length; d++)
        if (hostMatches(host, OUTLETS[i].domains[d])) return OUTLETS[i].id;
    return null;
  }
  return { OUTLETS: OUTLETS, GROUPS: GROUPS, REGIONS: REGIONS, PATH_RULES: PATH_RULES, byId: byId, outletForUrl: outletForUrl };
});
