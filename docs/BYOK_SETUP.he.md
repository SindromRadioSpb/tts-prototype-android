# הגדרת מפתחות API (BYOK)

LinguistPro פועלת במודל **BYOK — Bring Your Own Key**. אתם יוצרים מפתחות בעצמכם בחשבון ה-Google שלכם ומזינים אותם בדפדפן הזה. השרת של LinguistPro לא שומר את המפתחות שלכם ולא משתמש במפתחות משותפים של הבעלים — זה מגן על המכסות ונותן לכם שליטה מלאה על העלויות.

מדריך זה זמין בשלוש שפות. RU: `/docs/BYOK_SETUP.md`. EN: `/docs/BYOK_SETUP.en.md`.


## מה עובד ללא מפתחות

חלק מהפונקציות זמינות מיד, ללא הגדרה:

- **TTS דרך הדפדפן (system_fallback)** — קול מובנה של מערכת ההפעלה. האיכות נמוכה מ-Google Cloud TTS, אבל זה עובד אופליין ובחינם. תמיכה בעברית תלויה בפלטפורמה.
- **תרגום דרך Google Translate (חינמי)** — ספק "Google Translate" בהגדרות התרגום. חינמי, אבל בעל מגבלות נוקשות של Google ולעיתים מחזיר שגיאת 429.
- **MADLAD (מקומי)** — אם מותקן אצלכם Python sidecar `ai-local` על 127.0.0.1:8765, התרגום המקומי עובד ללא אינטרנט וללא מכסה.
- **תעתיק וניקוד** — ספריות מקומיות, אין צורך במפתח.
- **ספרייה, כרטיסי SRS, הערות, ייצוא ZIP** — לחלוטין בדפדפן, ללא מפתחות.

אם זה מספיק לכם, אפשר לדלג על שאר ההגדרות.


## אילו מפתחות נדרשים לפונקציונליות מלאה

| מה המפתח מאפשר                             | מפתח                | שירות Google                    | היכן להזין ב-UI                                   |
|--------------------------------------------|---------------------|---------------------------------|---------------------------------------------------|
| תרגום Gemini AI (סגמנטציה חכמה)            | Gemini API Key      | Google AI Studio                | הגדרות תרגום ← "🔑 Gemini API Key"                |
| TTS פרימיום (Google Cloud, קולות WaveNet)  | GCP TTS API Key     | Google Cloud Text-to-Speech     | הגדרות אודיו ← "🔑 GCP TTS API Key"               |
| תרגום פרימיום (Cloud Translation)          | GCP Translate Key   | Google Cloud Translation        | הגדרות תרגום ← "🔑 GCP Translate API Key"         |

לכל שלושת המפתחות פורמט `AIzaSy…` ויצירת כל אחד אורכת 5–10 דקות.

**האם אפשר להשתמש במפתח אחד לכל שלושת השירותים?** טכנית — כן, אם תרשו לו את כל שלושת ה-APIs. אבל זו נוהג אבטחה גרוע. עדיף ליצור מפתח נפרד לכל שירות ולהגביל אותו ל-API אחד — אז דליפת מפתח אחד לא תשפיע על השאר.

**עלות:** ל-Google יש מכסות חינמיות נדיבות:
- Gemini: כ-50 בקשות ביום במודל flash.
- Cloud Text-to-Speech: מיליון תווים בחודש (Standard) / 4 מיליון (WaveNet).
- Cloud Translation: 500,000 תווים בחודש.

ללימוד שפה פרטי זה בדרך כלל יותר ממספיק. חריגה מהמכסה מוצגת כשגיאה, לא כחיוב אוטומטי.


## שלב 1: Gemini API Key

מפתח זה מפעיל את תרגום Gemini AI עם סגמנטציה וביאורים.

1. פתחו את `https://aistudio.google.com/app/apikey` והיכנסו לחשבון Google שלכם.
2. לחצו על **"Create API key"**.
3. בחרו פרויקט Google מהרשימה, או לחצו על "Create new project" — יצירת פרויקט חינמית.
4. העתיקו את המפתח המוצג. הוא נראה כמו `AIzaSy...` (בערך 40 תווים).
5. ב-LinguistPro: פתחו **"הגדרות תרגום"** ← ספק **"Gemini (legacy)"** ← יופיע שדה **"🔑 Gemini API Key"** ← הדביקו את המפתח ← **"💾 שמור"**.

זהו. המפתח נשמר רק בדפדפן הזה (localStorage) ונשלח לשרת רק בעת תרגום דרך HTTPS.


## שלב 2: GCP TTS API Key (Google Cloud Text-to-Speech)

מפתח זה מאפשר TTS פרימיום (קולות WaveNet, Standard). בלעדיו, ה-TTS משתמש בקול המובנה של הדפדפן.

1. פתחו את `https://console.cloud.google.com/` והיכנסו לחשבון Google שלכם.
2. צרו פרויקט חדש אם אין לכם: רשימת פרויקטים בראש העמוד ← **"New Project"** ← שם כלשהו ← **"Create"**.
3. בתפריט הימני: **"APIs & Services"** ← **"Library"**. חפשו **"Cloud Text-to-Speech API"** ← פתחו ← **"Enable"**.
4. תפריט ימני: **"APIs & Services"** ← **"Credentials"**.
5. בראש העמוד: **"+ Create credentials"** ← **"API key"**.
6. מודאל מציג את המפתח `AIzaSy...` — העתיקו.
7. מיד לחצו על **"Edit API key"** (אייקון העיפרון בשורת המפתח) ← קטע **"API restrictions"** ← בחרו **"Restrict key"** ← סמנו רק **"Cloud Text-to-Speech API"** ← **"Save"**. זה חיוני: מפתח לא מוגבל יכול לשמש לכל שירותי Google Cloud שלכם, מה שמסוכן במקרה של דליפה.
8. ב-LinguistPro: פתחו **"הגדרות אודיו"** ← ספק **"Online TTS"** ← יופיע שדה **"🔑 GCP TTS API Key"** ← הדביקו ← **"💾 שמור"**.

