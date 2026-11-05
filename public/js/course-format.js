(function(root){
  'use strict';
  const H = typeof module !== 'undefined' && module.exports ? require('./course-hebrew.js') : root.CourseHebrew;
  const HE_FIELDS = ['scene.turns[].he','text.paras[].he','tasks[].model','tasks[].answers[]'];
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  function validator(){
    const issues=[];
    const add=(code,path,message,level='error')=>issues.push({
      level,code,path,message
    });
    const shape=(ok,path,message)=>{
      if(!ok)add('FORMAT',path,message);
      return ok;
    };
    const arr=(x,p)=>shape(Array.isArray(x),p,'Ожидается массив.')?x:[];
    const id=(x,p,seen)=>{
      if(typeof x!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x))add('ID_BAD',p,'Некорректный ID.');
      else if(seen){
        if(seen.has(x))add('ID_DUP',p,'Повторный ID: '+x);
        seen.add(x);
      }
    };
    const ru=(x,p)=>shape(object(x)&&typeof x.ru==='string'&&!!x.ru.trim(),p,'Нужен текст {ru}.');
    const he=(x,p)=>{
      if(!object(x)||typeof x.niqqud!=='string'||!x.niqqud.trim()||typeof x.plain!=='string'||!x.plain.trim()){
        add('HE_PAIR_MISSING',p,'Нужны niqqud и plain.');
        return;
      }if(/[\u0591-\u05C7]/u.test(x.plain))add('HE_PLAIN_HAS_MARKS',p+'.plain','Полное письмо содержит знаки.');
      if(!H.pairConsistent(x))add('HE_SKELETON_MISMATCH',p,'Буквенные основы пары различаются.');
      if(/[\u05D0-\u05EA]/u.test(x.niqqud)&&!/[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C7]/u.test(x.niqqud))add('HE_NIQQUD_BARE',p+'.niqqud','Нет огласовок.','warning');
      if(x.functional!==undefined)shape(typeof x.functional==='string',p+'.functional','Ожидается строка.');
    };
    return {
      issues,add,shape,arr,id,ru,he
    };
  }
  function validateLexicon(lex){
    const v=validator(),seen=new Set();
    if(!v.shape(object(lex),'','Ожидается лексикон.'))return v.issues;
    v.arr(lex.entries,'entries').forEach((e,i)=>{
      const p='entries['+i+']';
      if(!v.shape(object(e),p,'Ожидается запись.'))return;
      v.id(e.id,p+'.id',seen);
      v.he(e.he,p+'.he');
      v.shape(typeof e.pos==='string'&&!!e.pos,p+'.pos','Нужна часть речи.');
      v.ru(e.gloss,p+'.gloss');
      v.shape(typeof e.translit_ru==='string',p+'.translit_ru','Нужна транскрипция.');
      if(e.gender!==undefined)v.shape(['m','f'].includes(e.gender),p+'.gender','Род m или f.');
      if(e.srcIds!==undefined)v.arr(e.srcIds,p+'.srcIds').forEach((x,j)=>v.id(x,p+'.srcIds['+j+']'));
      if(e.forms!==undefined)v.arr(e.forms,p+'.forms').forEach((f,j)=>{
        const q=p+'.forms['+j+']';
        if(!v.shape(object(f),q,'Ожидается форма.'))return;
        v.id(f.id,q+'.id',seen);
        v.he(f.he,q+'.he');
        v.arr(f.tags,q+'.tags').forEach((t,k)=>v.shape(typeof t==='string',q+'.tags['+k+']','Ожидается строка.'));
      });
    });
    return v.issues;
  }
  function validateLesson(l,index){
    const v=validator();
    if(!v.shape(object(l),'','Ожидается урок.'))return v.issues;
    v.shape(l.format==='course-lesson-v1','format','Нужен course-lesson-v1.');
    v.id(l.id,'id');
    v.shape(Number.isInteger(l.version)&&l.version>0,'version','Нужна положительная целая версия.');
    v.ru(l.title,'title');
    v.ru(l.goal,'goal');
    v.shape(l.niqqud===undefined||['full','new','tap'].includes(l.niqqud),'niqqud','Режим огласовок: full, new или tap.');
    const mediaIds=new Map();
    if(Array.isArray(l.media))for(const m of l.media)if(object(m)&&typeof m.id==='string')mediaIds.set(m.id,true);
    const ref=(x,p,map=index)=>{
      v.id(x,p);
      if(!map||!map.has(x))v.add('REF_UNKNOWN',p,'Неизвестная ссылка: '+x);
    };
    const refs=(a,p)=>v.arr(a,p).forEach((x,i)=>ref(x,p+'['+i+']'));
    refs(l.introduces?.active,'introduces.active');
    refs(l.introduces?.receptive,'introduces.receptive');
    refs(l.reviews,'reviews');
    refs(l.frame,'frame');
    const slots=new Map(),slotIds=new Set();
    v.arr(l.slots,'slots').forEach((s,i)=>{
      const p='slots['+i+']';
      if(!v.shape(object(s),p,'Ожидается слот.'))return;
      v.id(s.id,p+'.id',slotIds);
      v.ru(s.label,p+'.label');
      if(s.head!==undefined)v.shape(s.head===true,p+'.head','head может быть true.');
      const keys=new Set();
      v.arr(s.values,p+'.values').forEach((val,j)=>{
        const q=p+'.values['+j+']';
        if(!v.shape(object(val),q,'Ожидается значение.'))return;
        /* Several sequences may name the same semantic key. */v.id(val.key,q+'.key');
        keys.add(val.key);
        v.ru(val.label,q+'.label');
        refs(val.seq,q+'.seq');
      });
      slots.set(s.id,keys);
    });
    v.arr(l.orderRules,'orderRules').forEach((r,i)=>{
      const p='orderRules['+i+']';
      if(!v.shape(object(r),p,'Ожидается правило.'))return;
      ref(r.head,p+'.head',slots);
      ref(r.dependent,p+'.dependent',slots);
      v.ru(r.message,p+'.message');
    });
    v.arr(l.repeatForms,'repeatForms').forEach((a,i)=>refs(a,'repeatForms['+i+']'));
    const targets=new Map(),sceneTurnIds=new Set();
    if(v.shape(object(l.scene),'scene','Нужна сцена.')){
      v.id(l.scene.id,'scene.id');
      targets.set(l.scene.id,true);
      const roles=new Map(),roleIds=new Set();
      v.arr(l.scene.roles,'scene.roles').forEach((r,i)=>{
        const p='scene.roles['+i+']';
        if(!v.shape(object(r),p,'Ожидается роль.'))return;
        v.id(r.id,p+'.id',roleIds);
        roles.set(r.id,true);
        v.shape(typeof r.voice==='string',p+'.voice','Нужен голос.');
        if(typeof r.voice==='string'&&!/^he-IL-Wavenet-[A-D]$/.test(r.voice))v.add('VOICE_NOT_ALLOWED',p+'.voice','Допустимы только голоса he-IL-Wavenet-A–D.');
      });
      const ids=sceneTurnIds,turns=v.arr(l.scene.turns,'scene.turns');
      turns.forEach((t,i)=>{
        const p='scene.turns['+i+']';
        if(!v.shape(object(t),p,'Ожидается реплика.'))return;
        v.id(t.id,p+'.id',ids);
        targets.set(t.id,true);
        ref(t.role,p+'.role',roles);
        v.he(t.he,p+'.he');
        v.ru(t.ru,p+'.ru');
      });
      const turnMap=new Map([...ids].map(x=>[x,true]));
      turns.forEach((t,i)=>{
        if(object(t)&&t.next!==undefined)ref(t.next,'scene.turns['+i+'].next',turnMap);
        if(object(t)&&t.choices!==undefined){
          const cids=new Set();
          v.arr(t.choices,'scene.turns['+i+'].choices').forEach((c,j)=>{
            const q='scene.turns['+i+'].choices['+j+']';
            if(!v.shape(object(c),q,'Ожидается вариант ответа.'))return;
            v.id(c.id,q+'.id',cids);v.he(c.he,q+'.he');v.ru(c.ru,q+'.ru');
            v.shape(['ok','repair'].includes(c.verdict),q+'.verdict','verdict: ok или repair.');
            if(!turnMap.has(c.next))v.add('SCENE_NEXT_UNKNOWN',q+'.next','Неизвестная следующая реплика: '+c.next);
          });
        }
      });
      // Graph checks apply once a scene declares any edge; legacy scenes stay linear lists.
      const valid=turns.filter(t=>object(t)&&typeof t.id==='string');
      if(valid.length&&valid.some(t=>t.next!==undefined||t.choices!==undefined)){
        const edges=t=>[t.next,...(Array.isArray(t.choices)?t.choices.map(c=>c?.next):[])].filter(x=>turnMap.has(x));
        const byId=new Map(valid.map(t=>[t.id,t]));
        const state=new Map();let cycle=false;
        const visit=id=>{state.set(id,1);for(const n of edges(byId.get(id))){if(state.get(n)===1)cycle=true;else if(!state.has(n))visit(n);}state.set(id,2);};
        visit(valid[0].id);
        if(cycle)v.add('SCENE_CYCLE','scene.turns','В сцене есть цикл.');
        valid.forEach(t=>{if(!state.has(t.id))v.add('SCENE_UNREACHABLE','scene.turns.'+t.id,'Реплика недостижима: '+t.id);});
      }
      if(l.scene.image!==undefined)ref(l.scene.image,'scene.image',mediaIds);
    }
    if(l.text!==undefined&&v.shape(object(l.text),'text','Ожидается текст.')){
      v.id(l.text.id,'text.id');
      targets.set(l.text.id,true);
      // Spoken rows share lesson/id audio refs; keep sceneTurnIds turn-only.
      const ids=new Set(sceneTurnIds);
      v.arr(l.text.paras,'text.paras').forEach((p,i)=>{
        const q='text.paras['+i+']';
        if(!v.shape(object(p),q,'Ожидается абзац.'))return;
        v.id(p.id,q+'.id',ids);
        targets.set(p.id,true);
        v.he(p.he,q+'.he');
        v.ru(p.ru,q+'.ru');
      });
    }
    const grammar=new Map();
    if(l.grammar!==undefined&&v.shape(object(l.grammar),'grammar','Ожидается справочник.'))for(const [key,g]of Object.entries(l.grammar)){
      const p='grammar.'+key;v.id(key,p);grammar.set(key,true);
      if(!v.shape(object(g),p,'Ожидается правило.'))continue;
      v.ru(g.title,p+'.title');v.ru(g.body,p+'.body');
      if(g.pattern!==undefined)v.arr(g.pattern,p+'.pattern').forEach((h,i)=>v.he(h,p+'.pattern['+i+']'));
      if(g.line!==undefined&&v.shape(object(g.line),p+'.line','Ожидается строка-микрокарта.')){
        v.he(g.line.he,p+'.line.he');
        const n=typeof g.line.he?.plain==='string'?g.line.he.plain.trim().split(/\s+/).length:0;
        v.arr(g.line.slots,p+'.line.slots').forEach((sl,i)=>{
          const q=p+'.line.slots['+i+']';
          if(!v.shape(object(sl),q,'Ожидается слот.'))return;
          v.ru(sl.label,q+'.label');
          if(!Number.isInteger(sl.from)||!Number.isInteger(sl.to)||sl.from<0||sl.to<sl.from||sl.to>=n)v.add('GRAMMAR_SLOT_RANGE',q,'Слот вне строки.');
        });
      }
    }
    const taskIds=new Set();
    v.arr(l.tasks,'tasks').forEach((t,i)=>{
      const p='tasks['+i+']';
      if(!v.shape(object(t),p,'Ожидается задание.'))return;
      v.id(t.id,p+'.id',taskIds);
      targets.set(t.id,true);
      if(!['choice','text','match','cloze','scene','tiles','order'].includes(t.type))v.add('TASK_TYPE_UNKNOWN',p+'.type','Неизвестный тип задания.');
      v.arr(t.channel,p+'.channel').forEach((c,j)=>v.shape(typeof c==='string',p+'.channel['+j+']','Ожидается строка.'));
      v.ru(t.prompt,p+'.prompt');
      if(t.grammarRef!==undefined)ref(t.grammarRef,p+'.grammarRef',grammar);
      if(t.cue!==undefined)v.he(t.cue,p+'.cue');
      if(t.hints!==undefined)v.arr(t.hints,p+'.hints').forEach((h,j)=>v.ru(h,p+'.hints['+j+']'));
      if(t.options!==undefined){const ids=new Set();v.arr(t.options,p+'.options').forEach((o,j)=>{const q=p+'.options['+j+']';if(!v.shape(object(o),q,'Ожидается вариант.'))return;v.id(o.id,q+'.id',ids);if(o.he!==undefined)v.he(o.he,q+'.he');else v.ru(o.label,q+'.label');});ref(t.correctOption,p+'.correctOption',new Map([...ids].map(id=>[id,true])));}
      if(t.pairs!==undefined){const ids=new Set();v.arr(t.pairs,p+'.pairs').forEach((o,j)=>{const q=p+'.pairs['+j+']';if(!v.shape(object(o),q,'Ожидается пара.'))return;v.id(o.id,q+'.id',ids);v.he(o.he,q+'.he');if(o.media!==undefined)ref(o.media,q+'.media',mediaIds);else v.ru(o.label,q+'.label');});}
      if(t.type==='tiles'){const tiles=v.arr(t.tiles,p+'.tiles');v.shape(tiles.length>0,p+'.tiles','Нужны плитки.');tiles.forEach((h,j)=>v.he(h,p+'.tiles['+j+']'));if(t.distractors!==undefined)v.arr(t.distractors,p+'.distractors').forEach((h,j)=>v.he(h,p+'.distractors['+j+']'));}
      if(t.type==='order'&&v.shape(object(t.card),p+'.card','Нужна карточка заказа.'))for(const [k,val] of Object.entries(t.card)){ref(k,p+'.card.'+k,slots);if(slots.has(k)&&!slots.get(k).has(val))v.add('REF_UNKNOWN',p+'.card.'+k,'Неизвестное значение слота.');}
      if(t.cardMedia!==undefined)ref(t.cardMedia,p+'.cardMedia',mediaIds);

      if(t.audioTurnId!==undefined)ref(t.audioTurnId,p+'.audioTurnId',sceneTurnIds);
      if(t.model!==undefined)v.he(t.model,p+'.model');
      if(t.answers!==undefined)v.arr(t.answers,p+'.answers').forEach((h,j)=>v.he(h,p+'.answers['+j+']'));
      if(t.transfer!==undefined)v.shape(typeof t.transfer==='boolean',p+'.transfer','Нужно boolean.');
      const validateSpec=(s,path)=>{
        if(!v.shape(object(s),path,'Ожидается спецификация.'))return;
        v.shape(['order','short','confirm','repeat','replacement'].includes(s.kind),path+'.kind','Неизвестный вид проверки.');
        const requiredByKind = {
          order: ['expect', 'require'], short: ['expect', 'require'],
          confirm: ['card', 'claim'], replacement: ['next', 'prev', 'via'], repeat: []
        };
        for (const field of Object.hasOwn(requiredByKind, s.kind) ? requiredByKind[s.kind] : []) {
          v.shape(s[field] !== undefined, path + '.' + field, 'Обязательное поле спецификации.');
        }
        for(const name of ['expect','card','claim','next','prev'])if(s[name]!==undefined&&v.shape(object(s[name]),path+'.'+name,'Ожидаются значения слотов.'))for(const [k,val] of Object.entries(s[name])){
          ref(k,path+'.'+name+'.'+k,slots);
          if(slots.has(k)&&!slots.get(k).has(val))v.add('REF_UNKNOWN',path+'.'+name+'.'+k,'Неизвестное значение слота.');
        }if(s.require!==undefined)v.arr(s.require,path+'.require').forEach((x,j)=>ref(x,path+'.require['+j+']',slots));
        if(s.preferFrame!==undefined)refs(s.preferFrame,path+'.preferFrame');
        if(s.via!==undefined)ref(s.via,path+'.via');
      };
      if(t.spec!==undefined)validateSpec(t.spec,p+'.spec');
      if(t.variants!==undefined){
        const ids=new Set();
        v.arr(t.variants,p+'.variants').forEach((variant,j)=>{
          const q=p+'.variants['+j+']';
          if(!v.shape(object(variant),q,'Ожидается вариант.'))return;
          v.id(variant.id,q+'.id',ids);
          v.ru(variant.prompt,q+'.prompt');
          validateSpec(variant.spec,q+'.spec');
          if(variant.model!==undefined)v.he(variant.model,q+'.model');
          if(variant.card!==undefined&&v.shape(object(variant.card),q+'.card','Нужна карточка заказа.'))for(const [k,val] of Object.entries(variant.card)){ref(k,q+'.card.'+k,slots);if(slots.has(k)&&!slots.get(k).has(val))v.add('REF_UNKNOWN',q+'.card.'+k,'Неизвестное значение слота.');}
          if(variant.cardMedia!==undefined)ref(variant.cardMedia,q+'.cardMedia',mediaIds);
        });
      }
    });
    if(l.media!==undefined){
      const ids=new Set();
      v.arr(l.media,'media').forEach((m,i)=>{
        const p='media['+i+']';
        if(!v.shape(object(m),p,'Ожидается медиа.'))return;
        v.id(m.id,p+'.id',ids);
        ref(m.target,p+'.target',targets);
        v.ru(m.brief,p+'.brief');
        v.ru(m.alt,p+'.alt');
        if(m.kind!==undefined){
          v.shape(['image','sequence'].includes(m.kind),p+'.kind','kind: image или sequence.');
          if(!object(m.fallback)||!object(m.fallback.ru)||typeof m.fallback.ru.ru!=='string'||!m.fallback.ru.ru.trim())v.add('MEDIA_FALLBACK_MISSING',p+'.fallback','Нужна запасная карточка без медиа.');
          if(m.purpose!==undefined)v.ru(m.purpose,p+'.purpose');
          if(m.aspect!==undefined)v.shape(['16:9','4:3','1:1','3:4'].includes(m.aspect),p+'.aspect','Пропорции 16:9, 4:3, 1:1 или 3:4.');
          if(m.kind==='sequence'&&m.frames!==undefined)v.shape(Array.isArray(m.frames)&&m.frames.length>=2&&m.frames.length<=4&&m.frames.every(f=>typeof f==='string'),p+'.frames','Последовательность — 2–4 кадра.');
          if(m.src!==undefined)v.shape(typeof m.src==='string',p+'.src','Ожидается имя файла.');
        }
      });
    }
    if(l.skills!==undefined){
      const ids=new Set();
      v.arr(l.skills,'skills').forEach((sk,i)=>{
        const p='skills['+i+']';
        if(!v.shape(object(sk),p,'Ожидается умение.'))return;
        v.id(sk.id,p+'.id',ids);v.ru(sk.label,p+'.label');
        v.arr(sk.tasks,p+'.tasks').forEach((x,j)=>{if(!taskIds.has(x))v.add('SKILL_TASK_UNKNOWN',p+'.tasks['+j+']','Неизвестное задание: '+x);});
      });
    }
    if(l.flow!==undefined){
      const parts=new Set();
      v.arr(l.flow,'flow').forEach((part,i)=>{
        const p='flow['+i+']';
        if(!v.shape(object(part),p,'Ожидается часть.'))return;
        v.id(part.id,p+'.id',parts);v.ru(part.title,p+'.title');
        v.arr(part.steps,p+'.steps').forEach((st,j)=>{
          const q=p+'.steps['+j+']';
          if(!v.shape(object(st)&&['scene','text','task','grammar','summary'].includes(st.kind),q,'Неизвестный шаг.'))return;
          if(st.kind==='scene')v.shape(st.mode===undefined||['listen','read'].includes(st.mode),q+'.mode','mode: listen или read.');
          if(st.kind==='text')v.shape(object(l.text),q,'В уроке нет учебного текста.');
          if(st.kind==='task'&&!taskIds.has(st.ref))v.add('FLOW_REF_UNKNOWN',q+'.ref','Неизвестное задание: '+st.ref);
          if(st.kind==='grammar'&&!grammar.has(st.ref))v.add('FLOW_REF_UNKNOWN',q+'.ref','Неизвестное правило: '+st.ref);
        });
      });
    }
    return v.issues;
  }
  const api={
    HE_FIELDS,validateLexicon,validateLesson
  };
  root.CourseFormat=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
