/* Synthetic private folder/files and authenticated sessions. No real audio or Drive access. */
const {createHarness}=require('./mock-entry.test.js'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const h=createHarness(),{ctx,req,sheets,clock}=h;let checks=0;const check=(n,v)=>{assert.ok(v,n);checks++;};
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','MockAttempts.gs'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','MockSpeaking.gs'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','MockSpeakingTimed.gs'),'utf8'),ctx);
ctx.initializeMockTests();ctx.initializeMockAttempts();ctx.initializeMockSpeaking();ctx.initializeMockSpeaking();

let enabled=false,shared=false,viewer=false,editor=false,group=false,paged=false,lookupError=false,files=[],createCount=0;
const original=ctx.PropertiesService.getScriptProperties;
ctx.PropertiesService.getScriptProperties=()=>({getProperty:k=>k==='DMI_MOCK_SPEAKING_ENABLED'?String(enabled):k==='DMI_MOCK_SPEAKING_FOLDER_ID'?'synthetic_folder_1234':original().getProperty(k)});
const user={getEmail:()=> 'owner@example.com'};
const privacy={getOwner:()=>user,getSharingAccess:()=>shared?'ANYONE':'PRIVATE',getViewers:()=>viewer?[user]:[],getEditors:()=>editor?[{getEmail:()=> 'other@example.com'}]:[]};
ctx.Session={getEffectiveUser:()=>user};
ctx.ScriptApp={getOAuthToken:()=> 'synthetic-test-token'};
ctx.UrlFetchApp={fetch:()=>({getResponseCode:()=>lookupError?403:200,getContentText:()=>JSON.stringify({permissions:[{type:'user',role:'owner',emailAddress:'owner@example.com'},...(group?[{type:'group',role:'reader',emailAddress:'synthetic@example.com'}]:[])],...(paged?{nextPageToken:'synthetic-next'}:{})})})};
const folder={...privacy,getId:()=> 'synthetic_folder_1234',getFilesByName:name=>{const matching=files.filter(f=>f.name===name);let i=0;return{hasNext:()=>i<matching.length,next:()=>matching[i++]};},
 createFile:blob=>{createCount++;const fileID='private-file-'+createCount;const f={...privacy,name:blob.name,bytes:blob.bytes.slice(),getBlob(){return{getBytes:()=>this.bytes.slice()};},description:'',getId:()=>fileID,getDescription(){return this.description;},setDescription(d){this.description=d;}};files.push(f);return f;}};
ctx.DriveApp={Access:{PRIVATE:'PRIVATE'},getFolderById:()=>folder};
ctx.Utilities.base64Decode=s=>Array.from(Buffer.from(s,'base64'));
ctx.Utilities.newBlob=(bytes,mime,name)=>({bytes,mime,name});
const oldDigest=ctx.Utilities.computeDigest;ctx.Utilities.computeDigest=(algo,data)=>Array.isArray(data)?Array.from(crypto.createHash('sha256').update(Buffer.from(data)).digest()):oldDigest(algo,data);
const sitting=req('createMockSitting',h.payload()),id=sitting.sitting.id;
const attempt={AttemptID:'ATTEMPT-speaking',AdmissionID:'none',SittingID:id,StudentEmail:'one@example.com',StudentID:'S1',PaperID:'DMI-ACADEMIC-MOCK-01',PaperVersion:'v1',PaperDigest:'synthetic',StartedAt:new Date(clock.now-100000),ListeningDeadline:new Date(clock.now-3000),ReadingDeadline:new Date(clock.now-2000),WritingDeadline:new Date(clock.now-1000),StateJSON:JSON.stringify({sections:[0,1,2].map(()=>({closed:true,answers:{}}))}),Revision:0};
sheets.MockAttempts.appendRow(sheets.MockAttempts.vals[0].map(k=>attempt[k]));

ctx.Utilities.base64Encode=bytes=>Buffer.from(bytes).toString('base64');
const bytes=Buffer.alloc(128);bytes.set([26,69,223,163]);enabled=true;
const uploaded=req('uploadMockSpeaking',{sittingID:id,part:1,requestID:crypto.randomUUID(),mime:'audio/webm',durationSeconds:30,audioBase64:bytes.toString('base64')},'student');
check('synthetic recording acknowledged',uploaded.ok&&createCount===1);
const p={attemptID:attempt.AttemptID,part:1,receiptID:uploaded.receipt.id};

vm.runInContext(fs.readFileSync(path.join(__dirname,'..','MockSpeakingAssessment.gs'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','MockSpeakingAssessmentService.gs'),'utf8'),ctx);
ctx.Session.getActiveUser=()=>user;
const ownerAccount=sheets.Teachers.vals[1].slice();ownerAccount[0]='OWNER';ownerAccount[2]='owner@example.com';sheets.Teachers.appendRow(ownerAccount);
let gatewayEnabled=false,endpoint='https://assessment.example.com/v1/evaluate',host='assessment.example.com',calls=0,mode='ok',captured;
const oldProperties=ctx.PropertiesService.getScriptProperties;
ctx.PropertiesService.getScriptProperties=()=>({getProperty:k=>({DMI_MOCK_ASSESSMENT_ENABLED:String(gatewayEnabled),DMI_MOCK_ASSESSMENT_ENDPOINT:endpoint,DMI_MOCK_ASSESSMENT_HOST:host,DMI_MOCK_ASSESSMENT_TOKEN:'synthetic-token-'.repeat(4),DMI_MOCK_ASSESSMENT_PROVIDER:'fixture',DMI_MOCK_ASSESSMENT_VERSION:'v1'})[k]??oldProperties().getProperty(k)});
ctx.mockSpeakingPlan_=()=>({stages:[{part:1,prompt:'Synthetic question'}]});
const permissionsFetch=ctx.UrlFetchApp.fetch;
ctx.UrlFetchApp.fetch=(url,opts)=>{
 if(url.startsWith('https://www.googleapis.com/'))return permissionsFetch(url,opts);
 calls++;captured={url,opts};const body=JSON.parse(opts.payload);
 if(mode==='throw')throw new Error('Private service error with synthetic-token');
 const decoded=body.recordings.map(r=>({...r,decodedSeconds:30,decodingVerified:true,speechDetectionVerified:true,speechSeconds:20,silenceRatio:0.1,clippingRatio:0}));
 if(mode==='silence')decoded[0].speechSeconds=0;
 if(mode==='clipping')decoded[0].clippingRatio=0.2;
 if(mode==='duration')decoded[0].decodedSeconds=40;
 if(mode==='wronghash')decoded[0].audioSHA256='a'.repeat(64);
 if(mode==='notdecoded')decoded[0].decodingVerified=false;
 const assessment={schemaVersion:1,status:'draft',audioEvaluated:true,provider:'fixture',modelVersion:'v1',attemptID:body.attemptID,recordings:decoded.map(({part,receiptID,audioSHA256,decodedSeconds})=>({part,receiptID,audioSHA256,decodedSeconds})),criteria:Object.fromEntries(['fluencyCoherence','lexicalResource','grammar','pronunciation'].map(k=>[k,{band:6,feedback:'Synthetic review only',evidence:[1,2,3].map(part=>({part,source:'audio',startSeconds:0,endSeconds:1,observation:'Synthetic observation'}))}]))};
 if(mode==='transcript')assessment.audioEvaluated=false;
 if(mode==='model')assessment.modelVersion='other';
 return{getResponseCode:()=>mode==='redirect'?302:mode==='http'?503:200,getContentText:()=>mode==='badjson'?'<html>':mode==='oversize'?'x'.repeat(262145):JSON.stringify({requestID:mode==='identity'?'wrong':body.requestID,decoded,assessment})};
};
const run=()=>{try{return ctx.previewMockSpeakingAssessment(attempt.AttemptID);}catch(e){return{code:e.code,message:e.message};}};
check('disabled gateway sends nothing',run().code==='ASSESSMENT_NOT_READY'&&calls===0);
gatewayEnabled=true;ctx.Session.getActiveUser=()=>({getEmail:()=> 'student@example.com'});
check('non-owner cannot send audio',run().code==='FORBIDDEN'&&calls===0);ctx.Session.getActiveUser=()=>user;
check('incomplete recordings send nothing',run().code==='ASSESSMENT_NOT_READY'&&calls===0);
for(const part of [2,3])check('synthetic part upload '+part,req('uploadMockSpeaking',{sittingID:id,part,requestID:crypto.randomUUID(),mime:'audio/webm',durationSeconds:30,audioBase64:bytes.toString('base64')},'student').ok);
for(const bad of ['http://assessment.example.com/v1','https://other.example.com/v1','https://assessment.example.com:443/v1','https://user@assessment.example.com/v1','https://assessment.example.com/v1?next=x']){
 endpoint=bad;check('unsafe endpoint rejected '+bad,run().code==='ASSESSMENT_NOT_READY'&&calls===0);
}endpoint='https://assessment.example.com/v1/evaluate';
let result=run();
check('synthetic successful assessment stays draft',result.ok&&result.assessment.teacherReviewRequired===true&&result.releaseApproved===false);
check('all three private byte payloads bound',JSON.parse(captured.opts.payload).recordings.length===3&&JSON.parse(captured.opts.payload).recordings.every(r=>r.audioBase64===bytes.toString('base64')));
check('redirects disabled with bounded controlled request',captured.opts.followRedirects===false&&captured.opts.muteHttpExceptions===true&&captured.opts.method==='post');
check('no candidate email or Drive IDs sent',!captured.opts.payload.includes('one@example.com')&&!captured.opts.payload.includes('private-file'));
const identity=captured.opts.headers['Idempotency-Key'];run();
check('same recordings retain retry identity',captured.opts.headers['Idempotency-Key']===identity);
for(const m of ['silence','clipping','duration']){mode=m;result=run();check('quality hold '+m,result.status==='needs_teacher_review'&&result.assessment===null&&result.qualityIssues.length===1);}
for(const m of ['wronghash','notdecoded','identity','model','transcript','badjson','oversize']){mode=m;check('invalid service result '+m,run().code==='ASSESSMENT_INVALID');}
for(const m of ['redirect','http','throw']){mode=m;result=run();check('service failure generic '+m,result.code==='ASSESSMENT_SERVICE_ERROR'&&!result.message.includes('synthetic-token'));}
mode='ok';group=true;const before=calls;check('shared recordings blocked before service call',run().code==='MOCK_NOT_READY'&&calls===before);group=false;
check('no assessments or existing scores persisted',sheets.Marks.vals.length===1&&sheets.ExamResults.vals.length===1&&sheets.MockSpeakingReviews.vals.length===1);
check('bundle contains exact service module',fs.readFileSync(path.join(__dirname,'..','release-candidate','Code.gs'),'utf8').includes(fs.readFileSync(path.join(__dirname,'..','MockSpeakingAssessmentService.gs'),'utf8')));
console.log(JSON.stringify({speakingServiceChecks:checks,realProviderCalls:0,bandsReleased:0}));
