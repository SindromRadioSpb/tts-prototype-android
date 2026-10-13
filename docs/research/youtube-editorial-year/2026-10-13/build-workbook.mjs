import fs from 'node:fs/promises';
import path from 'node:path';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const out=root;
const d=JSON.parse(await fs.readFile(path.join(root,'research-data.json'),'utf8'));
const wb=Workbook.create();
const names=['Обзор','365 дней','Выбор редактора','Подборки','Видео','Исключения','Методика'];
const sheets=Object.fromEntries(names.map(n=>[n,wb.worksheets.add(n)]));
const col=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
const date=s=>s?(Date.parse(s.slice(0,10)+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000:null;
const color={navy:'#203A59',blue:'#EAF1FA',amber:'#FFF2CC',ink:'#182B40',muted:'#556779',line:'#DCE5EF'};
function table(name,title,headers,rows,widths,longCols=[]){
 const s=sheets[name],last=rows.length+6,end=col(headers.length);
 console.log('BUILD',name,rows.length);
 s.showGridLines=false;s.getRange(`A2:${end}${last}`).format.font={name:'Arial',size:10,color:color.ink};
 s.getRange('A2').values=[[title]];s.getRange('A2').format.font={name:'Arial',size:14,bold:true,color:color.navy};
 s.getRange(`A4:${end}4`).format.borders={bottom:{style:'thin',color:color.line}};
 s.getRange(`A6:${end}6`).values=[headers];s.getRange(`A7:${end}${last}`).values=rows;
 const nativeTable=s.tables.add(`A6:${end}${last}`,true,'Research'+names.indexOf(name));nativeTable.style='TableStyleMedium2';
 s.getRange(`A6:${end}6`).format={fill:color.navy,font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:44,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center'};
 s.getRange(`A7:${end}${last}`).format.rowHeight=60;s.getRange(`A7:${end}${last}`).format.verticalAlignment='top';
 for(let i=0;i<headers.length;i++){s.getRange(`${col(i+1)}6:${col(i+1)}${last}`).format.columnWidth=widths[i]||20;}
 for(const c of longCols)s.getRange(`${c}7:${c}${last}`).format.wrapText=true;
 s.freezePanes.freezeRows(6);s.freezePanes.freezeColumns(name==='Видео'?2:1);
 return {s,last};
}
const vh=['YouTube ID','Название оригинала','Тема','Формат','Кому интересно — гипотеза','Уровень — гипотеза','Полная длительность, мин','Просмотры','Точность просмотров','Просмотры в списке','Медиана выборки цикла','× медианы цикла','Почему выбрать — гипотеза','Учебный сценарий','Чувствительность / ограничения','Полный выпуск или фрагмент','Есть в публичном каталоге','Основная подборка ID','Все подборки ID','Канал','Ссылка на видео','Метаданные проверены','Дата загрузки','Язык по метаданным','Дорожка HE','Встраивание по метаданным','Глубина проверки','Средние просмотры / день за весь срок','Решение редактора','Плеер проверен','Речь HE проверена','Текст и тайминг проверены','Основание использования проверено','Учебный пакет проверен','Готовность к публикации','Заметка редактора','Источник списка','Позиция в исходном списке','Номер серии','Возрастной флаг YouTube'];
const sorted=[...d.videos].sort((a,b)=>a.collection_id.localeCompare(b.collection_id)||(a.episode_no||a.source_position)-(b.episode_no||b.source_position));
const byId=Object.fromEntries(sorted.map(v=>[v.video_id,v]));
const jobs=Object.fromEntries(d.collections.map(j=>[j.id,j]));
const vr=sorted.map(v=>[v.video_id,v.title,v.topic,v.format,v.segment,v.level,v.duration_seconds?Math.round(v.duration_seconds/6)/10:null,v.views,v.views_kind,v.list_views,v.median_sample_views,null,v.video_why,v.task,v.risk,v.part,v.published_match?'Да':'Нет',v.collection_id,v.collections.join(', '),v.channel,v.url,date(v.checked_at),date(v.upload_date),v.language,v.subtitles,v.embed,v.evidence,null,'Не решено','Не проверено','Не проверено','Не проверено','Не решено','Не проверено',null,'',jobs[v.collection_id].url,v.source_position,v.episode_no,v.age_limit]);
const videos=table('Видео','Видео для редакторского выбора',vh,vr,[16,51,25,17,36,25,16,17,27,17,20,17,76,66,53,30,20,16,20,42,48,18,18,42,48,32,54,22,22,20,20,24,27,23,28,44,48,18,15,18],['B','C','E','F','I','M','N','O','P','T','X','Y','Z','AA','AB','AC','AD','AE','AF','AG','AH','AI','AJ']);
const vEnd=videos.last,v=sheets['Видео'];
v.getRange(`U7:U${vEnd}`).format.font={color:'#2358A8'};
v.getRange(`G7:L${vEnd}`).setNumberFormat('#,##0.0');v.getRange(`H7:K${vEnd}`).setNumberFormat('#,##0');v.getRange(`V7:W${vEnd}`).setNumberFormat('yyyy-mm-dd');
v.getRange(`L7:L${vEnd}`).formulas=sorted.map((_,i)=>{let r=i+7;return [`=IF(COUNT(J${r}:K${r})=2,IF(K${r}=0,"",J${r}/K${r}),"")`];});
v.getRange(`AB7:AB${vEnd}`).formulas=sorted.map((_,i)=>{let r=i+7;return [`=IF(AND(ISNUMBER(H${r}),ISNUMBER(W${r})),H${r}/MAX(1,'Обзор'!$B$4-W${r}),"")`];});v.getRange(`AB7:AB${vEnd}`).setNumberFormat('#,##0.0');
v.getRange(`AI7:AI${vEnd}`).formulas=sorted.map((_,i)=>{let r=i+7;return [`=IF(AC${r}="Отклонить","Отклонено",IF(AND(AC${r}="Взять",COUNTIFS(AD${r}:AH${r},"Да")=5),"Готово","Нужна редактура"))`];});
v.getRange(`AC7:AC${vEnd}`).dataValidation={rule:{type:'list',values:['Не решено','Взять','Отклонить','Резерв']}};
v.getRange(`AD7:AH${vEnd}`).dataValidation={rule:{type:'list',values:['Не проверено','Не решено','Да','Нет']}};
v.getRange(`AC7:AH${vEnd}`).format.fill=color.amber;v.getRange(`AJ7:AJ${vEnd}`).format.fill=color.amber;
v.getRange(`AI7:AI${vEnd}`).conditionalFormats.addCustom('AI7="Готово"',{fill:'#E2EFDA',font:{color:'#245529'}});
v.getRange(`AI7:AI${vEnd}`).conditionalFormats.addCustom('AI7="Отклонено"',{fill:'#FCE6E6',font:{color:'#9C2020'}});
v.getRange(`Q7:Q${vEnd}`).conditionalFormats.addCustom('Q7="Да"',{fill:'#E7EDF4'});
const lookup=(cell,index)=>`=IF(${cell}="","",IF(COUNTIFS('Видео'!$A$7:$A$${vEnd},${cell})=1,INDEX('Видео'!$${col(index)}$7:$${col(index)}$${vEnd},MATCH(${cell},'Видео'!$A$7:$A$${vEnd},0)),"ID не найден"))`;
const ch=['Дата','День','Рубрика','Выбранный YouTube ID','Название оригинала','Подборка ID','Формат','Уровень — гипотеза','Полный просмотр, мин','Учебная сессия, мин — гипотеза','Готовность','Резервный YouTube ID','Название резерва','Повод / сезонность','Почему выбрать','Ссылка на видео','Статус редактора','Заметка редактора','Источник даты повода','Правило резерва','Повторы в календаре'];
const cr=d.calendar.map(r=>[date(r.date),r.weekday,r.rubric,r.video_id,null,null,null,null,null,r.learning_minutes,null,r.backup_id,null,r.event,null,null,'Предложено','',r.event_source,r.backup_rule,null]);
const cal=table('365 дней','Предложенный календарь · 14.10.2026–13.10.2027',ch,cr,[17,9,18,18,55,16,18,25,17,19,27,18,55,62,76,48,23,45,54,70,22],['C','E','H','K','M','N','O','Q','R','S','T']);
const c=sheets['365 дней'];c.getRange('A7:A371').setNumberFormat('yyyy-mm-dd');c.getRange('I7:J371').setNumberFormat('0.0');
for(const [cl,index] of [['E',2],['F',18],['G',4],['H',6],['I',7],['K',35],['O',13],['P',21]])c.getRange(`${cl}7:${cl}371`).formulas=d.calendar.map((_,i)=>[lookup('D'+(i+7),index)]);
c.getRange('P7:P371').format.font={color:'#2358A8'};
c.getRange('M7:M371').formulas=d.calendar.map((_,i)=>[lookup('L'+(i+7),2)]);
c.getRange('U7:U371').formulas=d.calendar.map((_,i)=>[`=IF(D${i+7}="","Выбрать видео",IF(COUNTIFS($D$7:$D$371,D${i+7})>1,"Повтор","Без повтора"))`]);
c.getRange('D7:D371').dataValidation={rule:{type:'list',formula1:`INDIRECT("'Видео'!$A$7:$A$${vEnd}")`}};
c.getRange('L7:L371').dataValidation={rule:{type:'list',formula1:`INDIRECT("'Видео'!$A$7:$A$${vEnd}")`}};
c.getRange('Q7:Q371').dataValidation={rule:{type:'list',values:['Предложено','Подготовка','Запланировано','Опубликовано','Отменено']}};
for(const rg of ['D7:D371','L7:L371','Q7:R371'])c.getRange(rg).format.fill=color.amber;
c.getRange('U7:U371').conditionalFormats.addCustom('U7="Повтор"',{fill:'#FCE6E6',font:{color:'#9C2020'}});
c.getRange('K7:K371').conditionalFormats.addCustom('K7="Готово"',{fill:'#E2EFDA',font:{color:'#245529'}});
const ph=['Подборка ID','Название оригинала','Тема','Аудитория — гипотеза','Формат','Уровень — гипотеза','Почему включить','Учебный сценарий','Редакторский ракурс','Приоритет пилота','Найдено в срезе','Кандидатов после отбора','Совпало с каталогом','Медиана просмотров в выборке','Лимит выборки','Список полный?','Чувствительность / ограничения','Канал','Ссылка на подборку','Дата проверки'];
const pr=d.collections.map(j=>[j.id,j.title,j.topic,j.segment,j.format,j.level+' (гипотеза)',j.why,j.task,j.angle,j.priority,j.sampled_count,j.eligible_count,j.published_matches,j.median_sample_views,j.limit,j.sampled_count<j.limit?'В пределах лимита; полнота не гарантирована':'Лимит достигнут; это выборка',j.risk,j.channel,j.url,date(j.checked_at)]);
const collections=table('Подборки','Темы и циклы для регулярных рубрик',ph,pr,[16,53,27,42,18,25,76,66,43,20,16,17,17,20,17,45,56,42,54,18],['B','C','D','F','G','H','I','J','P','Q','R']);
sheets['Подборки'].getRange(`K7:O${collections.last}`).setNumberFormat('#,##0');sheets['Подборки'].getRange(`T7:T${collections.last}`).setNumberFormat('yyyy-mm-dd');
sheets['Подборки'].getRange(`S7:S${collections.last}`).format.font={color:'#2358A8'};
const shortlist=d.shortlist.map(id=>byId[id]).filter(Boolean).sort((a,b)=>(jobs[a.collection_id].priority==='Первый пилот'?0:1)-(jobs[b.collection_id].priority==='Первый пилот'?0:1)||a.collection_id.localeCompare(b.collection_id));
const sh=['YouTube ID','Название оригинала','Тема','Почему выбрать — гипотеза','Формат','Уровень — гипотеза','Просмотры','× медианы цикла','Готовность','Ссылка на видео','Подборка ID','В плане года?'];
const sr=shortlist.map(v=>[v.video_id,null,null,null,null,null,null,null,null,null,v.collection_id,d.calendar.some(r=>r.video_id===v.video_id)?'Да':'Нет']);
const short=table('Выбор редактора','Стартовые выпуски и сильные кандидаты каждого цикла',sh,sr,[17,55,28,80,18,25,17,20,27,50,16,17],['B','C','D','F','I']);
const ss=sheets['Выбор редактора'];for(const [cl,index] of [['B',2],['C',3],['D',13],['E',4],['F',6],['G',8],['H',12],['I',35],['J',21]])ss.getRange(`${cl}7:${cl}${short.last}`).formulas=shortlist.map((_,i)=>[lookup('A'+(i+7),index)]);
ss.getRange(`J7:J${short.last}`).format.font={color:'#2358A8'};
ss.getRange(`G7:G${short.last}`).setNumberFormat('#,##0');ss.getRange(`H7:H${short.last}`).setNumberFormat('0.0');
const ex=table('Исключения','Что не вошло в основной реестр и почему',['YouTube ID','Подборка ID','Название','Причина исключения','Ссылка'],d.excluded.map(e=>[e.video_id,e.collection_id,e.title,e.reason,e.url]),[17,17,66,72,50],['C','D']);
const methods=[
 ['Назначение','Исследовательский реестр и предложенный план. Каждая дата — кандидат, а не утверждённая публикация. Редактор выбирает по теме, аудитории, формату и проверке конкретного выпуска.','Исследовательское решение'],
 ['Первичный источник','Метаданные официальных YouTube-списков и отдельных видео получены 13.10.2026 без загрузки медиа. YouTube ID — ключ дедупликации. Ссылки и даты проверки находятся в реестре.','yt-dlp '+d.extractor_version],
 ['Спрос аудитории','Сегменты и мотивации — продуктовые гипотезы. Просмотры на YouTube показывают накопленный внешний интерес, а не спрос пользователей LinguistPro. Демография просмотров и доли сегментов неизвестны.','Аналитика продукта не предоставлена'],
 ['Сравнение популярности','Сравнивать внутри цикла и формата. × медианы = округлённые просмотры строки / медиана исходной ограниченной выборки того же цикла. Медиана рассчитывается только при ≥5 метриках. Это не рыночный перцентиль и не тренд.','Колонки J–L листа Видео'],
 ['Точность просмотров','Точный счётчик есть у записей с вторичной проверкой видео. Для остальных число получено из округлённого счётчика списка. Исходное округление сохраняется отдельно; оно не заменяется точным числом при расчёте × медианы.','Колонки H–L листа Видео'],
 ['Просмотры в день','Просмотры / число дней от загрузки до даты среза. Это среднее за весь срок жизни, не прирост за 30/90 дней. Для записи без даты загрузки поле пустое. Не сравнивать новый и старый выпуск без контекста.','Колонка AB листа Видео'],
 ['Уровни языка','A1–C1 — предварительная гипотеза по формату. Речь не прослушана массово; скорость, фон, акценты и плотность сленга могут изменить уровень. Уровень относится к выбранному фрагменту после проверки, не автоматически ко всему сериалу.','Нужен редакторский просмотр'],
 ['Основной язык','Иврит в заголовке не доказывает язык речи. he/iw в метаданных — дополнительный сигнал, но всё равно проверить конкретный фрагмент. Иные языки по метаданным исключаются из предложенного календаря.','Колонки X и AE листа Видео'],
 ['Субтитры','Дорожка HE по метаданным не подтверждает качество текста. Автоматическую дорожку проверить. Отсутствие дорожки не доказывает отсутствие вшитых титров. Вшитые титры, полный транскрипт и точность тайминга не проверены.','Колонки Y и AF листа Видео'],
 ['Воспроизведение','Разрешённое встраивание по метаданным не является успешным проигрыванием в браузере и не доказывает доступ во всех странах. Проверить в целевой географии и приложении перед публикацией.','https://support.google.com/youtube/answer/171780?hl=en'],
 ['Основание использования','Публичная ссылка и embed-флаг не подтверждают разрешение на отдельное распространение видео, перевода, полного транскрипта или учебного архива. В исследовании такие разрешения не получены. Зафиксировать проверенное основание конкретного использования.','https://www.youtube.com/static?template=terms'],
 ['Публичный каталог','Анонимный read-only GET /api/mediatheque: '+d.public_catalog_items+' записей, revision '+d.public_catalog_revision+'. Совпадение только по media.videoId. Личные материалы и внутренние редакторские черновики не проверялись. Совпадения исключены из плана новых выпусков.','https://linguistpro.kolosei.com/api/mediatheque'],
 ['Готовность','В листе Видео: решение Взять + пять Да: плеер, речь HE, текст/тайминг, основание использования, учебный пакет. Автоматическая проверка метаданных не заполняет эти поля. Запись Готово не публикует материал.','Колонки AC–AI листа Видео'],
 ['Работа с календарём','Меняйте выбранный ID в жёлтой колонке D. Название, тема, длительность, ссылка и готовность подтянутся формулами. Резерв в L выбирается отдельно. Если меняете дату, вручную пересмотрите повод: праздничная привязка не переносится автоматически.','Лист 365 дней'],
 ['Сериалы','Порядок — по номеру серии внутри выбранного сезона. Сериал отбирать блоком, проверяя доступность следующей серии. Резервное самостоятельное видео позволяет поставить ветку на паузу; нельзя незаметно перепрыгивать недоступный эпизод.','Проверка порядка и полноты сезонов'],
 ['Дневная сетка','Вс и Чт — сериал; Пн — интервью; Вт — образование; Ср — повседневность; Пт — культура/история; Сб — общество. Даты поводов и ежемесячная добровольная рубрика памяти заменяют часть слотов. Это стартовая гипотеза, а не оптимизированная сетка.','Решение исследования'],
 ['Травматические темы','Память 7 октября и Шоа — добровольная рубрика с предупреждением. До выбора смотрите выпуск целиком. Избегайте проверки памяти ученика на травматических деталях и сочетания тяжёлой истории с развлекательным автопереходом.','Редакторская рекомендация'],
 ['Разные взгляды','Интервью и расследование показывают позицию автора/гостя. Фактическое утверждение требует отдельного источника; наличие разных каналов не создаёт автоматически сбалансированный исторический вывод.','Редакторская рекомендация'],
 ['Даты','Еврейские праздники привязаны к календарю Израиля. Вечер начала отмечен явно. Гражданские памятные даты и ежемесячная периодичность имеют отдельную подпись.','https://www.hebcal.com/holidays/2027?i=on'],
 ['Полнота','Подборки ограничены заданным лимитом. Не объявлять это исчерпывающим каталогом ивритоязычного YouTube. В частности, популярные коммерческие сериалы могут быть представлены только фрагментами.','Колонки K–P листа Подборки'],
 ['Выбор редактора','Два стартовых/сильных кандидата каждого цикла, когда они найдены. Для сериала приоритет первых серий; для самостоятельного выпуска — относительные просмотры в цикле. Это выбор для первичного просмотра, не гарантия содержания.','Лист Выбор редактора'],
 ['Обновление','Раз в месяц обновляйте доступ, просмотры и новые выпуски. За 7 дней до публикации повторно проверьте плеер и контекст. Повторная генерация платных учебных материалов в исследовании не выполнялась.','Редакторская рекомендация'],
 ['Пилот спроса','28 дней: сравнить открытия карточки / показы, старт просмотра / открытия, продолжение серии, сохранения и завершение выбранного учебного фрагмента. Сопоставлять длительность, уровень и источники трафика; музыкальный повтор не равен учебному завершению.','План измерения, фактических результатов нет'],
 ['Неизвестные данные','Нет репрезентативного опроса, спроса по демографии, полного просмотра всех выпусков, экспертной проверки каждого утверждения, лицензий на производные материалы и подтверждения всех регионов. Пустое значение метрики не равно нулю.','Граница доказательств'],
 ['История выбора','Предыдущий реестр сентября использован как контекст действующих источников. Исторические счётчики не перенесены в текущие метрики. Текущий список и публичные совпадения проверены заново.','public/data/mediatheque/editorial-seed-v1.json'],
];
const me=table('Методика','Как читать данные и работать с выбором',['Пункт','Правило и границы доказательств','Источник / место данных'],methods,[28,108,72],['A','B','C']);sheets['Методика'].getRange(`A7:C${me.last}`).format.rowHeight=60;
const o=sheets['Обзор'];o.showGridLines=false;o.tabColor=color.navy;
o.getRange('A2:N63').format.font={name:'Arial',size:10,color:color.ink};o.getRange('A2').values=[['Медиатека на год · выбор редактора']];o.getRange('A2').format.font={name:'Arial',size:14,bold:true,color:color.navy};
o.getRange('A4:B13').values=[['Срез',date(d.as_of)],['Начало',date(d.start_date)],['Конец',date(d.end_date)],['',null],['Видео в реестре',null],['Подборки',null],['Публикационных дней',null],['Метаданные видео проверены',null],['Готово к публикации',null],['Совпало с публичным каталогом',null]];
o.getRange('B4:B6').setNumberFormat('yyyy-mm-dd');o.getRange('B8:B13').setNumberFormat('#,##0');
o.getRange('B8').formulas=[[`=COUNTA('Видео'!A7:A${vEnd})`]];o.getRange('B9').formulas=[[`=COUNTA('Подборки'!A7:A${collections.last})`]];o.getRange('B10').formulas=[['=COUNTA(\'365 дней\'!A7:A371)']];
o.getRange('B11').formulas=[[`=COUNTIFS('Видео'!AA7:AA${vEnd},"Метаданные видео; воспроизведение и содержание не проверены")`]];
o.getRange('B12').formulas=[[`=COUNTIFS('Видео'!AI7:AI${vEnd},"Готово")`]];o.getRange('B13').formulas=[[`=COUNTIFS('Видео'!Q7:Q${vEnd},"Да")`]];
o.getRange('D4').values=[['Начните с листа «Выбор редактора», затем выбирайте ID в «365 дней».']];
o.getRange('D6').values=[['Жёлтые поля — решения редактора. Источник и исходные метрики сохранены отдельно.']];
o.getRange('D8').values=[['План заполнен кандидатами; готовность публикации требует проверки выпуска и учебного пакета.']];
o.getRange('D10').values=[['Просмотры измерены. Сегменты, языковые уровни и учебная ценность — проверяемые гипотезы.']];
o.getRange('D12').values=[['Сетка охватывает сериалы, интервью, повседневность, образование, историю, культуру и память.']];
o.getRange('A16:D24').values=[['Формат','Слотов в плане','Доля плана','Видео-кандидатов'],...['Сериал','Интервью','Быт','Образование','Общество','История','Культура','Память'].map(f=>[f,null,null,null])];
for(let r=17;r<=24;r++){o.getRange(`B${r}`).formulas=[[`=COUNTIFS('365 дней'!G7:G371,A${r})`]];o.getRange(`C${r}`).formulas=[[`=B${r}/$B$10`]];o.getRange(`D${r}`).formulas=[[`=COUNTIFS('Видео'!D7:D${vEnd},A${r})`]];}
o.getRange('C17:C24').setNumberFormat('0.0%');o.getRange('A16:D16').format={fill:color.navy,font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:36,wrapText:true,horizontalAlignment:'center'};
const chart=o.charts.add('bar',[o.getRange('A16:A24'),o.getRange('B16:B24')]);chart.title='Состав предложенного года · публикации';chart.titleTextStyle.typeface='Arial';chart.titleTextStyle.fontSize=12;chart.hasLegend=false;chart.xAxis={axisType:'textAxis',textStyle:{typeface:'Arial',fontSize:10}};chart.yAxis={numberFormatCode:'0',numberFormatSourceLinked:false,textStyle:{typeface:'Arial',fontSize:10}};chart.series.items[0].fill='#38659B';chart.setPosition('G16','N30');
const audiences=[
 ['Новые репатрианты','Понимать быт и общение','Купа рашит; Zoom In; деньги; места','C003, C043, C048, C049','A2–B2 с выбранным фрагментом','Проверять сохранения и повторное использование фраз'],
 ['Любители сериалов','Продолжать сюжет в оригинале','Комедия; детектив; театр; армия','C004–C010','B1–C1','Смотреть переход к следующей серии и возврат через неделю'],
 ['Любители интервью','Знакомиться с людьми и идеями','Рони Кувен; Одед Харуш; Project 001','C012–C017, C082, C086','B2–C1','Сопоставлять гостей, темы и продолжение просмотра'],
 ['История и еврейское наследие','Понять эпоху, общины и культуру','Мандат; древняя история; литература; общины','C028–C032, C065–C078','B2–C1','Сравнивать сохранения тематического маршрута'],
 ['Семьи и подростки','Смотреть и обсуждать вместе','Карамель; Шакшука; Галилео; наука дома','C053–C058, C061','A1–B2; возраст и формат отдельно','Проверять семейный спрос отдельно от взрослого'],
 ['Технологии, работа и наука','Содержательный профессиональный интерес','Юникорнз; экономика; Дэвидсон','C034–C035, C059–C064','B1–C1','Сравнивать интерес к теме и завершение фрагмента'],
 ['Повседневность и лёгкий просмотр','Короткий регулярный контакт с ивритом','Докотайм; еда; путешествия; спорт','C022–C024, C038–C039, C043','B1–B2','Проверять ежедневные возвраты и полный короткий просмотр'],
 ['Память и общество','Услышать свидетельство и разные опыты','7 октября; Шоа; личные рассказы','C041–C042, C046, C052, C076–C078','B1–C1; добровольный просмотр','Измерять осознанный выбор; не стимулировать тяжёлые просмотры'],
];
o.getRange('A34:F42').values=[['Сегмент — гипотеза','Задача зрителя','Что предложить','Подборки ID','Язык — гипотеза','Как проверить спрос'],...audiences];o.getRange('A34:F34').format={fill:color.navy,font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:40,wrapText:true,horizontalAlignment:'center'};o.getRange('A35:F42').format.wrapText=true;o.getRange('A35:F42').format.rowHeight=64;o.getRange('A35:F42').format.verticalAlignment='top';
for(const [cl,width]of [['A',33],['B',32],['C',38],['D',38],['E',35],['F',54],['G',12],['H',12],['I',12],['J',12],['K',12],['L',12],['M',12],['N',12]])o.getRange(`${cl}2:${cl}63`).format.columnWidth=width;
o.getRange('A46').values=[['Источники: официальные каталоги и авторские каналы']];o.getRange('A46').format.font={name:'Arial',size:12,bold:true,color:color.navy};
o.getRange('A48:F59').values=[['Канал','Основной маршрут','Подписчики ≈','Срез','Роль','Ссылка'],...d.channels.map(x=>[x.title,x.scope,x.followers,date(d.as_of),x.role,x.url])];o.getRange('A48:F48').format={fill:color.navy,font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:40,wrapText:true,horizontalAlignment:'center'};o.getRange('A49:F59').format.rowHeight=54;o.getRange('A49:F59').format.wrapText=true;o.getRange('C49:C59').setNumberFormat('#,##0');o.getRange('D49:D59').setNumberFormat('yyyy-mm-dd');
// Final recalculation and verification of real editing behavior.
wb.recalculate();
const before=o.getRange('B12').values[0][0];
v.getRange('AC7').values=[['Взять']];v.getRange('AD7:AG7').values=[['Да','Да','Да','Да']];
if(v.getRange('AI7').values[0][0]!=='Нужна редактура')throw Error('Archive prerequisite was hidden');
v.getRange('AH7').values=[['Да']];
if(v.getRange('AI7').values[0][0]!=='Готово')throw Error('Ready status did not update');
if(o.getRange('B12').values[0][0]!==before+1)throw Error('Summary readiness did not update');
v.getRange('AC7:AH7').values=[['Не решено','Не проверено','Не проверено','Не проверено','Не решено','Не проверено']];
const oldId=c.getRange('D7').values[0][0];const testId=sorted.find(x=>x.video_id!==oldId).video_id;c.getRange('D7').values=[[testId]];
if(c.getRange('E7').values[0][0]!==byId[testId].title)throw Error('Calendar lookup did not follow selected ID');
c.getRange('D7').values=[[oldId]];
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:'Обзор!A4:B13',include:'values,formulas',tableMaxRows:10,tableMaxCols:2,maxChars:2200})).ndjson);
const errorScan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:15},summary:'Final formula scan',maxChars:1800});console.log(errorScan.ndjson);if(errorScan.ndjson.split('\n').some(line=>{try{return JSON.parse(line).kind==='match';}catch{return false;}}))throw Error('Formula errors remain');
await fs.mkdir(out,{recursive:true});
const file=await SpreadsheetFile.exportXlsx(wb);await file.save(path.join(out,'LinguistPro_YouTube_365.xlsx'));
console.log('EXPORTED',out);
const previewRanges={'Обзор':'A2:N30','365 дней':'A6:J12','Выбор редактора':'A6:F12','Подборки':'A6:H11','Видео':'A6:I12','Исключения':'A6:E12','Методика':'A6:C11'};
for(const [name,range]of Object.entries(previewRanges)){
 const preview=await wb.render({sheetName:name,range,scale:1.2,format:'png'});await fs.writeFile(path.join(root,'preview-'+names.indexOf(name)+'.png'),new Uint8Array(await preview.arrayBuffer()));console.log('RENDERED',name);
}
const lower=await wb.render({sheetName:'Обзор',range:'A34:F59',scale:1.2,format:'png'});await fs.writeFile(path.join(root,'preview-overview-lower.png'),new Uint8Array(await lower.arrayBuffer()));
await fs.writeFile(path.join(root,'workbook-checks.json'),JSON.stringify({sheets:names,video_count:sorted.length,calendar_count:d.calendar.length,shortlist_count:shortlist.length,ready_count:o.getRange('B12').values[0][0],calendar_lookup_test:true,partial_gate_test:true,ready_summary_test:true,formula_errors_scanned:true},null,2));
