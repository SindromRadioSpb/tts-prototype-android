# Generic source labels: предложение, не реализация

База: `2f0944e8`, локальная RC3.2 context integration. 19 английских названий единиц/приставок и `Ra` — заявленный владельцем дополнительный набор. Его точные материалы/acceptance tests ещё не переданы; число 20 здесь независимо не сертифицируется. Основная интеграция от него не зависит.

В текущем коде `AtlasWords.wordsOf` использует Hebrew `ReaderMorph.tokenize(...).isWord`, `locateTerms` ожидает `lemma_he || niqqud`, ячейки фильтруются по наличию Hebrew. `verifyOccurrence`, `sectionTermItems`, train bank и due restore опираются на Hebrew occurrence/название. Один английский alias не устраняет эти ограничения.

Предлагается отдельное явно типизированное **source label place**:

- `label`: точная строка источника, language/script и направление LTR; `lemma_he=null`. Для `Ra` роль и значение берутся из указанного места источника, без предположения, что это химический символ или показатель шероховатости.
- Binding: corpus ID, source atlas ID, edition revision/manifest SHA, PDF SHA, section/page, semantic object ID, точное поле cell/part/label, source record SHA и SHA точного значения поля. При необходимости bbox как дополнительное свидетельство, не как замена semantic ID.
- `term_id + sense` связываются с конкретным place в явном reviewed allowlist. Никаких substring/fuzzy match, нормализации цифр/символов, глобального label admission или `word_offset=0` для строки без Hebrew words.
- Отдельный `verifyLabelPlace`: проверяет source hashes, identity, поле, точное значение, term/sense binding и field eligibility. Новый текст, иной порядок, перенос в соседнюю ячейку, foreign edition, расширенный scope, источник с holds или отсутствие reviewed allowlist отклоняются.
- UI показывает исходный label и русский смысл с provenance; не создаёт Hebrew morphology/gloss/pronunciation. Возможность обучения допускается только отдельным явным решением по термину/смыслу/источнику, не наличием label и не AI-подсказкой.
- Если обучение будет согласовано: term-level target с типом source-label; старые Hebrew occurrence verifier и `at1` identities сохраняются. Тип/label/source binding должны пройти bank → section target → due restore без превращения в word-status occurrence. Точный контракт и key choice фиксируются после получения материалов, чтобы не менять существующие учебные ключи по предположению.

Будущие тесты: ровно переданный список; неизвестные английские слова/символы/числа не принимаются; `Ra` в другом поле не разрешён; неправильные hash/revision/term/sense/field/bbox не проходят; stale due target блокируется; исходные Hebrew corpus/word keys и held numeric targets не меняются. Утверждения о готовом generic-label механизме до этих входов и тестов нет.
