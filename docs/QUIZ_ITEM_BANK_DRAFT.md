# Calibrated Diagnostic Quiz — Item Bank DRAFT v1

> **Status:** **CANONICAL DRAFT — AI PRE-REVIEW DONE · PENDING DOMAIN-EXPERT SIGN-OFF.**
>
> **Provenance.** This canonical draft is the *premium alternative* version that was authored after an AI-mediated review pass on the original v0 draft. The AI review notes are preserved at `docs/QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md` for audit. The premium alternative addressed all process-level concerns raised by the AI reviewer (G1-G4) and improved each item with one of the design principles below.
>
> **Instrument id:** `ulpan_diagnostic_v1`
> **Item count:** 20
> **CEFR distribution:** A1 × 4 · A2 × 4 · B1 × 5 · B2 × 4 · C1 × 3
> **Scoring model:** Rasch 1PL (`theta ∈ [-3, +3] → score 0-100 → CEFR band`)
> **Calibration method:** `expert_judgement_v1` until empirical recalibration in v3.4+
> **Design intent:** short text-only diagnostic for adult ulpan learners; reading + grammar + vocabulary + register; no listening/speaking/writing in v1.
>
> **Important:** AI pre-review **does NOT replace** a native Hebrew/ulpan domain-expert sign-off. Before real-ulpan deployment, this bank must be reviewed by a qualified Hebrew teacher per `QUIZ_ITEM_BANK_REVIEW_BRIEF.md`. The phase plan §16 pre-implementation gate is partially satisfied (internal AI review pass complete) and ready for external dispatch.

---

## Premium-edit principles used in this alternative

1. **Less translation trivia, more communicative context.** Easy items still stay easy, but several prompts are placed inside realistic mini-contexts rather than asking only “what does this word mean?”.
2. **Cleaner Hebrew.** Hebrew prompts avoid mixed-language phrasing where possible and use natural Modern Hebrew.
3. **Locale parity.** RU/EN prompts explain the task without giving away more than the Hebrew prompt.
4. **Single correct answer.** Distractors are plausible but intentionally separated by tense, role, preposition, register, or meaning.
5. **Adult-ulpan neutrality.** No political, religious, medical, military, or culturally sensitive content.
6. **Rasch readiness.** Difficulty logits remain monotonic by CEFR band and are reviewer-adjustable by ±0.5.

---

## A1 — 4 items (target difficulty range −3.0 … −1.5 logits)

### Item Q01 — A1 · vocabulary · greeting in context
**Difficulty (logit, draft):** −2.6  
**Tags:** vocabulary, greetings, classroom

**He prompt:** בתחילת שיעור, מה מתאים לומר למורה?  
**RU prompt:** В начале урока что уместно сказать преподавателю?  
**EN prompt:** At the beginning of a lesson, what is appropriate to say to the teacher?

| ID | He | RU | EN |
|---|---|---|---|
| a | תודה | спасибо | thank you |
| **b** ← correct | **שלום** | **здравствуйте / привет** | **hello** |
| c | סליחה | извините | excuse me / sorry |
| d | לילה טוב | спокойной ночи | good night |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ A1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ −2.6
- Замечания:

---

### Item Q02 — A1 · grammar · personal pronoun
**Difficulty (logit, draft):** −2.3  
**Tags:** grammar, pronouns, sentence-completion

**He prompt:** השלם את המשפט: "_____ תלמיד."  
**RU prompt:** Заполни пропуск: «_____ תלמיד.» (= «Я студент», говорит мужчина)  
**EN prompt:** Fill the blank: "_____ תלמיד." (= "I am a student", male speaker)

| ID | He | RU | EN |
|---|---|---|---|
| **a** ← correct | **אני** | **я** | **I** |
| b | הוא | он | he |
| c | את | ты, жен. род | you, feminine |
| d | הם | они | they |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ A1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ −2.3
- Замечания:

---

### Item Q03 — A1 · grammar · definite article
**Difficulty (logit, draft):** −2.0  
**Tags:** grammar, definite-article, noun-phrase

**He prompt:** איך אומרים בעברית "the book"?  
**RU prompt:** Как сказать на иврите «the book» — определённая форма слова «книга»?  
**EN prompt:** How do you say "the book" in Hebrew?

