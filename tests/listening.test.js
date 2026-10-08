const fs=require('node:fs'),path=require('node:path');
async function runListeningTests(player,pages){
 let checks=0;function check(value,message){if(!value)throw Error(message);checks++;}
 class Node{
  constructor(){this.value='75';this.disabled=false;this.textContent='';this.attrs={};this.style={};this.classList={toggle:()=>{},add:()=>{},remove:()=>{}};}
  setAttribute(k,v){this.attrs[k]=v;}addEventListener(){}
 }
 function fixture(){
  const nodes=new Map(),revoked=[],events={};
  const audio=new Node();Object.assign(audio,{paused:true,currentTime:0,duration:NaN,loads:0,plays:0});
  audio.load=()=>{audio.loads++;audio.currentTime=0;audio.duration=NaN;};
  audio.pause=()=>{audio.paused=true;if(audio.onpause)audio.onpause();};
  const normalPlay=async()=>{audio.plays++;if(audio.reject)throw audio.reject;audio.paused=false;if(audio.onplaying)audio.onplaying();};
  audio.play=normalPlay;nodes.set('examAudio',audio);
  const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);},getElementsByName:()=>[],querySelectorAll:()=>[],addEventListener(){}};
  const window={addEventListener:(name,fn)=>events[name]=fn};
  let serial=0;const URL={createObjectURL:()=> 'blob:test-'+(++serial),revokeObjectURL:url=>revoked.push(url)};
  new Function('window','document','URL',player)(window,document,URL);
  return{nodes,audio,document,window,revoked,events,normalPlay,api:window.DMI_LISTENING};
 }
 function script(html){return Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)).find(m=>m[1].includes('const STORAGE_KEY'))[1];}
 function pageAPI(html,f){
  return new Function('document','DMI_LISTENING','localStorage',script(html)+'\nreturn {sources:PART_AUDIO_ONLINE,showPart,getScore,KEY,toggleAudioPlayback};')(f.document,f.api,{getItem:()=>null});
 }
 for(const [name,html] of Object.entries(pages)){
  const [all,book,test]=name.match(/book (\d+) listening test (\d+)/);
  const f=fixture(),p=pageAPI(html,f),root=book==='17'?'2022/06':book==='18'?'2023/06':'2024/07',ext=book==='19'?'m4a':'mp3';
  for(let part=1;part<=4;part++){
   const expected='https://ieltstrainingonline.com/wp-content/uploads/'+root+'/cam'+book+'-test'+test+'-part'+part+'.'+ext;
   check(p.sources[part]===expected,name+' source '+part+' must match published source');
   p.showPart(part);check(f.audio.src===expected,name+' part navigation must select matching audio');
  }
  check(html.includes('src="dmi-listening.js"') && html.indexOf('src="dmi-listening.js"')<html.indexOf('const STORAGE_KEY'),'Shared player loads before page code');
  check(!html.includes('PART_AUDIO_LOCAL')&&!html.includes('tabSrcLocalFolder')&&!html.includes('ytIframe'),'Missing media and unverified videos removed');
  check(Array.from({length:40},(_,i)=>i+1).every(q=>new RegExp('(?:id|name)="q'+q+'"').test(html)),'All 40 answer inputs exist');
  check(Object.keys(p.KEY).length===40,'All 40 answer keys retained');
  check(f.audio.plays===0,'Part navigation never autoplays');
  const loaded=f.audio.loads;f.audio.currentTime=17;p.showPart(4);
  check(f.audio.loads===loaded && f.audio.currentTime===17,'Question navigation within a part does not reset audio');
  await p.toggleAudioPlayback();check(!f.audio.paused && f.nodes.get('audioPlayBtn').textContent==='⏸','Page Play wrapper works');
 }
 const f=fixture(),a=f.api,n=id=>f.document.getElementById(id),source={1:'https://example.invalid/1.mp3',2:'https://example.invalid/2.mp3',3:'https://example.invalid/3.mp3',4:'https://example.invalid/4.mp3'};
 a.setup(source);a.showPart(1);
 check(f.audio.volume===0.75,'Initial header volume applied');
 check(n('tabSrcStream').attrs['aria-pressed']==='true','Online source active by default');
 check(n('audioScrubber').disabled && n('audioTimeLbl').textContent==='00:00 / 00:00','New source resets scrubber and time');
 f.audio.duration=120;f.audio.onloadedmetadata();
 check(!n('audioScrubber').disabled && n('audioStatusText').textContent.includes('ready'),'Metadata enables seeking');
 await a.toggle();check(!f.audio.paused && !n('audioPlayBtn').disabled && n('audioPlayBtn').attrs['aria-label']==='Pause audio','Play state synchronized');
 await a.toggle();check(f.audio.paused && n('audioPlayBtn').textContent==='▶','Pause state synchronized');
 a.scrub(50);check(f.audio.currentTime===60 && n('audioTimeLbl').textContent==='01:00 / 02:00','Seek updates time');
 a.volume(150);check(f.audio.volume===1 && n('headerVol').value===100,'Volume clamped');
 a.showPart(2);check(f.audio.src===source[2] && f.audio.paused,'Changing parts selects correct paused source');
 f.audio.duration=120;f.audio.onloadedmetadata();a.showPart(1);f.audio.duration=120;f.audio.onloadedmetadata();
 check(f.audio.currentTime===60,'Returning to a part restores its position');
 f.audio.onerror();
 check(n('audioStatusText').textContent.includes('could not load') && !n('audioPlayBtn').disabled,'Media error gives actionable recovery');
 check(n('audioExternalLink').href===source[1],'Separate player link points to the current part');
 const count=f.audio.loads;f.audio.reject=Object.assign(Error('blocked'),{name:'NotAllowedError'});
 await a.toggle();check(f.audio.loads===count+1 && n('audioStatusText').textContent.includes('Press Play'),'User-gesture rejection distinguished from missing audio');
 f.audio.reject=Object.assign(Error('unsupported'),{name:'NotSupportedError'});
 await a.toggle();check(n('audioStatusText').textContent.includes('could not load') && !n('audioPlayBtn').disabled,'Unsupported source handled without alert loop');
 delete f.audio.reject;
 await a.selectFile({target:{files:[{name:'correct.mp4',type:'video/mp4'}]}});
 check(f.audio.src.startsWith('blob:') && !f.audio.paused && n('tabSrcLocal').attrs['aria-pressed']==='true','Selected MP4 audio file plays');
 const blob=f.audio.src,loadCount=f.audio.loads;
 a.showPart(3);check(f.audio.src===blob && f.audio.loads===loadCount,'Selected file remains loaded across parts');
 check(n('audioExternalLink').href===source[3],'Separate online link follows part while file stays selected');
 await a.selectFile({target:{files:[]}});check(f.audio.src===blob,'Cancelling file dialog preserves playback');
 await a.selectFile({target:{files:[{name:'wrong.txt',type:'text/plain'}]}});
 check(f.audio.src===blob && n('audioStatusText').textContent.includes('Choose an audio file'),'Unsupported file leaves current source intact');
 await a.selectFile({target:{files:[{name:'next.m4a',type:'audio/mp4'}]}});
 check(f.revoked.includes(blob),'Replacing local file revokes old object URL');
 const replacement=f.audio.src;a.switchSource('stream');
 check(f.audio.src===source[3] && f.revoked.includes(replacement),'Switching online cleans up selected file');
 f.audio.duration=Infinity;a.scrub(50);f.audio.ontimeupdate();
 check(n('audioScrubber').disabled && !n('audioTimeLbl').textContent.includes('Infinity'),'Unknown duration does not allow invalid seeking');
 let resolvePlay;f.audio.play=()=>new Promise(resolve=>resolvePlay=resolve);
 const pending=a.toggle();a.showPart(4);resolvePlay();await pending;
 check(f.audio.src===source[4] && !n('audioPlayBtn').disabled,'Pending play cannot corrupt controls after part change');
 f.audio.play=f.normalPlay;
 await a.selectFile({target:{files:[{name:'last.wav',type:'audio/wav'}]}});
 const last=f.audio.src;f.events.beforeunload();
 check(f.revoked.includes(last),'Page unload releases selected file URL');
 return checks;
}
if(require.main===module){
 const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
 const pages=Object.fromEntries(fs.readdirSync(root).filter(n=>/^book \d+ listening test \d+\.html$/.test(n)).map(n=>[n,read(n)]));
 runListeningTests(read('dmi-listening.js'),pages).then(n=>console.log(n+' listening checks passed')).catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={runListeningTests};
