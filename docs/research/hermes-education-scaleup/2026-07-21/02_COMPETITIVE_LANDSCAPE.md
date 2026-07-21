# 02 — Конкурентный ландшафт AI-продуктов для изучения языков (2024–2026)

> **Что это:** веб-исследование конкурентного ландшафта AI-продуктов для изучения языков с фокусом на capability-гэпы относительно личной связки «LinguistPro (SRS FSRS-6 + чтение с морфологией-на-тапе) + личный LLM-агент (Hermes/mentor) с доступом к текстам и словарю пользователя». Язык изучения — иврит.
> **Как получено:** WebSearch/WebFetch по сайтам продуктов, независимым обзорам (Lingtuitive, Copycat Cafe, All Language Resources, Practice Me, Langoly и др.), отзывам (Trustpilot, App Store), пресс-релизам и академическим обзорам; 2–4 источника на продукт. Дата сбора: 2026-07-21.
> **Статус:** сырой research-отчёт (не проверен владельцем). Оценки «есть ли аналог в связке» — предположения аналитика, требуют сверки с фактическим состоянием продукта.
> **Файл для чтения/аннотаций:** этот. Scratch-файлов нет.

---

## 1. Разговорные AI-тьюторы (speaking-first)

### 1.1 Speak (speak.com) — лидер категории, $1B valuation
**Capabilities:**
- Структурированный курс → AI-разговоры встроены в учебную прогрессию (не «пустой чат»): курс сначала, speaking-практика внутри него ([Lingtuitive 54-day review](https://lingtuitive.com/blog/speak-review)).
- «Speaking Drill» — массовое проговаривание сотен предложений в неделю (repetition-based fluency).
- Roleplay: сценарные диалоги с конкретными задачами (заказать кофе, спланировать поездку) — task-based, AI проверяет выполнение задачи.
- Live Roleplays на **OpenAI Realtime API** (speech-to-speech, GPT-4o) — реальное низколатентное голосовое взаимодействие ([TechCrunch](https://techcrunch.com/2024/12/10/openai-backed-speak-raises-78m-at-1b-valuation-to-help-users-learn-languages-by-talking-out-loud/)).
- Собственный ASR-движок (Conformer-CTC), анализ произношения/интонации/беглости.
- Pocket AI Tutor — «спроси о чём угодно» из любого места приложения (контекстный ответ).
**Что сильно (по отзывам):** лучшая интеграция «курс + speaking» для новичков; Wirecutter NYT назвал одним из лучших 2026. Слабость: ASR слишком снисходителен — можно перепутать порядок слов и получить perfect score ([Lingtuitive](https://lingtuitive.com/blog/speak-review)).
**Иврит:** НЕ поддерживается (Spanish/French/Korean/Japanese/Italian/English).
Ссылки: [speak.com](https://www.speak.com/) · [LanguaTalk review](https://languatalk.com/blog/speak-app-review/) · [Practice Me](https://practiceme.app/vs/speak)

### 1.2 Praktika (praktika.ai)
**Capabilities:**
- Ультра-реалистичные анимированные 3D-аватары-тьюторы (Raika, Tama, Skye…) — снимают страх говорения «без давления живого человека».
- Персональный learning path: цель (Travel/Career/Living Abroad) + CEFR A1–C1 + интересы → персональный курс сценариев.
- **Мультимодальные затравки диалога: загрузка фото, PDF, голосовых заметок** → разговор о СВОЁМ контенте, не о пресетах ([Skywork review](https://skywork.ai/skypage/en/Praktika-AI-An-In-Depth-2025-Review-for-the-AI-Curious-Learner/1976119164671815680)).
- Обновление 4.0 (апрель 2025): pronunciation feedback.
- 2026: **мульти-агентная система тьюторинга** — фоновый агент мониторит статистику ученика и скармливает её тьютору ([Enverson comparison](https://www.enverson.com/best-ai-language-learning-apps-in-2026-compared-reviewed)).
**Что сильно:** вовлечение/визуал, снятие speaking-барьера для новичков и lower-intermediate.
**Иврит:** НЕ поддерживается (9 языков, английский-first).
Ссылки: [LanguaTalk review](https://languatalk.com/blog/praktika-review/) · [Trustpilot](https://www.trustpilot.com/review/praktika.ai) · [Linguasteps](https://linguasteps.com/reviews/praktika-review-2025-ai-language-tutor-with-video-avatars-real-world-results)

### 1.3 Loora (loora.com) — израильский стартап, релевантен как «сосед по рынку»
**Capabilities:**
- Личный AI-тьютор английского (голосовые разговоры на любые темы: бизнес, спорт, техника) с мгновенным фидбеком на грамматику/произношение/акцент.
- Персональный план по целям; adaptive difficulty; прогресс-дашборд (стрики, длительность сессий, метрики улучшения), пост-разговорные summary.
- $21M funding (Emerge, QP Ventures, Hearst); 15M+ пользователей, ~200K в Израиле ([Times of Israel](https://www.timesofisrael.com/master-english-fluency-israeli-startup-nabs-9-25m-funding-for-virtual-ai-tutor/), [Ctech](https://www.calcalistech.com/ctechnews/article/syyplpqna)).
**Важно:** Loora — про обучение АНГЛИЙСКОМУ (интерфейс поддерживает иврит как язык пользователя, т.е. продукт для израильтян, а не для изучающих иврит). Обучения ивриту у Loora НЕТ → на рынке «AI-тьютор иврита» лидера-аналога не существует. Это подтверждает гэп категории.
Ссылки: [loora.com](https://www.loora.com/) · [Ynet](https://www.ynetnews.com/magazine/article/rjit7jckge) · [Midoo review](https://www.midoo.ai/reviews/loora-review)

### 1.4 TalkPal (talkpal.ai) — редкий случай: ИВРИТ ЕСТЬ
**Capabilities:**
- 55+ языков, включая иврит: chat, call (голосовой звонок AI), roleplays, characters (персонажи), debates, photo description.
- ASR + мгновенный фидбек на произношение; персональный learning path после оценки уровня.
**Ограничение по ивриту:** только freeform-режимы, СТРУКТУРИРОВАННОГО курса для иврита нет (в отличие от французского/испанского) ([LanguaTalk review](https://languatalk.com/blog/talkpal-review/)). Качество иврит-голосов/ASR по отзывам среднее.
**Что сильно:** широта языков и режимов; дёшево.
Ссылки: [talkpal.ai Hebrew](https://talkpal.ai/how-ai-language-app-talkpal-is-revolutionizing-hebrew-learning/) · [App Store](https://apps.apple.com/us/app/talkpal-ai-language-learning/id6468219825)

### 1.5 Univerbal (ex-Quazel)
**Capabilities:**
- 20+ языков; сценарные иммерсивные диалоги; AI отвечает «как человек», адаптируется к уровню, постепенно повышает сложность.
- Мгновенные исправления с объяснениями; персонализация curriculum; прогресс-трекинг «учится с каждой сессии».
**Что сильно:** снятие страха оценки, свободный разговор вместо фиксированных фраз.
**Иврит:** в списках поддержки не значится.
Ссылки: [univerbal.app](https://www.univerbal.app/) · [Think in Italian expert review](https://www.thinkinitalian.com/app-review/univerbal) · [Product Hunt](https://www.producthunt.com/products/univerbal-formerly-quazel/reviews)

### 1.6 Langua / LanguaTalk — эталон «AI + человеческие тьюторы + vocab-петля»
**Capabilities:**
- Начинали как маркетплейс живых репетиторов → добавили AI-тьютора (2024). Гибрид «AI-практика + живой тьютор» в одном продукте.
- Самые «человечные» голоса/диалоги по отзывам (4.8/5, 96% рекомендуют, [reviews.io](https://www.reviews.io/company-reviews/store/languatalk)).
- Режимы: роллплеи, дебаты, vocab/grammar practice; **пост-чат отчёты** с разбором ошибок; **аудио-summary** ключевых тем и фраз + культурные подсказки.
- **Петля словаря: сохранённые слова → SRS-флешкарты → AI вплетает их в следующие разговоры → короткие истории, насыщенные ТВОИМИ словами** — редкая и самая близкая к связке механика ([try-langua](https://languatalk.com/try-langua)).
**Иврит:** НЕТ (23 языка, проверено: [support](https://support.languatalk.com/article/127-which-languages-can-i-learn-on-langua); арабский web-only).
Ссылки: [Unite.AI review](https://www.unite.ai/languatalk-review/) · [Lingtuitive](https://lingtuitive.com/blog/langua-ai-tutor-review)

### 1.7 Jumpspeak
**Capabilities:** «speak from day one» — сразу в сценарии (ресторан, отель, small talk); real-time проверка произношения; короткие уроки 3–8 мин.
**Слабость по отзывам:** роботизированные голоса, повторяющиеся диалоги; вне испанского/французского/немецкого деградирует до «голого чат-бота» ([ICanLearn](https://www.icanlearn.com/jumpspeak/), [LanguaTalk](https://languatalk.com/blog/jumpspeak-review/)). Иврита нет.

### 1.8 ELSA Speak — специалист по произношению (бенчмарк speech scoring)
**Capabilities:**
- **Фонемный** скоринг произношения (не общий балл): цветовая подсветка ошибок по фонемам, сравнение с моделью целевого акцента.
- После AI-разговора — отчёт: fluency (паузы, хезитации, темп), грамматика, словарь, произношение+интонация в спонтанной речи ([Skywork deep dive](https://skywork.ai/skypage/en/ELSA-Speak-in-2025-An-AI-User's-Deep-Dive-into-the-Ultimate-Pronunciation-Coach/1974387185089703936)).
- 25M+ пользователей, 4.7★/460K отзывов; академические работы подтверждают эффект на произношение.
**Иврит:** нет (English only). Фонемного скоринга ИВРИТА нет ни у кого из массовых игроков → открытая ниша.
Ссылки: [Medium review](https://medium.com/@emmamillerw1990/elsa-speak-review-can-it-perfect-your-pronunciation-8c737d8ffdd1) · [ResearchGate](https://www.researchgate.net/publication/398120377_The_Effectiveness_of_ELSA_Speak_in_Facilitating_Students'_Pronunciation_in_Storytelling)

---

## 2. LLM внутри классических продуктов

### 2.1 Duolingo Max
**Capabilities:**
- **Explain My Answer** — LLM-объяснение, почему ответ верен/неверен (с января 2026 бесплатно в популярных курсах) ([Copycat Cafe](https://copycatcafe.com/blog/duolingo-max)).
- **Roleplay** с «мировыми персонажами» + AI-фидбек после сессии: accuracy, complexity, разнообразие словаря.
- **Video Call с Lily** — видео-звонок с персонажем: начинает с темы последнего урока, отвечает в реальном времени, ПОМНИТ прошлые разговоры, подстраивается под уровень, делает «паузы на подумать» (антропоморфизм); намеренно НЕ исправляет грамматику в моменте ([Duolingo blog](https://blog.duolingo.com/video-call/), [The Owl and Me](https://theowlandme.blog/2026/01/10/review-duolingo-max-video-calls/)).
**Что сильно:** масштаб, персонажная привязанность, memory-of-conversations, streak-педагогика.
**Иврит:** курс иврита — один из САМЫХ слабых на платформе: нет speaking-упражнений вообще, непоследовательный никуд, ~2000–2500 слов, нет Stories, нет Max-фич ([Rhapsody in Lingo](https://rhapsodyinlingo.com/en/duolingo-hebrew-review/), [Hebrew Guide](https://hebrew.guide/duolingo-modern-hebrew-course-review/)).

### 2.2 Babbel (Babbel Speak + Everyday Conversations)
**Capabilities:**
- **Babbel Speak** (сентябрь 2025): голосовой AI-тренажёр «от молчания к речи» для новичков — проговаривание бытовых ситуаций с подсказками и поддержкой, judgment-free ([пресс-релиз](https://www.babbel.com/press/en-us/releases/babbel-speak)).
- Everyday Conversations: диалоговая практика по экспертно-скроенным пресетам.
- AI speech recognition в словарных уроках: near real-time сравнение с эталонным произношением.
**Что сильно:** дидактически выверенный контент (экспертный curriculum) + аккуратное, дозированное внедрение AI. **Иврит:** НЕ преподаёт (14 языков, иврита нет).

### 2.3 Memrise (MemBot, AI Buddies, Podchats)
**Capabilities:**
- **MemBot** (GPT-based): текстовый/голосовой разговорный партнёр, ведёт разговор К ЦЕЛЕВОЙ лексике/грамматике (guided conversation toward target vocab) ([Memrise blog](https://www.memrise.com/blog/introducing-membot)).
- AI Buddies (май 2025): специализированные боты — грамматика, роллплей, перевод, культура.
- **Podchats**: unscripted голосовой разговор с «AI-ведущим подкаста» за 3 минуты (для intermediate+).
- AI-генерация мнемоник-картинок (Mems); редизайн 2025 с Conversations Tab и улучшенным ASR.
**Что сильно:** заявленная метрика — 45% быстрее рост speaking-confidence при 3+ MemBot-сессиях в неделю ([Skillademia stats](https://www.skillademia.com/statistics/memrise-statistics/)). Курс иврита в Memrise есть (community-контент + видео носителей), но MemBot-покрытие иврита ограничено (15 языков для разговора).

---

## 3. Иврит-специфика: что даёт нативный стек, чего нет у generalist-продуктов

### 3.1 HebrewPod101 (Innovative Language)
**Capabilities:** 500+ аудио/видео-уроков с носителями (3 новых в неделю), диалог → культурный контекст → лексика/морфология; line-by-line аудио, транскрипты, флешкарты, voice-recorder, word lists; уровни от абсолютного новичка ([Mezzoguild](https://www.mezzoguild.com/hebrewpod101-review/), [Langoly](https://www.langoly.com/hebrewpod101-review/)).
**Что сильно:** ОБЪЁМ профессионально записанного аудио с носителями + культурные комментарии — то, что LLM-продукты не дают. Слабость: подходит как supplement, не как основной курс; advanced-контента мало.

### 3.2 Citizen Café Tel Aviv — эталон живого «разговорного иврита»
**Capabilities:** онлайн-ульпан (10-недельные семестры, 2×90 мин/нед + 4 практические сессии), 12 уровней (Foundation/Flow/Freedom); метод social-emotional learning: диалоги из реальной жизни, **слэнг + культура + «иврит, на котором реально говорят израильтяне»**; высокоэнергетические групповые занятия ([citizencafetlv.com](https://www.citizencafetlv.com/how-it-works/), [Trustpilot](https://www.trustpilot.com/review/citizencafetlv.com)).
**Что сильно:** «hands down the best ulpan» по отзывам; живое сообщество из 25+ стран; РАЗГОВОРНЫЙ регистр (чего нет ни в одном приложении). Это человеческий сервис — приложением не является, но задаёт планку контента.

### 3.3 Инструментальный иврит-стек (словари/морфология)
- **Pealim** ([pealim.com](https://www.pealim.com/)) — полные таблицы спряжений, биньяны, корни, огласовки. Планка качества морфо-таблиц. *В связке уже есть офлайн-эквивалент (pealim-infl-v12, 9279 парадигм).*
- **Morfix** — ведущий израильский иврит↔англ словарь: part of speech, род, реальные примеры, аудио, авто-никуд ([hebrewversity](https://www.hebrewversity.com/hebrew-premium/hebrew-grammar-vocabulary/web-resources-in-hebrew-2/hebrew-study-tools-and-dictionaries/)).
- **Reverso Context** — переводы в живых контекстах (parallel corpora); для иврита — способ увидеть узус, которого нет в словарях.
- **Dicta** ([EAJS showcase](https://www.eurojewishstudies.org/digital-forum-showcase-reports/dicta-the-israel-center-for-text-analysis/)) — Nakdan (авто-огласовка: LSTM-морфоанализ + экспертные таблицы, Modern/Rabbinic/Poetic Hebrew), морфо-тэггинг, дизамбигуация ([arXiv](https://arxiv.org/pdf/2005.03312)). Исследовательский, не learner-facing. *Связка уже использует Dicta (стемминг, silver-оракул, Tier-3).*
**Вывод по нише:** иврит-стек существует как РОССЫПЬ инструментов; ни один generalist-продукт их не интегрирует. Связка LinguistPro — редкий пример интеграции (Pealim-словарь + Dicta + никуд-педагогика + Ben-Yehuda корпус) — по этому измерению она ВПЕРЕДИ рынка, а не позади.

---

## 4. Контент-иммерсия (чтение/видео/песни)

### 4.1 LingQ
**Capabilities:**
- Импорт ЛЮБОГО контента: web-статьи, YouTube, подкасты, e-books, песни (расширение браузера + импортеры); community-библиотека 30+ языков.
- Известные слова/LingQs: статусная модель слова, SRS-флешкарты, cloze-упражнения.
- AI-фичи 2025: **AI-транскрипция аудио (подкасты/аудиокниги → интерактивные уроки), AI-упрощение сложных уроков под уровень**, чат-бот Lynx с web-поиском, AI-голоса ([Lingtuitive guide](https://lingtuitive.com/blog/how-to-read-books-with-lingq-guide), [Actual Fluency](https://actualfluency.com/lingq-review/)).
**Иврит:** поддерживается, но слабо: примитивный TTS (хуже Google), НЕТ опции никуда в мини-историях (просили на форумах годами) ([LingQ forum](https://forum.lingq.com/t/hebrew-tts/34441), [niqqud thread](https://forum.lingq.com/t/now-what-about-niqqud-for-hebrew/27976)).

### 4.2 Language Reactor (ex-Learning with Netflix)
**Capabilities:** двойные субтитры Netflix/YouTube (+Prime, Coursera, Udemy); hover-словарь во время просмотра (определение+произношение+примеры, не выходя из потока); авто-пауза после каждой реплики; повтор реплики/замедление; экспорт в Anki; ядро бесплатно ([Class Central](https://www.classcentral.com/report/review-language-reactor/), [Skywork](https://skywork.ai/blog/ai-agent/language-reactor-review/)).
**Иврит:** работает с ивритскими субтитрами Netflix (Fauda, Shtisel и т.п.) — де-факто главный инструмент видео-иммерсии для иврита; по отзывам иврит-TTS у LR лучше, чем у LingQ.

### 4.3 Migaku
**Capabilities:** browser-extension поверх Netflix/YouTube/Disney+; тап по слову в субтитрах → словарь+AI-объяснение в контексте; **1 клик →媒иа-карточка: предложение + скриншот сцены + аудио-фрагмент + TTS + картинка** (лучший card-mining на рынке); Academy-курсы «~1500 слов + 300 грамматик = 80% Netflix»; свой SRS ([migaku.com](https://migaku.com/), [Tofugu](https://www.tofugu.com/japanese-learning-resources-database/migaku/)).
**Иврит:** НЕ поддерживается (10 языков, CJK-核心).

### 4.4 Readlang / Lute
- **Readlang** ([readlang.com](https://readlang.com/)): 50+ языков (иврит есть), клик-перевод, web-importer (включая целые книги), SRS по частотным спискам, $5/мес ([Mezzoguild](https://www.mezzoguild.com/readlang-review/)).
- **Lute v3** ([GitHub](https://github.com/jzohrab/lute)) — self-hosted open-source наследник Learning With Texts: импорт текстов, статусы терминов, свой словарь. Аскетичный, без AI.
Оба — «чтение с подсказками» без морфологии и без честного провенанса; иврит без никуд-логики.

### 4.5 Песни: LyricsTraining / Lirica
- **LyricsTraining**: fill-in-the-blank по субтитрам клипов (4 варианта → 100% лирики на advanced), 14 языков, ИВРИТ ЕСТЬ; тренирует слуховое распознавание; без переводов/объяснений ([ALR mini-review](https://www.alllanguageresources.com/lyricstraining/)).
- **Lirica**: поп-хиты как уроки (грамматика+лексика+культура, уровни Beginner1/2/Intermediate); сделана лингвистами; испанский/английский/немецкий — иврита нет ([Castledown journal review](https://www.castledown.com/journals/tltl/article/view/1500/312)).

### 4.6 AI-генерация историй под уровень (новая волна 2025)
- **Gradia** — генерация свежих историй on-demand по CEFR A1–C2 + TTS ([App Store](https://apps.apple.com/us/app/graded-reader-gradia/id6751861961)).
- **Lenguia** — **контекстный SRS: твои флешкарты/новые слова автоматически вплетаются в генерируемые истории** ([lenguia.com](https://www.lenguia.com/)) — самая близкая к связке механика.
- **MeloLingua** — story + level-aware difficulty + tap-translate + произношение; нарратив живыми носителями.
- **StoryLing** — библиотека graded-историй, каждое новое слово в осмысленном контексте.
- Академическое подтверждение направления: fine-tuning компактных LLM для генерации детских историй с контролем сложности ([arXiv 2605.13709](https://arxiv.org/pdf/2605.13709)).
Иврит в этой волне почти не представлен.

---

## 5. Тренды 2025–2026

1. **Real-time voice (speech-to-speech).** OpenAI Realtime API GA (август 2025, gpt-realtime): прямая обработка аудио без ASR→LLM→TTS конвейера, сохранение тона и тайминга; MCP-серверы, image input, SIP-звонки ([OpenAI](https://openai.com/index/introducing-gpt-realtime/)). Speak, Duolingo Video Call — уже на этом. Индивидуальные разработчики собирают голосовых тьюторов на Realtime API за недели ([HN example](https://news.ycombinator.com/item?id=46779716)).
2. **Агентные тьюторы / мульти-агентность.** Praktika: фоновый агент-аналитик стат + агент-тьютор; Enverson: 6 агентов (Grammar/Fluency/Writing/Listening/Reading/Vocabulary) + «долгая память об ошибках, эмоциональном тоне, стиле обучения» ([Enverson](https://www.enverson.com/what-are-the-best-ai-language-learning-apps-2026-edition), [Test Prep Insight](https://testprepinsight.com/resources/how-ai-is-transforming-language-learning-in-2026/)).
3. **Персональные учебные планы от LLM.** Стандарт: цель+уровень+интересы → генерируемый план сценариев (Praktika, Loora, TalkPal, Univerbal). Дифференциатор смещается к тому, ЧЬИ данные питают план (ошибки, SRS-история, прочитанные тексты).
4. **AI-генерация контента под уровень.** Graded-истории on-demand (Gradia), упрощение аутентичного контента (LingQ AI-Simplified), вплетение персональных слов (Lenguia, Langua stories). Decodable/comprehensible-input как продуктовый принцип.
5. **Speech scoring как commodity-API.** Speechace (фонема/слог/word-score 0–100, lexical stress, CEFR-оценка беглости, [docs](https://docs.speechace.com/)) и Azure Pronunciation Assessment (IPA-фонемы, syllable timing, [Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)) позволяют встроить произносительный скоринг без своей ML-команды. Иврит у этих API поддержан слабо/не поддержан — техническое ограничение и одновременно ниша.
6. **Память разговоров и «отношения» с персонажем.** Lily помнит прошлые звонки; Langua вплетает твои слова. Персистентная память ученика = главный moat, и у личной связки она структурно сильнее (review_log, тексты, словарь).

---

## 6. Сводная capability-матрица

Легенда «Аналог в связке»: ✅ есть/сильнее · 🟡 частично/хуже UX · ❌ нет. (Предположения — сверить с продуктом.)

| Возможность | Кто делает лучше всех | Аналог в связке (приложение+агент) | Потенциал переноса |
|---|---|---|---|
| Real-time голосовой роллплей (speech-to-speech) | Speak, Duolingo Video Call | ❌ нет speaking-поверхности вовсе | ВЫСОКИЙ: Realtime-API + сценарии из прочитанных текстов; риск — качество иврит-голосов/ASR |
| Фонемный скоринг произношения + fluency-отчёт | ELSA, Speechace/Azure (API) | ❌ | СРЕДНИЙ: для иврита commodity-API слабы; MVP = ASR-транскрипт + LLM-оценка, без фонем |
| Структурированный курс/план с прогрессией (CEFR, цели, сценарии) | Speak, Babbel, Praktika | 🟡 агент может планировать ad-hoc, но нет персистентной курс-прогрессии | ВЫСОКИЙ: агент строит план из review_log + прочитанного; дёшево, данных больше, чем у конкурентов |
| Пост-сессионный разбор ошибок → в SRS | Langua (post-chat reports), ELSA | 🟡 агент умеет разбирать, но нет систематической петли «моя продукция → ошибки → карточки» | ВЫСОКИЙ: у связки уже есть SRS-инфраструктура — не хватает только источника «речь/письмо ученика» |
| AI вплетает слова ИЗ ТВОЕЙ колоды в разговор/истории | Langua, Lenguia | 🟡 предпосылки идеальны (агент видит словарь), продуктовой петли нет | ВЫСОКИЙ: генерация историй/диалогов из due-слов — прямое усиление reading-first моата |
| Видео-иммерсия: двойные субтитры + hover-словарь (Netflix/YouTube) | Language Reactor, Migaku | ❌ только текстовое чтение | СРЕДНИЙ: свой плеер YouTube-субтитров с морфологией-на-тапе реален; Netflix — extension-территория |
| 1-клик медиа-карточка (скриншот+аудио+предложение) | Migaku | 🟡 карточки из текстов есть; из видео/аудио — нет | СРЕДНИЙ |
| Аудио-иммерсия: AI-транскрипция подкастов → интерактивный урок | LingQ | ❌ (TTS есть, обратного пути аудио→текст нет) | ВЫСОКИЙ: Whisper-класс ASR для иврита достаточен; уникально в паре с морфологией |
| Обучение через песни (клипы, fill-in-lyrics) | LyricsTraining (иврит есть!), Lirica | ❌ | НИЗКИЙ/СРЕДНИЙ: лицензии на музыку — барьер; вариант: паблик-домен песни/пиюты из Ben-Yehuda |
| Мультимодальные затравки диалога (фото/PDF/voice-note) | Praktika | 🟡 агент принимает файлы, но не как учебный сценарий | СРЕДНИЙ |
| Explain My Answer (LLM-объяснение ошибки в упражнении) | Duolingo Max | ✅ агент объясняет глубже + морфо-провенанс | — (уже сильнее) |
| Память разговоров/долгая память ученика | Duolingo Lily, Enverson | ✅ структурно сильнее: review_log, тексты, словарь | — (moat связки) |
| Морфология с провенансом (корень/биньян/никуд, честность) | Pealim/Dicta (россыпь), из приложений — НИКТО | ✅ уникально | — (moat связки) |
| Геймификация: лиги, стрики, персонажи, социальное давление | Duolingo | 🟡 стрики есть; лиг/социума/персонажей нет | НИЗКИЙ: сознательно не гнаться; персонаж-континуитет агента — дешёвая частичная замена |
| Живой разговорный иврит: слэнг, культура, сообщество | Citizen Café (человеческий сервис) | ❌ корпус — литературный/классический | СРЕДНИЙ: слэнг-контент через агента; сообщество — вне scope |
| Профессиональное аудио носителей + культурные комментарии | HebrewPod101 | ❌ только TTS | НИЗКИЙ: контент-производство; частично закрывается качественным TTS |
| Маркетплейс живых тьюторов / гибрид AI+человек | LanguaTalk | ❌ | НИЗКИЙ: вне scope личного продукта |
| Оценка уровня (placement) + адаптивная сложность контента | Praktika, LingQ (AI-simplify) | 🟡 неявная (статусы слов); явного placement/упрощения текста нет | ВЫСОКИЙ: «упрости этот текст под мой уровень» — естественная задача агента над корпусом |

### Ключевой вывод
Связка «LinguistPro + агент» уже впереди рынка по: (а) честной морфологии с провенансом, (б) владению памятью ученика (review_log + тексты + словарь), (в) иврит-стеку (Pealim/Dicta/никуд/корпус). Системные гэпы концентрируются в одном месте — **производство речи учеником**: нет ни голосового собеседника, ни произносительного фидбека, ни петли «моя продукция → ошибки → SRS». Второй кластер гэпов — **аудио/видео-иммерсия** (транскрипция, субтитры, песни). Третий — **явная курс-прогрессия/placement** поверх уже собранных данных. При этом для иврита НИ ОДИН конкурент не сочетает speaking + морфологию + SRS: TalkPal (иврит-speaking без структуры и морфологии) и Language Reactor (видео без SRS-глубины) — ближайшие соседи, оба легко превосходимы по глубине именно из-за данных, которыми связка уже владеет.
