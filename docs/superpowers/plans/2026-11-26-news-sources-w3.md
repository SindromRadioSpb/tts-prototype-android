# Новости W3: общий способ подключения, проверка на 20 статьях, N12 — план

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Любое ивритское издание подключается записью из лент/карты сайта без своих селекторов; перед включением его проверяют на 20 статьях; N12 снова свежий; реклама не попадает в срез; сбор успевает за 2500–3500 статьями в день.

**Architecture:** `extractArticle` получает общий режим (`source.generic`): тело из JSON-LD `articleBody`, иначе из самого плотного блока страницы с вычищенным «шумом»; признак `promoted`. Ленты бывают `rss` и `sitemap` (новостная карта, индекс карт, `.gz`). `news/harvest/newsProbe.js` проверяет издание и пишет итог в `news_outlet_state.probe_json`; включение нового издания — только при пройденной проверке или явном подтверждении владельца. Страницы читаются параллельно по разным хостам, к одному хосту — по одному.

**Spec:** `docs/superpowers/specs/2026-11-26-news-sources-expansion-design.md` §5.1–§5.5, решения 2–4 §12.

## Global Constraints
- Вежливость: `LinguistProNewsReader/1.0`, robots, к одному хосту строго по одному с паузой, `Retry-After`; 403/challenge — стоп маршрута, никакого обхода.
- Настройки шести нынешних изданий не меняются, кроме N12 (только ленты).
- Порог проверки: ≥ 16/20 полных текстов среди бесплатных (≥ 400 знаков, ≥ 2 абзацев, есть дата) и 0 challenge/403; платные пропускаются по одной и считаются отдельно; ниже порога — включение только с `force: true` владельца, оценка остаётся видна.
- Еженедельная автоперепроверка включённых изданий; падение не выключает издание.
- Параллельно не больше 4 хостов.
- Новые строки интерфейса — в ru/en/he; выпуск 3.11.917 одним коммитом и пушем после проверки прода.

## Review Focus
1. Страница без JSON-LD, где «самый плотный блок» — комментарии или «читайте также» → тело не должно стать мусором: тест `generic picks the article body, not related links or comments`.
2. Карта сайта с тысячами старых URL → берутся только свежие (≤ 36 ч) и только статьи по `article`-шаблону: тест `sitemap keeps fresh article links only`.
3. Проверка, при которой сайт отвечает 403 на половине страниц → `pass=false`, причина видна: тест `probe fails on a challenge`.
4. Одна медленная/зависшая лента не задерживает другие хосты сверх таймаута: тест `hosts run in parallel, one host stays sequential`.
5. Включение `force` записывается в журнал с оценкой: тест `forced enable is journaled with the probe score`.

---

### Task 1: Карта сайта как лента; N12 из новостной карты mako
**Files:** `news/harvest/newsHarvest.js` (`parseNewsSitemap`, чтение ленты: `feed.kind==='sitemap'`, индекс карт → вложенные карты, gzip по магии `1f 8b`), `news/harvest/newsHarvestSources.js` (n12: `{ kind: 'sitemap', url: 'https://www.mako.co.il/SiteMap/Mako-News-SitemapIndex.xml', section_he: 'חדשות' }`), test `tests/newsSitemap.test.js`.
- [ ] Тесты: `sitemap keeps fresh article links only` (urlset с `n:publication_date`/`n:title`, старые и чужие URL отброшены); `sitemap index and gz are followed` (индекс → `1.xml.gz`); `n12 reads mako news sitemap, only /news-* links`.
- [ ] FAIL → реализовать (`parseNewsSitemap(xml) → [{link,title,pubDate}]`, `{sitemaps:[loc]}` для индекса) → PASS → commit.

### Task 2: Общий разбор статьи
**Files:** `news/harvest/newsExtract.js` (`genericBlocks(document, ld)`; `promoted`), test `tests/newsExtractGeneric.test.js`.
- [ ] Тесты (синтетические страницы): `generic reads JSON-LD articleBody into paragraphs`; `generic picks the article body, not related links or comments` (WordPress-подобная разметка без LD, рядом блоки related/comments/newsletter); `promoted content is marked` («תוכן מקודם»/`sponsored`); `a page with a text selector is unchanged` (нынешние тесты зелёные).
- [ ] Правило: удалить блоки с class/id `/related|recommend|comment|newsletter|share|social|tags|promo|sponsor|advert|banner|outbrain|taboola|footer|breadcrumb|author-box/i`; кандидаты — `[itemprop=articleBody]`, `article`, `main`, `div`, `section`; оценка = длина ивритского текста прямых `<p>`-потомков (вложенность до 2) минус текст ссылок; лучший → абзацы `p, h2, h3, li` внутри. LD `articleBody` ≥ 400 знаков и больше найденного → абзацы по `\n` (или по предложениям группами ≤ 600 знаков).
- [ ] FAIL → реализовать → PASS → commit.

### Task 3: Проверка издания
**Files:** create `news/harvest/newsProbe.js`; modify `db/newsOutletState.js` (`setProbe(id, probe)`, `setEnabled(id, on, actor, { force })` — для изданий вне `LEGACY = ['ynet','walla','maariv','n12','haaretz','c14']` нужна `probe.pass` или `force`), `news/newsRoutes.js` (`POST /api/news/editor/outlets/:id/probe` — владелец, запуск в фоне, 202; `GET …/outlets` отдаёт `probe`), `news/harvest/newsHarvest.js` (`probeOutlet(id)` на тех же `get`/robots; еженедельная перепроверка в `tick`, по одному изданию за тик), `public/js/news-editor-ui.js` (оценка «18/20 полных текстов · дата 20 · автор 14 · фото 19 · реклама 0 · платных 3», кнопка «Проверить», включение ниже порога — с подтверждением), локали; tests `tests/newsProbe.test.js`, `tests/newsOutletState.test.js`, `tests/newsEditorUi.test.js`.
- [ ] Тесты: `probe samples 20 free articles across feeds and scores them`; `probe fails on a challenge`; `paywalled articles are skipped and counted`; `enable needs a passed probe unless forced`; `forced enable is journaled with the probe score`; `probe score is shown, translated`.
- [ ] FAIL → реализовать → PASS → commit.

### Task 4: Реклама вне среза; параллельные хосты
**Files:** `news/harvest/newsHarvest.js` (страница с `promoted` → `status='failed', reason='PROMOTED'`; очередь страниц: группировка по хосту, до 4 воркеров, в каждом по одному с паузой; `pagesPerPoll` = max(120, 30 × число включённых изданий)), tests `tests/newsHarvestOutletState.test.js`.
- [ ] Тесты: `promoted pages never enter the slice`; `hosts run in parallel, one host stays sequential` (фейковый fetch фиксирует одновременность по хостам).
- [ ] FAIL → реализовать → PASS → commit.

### Task 5: Выпуск 3.11.917
- [ ] `npm test` зелёный; штампы 3.11.917 (`git fetch` и сверка `origin/main` до штампов); ревью свежим агентом; на локальном сервере — проверка шести изданий кнопкой «Проверить» на настоящих сайтах (с ПК), результат записать в §19 формата.
- [ ] Прод: `df`, `coolify-db` healthy, удалить предыдущий образ, `builder prune`; один коммит, пуш; после — prune; проверка N12 в срезе.