| ID | He | RU | EN |
|---|---|---|---|
| a | ספר | книга / a book | book / a book |
| **b** ← correct | **הספר** | **эта / определённая книга** | **the book** |
| c | ספרים | книги | books |
| d | הספרים שלי | мои книги | my books |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ A1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ −2.0
- Замечания:

---

### Item Q04 — A1 · grammar · negation
**Difficulty (logit, draft):** −1.7  
**Tags:** grammar, negation, basic-sentence

**He prompt:** השלם את המשפט: "אני _____ מבין."  
**RU prompt:** Заполни пропуск: «אני _____ מבין.» (= «Я не понимаю»)  
**EN prompt:** Fill the blank: "אני _____ מבין." (= "I do not understand")

| ID | He | RU | EN |
|---|---|---|---|
| a | כן | да | yes |
| **b** ← correct | **לא** | **не / нет** | **not / no** |
| c | אולי | может быть | maybe |
| d | טוב | хорошо | good |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ A1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ −1.7
- Замечания:

---

## A2 — 4 items (target difficulty range −1.5 … −0.5 logits)

### Item Q05 — A2 · grammar · past tense verb conjugation
**Difficulty (logit, draft):** −1.4  
**Tags:** grammar, verbs, past-tense, first-person

**He prompt:** השלם את המשפט: "אתמול _____ לשוק."  
**RU prompt:** Заполни пропуск: «אתמול _____ לשוק.» (= «Вчера я пошёл на рынок»)  
**EN prompt:** Fill the blank: "אתמול _____ לשוק." (= "Yesterday I went to the market")

| ID | He | RU | EN |
|---|---|---|---|
| a | הולך | иду, наст. вр. | go / am going, present |
| b | אלך | пойду, буд. вр. | will go, future |
| **c** ← correct | **הלכתי** | **пошёл, прош. вр., 1 л. ед. ч.** | **went, past, 1st person singular** |
| d | ללכת | идти, инфинитив | to go, infinitive |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ A2
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ −1.4
- Замечания:

---

### Item Q06 — A2 · grammar · possessive construction
**Difficulty (logit, draft):** −1.1  
**Tags:** grammar, possession, noun-phrase

**He prompt:** מה פירוש הביטוי "הספר שלו"?  
**RU prompt:** Что означает выражение «הספר שלו»?  
**EN prompt:** What does the phrase "הספר שלו" mean?

| ID | He | RU | EN |
|---|---|---|---|
| a | הספר שלי | моя книга | my book |
| b | הספר שלך | твоя книга | your book |
| **c** ← correct | **הספר שלו** | **его книга** | **his book** |
| d | הספר שלה | её книга | her book |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ A2
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ −1.1
- Замечания:

---

### Item Q07 — A2 · vocabulary · time expression in context
**Difficulty (logit, draft):** −0.9  
**Tags:** vocabulary, time, comprehension

**He prompt:** המשפט "נפגשנו אתמול" אומר שנפגשנו:  
**RU prompt:** Предложение «נפגשנו אתמול» означает, что мы встретились:  
**EN prompt:** The sentence "נפגשנו אתמול" means that we met:

| ID | He | RU | EN |
|---|---|---|---|
| a | מחר | завтра | tomorrow |
| **b** ← correct | **אתמול** | **вчера** | **yesterday** |
| c | עכשיו | сейчас | now |
| d | בשבוע הבא | на следующей неделе | next week |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ A2
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ −0.9
- Замечания:

---

### Item Q08 — A2 · communicative vocabulary · café request
**Difficulty (logit, draft):** −0.7  
**Tags:** vocabulary, everyday, functional-language

**He prompt:** בבית קפה אתה אומר: "אפשר כוס מים, בבקשה?" מה ביקשת?  
**RU prompt:** В кафе вы говорите: «אפשר כוס מים, בבקשה?» Что вы попросили?  
**EN prompt:** In a café you say: "אפשר כוס מים, בבקשה?" What did you ask for?

| ID | He | RU | EN |
|---|---|---|---|
| a | לחם | хлеб | bread |
| b | חלב | молоко | milk |
| **c** ← correct | **מים** | **воду** | **water** |
| d | חשבון | счёт | the bill |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ A2
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ −0.7
- Замечания:

---

## B1 — 5 items (target difficulty range −0.4 … +0.6 logits)

