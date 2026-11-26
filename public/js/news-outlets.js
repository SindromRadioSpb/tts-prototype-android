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
    // Wave 4 (spec 2026-11-26 §4): the research registry's Hebrew outlets, A/B. Without feeds yet = not connected.
    {id: "news13", name_he: "חדשות 13", name_latin: "News 13", color: "#8a2b5c", group: "national", priority: "A", home: "https://13tv.co.il/news/", domains: ["13tv.co.il"]},
    {id: "israelhayom", name_he: "ישראל היום", name_latin: "Israel Hayom", color: "#1d5c7a", group: "national", priority: "A", home: "https://www.israelhayom.co.il/", domains: ["israelhayom.co.il"]},
    {id: "makorrishon", name_he: "מקור ראשון", name_latin: "Makor Rishon", color: "#6b3d8f", group: "national", priority: "B", home: "https://www.makorrishon.co.il/", domains: ["makorrishon.co.il"]},
    {id: "zman", name_he: "זמן ישראל", name_latin: "Zman Israel", color: "#2f5d34", group: "national", priority: "B", home: "https://www.zman.co.il/", domains: ["zman.co.il"]},
    {id: "0404", name_he: "0404", name_latin: "0404", color: "#8c3b1e", group: "national", priority: "B", home: "https://0404.co.il/", domains: ["0404.co.il"]},
    {id: "kan", name_he: "כאן", name_latin: "Kan", color: "#2b4f8c", group: "national", priority: "A", home: "https://www.kan.org.il/", domains: ["kan.org.il"]},
    {id: "i24", name_he: "i24NEWS", name_latin: "i24NEWS", color: "#7a2e2e", group: "national", priority: "A", home: "https://www.i24news.tv/he", domains: ["i24news.tv"]},
    {id: "inn", name_he: "ערוץ 7", name_latin: "Arutz 7", color: "#3f5a22", group: "national", priority: "B", home: "https://www.inn.co.il/", domains: ["inn.co.il"]},
    {id: "news1", name_he: "News1 מחלקה ראשונה", name_latin: "News1", color: "#5c3a7a", group: "national", priority: "B", home: "https://www.news1.co.il/", domains: ["news1.co.il"]},
    {id: "davar", name_he: "דבר", name_latin: "Davar", color: "#1f6363", group: "society", priority: "A", home: "https://www.davar1.co.il/", domains: ["davar1.co.il"]},
    {id: "mekomit", name_he: "שיחה מקומית", name_latin: "Local Call", color: "#874017", group: "society", priority: "B", home: "https://www.mekomit.co.il/", domains: ["mekomit.co.il"]},
    {id: "hamakom", name_he: "המקום הכי חם בגיהנום", name_latin: "HaMakom", color: "#33508a", group: "society", priority: "B", home: "https://www.ha-makom.co.il/", domains: ["ha-makom.co.il"]},
    {id: "shakuf", name_he: "שקוף", name_latin: "Shakuf", color: "#6e2f60", group: "society", priority: "B", home: "https://shakuf.co.il/", domains: ["shakuf.co.il"]},
    {id: "the7eye", name_he: "העין השביעית", name_latin: "The Seventh Eye", color: "#2c6046", group: "society", priority: "B", home: "https://www.the7eye.org.il/", domains: ["the7eye.org.il"]},
    {id: "srugim", name_he: "סרוגים", name_latin: "Srugim", color: "#7d3a3a", group: "religious", priority: "B", home: "https://www.srugim.co.il/", domains: ["srugim.co.il"]},
    {id: "kipa", name_he: "כיפה", name_latin: "Kipa", color: "#45507a", group: "religious", priority: "B", home: "https://www.kipa.co.il/", domains: ["kipa.co.il"]},
    {id: "kikar", name_he: "כיכר השבת", name_latin: "Kikar HaShabat", color: "#5e4a14", group: "haredi", priority: "B", home: "https://www.kikar.co.il/", domains: ["kikar.co.il"]},
    {id: "bhol", name_he: "בחדרי חרדים", name_latin: "Behadrei Haredim", color: "#1d5d6e", group: "haredi", priority: "B", home: "https://www.bhol.co.il/", domains: ["bhol.co.il"]},
    {id: "hmnews", name_he: "המחדש", name_latin: "HaMechadesh", color: "#7a3366", group: "haredi", priority: "B", home: "https://hm-news.co.il/", domains: ["hm-news.co.il"]},
    {id: "haipo", name_he: "חי פה", name_latin: "Hai Po", color: "#3a5a2a", group: "local", region: "north", priority: "A", home: "https://haipo.co.il/", domains: ["haipo.co.il"]},
    {id: "colbo", name_he: "כלבו חיפה והקריות", name_latin: "Colbo", color: "#6a3a1a", group: "local", region: "north", priority: "A", home: "https://www.colbonews.co.il/", domains: ["colbonews.co.il"]},
    {id: "hkn", name_he: "חדשות חיפה והקריות", name_latin: "HKN", color: "#2a4a7a", group: "local", region: "north", priority: "A", home: "https://hkn.co.il/", domains: ["hkn.co.il"]},
    {id: "blinker", name_he: "בלינקר", name_latin: "Blinker", color: "#703040", group: "local", region: "north", priority: "A", home: "https://blinker.co.il/", domains: ["blinker.co.il"]},
    {id: "mynetkrayot", name_he: "mynet קריות", name_latin: "mynet Krayot", color: "#2d5a52", group: "local", region: "north", priority: "A", home: "https://krayot.mynet.co.il/", domains: ["krayot.mynet.co.il"]},
    {id: "kolhair", name_he: "כל העיר", name_latin: "Kol Ha'ir", color: "#5a3a6e", group: "local", region: "jerusalem", priority: "B", home: "https://www.kolhair.co.il/", domains: ["kolhair.co.il"]},
    {id: "news08", name_he: "חדשות 08", name_latin: "News 08", color: "#6b4b1b", group: "local", region: "south", priority: "B", home: "https://www.news08.net/", domains: ["news08.net"]},
    {id: "ashdodnet", name_he: "אשדוד נט", name_latin: "Ashdod Net", color: "#284e6e", group: "local", region: "south", priority: "B", home: "https://ashdodnet.com/", domains: ["ashdodnet.com"]},
    {id: "calcalist", name_he: "כלכליסט", name_latin: "Calcalist", color: "#7a2f4a", group: "economy_tech", priority: "A", home: "https://www.calcalist.co.il/", domains: ["calcalist.co.il"]},
    {id: "globes", name_he: "גלובס", name_latin: "Globes", color: "#3b5737", group: "economy_tech", priority: "A", home: "https://www.globes.co.il/", domains: ["globes.co.il"]},
    {id: "bizportal", name_he: "ביזפורטל", name_latin: "Bizportal", color: "#5f3b2b", group: "economy_tech", priority: "B", home: "https://www.bizportal.co.il/", domains: ["bizportal.co.il"]},
    {id: "themarker", name_he: "דה מרקר", name_latin: "TheMarker", color: "#30547a", group: "economy_tech", priority: "B", home: "https://www.themarker.com/", domains: ["themarker.com"]},
    {id: "geektime", name_he: "גיקטיים", name_latin: "Geektime", color: "#6d2f2f", group: "economy_tech", priority: "A", home: "https://www.geektime.co.il/", domains: ["geektime.co.il"]},
    {id: "techtime", name_he: "טקטיים", name_latin: "Techtime", color: "#455a28", group: "economy_tech", priority: "A", home: "https://techtime.co.il/", domains: ["techtime.co.il"]},
    {id: "ice", name_he: "אייס", name_latin: "ice", color: "#3d3d7a", group: "economy_tech", priority: "B", home: "https://www.ice.co.il/", domains: ["ice.co.il"]},
    {id: "hayadan", name_he: "הידען", name_latin: "Hayadan", color: "#6a4520", group: "science_env", priority: "A", home: "https://www.hayadan.org.il/", domains: ["hayadan.org.il"]},
    {id: "zavit", name_he: "זווית", name_latin: "Zavit", color: "#1f5a5a", group: "science_env", priority: "A", home: "https://www.zavit.org.il/", domains: ["zavit.org.il"]},
    {id: "davidson", name_he: "מכון דוידסון", name_latin: "Davidson Institute", color: "#78304f", group: "science_env", priority: "A", home: "https://davidson.org.il/", domains: ["davidson.org.il"]},
    {id: "glz", name_he: "גלי צה״ל", name_latin: "Galei Tzahal", color: "#405030", group: "radio", priority: "B", home: "https://glz.co.il/", domains: ["glz.co.il"]},
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
