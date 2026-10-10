/* Capture rehearsal only; timed Speaking prompts and assessment are not enabled. */
(async()=>{
'use strict';const $=id=>document.getElementById(id),sittingID=new URLSearchParams(location.search).get('sitting');
const auth=await DMI_AUTH.requireRole('student');if(!auth)return;
$('capture').hidden=false;let stream=null,recorder=null,chunks=[],pending=null,blob=null,start=0,duration=0,timer=null,busy=false,uploaded=[];
function say(s){$('status').textContent=s;}
function controls(){const recording=recorder&&recorder.state==='recording';$('record').disabled=busy||recording||!!blob||!!pending||!$('consent').checked||uploaded.includes(Number($('part').value));$('stop').disabled=!recording;$('upload').disabled=busy||recording||!blob;$('part').disabled=busy||recording||!!blob||!!pending;$('consent').disabled=recording||!!pending;$('retry').hidden=!pending;$('retry').disabled=busy;}
async function call(action,p){const r=await DMI_AUTH.call(action,{sittingID,...p});if(!r||!r.ok)throw Error(r&&r.error||'Connection interrupted.');return r;}
function cleanup(){clearInterval(timer);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;}
function receipts(r){uploaded=r.receipts.map(r=>r.part);$('receipts').replaceChildren();r.receipts.forEach(r=>{const p=document.createElement('p');p.textContent='Part '+r.part+' received · '+r.id+' · assessment pending';$('receipts').append(p);});controls();}
$('consent').onchange=controls;$('part').onchange=controls;
$('record').onclick=async()=>{
 if(!navigator.mediaDevices||!window.MediaRecorder){say('Recording is unavailable in this browser. Ask your teacher.');return;}
 busy=true;controls();
 try{
 stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];
 const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(m=>MediaRecorder.isTypeSupported(m));if(!mime)throw Error('No supported recording format.');
 recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:48000});const part=Number($('part').value);
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 recorder.onerror=()=>{say('Microphone recording failed. Ask your teacher before continuing.');if(recorder.state==='recording')recorder.stop();};
 recorder.onstop=()=>{duration=Math.max(1,(Date.now()-start)/1000);blob=new Blob(chunks,{type:recorder.mimeType});chunks=[];cleanup();say('Recording held on this page. Upload it before closing or refreshing.');controls();};
 start=Date.now();recorder.start(1000);say('Recording part '+part+'.');
 timer=setInterval(()=>{const elapsed=(Date.now()-start)/1000;$('elapsed').textContent=Math.floor(elapsed)+' seconds';if(elapsed>=(part===2?120:350)&&recorder.state==='recording')recorder.stop();},250);
 }catch(e){cleanup();say(e.message);}finally{busy=false;controls();}
};
$('stop').onclick=()=>{if(recorder&&recorder.state==='recording')recorder.stop();};
async function transmit(){
 if(busy||!pending)return;busy=true;controls();
 try{const r=await call('uploadMockSpeaking',pending);pending=null;blob=null;duration=0;recorder=null;say('Recording acknowledged by the server. Assessment pending.');uploaded.push(r.receipt.part);const p=document.createElement('p');p.textContent='Part '+r.receipt.part+' received · '+r.receipt.id+' · assessment pending';$('receipts').append(p);controls();}
 catch(e){say(e.message+' Keep this page open and retry the same upload.');}finally{busy=false;controls();}
}
$('upload').onclick=async()=>{
 if(busy||!blob)return;if(pending){transmit();return;}
 if(blob.size>4194304){say('Recording exceeds 4 MB. Keep this page open and ask your teacher.');return;}
 busy=true;controls();try{
 const bytes=new Uint8Array(await blob.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));
 pending={part:Number($('part').value),requestID:crypto.randomUUID(),mime:blob.type,durationSeconds:duration,audioBase64:btoa(raw)};
 }catch(e){say(e.message);}finally{busy=false;controls();}if(pending)transmit();
};
$('retry').onclick=transmit;
window.addEventListener('beforeunload',e=>{if(blob||pending||recorder&&recorder.state==='recording'){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',cleanup);
if(!/^MOCK-[a-f0-9]{24}$/.test(sittingID||'')){say('Open an assigned sitting first.');$('record').hidden=true;return;}
try{receipts(await call('myMockSpeakingUploads',{}));say('Capture rehearsal only. Follow the teacher’s instructions; no AI band is generated.');}
catch(e){say(e.message);$('record').hidden=true;}$('stop').disabled=true;controls();
})();
