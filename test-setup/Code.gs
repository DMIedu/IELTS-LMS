/**
 * GENERATED TEST-ONLY bundle: replace Code.gs in the copied TEST project only.
 * Includes Code.gs, Security.gs and LiveSync.gs from the draft branch.
 * Do not also add those files separately (duplicate definitions).
 * First run runPasswordPrimitiveCheck; it reads/writes NO spreadsheet.
 * No deployment is needed for this editor-only check.
 */
/**
 * DMI LMS - Google Apps Script Backend
 *
 * SHEET TABS REQUIRED:
 *
 * 1) Students:     ID | Name | Email | Password | Class | JoinDate | ExpiryDate
 * 2) Teachers:     ID | Name | Email | Password | Subject
 * 3) Courses:      CourseID | Course | Lesson | VideoURL | PDFURL
 * 4) Marks:        MarkID | StudentEmail | StudentName | Course | Test | Score | MaxScore | Date | TeacherName | Comments
 * 5) ExamResults:  ResultID | StudentEmail | StudentName | TestName | Course | Score | MaxScore | Date | AnswersJSON | QuestionsJSON
 *
 * Each new student gets 1-month access from JoinDate. After expiry,
 * login is blocked and the admin must Renew them from the teacher panel.
 *
 * CANDIDATE ONLY: Do not replace live source before reconciling sync and benchmarking passwords.
 * Deploy: Extensions → Apps Script → paste this file → Save
 *         Deploy → New deployment → Web app → Execute as: Me, Access: Anyone
 *         Copy the URL, paste into login.html, teacher-panel.html, student-panel.html
 *         AND lms-result-sender.js
 */

// ====== CONFIG ======
// Configure the workbook ID in Script Properties; no production workbook is selected by default.
// Required Script Property. Point it at the TEST copy until rollout is approved.
const SHEET_ID = PropertiesService.getScriptProperties().getProperty('DMI_SPREADSHEET_ID');
const STUDENT_VALIDITY_DAYS = 30; // 1 month

/**
 * ⚙ TEST FUNCTION — run this once in Apps Script to verify everything works.
 * Top of editor: pick "testConnection" in the function dropdown, click ▶ Run.
 * Then View → Logs (or Ctrl+Enter) to see the result.
 */
/** Dumps every row of the Teachers tab so you can see exactly what's stored. */
function debugTeachers() {
  Logger.log('Teacher credentials are never logged. Use testConnection for schema checks.');
}

function testConnection() {
  try {
    const book = SpreadsheetApp.openById(SHEET_ID);
    Logger.log('✓ Opened spreadsheet: ' + book.getName());
    const sheets = book.getSheets();
    // Show every tab and its char codes — this reveals hidden characters
    Logger.log('--- Tab names with character codes ---');
    sheets.forEach(s => {
      const n = s.getName();
      const codes = [];
      for (let i = 0; i < n.length; i++) codes.push(n.charCodeAt(i));
      Logger.log('  "' + n + '"  length=' + n.length + '  codes=[' + codes.join(',') + ']');
    });
    Logger.log('--- Checking required tabs (smart match) ---');
    ['Students','Teachers','Courses','Marks','ExamResults'].forEach(name => {
      try {
        const s = tab(name);
        Logger.log('  ✓ ' + name + ' OK  (matched: "' + s.getName() + '")');
      } catch (e) {
        Logger.log('  ✗ ' + e.message);
      }
    });
  } catch (e) {
    Logger.log('✗ ERROR: ' + e.message);
  }
}