### Item Q09 — B1 · grammar · smikhut definite construct
**Difficulty (logit, draft):** −0.4  
**Tags:** grammar, smikhut, definiteness

**He prompt:** איזו צורה מתאימה ל־"the students of the school"?  
**RU prompt:** Какая форма соответствует «ученики школы» в определённом смихуте?  
**EN prompt:** Which form means "the students of the school" in definite construct state?

| ID | He | RU | EN |
|---|---|---|---|
| a | התלמידים מהבית ספר | ученики из школы | students from the school |
| b | תלמידי בית ספר | ученики какой-то школы | students of a school |
| **c** ← correct | **תלמידי בית הספר** | **ученики этой / определённой школы** | **students of the school** |
| d | התלמידים בית הספר | неграмматично | ungrammatical |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ B1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ −0.4
- Замечания:

---

### Item Q10 — B1 · grammar · preposition with pronominal suffix
**Difficulty (logit, draft):** −0.1  
**Tags:** grammar, prepositions, pronouns, verb-government

**He prompt:** איך אומרים בעברית תקינה: "I am waiting for him"?  
**RU prompt:** Как правильно сказать на иврите: «Я жду его»?  
**EN prompt:** How do you correctly say in Hebrew: "I am waiting for him"?

| ID | He | RU | EN |
|---|---|---|---|
| a | אני מחכה אותו | неверно: нужен предлог ל־ | incorrect: needs ל־ |
| **b** ← correct | **אני מחכה לו** | **я жду его** | **I am waiting for him** |
| c | אני מחכה איתו | я жду вместе с ним | I am waiting with him |
| d | אני מחכה ממנו | я ожидаю чего-то от него | I expect something from him |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ B1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ −0.1
- Замечания:

---

### Item Q11 — B1 · grammar · binyan recognition
**Difficulty (logit, draft):** +0.2  
**Tags:** grammar, binyan, verb-pattern

**He prompt:** לאיזה בניין שייך הפועל "להזמין"?  
**RU prompt:** К какому биньяну относится глагол «להזמין» (= приглашать / заказывать)?  
**EN prompt:** Which binyan does the verb "להזמין" (= to invite / to order) belong to?

| ID | He | RU | EN |
|---|---|---|---|
| a | פעל | пааль | paal |
| b | פיעל | пиэль | piel |
| **c** ← correct | **הפעיל** | **hifil / הפעיל** | **hifil** |
| d | התפעל | hitpael / התפעל | hitpael |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ B1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ +0.2
- Замечания:

---

### Item Q12 — B1 · reading comprehension · cause
**Difficulty (logit, draft):** +0.4  
**Tags:** reading-comprehension, connectors, cause

**He prompt:** קרא: "דנה איחרה לשיעור כי האוטובוס לא הגיע בזמן." למה דנה איחרה?  
**RU prompt:** Прочитайте: «דנה איחרה לשיעור כי האוטובוס לא הגיע בזמן.» Почему Дана опоздала?  
**EN prompt:** Read: "דנה איחרה לשיעור כי האוטובוס לא הגיע בזמן." Why was Dana late?

| ID | He | RU | EN |
|---|---|---|---|
| a | כי היא שכחה את הספר | потому что она забыла книгу | because she forgot the book |
| **b** ← correct | **כי האוטובוס לא הגיע בזמן** | **потому что автобус не пришёл вовремя** | **because the bus did not arrive on time** |
| c | כי השיעור בוטל | потому что урок отменили | because the lesson was cancelled |
| d | כי היא לא רצתה ללמוד | потому что она не хотела учиться | because she did not want to study |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ B1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ +0.4
- Замечания:

---

### Item Q13 — B1 · grammar · hypothetical conditional
**Difficulty (logit, draft):** +0.6  
**Tags:** grammar, conditional, hypothetical

**He prompt:** איזו אפשרות מביעה תנאי היפותטי: "If I had time, I would study"?  
**RU prompt:** Какой вариант выражает гипотетическое условие: «Если бы у меня было время, я бы учился»?  
**EN prompt:** Which option expresses the hypothetical condition: "If I had time, I would study"?

