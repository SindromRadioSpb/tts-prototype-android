// public/js/dicta-autoparse-offer.js — Ф4 · Д8-К4 v2 (К4.5): the background-parse question, asked once, at the learner's
// first OWN text (after it is saved), as a card — not a modal over the reading. Plan:
// docs/planning/word-layer/F4_D8K4_V2_CORPUS_PLACE_PARSE_PLAN_2026_10_17.md (owner decisions 2026-10-17).
// Consent (R15/GDPR): nothing is pre-selected; «Да» is the primary button (focused), «Не сейчас» is recorded with the
// text's version and never asked again (DictaEnrich.decline); both are changeable in «Мой словарь» / morphology settings.
// Corpus texts never need it (they are not personal).
(function () {
  "use strict";
  var CARD_ID = "lp-dicta-autoparse-offer";
  function tt(key, fb) { try { if (typeof window.t === "function") { var v = window.t(key); if (v && v !== key) return v; } } catch (_) {} return fb; }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function close(card) { try { card.remove(); } catch (_) {} }
  function toast(msg) { try { if (typeof window.showToast === "function") window.showToast(msg, "success"); } catch (_) {} }

  // → true when the card was shown
  function offer() {
    var DE = window.DictaEnrich;
    if (!DE || typeof DE.decided !== "function" || DE.decided() || document.getElementById(CARD_ID)) return false;
    var card = el("section", { id: CARD_ID, class: "lp-offer-card", role: "region", "aria-labelledby": CARD_ID + "-title", dir: "auto" });
    card.appendChild(el("h2", { id: CARD_ID + "-title", class: "lp-offer-title" }, tt("dictionary.dicta.offerTitle", "Разбирать ваши тексты в фоне?")));
    card.appendChild(el("p", { class: "lp-offer-body" }, tt("dictionary.dicta.offerBody",
      "Предложения ваших текстов уйдут в анализатор Dicta (dicta.org.il) через наш сервер — понемногу, пока приложение открыто. Так многозначные слова будут читаться по контексту. Разбор хранится на этом устройстве; на нашем сервере текст не остаётся. Отключить можно в «Моём словаре» и в настройках морфологии.")));
    var btns = el("div", { class: "lp-offer-btns" });
    var yes = el("button", { type: "button", class: "lp-offer-btn lp-offer-btn-primary" }, tt("dictionary.dicta.offerYes", "Да, разбирать в фоне"));
    var later = el("button", { type: "button", class: "lp-offer-btn" }, tt("dictionary.dicta.offerLater", "Не сейчас"));
    yes.addEventListener("click", function () {
      DE.grant({ auto: true });
      close(card);
      toast(tt("dictionary.dicta.offerDone", "Хорошо: разбор пойдёт в фоне понемногу."));
      try { window.dispatchEvent(new CustomEvent("lp:dicta-autoparse-granted")); } catch (_) {}
    });
    later.addEventListener("click", function () { DE.decline(); close(card); });
    btns.appendChild(yes); btns.appendChild(later);
    card.appendChild(btns);
    if (!document.getElementById(CARD_ID + "-style")) {
      var st = el("style", { id: CARD_ID + "-style" });
      st.textContent = ".lp-offer-card{position:fixed;inset-inline:16px;bottom:16px;z-index:9000;max-width:560px;margin-inline:auto;" +
        "background:var(--surface,#fff);color:var(--text,#1a1a1a);border:1px solid var(--border,#d6d6d6);border-radius:12px;" +
        "box-shadow:0 8px 28px rgba(0,0,0,.18);padding:16px}" +
        ".lp-offer-title{font-size:1.05rem;margin:0 0 8px}.lp-offer-body{margin:0 0 12px;line-height:1.45;font-size:.95rem}" +
        ".lp-offer-btns{display:flex;flex-wrap:wrap;gap:8px}.lp-offer-btn{min-height:44px;padding:8px 16px;border-radius:8px;" +
        "border:1px solid var(--border,#c4c4c4);background:transparent;color:inherit;font:inherit;cursor:pointer}" +
        ".lp-offer-btn-primary{background:var(--accent,#2563eb);border-color:var(--accent,#2563eb);color:var(--on-accent,#fff);font-weight:600}" +
        "@media (prefers-color-scheme:dark){.lp-offer-card{background:var(--surface,#1f1f22);color:var(--text,#eee);border-color:var(--border,#3a3a40)}}";
      document.head.appendChild(st);
    }
    document.body.appendChild(card);
    try { yes.focus({ preventScroll: true }); } catch (_) {}
    return true;
  }
  window.DictaAutoParseOffer = { offer: offer };
})();