// ====== ENTRY POINTS ======
function doGet(e) { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  let lock;
  try {
    const p=Object.assign({},e && e.parameter || {});
    const action=String(p.action||'');
    if(action==='ping')return json({ok:true,version:'phase1-candidate',time:new Date()});
    // Credentials and bearer tokens must never be accepted in GET URLs.
    if(!e || !e.postData)securityError_('POST_REQUIRED','Use POST');
    lock=LockService.getScriptLock();
    if(!lock.tryLock(20000))securityError_('BUSY','Please retry shortly');
    if(action==='login')return json(secureLogin_(p));
    const ctx=authorize_(p,action);
    let result;
    if(ctx.role==='student' && ['listMarks','listExamResults','submitExamResult'].includes(action)){
      if(p.studentEmail && email_(p.studentEmail)!==email_(ctx.user.email))
        securityError_('FORBIDDEN','You can only access your own results');
      p.studentEmail=ctx.user.email; p.studentName=ctx.user.name;
    }
    if(action==='addMark'){
      const student=account_('student',p.studentEmail);
      if(!student)securityError_('NOT_FOUND','Student not found');
      p.studentName=student.Name; p.teacherName=ctx.user.name;
    }
    if(action==='renewStudent' && (!Number.isInteger(Number(p.days||30)) ||
      Number(p.days||30)<1 || Number(p.days||30)>366))
      securityError_('VALIDATION','Renewal must be 1–366 days');
    if(['addMark','submitExamResult'].includes(action)){
      const score=Number(p.score||0), max=Number(p.maxScore||0);
      if(!Number.isFinite(score)||!Number.isFinite(max)||score<0||max<0||score>max||max>1000)
        securityError_('VALIDATION','Invalid score');
      ['answersJSON','questionsJSON'].forEach(k=>{
        if(String(p[k]||'').length>45000)securityError_('VALIDATION','Submission too large');
        if(p[k]){try{JSON.parse(p[k]);}catch(e){securityError_('VALIDATION','Invalid submission JSON');}}
      });
    }
    ['studentName','teacherName','name','class','course','lesson','test','testName','comments']
      .forEach(k=>{if(p[k]!=null)p[k]=sheetText_(p[k]);});
    switch(action){
      case 'session': result={ok:true,role:ctx.role,user:ctx.user};break;
      case 'logout': result=logout_(ctx);break;
      case 'changePassword': result=changePassword_(p,ctx);break;
      case 'resetStudentPassword': result=resetStudentPassword_(p);break;
      case 'listStudents': result={ok:true,data:rows(tab('Students')).map(safeStudent_)};break;
      case 'addStudent': result=createStudent_(p);break;
      case 'deleteStudent': result=deleteStudent(p);break;
      case 'renewStudent': result=renewStudent(p);break;
      case 'listCourses': result=listCourses();break;
      case 'addCourse': result=addCourse(p);break;
      case 'deleteCourse': result=deleteCourse(p);break;
      case 'addMark': result=addMark(p);break;
      case 'listMarks': result=listMarks(p);break;
      case 'submitExamResult': result=submitExamResult(p);break;
      case 'listExamResults': result=listExamResults(p);break;
      case 'getLMSData': result=secureGetLMSData_(ctx);break;
      case 'setLMSData': result=secureSetLMSData_(p);break;
      default: securityError_('UNKNOWN_ACTION','Unknown action');
    }
    return json(result);
  } catch(err) {
    // Never return internal exceptions, spreadsheet contents, or credentials.
    return json({ok:false,code:err.code||'SERVER_ERROR',
      error:err.code?err.message:'Request failed. Please contact DMI.'});
  } finally {if(lock && lock.hasLock())lock.releaseLock();}
}

// ====== HELPERS ======
function ss() {
  if(!SHEET_ID) securityError_('CONFIGURATION_REQUIRED','Set DMI_SPREADSHEET_ID to the test workbook');
  if(PropertiesService.getScriptProperties().getProperty('DMI_TEST_MODE')!=='true')
    securityError_('TEST_ONLY','Set DMI_TEST_MODE=true for this test-only bundle');
  if(['1IewfmmCpqrn8421yOa6oMYh5OGJK67FYIAaXiyXVkis','1lewfmmCpqrn8421yOa6oMYh5OGJK67FYIAaXiyXVkis'].includes(SHEET_ID))
    securityError_('TEST_ONLY','This test-only bundle refuses the production workbook');
  return SpreadsheetApp.openById(SHEET_ID);
}
function tab(name) {
  const book = ss();
  // 1) Try exact match
  let s = book.getSheetByName(name);
  if (s) return s;
  // 2) Fallback: case-insensitive, trim spaces and zero-width chars
  const clean = function(x){ return String(x).replace(/[\s​-‍﻿]+/g,'').toLowerCase(); };
  const target = clean(name);
  const all = book.getSheets();
  for (let i = 0; i < all.length; i++) {
    if (clean(all[i].getName()) === target) return all[i];
  }
  // 3) Not found — list what IS there so the error is actionable
  const have = all.map(x => '"' + x.getName() + '"').join(', ');
  throw new Error('Sheet tab not found: "' + name + '". Tabs in this sheet: ' + have);
}
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function headerName_(value) {
  return String(value||'').replace(/[\u200b-\u200d\ufeff]/g,'').trim();
}
function rows(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const head = data[0].map(headerName_);
  return data.slice(1).map(r => {
    const o = {};
    head.forEach((h, i) => { if(h) o[h] = r[i]; });
    return o;
  });
}
function uid(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function isExpired(expiry) {
  if (!expiry) return false;
  const exp = new Date(expiry);
  if (isNaN(exp.getTime())) return false;
  return exp.getTime() < new Date().getTime();
}

// ====== ACTIONS ======
// Authentication and account creation moved to Security.gs.

function deleteStudent(p) {
  const email = (p.email || '').toString().trim().toLowerCase();
  if (!email) return { ok: false, error: 'Email required' };
  const sheet = tab('Students');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase() === email) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Student not found' };
}