| ID | He | RU | EN |
|---|---|---|---|
| a | אם יש לי זמן, אני לומד | если у меня есть время, я учусь | if I have time, I study |
| b | אם יהיה לי זמן, אלמד | если у меня будет время, я буду учиться | if I have time, I will study |
| **c** ← correct | **אם היה לי זמן, הייתי לומד** | **если бы у меня было время, я бы учился** | **if I had time, I would study** |
| d | כשיש לי זמן, אני לומד | когда у меня есть время, я учусь | when I have time, I study |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ B1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ +0.6
- Замечания:

---

## B2 — 4 items (target difficulty range +0.8 … +1.8 logits)

### Item Q14 — B2 · grammar · direct object marker
**Difficulty (logit, draft):** +0.9  
**Tags:** grammar, syntax, direct-object-marker

**He prompt:** בחר את המשפט התקין ביותר בעברית סטנדרטית:  
**RU prompt:** Выберите наиболее корректное предложение на стандартном иврите:  
**EN prompt:** Choose the most correct sentence in standard Hebrew:

| ID | He | RU | EN |
|---|---|---|---|
| a | ראיתי הסרט אתמול | пропущено את перед определённым объектом | missing את before a definite object |
| **b** ← correct | **ראיתי את הסרט אתמול** | **я видел фильм вчера** | **I saw the movie yesterday** |
| c | ראיתי לסרט אתמול | неверный предлог | wrong preposition |
| d | את ראיתי הסרט אתמול | неверный порядок слов для этого значения | wrong word order for this meaning |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ B2
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ +0.9
- Замечания:

---

### Item Q15 — B2 · register · formal equivalent
**Difficulty (logit, draft):** +1.2  
**Tags:** register, formality, productive-phrases

**He prompt:** איזו צורה היא חלופה רשמית יותר ל־"אני רוצה"?  
**RU prompt:** Какая форма является более официальной заменой «אני רוצה» (= я хочу)?  
**EN prompt:** Which form is a more formal alternative to "אני רוצה" (= I want)?

| ID | He | RU | EN |
|---|---|---|---|
| a | אני אוהב | я люблю | I love |
| **b** ← correct | **ברצוני** | **я хотел(а) бы / желаю, формально** | **I would like / it is my wish, formal** |
| c | אני יכול | я могу | I can |
| d | בא לי | мне хочется, разговорно | I feel like it, colloquial |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ B2
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ +1.2
- Замечания:

---

### Item Q16 — B2 · idiom · analytical meaning
**Difficulty (logit, draft):** +1.4  
**Tags:** idiom, figurative-language, academic-discourse

**He prompt:** מה פירוש הביטוי "לרדת לפרטים"?  
**RU prompt:** Что означает выражение «לרדת לפרטים»?  
**EN prompt:** What does the expression "לרדת לפרטים" mean?

| ID | He | RU | EN |
|---|---|---|---|
| a | לרדת במדרגות | спускаться по лестнице | to go down the stairs |
| **b** ← correct | **להיכנס לעומק העניין ולבדוק פרטים קטנים** | **вникать в детали, разбирать подробно** | **to go into detail; to examine details closely** |
| c | לרדת במשקל | худеть | to lose weight |
| d | להוריד מחיר | снизить цену | to lower a price |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ B2
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ +1.4
- Замечания:

---

### Item Q17 — B2 · grammar · smikhut + adjective definiteness
**Difficulty (logit, draft):** +1.7  
**Tags:** grammar, smikhut, definiteness, adjective-agreement

**He prompt:** איזו צורה היא התקינה ביותר ל־"the new study program"?  
**RU prompt:** Какая форма наиболее корректна для «новая учебная программа» в определённой форме?  
**EN prompt:** Which form is most correct for "the new study program"?

| ID | He | RU | EN |
|---|---|---|---|
| a | התוכנית לימודים החדשה | нарушена смихутная конструкция | broken construct phrase |
| b | תוכנית הלימודים חדש | прилагательное не согласовано | adjective disagreement |
| **c** ← correct | **תוכנית הלימודים החדשה** | **новая учебная программа** | **the new study program** |
| d | התוכנית של לימודים חדשה | неестественно / не стандартно для цели вопроса | unnatural / not standard for this target |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ B2
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ +1.7
- Замечания:

---

## C1 — 3 items (target difficulty range +2.0 … +2.7 logits)

