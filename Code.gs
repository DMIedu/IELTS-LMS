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
    if(action==='ping')return json({ok:true,version:'phase3-courses',time:new Date()});
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
      case 'listMockAttempts': result=listMockAttempts_(p,ctx);break;
      case 'startMockSpeakingTimed': result=startMockSpeakingTimed_(p,ctx);break;
      case 'resumeMockSpeakingTimed': result=resumeMockSpeakingTimed_(p,ctx);break;
      case 'uploadMockSpeaking': result=uploadMockSpeaking_(p,ctx);break;
      case 'myMockSpeakingUploads': result=myMockSpeakingUploads_(p,ctx);break;
      case 'listMockSpeakingUploads': result=listMockSpeakingUploads_(p,ctx);break;
      case 'getMockAttemptReview': result=getMockAttemptReview_(p,ctx);break;
      case 'saveMockWritingReview': result=saveMockWritingReview_(p,ctx);break;
      case 'startMockAttempt': result=startMockAttempt_(p,ctx);break;
      case 'resumeMockAttempt': result=resumeMockAttempt_(p,ctx);break;
      case 'saveMockAnswers': result=saveMockAnswers_(p,ctx);break;
      case 'submitMockSection': result=submitMockSection_(p,ctx);break;
      case 'createMockSitting': result=createMockSitting_(p,ctx);break;
      case 'listMockSittings': result=listMockSittings_(ctx);break;
      case 'rotateMockCode': result=rotateMockCode_(p,ctx);break;
      case 'closeMockSitting': result=closeMockSitting_(p,ctx);break;
      case 'enterMockSitting': result=enterMockSitting_(p,ctx);break;
      case 'myMockAdmission': result=myMockAdmission_(p,ctx);break;
      case 'listMockAdmissions': result=listMockAdmissions_(p,ctx);break;
      case 'session': result={ok:true,role:ctx.role,user:ctx.user};break;
      case 'logout': result=logout_(ctx);break;
      case 'changePassword': result=changePassword_(p,ctx);break;
      case 'resetStudentPassword': result=resetStudentPassword_(p);break;
      case 'listStudents': result={ok:true,data:rows(tab('Students')).map(safeStudent_)};break;
      case 'addStudent': result=createStudent_(p);break;
      case 'deleteStudent': result=deleteStudent(p);break;
      case 'renewStudent': result=renewStudent(p);break;
      case 'listCourses': result=visibleCourseLessons_(ctx);break;
      case 'listCourseCatalogue': result=listCourseCatalogue_(ctx);break;
      case 'saveCourseDetails': result=saveCourseDetails_(p,ctx);break;
      case 'listCourseEnrollments': result=listCourseEnrolments_(p,ctx);break;
      case 'setCourseEnrollment': result=setCourseEnrolment_(p,ctx);break;
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
  const emailCol = data[0].map(headerName_).indexOf('Email');
  if(emailCol<0)securityError_('CONFIGURATION_REQUIRED','Student email column missing');
  for (let i = 1; i < data.length; i++) {
    if (email_(data[i][emailCol]) === email) {
      sheet.deleteRow(i + 1);
      removeStudentCourseEnrolments_(email);
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
  if(courseSheet_('CourseDetails',DMI_COURSE_HEADERS,false) &&
    !courseRecords_().some(c=>c.CourseKey===courseKey_(course)))
    return {ok:false,error:'Save the course details first, then add its lessons'};
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
