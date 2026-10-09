/**
 * Academic lab mock entry foundation. A successful admission is NOT an exam start.
 * The timed runner, original paper and AI assessment are a separate rollout gate.
 * Public actions run under handle()'s script lock and verified session.
 */
const DMI_MOCK_HEADERS = ['SittingID','Title','Class','PaperID','OpensAt','ClosesAt','Status','CandidatesJSON','CodeSalt','CodeHash','CodeVersion','CreatedBy','CreatedAt','CreateRequestID','LastCodeRequestID'];
const DMI_ADMISSION_HEADERS = ['AdmissionID','SittingID','StudentEmail','StudentID','StudentName','AdmittedAt','Status'];

function mockSheet_(name,headers){
  const sheet=ss().getSheetByName(name);
  if(!sheet || !headers.every(k=>sheet.getDataRange().getValues()[0].map(headerName_).includes(k)))
    securityError_('MOCK_SETUP_REQUIRED','Mock test setup is not ready. Please contact DMI.');
  return sheet;
}
function initializeMockTests(){
  secret_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))securityError_('BUSY','Please retry shortly');
  try {
    const book=ss();
    [['MockSittings',DMI_MOCK_HEADERS],['MockAdmissions',DMI_ADMISSION_HEADERS]].forEach(pair=>{
      if(!book.getSheetByName(pair[0]))book.insertSheet(pair[0]).appendRow(pair[1]);
      mockSheet_(pair[0],pair[1]);
    });
    Logger.log('Mock entry ready. Existing accounts, courses, marks and sessions preserved. Exam sections are not enabled yet.');
  } finally {lock.releaseLock();}
}
function mockRole_(ctx,role){
  if(ctx.role!==role)securityError_('FORBIDDEN',role==='teacher'?'Teacher access required':'Student access required');
  active_(ctx.role,account_(ctx.role,ctx.user.email));
}
function mockID_(value){
  const id=String(value||'');
  if(!/^MOCK-[a-f0-9]{24}$/.test(id))securityError_('VALIDATION','Choose a valid mock sitting');
  return id;
}
function mockRequestID_(value){
  const id=String(value||'');
  if(!/^[a-f0-9-]{32,36}$/.test(id))securityError_('VALIDATION','Request identity required');
  return id;
}
function mockRecord_(id){
  const r=rows(mockSheet_('MockSittings',DMI_MOCK_HEADERS)).find(r=>r.SittingID===mockID_(id));
  if(!r)securityError_('NOT_FOUND','Mock sitting not found');
  return r;
}
function mockCandidates_(r){
  let emails;
  try {emails=JSON.parse(r.CandidatesJSON);}catch(e){securityError_('MOCK_SETUP_REQUIRED','Mock candidates need attention');}
  if(!Array.isArray(emails) || !emails.length || emails.length>100 || !emails.every(e=>typeof e==='string'))
    securityError_('MOCK_SETUP_REQUIRED','Mock candidates need attention');
  return emails.map(email_);
}
function mockState_(r){
  if(r.Status==='closed')return 'closed';
  if(r.Status!=='scheduled')securityError_('MOCK_SETUP_REQUIRED','Mock sitting needs attention');
  const start=new Date(r.OpensAt).getTime(),end=new Date(r.ClosesAt).getTime();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)
    securityError_('MOCK_SETUP_REQUIRED','Mock schedule needs attention');
  return Date.now()<start?'scheduled':Date.now()>=end?'expired':'open';
}
function mockPublic_(r,teacher){
  const out={id:r.SittingID,title:r.Title,class:r.Class,paper:r.PaperID,
    opensAt:new Date(r.OpensAt).toISOString(),closesAt:new Date(r.ClosesAt).toISOString(),
    state:mockState_(r),examReady:false};
  if(teacher){
    out.candidates=mockCandidates_(r).map(email=>{
      const a=account_('student',email);
      return {email,name:a?a.Name:'Removed account',id:a?a.ID:''};
    });
    out.codeVersion=Number(r.CodeVersion);
    out.createRequestID=r.CreateRequestID;
  }
  return out;
}
function mockPatch_(id,fields){
  const sheet=mockSheet_('MockSittings',DMI_MOCK_HEADERS),data=sheet.getDataRange().getValues();
  const head=data[0].map(headerName_),i=data.findIndex((r,i)=>i>0 && r[head.indexOf('SittingID')]===id);
  if(i<1)securityError_('NOT_FOUND','Mock sitting not found');
  const row=data[i].slice();
  Object.keys(fields).forEach(k=>{if(!head.includes(k))securityError_('MOCK_SETUP_REQUIRED','Mock schema needs attention');row[head.indexOf(k)]=fields[k];});
  sheet.getRange(i+1,1,1,head.length).setValues([row]);
}
function mockNewCode_(){
  const raw=opaque_().slice(0,12).toUpperCase(),salt=opaque_();
  return {code:raw.match(/.{4}/g).join('-'),salt,hash:digest_(salt+'|'+raw)};
}
function createMockSitting_(p,ctx){
  mockRole_(ctx,'teacher');
  const sheet=mockSheet_('MockSittings',DMI_MOCK_HEADERS),requestID=mockRequestID_(p.requestID);
  const existing=rows(sheet).find(r=>r.CreatedBy===email_(ctx.user.email) && r.CreateRequestID===requestID);
  if(existing)return {ok:true,sitting:mockPublic_(existing,true),recovered:true};
  const title=String(p.title||'').trim(),cls=String(p.class||'').trim();
  const start=new Date(p.opensAt).getTime(),end=new Date(p.closesAt).getTime();
  if(!title || title.length>100 || cls.length>80 || !Number.isFinite(start)||!Number.isFinite(end) ||
    end<=start || end<=Date.now() || end-start>7*86400000 || start>Date.now()+90*86400000)
    securityError_('VALIDATION','Enter a title and a valid entry window of up to seven days');
  let candidates;try{candidates=JSON.parse(String(p.candidatesJSON||''));}catch(e){securityError_('VALIDATION','Choose the students for this sitting');}
  if(!Array.isArray(candidates)||!candidates.length||candidates.length>100 || !candidates.every(e=>typeof e==='string'))
    securityError_('VALIDATION','Choose 1–100 students');
  candidates=Array.from(new Set(candidates.map(email_)));
  candidates.forEach(email=>{try{active_('student',account_('student',email));}catch(e){securityError_('VALIDATION','Choose only existing active students');}});
  const code=mockNewCode_(),id='MOCK-'+opaque_().slice(0,24);
  const fields={SittingID:id,Title:sheetText_(title),Class:sheetText_(cls),PaperID:'DMI-ACADEMIC-MOCK-01',
    OpensAt:new Date(start),ClosesAt:new Date(end),Status:'scheduled',CandidatesJSON:JSON.stringify(candidates),
    CodeSalt:code.salt,CodeHash:code.hash,CodeVersion:1,CreatedBy:email_(ctx.user.email),
    CreatedAt:new Date(),CreateRequestID:requestID,LastCodeRequestID:requestID};
  const head=sheet.getDataRange().getValues()[0].map(headerName_);
  sheet.appendRow(head.map(k=>Object.prototype.hasOwnProperty.call(fields,k)?fields[k]:''));
  return {ok:true,sitting:mockPublic_(fields,true),code:code.code};
}
function listMockSittings_(ctx){
  const data=rows(mockSheet_('MockSittings',DMI_MOCK_HEADERS));
  return {ok:true,data:data.filter(r=>ctx.role==='teacher'||mockCandidates_(r).includes(email_(ctx.user.email)))
    .map(r=>mockPublic_(r,ctx.role==='teacher')).sort((a,b)=>b.opensAt.localeCompare(a.opensAt))};
}
function rotateMockCode_(p,ctx){
  mockRole_(ctx,'teacher');
  const r=mockRecord_(p.sittingID),requestID=mockRequestID_(p.requestID);
  if(['closed','expired'].includes(mockState_(r)))securityError_('MOCK_CLOSED','Entry is closed for this sitting');
  if(r.LastCodeRequestID===requestID)return {ok:true,recovered:true,sitting:mockPublic_(r,true)};
  const code=mockNewCode_();
  const fields={CodeSalt:code.salt,CodeHash:code.hash,CodeVersion:Number(r.CodeVersion)+1,LastCodeRequestID:requestID};
  mockPatch_(r.SittingID,fields);
  return {ok:true,code:code.code,sitting:mockPublic_(Object.assign({},r,fields),true)};
}
function closeMockSitting_(p,ctx){
  mockRole_(ctx,'teacher');
  const r=mockRecord_(p.sittingID);
  mockPatch_(r.SittingID,{Status:'closed',CodeHash:'',CodeSalt:''});
  return {ok:true};
}
function mockAdmission_(r,ctx){
  return rows(mockSheet_('MockAdmissions',DMI_ADMISSION_HEADERS))
    .find(a=>a.SittingID===r.SittingID && email_(a.StudentEmail)===email_(ctx.user.email) && String(a.StudentID)===String(ctx.user.id));
}
function mockAdmissionPublic_(a){
  return {id:a.AdmissionID,sittingID:a.SittingID,studentID:a.StudentID,studentName:a.StudentName,
    admittedAt:new Date(a.AdmittedAt).toISOString(),status:a.Status};
}
function enterMockSitting_(p,ctx){
  mockRole_(ctx,'student');
  const r=mockRecord_(p.sittingID);
  if(!mockCandidates_(r).includes(email_(ctx.user.email)))securityError_('FORBIDDEN','You are not assigned to this sitting');
  const state=mockState_(r);
  if(state==='scheduled')securityError_('MOCK_NOT_OPEN','Entry has not opened yet');
  if(state!=='open')securityError_('MOCK_CLOSED','Entry is closed for this sitting');
  const prior=mockAdmission_(r,ctx);
  if(prior)return {ok:true,admission:mockAdmissionPublic_(prior),sitting:mockPublic_(r,false),resumed:true};
  const cache=CacheService.getScriptCache(),key='mock-entry:'+digest_(r.SittingID+'|'+ctx.user.id+'|'+email_(ctx.user.email));
  const raw=cache.get(key);
  let tries={count:0,until:Date.now()+15*60000};
  if(raw){try{tries=JSON.parse(raw);}catch(e){securityError_('MOCK_RATE_LIMITED','Please wait before trying this code again');}}
  if(tries.until<=Date.now())tries={count:0,until:Date.now()+15*60000};
  if(tries.count>=5)securityError_('MOCK_RATE_LIMITED','Please try the mock code again in 15 minutes');
  const code=String(p.code||'').trim().toUpperCase().replace(/-/g,'');
  if(!/^[A-F0-9]{12}$/.test(code) || !equal_(digest_(String(r.CodeSalt)+'|'+code),r.CodeHash)){
    tries.count++;cache.put(key,JSON.stringify(tries),Math.max(1,Math.ceil((tries.until-Date.now())/1000)));
    securityError_('INVALID_MOCK_CODE','Mock code is incorrect. Check it with your teacher.');
  }
  cache.remove(key);
  const id='ADMIT-'+digest_(r.SittingID+'|'+ctx.user.id+'|'+email_(ctx.user.email)).slice(0,24);
  const a={AdmissionID:id,SittingID:r.SittingID,StudentEmail:email_(ctx.user.email),StudentID:ctx.user.id,
    StudentName:sheetText_(ctx.user.name),AdmittedAt:new Date(),Status:'admitted'};
  const sheet=mockSheet_('MockAdmissions',DMI_ADMISSION_HEADERS),head=sheet.getDataRange().getValues()[0].map(headerName_);
  sheet.appendRow(head.map(k=>Object.prototype.hasOwnProperty.call(a,k)?a[k]:''));
  return {ok:true,admission:mockAdmissionPublic_(a),sitting:mockPublic_(r,false)};
}
function myMockAdmission_(p,ctx){
  mockRole_(ctx,'student');
  const r=mockRecord_(p.sittingID);
  if(!mockCandidates_(r).includes(email_(ctx.user.email)))securityError_('FORBIDDEN','You are not assigned to this sitting');
  const a=mockAdmission_(r,ctx);
  return {ok:true,admission:a?mockAdmissionPublic_(a):null,sitting:mockPublic_(r,false)};
}
function listMockAdmissions_(p,ctx){
  mockRole_(ctx,'teacher');const r=mockRecord_(p.sittingID);
  return {ok:true,data:rows(mockSheet_('MockAdmissions',DMI_ADMISSION_HEADERS))
    .filter(a=>a.SittingID===r.SittingID).map(mockAdmissionPublic_)};
}