### Item Q18 — C1 · register · formal connector
**Difficulty (logit, draft):** +2.1  
**Tags:** register, formal-language, discourse-marker

**He prompt:** איזו אפשרות היא חלופה רשמית יותר ל־"בגלל המצב"?  
**RU prompt:** Какой вариант является более официальной заменой «בגלל המצב» (= из-за ситуации)?  
**EN prompt:** Which option is a more formal alternative to "בגלל המצב" (= because of the situation)?

| ID | He | RU | EN |
|---|---|---|---|
| a | כזה, בגלל זה | типа, поэтому / разговорно | like, because of that / colloquial |
| b | כי בא לי | потому что мне так хочется | because I feel like it |
| **c** ← correct | **נוכח הנסיבות** | **ввиду обстоятельств** | **in view of the circumstances** |
| d | סתם ככה | просто так | just because / for no reason |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ C1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ +2.1
- Замечания:

---

### Item Q19 — C1 · metaphor · abstract vocabulary
**Difficulty (logit, draft):** +2.4  
**Tags:** vocabulary, metaphor, abstract-concepts

**He prompt:** במשפט "אמון הוא אבן יסוד בכל שיתוף פעולה", מה פירוש "אבן יסוד"?  
**RU prompt:** В предложении «אמון הוא אבן יסוד בכל שיתוף פעולה» что означает «אבן יסוד»?  
**EN prompt:** In the sentence "אמון הוא אבן יסוד בכל שיתוף פעולה", what does "אבן יסוד" mean?

| ID | He | RU | EN |
|---|---|---|---|
| a | אבן כבדה | тяжёлый камень | a heavy stone |
| **b** ← correct | **בסיס מרכזי וחשוב** | **основа, краеугольный элемент** | **a central foundation / cornerstone** |
| c | אבן יקרה | драгоценный камень | a precious stone |
| d | מקום בנייה | строительная площадка | a construction site |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ C1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ +2.4
- Замечания:

---

### Item Q20 — C1 · idiom · pragmatic interpretation
**Difficulty (logit, draft):** +2.7  
**Tags:** idiom, pragmatics, advanced-expression

**He prompt:** במשפט "אמרת שתעזור לי מחר, ואני תופס אותך במילה", מה המשמעות?  
**RU prompt:** В предложении «Ты сказал, что завтра поможешь, и я ловлю тебя на слове» что означает выражение?  
**EN prompt:** In the sentence "You said you would help me tomorrow, and I am holding you to your word", what does the expression mean?

| ID | He | RU | EN |
|---|---|---|---|
| a | אני מלמד אותך מילה חדשה | я учу тебя новому слову | I am teaching you a new word |
| b | אני שוכח מה שאמרת | я забываю, что ты сказал | I forget what you said |
| c | אני כועס על המילה שבחרת | я злюсь на выбранное тобой слово | I am angry about the word you chose |
| **d** ← correct | **אני מזכיר לך התחייבות ומצפה שתעמוד בה** | **я напоминаю об обещании и ожидаю, что ты его выполнишь** | **I remind you of a commitment and expect you to keep it** |

### Reviewer notes
- Грамматика: ☐
- Уровень: ☐ C1
- Однозначность: ☐
- Locale parity RU/EN/HE: ☐
- Cultural neutrality: ☐
- Difficulty logit approved / adjusted: ☐ +2.7
- Замечания:

---

## Distribution check

| CEFR | Target | Drafted | Item IDs |
|---|---:|---:|---|
| A1 | 4 | 4 | Q01, Q02, Q03, Q04 |
| A2 | 4 | 4 | Q05, Q06, Q07, Q08 |
| B1 | 5 | 5 | Q09, Q10, Q11, Q12, Q13 |
| B2 | 4 | 4 | Q14, Q15, Q16, Q17 |
| C1 | 3 | 3 | Q18, Q19, Q20 |
| **Total** | **20** | **20** |  |

## Difficulty range check

| CEFR | Target logit range | Drafted range | Mean | Status |
|---|---:|---:|---:|---|
| A1 | −3.0 … −1.5 | −2.6 … −1.7 | −2.15 | monotonic |
| A2 | −1.5 … −0.5 | −1.4 … −0.7 | −1.03 | monotonic |
| B1 | −0.4 … +0.6 | −0.4 … +0.6 | +0.14 | monotonic |
| B2 | +0.8 … +1.8 | +0.9 … +1.7 | +1.30 | monotonic |
| C1 | +2.0 … +2.7 | +2.1 … +2.7 | +2.40 | monotonic |

