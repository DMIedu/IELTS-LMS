/* Native Chromium playback check using the proposed paper files.
 * Auth is a fictional browser fixture; all Apps Script requests are blocked.
 * Never signs in to, submits to or changes the production database.
 */
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),results=[];
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext();
 await context.addInitScript(()=>{
  window.DMI_AUTH={requireRole:async()=>({role:'student',user:{id:'BROWSER-AUDIO-CHECK',name:'Audio Check',email:'audio-check@example.invalid',class:'Test',expiryDate:'2099-01-01'}})};
 });
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='dmiedu.github.io' && url.pathname.startsWith('/IELTS-LMS/')){
   const relative=decodeURIComponent(url.pathname.slice('/IELTS-LMS/'.length)),file=path.resolve(root,relative);
   if(!file.startsWith(root+path.sep) || !fs.existsSync(file)){await route.abort();return;}
   const ext=path.extname(file),contentType=ext==='.html'?'text/html; charset=utf-8':ext==='.js'?'application/javascript; charset=utf-8':undefined;
   await route.fulfill({path:file,contentType});return;
  }
  if(url.hostname==='ieltstrainingonline.com'){await route.continue();return;}
  // Blocks Apps Script, images and analytics; no production account/data access.
  await route.abort();
 });
 for(const paper of fs.readdirSync(root).filter(n=>/^book \d+ listening test \d+\.html$/.test(n)).sort()){
  const page=await context.newPage();
  try{
   await page.goto('https://dmiedu.github.io/IELTS-LMS/'+encodeURIComponent(paper),{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>typeof startExam==='function');
   await page.evaluate(()=>{
    for(const [id,value] of Object.entries({fname:'Audio',lname:'Check',sid:'CHECK',email:'audio-check@example.invalid'}))document.getElementById(id).value=value;
    const school=document.getElementById('school');school.value=Array.from(school.options).find(o=>o.value).value;
    document.getElementById('agree').checked=true;
   });
   await page.locator('[onclick="startExam()"]').click();
   for(let part=1;part<=4;part++){
    try{
     await page.evaluate(part=>showPart(part),part);
     await page.waitForFunction(()=>{
      const a=document.getElementById('examAudio');
      return (Number.isFinite(a.duration)&&a.duration>0) || a.error;
     },null,{timeout:25000});
     const error=await page.evaluate(()=>document.getElementById('examAudio').error?.code||null);
     if(error)throw Error('MediaError '+error);
     await page.locator('#audioPlayBtn').click();
     await page.waitForFunction(()=>{const a=document.getElementById('examAudio');return !a.paused && a.currentTime>0.2;},null,{timeout:15000});
     const evidence=await page.evaluate(()=>{
      const a=document.getElementById('examAudio');return {duration:a.duration,currentTime:a.currentTime,src:a.currentSrc};
     });
     const before=await page.evaluate(()=>document.getElementById('examAudio').currentTime);
     await page.evaluate(part=>showPart(part),part);
     const after=await page.evaluate(()=>document.getElementById('examAudio').currentTime);
     if(after<before-0.05)throw Error('Same-part navigation reset audio');
     await page.locator('#audioPlayBtn').click();
     if(!await page.evaluate(()=>document.getElementById('examAudio').paused))throw Error('Pause failed');
     results.push({paper,part,ok:true,...evidence});console.log('PASS '+paper+' Part '+part+' '+evidence.duration+' seconds');
    }catch(error){results.push({paper,part,ok:false,error:error.message});console.log('FAIL '+paper+' Part '+part+' '+error.message);}
   }
  }catch(error){results.push({paper,ok:false,error:error.message});console.log('FAIL '+paper+' '+error.message);}
  finally{await page.close();}
 }
 await browser.close();
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
 fs.writeFileSync(path.join(root,'artifacts','listening-browser-report.json'),JSON.stringify(results,null,2)+'\n');
 console.log(results.filter(r=>r.ok).length+'/40 audio parts passed native Chromium playback.');
 if(results.some(r=>!r.ok)||results.filter(r=>r.ok).length!==40)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
