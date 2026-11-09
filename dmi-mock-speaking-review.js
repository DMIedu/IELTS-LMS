/* Teacher-only private playback and append-only notes. No AI scoring or result release. */
(async()=>{
 'use strict';const $=id=>document.getElementById(id),attemptID=new URLSearchParams(location.search).get('attempt');
 if(!await DMI_AUTH.requireRole('teacher'))return;$('speaking-review').hidden=false;
 let current=null,busy=false,pending=null,url=null,baseline='',sessionChanged=false;
 function status(v){$('speaking-status').textContent=v;}
 function part(){return current&&current.parts.find(p=>p.part===Number($('speaking-part').value));}
 function controls(){
  const blocked=busy||!!pending;['speaking-part','speaking-play','speaking-feedback','speaking-save','speaking-reload'].forEach(id=>$(id).disabled=blocked);
  if(!blocked){$('speaking-play').disabled=!part()||!part().receipt;$('speaking-save').disabled=!part()||!part().receipt;}
  $('speaking-retry').hidden=!pending;$('speaking-retry').disabled=busy;
 }
 async function call(action,p={}){
  if(sessionChanged)throw Error('Sign in again to review recordings.');
  const r=await DMI_AUTH.call(action,{attemptID,...p});if(sessionChanged)throw Error('Sign in again to review recordings.');if(!r||!r.ok){const e=Error(r&&r.error||'Connection interrupted.');e.code=r&&r.code;throw e;}return r;
 }
 function closeAudio(){
  const audio=$('speaking-audio');audio.pause();audio.removeAttribute('src');audio.load();audio.hidden=true;
  if(url)URL.revokeObjectURL(url);url=null;
 }
 function showPart(){
  closeAudio();const p=part(),latest=p&&p.history.at(-1);
  $('speaking-receipt').textContent=p&&p.receipt?'Part '+p.part+' received · '+p.receipt.id+' · assessment pending':'No acknowledged recording for this part.';
  baseline=latest?latest.feedback:'';$('speaking-feedback').value=baseline;$('speaking-history').replaceChildren();
  if(p)p.history.forEach(r=>{const e=document.createElement('p');e.textContent=r.reviewedAt+' · '+r.teacherName+' · '+r.feedback;$('speaking-history').append(e);});controls();
 }
 async function reload(){
  if(busy||pending)return;busy=true;controls();
  try{const r=await call('getMockSpeakingReview');current=r.review;$('speaking-identity').textContent=current.studentID+' · '+current.studentEmail;showPart();status('Private review loaded. Assessment pending.');}
  catch(e){status(e.message);}finally{busy=false;controls();}
 }
 $('speaking-part').onchange=showPart;$('speaking-close').onclick=closeAudio;
 $('speaking-audio').onended=closeAudio;$('speaking-audio').onerror=()=>{closeAudio();status('The recording cannot play in this browser. Ask the owner to review its format.');};
 $('speaking-play').onclick=async()=>{
  if(busy||pending||!part()||!part().receipt)return;busy=true;controls();closeAudio();
  try{
   const p=part(),r=await call('getMockSpeakingRecording',{part:p.part,receiptID:p.receipt.id}),recording=r.recording;
   if(!recording||recording.receiptID!==p.receipt.id||recording.audioBase64.length>5600000||!recording.mime.startsWith('audio/'))throw Error('Recording response needs owner review.');
   const raw=atob(recording.audioBase64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
   url=URL.createObjectURL(new Blob([bytes],{type:recording.mime}));$('speaking-audio').src=url;$('speaking-audio').hidden=false;
   status('Private recording loaded. Press Play to listen; assessment remains pending.');
  }catch(e){closeAudio();status(e.message);}finally{busy=false;controls();}
 };
 async function save(){
  if(busy||!pending)return;busy=true;controls();
  try{
   const r=await call('saveMockSpeakingReview',pending),p=part();
   if(!p.history.some(n=>n.id===r.saved.id))p.history.push(r.saved);p.revision=r.saved.revision;pending=null;showPart();status('Teacher note acknowledged. Assessment pending.');
  }catch(e){status(e.message);if(['VALIDATION','MOCK_REVIEW_CONFLICT','FORBIDDEN','NOT_FOUND'].includes(e.code))pending=null;}
  finally{busy=false;controls();}
 }
 $('speaking-form').onsubmit=e=>{
  e.preventDefault();if(busy||pending||!part()||!part().receipt)return;
  const p=part(),feedback=$('speaking-feedback').value.trim();if(!feedback){status('Enter a review note.');return;}
  pending={part:p.part,receiptID:p.receipt.id,revision:p.revision,feedback,requestID:crypto.randomUUID()};save();
 };
 $('speaking-retry').onclick=save;$('speaking-reload').onclick=reload;
 window.addEventListener('beforeunload',e=>{if(pending||$('speaking-feedback').value!==baseline){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',closeAudio);
 window.addEventListener('storage',e=>{
  if(e.key!==null&&e.key!=='dmi_lms_token')return;
  sessionChanged=true;closeAudio();current=null;pending=null;baseline='';
  $('speaking-feedback').value='';$('speaking-history').replaceChildren();$('speaking-identity').textContent='';$('speaking-receipt').textContent='';
  $('speaking-review').hidden=true;
 });
 if(!/^ATTEMPT-[a-f0-9]{24}$/.test(attemptID||'')){status('Open a candidate from the written review page.');controls();return;}
 await reload();
})();