function renewStudent(p) {
  const email = (p.email || '').toString().trim().toLowerCase();
  const days = Number(p.days || STUDENT_VALIDITY_DAYS);
  if (!email) return { ok: false, error: 'Email required' };
  const sheet = tab('Students');
  const data = sheet.getDataRange().getValues();
  const head = data[0].map(headerName_);
  const expiryCol = head.indexOf('ExpiryDate');
  if (expiryCol < 0) return { ok: false, error: 'ExpiryDate column missing in Students sheet' };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).toLowerCase() === email) {
      const current = data[i][expiryCol];
      const base = (current && new Date(current) > new Date()) ? new Date(current) : new Date();
      const newExpiry = addDays(base, days);
      sheet.getRange(i + 1, expiryCol + 1).setValue(newExpiry);
      return { ok: true, newExpiry };
    }
  }
  return { ok: false, error: 'Student not found' };
}

function listCourses() {
  return { ok: true, data: rows(tab('Courses')) };
}

function addCourse(p) {
  const course   = (p.course   || '').toString().trim();
  const lesson   = (p.lesson   || '').toString().trim();
  const videoURL = (p.videoURL || '').toString().trim();
  const pdfURL   = (p.pdfURL   || '').toString().trim();
  if (!course || !lesson) return { ok: false, error: 'Course and Lesson required' };
  const sheet = tab('Courses');
  const id = uid('CRS');
  sheet.appendRow([id, course, lesson, videoURL, pdfURL]);
  return { ok: true, id };
}

function deleteCourse(p) {
  const id = (p.courseID || '').toString();
  if (!id) return { ok: false, error: 'courseID required' };
  const sheet = tab('Courses');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === id) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Course not found' };
}

function addMark(p) {
  const studentEmail = (p.studentEmail || '').toString().trim().toLowerCase();
  const studentName  = (p.studentName  || '').toString();
  const course       = (p.course       || '').toString();
  const test         = (p.test         || '').toString();
  const score        = Number(p.score || 0);
  const maxScore     = Number(p.maxScore || 0);
  const teacherName  = (p.teacherName  || '').toString();
  const comments     = (p.comments     || '').toString();
  if (!studentEmail || !test) return { ok: false, error: 'studentEmail and test required' };

  const sheet = tab('Marks');
  const id = uid('MARK');
  sheet.appendRow([id, studentEmail, studentName, course, test, score, maxScore, new Date(), teacherName, comments]);
  return { ok: true, id };
}

function listMarks(p) {
  const email = (p.studentEmail || '').toString().trim().toLowerCase();
  let data = rows(tab('Marks'));
  if (email) data = data.filter(r => String(r.StudentEmail).toLowerCase() === email);
  data.sort((a, b) => new Date(b.Date) - new Date(a.Date));
  return { ok: true, data };
}

