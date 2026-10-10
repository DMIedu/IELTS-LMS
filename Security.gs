/**
 * Phase 1 candidate. Reconcile with exported LIVE source before deployment.
 * Owner-only setup: back up workbook + Apps Script; set DMI_SESSION_SECRET
 * to an independently generated random secret of at least 32 bytes; then run
 * initializeSecurity(). See PHASE1-SECURITY.md. Never put the secret in GitHub.
 */
const DMI_SESSION_HOURS = 4;
const DMI_PASSWORD_ITERATIONS = 600000;
const DMI_TEACHER_ACTIONS = ['getMockSpeakingRecording','getMockSpeakingReview','saveMockSpeakingReview','listMockSpeakingUploads','listMockAttempts','getMockAttemptReview','saveMockWritingReview','createMockSitting','rotateMockCode','closeMockSitting','listMockAdmissions','listStudents','addStudent','deleteStudent',
  'renewStudent','addCourse','deleteCourse','addMark','resetStudentPassword','setLMSData','saveCourseDetails','listCourseEnrollments','setCourseEnrollment'];
const DMI_ACTIONS = DMI_TEACHER_ACTIONS.concat(['startMockSpeakingTimed','resumeMockSpeakingTimed','uploadMockSpeaking','myMockSpeakingUploads','startMockAttempt','resumeMockAttempt','saveMockAnswers','submitMockSection','listMockSittings','enterMockSitting','myMockAdmission','listCourses','listMarks',
  'listExamResults','submitExamResult','getLMSData','session','logout','changePassword','listCourseCatalogue']);

