# Research Ethics & Informed Consent Template — v1.0

> **Назначение:** IRB-style informed consent template для opt-in research mode в LinguistPro. Используется при участии students в diploma research project (Direction 11) и любых будущих образовательных исследованиях через приложение.
>
> **Языки:** RU (primary, complete), EN (translated, complete), HE (template prepared, **requires native-speaker review before deployment**).
>
> **Versioning:** этот документ versioned — при изменениях участники получают re-consent prompt в приложении.

---

## RU — Информированное согласие на участие в исследовании (primary)

### Что это за исследование

Вы приглашены принять участие в исследовательском проекте, направленном на изучение эффективности цифровых инструментов изучения иврита. Исследование проводится в рамках дипломной работы и направлено на установление корреляции между объёмом цифровой учебной активности и результатами обучения в ulpan-курсе.

**Исследовательская тема:** «Анализ корреляции цифровой учебной активности и результатов в иврит-ульпане: проектирование privacy-preserving opt-in research-mode в language-learning приложении».

### Кто проводит исследование

- **Главный исследователь:** [имя автора диплома, контакт]
- **Платформа:** LinguistPro (open-source, github.com/SindromRadioSpb/tts-prototype-android)
- **Учебная группа:** [ulpan group identifier, e.g. «Ulpan A — весна 2026»]

### Что от вас требуется

1. **Использовать приложение LinguistPro** в течение курса как один из инструментов изучения иврита.
2. **Дать согласие на сбор анонимизированных метрик** вашей учебной активности (см. ниже что именно собирается).
3. **Опционально:** поделиться вашим итоговым баллом экзамена в конце курса (для корреляционного анализа).
4. **Опционально:** поделиться вашим anonymous student ID с преподавателем — это позволит соотнести метрики с вашим экзаменационным результатом для individual-level анализа.

### Что мы собираем (только агрегированные показатели, не сырые данные)

**Раз в день** ваше устройство загружает на исследовательский сервер следующие **агрегированные** метрики за прошедшие сутки:

✓ Количество сессий
✓ Активные минуты (на основе heartbeat-tracking, исключая idle-периоды)
✓ Количество открытых текстов
✓ Количество прочитанных предложений
✓ Длительность прослушанного аудио (миллисекунды)
✓ Количество встреченных слов
✓ Количество SRS-карточек просмотренных / правильно отвеченных
✓ Количество созданных / отредактированных заметок
✓ Количество поисковых запросов (только число!)
✓ Histograms активности по часам дня
✓ Frequency повторного воспроизведения аудио строк

### Что мы НЕ собираем (никогда, ни при каких условиях)

✗ **Содержимое ваших текстов** на иврите, русском или любом другом языке
✗ **Содержимое ваших заметок** (только их количество)
✗ **Тексты ваших поисковых запросов** (только сколько раз вы искали)
✗ **Аудиозаписи** или файлы
✗ **Названия конкретных текстов** в вашей библиотеке
✗ **Ваше имя, email, телефон**
✗ **Ваш IP-адрес или местоположение**
✗ **Уникальные идентификаторы устройства** (фингерпринт)
✗ **Точное время суток ваших действий** (только distribution по часам)

### Как обеспечивается ваша анонимность

1. **Anonymous student ID.** Ваше участие идентифицируется случайно сгенерированным UUID (например, `abc-1234-def-...`). Этот UUID **не привязан** к вашему имени, email, или любым другим personal data.
2. **Cohort code.** Вы присоединяетесь к учебной группе по пригласительному коду от преподавателя. Cohort code — групповой идентификатор, не персональный.
3. **k-anonymity.** Если в вашей группе менее 5 участников, индивидуальные показатели **скрыты** от исследователя — доступны только групповые средние.
4. **Two-key design.** Преподаватель знает ваше имя и оценку. Исследователь знает ваш anonymous UUID и метрики. Связать их можно **только если вы сами** предоставите ваш UUID преподавателю — это **отдельное opt-in решение**.

### Ваши права

1. **Право на отзыв согласия.** Вы можете в любой момент:
   - Отключить research mode в настройках приложения (одна кнопка).
   - Запросить удаление всех ваших ранее загруженных данных с сервера (одна кнопка → автоматический server-side delete + audit log записи).
   - Перестать пользоваться приложением (никаких последствий).
2. **Право на прозрачность.** В приложении есть раздел «Что мы собрали о вас» — вы видите exactly те данные, которые были загружены за последние 30 дней.
3. **Право на копию ваших данных.** Вы можете запросить экспорт всех ваших агрегатов в CSV формате.
4. **Право на отказ от участия с самого начала.** Согласие — opt-in. Если вы НЕ соглашаетесь, приложение работает идентично, но никаких метрик никуда не отправляется.

### Хранение данных

