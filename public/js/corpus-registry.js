// corpus-registry.js — the multi-corpus contract of the Reading Room (Room-only).
// Design + owner-approved surface (B+C «витрина + линза»): docs/planning/
// BRR_MULTI_CORPUS_DESIGN_2026_07_02.md. Pure data + tiny helpers (no DOM, Node-importable).
//
// A corpus is a MANIFEST (identity + native taxonomy + honest capability list) rendered by the
// hub (L0) and the in-corpus switcher pill. Adapters: with exactly two corpora the dispatch
// lives in library-ui.js (rule of two — the contract is proven by the second corpus, the
// pluggable adapter OBJECT lands with the third, e.g. a topical baked catalog). Counts are
// dynamic → resolved by the caller (catalog counts / localDb query), never hardcoded here.
//
// Capability keys are HONEST product facts (R9 derived≠asserted): a corpus never wears a badge
// for something it fakes. `i18n` keys resolve through the Room's t(); fallbacks are ru.

export const CORPORA = [
  {
    id: 'benyehuda',
    icon: '🏛',
    kind: 'baked-catalog',
    title: { key: 'room.hub.benyehuda.title', fb: 'Библиотека Бен-Иегуды' },
    desc: { key: 'room.hub.benyehuda.desc', fb: 'Классический ивритский канон: период → автор → работа' },
    capabilities: ['morph', 'translations', 'audio', 'fts', 'bands', 'ctxBaked'],
  },
  {
    id: 'mytexts',
    icon: '📖',
    kind: 'local-db',
    title: { key: 'room.hub.mytexts.title', fb: 'Мои тексты' },
    desc: { key: 'room.hub.mytexts.desc', fb: 'Ваши тексты из Студии: уровни, теги, своё аудио' },
    capabilities: ['morph', 'ownTranslations', 'ownAudio', 'ctxLive'],
    cta: 'add',   // the import funnel: «+ Добавить текст» → Studio (later: PDF import)
  },
];

// Badge dictionary: capability → { icon, i18n key, ru fallback }. Kept SMALL and truthful —
// these are shown on hub cards and corpus headers.
export const CAPABILITY_BADGES = {
  morph: { icon: '⚡', key: 'room.hub.cap.morph', fb: 'морфология офлайн' },
  translations: { icon: '✓', key: 'room.hub.cap.translations', fb: 'перевод предвыч.' },
  ownTranslations: { icon: '✓', key: 'room.hub.cap.ownTranslations', fb: 'перевод свой' },
  audio: { icon: '♪', key: 'room.hub.cap.audio', fb: 'аудио' },
  ownAudio: { icon: '♪', key: 'room.hub.cap.ownAudio', fb: 'своё аудио' },
  fts: { icon: '🔎', key: 'room.hub.cap.fts', fb: 'поиск по текстам' },
  bands: { icon: '📶', key: 'room.hub.cap.bands', fb: 'полосы сложности' },
  ctxBaked: { icon: '🎯', key: 'room.hub.cap.ctxBaked', fb: 'контекст офлайн' },
  ctxLive: { icon: '🎯', key: 'room.hub.cap.ctxLive', fb: 'контекст live' },
};

export function corpusById(id) {
  for (const c of CORPORA) if (c.id === id) return c;
  return null;
}
