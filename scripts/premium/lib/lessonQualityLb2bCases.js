"use strict";

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const ROOT = path.resolve(__dirname, "..", "..", "..");

function row(index, he, ru) {
  return { order_index: index, he, ru };
}

function repeatRows(count, pairs) {
  return Array.from({ length: count }, (_, index) => {
    const pair = pairs[index % pairs.length];
    return row(index, pair[0], pair[1]);
  });
}

function gardenRows() {
  const rows = [
    ["תלמידי בית הספר החליטו להקים גינה קהילתית.", "Ученики школы решили создать общественный сад."],
    ["המטרה הייתה לגדל ירקות וללמוד לעבוד יחד.", "Целью было выращивать овощи и учиться работать вместе."],
    ["המורה ביקשה מכל קבוצה לתכנן חלק קטן בגינה.", "Учительница попросила каждую группу спланировать небольшой участок сада."],
    ["התלמידים מדדו את השטח ורשמו את התוצאות במחברת.", "Ученики измерили участок и записали результаты в тетрадь."],
    ["הם בחרו צמחים שמתאימים לעונה ולכמות המים.", "Они выбрали растения, подходящие сезону и количеству воды."],
    ["בסוף כל שבוע נערכה שיחה קצרה על ההתקדמות.", "В конце каждой недели проходило короткое обсуждение прогресса."]
  ];
  const teams = [["קבוצת האורן", "группа «Сосна»"], ["קבוצת הרימון", "группа «Гранат»"], ["קבוצת הזית", "группа «Олива»"]];
  const actions = [
    ["בדקה את לחות האדמה לפני ההשקיה.", "проверила влажность почвы перед поливом."],
    ["הוסיפה עלים יבשים לערמת הקומפוסט.", "добавила сухие листья в компостную кучу."],
    ["השוותה בין צמיחה בשמש לצמיחה בצל.", "сравнила рост на солнце и в тени."],
    ["ספרה את הנבטים ורשמה שינוי קטן.", "посчитала ростки и записала небольшое изменение."],
    ["העבירה שתיל חלש למקום מוגן יותר.", "перенесла слабый саженец в более защищённое место."],
    ["הסבירה לקבוצה אחרת כיצד לחסוך במים.", "объяснила другой группе, как экономить воду."],
    ["צילמה את הערוגה כדי להשוות אותה לשבוע הבא.", "сфотографировала грядку для сравнения со следующей неделей."],
    ["מצאה מזיק על אחד העלים והתייעצה עם המורה.", "нашла вредителя на одном из листьев и посоветовалась с учительницей."],
    ["כתבה המלצה ברורה לקבוצת התורנים הבאה.", "написала ясную рекомендацию следующей дежурной группе."],
    ["סיכמה מה הצליח ומה צריך לשנות.", "подвела итог тому, что удалось и что нужно изменить."]
  ];
  for (let week = 1; week <= 14; week += 1) {
    const team = teams[(week - 1) % teams.length];
    actions.forEach((action, offset) => {
      const conditional = offset === 8
        ? `אם האדמה תהיה יבשה בשבוע ${week}, אז ${team[0]} תשקה אותה מוקדם בבוקר.`
        : `בשבוע ${week} ${team[0]} ${action[0]}`;
      const ru = offset === 8
        ? `Если на ${week}-й неделе почва будет сухой, то ${team[1]} польёт её рано утром.`
        : `На ${week}-й неделе ${team[1]} ${action[1]}`;
      rows.push([conditional, ru]);
    });
  }
  return rows.slice(0, 146).map((pair, index) => row(index, pair[0], pair[1]));
}

