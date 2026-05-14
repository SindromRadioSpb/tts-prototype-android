// public/js/quiz-ui.js — v3.3.5 Calibrated Diagnostic Quiz UI (Direction 13 C3).
//
// Self-contained modal panel — does NOT use v3ConfirmModal (which is
// one-shot). Renders into a fixed DOM root so navigation between items
// preserves state, and mid-quiz refresh restores via localStorage.
//
// State (per docs/PHASE_PLAN_v3_3_5_CALIBRATED_QUIZ.md §8):
//
//   localStorage.quizState_v1 = {
//     version: "ulpan_diagnostic_v1",
//     started_at: ISO-timestamp (local-only — never uploaded),
//     current_item_index: 0..19,
//     responses_transient: { Q01: "b", Q02: "a", ... }    // device-local
//   }
//
//   localStorage.quizCompleted_v1 = {
//     version, completed_at: ISO-day, cohort_code              // no item-level data
//   }
//
// Public API:
//   window.LinguistProQuiz.open()      — opens panel; restores mid-quiz if applicable
//   window.LinguistProQuiz.close()     — destroys panel
//   window.LinguistProQuiz.reset()     — clears all quiz LS (used by admin tooling)
//   window.LinguistProQuiz.getResult() — last computed result, or null

(function () {
  "use strict";

  const BANK_URL = "/quiz/ulpan_diagnostic_v1.json";
  const LS_STATE = "quizState_v1";
  const LS_DONE  = "quizCompleted_v1";
  const PANEL_ID = "quizPanelRoot";
  const OVERLAY_ID = "quizPanelOverlay";

  let bankCache = null;
  let lastResult = null;
  let previouslyFocused = null;

  // Selector matching every element that can be focused via Tab in the
  // panel. Used by the focus trap to compute wrap-around boundaries.
  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  function focusablesIn(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter((el) => !el.hasAttribute("disabled") &&
                      el.offsetParent !== null /* visible */ ||
                      el === document.activeElement);
  }

  function installFocusTrap(panel) {
    panel.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const items = focusablesIn(panel);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  function focusFirstFocusable(panel) {
    const items = focusablesIn(panel);
    if (items.length > 0) items[0].focus();
  }

  function focusCheckedOrFirstRadio(panel) {
    if (!panel) return;
    const checked = panel.querySelector('[data-quiz-radio]:checked');
    if (checked) { checked.focus(); return; }
    const firstRadio = panel.querySelector('[data-quiz-radio]');
    if (firstRadio) { firstRadio.focus(); return; }
    // Fallback: first focusable (e.g. close button on completed/error screens).
    focusFirstFocusable(panel);
  }

  function T(key, fallback) {
    try {
      const fn = (typeof window !== "undefined" && typeof window.t === "function") ? window.t : null;
      if (!fn) return fallback;
      const v = fn(key);
      return (typeof v === "string" && v !== key) ? v : fallback;
    } catch (_) { return fallback; }
  }

  function escapeHtml(s) {
    const v = String(s == null ? "" : s);
    return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function todayIsoDay() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function localeKey() {
    try { return (window.I18N && window.I18N.locale) || window.__i18nLocale || "ru"; }
    catch (_) { return "ru"; }
  }

  function promptFor(item) {
    const loc = localeKey();
    if (loc === "en") return item.prompt_en;
    if (loc === "he") return item.prompt_he;
    return item.prompt_ru;
  }

  function optionText(item, opt) {
    const loc = localeKey();
    if (loc === "en") return opt.text_en || opt.text_ru || opt.text_he;
    if (loc === "he") return opt.text_he || opt.text_ru || opt.text_en;
    return opt.text_ru || opt.text_en || opt.text_he;
  }

  function isHebrewPrompt(item) {
    return localeKey() === "he" || /[֐-׿]/.test(promptFor(item) || "");
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_STATE);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function saveState(s) {
    try { localStorage.setItem(LS_STATE, JSON.stringify(s)); } catch (_) {}
  }
  function clearState() {
    try { localStorage.removeItem(LS_STATE); } catch (_) {}
  }
  function loadDone() {
    try {
      const raw = localStorage.getItem(LS_DONE);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function newState(bank) {
    return {
      version: bank.instrument_id,
      started_at: new Date().toISOString(),
      current_item_index: 0,
      responses_transient: {},
    };
  }

  async function fetchBank() {
    if (bankCache) return bankCache;
    const r = await fetch(BANK_URL, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`bank fetch failed: ${r.status}`);
    bankCache = await r.json();
    return bankCache;
  }

  function destroyPanel() {
    const ov = document.getElementById(OVERLAY_ID);
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    const panel = document.getElementById(PANEL_ID);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    // Restore focus to the element that had it when the modal opened —
    // standard a11y pattern for modal dismissal.
    try {
      if (previouslyFocused && document.body.contains(previouslyFocused) &&
          typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    } catch (_) {}
    previouslyFocused = null;
  }

  function buildShell() {
    // Capture the element that had focus before we render anything, so we
    // can restore it on destroyPanel. Skip when we're rebuilding (overlay
    // already exists) to avoid clobbering the real pre-open focus.
    // Stash in a local, re-assign AFTER destroyPanel — that helper resets
    // previouslyFocused = null on the way out, which would otherwise erase
    // our just-captured reference.
    const capturedFocus = !document.getElementById(OVERLAY_ID)
      ? document.activeElement
      : previouslyFocused;

    destroyPanel();
    previouslyFocused = capturedFocus;
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("data-quiz-overlay", "1");
    overlay.style.cssText = [
      "position:fixed", "inset:0", "background:rgba(0,0,0,0.45)",
      "z-index:10500", "display:flex", "align-items:flex-start",
      "justify-content:center", "padding:48px 16px", "overflow:auto",
    ].join(";");

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "quizPanelTitle");
    panel.setAttribute("data-quiz-panel", "1");
    panel.style.cssText = [
      "background:var(--theme-bg,#fff)", "color:var(--theme-text,#000)",
      "border-radius:12px", "max-width:640px", "width:100%",
      "box-shadow:0 12px 40px rgba(0,0,0,0.35)",
      "padding:20px 22px", "font-size:14px", "line-height:1.5",
      "z-index:10501",
    ].join(";");

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); destroyPanel(); }
    });
    // Focus trap so Tab / Shift+Tab cycle within the modal instead of
    // escaping to underlying page elements (e.g. the research panel
    // launcher button that opened the quiz).
    installFocusTrap(panel);
    // Click on the overlay (outside the panel) does NOT auto-close —
    // mid-quiz dismissal is intentional via the close button only.
    return panel;
  }

  function renderCompletedNotice(done, panel) {
    const verLabel = (done && done.version) || "ulpan_diagnostic_v1";
    const date = (done && done.completed_at) || "";
    panel.innerHTML =
      `<div class="quiz-completed-notice" data-quiz-state="completed">` +
      `<h3 id="quizPanelTitle" style="margin:0 0 10px 0;">` +
        escapeHtml(T("quiz.completed.title", "✓ Диагностика уже пройдена")) + `</h3>` +
      `<p style="margin:0 0 12px 0;">` +
        escapeHtml(T("quiz.completed.body", "Вы уже прошли эту версию диагностики. Повторное прохождение в v3.3.5 не предусмотрено.")) +
      `</p>` +
      `<p style="margin:0 0 6px 0;font-size:12px;color:var(--theme-text-secondary,#666);">` +
        `<b>` + escapeHtml(T("quiz.completed.version", "Версия")) + `:</b> ` +
        `<code>${escapeHtml(verLabel)}</code>` +
        (date ? `<br><b>` + escapeHtml(T("quiz.completed.date", "Дата")) + `:</b> ${escapeHtml(date)}` : "") +
      `</p>` +
      `<div style="margin-top:16px;text-align:right;">` +
        `<button type="button" class="btn-secondary" data-quiz-close="1">` +
          escapeHtml(T("quiz.btn.close", "Закрыть")) + `</button>` +
      `</div></div>`;
    const closeBtn = panel.querySelector("[data-quiz-close]");
    closeBtn.addEventListener("click", destroyPanel);
    closeBtn.focus();
  }

  function renderItem(bank, state, panel) {
    const total = bank.items.length;
    const idx = state.current_item_index;
    const item = bank.items[idx];
    const selected = state.responses_transient[item.id] || "";
    const isFirst = idx === 0;
    const isLast = idx === total - 1;
    const dir = isHebrewPrompt(item) ? "rtl" : "ltr";
    // Stable id so each radio can aria-describedby the prompt — screen
    // readers then announce the question alongside each option as the
    // user arrow-keys through them.
    const promptId = "quizPrompt_" + item.id;

    let optsHtml = "";
    item.options.forEach((opt, optIdx) => {
      const checked = selected === opt.id ? " checked" : "";
      const optDir = /[֐-׿]/.test(optionText(item, opt) || "") ? "rtl" : "ltr";
      const optText = optionText(item, opt);
      // aria-label combines option letter + text + position so SR reads:
      //   "<text>, option <id>, <n> of 4, radio button, [not] selected"
      const ariaLabel = `${optText} — ${T("quiz.aria.optionLetter", "вариант")} ${opt.id.toUpperCase()}, ${optIdx + 1} / ${item.options.length}`;
      optsHtml +=
        `<label class="quiz-option" data-quiz-option="${escapeHtml(opt.id)}" ` +
        `style="display:block;padding:8px 12px;margin:6px 0;border:1px solid var(--theme-border,#ccc);` +
        `border-radius:8px;cursor:pointer;${selected === opt.id ? "background:var(--theme-accent-bg,#eef);" : ""}">` +
          `<input type="radio" name="quizItemOpt" value="${escapeHtml(opt.id)}"${checked} ` +
          `data-quiz-radio="${escapeHtml(opt.id)}" ` +
          `aria-describedby="${promptId}" aria-label="${escapeHtml(ariaLabel)}" ` +
          `style="margin-right:8px;vertical-align:middle;">` +
          `<span dir="${optDir}" style="${optDir === "rtl" ? "direction:rtl;text-align:right;" : ""}">` +
            escapeHtml(optText) + `</span>` +
        `</label>`;
    });

    // aria-label on progress lets SR read it as "Question 5 of 20, level B1"
    // even when the visible text uses different punctuation/markup.
    const progressLabel = `${T("quiz.progress", "Вопрос")} ${idx + 1} / ${total}, ${T("quiz.aria.levelLabel", "уровень")} ${item.cefr_level}`;

    panel.innerHTML =
      `<div class="quiz-item-wrap" data-quiz-state="in-progress" data-quiz-item-id="${escapeHtml(item.id)}">` +
        `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">` +
          `<h3 id="quizPanelTitle" style="margin:0;font-size:16px;">` +
            escapeHtml(T("quiz.modalTitle", "📝 Диагностика иврита (v1)")) +
          `</h3>` +
          `<button type="button" data-quiz-close="1" aria-label="${escapeHtml(T("quiz.btn.close", "Закрыть"))}" ` +
            `style="background:transparent;border:none;font-size:18px;cursor:pointer;color:#888;">×</button>` +
        `</div>` +
        `<div data-quiz-progress="1" role="status" aria-live="polite" aria-atomic="true" ` +
          `aria-label="${escapeHtml(progressLabel)}" ` +
          `style="font-size:12px;color:var(--theme-text-secondary,#666);margin-bottom:14px;">` +
          escapeHtml(T("quiz.progress", "Вопрос")) + ` <b>${idx + 1}</b> / ${total}` +
          ` · ${escapeHtml(item.cefr_level)}` +
        `</div>` +
        `<div id="${promptId}" data-quiz-prompt="1" dir="${dir}" ` +
          `style="font-size:16px;margin-bottom:14px;${dir === "rtl" ? "text-align:right;" : ""}">` +
          escapeHtml(promptFor(item)) +
        `</div>` +
        `<div data-quiz-options="1" role="radiogroup" aria-labelledby="${promptId}">${optsHtml}</div>` +
        `<div style="display:flex;justify-content:space-between;margin-top:18px;gap:8px;">` +
          `<button type="button" class="btn-secondary" data-quiz-back="1"${isFirst ? " disabled" : ""}>` +
            escapeHtml(T("quiz.btn.back", "← Назад")) + `</button>` +
          `<button type="button" class="btn-primary" data-quiz-next="1"${selected ? "" : " disabled"}>` +
            escapeHtml(isLast ? T("quiz.btn.finish", "Завершить ✓") : T("quiz.btn.next", "Далее →")) +
          `</button>` +
        `</div>` +
        `<p style="margin:14px 0 0 0;font-size:11px;color:var(--theme-text-secondary,#888);">` +
          escapeHtml(T("quiz.privacyHint", "Ваши ответы хранятся локально и удаляются после расчёта результата. На сервер уходит только итоговый балл (опционально).")) +
        `</p>` +
      `</div>`;

    panel.querySelector("[data-quiz-close]").addEventListener("click", destroyPanel);
    // Single source of truth for option selection: radio change.
    // Browser auto-fires click on the child input when label is clicked,
    // so we don't need a separate label click handler (which would also
    // race against the re-render).
    panel.querySelectorAll("[data-quiz-radio]").forEach((radio) => {
      radio.addEventListener("change", () => {
        const valueToRefocus = radio.value;
        const fresh = loadState() || state;
        fresh.responses_transient[item.id] = valueToRefocus;
        saveState(fresh);
        renderItem(bank, fresh, panel);
        // Restore focus to the radio the user just selected — re-rendering
        // the panel innerHTML replaced the DOM node, and without this the
        // keyboard user would lose their place after each arrow press.
        const newRadio = panel.querySelector(`[data-quiz-radio="${valueToRefocus}"]`);
        if (newRadio) newRadio.focus();
      });
    });
    const backBtn = panel.querySelector("[data-quiz-back]");
    if (backBtn) backBtn.addEventListener("click", () => {
      const fresh = loadState() || state;
      if (fresh.current_item_index > 0) {
        fresh.current_item_index -= 1;
        saveState(fresh);
        renderItem(bank, fresh, panel);
        focusCheckedOrFirstRadio(panel);
      }
    });
    const nextBtn = panel.querySelector("[data-quiz-next]");
    if (nextBtn) nextBtn.addEventListener("click", () => {
      const fresh = loadState() || state;
      if (!fresh.responses_transient[item.id]) return;
      if (fresh.current_item_index < total - 1) {
        fresh.current_item_index += 1;
        saveState(fresh);
        renderItem(bank, fresh, panel);
        focusCheckedOrFirstRadio(panel);
      } else {
        finalizeAndShowResult(bank, fresh, panel);
      }
    });
  }

  async function finalizeAndShowResult(bank, state, panel) {
    let result = null;
    try {
      if (!window.QuizScoring || typeof window.QuizScoring.scoreQuiz !== "function") {
        throw new Error("QuizScoring module not loaded");
      }
      result = window.QuizScoring.scoreQuiz({ bank, responses: state.responses_transient });
    } catch (e) {
      panel.innerHTML = `<div data-quiz-state="error" style="padding:8px 0;">` +
        escapeHtml(T("quiz.scoreError", "Ошибка расчёта результата: ")) + escapeHtml((e && e.message) || String(e)) +
        `</div>`;
      return;
    }

    // 1. Compute payload (NO item-level data).
    const payload = {
      quiz_score_normalized: result.raw_score,
      quiz_cefr_band: result.cefr_band,
      quiz_se: Number(result.se.toFixed(4)),
      quiz_completed_at: todayIsoDay(),
      quiz_version: state.version,
      outcome_capture_method: "calibrated-quiz",
    };

    // 2. IMMEDIATELY clear the transient state — privacy invariant.
    clearState();

    // 3. Set the one-shot completion marker (no item-level data).
    let cohort = "";
    try {
      const r = window.LinguistProResearch;
      if (r && typeof r.getState === "function") {
        const s = r.getState();
        if (s && s.cohortCode) cohort = s.cohortCode;
      }
    } catch (_) {}
    try {
      localStorage.setItem(LS_DONE, JSON.stringify({
        version: state.version,
        completed_at: payload.quiz_completed_at,
        cohort_code: cohort,
      }));
    } catch (_) {}

    lastResult = { result, payload };

    // 4. Optional async submit to research backend — wired in C5.
    //    Stub-safe: if submitQuizOutcome is missing (C3 ships before C5
    //    server validator + research.js extension), we silently skip.
    try {
      const r = window.LinguistProResearch;
      if (r && typeof r.submitQuizOutcome === "function" &&
          r.getState && r.getState().enabled && r.getState().cohortCode) {
        r.submitQuizOutcome(payload).catch(() => {});
      }
    } catch (_) {}

    renderResult(result, panel);
  }

  function renderResult(result, panel) {
    const bandLabels = {
      A1: T("quiz.band.A1", "A1 — начальный уровень (Beginner)"),
      A2: T("quiz.band.A2", "A2 — элементарный уровень (Elementary)"),
      B1: T("quiz.band.B1", "B1 — пороговый уровень (Intermediate)"),
      B2: T("quiz.band.B2", "B2 — продвинутый уровень (Upper-Intermediate)"),
      C1: T("quiz.band.C1", "C1 — высокий уровень (Advanced)"),
    };
    const label = bandLabels[result.cefr_band] || result.cefr_band;
    // ARIA label combines score + band so screen readers announce the
    // outcome as a single coherent sentence when aria-live fires.
    const resultSummary = `${T("quiz.result.title", "Результат диагностики")}: ` +
                          `${result.raw_score} / 100. ${label}.`;
    panel.innerHTML =
      `<div data-quiz-state="result" class="quiz-result" ` +
           `role="status" aria-live="polite" aria-atomic="true" ` +
           `aria-label="${escapeHtml(resultSummary)}">` +
        `<h3 id="quizPanelTitle" style="margin:0 0 12px 0;">` +
          escapeHtml(T("quiz.result.title", "Результат диагностики")) + `</h3>` +
        `<div data-quiz-score="1" style="font-size:36px;font-weight:bold;margin:8px 0 6px 0;color:var(--theme-accent,#0a5);">` +
          escapeHtml(String(result.raw_score)) + ` / 100` +
        `</div>` +
        `<div data-quiz-band="1" style="font-size:15px;margin-bottom:14px;">` +
          escapeHtml(label) +
        `</div>` +
        `<div style="font-size:12px;color:var(--theme-text-secondary,#666);margin-bottom:14px;">` +
          `<div>` + escapeHtml(T("quiz.result.seLabel", "Стандартная ошибка измерения (SE)")) + `: ` +
            `<code data-quiz-se="1">${escapeHtml(result.se.toFixed(3))}</code></div>` +
          `<div>` + escapeHtml(T("quiz.result.thetaLabel", "Theta (latent ability)")) + `: ` +
            `<code>${escapeHtml(result.theta.toFixed(3))}</code></div>` +
          `<div>` + escapeHtml(T("quiz.result.correctLabel", "Верных ответов")) + `: ` +
            `<code>${escapeHtml(String(result.correct_count))} / ${escapeHtml(String(result.total_items))}</code></div>` +
        `</div>` +
        `<p style="font-size:11.5px;color:var(--theme-text-secondary,#888);margin:0 0 14px 0;">` +
          escapeHtml(T("quiz.result.privacyNote",
            "На сервер был отправлен только итоговый балл (если research-mode активен). Ваши ответы по каждому вопросу удалены с устройства.")) +
        `</p>` +
        `<div style="text-align:right;">` +
          `<button type="button" class="btn-primary" data-quiz-close="1">` +
            escapeHtml(T("quiz.btn.close", "Закрыть")) + `</button>` +
        `</div>` +
      `</div>`;
    const closeBtn = panel.querySelector("[data-quiz-close]");
    closeBtn.addEventListener("click", destroyPanel);
    // Move focus to the close button so a keyboard user can immediately
    // dismiss the result. The aria-live region announces the score
    // independently of where focus lands.
    closeBtn.focus();
  }

  async function open() {
    const done = loadDone();
    const panel = buildShell();
    if (done) {
      renderCompletedNotice(done, panel);
      return;
    }
    let bank;
    try { bank = await fetchBank(); }
    catch (e) {
      panel.innerHTML = `<div data-quiz-state="error" style="padding:8px 0;">` +
        escapeHtml(T("quiz.loadError", "Не удалось загрузить банк вопросов: ")) + escapeHtml((e && e.message) || String(e)) +
        `</div>`;
      return;
    }
    let state = loadState();
    if (!state || state.version !== bank.instrument_id) {
      state = newState(bank);
      saveState(state);
    } else {
      // Clamp current_item_index if bank shrank (defensive).
      if (state.current_item_index >= bank.items.length) state.current_item_index = bank.items.length - 1;
      if (state.current_item_index < 0) state.current_item_index = 0;
      saveState(state);
    }
    renderItem(bank, state, panel);
    // Initial focus lands inside the modal (first focusable — usually the
    // close button (×) or first radio depending on layout). Without this,
    // a keyboard-only user would still be on whatever launcher button
    // opened the quiz, and Tab would have to walk into the modal manually.
    focusCheckedOrFirstRadio(panel);
  }

  function close() { destroyPanel(); }

  function reset() {
    clearState();
    try { localStorage.removeItem(LS_DONE); } catch (_) {}
    bankCache = null;
    lastResult = null;
  }

  function getResult() { return lastResult; }

  if (typeof window !== "undefined") {
    window.LinguistProQuiz = { open, close, reset, getResult };
  }
})();
