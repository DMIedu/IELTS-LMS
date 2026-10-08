/* Shared listening controls. Playback requires a student's Play click.
 * Sources are per-part; a selected disk file stays loaded across navigation.
 * No media is downloaded or copied into this repository.
 */
(function(){
  const byId=id=>document.getElementById(id);
  let audio,sources={},part=1,mode='stream',loaded='',blob='',fileName='',revision=0,failed=false;
  const positions=new Map();
  function status(text){byId('audioStatusText').textContent=text;}
  function button(playing){
    const b=byId('audioPlayBtn');b.textContent=playing?'⏸':'▶';
    b.setAttribute('aria-label',playing?'Pause audio':'Play audio');
  }
  function tabs(){
    ['stream','local'].forEach(m=>{const b=byId(m==='stream'?'tabSrcStream':'tabSrcLocal');
      b.classList.toggle('active',m===mode);b.setAttribute('aria-pressed',String(m===mode));});
  }
  function time(value){
    const n=Number.isFinite(value)&&value>=0?Math.floor(value):0;
    return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  }
  function updateTime(){
    const duration=audio.duration,valid=Number.isFinite(duration)&&duration>0;
    byId('audioScrubber').disabled=!valid;
    byId('audioScrubber').value=valid?Math.min(100,audio.currentTime/duration*100):0;
    byId('audioTimeLbl').textContent=time(audio.currentTime)+' / '+time(valid?duration:0);
  }
  function savePosition(){if(loaded && Number.isFinite(audio.currentTime))positions.set(loaded,audio.currentTime);}
  function externalLink(){
    const link=byId('audioExternalLink');link.href=sources[part];
    link.textContent='Open Part '+part+' audio separately';
  }
  function unavailable(){status('Audio could not load. Open this part’s audio separately or choose the matching audio file from your device.');}
  function load(url,force){
    if(!force && loaded===url)return;
    savePosition();audio.pause();revision++;failed=false;
    loaded=url;audio.src=url;audio.load();
    byId('audioPlayBtn').disabled=false;button(false);
    byId('audioScrubber').value=0;byId('audioScrubber').disabled=true;
    byId('audioTimeLbl').textContent='00:00 / 00:00';
    status(mode==='stream'?'Loading Part '+part+' audio…':'Loading selected audio file…');
  }
  function setup(config){
    if(audio)return;
    sources=Object.assign({},config);audio=byId('examAudio');
    audio.preload='metadata';
    audio.onloadedmetadata=()=>{
      const saved=positions.get(loaded)||0;
      if(Number.isFinite(audio.duration)&&saved>0&&saved<audio.duration)audio.currentTime=saved;
      updateTime();
      if(!failed && audio.paused)status(mode==='stream'?'Part '+part+' audio ready. Press Play.':'Selected file: '+fileName+'. Press Play.');
    };
    audio.ontimeupdate=updateTime;
    audio.onplaying=()=>{failed=false;button(true);status(mode==='stream'?'Playing Part '+part+' audio.':'Playing selected file: '+fileName);};
    audio.onpause=()=>button(false);
    audio.onended=()=>{button(false);status('Audio finished. Select the next part when you are ready.');};
    audio.onwaiting=()=>{if(!audio.paused)status('Audio is buffering…');};
    audio.onerror=()=>{failed=true;revision++;byId('audioPlayBtn').disabled=false;button(false);unavailable();};
    byId('audioExternalLink').onclick=()=>audio.pause();
    volume(byId('headerVol').value);
    window.addEventListener('beforeunload',()=>{if(blob)URL.revokeObjectURL(blob);});
    tabs();externalLink();
  }
  function showPart(value){
    const next=Number(value);if(![1,2,3,4].includes(next))return;
    part=next;externalLink();
    if(mode==='stream')load(sources[part],false);
  }
  async function toggle(){
    if(!audio)return;
    if(!audio.paused){audio.pause();status('Audio paused. Press Play to continue.');return;}
    if(failed)load(loaded,true);
    const requestRevision=revision;byId('audioPlayBtn').disabled=true;
    try{await audio.play();}
    catch(error){
      if(requestRevision!==revision)return;
      button(false);
      if(error.name==='NotAllowedError')status('Your browser paused audio. Press Play to start.');
      else if(error.name!=='AbortError'){failed=true;unavailable();}
    }finally{if(requestRevision===revision)byId('audioPlayBtn').disabled=false;}
  }
  function switchSource(next){
    if(next!=='stream' || !audio)return;
    mode='stream';tabs();load(sources[part],failed);
    if(blob){URL.revokeObjectURL(blob);positions.delete(blob);blob='';fileName='';}
  }
  async function selectFile(event){
    const file=event.target.files && event.target.files[0];if(!file)return;
    if(!/^(audio\/|video\/mp4)/i.test(file.type||'') && !/\.(mp3|m4a|mp4|wav|ogg|aac|flac|webm)$/i.test(file.name)){
      status('Choose an audio file such as MP3, M4A or WAV.');return;
    }
    const old=blob;blob=URL.createObjectURL(file);fileName=file.name;mode='local';
    tabs();load(blob,false);
    if(old){URL.revokeObjectURL(old);positions.delete(old);}
    await toggle();
  }
  function scrub(value){
    if(audio && Number.isFinite(audio.duration)&&audio.duration>0){
      const percent=Number(value);if(Number.isFinite(percent))audio.currentTime=Math.max(0,Math.min(100,percent))/100*audio.duration;
      updateTime();
    }
  }
  function volume(value){
    const percent=Number(value);if(!Number.isFinite(percent))return;
    const v=Math.max(0,Math.min(100,percent));if(audio)audio.volume=v/100;
    if(byId('headerVol'))byId('headerVol').value=v;
  }
  window.DMI_LISTENING={setup,showPart,toggle,scrub,volume,switchSource,selectFile};
})();