const FIXTURES = {
  short_a1_reading_synthetic: [
    ["נועה קמה בשבע בבוקר.", "Ноа встаёт в семь утра."], ["היא שותה מים ואוכלת לחם.", "Она пьёт воду и ест хлеб."],
    ["אחר כך היא הולכת לבית הספר.", "Затем она идёт в школу."], ["בכיתה היא יושבת ליד דניאל.", "В классе она сидит рядом с Даниэлем."],
    ["המורה כותבת מילה חדשה על הלוח.", "Учительница пишет новое слово на доске."], ["נועה קוראת את המילה בקול.", "Ноа читает слово вслух."],
    ["בהפסקה הילדים משחקים בחצר.", "На перемене дети играют во дворе."], ["נועה אוכלת תפוח.", "Ноа ест яблоко."],
    ["אחרי הלימודים היא חוזרת הביתה.", "После занятий она возвращается домой."], ["בבית היא מכינה שיעורים.", "Дома она делает уроки."],
    ["בערב המשפחה אוכלת יחד.", "Вечером семья ест вместе."], ["נועה הולכת לישון בעשר.", "Ноа ложится спать в десять."]
  ],
  short_a2_vocabulary_synthetic: [
    ["ביום שישי יעל הלכה לשוק השכונתי.", "В пятницу Яэль пошла на районный рынок."], ["היא הביאה סל בד כדי לא להשתמש בשקיות.", "Она принесла тканевую корзину, чтобы не пользоваться пакетами."],
    ["בדוכן הראשון היו עגבניות טריות.", "На первом прилавке были свежие помидоры."], ["המוכר הסביר שהירקות הגיעו ממשק מקומי.", "Продавец объяснил, что овощи поступили с местной фермы."],
    ["יעל השוותה מחירים לפני שבחרה.", "Яэль сравнила цены перед выбором."], ["היא קנתה כמות קטנה כדי למנוע בזבוז.", "Она купила небольшое количество, чтобы избежать расточительства."],
    ["ליד המאפייה היא פגשה את שכנתה.", "Возле пекарни она встретила соседку."], ["השתיים חלקו מתכון פשוט למרק.", "Они поделились простым рецептом супа."],
    ["יעל חיפשה גם עשבי תיבול.", "Яэль искала также пряные травы."], ["המוכרת הציעה פטרוזיליה וכוסברה.", "Продавщица предложила петрушку и кинзу."],
    ["יעל בחרה בפטרוזיליה כי טעמה עדין יותר.", "Яэль выбрала петрушку, потому что её вкус мягче."], ["היא ביקשה קבלה ושמרה אותה.", "Она попросила чек и сохранила его."],
    ["בדרך הביתה הסל היה כבד.", "По дороге домой корзина была тяжёлой."], ["שכן צעיר עזר לה לשאת אותו.", "Молодой сосед помог ей её нести."],
    ["בבית יעל שטפה את הירקות.", "Дома Яэль вымыла овощи."], ["היא שמרה חלק מהם במקרר.", "Часть из них она положила в холодильник."],
    ["מהשאר היא הכינה ארוחה למשפחה.", "Из остального она приготовила еду для семьи."], ["כולם שמחו שהמוצרים היו טריים ומקומיים.", "Все обрадовались, что продукты были свежими и местными."]
  ],
  dialogue_a2_synthetic: [
    ["דנה: שלום, אפשר לקבל מידע על חוג הצילום?", "Дана: Здравствуйте, можно получить информацию о фотокружке?"],
    ["אורי: בוודאי. החוג מתקיים בימי שלישי.", "Ури: Конечно. Кружок проходит по вторникам."],
    ["דנה: באיזו שעה מתחילים?", "Дана: В котором часу начинаете?"], ["אורי: מתחילים בחמש ומסיימים בשש וחצי.", "Ури: Начинаем в пять и заканчиваем в половине седьмого."],
    ["דנה: צריך להביא מצלמה אישית?", "Дана: Нужно приносить собственную камеру?"], ["אורי: לא. אפשר להשתמש במצלמות של המרכז.", "Ури: Нет. Можно пользоваться камерами центра."],
    ["דנה: כמה עולה החוג לחודש?", "Дана: Сколько кружок стоит в месяц?"], ["אורי: מאה ועשרים שקלים.", "Ури: Сто двадцать шекелей."],
    ["דנה: יש הנחה לתלמידים?", "Дана: Есть скидка для школьников?"], ["אורי: כן, עם כרטיס תלמיד המחיר הוא מאה שקלים.", "Ури: Да, с ученическим билетом цена сто шекелей."],
    ["דנה: אפשר להגיע לשיעור ניסיון?", "Дана: Можно прийти на пробное занятие?"], ["אורי: כן, אבל צריך להירשם מראש.", "Ури: Да, но нужно записаться заранее."],
    ["דנה: איך נרשמים?", "Дана: Как записаться?"], ["אורי: ממלאים טופס קצר באתר.", "Ури: Нужно заполнить короткую форму на сайте."],
    ["דנה: מה לומדים בשיעור הראשון?", "Дана: Что изучают на первом занятии?"], ["אורי: לומדים על אור ועל מסגרת התמונה.", "Ури: Изучают свет и композицию кадра."],
    ["דנה: האם יוצאים גם לצלם בחוץ?", "Дана: Вы также выходите фотографировать на улицу?"], ["אורי: פעם בחודש יוצאים לפארק הקרוב.", "Ури: Раз в месяц выходим в ближайший парк."],
    ["דנה: נשמע מעניין מאוד.", "Дана: Звучит очень интересно."], ["אורי: בשבוע הבא נפתחת קבוצה חדשה.", "Ури: На следующей неделе открывается новая группа."],
    ["דנה: מצוין, אירשם היום.", "Дана: Отлично, я запишусь сегодня."], ["אורי: אל תשכחי להביא כרטיס תלמיד.", "Ури: Не забудь принести ученический билет."],
    ["דנה: תודה על העזרה.", "Дана: Спасибо за помощь."], ["אורי: בשמחה, נתראה בחוג.", "Ури: Пожалуйста, увидимся на кружке."]
  ],
  ambiguous_morphology_b1: [
    ["הספר הישן נשאר על המדף.", "Старая книга осталась на полке."], ["הספר סיפר לילד על העיר העתיקה.", "Парикмахер рассказал мальчику о старом городе."],
    ["היא שמרה את המכתב במגירה.", "Она сохранила письмо в ящике."], ["השומר שמר על השער בלילה.", "Охранник сторожил ворота ночью."],
    ["הם חזרו מן הדרך לפני החשכה.", "Они вернулись с дороги до темноты."], ["המורה ביקשה שיחזרו על המשפט.", "Учительница попросила, чтобы они повторили предложение."],
    ["פני הילד היו רציניים.", "Лицо ребёнка было серьёзным."], ["המדריך אמר: פני ימינה.", "Инструктор сказал: поверни направо."],
    ["הקהל שמע קול מן החצר.", "Публика услышала голос со двора."], ["הוא קרא את כל העמוד בקול.", "Он прочитал всю страницу вслух."]
  ],
  no_eligible_vocabulary_a1: [
    ["אני בבית.", "Я дома."], ["את בבית.", "Ты дома."], ["הוא פה.", "Он здесь."], ["היא פה.", "Она здесь."],
    ["יש לי מים.", "У меня есть вода."], ["יש לך לחם.", "У тебя есть хлеб."], ["זה טוב.", "Это хорошо."], ["זה לא רע.", "Это неплохо."],
    ["אבא בא.", "Папа приходит."], ["אמא באה.", "Мама приходит."], ["אני קם.", "Я встаю."], ["אני הולך.", "Я иду."],
    ["אני שב.", "Я возвращаюсь."], ["אנחנו פה.", "Мы здесь."], ["הם בבית.", "Они дома."], ["לילה טוב.", "Спокойной ночи."]
  ]
};