- **На сервере хранятся:** ваши daily aggregates за весь период курса.
- **Срок хранения:** 2 года после завершения курса. После — автоматическое удаление.
- **Где хранятся:** [Railway production server, расположение и compliance]
- **Кто имеет доступ:** только главный исследователь (через researcher token); никаких сторонних организаций или коммерческих партнёров.
- **Использование:** исключительно в академических целях (диплом + возможные публикации); никакой коммерциализации, никакой передачи третьим лицам, никакой рекламы.

### Возможные риски

Риски минимальны — данные анонимны, их утечка не позволит идентифицировать вас или ваше поведение. Тем не менее:

- **Теоретический риск:** если кто-то получит доступ к серверу + знает, что вы участвовали в группе X, и cohort < k, possible re-identification. **Mitigation:** k-anonymity threshold 5 + retention limit 2 года.
- **Self-reported exam scores:** если вы делитесь баллом, это subjective accuracy.

### Возможные выгоды

- **Прямая выгода вам:** premium-уровень доступа к LinguistPro во время курса (audio-anchored notes, smart-collections, SRS micro-cards и т.п.).
- **Косвенная выгода:** ваши данные помогают улучшить инструменты изучения иврита для будущих учеников.
- **Научная выгода:** результаты публикуются в открытом доступе (после анонимизации); вклад в educational analytics literature.

### Контакт

Если у вас есть вопросы:
- **По исследованию:** [email главного исследователя]
- **По работе приложения:** через в-app feedback (📬 в меню)
- **Сообщить нарушение privacy:** [security contact]

### Согласие

Я подтверждаю, что:
- [ ] Прочитал(а) и понял(а) информацию выше.
- [ ] Понимаю, что моё участие добровольно.
- [ ] Понимаю, что я могу отозвать согласие в любой момент без последствий.
- [ ] Понимаю, что собираются только агрегированные метрики, без raw text или PII.
- [ ] Согласен(на) на участие в исследовании.

**Имя/псевдоним (опционально):** ____________________
**Дата:** ____________________
**Подпись:** ____________________

(В приложении подпись = клик «Я согласен(на)» с записью consent_version и timestamp.)

---

## EN — Informed Consent for Research Participation (translated)

### What is this study

You are invited to participate in a research project investigating the effectiveness of digital tools for learning Hebrew. The research is conducted as part of a diploma thesis and aims to establish the correlation between digital learning activity and learning outcomes in an ulpan course.

**Research title:** "Correlation analysis of digital learning activity and outcomes in Hebrew ulpan: design of privacy-preserving opt-in research-mode in a language-learning application."

### Who conducts the research

- **Principal investigator:** [diploma author name, contact]
- **Platform:** LinguistPro (open-source, github.com/SindromRadioSpb/tts-prototype-android)
- **Cohort:** [ulpan group identifier]

### What is asked of you

1. Use LinguistPro during your ulpan course as one of your Hebrew learning tools.
2. Consent to anonymous metric collection of your learning activity (see below for details).
3. Optionally: share your final exam score at course end (for correlation analysis).
4. Optionally: share your anonymous student ID with your teacher to enable individual-level correlation analysis.

### What we collect (aggregated metrics only — never raw data)

**Once daily**, your device uploads the following **aggregated** metrics for the previous day:

✓ Session count
✓ Active minutes (heartbeat-tracked, excluding idle)
✓ Texts opened
✓ Sentences read
✓ Audio playback duration (milliseconds)
✓ Words encountered
✓ SRS cards reviewed / answered correctly
✓ Notes created / edited
✓ Search queries (count only!)
✓ Time-of-day activity histogram
✓ Audio replay frequency per row

### What we NEVER collect (under any circumstances)

✗ **Content** of your Hebrew, Russian, or other-language texts
✗ **Content** of your notes (only counts)
✗ **Search query strings** (only counts)
✗ Audio files
✗ Specific text titles
✗ Your name, email, phone
✗ Your IP address or location
✗ Device fingerprint
✗ Specific timestamps (only hour-of-day distribution)

### How your anonymity is preserved

1. **Anonymous student ID.** Your participation is identified by a randomly-generated UUID (e.g. `abc-1234-...`). This UUID is **not linked** to your name, email, or any personal data.
2. **Cohort code.** You join via teacher-provided invitation code. The cohort code is a group identifier, not personal.
3. **k-anonymity.** If your cohort has fewer than 5 participants, individual metrics are **hidden** from the researcher — only group averages are visible.
4. **Two-key design.** The teacher knows your name and grade. The researcher knows your anonymous UUID and metrics. Linking is possible **only if you choose** to share your UUID with the teacher — this is a **separate opt-in decision**.

### Your rights

1. **Right to withdraw.** You can at any time:
   - Disable research mode in settings (one click).
   - Request deletion of all your previously uploaded data (one click → automatic server-side deletion).
   - Stop using the app (no consequences).