function securityError_(code, message) {
  const e = new Error(message); e.code = code; throw e;
}
function secret_() {
  const s = PropertiesService.getScriptProperties().getProperty('DMI_SESSION_SECRET');
  if (!s || s.length < 43) securityError_('CONFIGURATION_REQUIRED','Security setup required');
  return s;
}
function hex_(bytes) { return bytes.map(b => ('0'+((b+256)%256).toString(16)).slice(-2)).join(''); }
function digest_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)); }
function opaque_() {
  return hex_(Utilities.computeHmacSha256Signature(Utilities.getUuid()+Utilities.getUuid(),
    secret_(), Utilities.Charset.UTF_8));
}
function equal_(a,b) {
  a=String(a); b=String(b); let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
function email_(s) { return String(s||'').trim().toLowerCase(); }
function account_(role,email) {
  return rows(tab(role==='teacher'?'Teachers':'Students')).find(r=>email_(r.Email)===email_(email));
}
function active_(role,r) {
  if(!r) securityError_('UNAUTHENTICATED','Please sign in again');
  if(r.Status && !['active','enabled'].includes(String(r.Status).toLowerCase()))
    securityError_('UNAUTHENTICATED','Account inactive');
  if(role==='student') {
    const expiry=new Date(r.ExpiryDate).getTime();
    if(!r.ExpiryDate || !Number.isFinite(expiry) || expiry<=Date.now())
      securityError_('ACCESS_EXPIRED','Your access has expired. Please contact DMI.');
  }
}
function credentialVersion_(r) {
  return digest_(String(r.ID)+'|'+String(r.PasswordHash||r.Password||''));
}
function profile_(r) {
  return {id:r.ID,name:r.Name,email:r.Email,class:r.Class||'',subject:r.Subject||'',
    branch:r.Branch||'',expiryDate:r.ExpiryDate||''};
}
function safeStudent_(r) {
  const out={};
  ['ID','Name','Email','Class','JoinDate','ExpiryDate','Branch','CourseType','TargetBand','Status']
    .forEach(k=>{if(Object.prototype.hasOwnProperty.call(r,k))out[k]=r[k];});
  out.expired=!r.ExpiryDate || !Number.isFinite(new Date(r.ExpiryDate).getTime()) || isExpired(r.ExpiryDate);
  return out;
}
function initializeSecurity() {
  secret_();
  const book=ss();
  ['Students','Teachers'].forEach(name=>{
    const sheet=tab(name);
    const head=sheet.getDataRange().getValues()[0].map(headerName_);
    ['PasswordHash','PasswordSalt','PasswordIterations'].forEach(k=>{
      if(!head.includes(k)) { head.push(k); sheet.getRange(1,head.length).setValue(k); }
    });
  });
  if(!book.getSheetByName('Sessions'))book.insertSheet('Sessions').appendRow(
    ['TokenHash','Email','Role','CredentialVersion','ExpiresAt']);
  // Existing LMSSync storage is preserved; LiveSync.gs reads its live chunk format.
}
function setFields_(sheet,email,fields) {
  const data=sheet.getDataRange().getValues(), head=data[0].map(headerName_);
  const i=data.findIndex((r,j)=>j>0 && email_(r[head.indexOf('Email')])===email_(email));
  if(i<1) securityError_('NOT_FOUND','Account not found');
  Object.keys(fields).forEach(k=>{
    const col=head.indexOf(k); if(col<0)securityError_('CONFIGURATION_REQUIRED','Security columns missing');
    sheet.getRange(i+1,col+1).setValue(fields[k]);
  });
}
function passwordFields_(password) {
  if(typeof password!=='string' || password.length<12 || password.length>128)
    securityError_('VALIDATION','Use a password of 12–128 characters');
  const salt=opaque_();
  const hash=pbkdf2_(password,salt,DMI_PASSWORD_ITERATIONS);
  return {PasswordHash:hash,PasswordSalt:salt,PasswordIterations:DMI_PASSWORD_ITERATIONS,Password:''};
}
function writePassword_(role,email,password) {
  const fields=passwordFields_(password);
  setFields_(tab(role==='teacher'?'Teachers':'Students'),email,fields);
}
function verifyPassword_(r,password) {
  if(r.PasswordHash) {
    const n=Number(r.PasswordIterations);
    if(n!==DMI_PASSWORD_ITERATIONS || !r.PasswordSalt) return false;
    return equal_(r.PasswordHash,pbkdf2_(password,String(r.PasswordSalt),n));
  }
  const props=PropertiesService.getScriptProperties();
  const deadline=new Date(props.getProperty('DMI_LEGACY_PASSWORD_DEADLINE')||'').getTime();
  return props.getProperty('DMI_ALLOW_LEGACY_PASSWORDS')==='true' &&
    Number.isFinite(deadline) && Date.now()<deadline &&
    !!r.Password && equal_(String(r.Password),password);
}
function secureLogin_(p) {
  secret_();
  const email=email_(p.email), password=String(p.password||'');
  if(!email || !password || password.length>128) return {ok:false,error:'Invalid email or password'};
  // Account-based throttle. Script lock in handle makes counter updates atomic.
  const cache=CacheService.getScriptCache(), key='login:'+digest_(email);
  const count=Number(cache.get(key)||0);
  if(count>=5)return {ok:false,code:'RATE_LIMITED',error:'Please try again in 15 minutes'};
  cache.put(key,String(count+1),900);
  const role=account_('teacher',email)?'teacher':'student';
  let r=account_(role,email);
  if(!r || !verifyPassword_(r,password))return {ok:false,error:'Invalid email or password'};
  active_(role,r);
  if(!r.PasswordHash) {
    // Migration preserves existing short passwords; new/reset passwords need 12+.
    const salt=opaque_();
    setFields_(tab(role==='teacher'?'Teachers':'Students'),email,
      {PasswordHash:pbkdf2_(password,salt,DMI_PASSWORD_ITERATIONS),PasswordSalt:salt,
       PasswordIterations:DMI_PASSWORD_ITERATIONS,Password:''});
    r=account_(role,email);
  }
  cache.remove(key);
  const token=opaque_(), expiresAt=new Date(Date.now()+DMI_SESSION_HOURS*3600000);
  const sheet=tab('Sessions');
  // Remove expired tokens to bound retained session data.
  const data=sheet.getDataRange().getValues();
  for(let i=data.length-1;i>0;i--)if(new Date(data[i][4]).getTime()<=Date.now())sheet.deleteRow(i+1);
  sheet.appendRow([digest_(token),email,role,credentialVersion_(r),expiresAt]);
  return {ok:true,role:role,user:profile_(r),sessionToken:token,sessionExpiresAt:expiresAt};
}
function authorize_(p,action) {
  secret_();
  if(!DMI_ACTIONS.includes(action))securityError_('UNKNOWN_ACTION','Unknown action');
  const token=String(p.sessionToken||'');
  if(!/^[a-f0-9]{64}$/.test(token))securityError_('UNAUTHENTICATED','Please sign in again');
  const session=rows(tab('Sessions')).find(r=>equal_(r.TokenHash,digest_(token)));
  if(!session || !Number.isFinite(new Date(session.ExpiresAt).getTime()) || new Date(session.ExpiresAt).getTime()<=Date.now())
    securityError_('UNAUTHENTICATED','Please sign in again');
  if(!['student','teacher'].includes(session.Role))securityError_('UNAUTHENTICATED','Please sign in again');
  const r=account_(session.Role,session.Email);
  active_(session.Role,r);
  if(!equal_(session.CredentialVersion,credentialVersion_(r)))
    securityError_('UNAUTHENTICATED','Please sign in again');
  const ctx={role:session.Role,user:profile_(r),tokenHash:session.TokenHash};
  if(DMI_TEACHER_ACTIONS.includes(action) && ctx.role!=='teacher')
    securityError_('FORBIDDEN','Teacher access required');
  if(action==='submitExamResult' && ctx.role!=='student')
    securityError_('FORBIDDEN','Student access required');
  return ctx;
}
function logout_(ctx) {
  const sheet=tab('Sessions'), data=sheet.getDataRange().getValues();
  for(let i=data.length-1;i>0;i--)if(equal_(data[i][0],ctx.tokenHash))sheet.deleteRow(i+1);
  return {ok:true};
}
function createStudent_(p) {
  const name=String(p.name||'').trim(), email=email_(p.email);
  if(!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    securityError_('VALIDATION','Name and valid email required');
  if(account_('student',email)||account_('teacher',email))
    securityError_('VALIDATION','An account with this email already exists');
  const sheet=tab('Students'), head=sheet.getDataRange().getValues()[0].map(headerName_);
  ['PasswordHash','PasswordSalt','PasswordIterations'].forEach(k=>{
    if(!head.includes(k))securityError_('CONFIGURATION_REQUIRED','Run security setup');
  });
  const id=uid('STU'), today=new Date(), expiry=addDays(today,STUDENT_VALIDITY_DAYS);
  const fields=Object.assign({ID:id,Name:sheetText_(name),Email:email,Class:sheetText_(p.class),
    JoinDate:today,ExpiryDate:expiry,Status:'Active'},passwordFields_(String(p.password||'')));
  sheet.appendRow(head.map(k=>Object.prototype.hasOwnProperty.call(fields,k)?fields[k]:''));
  return {ok:true,id:id,expiryDate:expiry};
}
function sheetText_(s) {
  const v=String(s||''); return /^[=+\-@]/.test(v)?"'"+v:v;
}
function changePassword_(p,ctx) {
  const r=account_(ctx.role,ctx.user.email);
  if(!verifyPassword_(r,String(p.currentPassword||'')))
    securityError_('VALIDATION','Current password incorrect');
  writePassword_(ctx.role,ctx.user.email,String(p.newPassword||''));
  return {ok:true,reauthenticate:true};
}
function resetStudentPassword_(p) {
  const email=email_(p.email);
  if(!account_('student',email))securityError_('NOT_FOUND','Student not found');
  // The teacher sets a NEW secret; the existing password is never retrievable.
  writePassword_('student',email,String(p.newPassword||''));
  return {ok:true};
}
// No automatic emails or insecure public "forgot password" endpoint. Teacher
// verifies student identity outside the LMS, then sets a new password via POST.

// LiveSync.gs implements the preserved live chunk format. Native deployment
// behavior and storage limits still require testing against the copied workbook.
function liveSyncRead_() {
  if(typeof readLiveLMSData_!=='function')
    securityError_('LIVE_SYNC_REQUIRED','Live sync adapter has not been reconciled');
  const data=readLiveLMSData_();
  if(!data || typeof data!=='object' || Array.isArray(data))
    securityError_('LIVE_SYNC_REQUIRED','Invalid live sync data');
  return data;
}
function sharedSyncKey_(k) {
  return k==='lms_courses' || /^lms_announce_[A-Za-z0-9_-]+$/.test(k);
}
function secureGetLMSData_(ctx) {
  const source=liveSyncRead_(), out={};
  // Both roles receive only published content. Account lists, tokens, all
  // learners' notes/progress/Q&A are excluded. Personal progress stays local.
  Object.keys(source).forEach(k=>{if(sharedSyncKey_(k))out[k]=source[k];});
  return {ok:true,data:out};
}
function secureSetLMSData_(p) {
  const raw=String(p.payload||'');
  if(raw.length>400000)securityError_('VALIDATION','Sync payload too large');
  let data; try{data=JSON.parse(raw);}catch(e){securityError_('VALIDATION','Invalid sync JSON');}
  if(!data || Array.isArray(data) || typeof data!=='object')
    securityError_('VALIDATION','Invalid sync object');
  Object.keys(data).forEach(k=>{
    if(!sharedSyncKey_(k) || typeof data[k]!=='string')
      securityError_('FORBIDDEN','Sync key not permitted');
    try{JSON.parse(data[k]);}catch(e){securityError_('VALIDATION','Sync value must contain JSON');}
  });
  if(typeof writeLiveLMSData_!=='function')
    securityError_('LIVE_SYNC_REQUIRED','Live sync adapter has not been reconciled');
  // Adapter MUST merge this patch into preserved data; never replace entire blob.
  writeLiveLMSData_(data);
  return {ok:true};
}

/**
 * PBKDF2-HMAC-SHA256, 32-byte output. Preserve native UTF-8 byte encoding;
 * only the per-round HMAC switches to pinned server-only js-sha256.
 * Native 600000-round benchmark took 264532 ms in the TEST editor.
 * Keep 600000 rounds; replacement Apps Script performance remains a rollout gate.
 */
function pbkdf2_(password,salt,iterations) {
  if(!Number.isInteger(iterations) || iterations<1 || iterations>DMI_PASSWORD_ITERATIONS)
    throw new Error('Invalid PBKDF2 iteration count');
  const key=Utilities.newBlob(password).getBytes().map(b=>(b+256)%256);
  const block=Utilities.newBlob(salt).getBytes().map(b=>(b+256)%256).concat([0,0,0,1]);
  let u=DMI_SHA256.hmac.array(key,block), out=u.slice();
  for(let i=1;i<iterations;i++){
    u=DMI_SHA256.hmac.array(key,u);
    for(let j=0;j<out.length;j++)out[j]^=u[j];
  }
  return hex_(out);
}

/** Editor-only checks. No spreadsheet, passwords, properties or deployment changes. */
function testPasswordPrimitive() {
  const vectors=[
    [1,'120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'],
    [2,'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43'],
    [4096,'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a']
  ];
  vectors.forEach(v=>{if(pbkdf2_('password','salt',v[0])!==v[1])throw new Error('PBKDF2 known-answer test failed');});
  if(DMI_SHA256.hmac.hex(new Array(20).fill(11),'Hi There')!==
    'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7')
    throw new Error('HMAC known-answer test failed');
  return true;
}
function benchmarkPasswordHash() {
  const start=Date.now();
  pbkdf2_('benchmark-only-not-an-account','benchmark-salt',DMI_PASSWORD_ITERATIONS);
  Logger.log('PBKDF2 600000 pure JS elapsed ms: '+(Date.now()-start));
}
function runPasswordTestsAndBenchmark() {
  if(testPasswordPrimitive()!==true)throw new Error('Password primitive check failed');
  Logger.log('PASS: PBKDF2 and HMAC known-answer tests passed. No spreadsheet data was changed.');
  benchmarkPasswordHash();
}
