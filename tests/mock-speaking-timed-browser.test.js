/* Synthetic shortened windows, real Chromium MediaRecorder and fake receipts. No real students/Drive. */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');let checks=0;const check=(n,v)=>{assert.ok(v,n);checks++;};
(async()=>{
 const browser=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}),context=await browser.newContext(),page=await context.newPage();
 let begun=false,phase='part1',question=1,windowStart=0,windowEnd=0,receipts=[],requests=[],lose=true;
 await context.addInitScript(()=>{const Native=window.MediaRecorder;window.syntheticRecorders=[];function Wrapped(...args){const r=new Native(...args);window.syntheticRecorders.push(r);return r;}Wrapped.isTypeSupported=Native.isTypeSupported.bind(Native);Wrapped.prototype=Native.prototype;window.MediaRecorder=Wrapped;});
 await page.exposeFunction('timedCall',async(action,p)=>{
  if(action==='myMockSpeakingUploads')return{ok:true,receipts};
  if(action==='uploadMockSpeaking'){
   requests.push(p);const prior=receipts.find(r=>r.requestID===p.requestID);
   if(!prior)receipts.push({id:'AUDIO-'+p.part,part:p.part,requestID:p.requestID});
   if(lose){lose=false;throw Error('Synthetic lost acknowledgement');}
   return{ok:true,receipt:prior||receipts.at(-1)};
  }
  if(action==='startMockSpeakingTimed'&&!begun){begun=true;windowStart=Date.now();windowEnd=windowStart+3000;}
  if(!begun)return{ok:false,error:'Start timed Speaking after the microphone preflight'};
  const now=Date.now(),part=phase==='part1'?1:phase==='part3'?3:2,recordable=!['preparation','finished'].includes(phase);
  return{ok:true,speaking:{status:phase==='finished'?'finished':'in_progress',serverNow:new Date(now).toISOString(),startedAt:new Date(windowStart).toISOString(),
   stage:phase==='finished'?null:{phase,part,prompt:phase==='part1'?'Synthetic introduction '+question:'Synthetic '+phase,deadline:new Date(windowEnd).toISOString()},
   recordingWindow:recordable?{part,startedAt:new Date(windowStart).toISOString(),deadline:new Date(windowEnd).toISOString(),eligible:true,recordingID:'synthetic-ticket-'+part}:null}};
 });
 await context.route('**/*',async route=>{
  const rel=new URL(route.request().url()).pathname.split('/').pop();
  if(rel==='dmi-auth.js')return route.fulfill({contentType:'text/javascript',body:"window.DMI_AUTH={requireRole:async()=>({role:'student'}),call:(a,p)=>window.timedCall(a,p)};"});
  const file=path.join(root,rel);if(fs.existsSync(file))return route.fulfill({contentType:rel.endsWith('.js')?'text/javascript':rel.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});return route.abort();
 });
 await page.goto('https://draft.example/mock-speaking-timed.html?sitting=MOCK-'+'a'.repeat(24));
 await page.getByText(/Start timed Speaking after/).waitFor();
 check('start requires microphone and consent',await page.locator('#start').isDisabled());
 await page.locator('#consent').check();check('consent alone cannot start',await page.locator('#start').isDisabled());
 await page.locator('#microphone').click();await page.getByText('Microphone ready. Audio records only during Speaking stages.',{exact:true}).waitFor();
 check('preflight itself records no audio',await page.evaluate(()=>syntheticRecorders.length===0));
 await page.locator('#start').click();await page.getByText('Recording Part 1.',{exact:true}).waitFor();
 check('first part records automatically',await page.evaluate(()=>syntheticRecorders.length===1&&syntheticRecorders[0].state==='recording'));
 question=2;await page.locator('#resume').click();await page.getByText('Synthetic introduction 2',{exact:true}).waitFor();
 check('new question keeps same part recording',await page.evaluate(()=>syntheticRecorders.length===1));
 await page.locator('#retry-uploads').waitFor({state:'visible',timeout:10000});
 check('part stops automatically at deadline',await page.evaluate(()=>syntheticRecorders[0].state==='inactive'));
 check('first audio is queued with fixed ticket',requests.length===1&&requests[0].recordingID==='synthetic-ticket-1'&&requests[0].audioBase64.length>32);
 phase='preparation';await page.locator('#resume').click();await page.getByText('Part 2 — Prepare',{exact:true}).waitFor();
 check('preparation has no audio recorder',await page.evaluate(()=>syntheticRecorders.length===1));
 phase='long_turn';windowStart=Date.now();windowEnd=windowStart+2200;await page.locator('#resume').click();await page.getByText('Recording Part 2.',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.getElementById('clips').textContent.includes('Part 2 — waiting for upload'),{},{timeout:10000});
 check('later recording survives earlier lost response',requests.length===1&&await page.evaluate(()=>syntheticRecorders.length===2));
 phase='part3';windowStart=Date.now();windowEnd=windowStart+2200;await page.locator('#resume').click();await page.getByText('Recording Part 3.',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.getElementById('clips').textContent.includes('Part 3 — waiting for upload'),{},{timeout:10000});
 check('all pending clips retained separately',await page.locator('#clips p').count()===3);
 await page.locator('#retry-uploads').click();
 await page.waitForFunction(()=>document.getElementById('clips').textContent.split('received; assessment pending').length===4);
 check('exact failed upload retried unchanged',requests.length===4&&JSON.stringify(requests[0])===JSON.stringify(requests[1]));
 check('server receives each part once',receipts.length===3&&receipts.map(r=>r.part).join(',')==='1,2,3');
 check('later clips use separate fixed ticket identities',requests[2].recordingID==='synthetic-ticket-2'&&requests[3].recordingID==='synthetic-ticket-3');
 phase='finished';await page.locator('#resume').click();await page.getByText('Speaking finished',{exact:true}).waitFor();
 check('finished releases microphone',await page.evaluate(()=>syntheticRecorders.every(r=>r.stream.getTracks().every(t=>t.readyState==='ended'))));
 check('no raw audio browser storage',await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0));
 await page.reload();await page.waitForFunction(()=>document.getElementById('clips').textContent.split('received; assessment pending').length===4);
 check('refresh restores receipts without rerecording',await page.evaluate(()=>syntheticRecorders.length===0));
 check('completed timed test cannot restart',await page.locator('#start').isDisabled());
 await page.setViewportSize({width:390,height:844});check('mobile fits',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts','mock-speaking-timed.png'),fullPage:true});
 receipts=[];requests=[];begun=false;phase='part1';lose=false;await page.reload();await page.getByText(/Start timed Speaking after/).waitFor();
 await page.locator('#consent').check();await page.locator('#microphone').click();await page.locator('#start').click();await page.getByText('Recording Part 1.',{exact:true}).waitFor();
 await page.evaluate(()=>syntheticRecorders[0].dispatchEvent(new Event('error')));
 await page.waitForFunction(()=>document.getElementById('clips').textContent.includes('recording failed'));
 check('microphone error produces no upload',requests.length===0);
 await browser.close();console.log(JSON.stringify({speakingTimedBrowserChecks:checks,realAudioUploads:0,assessment:'PENDING'}));
})().catch(e=>{console.error(e);process.exit(1);});
