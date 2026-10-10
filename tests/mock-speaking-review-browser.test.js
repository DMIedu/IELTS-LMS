/* Synthetic teacher audio and fake append-only notes; no real candidate/Drive data. */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');let checks=0;const check=(n,v)=>{assert.ok(v,n);checks++;};
(async()=>{
 const browser=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}),context=await browser.newContext(),page=await context.newPage();
 let role='teacher',notes=[],requests=[],lose=true,audioBase64='',reads=0;
 await context.addInitScript(()=>{const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.syntheticURLs=[];window.syntheticRevoked=[];URL.createObjectURL=b=>{const u=create(b);syntheticURLs.push(u);return u;};URL.revokeObjectURL=u=>{syntheticRevoked.push(u);revoke(u);};});
 await page.exposeFunction('reviewRole',()=>role);
 await page.exposeFunction('speakingReviewCall',async(a,p)=>{
  if(a==='getMockSpeakingReview')return{ok:true,review:{attemptID:p.attemptID,studentID:'SYNTHETIC',studentEmail:'synthetic@example.com',parts:[1,2,3].map(part=>({part,receipt:part===1?{id:'AUDIO-synthetic',part}:null,revision:part===1?notes.length:0,history:part===1?notes:[]}))}};
  if(a==='getMockSpeakingRecording'){reads++;return{ok:true,recording:{receiptID:'AUDIO-synthetic',part:1,mime:'audio/webm;codecs=opus',audioBase64}};}
  if(a==='saveMockSpeakingReview'){
   requests.push(p);let saved=notes.find(n=>n.requestID===p.requestID);
   if(!saved){
    if(p.revision!==notes.length)return{ok:false,code:'MOCK_REVIEW_CONFLICT',error:'A newer Speaking note exists. Reload before saving.'};
    saved={id:'NOTE-'+(notes.length+1),part:1,receiptID:p.receiptID,feedback:p.feedback,teacherName:'Synthetic Teacher',reviewedAt:'2026-01-01T00:00:00Z',revision:notes.length+1,requestID:p.requestID};notes.push(saved);
   }
   if(lose){lose=false;throw Error('Synthetic lost note response');}return{ok:true,saved};
  }return{ok:false,error:'Unsupported'};
 });
 await context.route('**/*',async route=>{
  const rel=new URL(route.request().url()).pathname.split('/').pop();
  if(rel==='fixture.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic audio fixture</title>'});
  if(rel==='dmi-auth.js')return route.fulfill({contentType:'text/javascript',body:"window.DMI_AUTH={requireRole:async(role)=>(await window.reviewRole())===role?{role}:null,call:(a,p)=>window.speakingReviewCall(a,p)};"});
  const file=path.join(root,rel);if(fs.existsSync(file))return route.fulfill({contentType:rel.endsWith('.js')?'text/javascript':rel.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});return route.abort();
 });
 await page.goto('https://draft.example/fixture.html');
 audioBase64=await page.evaluate(async()=>{const s=await navigator.mediaDevices.getUserMedia({audio:true}),r=new MediaRecorder(s,{mimeType:'audio/webm;codecs=opus'}),chunks=[];r.ondataavailable=e=>chunks.push(e.data);
 const done=new Promise(resolve=>r.onstop=async()=>{const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));s.getTracks().forEach(t=>t.stop());resolve(btoa(raw));});r.start();setTimeout(()=>r.stop(),1200);return done;});
 await page.goto('https://draft.example/mock-speaking-review.html?attempt=ATTEMPT-'+'a'.repeat(24));
 await page.getByText('Private review loaded. Assessment pending.',{exact:true}).waitFor();
 check('audio not fetched until requested',reads===0);
 check('receipt shows assessment pending',(await page.locator('#speaking-receipt').textContent()).includes('assessment pending'));
 await page.locator('#speaking-play').click();await page.getByText('Private recording loaded. Press Play to listen; assessment remains pending.',{exact:true}).waitFor();
 check('player uses private local blob only',await page.locator('#speaking-audio').evaluate(a=>a.src.startsWith('blob:')));
 const url=await page.locator('#speaking-audio').getAttribute('src');await page.locator('#speaking-close').click();
 check('close revokes audio blob',await page.evaluate(u=>syntheticRevoked.includes(u),url));
 check('closed audio has no source',await page.locator('#speaking-audio').isHidden()&&await page.locator('#speaking-audio').getAttribute('src')===null);
 await page.locator('#speaking-part').selectOption('2');check('missing recording cannot play or save',await page.locator('#speaking-play').isDisabled()&&await page.locator('#speaking-save').isDisabled());
 await page.locator('#speaking-part').selectOption('1');await page.locator('#speaking-feedback').fill('<img src=x onerror="window.syntheticInjected=1"> Teacher note');
 await page.locator('#speaking-save').click();await page.locator('#speaking-retry').waitFor({state:'visible'});
 check('uncertain note freezes part and feedback',await page.locator('#speaking-part').isDisabled()&&await page.locator('#speaking-feedback').isDisabled());
 await page.locator('#speaking-retry').click();await page.getByText('Teacher note acknowledged. Assessment pending.',{exact:true}).waitFor();
 check('note retry keeps exact payload',requests.length===2&&JSON.stringify(requests[0])===JSON.stringify(requests[1]));
 check('note retry adds no duplicate history',notes.length===1&&await page.locator('#speaking-history p').count()===1);
 check('feedback rendered as plain text',await page.locator('#speaking-history img').count()===0&&await page.evaluate(()=>!window.syntheticInjected));
 notes.push({id:'NOTE-external',part:1,receiptID:'AUDIO-synthetic',feedback:'Other teacher note',teacherName:'Other',reviewedAt:'2026-01-01T00:01:00Z',revision:2});
 await page.locator('#speaking-feedback').fill('Unsaved conflicting note');await page.locator('#speaking-save').click();await page.getByText('A newer Speaking note exists. Reload before saving.',{exact:true}).waitFor();
 check('conflict retains typed feedback',await page.locator('#speaking-feedback').inputValue()==='Unsaved conflicting note');
 await page.locator('#speaking-reload').click();await page.getByText('Private review loaded. Assessment pending.',{exact:true}).waitFor();
 check('reload shows append-only history',await page.locator('#speaking-history p').count()===2);
 check('no audio or notes browser storage',await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0));
 await page.setViewportSize({width:390,height:844});check('mobile fits',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts','mock-speaking-review.png'),fullPage:true});
 role='student';await page.reload();check('student cannot open teacher review',await page.locator('#speaking-review').isHidden());
 await browser.close();console.log(JSON.stringify({speakingReviewBrowserChecks:checks,realRecordingsRead:0,bandsReleased:0}));
})().catch(e=>{console.error(e);process.exit(1);});
