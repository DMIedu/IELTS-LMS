/* Disabled timed prompt rehearsal. Does not capture or assess audio. */
(async()=>{
 'use strict';const $=id=>document.getElementById(id),sittingID=new URLSearchParams(location.search).get('sitting');
 if(!await DMI_AUTH.requireRole('student'))return;
 $('timed').hidden=false;let microphoneReady=false,busy=false,running=false,last=null,receivedAt=0,tick=null,poll=null,expired=false;
 function status(s){$('status').textContent=s;}
 function controls(){$('start').disabled=busy||running||!microphoneReady||!$('consent').checked;$('microphone').disabled=busy||running;$('resume').disabled=busy;}
 async function call(action){const r=await DMI_AUTH.call(action,{sittingID,consent:$('consent').checked,microphoneReady});if(!r||!r.ok)throw Error(r&&r.error||'Timing connection interrupted.');return r.speaking;}
 function draw(){
  if(!last||!last.stage)return;
  const now=new Date(last.serverNow).getTime()+(performance.now()-receivedAt),left=Math.max(0,Math.ceil((new Date(last.stage.deadline).getTime()-now)/1000));
  $('remaining').textContent=left+' seconds remaining';
  if(!left){$('prompt').textContent='Waiting for the next question from the server.';expired=true;}
 }
 function render(s){
  last=s;receivedAt=performance.now();expired=false;running=true;
  $('phase').textContent=s.stage?({part1:'Part 1 — Introduction',preparation:'Part 2 — Prepare',long_turn:'Part 2 — Speak',part3:'Part 3 — Discussion'}[s.stage.phase]||'Speaking'):'Speaking finished';
  $('prompt').textContent=s.stage?s.stage.prompt:'';$('remaining').textContent='';
  clearInterval(tick);clearInterval(poll);
  if(s.stage){draw();tick=setInterval(draw,250);poll=setInterval(()=>refresh(false),2000);}
  status(s.stage?'The server clock is running. This rehearsal does not record audio.':'Timing finished. Assessment pending.');controls();
 }
 async function refresh(start){
  if(busy)return;busy=true;controls();
  try{render(await call(start?'startMockSpeakingTimed':'resumeMockSpeakingTimed'));}
  catch(e){status(e.message+' Resume to reconnect; the clock will not restart.');if(expired)$('prompt').textContent='Timing unavailable. Resume or ask your teacher.';}
  finally{busy=false;controls();}
 }
 $('consent').onchange=controls;
 $('microphone').onclick=async()=>{
  busy=true;controls();let stream;
  try{if(!navigator.mediaDevices)throw Error('Microphone unavailable.');stream=await navigator.mediaDevices.getUserMedia({audio:true});microphoneReady=stream.getAudioTracks().some(t=>t.readyState==='live');status(microphoneReady?'Microphone access checked. No audio recorded.':'Microphone unavailable.');}
  catch(e){microphoneReady=false;status(e.message);}
  finally{if(stream)stream.getTracks().forEach(t=>t.stop());busy=false;controls();}
 };
 $('start').onclick=()=>refresh(true);$('resume').onclick=()=>refresh(false);
 window.addEventListener('pagehide',()=>{clearInterval(tick);clearInterval(poll);});
 if(!/^MOCK-[a-f0-9]{24}$/.test(sittingID||'')){status('Open your assigned sitting first.');$('start').hidden=true;$('resume').hidden=true;return;}
 await refresh(false);controls();
})();
