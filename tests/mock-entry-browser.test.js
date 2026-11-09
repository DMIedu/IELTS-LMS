/* Native browser UI with an in-memory backend. No live Apps Script calls. */
const {chromium}=require('playwright'),{createHarness}=require('./mock-entry.test.js');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),origin='https://dmiedu.github.io',h=createHarness();
h.ctx.initializeMockTests();
let checks=0;
const check=(name,value)=>{assert.ok(value,name);checks++;};
(async()=>{
 const browser=await chromium.launch({headless:true});
 const contexts=[];
 async function pageFor(who){
  const context=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(context);
  await context.addInitScript(token=>localStorage.setItem('dmi_lms_token',token),h.tokens[who]);
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname==='script.google.com'){
    check('protected API always POST',req.method()==='POST');
    const p=Object.fromEntries(new URLSearchParams(req.postData()||''));
    const res=h.req(p.action,p,who);
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(res)});
   }
   if(url.origin===origin){
    let rel=decodeURIComponent(url.pathname.replace(/^\/IELTS-LMS\//,''));
    const full=path.resolve(root,rel);
    if(!full.startsWith(root+path.sep)||!fs.existsSync(full))return route.fulfill({status:404,body:'Not found'});
    const mime=rel.endsWith('.js')?'text/javascript':rel.endsWith('.css')?'text/css':rel.endsWith('.png')?'image/png':rel.endsWith('.jfif')?'image/jpeg':'text/html';
    return route.fulfill({status:200,contentType:mime,body:fs.readFileSync(full)});
   }
   return route.abort();
  });
  return context.newPage();
 }
 const teacher=await pageFor('teacher');
 await teacher.goto(origin+'/IELTS-LMS/mock-admin.html');
 await teacher.locator('#content').waitFor({state:'visible'});
 await teacher.locator('#candidates label').first().waitFor();
 await teacher.locator('#candidates input').nth(0).check();
 await teacher.locator('#candidates input').nth(1).check();
 await teacher.locator('#paper').selectOption('DMI-ACADEMIC-MOCK-02');
 await teacher.locator('#create-button').click();
 await teacher.locator('#code-box').waitFor({state:'visible'});
 const code=(await teacher.locator('#issued-code').textContent()).trim();
 check('code displayed to teacher',/^[A-F0-9]{4}(-[A-F0-9]{4}){2}$/.test(code));
 check('selected Mock 02 reaches backend',h.sheets.MockSittings.vals[1][3]==='DMI-ACADEMIC-MOCK-02');
 check('teacher has sitting controls',await teacher.getByRole('button',{name:'View entries'}).count()===1);
 const logo=teacher.locator('img.partner');await logo.waitFor();
 check('supplied badge loads',await logo.evaluate(img=>img.complete&&img.naturalWidth>0));
 check('DMI logo loads',await teacher.locator('img.dmi').evaluate(img=>img.complete&&img.naturalWidth>0));
 const student=await pageFor('student');
 await student.goto(origin+'/IELTS-LMS/mock-test.html');
 await student.locator('#sitting option').waitFor({state:'attached'});
 await student.waitForFunction(()=>!document.getElementById('entry-button').disabled);
 await student.locator('#code').fill('0000-0000-0000');
 await student.locator('#entry-button').click();
 await student.getByText('Mock code is incorrect.',{exact:false}).waitFor();
 check('wrong code shows error',await student.locator('#admitted').isHidden());
 await student.locator('#code').fill(code);
 await student.locator('#entry-button').click();
 await student.locator('#admitted').waitFor({state:'visible'});
 check('entry confirmation identifies candidate',(await student.locator('#admitted').textContent()).includes('S1'));
 check('no exam start falsely offered',await student.getByRole('button',{name:/Start exam/i}).count()===0);
 await student.waitForFunction(()=>document.getElementById('entry-button').disabled);
 check('admitted student cannot submit again',await student.locator('#entry-button').isDisabled());
 const stored=await student.evaluate(()=>JSON.stringify(localStorage));check('code not saved locally',!stored.includes(code));
 await student.reload();await student.locator('#admitted').waitFor({state:'visible'});
 check('refresh restores admission',(await student.locator('#admitted').textContent()).includes('S1'));
 await teacher.getByRole('button',{name:'View entries',exact:true}).click();
 await teacher.locator('#admissions-card').waitFor({state:'visible'});
 check('teacher sees actual admission',(await teacher.locator('#admissions').textContent()).includes('Student One'));
 const artifacts=path.join(root,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
 await teacher.screenshot({path:path.join(artifacts,'mock-teacher.png'),fullPage:true});
 await student.screenshot({path:path.join(artifacts,'mock-student.png'),fullPage:true});
 await student.setViewportSize({width:390,height:844});
 check('mobile has no horizontal overflow',await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await student.screenshot({path:path.join(artifacts,'mock-student-mobile.png'),fullPage:true});
 const outsider=await pageFor('other');await outsider.goto(origin+'/IELTS-LMS/mock-test.html');await outsider.locator('#content').waitFor({state:'visible'});
 await outsider.waitForFunction(()=>document.getElementById('schedule').textContent.includes('No assigned'));
 check('unassigned student sees no sitting',await outsider.locator('#sitting option').count()===0);
 teacher.on('dialog',d=>d.accept());
 await teacher.getByRole('button',{name:'Close entry',exact:true}).click();
 await teacher.getByText('Entry closed.',{exact:true}).waitFor();
 const second=await pageFor('second');await second.goto(origin+'/IELTS-LMS/mock-test.html');await second.locator('#sitting option').waitFor({state:'attached'});
 await second.waitForFunction(()=>document.getElementById('schedule').textContent.includes('closed'));
 check('closed sitting entry disabled',await second.locator('#entry-button').isDisabled());
 for(const c of contexts)await c.close();await browser.close();
 fs.writeFileSync(path.join(artifacts,'mock-browser-report.json'),JSON.stringify({checks,liveWorkbookWrites:0,realAccountsUsed:0},null,2));
 console.log(JSON.stringify({browserChecks:checks,liveWorkbookWrites:0},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