2. **Right to transparency.** The app has a "What we collected from you" view showing exactly what was uploaded in the last 30 days.
3. **Right to a copy.** You can export all your aggregates as CSV.
4. **Right to refuse from the start.** Consent is opt-in. If you decline, the app works identically but no metrics leave your device.

### Data retention

- **Stored:** your daily aggregates for the duration of the course.
- **Retention:** 2 years after course end. Automatic deletion after.
- **Location:** [Railway production server location and compliance]
- **Access:** only the principal investigator (via researcher token); no third parties, no commercial partners.
- **Use:** exclusively academic (diploma + potential publications); no commercialization, no third-party sharing, no advertising.

### Risks

Risks are minimal — data is anonymous; a leak would not enable identification. Nonetheless:

- **Theoretical risk:** if server access + knowledge of cohort participation + cohort < k, possible re-identification. **Mitigation:** k-anonymity threshold 5 + 2-year retention.
- **Self-reported exam scores:** subjective accuracy.

### Benefits

- **Direct benefit:** premium-level LinguistPro access during the course.
- **Indirect benefit:** your data helps improve Hebrew-learning tools for future learners.
- **Scientific benefit:** results published openly (anonymized); contribution to educational analytics literature.

### Contact

If you have questions:
- **Research:** [PI email]
- **App functionality:** via in-app feedback (📬 in menu)
- **Privacy violation report:** [security contact]

### Consent

I confirm that:
- [ ] I have read and understood the above.
- [ ] I understand my participation is voluntary.
- [ ] I understand I can withdraw consent at any time without consequence.
- [ ] I understand that only aggregated metrics are collected, no raw text or PII.
- [ ] I agree to participate in the research.

**Name/pseudonym (optional):** ____________________
**Date:** ____________________
**Signature:** ____________________

---

## HE — Hebrew Consent Template

> **⚠ ВАЖНО:** Hebrew translation below is a **draft skeleton** — preserves structure and key terms but **MUST be reviewed by a native Hebrew speaker** with legal/academic translation expertise before deployment to ulpan participants. Hebrew translation accuracy for legal/ethics documents is paramount; mistranslation could invalidate consent.
>
> **Recommended path:** commission native review through Mode C curated request (recursive use of LinguistPro's own text-card request channel) OR partner with the ulpan teacher who has native fluency.

### הסכמה מדעת להשתתפות במחקר

[Skeleton — sections matching RU/EN structure to be filled by native reviewer]

**מהי מטרת המחקר:** [...]

**מה אנו אוספים:**
- מספר ההפעלות
- דקות פעילות
- מספר טקסטים שנפתחו
- מספר משפטים שנקראו
- משך השמע (במילישניות)
- מספר מילים שנפגשו
- מספר כרטיסי SRS שנסקרו / נענו נכונה
- מספר הערות שנוצרו / נערכו
- מספר שאילתות חיפוש (מספר בלבד!)
- היסטוגרמת פעילות לפי שעה
- תדירות חזרת השמעה לכל שורה

**מה אנו לעולם לא אוספים:**
- תוכן הטקסטים שלך
- תוכן ההערות שלך
- מחרוזות החיפוש שלך
- קבצי שמע
- שמות טקסטים ספציפיים
- שם, אימייל, טלפון
- כתובת IP, מיקום
- טביעת אצבע של מכשיר
- חותמות זמן מדויקות

**הזכויות שלך:**
- זכות לבטל הסכמה בכל עת (לחיצה אחת)
- זכות לבקש מחיקה של כל הנתונים שהועלו (לחיצה אחת)
- זכות לראות בדיוק מה נאסף ("מה אספנו עליך")
- זכות לקבל עותק (CSV export)
- זכות לסרב מההתחלה ללא השלכות

**שמירת נתונים:** [...]

**סיכונים:** [...]

**יתרונות:** [...]

**מגעים:** [...]

**הסכמה:**
- [ ] קראתי והבנתי את האמור לעיל.
- [ ] אני מבין/ה שההשתתפות שלי וולונטרית.
- [ ] אני מבין/ה שאוכל לבטל את ההסכמה בכל עת.
- [ ] אני מבין/ה שנאספים רק נתונים אגרגטיביים, ללא טקסט גולמי או מידע אישי.
- [ ] אני מסכים/ה להשתתף במחקר.

**שם/כינוי (אופציונלי):** ____________________
**תאריך:** ____________________
**חתימה:** ____________________

---

## Versioning

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-10 | Initial template (RU complete; EN translated; HE skeleton — requires native review). |

When this document changes materially (additions to "what we collect", expansion of access scope, retention extension), participants will receive a **re-consent prompt** in the application before their next data upload.

---

**Last updated:** 2026-05-10 (initial commit)
