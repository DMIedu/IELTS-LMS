/* Teacher-only draft; no release or estimated Speaking score. */
(async()=>{
'use strict';const $=id=>document.getElementById(id);
const auth=await DMI_AUTH.requireRole('teacher');if(!auth)return;
$('content').hidden=false;
let current=null,pending=null,busy=false;
function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
function status(value){$('status').textContent=value;}
async function call(action,p){const r=await DMI_AUTH.call(action,p);if(!r||!r.ok){const e=Error(r&&r.error||'Connection failed.');e.code=r&&r.code;throw e;}return r;}
function controls(){Array.from(document.querySelectorAll('button,input,select,textarea')).forEach(e=>e.disabled=busy||!!pending);
 $('retry').disabled=busy;$('retry').hidden=!pending;
 if(current&&!pending&&!busy)$('save').disabled=!current.sections[2].closed||!!current.paperProblem;
}
async function work(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){status(e.message);
 if(e.code&&['MOCK_REVIEW_CONFLICT','VALIDATION','MOCK_PAPER_CHANGED','MOCK_REVIEW_NOT_READY','FORBIDDEN'].includes(e.code)){pending=null;}
}finally{busy=false;controls();}}
function task(){const t=current.writingTasks.find(t=>t.task===Number($('task').value)),last=t.history[t.history.length-1];
 ['task','coherence','lexical','grammar'].forEach(k=>$('score-'+k).value=last?last.scores[k]:'');$('feedback').value=last?last.feedback:'';
 $('history').replaceChildren();t.history.forEach(r=>$('history').append(text('p',r.reviewedAt+' · '+r.teacherName+' · '+JSON.stringify(r.scores)+' · '+r.feedback)));
}
function show(r){current=r.review;$('review').hidden=false;$('identity').textContent=current.studentID+' · '+current.studentEmail+' · '+current.paper+' · '+current.paperVersion;
 $('answers').replaceChildren();current.sections.forEach(s=>{const box=text('section','');box.append(text('h3',s.name+(s.closed?' — closed':' — in progress')));
 const keys=new Set([...s.questions.map(q=>q.id),...Object.keys(s.answers)]);for(const id of keys){const q=s.questions.find(q=>q.id===id);
 box.append(text('p',id+'. '+(q?q.prompt:'Question text unavailable')));if(q&&q.chart)DMI_MOCK_CHART.render(box,q.chart);box.append(text('pre',s.answers[id]||'No acknowledged answer'));}$('answers').append(box);});
 $('warning').textContent=current.paperProblem||'Assessment remains pending. Saving a rubric does not release a student result.';task();controls();}
$('task').onchange=task;
$('load').onclick=()=>work(async()=>{const r=await call('listMockAttempts',{sittingID:$('sitting').value});$('attempt').replaceChildren();r.data.forEach(a=>{const o=text('option',a.studentName+' · '+a.studentID+(a.writtenComplete?' · written complete':' · in progress'));o.value=a.id;$('attempt').append(o);});status(r.data.length?'Choose an attempt.':'No attempts in this sitting.');});
$('open').onclick=()=>work(async()=>show(await call('getMockAttemptReview',{attemptID:$('attempt').value})));
async function send(){await work(async()=>{const r=await call('saveMockWritingReview',pending);pending=null;status('Teacher review saved. Results remain unreleased.');show(await call('getMockAttemptReview',{attemptID:current.id}));});}
$('form').onsubmit=e=>{e.preventDefault();if(!current||pending)return;
 const scores={};for(const k of ['task','coherence','lexical','grammar']){const raw=$('score-'+k).value;if(raw===''){status('Enter all four marks.');return;}scores[k]=Number(raw);}
 const t=current.writingTasks.find(t=>t.task===Number($('task').value));pending={attemptID:current.id,task:t.task,revision:t.revision,requestID:crypto.randomUUID(),scoresJSON:JSON.stringify(scores),feedback:$('feedback').value};send();
};
$('retry').onclick=send;
await work(async()=>{const r=await call('listMockSittings');r.data.forEach(s=>{const o=text('option',s.title+' · '+(s.paperTitle||s.paper));o.value=s.id;$('sitting').append(o);});status('Draft review only. Choose a sitting.');});
})();
