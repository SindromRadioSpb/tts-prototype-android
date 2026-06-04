# Инвентаризация Pealim-ссылок в ②-заметках бандла

> Сгенерировано `scripts/premium/pealim-link-inventory.js` (`npm run audit:pealim-inventory`).
> Бандл: `test-enriched.zip`, заметок: **8967**. Дата: 2026-06-04.

## Итог

| статус | кол-во |
|---|---|
| ✅ DIRECT_STORED (прямая ссылка по form-disambig pealim_id) | 8045 |
| ✅ DIRECT_FUNCLINK (прямая ссылка служебного слова) | 37 |
| ⚠ MISSING_SEARCH (прямой ссылки нет → поиск Pealim) | 885 |

**Прямых ссылок: 90.1%.** Остальное — честный поиск (по причинам ниже).

### Причины отсутствия прямой ссылки

| причина | кол-во | смысл |
|---|---|---|
| `in-pealim-no-target` | 415 | слово есть, но нет form-совпавшей парадигмы (омограф/редкая форма) |
| `not-in-pealim` | 268 | слова нет в Pealim (loanword/имя/сленг) — внешний предел |
| `function-no-invariant` | 202 | служебное слово без invariant-записи в Pealim |

### MISSING по части речи

| POS | кол-во |
|---|---|
| pronoun | 257 |
| noun | 183 |
| adverb | 130 |
| propernoun | 87 |
| adjective | 84 |
| numeral | 60 |
| negation | 34 |
| (empty) | 24 |
| verb | 15 |
| conjunction | 10 |
| preposition | 1 |

## Полный перечень слов без прямой ссылки (448 уникальных)