function publicDomainWork(title) {
  const zip = new AdmZip(path.join(ROOT, "public", "data", "benyehuda", "canon-v4.zip"));
  const library = JSON.parse(zip.readAsText("library/library.json"));
  const work = library.texts.find((item) => item.title === title);
  if (!work) throw new Error("LB2B_PUBLIC_WORK_NOT_FOUND");
  const corpus = work.source_meta && work.source_meta.corpus;
  return {
    id: work.text_id,
    title: work.title,
    author: corpus && corpus.author,
    locator: corpus && corpus.provenance && corpus.provenance.url,
    license: corpus && corpus.provenance && corpus.provenance.license,
    content_hash: corpus && corpus.content_hash,
    rows: work.rows.map((item, index) => row(index, item.hebrew_niqqud || item.hebrew_plain, item.russian || ""))
  };
}

function syntheticRows(caseId, count) {
  if (caseId === "overview_146_b1_grammar_synthetic") return gardenRows();
  const aliases = {
    adversarial_foreign_anchor: "short_a1_reading_synthetic",
    adversarial_invented_construct: "ambiguous_morphology_b1",
    adversarial_missing_answer: "short_a2_vocabulary_synthetic",
    adversarial_generic_instruction: "short_a1_reading_synthetic",
    provider_absent_safe_plan: "short_a2_vocabulary_synthetic"
  };
  const pairs = FIXTURES[caseId] || FIXTURES[aliases[caseId]];
  if (!pairs) throw new Error("LB2B_SYNTHETIC_FIXTURE_MISSING");
  return repeatRows(count, pairs);
}

