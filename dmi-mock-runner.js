/* Disabled rollout draft. Content arrives only through verified attempt APIs. */
(async function(){
'use strict';
const $=id=>document.getElementById(id),sittingID=new URLSearchParams(location.search).get('sitting');
const user=await DMI_AUTH.requireRole('student');if(!user)return;
$('runner').hidden=false;$('candidate').textContent=user.user.name+' · '+user.user.id;
let attempt=null,busy=false,dirty=false,pending=null,blocked=false,offset=0,rendered=null,expired=false;
const fields=()=>Array.from(document.querySelectorAll('[data-answer]'));
function message(text,bad){$('message').textContent=text;$('message').className=bad?'error':'success';}
function el(tag,text){const e=document.createElement(tag);e.textContent=text;return e;}
function editable(){return attempt&&attempt.section&&!attempt.sections[['listening','reading','writing'].indexOf(attempt.section)].closed&&!expired&&!blocked;}
function controls(){fields().forEach(f=>f.disabled=busy||!editable());$('save').disabled=busy||!editable();$('submit').disabled=busy||!editable();$('retry').hidden=!pending;$('retry').disabled=busy||blocked;$('resume').disabled=busy||dirty||!!pending;$('start').disabled=busy||!!attempt;}
async function call(action,p){const r=await DMI_AUTH.call(action,p);if(!r||!r.ok){const e=Error(r&&r.error||'Connection interrupted.');e.code=r&&r.code;throw e;}return r.attempt;}
function render(a,force){
 attempt=a;offset=new Date(a.serverNow).getTime()-Date.now();expired=false;
 $('start').hidden=true;$('exam').hidden=false;$('section').textContent=a.section?a.section.toUpperCase():'Written sections submitted';
 $('assessment').textContent='Assessment pending. Speaking is a separate slot.';
 const key=a.id+'|'+a.section;
 if(force||key!==rendered){
  rendered=key;dirty=false;$('questions').replaceChildren();$('passages').replaceChildren();
  if(a.content){
   $('instructions').textContent=a.content.instructions;
   a.content.passages.forEach(p=>{const box=el('article','');box.append(el('h3',p.title),el('p',p.text));$('passages').append(box);});
   a.content.questions.forEach(q=>{
    const label=el('label',q.id+'. '+q.prompt);label.htmlFor='answer-'+q.id;
    let input;
    if(q.options.length){input=el('select','');input.append(new Option('Choose an answer',''));q.options.forEach(o=>input.append(new Option(o,o)));}
    else{input=el(a.section==='writing'?'textarea':'input','');if(a.section==='writing')input.rows=14;else input.type='text';}
    input.id='answer-'+q.id;input.dataset.answer=q.id;input.maxLength=a.section==='writing'?12000:100;input.autocomplete='off';
    input.value=(a.answers||{})[q.id]||'';input.oninput=()=>{dirty=true;$('saved').textContent='Changes waiting to save';controls();};
    const box=el('div','');box.append(label,input);$('questions').append(box);
   });
  }else{$('instructions').textContent='Your acknowledged written answers are saved. No score has been released.';}
 }
 $('saved').textContent='Saved on server · revision '+a.revision;controls();tick();
}
function tick(){
 if(!attempt||!attempt.section){$('timer').textContent='Written sections complete';return;}
 const i=['listening','reading','writing'].indexOf(attempt.section),ms=new Date(attempt.deadlines[i]).getTime()-(Date.now()+offset);
 const s=Math.max(0,Math.ceil(ms/1000));$('timer').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
 if(ms<=0){expired=true;controls();$('saved').textContent=dirty||pending?'Time ended. Unacknowledged changes cannot be added late.':'Section time ended.';
  if(!busy&&!pending){dirty=false;resume(false);}
 }
}
async function run(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){
 message(e.message,true);
 if(['MOCK_REVISION_CONFLICT','MOCK_SECTION_CLOSED','MOCK_PAPER_CHANGED','UNAUTHENTICATED','ACCESS_EXPIRED'].includes(e.code)){
  blocked=true;$('saved').textContent='Saving paused. Keep this screen open and ask your teacher; unacknowledged text remains on this page.';
 }
}finally{busy=false;controls();}}
async function resume(force){await run(async()=>{const a=await call('resumeMockAttempt',{sittingID});blocked=false;render(a,force);message('Saved attempt restored.');});}
function payload(submit){const answers={};fields().forEach(f=>answers[f.dataset.answer]=f.value);
return {action:submit?'submitMockSection':'saveMockAnswers',params:{sittingID,attemptID:attempt.id,section:attempt.section,revision:attempt.revision,requestID:crypto.randomUUID(),answersJSON:JSON.stringify(answers)}};}
async function transmit(){await run(async()=>{
 const a=await call(pending.action,pending.params);pending=null;dirty=false;render(a,false);message('Answers acknowledged by the server.');
});}
$('save').onclick=()=>{if(!editable()||pending)return;pending=payload(false);transmit();};
$('submit').onclick=()=>{if(!editable()||pending)return;if(!confirm('Submit and lock this section? You cannot change its answers afterward.'))return;pending=payload(true);transmit();};
$('retry').onclick=()=>transmit();
$('resume').onclick=()=>resume(true);
$('start').onclick=()=>run(async()=>{const a=await call('startMockAttempt',{sittingID});render(a,true);message('Attempt started. Server deadlines apply.');});
window.addEventListener('beforeunload',e=>{if(dirty||pending){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
if(!/^MOCK-[a-f0-9]{24}$/.test(sittingID||'')){blocked=true;$('start').hidden=true;message('Open a valid assigned sitting first.',true);controls();return;}
await run(async()=>{try{render(await call('resumeMockAttempt',{sittingID}),true);}catch(e){if(e.code!=='MOCK_NOT_STARTED')throw e;message('No attempt has started. The server rollout gate remains required.');}});
setInterval(tick,1000);
setInterval(()=>{if(dirty&&!busy&&!pending&&editable()){pending=payload(false);transmit();}},8000);
})();