// ===== EXAM RESULT SUBMISSION (called by test pages when student finishes) =====
function submitExamResult(p) {
  const studentEmail = (p.studentEmail || '').toString().trim().toLowerCase();
  const studentName  = (p.studentName  || '').toString();
  const testName     = (p.testName     || '').toString();
  const course       = (p.course       || '').toString();
  const score        = Number(p.score || 0);
  const maxScore     = Number(p.maxScore || 0);
  const answersJSON  = (p.answersJSON  || '').toString();
  const questionsJSON= (p.questionsJSON|| '').toString();
  if (!studentEmail || !testName) return { ok: false, error: 'studentEmail and testName required' };

  // Save full submission
  const id = uid('EXAM');
  tab('ExamResults').appendRow([
    id, studentEmail, studentName, testName, course, score, maxScore, new Date(),
    answersJSON, questionsJSON
  ]);
  // Also write a row into Marks so the score shows on the student dashboard
  tab('Marks').appendRow([
    uid('MARK'), studentEmail, studentName, course, testName, score, maxScore,
    new Date(), 'System (auto)', 'Submitted by student'
  ]);
  return { ok: true, id };
}

function listExamResults(p) {
  const email = (p.studentEmail || '').toString().trim().toLowerCase();
  let data = rows(tab('ExamResults'));
  if (email) data = data.filter(r => String(r.StudentEmail).toLowerCase() === email);
  data.sort((a, b) => new Date(b.Date) - new Date(a.Date));
  return { ok: true, data };
}


/**
 * Phase 1 candidate. Reconcile with exported LIVE source before deployment.
 * Owner-only setup: back up workbook + Apps Script; set DMI_SESSION_SECRET
 * to an independently generated random secret of at least 32 bytes; then run
 * initializeSecurity(). See PHASE1-SECURITY.md. Never put the secret in GitHub.
 */
const DMI_SESSION_HOURS = 4;
const DMI_PASSWORD_ITERATIONS = 600000;
const DMI_TEACHER_ACTIONS = ['listStudents','addStudent','deleteStudent',
  'renewStudent','addCourse','deleteCourse','addMark','resetStudentPassword','setLMSData'];
const DMI_ACTIONS = DMI_TEACHER_ACTIONS.concat(['listCourses','listMarks',
  'listExamResults','submitExamResult','getLMSData','session','logout','changePassword']);

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
 * PBKDF2-HMAC-SHA256, 32-byte output, UTF-8 password and UTF-8 hex salt.
 * Candidate uses Apps Script's native HMAC. Benchmark 600,000 iterations in a
 * TEST deployment before any migration. Do not lower work factor to make it fit;
 * use a vetted native/managed identity provider if Apps Script exceeds limits.
 */
function pbkdf2_(password,salt,iterations) {
  const key=Utilities.newBlob(password).getBytes();
  const block=Utilities.newBlob(salt).getBytes().concat([0,0,0,1]);
  let u=Utilities.computeHmacSha256Signature(block,key), out=u.slice();
  for(let i=1;i<iterations;i++){
    u=Utilities.computeHmacSha256Signature(u,key);
    for(let j=0;j<out.length;j++)out[j]=(out[j]^u[j]);
  }
  return hex_(out);
}

/** Owner-only validation in a disposable project. Does not modify accounts. */
function testPasswordPrimitive() {
  const vectors=[
    [1,'120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'],
    [2,'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43']
  ];
  vectors.forEach(v=>{if(pbkdf2_('password','salt',v[0])!==v[1])throw new Error('PBKDF2 known-answer test failed');});
  return true;
}
function benchmarkPasswordHash() {
  const start=Date.now();
  pbkdf2_('benchmark-only-not-an-account','benchmark-salt',DMI_PASSWORD_ITERATIONS);
  Logger.log('PBKDF2 600000 elapsed ms: '+(Date.now()-start));
}


/**
 * Reconciled from the user-supplied live Code.gs (7 October 2026).
 * Same LMSSync Key | Value | UpdatedAt schema, 45,000-character JSON chunks,
 * and legacy "data" support. Internal adapters only; public handle in Code.gs
 * authorizes every request. Never add the old unauthenticated public routes.
 */
const DMI_LMS_SYNC_CHUNK_SIZE = 45000;
const DMI_LMS_SYNC_MAX_CHARS = 2000000;

