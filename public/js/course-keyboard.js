(function(root){
  'use strict';
  const labels={
    ru:{keyboard:'Клавиатура иврита',keyboardShow:'Показать клавиатуру',keyboardHide:'Скрыть клавиатуру',keyboardLetter:'Буква {letter}',keyboardSpace:'Пробел',keyboardBackspace:'Удалить предыдущий символ',keyboardQuestion:'Вопросительный знак'},
    en:{keyboard:'Hebrew keyboard',keyboardShow:'Show keyboard',keyboardHide:'Hide keyboard',keyboardLetter:'Letter {letter}',keyboardSpace:'Space',keyboardBackspace:'Delete previous character',keyboardQuestion:'Question mark'},
    he:{keyboard:'מקלדת עברית',keyboardShow:'הצגת מקלדת',keyboardHide:'הסתרת מקלדת',keyboardLetter:'האות {letter}',keyboardSpace:'רווח',keyboardBackspace:'מחיקת התו הקודם',keyboardQuestion:'סימן שאלה'}
  };
  function label(key,lang){return (labels[lang]||labels.ru)[key];}
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
        b.setAttribute('aria-label',special?t(special):t('keyboardLetter').replace('{letter}',key));
        if(!special)b.lang='he';
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