**משתמש חדש ב-Google Cloud?** Google עשויה לדרוש אישור חשבון חיוב. בתוך המכסה החינמית לא יבוצע חיוב; חשבון החיוב נדרש רק לצורך "אמון".


## שלב 3: GCP Translate API Key (Google Cloud Translation)

מפתח זה מפעיל את ספק **"GCP Translate (API)"** בהגדרות התרגום. אם "Google Translate (חינמי)" או MADLAD המקומי מספיקים, אפשר לדלג על שלב זה.

1. פתחו את `https://console.cloud.google.com/` (אותו פרויקט של TTS).
2. **"APIs & Services"** ← **"Library"** ← חפשו **"Cloud Translation API"** ← **"Enable"**.
3. **"APIs & Services"** ← **"Credentials"** ← **"+ Create credentials"** ← **"API key"**.
4. העתיקו את המפתח החדש.
5. **"Edit API key"** ← **"API restrictions"** ← **"Restrict key"** ← סמנו רק **"Cloud Translation API"** ← **"Save"**.
6. ב-LinguistPro: **"הגדרות תרגום"** ← ספק **"GCP Translate (API)"** ← שדה **"🔑 GCP Translate API Key"** ← הדביקו ← **"💾 שמור"**.


## אבטחת מפתחות: המלצות

- **הגבילו כל מפתח ל-API אחד.** ב-"Edit API key" ← "API restrictions" ← "Restrict key". אם מפתח מוגבל רק ל-Cloud TTS, גניבתו לא תאפשר גישה לשירותים אחרים.
- **אל תפרסמו את המפתח.** לא בצילומי מסך, לא בצ'אטים פתוחים, לא ב-git commits.
- **מפתח אחד למכשיר אחד.** localStorage שומר את המפתח רק בדפדפן הזה. במכשיר או דפדפן אחר תזינו אותו מחדש. זה לא באג — זה האופן שבו BYOK מגן עליכם כאשר סשן אחד מתפשר.
- **מעקב שימוש.** ב-Google Cloud Console: **"APIs & Services"** ← **"Dashboard"** ← בחרו API ← רואים את מספרי הבקשות בפועל ואת המכסה הנותרת.
- **רוטציה במקרה של חשד.** אם אתם חושדים שהמפתח דלף, מחקו אותו ב-Credentials וצרו חדש. הישן יפסיק לעבוד מיד.


## מה קורה ללא מפתחות

- **TTS ללא מפתח** ← ה-TTS המקוון עובר אוטומטית לקול הדפדפן (`speechSynthesis`). פעם אחת בסשן מוצגת רמיזה "Add a GCP TTS key for premium quality". איכות נמוכה, אבל זה עובד.
- **תרגום Gemini ללא מפתח** ← תראו "Gemini API Key required" ושדה הזנת המפתח יודגש. "Google Translate (חינמי)" ו-"MADLAD" עובדים בנפרד.
- **GCP Translate ללא מפתח** ← אם הספק מוגדר כ-"GCP Translate (API)" אך אין מפתח, תראו "GCP Translate API key required". עברו לספק אחר או הזינו את המפתח.


## פתרון בעיות

**"פורמט מפתח שגוי. המפתח חייב להתחיל ב-AIza…"**
העתקתם את הדבר הלא נכון. Google API Key תמיד מתחיל ב-`AIza` ובאורך של כ-39 תווים. אם יש לכם JSON מרובה שורות, זה service account, שלא נתמך כאן — השתמשו ב-API Key מקטע Credentials.

**"Quota exceeded" / 429**
המכסה החינמית נוצלה. המתינו עד היום הבא (Gemini) או החודש הבא (GCP). ב-Google Cloud Console מוצגים מכסה מדויקת ושימוש נוכחי.

**המפתח הוזן אך התרגומים לא עובדים**
- ודאו שה-API מופעל בפרויקט (Library ← בדקו ש-API מוצג כ-"API Enabled").
- אמתו שב-"Edit API key" ← "API restrictions" ה-API הנכון מסומן (או בחרו "Don't restrict key" לבדיקה).
- נקו את מטמון הדפדפן ורעננו — לעיתים service worker מגיש קוד ישן.

**עברית נשמעת מוזר ב-TTS של הדפדפן**
בפלטפורמות מסוימות (iOS, Android ישנים) אין קול עברית טוב. הוסיפו GCP TTS Key — קולות `he-IL-Wavenet-*` נשמעים טבעיים.

**ספרייה/SRS/הערות לא מסונכרנים בין מכשירים**
התנהגות צפויה: הטקסטים, הכרטיסים וההערות שלכם נמצאים בדפדפן (OPFS), לא בשרת. השתמשו בייצוא/ייבוא ZIP להעברה בין מכשירים.


## מסמכים קשורים

- פרטיות וטיפול בנתונים: `/docs/PRIVACY.md`
- אחסון נתונים בצד הדפדפן (OPFS): `/docs/OPFS_USER_GUIDE.md`

אם משהו לא עובד או לא ברור — פתחו issue ב-repository של הפרויקט.