| слово | POS | огласовка | перевод | причина | вхождений |
|---|---|---|---|---|---|
| אני | pronoun | אֲנִי | я | in-pealim-no-target | 62 |
| את | pronoun | אַתְּ | я | in-pealim-no-target | 26 |
| ואת | pronoun | וְאַתְּ | я | function-no-invariant | 21 |
| אין | negation | אֵין | ликвидировать, уничтожить | in-pealim-no-target | 19 |
| לבד | adverb | לְבַד | в одиночку | in-pealim-no-target | 18 |
| שאת | pronoun | שֶׁאַתְּ | я | function-no-invariant | 17 |
| ואני | pronoun | וַאֲנִי | я | function-no-invariant | 16 |
| עוד | adverb | עוֹד | свидетельствовать | in-pealim-no-target | 16 |
| שאני | pronoun | שֶׁאֲנִי | я | function-no-invariant | 16 |
| אתה | pronoun | אַתָּה | я | in-pealim-no-target | 15 |
| הוא | pronoun | הוּא | он | in-pealim-no-target | 15 |
| הם | pronoun | הֵם | он | in-pealim-no-target | 10 |
| כשאת | pronoun | כְּשֶׁאַתְּ | я | function-no-invariant | 9 |
| פשוט | adverb | פָּשׁוּט | простой; вытянутый, распрямлен | in-pealim-no-target | 9 |
| ואין | negation | וְאֵין | ликвидировать, уничтожить | function-no-invariant | 8 |
| באמת | adverb | בֶּאֱמֶת | подтверждать, удостоверять | function-no-invariant | 8 |
| אחת | numeral | אַחַת | объединять | function-no-invariant | 8 |
| מדי | adverb | מִדַּי |  | in-pealim-no-target | 7 |
| כל | adverb | כָּל |  | in-pealim-no-target | 7 |
| היא | pronoun | הִיא | он | in-pealim-no-target | 7 |
| דפוק | adjective | דָּפוּק |  | not-in-pealim | 6 |
| בדיוק | adverb | בְּדִיּוּק |  | function-no-invariant | 5 |
| שונא | noun | שׂוֹנֵא | ненавидеть | in-pealim-no-target | 5 |
| מת | adjective | מֵת | умереть | in-pealim-no-target | 5 |
| אף | conjunction | אַף | нос | in-pealim-no-target | 5 |
| מוזר | verb | מוּזָר | уйти (лит., редко) | in-pealim-no-target | 5 |
| כשאני | pronoun | כְּשֶׁאֲנִי | я | function-no-invariant | 5 |
| חצי | numeral | חֲצִי | половина | in-pealim-no-target | 5 |
| כואב | adjective | כּוֹאֵב | болеть (о части тела) | in-pealim-no-target | 5 |
| וואלה | propernoun | וָואלָה |  | not-in-pealim | 5 |
| והיא | pronoun | וְהִיא | он | function-no-invariant | 5 |
| אנחנו | pronoun | אֲנַחְנוּ | я | in-pealim-no-target | 5 |
| ת'לב | numeral | ת'לב |  | function-no-invariant | 4 |
| אנל'א | propernoun | אָנָלֶ'א |  | not-in-pealim | 4 |
| שאתה | pronoun | שֶׁאַתָּה | я | function-no-invariant | 4 |
| הביתה | adverb | הַבַּיְתָה | дом | function-no-invariant | 4 |
| שאין | negation | שֶׁאֵין | ликвидировать, уничтожить | function-no-invariant | 4 |
| מטומטם | adjective | מְטֻמְטָם | отуплять, путать | in-pealim-no-target | 4 |
| אנ'לא | noun | אַנְ'לֹא |  | not-in-pealim | 4 |
| עצמי | pronoun | עַצְמִי | закрыть (глаза) | in-pealim-no-target | 4 |
| מספיק | adverb | מַסְפִּיק |  | in-pealim-no-target | 3 |
| תל | propernoun | תֵּל |  | not-in-pealim | 3 |
| כשאין | negation | כְּשֶׁאֵין | ликвидировать, уничтожить | function-no-invariant | 3 |
| בלי | conjunction | בְּלִי | без | in-pealim-no-target | 3 |
| אוקיי |  | אוֹקֵי |  | not-in-pealim | 3 |
| מיליון | numeral | מִילְיוֹן | миллион | in-pealim-no-target | 3 |
| והוא | pronoun | וְהוּא | он | function-no-invariant | 3 |
| הלילה | adverb | הַלַּיְלָה | ночь | function-no-invariant | 3 |
| שנינו | numeral | שְׁנֵינוּ |  | in-pealim-no-target | 3 |
| הופ |  | הוֹפּ |  | not-in-pealim | 3 |
| נשארת | adjective | נִשְׁאֶרֶת | оставаться | in-pealim-no-target | 3 |
| נורמלי | adjective | נוֹרְמָלִי |  | not-in-pealim | 3 |
| נורא | adverb | נוֹרָא | ужасный, ужасающий; очень, ужа | in-pealim-no-target | 3 |
| שישי | numeral | שִׁשִּׁי | шестой | in-pealim-no-target | 3 |
| ובאמת | adverb | וּבֶאֱמֶת | подтверждать, удостоверять | function-no-invariant | 3 |
| נופלות | noun | נוֹפְלוֹת | падать | in-pealim-no-target | 2 |
| בט | propernoun | בְּט |  | not-in-pealim | 2 |
| בסטורי | adjective | בִּסְטוּרֵי |  | not-in-pealim | 2 |
| ראשונה | numeral | רִאשׁוֹנָה | первый | in-pealim-no-target | 2 |
| מפוזר | adjective | מְפֻזָּר | разбрасывать, рассеивать, расп | in-pealim-no-target | 2 |
| מוזיקלית | adjective | מוּזִיקָלִית |  | not-in-pealim | 2 |
| יעל | propernoun | יָעֵל | повышать эффективность чего-ли | in-pealim-no-target | 2 |
| זוהר | noun | זֹהַר | предостережение | in-pealim-no-target | 2 |
| קסטיאל | propernoun | קַסְטִיאֵל |  | not-in-pealim | 2 |
| מאסטרינג | noun | מָסְטֵרִינְג |  | not-in-pealim | 2 |
| אלבום | noun | אַלְבּוֹם |  | not-in-pealim | 2 |
| איציק | propernoun | אִיצִיק |  | not-in-pealim | 2 |
| פליבה | propernoun | פליבה |  | not-in-pealim | 2 |
| ת'זמן | noun | תַּ'זְּמַן |  | not-in-pealim | 2 |
| חזרה | adverb | חֲזָרָה | возвращение, отступление; репе | in-pealim-no-target | 2 |
| ה' | numeral | ה' |  | function-no-invariant | 2 |
| וחצי | numeral | וַחֲצִי | половина | function-no-invariant | 2 |
| סיבוב | noun | סִבּוּב |  | not-in-pealim | 2 |
| לאלף | numeral | לְאֶלֶף | дрессировать | in-pealim-no-target | 2 |
| שתי | numeral | שְׁתֵּי |  | in-pealim-no-target | 2 |
| שהם | pronoun | שֶׁהֵם | он | function-no-invariant | 2 |
| הבוקר | adverb | הַבֹּקֶר | посещать (ב־); критиковать (את | function-no-invariant | 2 |
| אה |  | אָה |  | not-in-pealim | 2 |
| מוקדם | adverb | מֻקְדָּם | коэффициент | in-pealim-no-target | 2 |
| לשניים | numeral | לִשְׁנַיִם |  | function-no-invariant | 2 |
| ת'ראש | noun | תָּ'רֹאשׁ |  | not-in-pealim | 2 |
| שווה | adjective | שָׁוָה | сравнивать; уравнивать | in-pealim-no-target | 2 |
| הראשונה | numeral | הָרִאשׁוֹנָה | первый | function-no-invariant | 2 |
| חזק | adverb | חָזָק | укреплять, усиливать | in-pealim-no-target | 2 |
| מסובך | adjective | מְסֻבָּךְ | спутывать; осложнять | in-pealim-no-target | 2 |
| בול | adverb | בּוּל | марка (почтовая) | in-pealim-no-target | 2 |
| כשרע | verb | כְּשֶׁרַע | вредить, причинять зло кому-ли | in-pealim-no-target | 2 |
| לנצח | adverb | לָנֶצַח | побеждать; дирижировать, управ | in-pealim-no-target | 2 |
| מחדש | adverb | מֵחָדָשׁ | обновлять, вводить новое | in-pealim-no-target | 2 |
| חוץ | adverb | חוּץ | внешний | in-pealim-no-target | 2 |
| ת'יד | numeral | ת'יד |  | function-no-invariant | 2 |
| הלבד | adverb | הַלְּבַד | в одиночку | function-no-invariant | 2 |
| כשהוא | pronoun | כְּשֶׁהוּא | он | function-no-invariant | 2 |
| אינשאללה | propernoun | אִינְשַׁאלְלָה |  | not-in-pealim | 2 |
| ת'נשמה | noun | תַּ'נְשֵׁמָה |  | not-in-pealim | 2 |
| במוד | noun | בַּמּוֹד |  | not-in-pealim | 1 |
| פנתר | noun | פַּנְתֵּר |  | not-in-pealim | 1 |
| גרים | noun | גֵּרִים | жить (где-либо), проживать | in-pealim-no-target | 1 |
| לומדים | noun | לוֹמְדִים | изучать, учить (что-либо) | in-pealim-no-target | 1 |
| כותב | noun | כּוֹתֵב | писать | in-pealim-no-target | 1 |
| עובד | noun | עוֹבֵד | работать, трудиться; функциони | in-pealim-no-target | 1 |
| עובדים | noun | עוֹבְדִים | работать, трудиться; функциони | in-pealim-no-target | 1 |
| מבינות | adjective | מְבִינוֹת |  | in-pealim-no-target | 1 |
| מוכר | noun | מוֹכֵר | продавать | in-pealim-no-target | 1 |
| מוכרת | noun | מוֹכֶרֶת | продавать | in-pealim-no-target | 1 |
| מוכרים | noun | מוֹכְרִים | продавать | in-pealim-no-target | 1 |
| מוכרות | noun | מוֹכְרוֹת | продавать | in-pealim-no-target | 1 |
| נחות | adjective | נָחוּת | отдыхать, покоиться | in-pealim-no-target | 1 |
| רוכבים | noun | רוֹכְבִים | ехать верхом, на велосипеде, м | in-pealim-no-target | 1 |
| רוכבות | noun | רוֹכְבוֹת | ехать верхом, на велосипеде, м | in-pealim-no-target | 1 |
| עוזרים | noun | עוֹזְרִים | помогать, содействовать | in-pealim-no-target | 1 |
| מדליקות | adjective | מַדְלִיקוֹת | зажигать; включать | in-pealim-no-target | 1 |
| מכבים | propernoun | מַכַּבִּים | потушить, погасить; выключить | in-pealim-no-target | 1 |
| שונאים | noun | שׂוֹנְאִים | ненавидеть | in-pealim-no-target | 1 |
| יוצר | noun | יוֹצֵר |  | in-pealim-no-target | 1 |
| יוצרים | noun | יוֹצְרִים |  | in-pealim-no-target | 1 |
| יוצרות | noun | יוֹצְרוֹת | творить, создавать | in-pealim-no-target | 1 |
| מנצחת | noun | מְנַצַּחַת |  | in-pealim-no-target | 1 |
| נשארים | adjective | נִשְׁאָרִים | оставаться | in-pealim-no-target | 1 |
| מספיקות | adjective | מַסְפִּיקוֹת | хватать, быть достаточным; усп | in-pealim-no-target | 1 |
| מודד | noun | מוֹדֵד | измерять; мерить, примерять (о | in-pealim-no-target | 1 |
| שומרת | noun | שׁוֹמֶרֶת | беречь, сторожить; соблюдать,  | in-pealim-no-target | 1 |
| מחליף | noun | מַחְלִיף | обменивать, менять | in-pealim-no-target | 1 |
| מחליפה | noun | מַחְלִיפָה | обменивать, менять | in-pealim-no-target | 1 |
| משתתפים | noun | מִשְׁתַּתְּפִים | участвовать | in-pealim-no-target | 1 |
| משתתפות | noun | מִשְׁתַּתְּפוֹת | участвовать | in-pealim-no-target | 1 |
| משכיר | noun | מַשְׂכִּיר | сдавать внаем | in-pealim-no-target | 1 |
| משכירים | noun | מַשְׂכִּירִים | сдавать внаем | in-pealim-no-target | 1 |
| מטפל | noun | מְטַפֵּל | заботиться, ухаживать (ב-) | in-pealim-no-target | 1 |
| מטפלת | noun | מְטַפֶּלֶת | заботиться, ухаживать (ב-) | in-pealim-no-target | 1 |
| מטפלים | noun | מְטַפְּלִים | заботиться, ухаживать (ב-) | in-pealim-no-target | 1 |
| מטפלות | noun | מְטַפְּלוֹת | заботиться, ухаживать (ב-) | in-pealim-no-target | 1 |
| דואט | noun | דּוּאֵט |  | not-in-pealim | 1 |
| בזארה | propernoun | בְּזָארָה |  | not-in-pealim | 1 |
| שאנחנו | pronoun | שֶׁאֲנַחְנוּ | я | function-no-invariant | 1 |
| דרמה | noun | דְּרָמָה |  | not-in-pealim | 1 |
| ת'קארמה | noun | תַּ'קָּארְמָה |  | not-in-pealim | 1 |
| ת'חיוך | adjective | תַּ'חִיּוֹךְ |  | not-in-pealim | 1 |
| ובדוק | adjective | וּבָדוּק |  | not-in-pealim | 1 |
| בשתי | numeral | בִּשְׁתֵּי |  | in-pealim-no-target | 1 |
| מרחוק | adverb | מֵרָחוֹק |  | function-no-invariant | 1 |
| ופשוט | adverb | וּפָשׁוּט | простой; вытянутый, распрямлен | function-no-invariant | 1 |
| פוסט |  | פּוֹסְט |  | not-in-pealim | 1 |
| נטו | noun | נֵטוֹ |  | in-pealim-no-target | 1 |
| אוטומטי | adjective | אוֹטוֹמָטִי |  | not-in-pealim | 1 |
| והם | pronoun | וְהֵם | он | function-no-invariant | 1 |
| נוריאל | propernoun | נוּרִיאֵל |  | not-in-pealim | 1 |
| גיטרות | noun | גִּיטָרוֹת |  | not-in-pealim | 1 |
| ואקוסטיות | adjective | וְאָקוּסְטִיּוֹת |  | not-in-pealim | 1 |
| באס | noun | בְּאָס | расстроить, раздосадовать (сле | in-pealim-no-target | 1 |
| מיקס | noun | מִיקְס |  | not-in-pealim | 1 |
| בג'קוזי | noun | בַּגָּ'קוּזִי |  | not-in-pealim | 1 |
| מקוסטל | propernoun | מִקּוּסְטָל |  | not-in-pealim | 1 |
| לפלאזה | propernoun | לִפְלָאזָה |  | not-in-pealim | 1 |
| אתנה | noun | אֶתְנָה |  | in-pealim-no-target | 1 |
| וכולי | adverb | וְכֻלֵּי | инструмент, приспособление; со | function-no-invariant | 1 |
| טאטע | propernoun | טַאטֶע |  | not-in-pealim | 1 |
| ועד | adverb | וָעֶד | конференция, конгресс | in-pealim-no-target | 1 |
| י' | numeral | י' |  | function-no-invariant | 1 |
| קיי | propernoun | קֵיי |  | not-in-pealim | 1 |
| ו' | numeral | ו' |  | function-no-invariant | 1 |
| בדילאי | noun | בְּדִילָאִי |  | not-in-pealim | 1 |
| הה |  | הָהּ |  | not-in-pealim | 1 |
| נואש | adjective | נוֹאָשׁ | терять надежду, отчаиваться | in-pealim-no-target | 1 |
| אספרסו | noun | אֶסְפְּרֵסוֹ |  | not-in-pealim | 1 |
| מחולון | propernoun | מֵחוֹלוֹן |  | not-in-pealim | 1 |
| נתניה | propernoun | נְתַנְיָה |  | not-in-pealim | 1 |
| ת'צד | numeral | ת'צד |  | function-no-invariant | 1 |
| השני | numeral | הַשֵּׁנִי |  | in-pealim-no-target | 1 |
| נחמן | propernoun | נַחְמָן |  | not-in-pealim | 1 |
| שחקנית | noun | שַׂחְקָנִית |  | not-in-pealim | 1 |
| פאריד | propernoun | פָּרִיד |  | not-in-pealim | 1 |
| קיסריה | propernoun | קֵיסָרְיָה |  | not-in-pealim | 1 |
| משום | conjunction | מִשּׁוּם |  | function-no-invariant | 1 |
| וויסקי | noun | וִיסְקִי |  | not-in-pealim | 1 |
| נובמבר | propernoun | נוֹבֶמְבֶּר |  | not-in-pealim | 1 |
| אוניברסלי | adjective | אוּנִיבֶרְסָלִי |  | not-in-pealim | 1 |
| עזאזל | propernoun | עֲזָאזֵל |  | not-in-pealim | 1 |
| רוקי | noun | רֻקִּי | только | in-pealim-no-target | 1 |
| לאחד | numeral | לְאֶחָד | объединять | in-pealim-no-target | 1 |
| ליטר | noun | לִיטֶר |  | not-in-pealim | 1 |
| במזרונים | noun | בְּמִזְרוֹנִים |  | not-in-pealim | 1 |
| בב | noun | בָּב |  | not-in-pealim | 1 |
| אלבי | propernoun | אלבי |  | not-in-pealim | 1 |
| לורו | propernoun | לורו |  | not-in-pealim | 1 |
| פיאנה | propernoun | פִיאָנֶה |  | not-in-pealim | 1 |
| בפיאנו | adverb | בִּפְּיָאנוֹ |  | function-no-invariant | 1 |
| בקארמה | propernoun | בְּקַארְמָה |  | not-in-pealim | 1 |
| מאקיאטו | propernoun | מֵאָקִיָּאטוֹ |  | not-in-pealim | 1 |
| ג'ין | propernoun | גִ'ין |  | not-in-pealim | 1 |
| טוניק | noun | טוֹנִיק |  | not-in-pealim | 1 |
| טקילה | noun | טָקִילָה |  | not-in-pealim | 1 |
| אפלטוני | adjective | אַפְּלָטוֹנִי |  | not-in-pealim | 1 |
| קריסטל | noun | קְרִיסְטָל |  | not-in-pealim | 1 |
| מתוך | preposition | מִתּוֹךְ |  | in-pealim-no-target | 1 |
| מבולבל | adjective | מְבֻלְבָּל | путать | in-pealim-no-target | 1 |
| ת'דלת | noun | תַּ'דָּלֶת |  | not-in-pealim | 1 |
| סטלה | propernoun | סְטֵלָה |  | not-in-pealim | 1 |
| הוויסקי | noun | הַוִּיסְקִי |  | not-in-pealim | 1 |
| במקדונלד'ס | propernoun | בְּמֶקְדּוֹנַלְדְ'ס |  | not-in-pealim | 1 |
| מדונה | noun | מָדוֹנָה |  | not-in-pealim | 1 |
| טורביליון | propernoun | טוֹרְבִילְיוֹן |  | not-in-pealim | 1 |
| אודמר | propernoun | אוֹדְמֶר |  | not-in-pealim | 1 |
| תדלת | noun | תִּדֶּלֶת |  | not-in-pealim | 1 |
| דקלון | propernoun | דַּקְלוֹן |  | not-in-pealim | 1 |
| ובית"ר |  | וּבֵיתָ"ר |  | not-in-pealim | 1 |
| ירושלים | propernoun | יְרוּשָׁלַיִם |  | not-in-pealim | 1 |
| בסיבובים | noun | בַּסִּיבוּבִים |  | not-in-pealim | 1 |
| ת'סוסים | adjective | תַּ'סּוֹסִים |  | not-in-pealim | 1 |
| ת'סיפור | noun | תַּ'סִּיפוֹר |  | not-in-pealim | 1 |
| לסיבוב | noun | לְסִבּוּב |  | not-in-pealim | 1 |
| מסחררת | adjective | מְסַחְרֶרֶת | вращать, вызывать головокружен | in-pealim-no-target | 1 |
| ברים | adjective | בָּרִים |  | not-in-pealim | 1 |
| שאנל'א | propernoun | שָׁאָנֶלָ'א |  | not-in-pealim | 1 |
| ריגושים | noun | רִגּוּשִׁים |  | not-in-pealim | 1 |
| מגונדרת | adjective | מְגֻנְדֶּרֶת | разукрашивать | in-pealim-no-target | 1 |
| אחלה |  | אַחְלָה |  | in-pealim-no-target | 1 |
| מווייב | propernoun | מִוִּייְב |  | not-in-pealim | 1 |
| היי |  | הַי | быть | in-pealim-no-target | 1 |
| סמוראית | noun | סָמוֹרָאִית |  | not-in-pealim | 1 |
| יעני | conjunction | יַעֲנִי |  | in-pealim-no-target | 1 |
| רייד | propernoun | רֶיְד |  | not-in-pealim | 1 |
| דיי | adverb | דַּי | достаточно, довольно | in-pealim-no-target | 1 |
| ת'שביל | noun | תַּ'שְׁבִּיל |  | not-in-pealim | 1 |
| גאד | propernoun | גָּאד |  | not-in-pealim | 1 |
| ת'זוגיות | noun | תַּ'זּוֹגִיּוֹת |  | not-in-pealim | 1 |
| שמחרמן | verb | שֶׁמְּחַרְמֵן |  | in-pealim-no-target | 1 |
| אמ | adverb | אֶמ |  | function-no-invariant | 1 |
| הממ | adverb | הֶמְמְ |  | function-no-invariant | 1 |
| ההרתעה | noun | הַהַרְתָּעָה |  | in-pealim-no-target | 1 |
| אול | noun | אוּל | глупец, дурак (лит.) | in-pealim-no-target | 1 |
| סבך | noun | סְבַךְ | путаница | in-pealim-no-target | 1 |
| הראשון | numeral | הָרִאשׁוֹן | первый | function-no-invariant | 1 |
| הביולוגי | adjective | הַבִּיּוֹלוֹגִי |  | not-in-pealim | 1 |
| פסיכולוגים | noun | פְּסִיכוֹלוֹגִים |  | not-in-pealim | 1 |
| מאחד | numeral | מֵאֶחָד | объединять | in-pealim-no-target | 1 |
| חמסין | noun | חַמְסִין |  | not-in-pealim | 1 |
| מטאפורי | adjective | מֵטָאפוֹרִי |  | not-in-pealim | 1 |
| ת'סוף | noun | תַּ'סּוֹף |  | not-in-pealim | 1 |
| ת'מזל | noun | תַּ'מֵּזַל |  | not-in-pealim | 1 |
| מליון | numeral | מִלְיוֹן |  | function-no-invariant | 1 |
| גנוז | adjective | גָּנוּז |  | not-in-pealim | 1 |
| כשהבוקר | adverb | כְּשֶׁהַבֹּקֶר | посещать (ב־); критиковать (את | function-no-invariant | 1 |
| הבריות | noun | הַבְּרִיּוֹת |  | not-in-pealim | 1 |
| ת'שקט | noun | תַּ'שְׁקָט |  | not-in-pealim | 1 |
| ת'שמיים | noun | תַּ'שְׁמִיִּים |  | not-in-pealim | 1 |
| צ'אנס | noun | צַ'אנְס |  | not-in-pealim | 1 |
| שפעם | adverb | שֶׁפַּעַם | дважды, два раза | in-pealim-no-target | 1 |
| ת'אמת | noun | תַּ'אֲמַת |  | not-in-pealim | 1 |
| בייבי | noun | בַּיָּבִי | канализация | in-pealim-no-target | 1 |
| ת'פנים | adjective | תַּ'פָּנִים |  | not-in-pealim | 1 |
| ת'צורה | noun | תַּ'צּוֹרָה |  | not-in-pealim | 1 |
| מזוכיסט | noun | מָזוֹכִיסְט |  | not-in-pealim | 1 |
| אטד | noun | אָטָד |  | not-in-pealim | 1 |
| קופרמן | propernoun | קוּפֶּרְמָן |  | not-in-pealim | 1 |
| כשאתה | pronoun | כְּשֶׁאַתָּה | я | function-no-invariant | 1 |
| פייר | propernoun | פְּיֵר |  | not-in-pealim | 1 |
| השארת | noun | הַשְׁאָרַת | оставлять | in-pealim-no-target | 1 |
| בסיבוב | noun | בַּסִּבּוּב |  | not-in-pealim | 1 |
| מיליוני | numeral | מִילְיוֹנֵי | миллион | in-pealim-no-target | 1 |
| ת'קצב | numeral | ת'קצב |  | function-no-invariant | 1 |
| קט | adjective | קָט |  | not-in-pealim | 1 |
| הויה | noun | הֲוָיָה |  | not-in-pealim | 1 |
| איפוק | noun | אִפּוּק |  | not-in-pealim | 1 |
| שקשה | adverb | שֶׁקָּשֶׁה | быть твердым, быть тяжелым | function-no-invariant | 1 |
| לעד | adverb | לָעַד |  | function-no-invariant | 1 |
| ג'וב | noun | ג'וֹבּ |  | not-in-pealim | 1 |
| דאבל | noun | דַּאבֶּל |  | not-in-pealim | 1 |
| ינר | propernoun | ינר |  | not-in-pealim | 1 |
| טרה | noun | טֵרָה | свежесть | in-pealim-no-target | 1 |
| וואי |  | וַאי |  | not-in-pealim | 1 |
| בפיד | noun | בַּפִיד |  | not-in-pealim | 1 |
| לשתות'תך | verb | לִשְׁתּוֹתִ'תֶךְ |  | not-in-pealim | 1 |
| צ'אנסים | noun | צַ'נְסִים |  | not-in-pealim | 1 |
| בטיימינג | noun | בְּטַיְמִינְג |  | not-in-pealim | 1 |
| לוי | propernoun | לֵוִי |  | in-pealim-no-target | 1 |
| יאה | adjective | יָאֶה | соответствовать, подходить | in-pealim-no-target | 1 |
| הלוק | noun | הַלֹּק |  | not-in-pealim | 1 |
| מתוקתק | adjective | מְתֻקְתָּק | тикать (о часах) | in-pealim-no-target | 1 |
| טיק | noun | טִיק |  | not-in-pealim | 1 |
| טק |  | טֵק |  | not-in-pealim | 1 |
| קולעת | adjective | קוֹלַעַת | стрелять, попадать в цель; пле | in-pealim-no-target | 1 |
| טיפ | noun | טִיפּ |  | not-in-pealim | 1 |
| טופ | noun | טוֹפּ |  | not-in-pealim | 1 |
| להיפ | noun | לְהַיְפּ |  | not-in-pealim | 1 |
| המימיקה | noun | הַמִּימִיקָה |  | not-in-pealim | 1 |
| פריקית | noun | פְרִיקִית |  | not-in-pealim | 1 |
| שפיצית | adjective | שְׁפִּיצִית |  | not-in-pealim | 1 |
| בלתי |  | בִּלְתִּי | не-, без- (префикс) | in-pealim-no-target | 1 |
| ממיליון | numeral | מִמִּילְיוֹן | миллион | function-no-invariant | 1 |
| בדוק | adjective | בָּדוּק |  | not-in-pealim | 1 |
| מדליה | noun | מֵדַלְיָה |  | not-in-pealim | 1 |
| לפסיכופת | noun | לִפְּסִיכוֹפָּת |  | not-in-pealim | 1 |
| פלי | adjective | פָּלִי |  | in-pealim-no-target | 1 |
| בזול | adverb | בְּזוֹל | дешёвый | function-no-invariant | 1 |
| צודקת | adjective | צוֹדֶקֶת | быть правым | in-pealim-no-target | 1 |
| הקארמה | propernoun | הֲקַארְמָה |  | not-in-pealim | 1 |
| חרוט | adjective | חָרוּט |  | not-in-pealim | 1 |
| מאטפורה | noun | מֵאַטְפוֹרָה |  | not-in-pealim | 1 |
| מתנעים | noun | מַתְנְעִים | заводить (машину) | in-pealim-no-target | 1 |
| אתם | pronoun | אַתֶּם | я | in-pealim-no-target | 1 |
| עצמכם | pronoun | עַצְמְכֶם | закрыть (глаза) | in-pealim-no-target | 1 |
| הסופשבוע | noun | הַסּוֹפְשָׁבוּעַ |  | not-in-pealim | 1 |
| האנונימי | adjective | הָאָנוֹנִימִי |  | not-in-pealim | 1 |
| התחתננתי | verb | הִתְחַתְנַנְתִּי |  | not-in-pealim | 1 |
| תדמעות | noun | תִּדְמָעוֹת |  | not-in-pealim | 1 |
| התחננתירציתי | verb | הֲתַחְנַנְתִּירֵצִיתִי |  | not-in-pealim | 1 |
| האגו | noun | הָאֵגוֹ |  | not-in-pealim | 1 |
| בגדול | adverb | בְּגָדוֹל | большой | function-no-invariant | 1 |
| לעצמו | pronoun | לְעַצְמוֹ | закрыть (глаза) | function-no-invariant | 1 |
| ד"ש |  | ד"ש |  | not-in-pealim | 1 |
| שעוד | adverb | שֶׁעוֹד | свидетельствовать | function-no-invariant | 1 |
| שפשוט | adverb | שֶׁפָּשׁוּט | простой; вытянутый, распрямлен | function-no-invariant | 1 |
| נטישה | noun | נְטִישָׁה |  | not-in-pealim | 1 |
| העוקץ | noun | הָעֹקֶץ | укус, укол (комара, пчелы); ко | in-pealim-no-target | 1 |
| לה | propernoun | לָה | к (*выражается также дательным | in-pealim-no-target | 1 |
| פופה | propernoun | פּוֹפֶה |  | not-in-pealim | 1 |
| בעל | adverb | בְּעַל | на; о, об, касательно | in-pealim-no-target | 1 |
| ת'מבט | noun | תַּ'מָּבֶט |  | not-in-pealim | 1 |
| הדיסטנס | noun | הַדִּיסְטַנְס |  | not-in-pealim | 1 |
| פאם | propernoun | פָאם |  | not-in-pealim | 1 |
| פטאל | propernoun | פָטָאל |  | not-in-pealim | 1 |
| אדידס | propernoun | אָדִידָס |  | not-in-pealim | 1 |
| מיוט | noun | מְיוּט |  | not-in-pealim | 1 |
| אינטואיציה | noun | אִינְטוּאִיצְיָה |  | not-in-pealim | 1 |
| מניפולציה | noun | מָנִיפּוּלַצְיָה |  | not-in-pealim | 1 |
| וואלק | propernoun | וַלְק |  | not-in-pealim | 1 |
| מריה | propernoun | מָרִיָּה |  | not-in-pealim | 1 |
| לברזיל | propernoun | לִבְּרָזִיל |  | not-in-pealim | 1 |
| הן | pronoun | הֵן | он | in-pealim-no-target | 1 |
| בקאסה | propernoun | בְּקָאסָה |  | not-in-pealim | 1 |
| יאיא | propernoun | יָאיָא |  | not-in-pealim | 1 |
| ושתיים | numeral | וּשְׁתַּיִם |  | function-no-invariant | 1 |
| בריו | propernoun | בְּרִיּוֹ |  | not-in-pealim | 1 |
| דה | propernoun | דֶּה |  | not-in-pealim | 1 |
| ז'נרו | propernoun | זָ'נֵרוֹ |  | not-in-pealim | 1 |
| טודו | propernoun | טוּדוֹ |  | not-in-pealim | 1 |
| טקיירו | propernoun | טקיירו |  | not-in-pealim | 1 |
| ז'נירו | propernoun | זָ'נֵירוֹ |  | not-in-pealim | 1 |
| בירקון | noun | בַּיַּרְקוֹן |  | not-in-pealim | 1 |
| המשורר | noun | הַמְּשׁוֹרֵר |  | in-pealim-no-target | 1 |
| בלוטו | noun | בַּלּוֹטוֹ | желудь | in-pealim-no-target | 1 |
| מעצמי | pronoun | מֵעַצְמִי | закрыть (глаза) | function-no-invariant | 1 |
| סוער | adjective | סוֹעֵר | бушевать (о буре), быть взбудо | in-pealim-no-target | 1 |
| עכבה | noun | עַכָּבָה | задерживать, препятствовать; у | in-pealim-no-target | 1 |
| היפראקטיבי | adjective | הִיפֶּרְאַקְטִיבִי |  | not-in-pealim | 1 |
| אוף |  | אוּף |  | not-in-pealim | 1 |
| אנ |  | אַנ |  | not-in-pealim | 1 |
| בעצם | adverb | בְּעֶצֶם | закрыть (глаза) | function-no-invariant | 1 |
| ולדרמה | noun | וְלַדְּרָמָה |  | not-in-pealim | 1 |
| עצמם | pronoun | עַצְמָם | закрыть (глаза) | in-pealim-no-target | 1 |
| קוד | noun | קוֹד | кодировать (информатика) | in-pealim-no-target | 1 |
| קופון | noun | קוּפּוֹן |  | not-in-pealim | 1 |
| כביר | adjective | כַּבִּיר |  | not-in-pealim | 1 |
| חלאס |  | חַלַאס |  | not-in-pealim | 1 |
| זונה | noun | זוֹנָה | развратничать, прелюбодействов | in-pealim-no-target | 1 |
| מהבאסה | noun | מֵהַבָּאסָה |  | in-pealim-no-target | 1 |
| ואן | propernoun | וַן |  | not-in-pealim | 1 |
| וכשאני | pronoun | וּכְשֶׁאֲנִי | я | function-no-invariant | 1 |
| פאק | noun | פָאק |  | not-in-pealim | 1 |
| ליאת | propernoun | לִיאַת |  | not-in-pealim | 1 |
| ינאי | propernoun | יַנַּאי |  | not-in-pealim | 1 |
| מפלסטיק | noun | מִפְּלַסְטִיק |  | not-in-pealim | 1 |
| מאגו | noun | מֵאֵגוֹ |  | not-in-pealim | 1 |
| וגיטרה | noun | וְגִיטָרָה |  | not-in-pealim | 1 |
| ברוטשילד | propernoun | בְּרוֹטְשִׁילְד |  | not-in-pealim | 1 |
| נה | numeral | נה |  | function-no-invariant | 1 |
| כשאנ'לא | noun | כְּשֶׁאַנְ'לֶא |  | not-in-pealim | 1 |
| בתאכלס |  | בְּתַאכְלֶס |  | not-in-pealim | 1 |
| מחוץ | adverb | מִחוּץ |  | function-no-invariant | 1 |
| עצמך | pronoun | עַצְמֵךְ | закрыть (глаза) | in-pealim-no-target | 1 |
| מוקסין | noun | מוֹקָסִין |  | not-in-pealim | 1 |
| שטן | noun | שָׂטָן |  | not-in-pealim | 1 |
| פראדה | propernoun | פְּרָאדָה |  | not-in-pealim | 1 |
| אימפריות | noun | אִימְפֶּרְיוֹת |  | not-in-pealim | 1 |
| הקאש | noun | הַקֵּאשׁ |  | not-in-pealim | 1 |
| מרטיני | noun | מַרְטִינִי |  | not-in-pealim | 1 |
| וקוויאר | noun | וְקַוְיָאר |  | not-in-pealim | 1 |
| לעזאזל |  | לַעֲזָאזֵל |  | not-in-pealim | 1 |
| שאכטות | noun | שַׁכְטוֹת |  | not-in-pealim | 1 |
| כואבות | adjective | כּוֹאֲבוֹת | болеть (о части тела) | in-pealim-no-target | 1 |
| ג'יי | propernoun | גֵ'יי |  | not-in-pealim | 1 |
| יאללה |  | יַאלְלָה |  | not-in-pealim | 1 |
| סאחה |  | סָאחָה |  | not-in-pealim | 1 |
| הכיפאק | pronoun | הַכֵּיפָאק |  | function-no-invariant | 1 |
| בחזרה | adverb | בַּחֲזָרָה |  | function-no-invariant | 1 |
| ת'מחר | noun | תַּ'מָּחֵר |  | not-in-pealim | 1 |
| ויקיפדיה | propernoun | וִיקִיפֶּדְיָה |  | not-in-pealim | 1 |
| שמבפנים | adverb | שֶׁמִּבִּפְנִים |  | function-no-invariant | 1 |
| טון | noun | טוֹן |  | not-in-pealim | 1 |
| פוליטיקאים | noun | פּוֹלִיטִיקָאִים |  | not-in-pealim | 1 |
| ת'בגדים | adjective | תַּ'בָּגָדִים |  | not-in-pealim | 1 |
| טפט | verb | טַפֵּט |  | not-in-pealim | 1 |
| הפרקט | noun | הַפַּרְקֵט |  | not-in-pealim | 1 |
| רולקס | propernoun | רוֹלֵקְס |  | not-in-pealim | 1 |
| וקסקט | noun | וְקַסְקֵט |  | not-in-pealim | 1 |
| עלק | noun | עֶלֶק | приставать, докучать (על) (сле | in-pealim-no-target | 1 |
| ת'שירים | numeral | תַּ'שִּׁירִים |  | function-no-invariant | 1 |
| ושיכרון | noun | וְשִׁכָּרוֹן |  | not-in-pealim | 1 |
| המרוקן | verb | הַמְּרֻקָּן |  | in-pealim-no-target | 1 |
| ימינה | adverb | יָמִינָה | правая сторона, право; правая  | in-pealim-no-target | 1 |
| ושימי | propernoun | וְשִׁימִי |  | not-in-pealim | 1 |
| מיליונרים | noun | מִילְיוֹנֵרִים |  | not-in-pealim | 1 |
| מטפורה | noun | מֵטָפוֹרָה |  | not-in-pealim | 1 |
| השאנל | noun | הַשַּׁנְל |  | not-in-pealim | 1 |
| דונם | noun | דּוּנָם |  | not-in-pealim | 1 |
| ת'חליפה | noun | תַּ'חֲלִיפָה |  | not-in-pealim | 1 |
| ת'שם | noun | תַּ'שָּׁם |  | not-in-pealim | 1 |
| כשהיא | pronoun | כְּשֶׁהִיא | он | function-no-invariant | 1 |
| שארטרז | noun | שֶׁאַרְטְרַז |  | not-in-pealim | 1 |
| ת'נקודת | noun | תַּ'נְקוֹדַת |  | not-in-pealim | 1 |
| ת'כאב | noun | תַּ'כָּאב |  | not-in-pealim | 1 |
| והגוצ'י | noun | וְהַגּוֹצִ'י |  | not-in-pealim | 1 |
| ת'חלומות | noun | תַּ'חֲלוֹמוֹת |  | not-in-pealim | 1 |
| ת'חתונה | noun | תַּ'חְתוֹנָה |  | not-in-pealim | 1 |
| ביוון | propernoun | בְּיָוָן | эллинизироваться, перенимать г | not-in-pealim | 1 |
| רחוק | adverb | רָחוֹק | далекий | in-pealim-no-target | 1 |
| ת'סלון | noun | תַּ'סְלוּן |  | not-in-pealim | 1 |
| שבעה | propernoun | שִׁבְעָה |  | in-pealim-no-target | 1 |
| ראשון | numeral | רִאשׁוֹן | первый | in-pealim-no-target | 1 |
| ראשונים | numeral | רִאשׁוֹנִים | первый | in-pealim-no-target | 1 |
| ראשונות | numeral | רִאשׁוֹנוֹת | первый | in-pealim-no-target | 1 |
| חופשי | adverb | חָפְשִׁי | свободный, вольный | in-pealim-no-target | 1 |
| מרים | propernoun | מִרְיָם |  | in-pealim-no-target | 1 |
| עמוקות | adverb | עֲמֻקּוֹת | глубокий | function-no-invariant | 1 |
| מסובכת | adjective | מְסֻבֶּכֶת | спутывать; осложнять | in-pealim-no-target | 1 |
| מסובכים | adjective | מְסֻבָּכִים | спутывать; осложнять | in-pealim-no-target | 1 |
| מסובכות | adjective | מְסֻבָּכוֹת | спутывать; осложнять | in-pealim-no-target | 1 |
| דתייה | adjective | דָּתִיָּה |  | not-in-pealim | 1 |
| חילוניות | noun | חִלּוֹנִיּוּת | светский, нерелигиозный | in-pealim-no-target | 1 |
| צודק | adjective | צוֹדֵק | быть правым | in-pealim-no-target | 1 |
| פחדנות | noun | פַּחְדָנוּת |  | not-in-pealim | 1 |
| קמצנות | noun | קַמְצָנוּת |  | not-in-pealim | 1 |
| מבריק | adjective | מַבְרִיק | начищать до блеска; сверкать | in-pealim-no-target | 1 |
| מבריקה | adjective | מַבְרִיקָה | начищать до блеска; сверкать | in-pealim-no-target | 1 |
| מבריקים | adjective | מַבְרִיקִים | начищать до блеска; сверкать | in-pealim-no-target | 1 |
| מבריקות | adjective | מַבְרִיקוֹת | начищать до блеска; сверкать | in-pealim-no-target | 1 |
| אופטימי | adjective | אוֹפְּטִימִי |  | not-in-pealim | 1 |
| אופטימית | adjective | אוֹפְּטִימִית |  | not-in-pealim | 1 |
| אופטימיים | adjective | אוֹפְּטִימִיִּים |  | not-in-pealim | 1 |
| אופטימיות | noun | אוֹפְּטִימִיּוּת |  | not-in-pealim | 1 |
| הבחוץ | adverb | הַבַּחוּץ | внешний | function-no-invariant | 1 |
| ת'בגדים | noun | תַּ'בְגָדִים |  | not-in-pealim | 1 |
| גנבים | noun | גַּנָּבִים | кража | in-pealim-no-target | 1 |
| אגו | noun | אֵגוֹ |  | not-in-pealim | 1 |
| בפאקינג | noun | בְּפָאקִינְג |  | not-in-pealim | 1 |
| ראמה | verb | רָאֲמָה |  | not-in-pealim | 1 |
| קסקס | verb | קִסְקֵס |  | not-in-pealim | 1 |

> Полный машиночитаемый список (все 8967 заметок) — `.tmp/pealim-link-inventory.json`.