function syntheticTitle(caseId) {
  const aliases = {
    short_a1_reading_synthetic: "יום בבית הספר",
    short_a2_vocabulary_synthetic: "בשוק השכונתי",
    overview_146_b1_grammar_synthetic: "הגינה הקהילתית",
    dialogue_a2_synthetic: "חוג הצילום",
    ambiguous_morphology_b1: "מילים בהקשר",
    no_eligible_vocabulary_a1: "משפטים קצרים",
    adversarial_foreign_anchor: "יום בבית הספר",
    adversarial_invented_construct: "מילים בהקשר",
    adversarial_missing_answer: "בשוק השכונתי",
    adversarial_generic_instruction: "יום בבית הספר",
    provider_absent_safe_plan: "בשוק השכונתי"
  };
  return aliases[caseId] || "טקסט לימודי סינתטי";
}

function anchorWindows(sourceId, rows) {
  const starts = rows.length <= 30 ? [0] : [0, Math.max(0, Math.floor(rows.length / 2) - 3), Math.max(0, rows.length - 6)];
  return [...new Set(starts)].map((start, index) => ({
    id: `${sourceId}-anchor-${index + 1}`,
    start_order_index: start,
    end_order_index: Math.min(rows.length - 1, start + (rows.length <= 30 ? rows.length - 1 : 5)),
    rows: rows.slice(start, start + (rows.length <= 30 ? rows.length : 6))
  }));
}

function deterministicFacts(caseDef, sourceId) {
  const facts = {
    vocabulary_candidates: [],
    selected_construct: null,
    excluded_ambiguous_morphology: caseDef.id === "ambiguous_morphology_b1"
      ? ["ספר", "שמר", "פני"] : [],
    rule: "Only asserted facts below may be explained as Hebrew facts."
  };
  if (caseDef.id === "short_a2_vocabulary_synthetic" || caseDef.id === "adversarial_missing_answer") {
    facts.vocabulary_candidates = [
      { surface: "טרי", meaning: "свежий", source_id: sourceId },
      { surface: "בזבוז", meaning: "расточительство; ненужная трата", source_id: sourceId }
    ];
  }
  if (caseDef.id === "overview_146_b1_grammar_synthetic") {
    facts.selected_construct = { id: "syntax:im-az-conditional", label: "אם ... אז", status: "asserted_from_source" };
  }
  return facts;
}

function materializeCase(caseDef) {
  let source;
  if (caseDef.id === "series_241_b2_writing_public_domain") source = publicDomainWork("מצוה");
  else if (caseDef.id === "double_reject_safe_plan") source = publicDomainWork("בועידת הסופרים");
  else source = { id: `synthetic:${caseDef.id}`, title: syntheticTitle(caseDef.id), author: "LinguistPro synthetic fixture",
    locator: caseDef.source.locator, license: "CC0 synthetic fixture", content_hash: null, rows: syntheticRows(caseDef.id, caseDef.row_count) };
  const windows = anchorWindows(source.id, source.rows);
  return {
    case_def: caseDef,
    source: { id: source.id, title: source.title, author: source.author, locator: source.locator, license: source.license,
      content_hash: source.content_hash, row_count: source.rows.length, anchor_windows: windows },
    deterministic_facts: deterministicFacts(caseDef, source.id)
  };
}

function loadCases(caseFile) {
  const parsed = JSON.parse(fs.readFileSync(caseFile, "utf8"));
  return { version: parsed.version, cases: parsed.cases.map(materializeCase) };
}

module.exports = { loadCases, materializeCase };
