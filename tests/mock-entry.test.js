/* Synthetic workbook and verified sessions only. No network or real student data. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function createHarness(){
 const sheets={},cache={},clock={now:Date.now()},logs=[];
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}}
 const makeSheet=(name,head=[],data=[])=>{
  const vals=head.length?[head.slice(),...data.map(r=>r.slice())]:[];
  const s={vals,getDataRange:()=>({getValues:()=>vals.length?vals.map(r=>r.slice()):[[]]}),appendRow:r=>vals.push(r.slice()),deleteRow:i=>vals.splice(i-1,1),
   getRange:(row,col,n=1,width=1)=>({setValues:values=>{values.forEach((r,i)=>{while(vals.length<row+i)vals.push([]);r.forEach((v,j)=>vals[row+i-1][col+j-1]=v);});},
    setValue:v=>{while(vals.length<row)vals.push([]);vals[row-1][col-1]=v;}})};
  sheets[name]=s;return s;
 };
 const props={DMI_SESSION_SECRET:'synthetic-test-secret-'.repeat(3)};
 const ctx=vm.createContext({console,Date:ClockDate,Map,Set,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
  CacheService:{getScriptCache:()=>({get:k=>cache[k],put:(k,v)=>cache[k]=v,remove:k=>delete cache[k]})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock:()=>{}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>s})},
  Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},getUuid:()=>crypto.randomUUID(),
    computeDigest:(a,s)=>Array.from(crypto.createHash('sha256').update(String(s)).digest()),
    computeHmacSha256Signature:(s,k)=>Array.from(crypto.createHmac('sha256',k).update(String(s)).digest())},
  Logger:{log:m=>logs.push(m)}
 });
 for(const f of ['Code.gs','Security.gs','MockTests.gs'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
 const heads=['ID','Name','Email','Password','Class','JoinDate','ExpiryDate','PasswordHash','PasswordSalt','PasswordIterations','Status'];
 makeSheet('Students',heads,[
 ['S1','Student One','one@example.com','','A',new Date(),new Date(clock.now+86400000),'hash-one','salt',600000,'active'],
 ['S2','Student Two','two@example.com','','A',new Date(),new Date(clock.now+86400000),'hash-two','salt',600000,'active'],
 ['S3','Other Student','other@example.com','','B',new Date(),new Date(clock.now+86400000),'hash-other','salt',600000,'active']]);
 makeSheet('Teachers',heads,[['T1','Teacher','teacher@example.com','','A',new Date(),'', 'hash-teacher','salt',600000,'active']]);
 makeSheet('Sessions',['TokenHash','Email','Role','CredentialVersion','ExpiresAt']);
 makeSheet('Marks',['MarkID','StudentEmail']);
 makeSheet('ExamResults',['ResultID','StudentEmail']);
 makeSheet('Courses',['CourseID','Course','Lesson','VideoURL','PDFURL']);
 ctx.ss=()=>({getSheetByName:n=>sheets[n],insertSheet:n=>makeSheet(n)});
 const tokens={teacher:'b'.repeat(64),student:'a'.repeat(64),second:'c'.repeat(64),other:'d'.repeat(64)};
 for(const [key,email,role] of [['teacher','teacher@example.com','teacher'],['student','one@example.com','student'],['second','two@example.com','student'],['other','other@example.com','student']]){
  const a=ctx.account_(role,email);sheets.Sessions.appendRow([ctx.digest_(tokens[key]),email,role,ctx.credentialVersion_(a),new Date(clock.now+8*3600000)]);
 }
 const req=(action,params={},who='teacher',post=true)=>JSON.parse(ctx.handle(Object.assign({parameter:Object.assign({action,sessionToken:tokens[who]},params)},post?{postData:{contents:'synthetic'}}:{})));
 const payload=()=>({requestID:crypto.randomUUID(),title:'Lab mock',class:'A',opensAt:new Date(clock.now-60000).toISOString(),closesAt:new Date(clock.now+3600000).toISOString(),candidatesJSON:JSON.stringify(['one@example.com','two@example.com'])});
 return {ctx,req,payload,sheets,cache,clock,tokens,logs};
}
function run(){
 const h=createHarness(),{ctx,req,payload,sheets,clock,cache}=h;let count=0;
 function check(name,value){assert.ok(value,name);count++;}
 for(const a of ['createMockSitting','rotateMockCode','closeMockSitting','listMockAdmissions']){
  check('student cannot '+a,req(a,{},'student').code==='FORBIDDEN');
  check('anonymous cannot '+a,req(a,{sessionToken:''}).code==='UNAUTHENTICATED');
 }
 check('missing setup fails closed',req('listMockSittings').code==='MOCK_SETUP_REQUIRED');
 const before=JSON.stringify([sheets.Students.vals,sheets.Teachers.vals,sheets.Marks.vals,sheets.Sessions.vals]);
 ctx.initializeMockTests();ctx.initializeMockTests();
 check('owner setup preserves existing data',before===JSON.stringify([sheets.Students.vals,sheets.Teachers.vals,sheets.Marks.vals,sheets.Sessions.vals]));
 check('initialization idempotent',sheets.MockSittings.vals.length===1&&sheets.MockAdmissions.vals.length===1);
 for(const p of [
 {paperID:'unavailable'},{paperID:'toString'},{title:''},{title:'x'.repeat(101)},{opensAt:'bad'},{closesAt:'bad'},
 {closesAt:new Date(clock.now-120000).toISOString()},{closesAt:new Date(clock.now+8*86400000).toISOString()},
 {candidatesJSON:'{}'},{candidatesJSON:'[]'},{candidatesJSON:'['},{candidatesJSON:'[1]'},
 {candidatesJSON:JSON.stringify(Array(101).fill('one@example.com'))},{requestID:'invalid'}
 ])check('invalid creation rejected',!req('createMockSitting',Object.assign(payload(),p)).ok);
 check('unknown account cannot be assigned',!req('createMockSitting',Object.assign(payload(),{candidatesJSON:'["absent@example.com"]'})).ok);
 const oldExpiry=sheets.Students.vals[1][6];sheets.Students.vals[1][6]=new Date(clock.now-1000);
 check('expired candidate cannot be assigned',req('createMockSitting',payload()).code==='VALIDATION');sheets.Students.vals[1][6]=oldExpiry;
 const p=payload(),created=req('createMockSitting',p),id=created.sitting.id;
 check('default paper remains Mock 01',created.sitting.paper==='DMI-ACADEMIC-MOCK-01');
 check('teacher creates sitting',created.ok&&created.sitting.candidates.length===2);
 check('high entropy code displayed once',/^[A-F0-9]{4}(-[A-F0-9]{4}){2}$/.test(created.code));
 check('code not stored in plaintext',!JSON.stringify(sheets.MockSittings.vals).includes(created.code.replaceAll('-','')));
 check('no hash or salt in creation response',!JSON.stringify(created).includes('CodeHash')&&!JSON.stringify(created).includes('CodeSalt'));
 const duplicate=req('createMockSitting',p);
 check('ambiguous creation recovery is idempotent',duplicate.ok&&duplicate.recovered&&!duplicate.code&&sheets.MockSittings.vals.length===2);
 check('teacher lists sitting',req('listMockSittings').data.length===1);
 const studentList=req('listMockSittings',{},'student');
 check('assigned student lists own sitting',studentList.data.length===1);
 check('student never receives candidate list or secrets',!JSON.stringify(studentList).match(/two@example|candidates|CodeHash|CodeSalt|codeVersion/));
 check('unassigned student cannot discover sitting',req('listMockSittings',{},'other').data.length===0);
 check('GET bearer is rejected',req('enterMockSitting',{sittingID:id,code:created.code},'student',false).code==='POST_REQUIRED');
 check('teacher cannot enter as candidate',req('enterMockSitting',{sittingID:id,code:created.code}).code==='FORBIDDEN');
 check('unassigned candidate cannot enter',req('enterMockSitting',{sittingID:id,code:created.code},'other').code==='FORBIDDEN');
 check('unassigned candidate cannot query admission',req('myMockAdmission',{sittingID:id},'other').code==='FORBIDDEN');
 check('malformed sitting rejected',req('myMockAdmission',{sittingID:'anything'},'student').code==='VALIDATION');
 check('wrong code denied',req('enterMockSitting',{sittingID:id,code:'wrong'},'student').code==='INVALID_MOCK_CODE');
 check('failed code creates no admission',sheets.MockAdmissions.vals.length===1);
 const admitted=req('enterMockSitting',{sittingID:id,code:created.code.toLowerCase(),studentEmail:'two@example.com',studentID:'S2'},'student');
 check('correct code admits',admitted.ok&&admitted.admission.status==='admitted');
 check('identity comes from verified session',admitted.admission.studentID==='S1'&&sheets.MockAdmissions.vals[1][2]==='one@example.com');
 check('admission is not an exam start',admitted.sitting.examReady===false);
 check('successful code clears code failures',Object.keys(cache).length===0);
 const again=req('enterMockSitting',{sittingID:id,code:'wrong'},'student');
 check('repeated entry returns same admission',again.ok&&again.resumed&&again.admission.id===admitted.admission.id&&sheets.MockAdmissions.vals.length===2);
 check('refresh recovers own admission',req('myMockAdmission',{sittingID:id},'student').admission.id===admitted.admission.id);
 check('second candidate cannot see first admission',req('myMockAdmission',{sittingID:id,studentEmail:'one@example.com'},'second').admission===null);
 const rotated=req('rotateMockCode',{sittingID:id,requestID:crypto.randomUUID()});
 check('teacher rotates code',rotated.ok&&rotated.code!==created.code&&rotated.sitting.codeVersion===2);
 check('old code revoked for new entry',req('enterMockSitting',{sittingID:id,code:created.code},'second').code==='INVALID_MOCK_CODE');
 check('new code accepts second candidate',req('enterMockSitting',{sittingID:id,code:rotated.code},'second').ok);
 check('teacher sees two admitted candidates',req('listMockAdmissions',{sittingID:id}).data.length===2);
 check('student cannot list all admissions',req('listMockAdmissions',{sittingID:id},'student').code==='FORBIDDEN');
 const rp=crypto.randomUUID(),firstRotate=req('rotateMockCode',{sittingID:id,requestID:rp}),twiceRotate=req('rotateMockCode',{sittingID:id,requestID:rp});
 check('rotation retry is idempotent',twiceRotate.ok&&twiceRotate.recovered&&!twiceRotate.code&&twiceRotate.sitting.codeVersion===firstRotate.sitting.codeVersion);
 const secondPayload=Object.assign(payload(),{paperID:'DMI-ACADEMIC-MOCK-02'});
 const secondMock=req('createMockSitting',secondPayload);
 check('teacher selects Mock 02',secondMock.ok&&secondMock.sitting.paper==='DMI-ACADEMIC-MOCK-02'&&secondMock.sitting.examReady===false);
 check('retry preserves selected paper',req('createMockSitting',Object.assign({},secondPayload,{paperID:'DMI-ACADEMIC-MOCK-01'})).sitting.paper==='DMI-ACADEMIC-MOCK-02');
 const secondEntry=req('enterMockSitting',{sittingID:secondMock.sitting.id,code:secondMock.code,paperID:'DMI-ACADEMIC-MOCK-01'},'student');
 check('candidate cannot override sitting paper',secondEntry.ok&&secondEntry.sitting.paper==='DMI-ACADEMIC-MOCK-02');
 const failedSitting=req('createMockSitting',payload()),fid=failedSitting.sitting.id;
 for(let i=0;i<5;i++)check('code failure '+i,req('enterMockSitting',{sittingID:fid,code:'0000'},'student').code==='INVALID_MOCK_CODE');
 check('fifth failure blocks next entry',req('enterMockSitting',{sittingID:fid,code:failedSitting.code},'student').code==='MOCK_RATE_LIMITED');
 check('code throttling does not revoke LMS login',req('session',{},'student').ok);
 check('other candidate not throttled',req('enterMockSitting',{sittingID:fid,code:failedSitting.code},'second').ok);
 clock.now+=16*60000;
 check('code throttle expires after fifteen minutes',req('enterMockSitting',{sittingID:fid,code:failedSitting.code},'student').ok);
 const future=req('createMockSitting',Object.assign(payload(),{opensAt:new Date(clock.now+60000).toISOString(),closesAt:new Date(clock.now+3600000).toISOString()}));
 check('early entry rejected',req('enterMockSitting',{sittingID:future.sitting.id,code:future.code},'student').code==='MOCK_NOT_OPEN');
 check('teacher closes entry',req('closeMockSitting',{sittingID:id}).ok);
 check('closed code rejected',req('enterMockSitting',{sittingID:id,code:rotated.code},'student').code==='MOCK_CLOSED');
 check('closed sitting cannot rotate',req('rotateMockCode',{sittingID:id,requestID:crypto.randomUUID()}).code==='MOCK_CLOSED');
 check('close is idempotent',req('closeMockSitting',{sittingID:id}).ok);
 clock.now+=2*3600000;
 check('window expiry denies entry',req('enterMockSitting',{sittingID:fid,code:failedSitting.code},'student').code==='MOCK_CLOSED');
 check('expired window cannot rotate',req('rotateMockCode',{sittingID:fid,requestID:crypto.randomUUID()}).code==='MOCK_CLOSED');
 check('public status reflects expiry',req('listMockSittings',{},'student').data.find(s=>s.id===fid).state==='expired');
 sheets.Students.vals[1][6]=new Date(clock.now-1000);
 check('account expiry enforced on mock APIs',req('myMockAdmission',{sittingID:fid},'student').code==='ACCESS_EXPIRED');
 sheets.Students.vals[1][6]=new Date(clock.now+86400000);sheets.Students.vals[1][7]='changed';
 check('password change revokes mock access',req('listMockSittings',{},'student').code==='UNAUTHENTICATED');
 for(const f of ['MockTests.gs','Code.gs','Security.gs','release-candidate/Code.gs','dmi-mock.js'])new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
 const bundle=fs.readFileSync(path.join(root,'release-candidate/Code.gs'),'utf8');
 for(const f of ['MockTests.gs','Code.gs','Security.gs'])check('bundle matches '+f,bundle.includes(fs.readFileSync(path.join(root,f),'utf8')));
 console.log(JSON.stringify({backendChecks:count,syntaxChecks:5,nativeAppsScript:'PENDING'},null,2));
}
module.exports={createHarness};
if(require.main===module)run();