## Coverage balance

| Skill area | Items | Notes |
|---|---|---|
| Basic vocabulary / functional language | Q01, Q07, Q08 | Greeting, time, café request |
| Core grammar | Q02, Q03, Q04, Q05, Q06 | Pronoun, article, negation, past tense, possession |
| Intermediate grammar | Q09, Q10, Q11, Q13 | Smikhut, governed preposition, binyan, hypothetical conditional |
| Reading comprehension | Q12 | Cause connector כי in a short sentence |
| Advanced syntax/register/idiom | Q14-Q20 | את, formal register, idioms, smikhut definiteness, metaphor |

## Validity notes — premium alternative

- This bank targets **standard Modern Hebrew** used in adult ulpan contexts.
- It does **not** assess listening, spontaneous speaking, handwriting, spelling production, or free writing.
- Q11 tests meta-linguistic binyan knowledge; reviewer should confirm this is acceptable for the target ulpan population.
- Q17 tests formal knowledge of smikhut/adjective definiteness; reviewer should confirm that it does not exceed B2 for the intended cohort.
- Q18-Q20 intentionally test advanced register and idiomatic interpretation; reviewer may lower or replace any item that feels more academic than ulpan C1.
- Difficulty logits are **expert-judgement placeholders**. Empirical recalibration is deferred until enough real quiz responses exist.
- The Russian and English prompts must remain explanatory enough for adult learners but must not leak the correct answer more than the Hebrew prompt.

## Calibration audit log

| Stage | Date | Signed by | Notes |
|---|---|---|---|
| Original draft v0 authored | 2026-05-14 | Claude Opus 4.7 | First-pass 20 items with translation-trivia heavy style. |
| AI review pass | 2026-05-15 | AI reviewer-assistant | Annotated feedback on v0 — RTL verification flag (G1), distractor-quality checkbox (G2), local-only policy reaffirmed (G3), item replacement policy (G4). Item-level: Q04/Q08/Q13/Q14/Q19 flagged for level/wording re-examination. See `docs/QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md`. |
| Premium alternative drafted | 2026-05-15 | AI reviewer-assistant | Rewrite addressing G1-G4 + 5 flagged items. Same 20-item contract. Communicative context replacing translation-trivia where helpful (Q01, Q07, Q08, Q12, Q19, Q20); cleaner Modern Hebrew; better distractor separation (Q15 בא לי, Q18 נוכח הנסיבות); extra reviewer checkboxes per item (locale parity, cultural neutrality, difficulty logit). |
| Premium alternative adopted as canonical | 2026-05-15 | Author | Replaced original v0 in this file. v0 retired (no longer in repo); annotated review notes preserved at `QUIZ_ITEM_BANK_AI_REVIEW_NOTES.md` for audit trail. |
| External dispatch | pending | Author | `QUIZ_ITEM_BANK_REVIEW_BRIEF.md` to be sent to ulpan teacher. AI pre-review pass disclosed in the brief so reviewer focuses on domain validation rather than re-doing the audit. |
| Domain-expert sign-off | pending | Ulpan teacher | Must confirm grammar, CEFR level, ambiguity, locale parity, cultural neutrality, difficulty logits. Reviewer may rebut AI-pre-review decisions item-by-item. |
| Author merge of reviewer edits | pending | Author | Final version locked before deployment. |
| C1 JSON build | 2026-05-15 | Author | `public/quiz/ulpan_diagnostic_v1.json` emitted from this canonical draft, plus validator + bank-validate smoke. Phase plan §16 gate "items signed off by domain expert" still pending external sign-off; the JSON ships now so C2-C12 implementation can proceed against a stable bank schema, with the understanding that real-ulpan deployment is blocked on the domain-expert sign-off. |

## Reviewer final sign-off phrase

> Items Q01-Q20 reviewed. Modifications applied where needed. All items have one unambiguous correct answer. CEFR distribution 4/4/5/4/3 verified. Difficulty ranges monotonic. Bank approved for production v1 based on expert judgement; empirical IRT recalibration deferred to v3.4+.

