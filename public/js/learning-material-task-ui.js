(function(){
  'use strict';
  let operations=null,store=null,runner=null,currentDialog=null;
  const words={
    ru:{title:'Подготовка материала',tasks:'Задачи подготовки',name:'Название материала',start:'Подготовить и сохранить',resume:'Продолжить',cancel:'Остановить после текущего шага',close:'Закрыть',download:'Скачать ZIP',open:'Открыть материал',empty:'Нет незавершённых задач.',note:'Будет создана новая карточка и подготовлен ZIP. Используется выбранный в Студии переводчик: ',cost:'Перевод может расходовать вашу квоту. Готовые шаги сохраняются на этом устройстве.',imported:'Источник сохранён',transcribing:'Распознаём речь по ссылке',transcribed:'Транскрипт получен',binding:'Привязываем видео к карточке',bound:'Видео привязано',causeTAB_BACKGROUNDED:'вкладка была в фоне',causePROVIDER_OVERLOADED:'провайдер перегружен',causeNETWORK:'сеть подвела',causeSERVER_ERROR:'сбой сервера',causeJSON_DAMAGED:'ответ повреждён',detailForeground:'вкладка была в фоне · вернитесь в неё, продолжу сам',foregroundNote:'Держите эту вкладку на переднем плане: Chrome замораживает фоновые вкладки и обрывает запрос. Готовые куски сохраняются — переплаты не будет.',resumeFrom:'Продолжено с куска {from} из {of} — сделанное раньше не оплачивается заново.',resumeRefused:'Журнал прошлого прогона не подошёл ({what}) — таблица считается заново.',resumeRefusedUnknown:'Журнал прошлого прогона не подошёл — таблица считается заново.',fieldtext:'изменился текст',fieldsegments:'изменились реплики',fieldmodel:'сменилась модель',fieldprovider:'сменился переводчик',fieldchunkSize:'изменился размер куска',titleReady:'✅ Материал готов',titleStopped:'⚠️ Прогон остановлен',paidTranscript:'Распознавание уже оплачено и сохранено — при продолжении оно не повторяется.',causeYT_OVERLOADED:'провайдер перегружен',causeYT_QUOTA:'ограничение частоты',causeYT_FAILED:'сбой провайдера',markDone:'готово',markCurrent:'идёт',markPending:'ждёт',markStalled:'остановлено',stageImported:'Источник',stageTranscribing:'Распознавание речи',stageTranslating:'Учебная таблица',stageSaved:'Сохранение карточки',stageBound:'Привязка видео',stageReady:'Готовый пакет',detailRetry:'{why} · повтор через {sec} с (попытка {i} из {n})',detailSlow:'идёт {time} · дольше обычного',detailElapsed:'идёт {time}',detailWindow:'окно {i} из {n} · {time}',detailRows:'готово строк {ready} из {total} · кусок {chunk} из {chunks}',priceFull:'Ролик {d} · распознавание ≈${asr} · таблица ≈${tlo}–{thi} · всего ≈${lo}–{hi}',minutesNote:'обычно {n} мин',priceNote:'Цена таблицы — вилка: сколько получится реплик, известно только после распознавания.',price:'Ролик {d} · распознавание речи ≈${p}',parts:'{n} частей',estimating:'Считаем стоимость…',estimateFailed:'Стоимость посчитать не удалось.',retryEstimate:'Повторить оценку',linkNote:'Материал будет создан прямо из ссылки: скачивать видео не нужно.',captionsFree:'Если у ролика есть свои субтитры, их можно импортировать бесплатно кнопкой «Показать видео».',blindNote:'Часть строк осталась без надёжной привязки ко времени — там караоке молчит.',unvocalizedNote:'{n} строк без огласовки: модель не смогла огласовать их, не изменив текст. Сам текст, перевод и транслитерация на месте.',translating:'Создаём учебную таблицу',table_ready:'Таблица сохранена',saving:'Сохраняем карточку',saved:'Карточка сохранена',exporting:'Проверяем пакет',ready:'Материал готов. Скачайте ZIP и сохраните его в Файлы.',paused:'Задача приостановлена. Источник и готовые шаги сохранены.',cancelled:'Задача остановлена. Можно продолжить с сохранённого шага.',stopping:'Остановимся после текущего шага; его результат сохраним.',error:'Не удалось завершить шаг. Проверьте выбранного переводчика, сеть и доступное место; затем продолжите.',TASK_TABLE_INCOMPLETE:'Таблица не вернулась с провайдера. Транскрипт сохранён — нажмите «Продолжить», оплачен он не будет повторно.',TASK_TRANSCRIPT_INCOMPLETE:'Распознавание не вернуло текста. Нажмите «Продолжить», чтобы попробовать снова.',YT_QUOTA:'Провайдер ограничил частоту запросов (429). Готовые шаги сохранены — продолжите через минуту-другую.',YT_OVERLOADED:'Провайдер сейчас перегружен. Это временно: нажмите «Продолжить».',YT_URL_REJECTED:'Ссылка не принята. Приватные и unlisted ролики недоступны; проверьте адрес.',ASR_TRUNCATED:'Ответ распознавания не поместился целиком. Продолжите — запись будет разобрана по частям.',ASR_BLOCKED:'Провайдер отказался расшифровывать эту запись.',GEMINI_KEY_REQUIRED:'Нужен ваш ключ Gemini — добавьте его в настройках Студии.',busy:'Другая вкладка уже выполняет подготовку.',remove:'Удалить задачу из списка',missing:'Сначала добавьте текст или субтитры.',downloaded:'Загрузка ZIP запущена. Проверьте, что файл сохранён на устройстве.'},
    en:{title:'Prepare material',tasks:'Preparation tasks',name:'Material title',start:'Prepare and save',resume:'Continue',cancel:'Stop after current step',close:'Close',download:'Download ZIP',open:'Open material',empty:'No unfinished tasks.',note:'A new card and a ZIP package will be prepared. Selected Studio translator: ',cost:'Translation may use your quota. Completed steps are saved on this device.',imported:'Source saved',transcribing:'Recognising speech from the link',transcribed:'Transcript received',binding:'Attaching the video to the card',bound:'Video attached',causeTAB_BACKGROUNDED:'the tab was in the background',causePROVIDER_OVERLOADED:'provider is busy',causeNETWORK:'network failed',causeSERVER_ERROR:'server error',causeJSON_DAMAGED:'damaged answer',detailForeground:'the tab was in the background · come back to it and I carry on',foregroundNote:'Keep this tab in front: Chrome freezes background tabs and cuts the request off. Finished chunks are kept — nothing is paid for twice.',resumeFrom:'Continued from chunk {from} of {of} — earlier work is not paid for again.',resumeRefused:'The previous journal did not fit ({what}) — the table is built from scratch.',resumeRefusedUnknown:'The previous journal did not fit — the table is built from scratch.',fieldtext:'the text changed',fieldsegments:'the utterances changed',fieldmodel:'the model changed',fieldprovider:'the translator changed',fieldchunkSize:'the chunk size changed',titleReady:'✅ Material ready',titleStopped:'⚠️ Run stopped',paidTranscript:'Recognition is already paid for and saved — continuing does not repeat it.',causeYT_OVERLOADED:'provider is busy',causeYT_QUOTA:'rate limited',causeYT_FAILED:'provider error',markDone:'done',markCurrent:'running',markPending:'waiting',markStalled:'stopped',stageImported:'Source',stageTranscribing:'Speech recognition',stageTranslating:'Study table',stageSaved:'Saving the card',stageBound:'Video attached',stageReady:'Package',detailRetry:'{why} · retry in {sec} s (attempt {i} of {n})',detailSlow:'running {time} · longer than usual',detailElapsed:'running {time}',detailWindow:'window {i} of {n} · {time}',detailRows:'{ready} of {total} rows ready · chunk {chunk} of {chunks}',priceFull:'Video {d} · recognition ≈${asr} · table ≈${tlo}–{thi} · total ≈${lo}–{hi}',minutesNote:'usually {n} min',priceNote:'The table price is a range: how many utterances there are is known only after recognition.',price:'Video {d} · speech recognition ≈${p}',parts:'{n} parts',estimating:'Working out the cost…',estimateFailed:'The cost could not be worked out.',retryEstimate:'Try the estimate again',linkNote:'The material is built straight from the link: nothing has to be downloaded.',captionsFree:'If the video has captions of its own, importing them with “Show video” costs nothing.',blindNote:'Some rows have no trustworthy timing — karaoke stays silent there.',unvocalizedNote:'{n} rows without niqqud: the model could not vocalize them without changing the text. The text, translation and transliteration are there.',translating:'Building study table',table_ready:'Table saved',saving:'Saving card',saved:'Card saved',exporting:'Checking package',ready:'Material ready. Download the ZIP and save it in Files.',paused:'Task paused. Source and completed steps are saved.',cancelled:'Task stopped. Continue from the saved step.',stopping:'Stopping after the current step; its result will be saved.',error:'Could not finish this step. Check the selected translator, network and free storage, then continue.',TASK_TABLE_INCOMPLETE:'The table did not come back from the provider. The transcript is kept — press “Continue”; it is not paid for twice.',TASK_TRANSCRIPT_INCOMPLETE:'Recognition returned no text. Press “Continue” to try again.',YT_QUOTA:'The provider rate-limited the key (429). Completed steps are saved — continue in a minute or two.',YT_OVERLOADED:'The provider is busy right now. This passes: press “Continue”.',YT_URL_REJECTED:'The link was not accepted. Private and unlisted videos cannot be used; check the address.',ASR_TRUNCATED:'The recognition answer did not fit in one piece. Continue and the recording is taken in parts.',ASR_BLOCKED:'The provider refused to transcribe this recording.',GEMINI_KEY_REQUIRED:'Your Gemini key is needed — add it in Studio settings.',busy:'Another tab is already preparing a material.',remove:'Remove task from list',missing:'Add text or captions first.',downloaded:'ZIP download started. Check that the file was saved on your device.'},
    he:{title:'הכנת חומר',tasks:'משימות הכנה',name:'שם החומר',start:'הכנה ושמירה',resume:'המשך',cancel:'עצירה אחרי השלב הנוכחי',close:'סגירה',download:'הורדת ZIP',open:'פתיחת החומר',empty:'אין משימות שלא הושלמו.',note:'ייווצר כרטיס חדש ותוכן חבילת ZIP. המתרגם שנבחר בסטודיו: ',cost:'התרגום עשוי לנצל את המכסה שלכם. שלבים שהושלמו נשמרים במכשיר הזה.',imported:'המקור נשמר',transcribing:'מזהים דיבור מתוך הקישור',transcribed:'התמלול התקבל',binding:'מקשרים את הווידאו לכרטיס',bound:'הווידאו קושר',causeTAB_BACKGROUNDED:'הלשונית הייתה ברקע',causePROVIDER_OVERLOADED:'הספק עמוס',causeNETWORK:'הרשת נפלה',causeSERVER_ERROR:'תקלת שרת',causeJSON_DAMAGED:'תשובה פגומה',detailForeground:'הלשונית הייתה ברקע · חזרו אליה ואמשיך',foregroundNote:'השאירו את הלשונית הזאת בחזית: כרום מקפיא לשוניות רקע ומנתק את הבקשה. המקטעים שהושלמו נשמרים — לא משלמים פעמיים.',resumeFrom:'ממשיכים ממקטע {from} מתוך {of} — מה שכבר נעשה לא ישולם שוב.',resumeRefused:'יומן הריצה הקודמת לא התאים ({what}) — הטבלה נבנית מחדש.',resumeRefusedUnknown:'יומן הריצה הקודמת לא התאים — הטבלה נבנית מחדש.',fieldtext:'הטקסט השתנה',fieldsegments:'המשפטים השתנו',fieldmodel:'הדגם השתנה',fieldprovider:'המתרגם השתנה',fieldchunkSize:'גודל המקטע השתנה',titleReady:'✅ החומר מוכן',titleStopped:'⚠️ הריצה נעצרה',paidTranscript:'הזיהוי כבר שולם ונשמר — המשך לא יחזור עליו.',causeYT_OVERLOADED:'הספק עמוס',causeYT_QUOTA:'הגבלת קצב',causeYT_FAILED:'תקלת ספק',markDone:'הושלם',markCurrent:'בעבודה',markPending:'ממתין',markStalled:'נעצר',stageImported:'מקור',stageTranscribing:'זיהוי דיבור',stageTranslating:'טבלת לימוד',stageSaved:'שמירת הכרטיס',stageBound:'קישור הווידאו',stageReady:'חבילה',detailRetry:'{why} · ניסיון חוזר בעוד {sec} שנ׳ (ניסיון {i} מתוך {n})',detailSlow:'בעבודה {time} · יותר מהרגיל',detailElapsed:'בעבודה {time}',detailWindow:'חלון {i} מתוך {n} · {time}',detailRows:'{ready} מתוך {total} שורות מוכנות · מקטע {chunk} מתוך {chunks}',priceFull:'סרטון {d} · זיהוי ≈${asr} · טבלה ≈${tlo}–{thi} · סה\"כ ≈${lo}–{hi}',minutesNote:'בדרך כלל {n} דק׳',priceNote:'מחיר הטבלה הוא טווח: מספר המשפטים ידוע רק אחרי הזיהוי.',price:'סרטון {d} · זיהוי דיבור ≈${p}',parts:'{n} חלקים',estimating:'מחשבים עלות…',estimateFailed:'לא הצלחנו לחשב את העלות.',retryEstimate:'לחשב שוב',linkNote:'החומר נוצר ישירות מהקישור: אין צורך להוריד דבר.',captionsFree:'אם לסרטון יש כתוביות משלו, אפשר לייבא אותן בחינם דרך «הצגת וידאו».',blindNote:'לחלק מהשורות אין תזמון אמין — שם הקריוקי שותק.',unvocalizedNote:'{n} שורות ללא ניקוד: המודל לא הצליח לנקד אותן בלי לשנות את הטקסט. הטקסט, התרגום והתעתיק במקום.',translating:'יוצרים טבלת לימוד',table_ready:'הטבלה נשמרה',saving:'שומרים כרטיס',saved:'הכרטיס נשמר',exporting:'בודקים את החבילה',ready:'החומר מוכן. הורידו ZIP ושמרו אותו בקבצים.',paused:'המשימה הושהתה. המקור והשלבים שהושלמו נשמרו.',cancelled:'המשימה נעצרה. אפשר להמשיך מהשלב שנשמר.',stopping:'המשימה תיעצר אחרי השלב הנוכחי; התוצאה שלו תישמר.',error:'השלב לא הושלם. בדקו את המתרגם שנבחר, הרשת והמקום הפנוי ואז המשיכו.',TASK_TABLE_INCOMPLETE:'הטבלה לא חזרה מהספק. התמלול נשמר — לחצו «המשך», לא ישולם עליו שוב.',TASK_TRANSCRIPT_INCOMPLETE:'הזיהוי לא החזיר טקסט. לחצו «המשך» כדי לנסות שוב.',YT_QUOTA:'הספק הגביל את קצב הבקשות (429). השלבים שהושלמו נשמרו — המשיכו בעוד דקה או שתיים.',YT_OVERLOADED:'הספק עמוס כרגע. זה זמני: לחצו «המשך».',YT_URL_REJECTED:'הקישור לא התקבל. סרטונים פרטיים ולא רשומים אינם נתמכים; בדקו את הכתובת.',ASR_TRUNCATED:'תשובת הזיהוי לא נכנסה בבת אחת. המשיכו וההקלטה תפוענח בחלקים.',ASR_BLOCKED:'הספק סירב לתמלל את ההקלטה הזאת.',GEMINI_KEY_REQUIRED:'נדרש מפתח Gemini שלכם — הוסיפו אותו בהגדרות הסטודיו.',busy:'חומר כבר נמצא בהכנה בלשונית אחרת.',remove:'הסרת המשימה מהרשימה',missing:'הוסיפו קודם טקסט או כתוביות.',downloaded:'הורדת ZIP החלה. ודאו שהקובץ נשמר במכשיר.'}
  };
  Object.assign(words.ru,{geminiRecommended:'Для более качественной учебной таблицы рекомендуем Gemini. Ключ и провайдер настраиваются в «Настройки перевода и таблицы».',geminiRequiredForLink:'Для распознавания видео по ссылке нужен ключ Gemini. Google Translate может переводить готовый текст, но не распознаёт речь из видео.',useGemini:'Использовать Gemini',openTranslationSettings:'Вернуться и настроить Gemini',continueGoogle:'Продолжить с Google Translate'});
  Object.assign(words.en,{geminiRecommended:'For a higher-quality study table, we recommend Gemini. Configure the key and provider in Translation and table settings.',geminiRequiredForLink:'A Gemini key is required to transcribe a linked video. Google Translate can translate prepared text, but cannot recognise speech from the video.',useGemini:'Use Gemini',openTranslationSettings:'Go back and configure Gemini',continueGoogle:'Continue with Google Translate'});
  Object.assign(words.he,{geminiRecommended:'לטבלת לימוד איכותית יותר מומלץ להשתמש ב-Gemini. אפשר להגדיר את המפתח והספק בהגדרות התרגום והטבלה.',geminiRequiredForLink:'נדרש מפתח Gemini כדי לתמלל סרטון מקישור. Google Translate יכול לתרגם טקסט מוכן, אך אינו מזהה דיבור מתוך הסרטון.',useGemini:'שימוש ב-Gemini',openTranslationSettings:'חזרה להגדרת Gemini',continueGoogle:'המשך עם Google Translate'});
  Object.assign(words.ru,{history:'Завершённые материалы',historyNote:'Готовые задачи автоматически переходят в историю и не занимают очередь. Материалы и результаты обработки сохранены.',TASK_SOURCE_MISMATCH:'Источник задачи не совпадает с расшифровкой или карточкой. Сохранение остановлено; полученные результаты сохранены. Проверьте ссылку в задаче.',TASK_STORAGE_UPGRADE_BLOCKED:'Закройте другие вкладки Студии и повторите: обновляется журнал задач.',removeConfirm:'Убрать задачу и её журнал обработки? Сохранённый библиотечный материал останется. Незавершённые результаты этой задачи будут удалены.'});
  Object.assign(words.en,{history:'Completed materials',historyNote:'Completed tasks move to history automatically and free the queue. Materials and processing results are retained.',TASK_SOURCE_MISMATCH:'The task source does not match the transcript or card. Saving stopped; received results are retained. Check the task link.',TASK_STORAGE_UPGRADE_BLOCKED:'Close other Studio tabs and retry: the task journal needs an upgrade.',removeConfirm:'Remove this task and its processing journal? The saved library material will remain. Unfinished results for this task will be deleted.'});
  Object.assign(words.he,{history:'חומרים שהושלמו',historyNote:'משימות שהושלמו עוברות אוטומטית להיסטוריה ומפנות את התור. החומרים ותוצאות העיבוד נשמרים.',TASK_SOURCE_MISMATCH:'מקור המשימה אינו תואם לתמלול או לכרטיס. השמירה נעצרה; התוצאות שהתקבלו נשמרו. בדקו את הקישור במשימה.',TASK_STORAGE_UPGRADE_BLOCKED:'סגרו לשוניות אחרות של הסטודיו ונסו שוב: נדרש עדכון של יומן המשימות.',removeConfirm:'להסיר את המשימה ואת יומן העיבוד שלה? החומר השמור בספרייה יישאר. תוצאות של משימה שלא הושלמה יימחקו.'});
  function sourceLink(parent,input){if(!input.youtube_source)return;const p=element('p'),a=element('a',input.youtube_source.url);a.href=input.youtube_source.url;a.target='_blank';a.rel='noopener noreferrer';a.style.overflowWrap='anywhere';p.append(a);parent.append(p);}
  const t=key=>(words[document.documentElement.lang]||words.ru)[key];
  const recoveryWords={
    ru:{reviewSource:'Проверить расхождения',exportResults:'Скачать исходник и результаты',reviewIntro:'Проверьте перевод по исходной расшифровке. Изменённые строки сохранятся с исходным текстом и проверенным переводом, без неподтверждённых огласовки и транслитерации. Ответ модели останется в журнале. Платных запросов не будет.',sourceOriginal:'Расшифровка',sourceModel:'Ответ модели',reviewTranslation:'Перевод — проверьте и исправьте',reviewConfirmed:'Перевод проверен по расшифровке',applyReview:'Сохранить проверенные строки и продолжить',reviewIncomplete:'Проверьте перевод и подтвердите каждую строку.',recoveredNote:'Исходный текст восстановлен в {n} строках. Ответ модели сохранён в журнале.',recoveryMissing:'Огласовка и транслитерация требуют подготовки в {n} восстановленных строках.',mismatch_input:'Изменились исходные параметры задачи.',mismatch_video:'Видео в расшифровке не совпадает со ссылкой задачи.',mismatch_receipt:'Нарушена целостность сохранённых результатов.',mismatch_table:'Модель изменила текст. Проверьте расхождения, чтобы сохранить результаты без повторного распознавания.',mismatch_mapping:'Не удалось однозначно сопоставить строки с расшифровкой. Скачайте данные для ручного восстановления.',mismatch_saved:'Сохранённая карточка отличается от результатов задачи. Автоматическая перезапись остановлена.',TASK_TRANSLITERATION_RETRY:'Не удалось пересчитать транслитерацию. Продолжите без повторной оплаты распознавания и перевода.'},
    en:{reviewSource:'Review differences',exportResults:'Download source and results',reviewIntro:'Check the translation against the transcript. Changed rows will retain the source text and reviewed translation, without unverified vocalization or transliteration. Model output stays in the journal. No paid requests will run.',sourceOriginal:'Transcript',sourceModel:'Model output',reviewTranslation:'Translation — check and edit',reviewConfirmed:'Translation checked against the transcript',applyReview:'Save reviewed rows and continue',reviewIncomplete:'Check the translation and confirm every row.',recoveredNote:'Source text restored in {n} rows. Model output is retained in the journal.',recoveryMissing:'Vocalization and transliteration need preparation in {n} restored rows.',mismatch_input:'The task input changed.',mismatch_video:'The transcript video differs from the task link.',mismatch_receipt:'Saved result integrity checks failed.',mismatch_table:'The model changed the text. Review differences to save results without repeating recognition.',mismatch_mapping:'Rows could not be matched unambiguously to the transcript. Download the data for manual recovery.',mismatch_saved:'The saved card differs from task results. Automatic overwriting stopped.',TASK_TRANSLITERATION_RETRY:'Transliteration could not be recalculated. Continue without paying again for recognition or translation.'},
    he:{reviewSource:'בדיקת הבדלים',exportResults:'הורדת המקור והתוצאות',reviewIntro:'בדקו את התרגום מול התמלול. שורות שהשתנו יישמרו עם טקסט המקור והתרגום שנבדק, ללא ניקוד או תעתיק שלא אומתו. תשובת המודל נשמרת ביומן. לא יבוצעו בקשות בתשלום.',sourceOriginal:'תמלול',sourceModel:'תשובת המודל',reviewTranslation:'תרגום — בדקו ותקנו',reviewConfirmed:'התרגום נבדק מול התמלול',applyReview:'שמירת השורות שנבדקו והמשך',reviewIncomplete:'בדקו את התרגום ואשרו כל שורה.',recoveredNote:'טקסט המקור שוחזר ב־{n} שורות. תשובת המודל נשמרת ביומן.',recoveryMissing:'נדרשים ניקוד ותעתיק ב־{n} שורות ששוחזרו.',mismatch_input:'נתוני המקור של המשימה השתנו.',mismatch_video:'הסרטון בתמלול אינו תואם לקישור המשימה.',mismatch_receipt:'בדיקות תקינות התוצאות נכשלו.',mismatch_table:'המודל שינה את הטקסט. בדקו את ההבדלים לשמירת התוצאות ללא זיהוי דיבור חוזר.',mismatch_mapping:'לא ניתן לשייך את השורות לתמלול באופן חד־משמעי. הורידו את הנתונים לשחזור ידני.',mismatch_saved:'הכרטיס השמור שונה מתוצאות המשימה. הכתיבה האוטומטית נעצרה.',TASK_TRANSLITERATION_RETRY:'לא ניתן לחשב מחדש את התעתיק. המשיכו ללא תשלום חוזר על זיהוי דיבור ותרגום.'}
  };
  for(const lang of Object.keys(recoveryWords))Object.assign(words[lang],recoveryWords[lang]);
  // ── Модель этапов и живой детали ──
  // Правило одно: показываем ТОЛЬКО то, чему есть знаменатель. У одного ASR-вызова провайдер не
  // отдаёт доли выполненного — там честны лишь номер окна и время, но не проценты. У таблицы
  // знаменатель есть и он уже посчитан чанк-циклом (доказанное покрытие строк) — его и берём.
  const LINK_STAGES=['transcribing','translating','saved','bound'];
  const TEXT_STAGES=['imported','translating','saved','ready'];
  // Куда попадает каждая фаза журнала на шкале этапов.
  const PHASE_AT={imported:0,transcribing:0,transcribed:1,translating:1,table_ready:2,saving:2,saved:3,binding:3,bound:4,exporting:4,ready:4};
  // Время каждого этапа берётся из журнала задачи: он переживает перезагрузку и возобновление,
  // поэтому итог показывает, сколько ЭТАП реально занял, а не сколько открыт диалог.
  function stageElapsedSec(job,key,now){
    const rec=job&&job.stage_times&&job.stage_times[key];
    // Числовая проверка, а не истинность: startedAt=0 — законная метка, и на falsy-проверке
    // часы этапа молча исчезали.
    if(!rec||!Number.isFinite(Number(rec.startedAt)))return null;
    const end=rec.endedAt||now||Date.now();
    return Math.max(0,Math.round((end-rec.startedAt)/1000));
  }
  function stageModel(job,opts){
    const now=(opts&&opts.now)||Date.now();
    const stages=(job&&job.input&&job.input.youtube_source)?LINK_STAGES:TEXT_STAGES;
    const at=PHASE_AT[job&&job.phase];
    const reached=Number.isInteger(at)?at:0;
    const finished=job&&(job.state==='ready'||job.phase==='ready'||job.phase==='bound');
    const stalled=job&&(job.state==='paused'||job.state==='cancelled');
    return stages.map((key,i)=>({
      key,
      label:t('stage'+key.charAt(0).toUpperCase()+key.slice(1)),
      mark:mark(i),
      markLabel:t('mark'+mark(i).charAt(0).toUpperCase()+mark(i).slice(1)),
      elapsedSec:stageElapsedSec(job,key,now),
      elapsedText:stageElapsedSec(job,key,now)==null?null:clockShort(stageElapsedSec(job,key,now)),
    }));
    function mark(i){return finished?'done':i<reached?'done':i===reached?(stalled?'stalled':'current'):'pending';}
  }
  // Цена качества объявляется там же, где успех: пробел допустим, молчание о нём — нет.
  function qualityNotes(job){
    const rows=(job&&job.table&&job.table.rows)||[];
    const restored=rows.filter(r=>r&&r.source_recovery),notes=[];
    const timingCoverage=job?.transcript?.timing?.diagnosis?.coverage;
    if(timingCoverage&&timingCoverage.playable<timingCoverage.total){
      const messages={ru:'Воспроизведение доступно для {n} из {total} реплик. Для остальных нужна проверенная разметка времени.',en:'Replay is available for {n} of {total} utterances. The rest need verified timing.',he:'הפעלה זמינה ל־{n} מתוך {total} קטעים. לשאר נדרש תזמון בדוק.'};
      notes.push(fill(messages[document.documentElement.lang]||messages.ru,{n:timingCoverage.playable,total:timingCoverage.total}));
    }
    if(job&&job.transcript&&job.transcript.blind){
      const timing=job.transcript.timing||{};
      const text={
        ru:'Видео и таблица сохранены, но повторение строк недоступно: таймкоды распознавания не прошли проверку. Для синхронизации нужна проверенная разметка времени. Повторное распознавание автоматически не запускается.',
        en:'Video and table are saved, but row replay is unavailable: recognition timestamps failed validation. Synchronization needs verified timestamps. Recognition will not restart automatically.',
        he:'הסרטון והטבלה נשמרו, אך הפעלת שורות אינה זמינה: חותמות הזמן לא עברו בדיקה. לסנכרון נדרשים זמנים בדוקים. זיהוי הדיבור לא יופעל שוב אוטומטית.'
      };
      notes.push(text[document.documentElement.lang]||text.ru);
      if(Number.isFinite(timing.medianErrorSec)){
        const detail={ru:'Проверка: {n} совпавших фрагментов; медианное расхождение {sec} с. Это не рекомендуемое смещение.',en:'Check: {n} matching excerpts; median discrepancy {sec} s. This is not a recommended offset.',he:'בדיקה: {n} קטעים תואמים; הפרש חציוני {sec} שניות. זה אינו היסט מומלץ.'};
        notes.push(fill(detail[document.documentElement.lang]||detail.ru,{n:timing.matched||0,sec:Math.abs(timing.medianErrorSec)}));
      }
    }
    const n=rows.filter(r=>r&&r.niqqud_status==='not_vocalized'&&!r.source_recovery).length;
    if(n)notes.push(fill(t('unvocalizedNote'),{n}));
    if(restored.length)notes.push(fill(t('recoveredNote'),{n:restored.length}));
    const missing=restored.filter(r=>!r.he_niqqud||!r.translit).length;
    if(missing)notes.push(fill(t('recoveryMissing'),{n:missing}));
    return notes;
  }
  function clockShort(sec){const s=Math.max(0,Math.round(Number(sec)||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
  function liveDetail(job,live){
    const l=live||{},phase=job&&job.phase;
    // Молчаливый повтор перестаёт быть молчаливым: у ожидания есть причина, номер попытки и срок.
    if(l.retry&&(phase==='transcribing'||phase==='translating')){
      // Замороженную вкладку не лечит ожидание: пока её не вернут на передний план, ждать нечего.
      if(l.retry.needsForeground)return {percent:null,text:t('detailForeground')};
      const dict=words[document.documentElement.lang]||words.ru;
      const why=dict['cause'+l.retry.code]||dict.causeYT_FAILED;
      return {percent:null,text:fill(t('detailRetry'),{i:l.retry.attempt,n:l.retry.attempts,sec:l.retry.waitSec,why})};
    }
    if(phase==='transcribing'&&l.asr){
      const total=Number(l.asr.total)||1,index=(Number(l.asr.index)||0)+1;
      const elapsed=clockShort(l.asr.elapsedSec);
      // Внутри окна долей нам никто не сообщает, но ЗАКОНЧЕННЫЕ окна — настоящий знаменатель.
      // У единственного окна шкалы нет, и рисовать её было бы выдумкой.
      const percent=total>1?Math.round((Number(l.asr.index)||0)*100/total):null;
      return {percent,text:total>1?fill(t('detailWindow'),{i:index,n:total,time:elapsed}):fill(t('detailElapsed'),{time:elapsed})};
    }
    if(phase==='translating'&&l.table){
      const ready=Number(l.table.readyRows)||0,total=Number(l.table.totalRows)||0;
      const percent=total>0?Math.round(ready*100/total):null;
      // Номер куска телеметрия отдаёт уже 1-based — прибавлять нечего. Зажимаем в диапазон,
      // потому что стартовый снимок из кеша приходит 0-based и «кусок 0» читался бы бессмыслицей.
      const chunks=Number(l.table.chunks)||1;
      const chunk=Math.min(Math.max(1,Number(l.table.chunk)||1),chunks);
      return {percent,text:fill(t('detailRows'),{ready,total,chunk,chunks})};
    }
    // Пока провайдер не прислал ни одного сигнала, единственная честная динамика — время работы.
    if(job&&job.state==='running'&&l.elapsedSec!=null){
      // Оценка времени — обещание. Когда прогон его перерос, экран обязан сказать это сам. Пока
      // прогон укладывается — молчим: голое время уже показано часами самого этапа.
      const slow=l.expectedSec&&l.elapsedSec>Number(l.expectedSec);
      return slow?{percent:null,text:fill(t('detailSlow'),{time:clockShort(l.elapsedSec)})}:{percent:null,text:''};
    }
    return {percent:null,text:''};
  }
  // Возобновляемая задача обязана сказать, что уже оплачено: иначе «Продолжить» выглядит как
  // «заплатить снова», и человек тянет с решением или начинает заново то, что уже куплено.
  function paidNotes(job){
    if(!job||job.state==='ready'||job.phase==='ready')return [];
    const t2=job.transcript;
    if(!t2||!String(t2.text||'').trim())return [];
    return [t('paidTranscript')];
  }
  // ── A: готовность видна, даже когда на вкладку не смотрят ──
  // Заголовок вкладки — чужая собственность: трогаем его ТОЛЬКО пока вкладка скрыта, и
  // возвращаем прежний, как только человек вернулся. Иначе наш след остаётся жить в его окне.
  function titleNotice(job){
    if(!job)return null;
    if(job.state==='ready'||job.phase==='ready')return t('titleReady');
    if(job.state==='paused'||job.state==='cancelled'||job.error)return t('titleStopped');
    return null;
  }
  let titleRestore=null;
  function applyTitleNotice(doc,job){
    const d=doc||(typeof document!=='undefined'?document:null);
    if(!d)return;
    const notice=titleNotice(job);
    const hidden=d.hidden===true||d.visibilityState==='hidden';
    if(!notice||!hidden)return;
    if(titleRestore)return;                       // уже объявлено — второй раз не наслаиваем
    const original=String(d.title||'');
    titleRestore=()=>{
      d.title=original;titleRestore=null;
      if(typeof d.removeEventListener==='function')d.removeEventListener('visibilitychange',onVisible);
    };
    function onVisible(){ if(d.hidden!==true&&d.visibilityState!=='hidden'&&titleRestore)titleRestore(); }
    d.title=notice+' · '+original;
    if(typeof d.addEventListener==='function')d.addEventListener('visibilitychange',onVisible);
  }
  // Возобновление обязано отчитаться. Молчаливый отказ журнала = уже оплаченные куски считаются
  // заново, и на экране это неотличимо от обычного старта (разбор прогона владельца 2026-09-11).
  function resumeNote(live){
    const r=(live||{}).resume;
    if(!r)return '';
    if(Number(r.from)>0)return fill(t('resumeFrom'),{from:Number(r.from),of:Number(r.of)||0});
    if(!r.reason||r.reason==='NO_JOURNAL')return '';   // журнала не было — сообщать не о чем
    const changed=Array.isArray(r.changed)?r.changed.map(key=>t('field'+key)).filter(Boolean):null;
    return changed&&changed.length?fill(t('resumeRefused'),{what:changed.join(', ')}):t('resumeRefusedUnknown');
  }
  // Требование среды, а не пожелание: Chrome замораживает фоновую вкладку и обрывает висящий
  // запрос. Говорим об этом ДО трат и только там, где сборка действительно длинная.
  function foregroundNote(estimate){
    const chunks=Number(estimate&&estimate.table&&estimate.table.chunks)||0;
    return chunks>1?t('foregroundNote'):'';
  }
  function fill(template,values){return String(template||'').replace(/\{(\w+)\}/g,(m,k)=>values[k]==null?m:String(values[k]));}
  // Живой прогресс приходит СОБЫТИЯМИ от тех, кто его действительно считает: ASR-модуль знает
  // номер окна, чанк-цикл таблицы — доказанное покрытие строк. Второго счётчика не заводим.
  let liveState={},liveTimer=null,liveDialog=null;
  // Вердикт журнала переживает конец прогона: это итог, а не мгновенный сигнал прогресса —
  // человек должен видеть «продолжено с куска N» и на готовом экране. Гасится он только
  // стартом СЛЕДУЮЩЕГО прогона, у которого будет свой вердикт.
  function liveReset(){const keep=liveState.expectedSec,resume=liveState.resume;liveState={};if(keep)liveState.expectedSec=keep;if(resume)liveState.resume=resume;if(liveTimer){clearInterval(liveTimer);liveTimer=null;}}
  // Ретрай гасим и при получении любого следующего сигнала прогресса.
  // ВСЕГДА перерисовываем из САМОГО СВЕЖЕГО состояния задачи (d.__job обновляет showTask на каждом
  // переходе фазы). Наблюдение 2026-09-11: таймер держал объект, захваченный ДО старта прогона, и
  // четыре минуты работы выглядели на экране как «остановлено» с пустой строкой под этапами.
  function liveRepaint(){
    if(!liveDialog||!liveDialog.isConnected||!liveDialog.__paintStages||!liveDialog.__job)return;
    liveDialog.__paintStages(liveDialog.__job,liveState);
  }
  function liveAttach(d){
    liveDialog=d;liveState.startedAt=Date.now();
    if(liveTimer)clearInterval(liveTimer);
    // Секундомер — единственная честная «динамика» там, где провайдер долей не сообщает.
    liveTimer=setInterval(()=>{
      const sec=Math.round((Date.now()-liveState.startedAt)/1000);
      liveState.elapsedSec=sec;
      if(liveState.asr)liveState.asr.elapsedSec=sec;
      if(liveState.table)liveState.table.elapsedSec=sec;
      if(liveState.retry){
        liveState.retry.waitSec=Math.max(0,Math.round((liveState.retry.until-Date.now())/1000));
        if(liveState.retry.waitSec<=0)liveState.retry=null;
      }
      liveRepaint();
    },1000);
  }
  function onAsrProgress(event){
    const at=event.detail&&event.detail.at;
    if(!at)return;
    liveState.retry=null;
    liveState.asr={index:Number(at.index)||0,total:Number(at.total)||1,elapsedSec:liveState.asr?liveState.asr.elapsedSec:0};
    liveState.startedAt=liveState.startedAt||Date.now();
    liveRepaint();
  }
  function onTableProgress(event){
    const s2=event.detail||{};
    liveState.retry=null;
    liveState.table={chunk:Number(s2.chunk)||0,chunks:Number(s2.chunks)||1,
      readyRows:Number(s2.readyRows)||0,totalRows:Number(s2.totalRows)||0,elapsedSec:liveState.table?liveState.table.elapsedSec:0};
    liveRepaint();
  }
  function onRetry(event){
    const r=event.detail&&event.detail.at;
    if(!r)return;
    liveState.retry={code:String(r.code||''),attempt:Number(r.attempt)||1,attempts:Number(r.attempts)||1,
      needsForeground:!!r.needsForeground,
      until:Date.now()+(Number(r.waitMs)||0),waitSec:Math.round((Number(r.waitMs)||0)/1000)};
    liveRepaint();
  }
  // Вердикт журнала таблицы: продолжили с куска N либо журнал не подошёл и почему.
  function onResume(event){
    const r=event.detail&&event.detail.at;
    if(!r)return;
    liveState.resume={from:Number(r.from)||0,of:Number(r.of)||0,reason:r.reason||null,
      changed:Array.isArray(r.changed)?r.changed.slice():null};
    liveRepaint();
  }
  if(typeof window!=='undefined'&&window.addEventListener){
    window.addEventListener('youtube-asr-retry',onRetry);
    window.addEventListener('youtube-asr-progress',onAsrProgress);
    window.addEventListener('table-job-progress',onTableProgress);
    window.addEventListener('table-job-retry',onRetry);
    window.addEventListener('table-job-resume',onResume);
  }
  function ready(){if(!operations)throw new Error('TASK_UI_NOT_READY');if(!store){store=LearningMaterialTask.createStore();runner=LearningMaterialTask.createRunner(store,operations);}return store;}
  function element(tag,content){const el=document.createElement(tag);if(content)el.textContent=content;return el;}
  function dialog(title){if(currentDialog)currentDialog.close();const d=element('dialog');d.className='study-source-dialog';d.setAttribute('aria-label',title);d.append(element('h2',title));const focus=document.activeElement;d.addEventListener('close',()=>{d.remove();if(currentDialog===d)currentDialog=null;if(focus&&focus.isConnected)focus.focus();});document.body.append(d);d.showModal();currentDialog=d;return d;}
  function button(parent,label,fn){const b=element('button',label);b.type='button';b.onclick=fn;parent.append(b);return b;}
  async function showTask(job,d){
    d=d||dialog(t('title'));d.replaceChildren(element('h2',job.input.title));sourceLink(d,job.input);
    const status=element('p',job.state==='running'?'':t(job.state));status.setAttribute('role','status');d.append(status);
    // Этапы с состояниями и живая деталь ТЕКУЩЕГО этапа. Полоса рисуется только когда у
    // прогресса есть настоящий знаменатель (доказанные строки таблицы); у одного ASR-вызова его
    // нет, и придумывать проценты там нельзя — это то же враньё, что и подделанные метки.
    const steps=element('ol');steps.className='lmt-stages';
    const detail=element('p');detail.className='lmt-detail';detail.setAttribute('role','status');
    const bar=document.createElement('progress');bar.className='lmt-bar';bar.max=100;bar.hidden=true;
    // Отдельная строка под деталью: вердикт журнала живёт весь прогон, а деталь перерисовывается
    // каждым сигналом прогресса и стёрла бы его через секунду.
    const resumed=element('p');resumed.className='lmt-resume-note';resumed.hidden=true;
    function paintStages(current,live){
      steps.replaceChildren();
      for(const stage of stageModel(current)){
        const li=element('li',stage.label);li.dataset.mark=stage.mark;
        // Часы этапа стоят рядом с самим этапом: и пока он идёт, и когда закончился.
        if(stage.elapsedText){const clk=element('span',stage.elapsedText);clk.className='lmt-stage-clock';li.append(clk);}
        const word=element('span',stage.markLabel);word.className='lmt-mark-word';li.append(word);
        li.setAttribute('aria-current',stage.mark==='current'?'step':'false');
        steps.append(li);
      }
      const info=liveDetail(current,live||{});
      detail.textContent=info.text||'';
      const note=resumeNote(live||{});
      resumed.textContent=note;resumed.hidden=!note;
      if(info.percent==null){bar.hidden=true;bar.removeAttribute('value');}
      else{bar.hidden=false;bar.value=info.percent;bar.textContent=info.percent+'%';}
    }
    paintStages(job,liveState);
    d.append(steps,detail,bar,resumed);
    d.__paintStages=paintStages;d.__job=job;
    // Отозванные часы — факт материала, а не деталь прогона: он виден там же, где итог.
    for(const note of paidNotes(job)){const q=element('p',note);q.className='lmt-paid-note';d.append(q);}
    for(const note of qualityNotes(job)){const q=element('p',note);q.className='lmt-quality-note';d.append(q);}
    const asrFailure=job.asr_checkpoint&&job.asr_checkpoint.failure;
    const recoverableOther=job.error==='ASR_BLOCKED'&&asrFailure&&asrFailure.provider_detail
      &&(asrFailure.provider_detail.finish_reason==='OTHER'||asrFailure.provider_detail.block_reason==='OTHER')
      &&!['SAFETY','PROHIBITED_CONTENT','BLOCKLIST','SPII','RECITATION'].includes(asrFailure.provider_detail.finish_reason)
      &&!['SAFETY','PROHIBITED_CONTENT','BLOCKLIST','SPII','RECITATION'].includes(asrFailure.provider_detail.block_reason);
    const alternateAvailable=job.error==='ASR_OTHER_EXHAUSTED'&&asrFailure&&asrFailure.failed_window
      &&!(job.asr_checkpoint.alternate_attempts||[]).some(item=>JSON.stringify(item.window)===JSON.stringify(asrFailure.failed_window)&&item.index===asrFailure.index);
    if(job.error){const named=alternateAvailable?({ru:'Gemini не распознал даже короткий фрагмент. Готовые части сохранены; можно один раз попробовать другую модель только для этого фрагмента.',en:'Gemini could not recognize even a short clip. Completed parts are saved; another model can be tried once for this clip only.',he:'Gemini לא הצליח לתמלל גם מקטע קצר. החלקים שהושלמו נשמרו; אפשר לנסות מודל אחר פעם אחת רק למקטע זה.'}[document.documentElement.lang]||''):recoverableOther?({ru:'Gemini остановил распознавание без указания причины. Готовые окна сохранены; продолжим с разделением проблемного фрагмента.',en:'Gemini stopped recognition without a specific reason. Completed windows are saved; continue by splitting only the failed section.',he:'Gemini עצר את התמלול בלי לציין סיבה. המקטעים שהושלמו נשמרו; נמשיך בחלוקת המקטע שנכשל.'}[document.documentElement.lang]||''):t('mismatch_'+job.error_reason)||(words[document.documentElement.lang]||words.ru)[job.error];const error=element('p',named||t('error'));error.setAttribute('role','alert');d.append(error);if(job.error==='ASR_BLOCKED'&&!recoverableOther){const hint=element('p',({ru:'Повтор этого же запроса отключён: он снова потратит квоту и получит тот же отказ. Используйте подготовленную MP4-копию через «С устройства».',en:'Repeating the same request is disabled: it would spend quota again and receive the same refusal. Use the prepared MP4 copy via “From device”.',he:'הפעלה חוזרת של אותה בקשה הושבתה: היא תצרוך שוב מכסה ותקבל אותה סירוב. השתמשו בעותק MP4 המוכן דרך „מהמכשיר”.'}[document.documentElement.lang]||''));hint.className='lmt-quality-note';d.append(hint);}const details=element('details');const failure=asrFailure;const provider=failure&&failure.provider_detail;const diagnostic=job.error+(job.error_reason?': '+job.error_reason:'')+(provider&&(provider.block_reason||provider.finish_reason)?' · '+(provider.block_reason||provider.finish_reason):'');details.append(element('summary',({ru:'Подробности',en:'Details',he:'פרטים'})[document.documentElement.lang]||'Details'),element('code',diagnostic));d.append(details);}
    const actions=element('div');actions.className='study-source-actions';d.append(actions);
    if(runner.isRunning(job.id))button(actions,t('cancel'),async()=>{await runner.cancel(job.id);status.textContent=t('stopping');});
    // A provider policy/safety block is terminal for this exact URL. Re-running the same paid
    // request cannot heal it; completed ASR windows remain exportable in the task checkpoint.
    else if(job.state!=='ready'&&(job.error!=='ASR_BLOCKED'||recoverableOther)&&(job.error!=='ASR_OTHER_EXHAUSTED'||alternateAvailable)&&!(job.error==='TASK_SOURCE_MISMATCH'&&job.error_reason))button(actions,t('resume'),()=>execute(job.id,d));
    if(job.error==='TASK_SOURCE_MISMATCH'&&!runner.isRunning(job.id)){
      if(!job.error_reason||job.error_reason==='table')button(actions,t('reviewSource'),()=>showSourceReview(job.id,d));
    }
    if(job.transcript||job.table)button(actions,t('exportResults'),()=>{
      const blob=new Blob([JSON.stringify(LearningMaterialTask.safe(job),null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='material-task-'+job.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    if(job.package){button(actions,t('download'),async()=>{try{await operations.download(job);status.textContent=t('downloaded');}catch(_){status.textContent=t('error');}});}
    if(job.saved_text_id)button(actions,t('open'),async()=>{try{await operations.openMaterial(job);d.close();}catch(_){status.textContent=t('error');}});
    if(job.saved_text_id&&job.transcript?.timing?.verdict!=='verified'&&window.StudyTimingRepair)button(actions,
      ({ru:'Восстановить синхронизацию',en:'Restore synchronization',he:'שחזור סנכרון'}[document.documentElement.lang]||'Restore synchronization'),()=>StudyTimingRepair.open(job.saved_text_id));
    if(!runner.isRunning(job.id)){button(actions,t('close'),()=>d.close());button(actions,t('remove'),async()=>{if(!window.confirm(t('removeConfirm')))return;await store.remove(job.id);await list(d);});}
    // Итог объявляется ОДИН раз и только скрытой вкладке (см. applyTitleNotice).
    try{applyTitleNotice(document,job);}catch(_){}
    d.oncancel=event=>{if(runner.isRunning(job.id))event.preventDefault();};
    return d;
  }
  async function execute(id,d){
    ready();
    const work=async lock=>{
      if(!lock){d.append(element('p',t('busy')));return;}
      liveReset();liveState.resume=null;liveAttach(d);
      try{const job=await runner.run(id,next=>{if(d.isConnected)showTask(next,d);});await showTask(job,d);}
      catch(_){await showTask(await store.get(id),d);}
      finally{liveReset();if(d.isConnected&&d.__job)showTask(d.__job,d);}
    };
    // Studio globals cannot run two independent table jobs concurrently.
    if(navigator.locks)await navigator.locks.request('linguistpro-material-preparation',{ifAvailable:true},work);
    else await work(true);
  }
  async function showSourceReview(id,d){
    const job=await store.get(id);
    let review;
    try{review=await LearningMaterialTask.sourceReview(job);}catch(_){d.append(element('p',t('mismatch_mapping')));return;}
    if(!review.groups.length)return;
    d.replaceChildren(element('h2',t('reviewSource')),element('p',t('reviewIntro')));
    const fields=[];
    for(const group of review.groups){
      const section=element('fieldset'),legend=element('legend',String(group.segment_index+1));section.append(legend);
      section.style.minWidth='0';
      for(const [label,text]of [[t('sourceOriginal'),group.source],[t('sourceModel'),group.rows.map(r=>r.he).join('\n')]]){
        const p=element('p',text);p.dir='rtl';p.style.overflowWrap='anywhere';section.append(element('strong',label),p);
      }
      const label=element('label',t('reviewTranslation')),translation=element('textarea');
      translation.value=group.rows.map(r=>r.ru||'').join('\n');translation.rows=4;translation.style.width='100%';translation.style.boxSizing='border-box';translation.dir='auto';label.append(translation);
      const confirmed=element('input');confirmed.type='checkbox';const check=element('label');check.append(confirmed,document.createTextNode(t('reviewConfirmed')));
      section.append(label,check);d.append(section);fields.push({group,translation,confirmed});
    }
    const status=element('p');status.setAttribute('role','alert');d.append(status);
    const actions=element('div');actions.className='study-source-actions';d.append(actions);
    button(actions,t('applyReview'),async()=>{
      if(fields.some(f=>!f.confirmed.checked||!f.translation.value.trim())){status.textContent=t('reviewIncomplete');return;}
      const work=async lock=>{
        if(!lock){status.textContent=t('busy');return;}
        const current=await store.get(id),before=JSON.stringify(current);
        const table=await LearningMaterialTask.applySourceReview(current,review,fields.map(f=>({segment_index:f.group.segment_index,ru:f.translation.value,confirmed:f.confirmed.checked})));
        await store.update(id,old=>{if(JSON.stringify(old)!==before)throw new Error('TASK_SOURCE_MISMATCH');return {...old,table,error:null,error_reason:null};});
      };
      try{
        let applied=false;
        const apply=async lock=>{await work(lock);applied=!!lock;};
        if(navigator.locks)await navigator.locks.request('linguistpro-material-preparation',{ifAvailable:true},apply);else await apply(true);
        if(applied)await execute(id,d);
      }catch(_){status.textContent=t('mismatch_receipt');}
    });
    button(actions,t('close'),()=>showTask(job,d));
    fields[0]?.translation.focus();
  }
  // Одна строка сметы на всех потребителей: цена, объём и ОЖИДАЕМОЕ ВРЕМЯ. Человек, которому
  // предстоит ждать минуты, имеет право знать сколько — это такая же часть согласия, как цена.
  function quoteLine(e){
    const base=e.table
      ? fill(t('priceFull'),{d:clock(e.durationSec),asr:money(e.estimatedUsd),
          tlo:money(e.table.lowUsd),thi:money(e.table.highUsd),
          lo:money(e.estimatedUsd+e.table.lowUsd),hi:money(e.estimatedUsd+e.table.highUsd)})
      : fill(t('price'),{d:clock(e.durationSec),p:money(e.estimatedUsd)});
    const timing=e.timingQuote?({ru:' · включая проверку времени в начале, середине и конце',en:' · includes timing checks at the start, middle and end',he:' · כולל בדיקת תזמון בהתחלה, באמצע ובסוף'}[document.documentElement.lang]||''):'';
    return (e.minutes ? base+' · '+fill(t('minutesNote'),{n:e.minutes}) : base)+timing;
  }
  function money(usd){return (usd<0.01?usd.toFixed(4):usd.toFixed(2));}
  function clock(sec){const s=Math.max(0,Math.round(sec||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
  function geminiRecommendation(provider,hasKey,link){
    if(!link||provider==='gemini'||(hasKey&&provider!=='google-free'))return null;
    return {canContinue:!!hasKey,message:hasKey?t('geminiRecommended'):t('geminiRequiredForLink')};
  }
  function confirmGeminiRecommendation(){
    return new Promise(resolve=>{
      const d=dialog(t('title'));
      const notice=element('p',t('geminiRecommended'));notice.className='lmt-provider-recommendation';notice.setAttribute('role','alert');d.append(notice);
      const actions=element('div');actions.className='study-source-actions';d.append(actions);
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;d.close();resolve(value);};
      button(actions,t('useGemini'),()=>finish('gemini'));
      button(actions,t('continueGoogle'),()=>finish('google-free'));
      button(actions,t('openTranslationSettings'),()=>finish('settings'));
      d.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    });
  }
  async function start(capturedInput){
    ready();const input=JSON.parse(JSON.stringify(capturedInput||operations.capture())),d=dialog(t('title'));
    const link=input.youtube_source || null;
    if(!input.source_text && !link){d.append(element('p',t('missing')));button(d,t('close'),()=>d.close());return;}
    const title=element('input');title.type='text';title.maxLength=160;title.value=input.title || '';
    const label=element('label',t('name'));label.append(title);d.append(label);sourceLink(d,input);
    // Порядок экрана: имя → ЦЕНА → действие → пояснения. Раньше решающая кнопка пряталась под
    // четырьмя абзацами прозы, и на 380 px до неё надо было доскроллить (наблюдение 2026-09-11).
    const actions=element('div');actions.className='study-source-actions';d.append(actions);
    const notes=element('div');notes.className='lmt-notes';
    notes.append(element('p',t('note')+input.provider),element('p',t('cost')));
    if(link)notes.append(element('p',t('linkNote')),element('p',t('captionsFree')));
    d.append(notes);
    const startButton=button(actions,t('start'),async()=>{startButton.disabled=true;try{const job=await LearningMaterialTask.create({...input,title:title.value,table_quote:quoted,timing_quote:timingQuoted});await store.add(job);liveState.expectedSec=expectedSec;await execute(job.id,d);}catch(error){const message=element('p',t(error.code||error.message)||t('error'));message.setAttribute('role','alert');d.append(message);startButton.disabled=false;}});
    button(actions,t('close'),()=>d.close());title.focus();
    const recommendation=geminiRecommendation(input.provider,!!(operations.hasGeminiKey&&operations.hasGeminiKey()),link);
    if(recommendation){
      const notice=element('p',recommendation.message);notice.className='lmt-provider-recommendation';notice.setAttribute('role','alert');d.insertBefore(notice,actions);
      if(recommendation.canContinue){
        startButton.textContent=t('continueGoogle');
        const use=button(actions,t('useGemini'),async()=>{use.disabled=true;try{
          await operations.selectGemini();
          const selected=operations.capture();
          // The import modal has already cleared its temporary YouTube link. Keep
          // this dialog's source and edited title; only refresh provider settings.
          d.close();await start({...input,title:title.value,provider:selected.provider,model:selected.model});
        }catch(_){use.disabled=false;}});
        actions.insertBefore(use,startButton);
      }else{
        startButton.disabled=true;
        const settings=button(actions,t('openTranslationSettings'),()=>{d.close();operations.openTranslationSettings();});
        actions.insertBefore(settings,startButton);
      }
    }
    // Платный шаг не начинается вслепую: пока цена не показана, «Подготовить» недоступно. Смета
    // берётся бесплатным countTokens, поэтому сам показ цены ничего не стоит.
    let quoted=null,timingQuoted=null,expectedSec=null;
    if(link){
      const price=element('p','');price.setAttribute('role','status');d.insertBefore(price,actions);
      const retry=button(actions,t('retryEstimate'),()=>quote());retry.hidden=true;
      async function quote(){
        startButton.disabled=true;retry.hidden=true;price.textContent=t('estimating');delete price.dataset.code;
        try{
          const e=await operations.estimate(input);
          quoted=e.table||null;timingQuoted=e.timingQuote||null;expectedSec=e.minutes?e.minutes*60:null;
          // Обе цены сразу — именно этот показ снимает второй window.confirm посреди прогона.
          price.textContent=quoteLine(e);
          if(e.table&&!d.querySelector('.lmt-price-note')){const n=element('p',t('priceNote'));n.className='lmt-price-note';d.insertBefore(n,actions);}
          // Требование среды говорится ДО трат и рядом с ценой, а не в сноске после сбоя.
          const front=foregroundNote(e);
          if(front&&!d.querySelector('.lmt-foreground-note')){const f=element('p',front);f.className='lmt-foreground-note';d.insertBefore(f,actions);}
          if(e.windows>1)price.textContent+=' · '+fill(t('parts'),{n:e.windows});
          startButton.disabled=!!(recommendation&&!recommendation.canContinue);
        }catch(error){
          price.textContent=t('estimateFailed');price.dataset.code=error.code || error.message;retry.hidden=false;
        }
      }
      quote();
    }
  }
  async function list(d){
    ready();d=d||dialog(t('tasks'));d.replaceChildren(element('h2',t('tasks')));
    const jobs=await store.list();if(!jobs.length)d.append(element('p',t('empty')));
    const add=(parent,job)=>{const item=element('p');button(item,job.input.title+' · '+t(job.state),()=>showTask(job,d));parent.append(item);};
    jobs.forEach(job=>add(d,job));
    d.append(element('p',t('historyNote')));
    const history=element('details');history.append(element('summary',t('history')));d.append(history);
    history.addEventListener('toggle',async()=>{if(!history.open||history.dataset.loaded)return;
      try{const completed=await store.listCompleted();completed.forEach(job=>add(history,job));history.dataset.loaded='true';}
      catch(_){history.append(element('p',t('error')));}
    });
    button(d,t('close'),()=>d.close());
  }
  function labels(){const start=document.getElementById('v3ImportPrepareTask');if(start)start.textContent=t('start');const tasks=document.getElementById('v3LearningTasks');if(tasks)tasks.textContent=t('tasks');}
  window.LearningMaterialTaskUI={configure:value=>{operations=value;},start,list,labels,stageModel,liveDetail,quoteLine,geminiRecommendation,confirmGeminiRecommendation,qualityNotes,resumeNote,foregroundNote,paidNotes,titleNotice,applyTitleNotice};
  document.addEventListener('DOMContentLoaded',labels);document.addEventListener('i18n:changed',labels);
})();
