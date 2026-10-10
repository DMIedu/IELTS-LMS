/* Synthetic timed prompt service and fake microphone. No real paper/audio. */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');let checks=0;const check=(n,v)=>{assert.ok(v,n);checks++;};
(async()=>{const browser=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}),context=await browser.newContext(),page=await context.newPage();let begun=false,phase='part1',lost=false,calls=[];
await page.exposeFunction('timedCall',async(action,p)=>{
 calls.push({action,p});if(lost)throw Error('Synthetic outage');
 if(action==='startMockSpeakingTimed')begun=true;
 if(!begun)return{ok:false,error:'Start timed Speaking after the microphone preflight'};
 const now=Date.now();return{ok:true,speaking:{status:phase==='finished'?'finished':'in_progress',serverNow:new Date(now).toISOString(),startedAt:'2026-01-01T00:00:00Z',stage:phase==='finished'?null:{phase,part:phase==='part1'?1:2,prompt:phase==='part1'?'Synthetic introduction': 'Synthetic cue',deadline:new Date(now+60000).toISOString()}}};
});
await context.route('**/*',async route=>{
 const rel=new URL(route.request().url()).pathname.split('/').pop();
 if(rel==='dmi-auth.js')return route.fulfill({contentType:'text/javascript',body:"window.DMI_AUTH={requireRole:async()=>({role:'student'}),call:(a,p)=>window.timedCall(a,p)};"});
 const file=path.join(root,rel);if(fs.existsSync(file))return route.fulfill({contentType:rel.endsWith('.js')?'text/javascript':rel.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});return route.abort();
});
await page.goto('https://draft.example/mock-speaking-timed.html?sitting=MOCK-'+'a'.repeat(24));
await page.getByText(/Start timed Speaking after/).waitFor();
check('start blocked before preflight',await page.locator('#start').isDisabled());
await page.locator('#consent').check();check('consent alone insufficient',await page.locator('#start').isDisabled());
await page.locator('#microphone').click();await page.getByText('Microphone access checked. No audio recorded.',{exact:true}).waitFor();
check('preflight enables consented start',await page.locator('#start').isEnabled());await page.locator('#start').click();await page.getByText('Synthetic introduction',{exact:true}).waitFor();
check('start cannot reset running clock',await page.locator('#start').isDisabled());
check('start sends preflight and consent',calls.find(c=>c.action==='startMockSpeakingTimed').p.microphoneReady===true&&calls.find(c=>c.action==='startMockSpeakingTimed').p.consent===true);
phase='preparation';await page.locator('#resume').click();await page.getByText('Part 2 — Prepare',{exact:true}).waitFor();
check('preparation shows current cue',await page.locator('#prompt').textContent()==='Synthetic cue');
await page.reload();await page.getByText('Part 2 — Prepare',{exact:true}).waitFor();
check('refresh resumes without another start',calls.filter(c=>c.action==='startMockSpeakingTimed').length===1);
lost=true;await page.locator('#resume').click();await page.getByText(/Synthetic outage/).waitFor();
check('outage keeps clock locked',await page.locator('#start').isDisabled());lost=false;phase='long_turn';await page.locator('#resume').click();await page.getByText('Part 2 — Speak',{exact:true}).waitFor();
phase='finished';await page.locator('#resume').click();await page.getByText('Speaking finished',{exact:true}).waitFor();
check('finished hides private prompt',await page.locator('#prompt').textContent()==='');
check('finished cannot restart',await page.locator('#start').isDisabled());
await page.setViewportSize({width:390,height:844});check('mobile fits',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
check('no paper in browser storage',await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0));
await page.screenshot({path:path.join(root,'artifacts','mock-speaking-timed.png'),fullPage:true});
await browser.close();console.log(JSON.stringify({speakingTimedBrowserChecks:checks,realAudioRecorded:false}));})().catch(e=>{console.error(e);process.exit(1);});
