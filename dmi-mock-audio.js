/* Draft fixed-order Listening. Rejoining follows elapsed server time, never restarts the test. */
(function(){
'use strict';
let state=null;
function stop(){if(!state)return;clearInterval(state.timer);state.audio.pause();state.audio.removeAttribute('src');state.audio.load();state.host.replaceChildren();state=null;}
function update(host,a){
 if(!a||a.section!=='listening'||!a.listeningAudio){stop();return;}
 const data=a.listeningAudio;
 if(!Array.isArray(data.clips)||!data.clips.length){stop();return;}
 if(state&&state.id!==a.id)stop();
 if(!state){
 const title=document.createElement('h3');title.textContent='Listening recording';
 const audio=document.createElement('audio');audio.preload='metadata';audio.controls=false;
 const button=document.createElement('button');button.type='button';button.textContent='Join Listening at current position';
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const note=document.createElement('p');note.textContent='The test clock continues if audio stops. Rejoin at the current position; ask your teacher about missed audio. Answer saving continues separately.';
 host.replaceChildren(title,button,status,note,audio);
 state={host,id:a.id,audio,button,status,clips:data.clips,total:data.durationSeconds,started:Date.parse(a.startedAt),offset:Date.parse(a.serverNow)-Date.now(),index:-1,joined:false,wantPlay:false,failed:false};
 const s=state;
 function report(text){if(s.status.textContent!==text)s.status.textContent=text;}
 function locate(){
 const elapsed=Math.max(0,(Date.now()+s.offset-s.started)/1000);
 return {elapsed,index:s.clips.findIndex(c=>elapsed>=c.startSeconds&&elapsed<c.startSeconds+c.durationSeconds)};
 }
 async function sync(play){
 if(state!==s)return;
 const pos=locate();
 if(pos.index<0){s.audio.pause();s.button.disabled=true;report('Recording time finished. Use the remaining Listening review time.');return;}
 const clip=s.clips[pos.index],target=pos.elapsed-clip.startSeconds;
 if(s.index!==pos.index){s.index=pos.index;s.failed=false;s.audio.src=clip.url;s.audio.load();}
 if(s.audio.readyState<1){report('Loading recording. The test clock continues.');return;}
 if(!Number.isFinite(s.audio.duration)||Math.abs(s.audio.duration-clip.durationSeconds)>2){
 s.audio.pause();s.failed=true;report('Recording duration differs from the reviewed schedule. Ask your teacher.');return;
 }
 if(Math.abs(s.audio.currentTime-target)>1.5||play){try{s.audio.currentTime=Math.min(target,s.audio.duration);}catch(e){report('Cannot join the current audio position. Ask your teacher.');return;}}
 s.audio.playbackRate=1;
 if(play||s.joined&&s.audio.paused&&!s.failed){
 try{await s.audio.play();if(state===s){s.joined=true;s.wantPlay=false;report('Playing part '+(s.index+1)+' of '+s.clips.length+'.');}}
 catch(e){if(state===s){s.joined=false;s.wantPlay=false;report('Press Join Listening to allow audio. The test clock continues.');}}
 }else if(!s.joined)report('Press Join Listening. The test clock is running.');
 }
 s.button.onclick=()=>{if(s.failed)s.index=-1;s.failed=false;s.wantPlay=true;sync(true);};
 s.audio.addEventListener('loadedmetadata',()=>sync(s.joined||s.wantPlay));
 s.audio.addEventListener('canplay',()=>sync(false));
 s.audio.addEventListener('error',()=>{s.failed=true;report('Audio connection failed. Press Join Listening to rejoin at the current position, or ask your teacher.');});
 s.audio.addEventListener('waiting',()=>report('Audio is buffering. The test clock continues; missed audio is not replayed.'));
 s.audio.addEventListener('ratechange',()=>{if(s.audio.playbackRate!==1)s.audio.playbackRate=1;});
 s.audio.addEventListener('ended',()=>sync(false));
 s.sync=sync;s.timer=setInterval(()=>sync(false),500);sync(false);
 }
 state.offset=Date.parse(a.serverNow)-Date.now();
}
document.addEventListener('visibilitychange',()=>{if(state&&!document.hidden)state.sync(false);});
window.DMI_MOCK_AUDIO={update,stop};
})();
