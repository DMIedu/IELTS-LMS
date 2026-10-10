/* Synthetic silent WAV clips only. No live paper, audio provider or workbook. */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');let checks=0;const check=(n,v)=>{assert.ok(v,n);checks++;};
function wav(seconds){const rate=8000,size=rate*seconds*2,b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(36+size,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);return b;}
(async()=>{
const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']}),context=await browser.newContext(),page=await context.newPage();let failAudio=false,audioRequests=0;
await context.route('**/*',async route=>{const url=new URL(route.request().url()),rel=url.pathname.split('/').pop();
 if(url.hostname==='audio.example'){audioRequests++;if(failAudio)return route.abort();return route.fulfill({contentType:'audio/wav',body:wav(rel==='wrong.wav'?4:12)});}
 if(rel==='dmi-mock-audio.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,rel),'utf8')});
 return route.fulfill({contentType:'text/html',body:'<div id="host"></div><script src="dmi-mock-audio.js"></script>'});
});
await page.goto('https://draft.example/audio-fixture');
const timelineStarted=Date.now()-3000;
async function set(elapsed,section='listening',wrong=false){await page.evaluate(({elapsed,section,wrong,timelineStarted})=>{const now=timelineStarted+elapsed*1000;window.fixture={id:'synthetic-attempt',section,startedAt:new Date(timelineStarted).toISOString(),serverNow:new Date(now).toISOString(),listeningAudio:{durationSeconds:24,clips:[{url:'https://audio.example/'+(wrong?'wrong.wav':'one.wav'),startSeconds:0,durationSeconds:12},{url:'https://audio.example/two.wav',startSeconds:12,durationSeconds:12}]}};DMI_MOCK_AUDIO.update(document.getElementById('host'),fixture);},{elapsed,section,wrong,timelineStarted});}
await set(3);await page.waitForFunction(()=>document.querySelector('audio').readyState>=1);
check('no free seeking controls',await page.locator('audio').getAttribute('controls')===null);
check('playback requires candidate join',await page.locator('audio').evaluate(a=>a.paused));
await page.locator('button').click();await page.waitForFunction(()=>!document.querySelector('audio').paused);
await page.waitForFunction(()=>document.querySelector('audio').currentTime>=3&&document.querySelector('audio').currentTime<6,{},{timeout:5000});
console.log('Synthetic first join',await page.locator('audio').evaluate(a=>({time:a.currentTime,duration:a.duration,paused:a.paused,seekable:a.seekable.length})));
check('join follows elapsed server clock',await page.locator('audio').evaluate(a=>a.currentTime>=3&&a.currentTime<6));
await page.locator('audio').evaluate(a=>{a.currentTime=0;a.playbackRate=2;});await page.waitForTimeout(650);
check('seeking rejoins current timeline',await page.locator('audio').evaluate(a=>a.currentTime>=3));
check('speed stays normal',await page.locator('audio').evaluate(a=>a.playbackRate===1));
await set(14);await page.waitForFunction(()=>document.querySelector('audio').src.endsWith('two.wav')&&!document.querySelector('audio').paused);
check('ordered clip transition uses local offset',await page.locator('audio').evaluate(a=>a.currentTime>=2&&a.currentTime<5));
await page.reload();await set(17);await page.waitForFunction(()=>document.querySelector('audio').readyState>=1);await page.locator('button').click();await page.waitForFunction(()=>!document.querySelector('audio').paused);
check('refresh rejoins without restarting part',await page.locator('audio').evaluate(a=>a.src.endsWith('two.wav')&&a.currentTime>=5));
await set(25);check('review time stops playback',await page.locator('audio').evaluate(a=>a.paused)&&await page.locator('button').isDisabled());
await set(25,'reading');check('Reading removes audio and controls',await page.locator('audio').count()===0&&await page.locator('#host').textContent()==='');
await set(1,'listening',true);await page.getByText('Recording duration differs from the reviewed schedule. Ask your teacher.',{exact:true}).waitFor();
check('duration mismatch stops playback',await page.locator('audio').evaluate(a=>a.paused));
await page.evaluate(()=>DMI_MOCK_AUDIO.stop());failAudio=true;await set(1);await page.getByText('Audio connection failed. Press Join Listening to rejoin at the current position, or ask your teacher.',{exact:true}).waitFor();
check('audio failure reports recovery instruction',await page.locator('button').isEnabled());
failAudio=false;await page.locator('button').click();await page.waitForFunction(()=>!document.querySelector('audio').paused);
check('retry reloads failed media',audioRequests>=5);
check('retry follows current position',await page.locator('audio').evaluate(a=>a.currentTime>=1));
await page.evaluate(()=>DMI_MOCK_AUDIO.stop());await context.close();await browser.close();console.log(JSON.stringify({listeningBrowserChecks:checks,liveWorkbookWrites:0,realAudioReview:'PENDING'}));
})().catch(e=>{console.error(e);process.exit(1);});