function readLiveLMSData_() {
  const values=tab('LMSSync').getDataRange().getValues();
  const chunks={}, legacy=[];
  for(let i=1;i<values.length;i++){
    const key=String(values[i][0]||''), match=key.match(/^chunk(\d+)$/);
    if(match){
      const index=Number(match[1]);
      if(!Number.isSafeInteger(index)||index<0||index>Math.ceil(DMI_LMS_SYNC_MAX_CHARS/DMI_LMS_SYNC_CHUNK_SIZE))
        securityError_('SYNC_CORRUPT','Invalid sync chunk index');
      if(Object.prototype.hasOwnProperty.call(chunks,index))
        securityError_('SYNC_CORRUPT','Duplicate sync chunks');
      chunks[index]=String(values[i][1]||'');
    }else if(key==='data')legacy.push(String(values[i][1]||'{}'));
  }
  const indexes=Object.keys(chunks).map(Number).sort((a,b)=>a-b);
  let payload;
  if(indexes.length){
    if(indexes.some((n,i)=>n!==i))
      securityError_('SYNC_CORRUPT','Sync chunks are incomplete; restore the backup before editing');
    payload=indexes.map(i=>chunks[i]).join('');
  }else if(legacy.length){
    if(legacy.length!==1)securityError_('SYNC_CORRUPT','Duplicate legacy sync snapshots');
    payload=legacy[0];
  }else return {};
  if(payload.length>DMI_LMS_SYNC_MAX_CHARS)
    securityError_('VALIDATION','Stored sync snapshot is too large');
  let data;
  try{data=JSON.parse(payload);}catch(e){securityError_('SYNC_CORRUPT','Stored sync data is not valid JSON');}
  if(!data || Array.isArray(data) || typeof data!=='object')
    securityError_('SYNC_CORRUPT','Stored sync snapshot must be an object');
  return data;
}

function writeLiveLMSData_(patch) {
  // Defense in depth for owner/editor calls as well as the public dispatch.
  Object.keys(patch).forEach(k=>{
    if(!sharedSyncKey_(k)||typeof patch[k]!=='string')
      securityError_('FORBIDDEN','Sync key not permitted');
  });
  // Public handle holds the script lock across read/merge/write.
  // Abort on unreadable old data; never overwrite a corrupt snapshot with {}.
  const merged=readLiveLMSData_();
  Object.keys(patch).forEach(k=>{merged[k]=patch[k];});
  const payload=JSON.stringify(merged);
  if(payload.length>DMI_LMS_SYNC_MAX_CHARS)
    securityError_('VALIDATION','Merged sync snapshot is too large');
  const sheet=tab('LMSSync'), range=sheet.getDataRange();
  const values=range.getValues(), formulas=range.getFormulas();
  const width=Math.max(3,values[0].length);
  const existing=values.slice(1).map((r,i)=>{
    const out=Array(width).fill('');
    for(let j=0;j<r.length;j++)out[j]=(formulas[i+1]&&formulas[i+1][j])||r[j];
    return out;
  });
  const slots=[];
  for(let i=1;i<values.length;i++){
    if(/^(?:chunk\d+|data)$/.test(String(values[i][0]||'')))slots.push(i-1);
  }
  const now=new Date(), chunks=[];
  for(let i=0;i<payload.length;i+=DMI_LMS_SYNC_CHUNK_SIZE)
    chunks.push(payload.slice(i,i+DMI_LMS_SYNC_CHUNK_SIZE));
  for(let i=0;i<Math.max(slots.length,chunks.length);i++){
    let pos=slots[i];
    if(pos==null){pos=existing.length;existing.push(Array(width).fill(''));}
    if(i<chunks.length){
      existing[pos][0]='chunk'+i;existing[pos][1]=chunks[i];existing[pos][2]=now;
    }else{
      // Clear only obsolete storage fields; retain additional columns.
      existing[pos][0]='';existing[pos][1]='';existing[pos][2]='';
    }
  }
  if(existing.length+1>sheet.getMaxRows())
    sheet.insertRowsAfter(sheet.getMaxRows(),existing.length+1-sheet.getMaxRows());
  // A single range write avoids the live code's destructive clear-then-write.
  // Headers, unrelated row positions/values/formulas, and all unpatched keys
  // are preserved. This still requires native Apps Script testing.
  sheet.getRange(2,1,existing.length,width).setValues(existing);
}


/** Editor-only first check. No account passwords or worksheet data are touched. */
function runPasswordPrimitiveCheck() {
  if(testPasswordPrimitive()!==true)throw new Error('Password primitive check failed');
  Logger.log('PASS: PBKDF2-HMAC-SHA256 known-answer tests passed. No spreadsheet data was changed.');
}
