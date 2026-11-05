(function(root){
  'use strict';
  const labels={
    ru:{keyboard:'Клавиатура иврита',keyboardShow:'Показать клавиатуру',keyboardHide:'Скрыть клавиатуру',keyboardLetter:'Буква {letter}',keyboardSpace:'Пробел',keyboardBackspace:'Удалить предыдущий символ',keyboardQuestion:'Вопросительный знак'},
    en:{keyboard:'Hebrew keyboard',keyboardShow:'Show keyboard',keyboardHide:'Hide keyboard',keyboardLetter:'Letter {letter}',keyboardSpace:'Space',keyboardBackspace:'Delete previous character',keyboardQuestion:'Question mark'},
    he:{keyboard:'מקלדת עברית',keyboardShow:'הצגת מקלדת',keyboardHide:'הסתרת מקלדת',keyboardLetter:'האות {letter}',keyboardSpace:'רווח',keyboardBackspace:'מחיקת התו הקודם',keyboardQuestion:'סימן שאלה'}
  };
  const letterKeys={"א":"alef","ב":"bet","ג":"gimel","ד":"dalet","ה":"he","ו":"vav","ז":"zayin","ח":"het","ט":"tet","י":"yod","כ":"kaf","ל":"lamed","מ":"mem","נ":"nun","ס":"samekh","ע":"ayin","פ":"pe","צ":"tsadi","ק":"qof","ר":"resh","ש":"shin","ת":"tav","ך":"finalKaf","ם":"finalMem","ן":"finalNun","ף":"finalPe","ץ":"finalTsadi"};
  labels.ru.keyboardLetters={"alef":"алеф","bet":"бет","gimel":"гимель","dalet":"далет","he":"хе","vav":"вав","zayin":"заин","het":"хет","tet":"тет","yod":"йод","kaf":"каф","lamed":"ламед","mem":"мем","nun":"нун","samekh":"самех","ayin":"айн","pe":"пе","tsadi":"цади","qof":"куф","resh":"реш","shin":"шин","tav":"тав","finalKaf":"каф софит","finalMem":"мем софит","finalNun":"нун софит","finalPe":"пе софит","finalTsadi":"цади софит"};
  labels.en.keyboardLetters={"alef":"alef","bet":"bet","gimel":"gimel","dalet":"dalet","he":"he","vav":"vav","zayin":"zayin","het":"het","tet":"tet","yod":"yod","kaf":"kaf","lamed":"lamed","mem":"mem","nun":"nun","samekh":"samekh","ayin":"ayin","pe":"pe","tsadi":"tsadi","qof":"qof","resh":"resh","shin":"shin","tav":"tav","finalKaf":"final kaf","finalMem":"final mem","finalNun":"final nun","finalPe":"final pe","finalTsadi":"final tsadi"};
  labels.he.keyboardLetters={"alef":"אלף","bet":"בית","gimel":"גימל","dalet":"דלת","he":"הא","vav":"ויו","zayin":"זין","het":"חית","tet":"טית","yod":"יוד","kaf":"כף","lamed":"למד","mem":"מם","nun":"נון","samekh":"סמך","ayin":"עין","pe":"פא","tsadi":"צדי","qof":"קוף","resh":"ריש","shin":"שין","tav":"תו","finalKaf":"כף סופית","finalMem":"מם סופית","finalNun":"נון סופית","finalPe":"פא סופית","finalTsadi":"צדי סופית"};
  function label(key,lang){return key.split('.').reduce((value,part)=>value?.[part],labels[lang]||labels.ru);}
  function attach(input,container,opts={}){
    const doc=input.ownerDocument,win=doc.defaultView||root;
    const lang=opts.lang||doc.documentElement.lang||'ru';
    const t=key=>opts.T?opts.T('course.'+key,label(key,lang)):label(key,lang);
    const board=doc.createElement('div');board.className='course-keyboard';board.dir='ltr';board.setAttribute('role','group');board.setAttribute('aria-label',t('keyboard'));
    const cleanups=[];
    function on(node,type,fn){node.addEventListener(type,fn);cleanups.push(()=>node.removeEventListener(type,fn));}
    function insert(key){
      if(input.disabled||input.readOnly)return;
      const value=input.value,start=Math.min(value.length,Math.max(0,input.selectionStart??value.length)),end=Math.min(value.length,Math.max(start,input.selectionEnd??start));
      let from=start,added=key==='space'?' ':key==='question'?'?':key;
      if(key==='backspace'){added='';if(start===end&&start>0)from=start-(Array.from(value.slice(0,start)).at(-1).length);}
      input.value=value.slice(0,from)+added+value.slice(end);
      input.focus();input.setSelectionRange?.(from+added.length,from+added.length);
      input.dispatchEvent(new win.Event('input',{bubbles:true}));
    }
    for(const keys of [...['קראטוןםפ','שדגכעיחלךף','זסבהנמצתץ'].map(row=>[...row]),['space','backspace','question']]){
      const row=doc.createElement('div');row.className='course-keyboard-row';
      for(const key of keys){
        const b=doc.createElement('button');b.type='button';b.dataset.courseKey=key;
        const special={space:'keyboardSpace',backspace:'keyboardBackspace',question:'keyboardQuestion'}[key];
        b.textContent=key==='space'?t('keyboardSpace'):key==='backspace'?'⌫':key==='question'?'?':key;
        b.setAttribute('aria-label',special?t(special):t('keyboardLetter').replace('{letter}',t('keyboardLetters.'+letterKeys[key])));
        b.lang=labels[lang]?lang:'ru';
        on(b,'pointerdown',event=>event.preventDefault());
        on(b,'click',()=>insert(key));row.append(b);
      }
      board.append(row);
    }
    container.append(board);
    return {detach(){for(const off of cleanups.splice(0))off();board.remove();}};
  }
  const api={attach,label};root.CourseKeyboard=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
