/* Synthetic private folder/files and authenticated sessions. No real audio or Drive access. */
const {createHarness}=require('./mock-entry.test.js'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const h=createHarness(),{ctx,req,sheets,clock}=h;let checks=0;const check=(n,v)=>{assert.ok(v,n);checks++;};
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','MockAttempts.gs'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','MockSpeaking.gs'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','MockSpeakingTimed.gs'),'utf8'),ctx);
ctx.initializeMockTests();ctx.initializeMockAttempts();ctx.initializeMockSpeaking();ctx.initializeMockSpeaking();
check('Speaking setup additive and idempotent',sheets.MockSpeakingUploads.vals.length===1&&sheets.Marks.vals.length===1);
let timedEnabled=false,enabled=false,shared=false,viewer=false,editor=false,group=false,paged=false,lookupError=false,files=[],createCount=0;
const original=ctx.PropertiesService.getScriptProperties;
ctx.PropertiesService.getScriptProperties=()=>({getProperty:k=>k==='DMI_MOCK_SPEAKING_TIMED_ENABLED'?String(timedEnabled):k==='DMI_MOCK_SPEAKING_ENABLED'?String(enabled):k==='DMI_MOCK_SPEAKING_FOLDER_ID'?'synthetic_folder_1234':original().getProperty(k)});
const user={getEmail:()=> 'owner@example.com'};
const privacy={getOwner:()=>user,getSharingAccess:()=>shared?'ANYONE':'PRIVATE',getViewers:()=>viewer?[user]:[],getEditors:()=>editor?[{getEmail:()=> 'other@example.com'}]:[]};
ctx.Session={getEffectiveUser:()=>user};
ctx.ScriptApp={getOAuthToken:()=> 'synthetic-test-token'};
ctx.UrlFetchApp={fetch:()=>({getResponseCode:()=>lookupError?403:200,getContentText:()=>JSON.stringify({permissions:[{type:'user',role:'owner',emailAddress:'owner@example.com'},...(group?[{type:'group',role:'reader',emailAddress:'synthetic@example.com'}]:[])],...(paged?{nextPageToken:'synthetic-next'}:{})})})};
const folder={...privacy,getId:()=> 'synthetic_folder_1234',getFilesByName:name=>{const matching=files.filter(f=>f.name===name);let i=0;return{hasNext:()=>i<matching.length,next:()=>matching[i++]};},
 createFile:blob=>{createCount++;const f={...privacy,name:blob.name,description:'',getId:()=> 'private-file-'+createCount,getDescription(){return this.description;},setDescription(d){this.description=d;}};files.push(f);return f;}};
ctx.DriveApp={Access:{PRIVATE:'PRIVATE'},getFolderById:()=>folder};
ctx.Utilities.base64Decode=s=>Array.from(Buffer.from(s,'base64'));
ctx.Utilities.newBlob=(bytes,mime,name)=>({bytes,mime,name});
const oldDigest=ctx.Utilities.computeDigest;ctx.Utilities.computeDigest=(algo,data)=>Array.isArray(data)?Array.from(crypto.createHash('sha256').update(Buffer.from(data)).digest()):oldDigest(algo,data);
const sitting=req('createMockSitting',h.payload()),id=sitting.sitting.id;
const attempt={AttemptID:'ATTEMPT-speaking',AdmissionID:'none',SittingID:id,StudentEmail:'one@example.com',StudentID:'S1',PaperID:'DMI-ACADEMIC-MOCK-01',PaperVersion:'v1',PaperDigest:'synthetic',StartedAt:new Date(clock.now-100000),ListeningDeadline:new Date(clock.now-3000),ReadingDeadline:new Date(clock.now-2000),WritingDeadline:new Date(clock.now-1000),StateJSON:JSON.stringify({sections:[0,1,2].map(()=>({closed:true,answers:{}}))}),Revision:0};
sheets.MockAttempts.appendRow(sheets.MockAttempts.vals[0].map(k=>attempt[k]));
enabled=true;
function timedReq(action,p={},who='teacher'){
 try{
  const parameters={sessionToken:h.tokens[who],...p};
  const auth=ctx.authorize_(parameters,'myMockSpeakingUploads');
  return action==='startMockSpeakingTimed'?ctx.startMockSpeakingTimed_(parameters,auth):ctx.resumeMockSpeakingTimed_(parameters,auth);
 }catch(e){return{ok:false,code:e.code||'ERROR',error:e.message};}
}
const originalPaper=ctx.mockPaper_;
let speakingFixture={speakingTiming:{reviewed:true,part1:Array.from({length:8},(_,i)=>({prompt:'Synthetic introduction '+i,seconds:30})),cue:'Synthetic private cue',part3:Array.from({length:4},(_,i)=>({prompt:'Synthetic discussion '+i,seconds:60}))}};
ctx.mockPaper_=()=>({paper:speakingFixture,digest:'synthetic'});
const timedP={sittingID:id,consent:true,microphoneReady:true};
check('timed gate disabled',timedReq('startMockSpeakingTimed',timedP,'student').code==='MOCK_NOT_READY');
timedEnabled=true;
check('timed teacher denied',timedReq('startMockSpeakingTimed',timedP).code==='FORBIDDEN');
check('timed other candidate denied',timedReq('startMockSpeakingTimed',timedP,'second').code==='MOCK_NOT_STARTED');
check('timed anonymous denied',timedReq('startMockSpeakingTimed',{...timedP,sessionToken:''},'student').code==='UNAUTHENTICATED');
check('resume cannot create clock',timedReq('resumeMockSpeakingTimed',timedP,'student').code==='MOCK_SPEAKING_NOT_STARTED');
check('consent needed before start',timedReq('startMockSpeakingTimed',{...timedP,consent:false},'student').code==='VALIDATION');
check('preflight needed before start',timedReq('startMockSpeakingTimed',{...timedP,microphoneReady:false},'student').code==='VALIDATION');
speakingFixture.speakingTiming.reviewed=false;
check('unreviewed Speaking fails closed',timedReq('startMockSpeakingTimed',timedP,'student').code==='MOCK_NOT_READY');speakingFixture.speakingTiming.reviewed=true;
speakingFixture.speakingTiming.part1[0].seconds=14;
check('invalid prompt duration rejected',timedReq('startMockSpeakingTimed',timedP,'student').code==='MOCK_NOT_READY');speakingFixture.speakingTiming.part1[0].seconds=30;
speakingFixture.speakingTiming.part3[0].seconds=30;
check('part shorter than four minutes rejected',timedReq('startMockSpeakingTimed',timedP,'student').code==='MOCK_NOT_READY');speakingFixture.speakingTiming.part3[0].seconds=60;
const timedStart=timedReq('startMockSpeakingTimed',timedP,'student'),started=clock.now;
check('clock begins at Part 1 for eleven minutes',timedStart.ok&&timedStart.speaking.stage.phase==='part1'&&timedStart.speaking.totalSeconds===660);
check('future private prompts not exposed',!JSON.stringify(timedStart).includes('Synthetic private cue')&&!JSON.stringify(timedStart).includes('Synthetic discussion'));
clock.now=started+31000;
const resumed=timedReq('resumeMockSpeakingTimed',{...timedP,startedAt:'2099-01-01',elapsed:0},'student');
check('server advances question ignoring client clock',resumed.ok&&resumed.speaking.stage.prompt==='Synthetic introduction 1');
check('start retry does not restart timer',timedReq('startMockSpeakingTimed',timedP,'student').speaking.startedAt===timedStart.speaking.startedAt);
clock.now=started+240000;
const prep=timedReq('resumeMockSpeakingTimed',timedP,'student');
check('Part 2 has one minute preparation',prep.speaking.stage.phase==='preparation'&&new Date(prep.speaking.stage.deadline)-clock.now===60000);
clock.now=started+300000;
const talk=timedReq('resumeMockSpeakingTimed',timedP,'student');
check('Part 2 long turn limited to two minutes',talk.speaking.stage.phase==='long_turn'&&new Date(talk.speaking.stage.deadline)-clock.now===120000);
clock.now=started+420000;
check('Part 3 starts after long turn',timedReq('resumeMockSpeakingTimed',timedP,'student').speaking.stage.phase==='part3');
clock.now=started+660000;
check('exact deadline removes prompt',timedReq('resumeMockSpeakingTimed',timedP,'student').speaking.stage===null);
check('finished test cannot restart',timedReq('startMockSpeakingTimed',timedP,'student').speaking.status==='finished');
ctx.mockPaper_=()=>({paper:speakingFixture,digest:'changed'});
check('paper alteration blocks resume',timedReq('resumeMockSpeakingTimed',timedP,'student').code==='MOCK_PAPER_CHANGED');
ctx.mockPaper_=originalPaper;


check('scores unchanged',sheets.Marks.vals.length===1&&sheets.ExamResults.vals.length===1);
new vm.Script(fs.readFileSync(path.join(__dirname,'..','MockSpeakingTimed.gs'),'utf8'));
console.log(JSON.stringify({speakingTimedBackendChecks:checks,dispatch:'NOT_CONNECTED',liveWrites:0}));
