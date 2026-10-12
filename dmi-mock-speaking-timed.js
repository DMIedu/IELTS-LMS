/* Disabled timed Speaking recording draft. No AI assessment or result release. */
(async()=>{
 'use strict';const $=id=>document.getElementById(id),sittingID=new URLSearchParams(location.search).get('sitting');
 if(!await DMI_AUTH.requireRole('student'))return;
 $('timed').hidden=false;let stream=null,mime=null,busy=false,running=false,last=null,receivedAt=0,expired=false,active=null,uploading=false,refreshing=false;
 const clips=new Map(),acknowledged=new Set();let tick=null,poll=null;
 function status(s){$('status').textContent=s;}
 function audioStatus(s){$('recording-status').textContent=s;}
 function live(){return stream&&stream.getAudioTracks().some(t=>t.readyState==='live');}
 function controls(){
  $('start').disabled=busy||running||!live()||!$('consent').checked;
  $('microphone').disabled=busy||!!active||live();$('resume').disabled=busy||refreshing;
  $('consent').disabled=running&&live();
  $('retry-uploads').hidden=![...clips.values()].some(c=>c.payload&&c.error);$('retry-uploads').disabled=uploading;
 }
 async function call(action,p={}){
  const r=await DMI_AUTH.call(action,{sittingID,consent:$('consent').checked,microphoneReady:!!live(),...p});
  if(!r||!r.ok)throw Error(r&&r.error||'Connection interrupted.');return r;
 }
 function now(){return last?new Date(last.serverNow).getTime()+performance.now()-receivedAt:0;}
 function showClips(){
  $('clips').replaceChildren();[1,2,3].forEach(part=>{
   const c=clips.get(part);if(!c&&!acknowledged.has(part))return;
   const p=document.createElement('p');p.textContent='Part '+part+' — '+(acknowledged.has(part)?'received; assessment pending':c.failed?'recording failed; ask your teacher':c.payload?c.error?'upload interrupted; retained on this page':'waiting for upload':c.blob?'preparing upload':'recording');
   $('clips').append(p);
  });controls();
 }
 async function flush(retry=false){
  if(uploading)return;uploading=true;controls();
  try{
   for(const part of [1,2,3]){
    if(acknowledged.has(part))continue;
    const c=clips.get(part);if(!c||!c.payload||c.failed||c.error&&!retry)break;
    try{
     const r=await call('uploadMockSpeaking',c.payload);
     if(!r.receipt||Number(r.receipt.part)!==part)throw Error('Upload receipt needs teacher review.');
     acknowledged.add(part);c.payload=null;c.blob=null;c.error=false;c.receipt=r.receipt;
     audioStatus('Part '+part+' acknowledged. Assessment pending.');showClips();
    }catch(e){c.error=true;audioStatus(e.message+' Keep this page open and retry saved uploads.');showClips();break;}
   }
  }finally{uploading=false;controls();}
 }
 function stopCapture(){
  if(active&&active.recorder.state==='recording')active.recorder.stop();
 }
 function releaseMicrophone(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;}
 function capture(window){
  if(!window||acknowledged.has(window.part)||clips.has(window.part)||active)return;
  if(!window.eligible||!window.recordingID){
   audioStatus('The start of Part '+window.part+' was missed. Ask your teacher; the timer cannot restart.');return;
  }
  if(!live()||!$('consent').checked){audioStatus('Check your microphone and consent before recording.');return;}
  const c={part:window.part,recordingID:window.recordingID,deadline:new Date(window.deadline).getTime(),chunks:[],payload:null,blob:null,failed:false,error:false,localStart:performance.now()};
  try{
   const recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:48000});c.recorder=recorder;active=c;clips.set(c.part,c);
   recorder.ondataavailable=e=>{if(e.data.size)c.chunks.push(e.data);};
   recorder.onerror=()=>{c.failed=true;audioStatus('Microphone recording failed. Ask your teacher.');stopCapture();};
   recorder.onstop=async()=>{
    if(active===c)active=null;
    if(c.failed){c.chunks=[];c.blob=null;showClips();return;}
    const duration=Math.max(1,(performance.now()-c.localStart)/1000);
    c.blob=new Blob(c.chunks,{type:recorder.mimeType});c.chunks=[];showClips();
    if(c.blob.size<64||c.blob.size>4194304){c.failed=true;c.blob=null;audioStatus('Recording size needs teacher review.');showClips();return;}
    try{
     const bytes=new Uint8Array(await c.blob.arrayBuffer());let raw='';
     for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));
     c.payload={part:c.part,recordingID:c.recordingID,requestID:crypto.randomUUID(),mime:c.blob.type,durationSeconds:duration,audioBase64:btoa(raw)};
     showClips();flush();
    }catch(e){c.failed=true;audioStatus('Recording could not be prepared. Keep this page open and ask your teacher.');showClips();}
    if(last&&last.status==='finished')releaseMicrophone();
    else if(last)capture(last.recordingWindow);
   };
   recorder.start(1000);audioStatus('Recording Part '+c.part+'.');showClips();
  }catch(e){c.failed=true;active=null;audioStatus(e.message+' Ask your teacher.');showClips();}
 }
 function draw(){
  if(!last)return;
  if(active&&now()>=active.deadline)stopCapture();
  if(!last.stage)return;
  const left=Math.max(0,Math.ceil((new Date(last.stage.deadline).getTime()-now())/1000));
  $('remaining').textContent=left+' seconds remaining';
  if(!left){$('prompt').textContent='Waiting for the next question from the server.';expired=true;}
 }
 function render(s){
  last=s;receivedAt=performance.now();expired=false;running=true;
  $('phase').textContent=s.stage?({part1:'Part 1 — Introduction',preparation:'Part 2 — Prepare',long_turn:'Part 2 — Speak',part3:'Part 3 — Discussion'}[s.stage.phase]||'Speaking'):'Speaking finished';
  $('prompt').textContent=s.stage?s.stage.prompt:'';$('remaining').textContent='';
  draw();if(active&&(!s.recordingWindow||s.recordingWindow.part!==active.part))stopCapture();
  capture(s.recordingWindow);
  if(s.status==='finished'){stopCapture();if(!active)releaseMicrophone();clearInterval(poll);}
  status(s.stage?'The server clock is running. Recording follows each Speaking stage.':'Timing finished. Keep this page open for pending uploads. Assessment pending.');controls();
 }
 async function refresh(start=false){
  if(refreshing)return;refreshing=true;controls();
  try{render((await call(start?'startMockSpeakingTimed':'resumeMockSpeakingTimed')).speaking);}
  catch(e){status(e.message+' Resume to reconnect; the clock will not restart.');if(expired)$('prompt').textContent='Timing unavailable. Resume or ask your teacher.';}
  finally{refreshing=false;controls();}
 }
 $('consent').onchange=controls;
 $('microphone').onclick=async()=>{
  busy=true;controls();
  try{
   if(!navigator.mediaDevices||!window.MediaRecorder)throw Error('Recording unavailable.');
   mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(v=>MediaRecorder.isTypeSupported(v));
   if(!mime)throw Error('Supported recording format unavailable.');
   stream=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!live())throw Error('Microphone unavailable.');
   stream.getAudioTracks().forEach(t=>t.addEventListener('ended',()=>{if(active){active.failed=true;stopCapture();audioStatus('Microphone disconnected; ask your teacher.');}}));
   status('Microphone ready. Audio records only during Speaking stages.');
   if(last&&last.status!=='finished')await refresh();
  }catch(e){releaseMicrophone();status(e.message);}
  finally{busy=false;controls();}
 };
 $('start').onclick=()=>refresh(true);$('resume').onclick=()=>refresh(false);$('retry-uploads').onclick=()=>flush(true);
 window.addEventListener('beforeunload',e=>{if(active||[...clips.values()].some(c=>c.blob||c.payload)){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',()=>{clearInterval(tick);clearInterval(poll);releaseMicrophone();});
 if(!/^MOCK-[a-f0-9]{24}$/.test(sittingID||'')){status('Open your assigned sitting first.');$('start').hidden=true;$('resume').hidden=true;return;}
 try{const r=await call('myMockSpeakingUploads');r.receipts.forEach(r=>acknowledged.add(Number(r.part)));showClips();}catch(e){audioStatus(e.message);}
 await refresh();tick=setInterval(draw,100);poll=setInterval(()=>{if(running&&last&&last.status!=='finished')refresh();},1000);controls();
})();
