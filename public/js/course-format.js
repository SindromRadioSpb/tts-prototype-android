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
      turns.forEach((t,i)=>{
        if(object(t)&&t.next!==undefined)ref(t.next,'scene.turns['+i+'].next',new Map([...ids].map(x=>[x,true])));
      });
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
    }
    const taskIds=new Set();
    v.arr(l.tasks,'tasks').forEach((t,i)=>{
      const p='tasks['+i+']';
      if(!v.shape(object(t),p,'Ожидается задание.'))return;
      v.id(t.id,p+'.id',taskIds);
      targets.set(t.id,true);
      if(!['choice','text','match','cloze','scene'].includes(t.type))v.add('TASK_TYPE_UNKNOWN',p+'.type','Неизвестный тип задания.');
      v.arr(t.channel,p+'.channel').forEach((c,j)=>v.shape(typeof c==='string',p+'.channel['+j+']','Ожидается строка.'));
      v.ru(t.prompt,p+'.prompt');
      if(t.grammarRef!==undefined)ref(t.grammarRef,p+'.grammarRef',grammar);
      if(t.cue!==undefined)v.he(t.cue,p+'.cue');
      if(t.hints!==undefined)v.arr(t.hints,p+'.hints').forEach((h,j)=>v.ru(h,p+'.hints['+j+']'));
      if(t.options!==undefined){const ids=new Set();v.arr(t.options,p+'.options').forEach((o,j)=>{const q=p+'.options['+j+']';if(!v.shape(object(o),q,'Ожидается вариант.'))return;v.id(o.id,q+'.id',ids);if(o.he!==undefined)v.he(o.he,q+'.he');else v.ru(o.label,q+'.label');});ref(t.correctOption,p+'.correctOption',new Map([...ids].map(id=>[id,true])));}
      if(t.pairs!==undefined){const ids=new Set();v.arr(t.pairs,p+'.pairs').forEach((o,j)=>{const q=p+'.pairs['+j+']';if(!v.shape(object(o),q,'Ожидается пара.'))return;v.id(o.id,q+'.id',ids);v.he(o.he,q+'.he');v.ru(o.label,q+'.label');});}

      if(t.audioTurnId!==undefined)ref(t.audioTurnId,p+'.audioTurnId',sceneTurnIds);
      if(t.model!==undefined)v.he(t.model,p+'.model');
      if(t.answers!==undefined)v.arr(t.answers,p+'.answers').forEach((h,j)=>v.he(h,p+'.answers['+j+']'));
      if(t.transfer!==undefined)v.shape(typeof t.transfer==='boolean',p+'.transfer','Нужно boolean.');
      if(t.spec!==undefined){
        const s=t.spec;
        if(!v.shape(object(s),p+'.spec','Ожидается спецификация.'))return;
        v.shape(['order','short','confirm','repeat','replacement'].includes(s.kind),p+'.spec.kind','Неизвестный вид проверки.');
        const requiredByKind = {
          order: ['expect', 'require'], short: ['expect', 'require'],
          confirm: ['card', 'claim'], replacement: ['next', 'prev', 'via'], repeat: []
        };
        for (const field of Object.hasOwn(requiredByKind, s.kind) ? requiredByKind[s.kind] : []) {
          v.shape(s[field] !== undefined, p + '.spec.' + field, 'Обязательное поле спецификации.');
        }
        for(const name of ['expect','card','claim','next','prev'])if(s[name]!==undefined&&v.shape(object(s[name]),p+'.spec.'+name,'Ожидаются значения слотов.'))for(const [k,val] of Object.entries(s[name])){
          ref(k,p+'.spec.'+name+'.'+k,slots);
          if(slots.has(k)&&!slots.get(k).has(val))v.add('REF_UNKNOWN',p+'.spec.'+name+'.'+k,'Неизвестное значение слота.');
        }if(s.require!==undefined)v.arr(s.require,p+'.spec.require').forEach((x,j)=>ref(x,p+'.spec.require['+j+']',slots));
        if(s.preferFrame!==undefined)refs(s.preferFrame,p+'.spec.preferFrame');
        if(s.via!==undefined)ref(s.via,p+'.spec.via');
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
      });
    }return v.issues;
  }
  const api={
    HE_FIELDS,validateLexicon,validateLesson
  };
  root.CourseFormat=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
