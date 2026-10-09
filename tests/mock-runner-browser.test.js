/* Synthetic browser responses only; no paper content or live workbook calls. */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),id='MOCK-'+'a'.repeat(24);let count=0;
const check=(n,v)=>{assert.ok(v,n);count++;};
(async()=>{
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage();
let answers={'1':'saved answer'},revision=1,closed=false,lose=false,requests=[],last=null;
const snapshot=()=>({id:'ATTEMPT-test',sittingID:id,revision,serverNow:new Date().toISOString(),startedAt:new Date().toISOString(),deadlines:[1,2,3].map(i=>new Date(Date.now()+i*3600000).toISOString()),section:'reading',status:'in_progress',sections:[{closed:true},{closed},{closed:false}],answers,content:{instructions:'Synthetic instructions',passages:[{title:'Synthetic passage',text:'<img src=x onerror=alert(1)>'}],questions:[{id:'1',prompt:'Synthetic question',options:[],wordLimit:2}]}});
await page.exposeFunction('fakeCall',async(action,p)=>{
 if(action==='resumeMockAttempt')return {ok:true,attempt:snapshot()};
 if(action==='saveMockAnswers'||action==='submitMockSection'){
  requests.push({action,...p});
  if(p.requestID!==last){answers=JSON.parse(p.answersJSON);revision++;last=p.requestID;if(action==='submitMockSection')closed=true;}
  if(lose){lose=false;throw Error('Simulated lost response');}
  return {ok:true,attempt:snapshot()};
 }
 return {ok:false,code:'MOCK_NOT_READY',error:'The timed mock is still being prepared.'};
});
await context.route('**/*',async route=>{
 const url=new URL(route.request().url()),rel=url.pathname.split('/').pop();
 if(rel==='dmi-auth.js')return route.fulfill({contentType:'text/javascript',body:"window.DMI_AUTH={requireRole:async()=>({user:{id:'S1',name:'Synthetic student'},role:'student'}),call:(a,p)=>window.fakeCall(a,p)};"});
 const f=path.join(root,rel);if(fs.existsSync(f))return route.fulfill({contentType:rel.endsWith('.js')?'text/javascript':rel.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(f)});
 return route.abort();
});
await page.goto('https://draft.example/mock-runner.html?sitting='+id);
await page.locator('[data-answer]').waitFor();
check('saved answer restored',await page.locator('[data-answer]').inputValue()==='saved answer');
check('passage is text, not injected HTML',await page.locator('#passages img').count()===0);
check('only current question rendered',await page.locator('[data-answer]').count()===1);
check('existing attempt cannot be restarted',await page.locator('#start').isHidden());
await page.locator('[data-answer]').fill('new answer');lose=true;await page.locator('#save').click();
await page.getByText('Simulated lost response',{exact:true}).waitFor();
check('failed save retains typed answer',await page.locator('[data-answer]').inputValue()==='new answer');
check('restore cannot overwrite pending save',await page.locator('#resume').isDisabled());
await page.locator('#retry').click();await page.getByText('Answers acknowledged by the server.',{exact:true}).waitFor();
check('retry keeps request identity',requests.length===2&&requests[0].requestID===requests[1].requestID);
check('retry keeps exact snapshot',requests[0].answersJSON===requests[1].answersJSON&&requests[0].revision===requests[1].revision);
check('idempotent retry does not increment twice',revision===2);
check('answers not stored in browser',await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0));
await page.reload();await page.locator('[data-answer]').waitFor();
check('refresh recovers acknowledged answer',await page.locator('[data-answer]').inputValue()==='new answer');
page.on('dialog',d=>d.accept());await page.locator('#submit').click();
await page.getByText('Answers acknowledged by the server.',{exact:true}).waitFor();
check('submitted section locks inputs',await page.locator('[data-answer]').isDisabled());
check('submitted section locks saves',await page.locator('#save').isDisabled());
check('submitted section does not reveal next',await page.locator('#section').textContent()==='READING');
check('assessment remains pending',(await page.locator('#assessment').textContent()).includes('pending'));
await page.setViewportSize({width:390,height:844});
check('mobile fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
const out=path.join(root,'artifacts');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'mock-runner-synthetic.png'),fullPage:true});
await page.goto('https://draft.example/mock-runner.html?sitting=bad');await page.getByText('Open a valid assigned sitting first.',{exact:true}).waitFor();
check('invalid sitting has no start',await page.locator('#start').isHidden());
await context.close();await browser.close();console.log(JSON.stringify({runnerBrowserChecks:count,liveWorkbookWrites:0}));
})().catch(e=>{console.error(e);process.exit(1);});
