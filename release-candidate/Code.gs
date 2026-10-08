/** Course management release candidate. Test against a copied workbook before production.
 * Consolidated backend: replace Code.gs; do not also add standalone source files.
 * Existing properties and Phase 1 security remain in place.
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


/** Server-only vendored js-sha256 1.0.0. Upstream commit 9a54fb31d4594762987e1b5d175265f6bac921de.
 * Unmodified build/sha256.js enclosed in a private CommonJS export wrapper.
 * No runtime downloads. MIT license below.
 */
/*
Copyright (c) 2014-2026 Chen, Yi-Cyuan

MIT License

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
var DMI_SHA256=(function(){
var exports={}, module={exports:exports};
/**
 * [js-sha256]{@link https://github.com/emn178/js-sha256}
 *
 * @version 1.0.0
 * @author Chen, Yi-Cyuan [emn178@gmail.com]
 * @copyright Chen, Yi-Cyuan 2014-2026
 * @license MIT
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.sha256 = factory());
})(this, (function () { 'use strict';

  var INPUT_ERROR = 'input is invalid type';
  var FINALIZE_ERROR = 'finalize already called';

  var ARRAY_BUFFER = typeof ArrayBuffer !== 'undefined';

  var formatMessage = function (message) {
    var type = typeof message;
    if (type === 'string') {
      return [message, true];
    }
    if (Array.isArray(message)) {
      return [message, false];
    }
    if (ARRAY_BUFFER && message) {
      if (message.constructor === ArrayBuffer) {
        return [new Uint8Array(message), false];
      } else if (ArrayBuffer.isView(message)) {
        return [message, false];
      }
    }
    throw new Error(INPUT_ERROR);
  };

  var HEX_CHARS = '0123456789abcdef'.split('');
  var EXTRA = [-2147483648, 8388608, 32768, 128];
  var SHIFT = [24, 16, 8, 0];
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var OUTPUT_TYPES = ['hex', 'array', 'digest', 'arrayBuffer'];

  var blocks = [];

  var createOutputMethod = function (outputType, is224) {
    return function (message) {
      return new Sha256(is224, true).update(message)[outputType]();
    };
  };

  var createMethod = function (is224) {
    var method = createOutputMethod('hex', is224);
    method.create = function () {
      return new Sha256(is224);
    };
    method.update = function (message) {
      return method.create().update(message);
    };
    for (var i = 0; i < OUTPUT_TYPES.length; ++i) {
      var type = OUTPUT_TYPES[i];
      method[type] = createOutputMethod(type, is224);
    }
    return method;
  };

  var createHmacOutputMethod = function (outputType, is224) {
    return function (key, message) {
      return new HmacSha256(key, is224, true).update(message)[outputType]();
    };
  };

  var createHmacMethod = function (is224) {
    var method = createHmacOutputMethod('hex', is224);
    method.create = function (key) {
      return new HmacSha256(key, is224);
    };
    method.update = function (key, message) {
      return method.create(key).update(message);
    };
    for (var i = 0; i < OUTPUT_TYPES.length; ++i) {
      var type = OUTPUT_TYPES[i];
      method[type] = createHmacOutputMethod(type, is224);
    }
    return method;
  };

  function Sha256(is224, sharedMemory) {
    if (sharedMemory) {
      blocks[0] = blocks[16] = blocks[1] = blocks[2] = blocks[3] =
        blocks[4] = blocks[5] = blocks[6] = blocks[7] =
        blocks[8] = blocks[9] = blocks[10] = blocks[11] =
        blocks[12] = blocks[13] = blocks[14] = blocks[15] = 0;
      this.blocks = blocks;
    } else {
      this.blocks = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    if (is224) {
      this.h0 = 0xc1059ed8;
      this.h1 = 0x367cd507;
      this.h2 = 0x3070dd17;
      this.h3 = 0xf70e5939;
      this.h4 = 0xffc00b31;
      this.h5 = 0x68581511;
      this.h6 = 0x64f98fa7;
      this.h7 = 0xbefa4fa4;
    } else { // 256
      this.h0 = 0x6a09e667;
      this.h1 = 0xbb67ae85;
      this.h2 = 0x3c6ef372;
      this.h3 = 0xa54ff53a;
      this.h4 = 0x510e527f;
      this.h5 = 0x9b05688c;
      this.h6 = 0x1f83d9ab;
      this.h7 = 0x5be0cd19;
    }

    this.block = this.start = this.bytes = this.hBytes = 0;
    this.finalized = this.hashed = false;
    this.first = true;
    this.is224 = is224;
  }

  Sha256.prototype.update = function (message) {
    if (this.finalized) {
      throw new Error(FINALIZE_ERROR);
    }
    var result = formatMessage(message);
    message = result[0];
    var isString = result[1];
    var code, index = 0, i, length = message.length, blocks = this.blocks;
    while (index < length) {
      if (this.hashed) {
        this.hashed = false;
        blocks[0] = this.block;
        this.block = blocks[16] = blocks[1] = blocks[2] = blocks[3] =
          blocks[4] = blocks[5] = blocks[6] = blocks[7] =
          blocks[8] = blocks[9] = blocks[10] = blocks[11] =
          blocks[12] = blocks[13] = blocks[14] = blocks[15] = 0;
      }

      if (isString) {
        for (i = this.start; index < length && i < 64; ++index) {
          code = message.charCodeAt(index);
          if (code < 0x80) {
            blocks[i >>> 2] |= code << SHIFT[i++ & 3];
          } else if (code < 0x800) {
            blocks[i >>> 2] |= (0xc0 | (code >>> 6)) << SHIFT[i++ & 3];
            blocks[i >>> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
          } else if (code < 0xd800 || code >= 0xe000) {
            blocks[i >>> 2] |= (0xe0 | (code >>> 12)) << SHIFT[i++ & 3];
            blocks[i >>> 2] |= (0x80 | ((code >>> 6) & 0x3f)) << SHIFT[i++ & 3];
            blocks[i >>> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
          } else {
            code = 0x10000 + (((code & 0x3ff) << 10) | (message.charCodeAt(++index) & 0x3ff));
            blocks[i >>> 2] |= (0xf0 | (code >>> 18)) << SHIFT[i++ & 3];
            blocks[i >>> 2] |= (0x80 | ((code >>> 12) & 0x3f)) << SHIFT[i++ & 3];
            blocks[i >>> 2] |= (0x80 | ((code >>> 6) & 0x3f)) << SHIFT[i++ & 3];
            blocks[i >>> 2] |= (0x80 | (code & 0x3f)) << SHIFT[i++ & 3];
          }
        }
      } else {
        for (i = this.start; index < length && i < 64; ++index) {
          blocks[i >>> 2] |= message[index] << SHIFT[i++ & 3];
        }
      }

      this.lastByteIndex = i;
      this.bytes += i - this.start;
      if (i >= 64) {
        this.block = blocks[16];
        this.start = i - 64;
        this.hash();
        this.hashed = true;
      } else {
        this.start = i;
      }
    }
    if (this.bytes > 4294967295) {
      this.hBytes += this.bytes / 4294967296 << 0;
      this.bytes = this.bytes % 4294967296;
    }
    return this;
  };

  Sha256.prototype.finalize = function () {
    if (this.finalized) {
      return;
    }
    this.finalized = true;
    var blocks = this.blocks, i = this.lastByteIndex;
    blocks[16] = this.block;
    blocks[i >>> 2] |= EXTRA[i & 3];
    this.block = blocks[16];
    if (i >= 56) {
      if (!this.hashed) {
        this.hash();
      }
      blocks[0] = this.block;
      blocks[16] = blocks[1] = blocks[2] = blocks[3] =
        blocks[4] = blocks[5] = blocks[6] = blocks[7] =
        blocks[8] = blocks[9] = blocks[10] = blocks[11] =
        blocks[12] = blocks[13] = blocks[14] = blocks[15] = 0;
    }
    blocks[14] = this.hBytes << 3 | this.bytes >>> 29;
    blocks[15] = this.bytes << 3;
    this.hash();
  };

  Sha256.prototype.hash = function () {
    var a = this.h0, b = this.h1, c = this.h2, d = this.h3, e = this.h4, f = this.h5, g = this.h6,
      h = this.h7, blocks = this.blocks, j, s0, s1, maj, t1, t2, ch, ab, da, cd, bc;

    for (j = 16; j < 64; ++j) {
      // rightrotate
      t1 = blocks[j - 15];
      s0 = ((t1 >>> 7) | (t1 << 25)) ^ ((t1 >>> 18) | (t1 << 14)) ^ (t1 >>> 3);
      t1 = blocks[j - 2];
      s1 = ((t1 >>> 17) | (t1 << 15)) ^ ((t1 >>> 19) | (t1 << 13)) ^ (t1 >>> 10);
      blocks[j] = blocks[j - 16] + s0 + blocks[j - 7] + s1 << 0;
    }

    bc = b & c;
    for (j = 0; j < 64; j += 4) {
      if (this.first) {
        if (this.is224) {
          ab = 300032;
          t1 = blocks[0] - 1413257819;
          h = t1 - 150054599 << 0;
          d = t1 + 24177077 << 0;
        } else {
          ab = 704751109;
          t1 = blocks[0] - 210244248;
          h = t1 - 1521486534 << 0;
          d = t1 + 143694565 << 0;
        }
        this.first = false;
      } else {
        s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        ab = a & b;
        maj = ab ^ (a & c) ^ bc;
        ch = (e & f) ^ (~e & g);
        t1 = h + s1 + ch + K[j] + blocks[j];
        t2 = s0 + maj;
        h = d + t1 << 0;
        d = t1 + t2 << 0;
      }
      s0 = ((d >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10));
      s1 = ((h >>> 6) | (h << 26)) ^ ((h >>> 11) | (h << 21)) ^ ((h >>> 25) | (h << 7));
      da = d & a;
      maj = da ^ (d & b) ^ ab;
      ch = (h & e) ^ (~h & f);
      t1 = g + s1 + ch + K[j + 1] + blocks[j + 1];
      t2 = s0 + maj;
      g = c + t1 << 0;
      c = t1 + t2 << 0;
      s0 = ((c >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10));
      s1 = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7));
      cd = c & d;
      maj = cd ^ (c & a) ^ da;
      ch = (g & h) ^ (~g & e);
      t1 = f + s1 + ch + K[j + 2] + blocks[j + 2];
      t2 = s0 + maj;
      f = b + t1 << 0;
      b = t1 + t2 << 0;
      s0 = ((b >>> 2) | (b << 30)) ^ ((b >>> 13) | (b << 19)) ^ ((b >>> 22) | (b << 10));
      s1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7));
      bc = b & c;
      maj = bc ^ (b & d) ^ cd;
      ch = (f & g) ^ (~f & h);
      t1 = e + s1 + ch + K[j + 3] + blocks[j + 3];
      t2 = s0 + maj;
      e = a + t1 << 0;
      a = t1 + t2 << 0;
      this.chromeBugWorkAround = true;
    }

    this.h0 = this.h0 + a << 0;
    this.h1 = this.h1 + b << 0;
    this.h2 = this.h2 + c << 0;
    this.h3 = this.h3 + d << 0;
    this.h4 = this.h4 + e << 0;
    this.h5 = this.h5 + f << 0;
    this.h6 = this.h6 + g << 0;
    this.h7 = this.h7 + h << 0;
  };

  Sha256.prototype.hex = function () {
    this.finalize();

    var h0 = this.h0, h1 = this.h1, h2 = this.h2, h3 = this.h3, h4 = this.h4, h5 = this.h5,
      h6 = this.h6, h7 = this.h7;

    var hex = HEX_CHARS[(h0 >>> 28) & 0x0F] + HEX_CHARS[(h0 >>> 24) & 0x0F] +
      HEX_CHARS[(h0 >>> 20) & 0x0F] + HEX_CHARS[(h0 >>> 16) & 0x0F] +
      HEX_CHARS[(h0 >>> 12) & 0x0F] + HEX_CHARS[(h0 >>> 8) & 0x0F] +
      HEX_CHARS[(h0 >>> 4) & 0x0F] + HEX_CHARS[h0 & 0x0F] +
      HEX_CHARS[(h1 >>> 28) & 0x0F] + HEX_CHARS[(h1 >>> 24) & 0x0F] +
      HEX_CHARS[(h1 >>> 20) & 0x0F] + HEX_CHARS[(h1 >>> 16) & 0x0F] +
      HEX_CHARS[(h1 >>> 12) & 0x0F] + HEX_CHARS[(h1 >>> 8) & 0x0F] +
      HEX_CHARS[(h1 >>> 4) & 0x0F] + HEX_CHARS[h1 & 0x0F] +
      HEX_CHARS[(h2 >>> 28) & 0x0F] + HEX_CHARS[(h2 >>> 24) & 0x0F] +
      HEX_CHARS[(h2 >>> 20) & 0x0F] + HEX_CHARS[(h2 >>> 16) & 0x0F] +
      HEX_CHARS[(h2 >>> 12) & 0x0F] + HEX_CHARS[(h2 >>> 8) & 0x0F] +
      HEX_CHARS[(h2 >>> 4) & 0x0F] + HEX_CHARS[h2 & 0x0F] +
      HEX_CHARS[(h3 >>> 28) & 0x0F] + HEX_CHARS[(h3 >>> 24) & 0x0F] +
      HEX_CHARS[(h3 >>> 20) & 0x0F] + HEX_CHARS[(h3 >>> 16) & 0x0F] +
      HEX_CHARS[(h3 >>> 12) & 0x0F] + HEX_CHARS[(h3 >>> 8) & 0x0F] +
      HEX_CHARS[(h3 >>> 4) & 0x0F] + HEX_CHARS[h3 & 0x0F] +
      HEX_CHARS[(h4 >>> 28) & 0x0F] + HEX_CHARS[(h4 >>> 24) & 0x0F] +
      HEX_CHARS[(h4 >>> 20) & 0x0F] + HEX_CHARS[(h4 >>> 16) & 0x0F] +
      HEX_CHARS[(h4 >>> 12) & 0x0F] + HEX_CHARS[(h4 >>> 8) & 0x0F] +
      HEX_CHARS[(h4 >>> 4) & 0x0F] + HEX_CHARS[h4 & 0x0F] +
      HEX_CHARS[(h5 >>> 28) & 0x0F] + HEX_CHARS[(h5 >>> 24) & 0x0F] +
      HEX_CHARS[(h5 >>> 20) & 0x0F] + HEX_CHARS[(h5 >>> 16) & 0x0F] +
      HEX_CHARS[(h5 >>> 12) & 0x0F] + HEX_CHARS[(h5 >>> 8) & 0x0F] +
      HEX_CHARS[(h5 >>> 4) & 0x0F] + HEX_CHARS[h5 & 0x0F] +
      HEX_CHARS[(h6 >>> 28) & 0x0F] + HEX_CHARS[(h6 >>> 24) & 0x0F] +
      HEX_CHARS[(h6 >>> 20) & 0x0F] + HEX_CHARS[(h6 >>> 16) & 0x0F] +
      HEX_CHARS[(h6 >>> 12) & 0x0F] + HEX_CHARS[(h6 >>> 8) & 0x0F] +
      HEX_CHARS[(h6 >>> 4) & 0x0F] + HEX_CHARS[h6 & 0x0F];
    if (!this.is224) {
      hex += HEX_CHARS[(h7 >>> 28) & 0x0F] + HEX_CHARS[(h7 >>> 24) & 0x0F] +
        HEX_CHARS[(h7 >>> 20) & 0x0F] + HEX_CHARS[(h7 >>> 16) & 0x0F] +
        HEX_CHARS[(h7 >>> 12) & 0x0F] + HEX_CHARS[(h7 >>> 8) & 0x0F] +
        HEX_CHARS[(h7 >>> 4) & 0x0F] + HEX_CHARS[h7 & 0x0F];
    }
    return hex;
  };

  Sha256.prototype.toString = Sha256.prototype.hex;

  Sha256.prototype.digest = function () {
    this.finalize();

    var h0 = this.h0, h1 = this.h1, h2 = this.h2, h3 = this.h3, h4 = this.h4, h5 = this.h5,
      h6 = this.h6, h7 = this.h7;

    var arr = [
      (h0 >>> 24) & 0xFF, (h0 >>> 16) & 0xFF, (h0 >>> 8) & 0xFF, h0 & 0xFF,
      (h1 >>> 24) & 0xFF, (h1 >>> 16) & 0xFF, (h1 >>> 8) & 0xFF, h1 & 0xFF,
      (h2 >>> 24) & 0xFF, (h2 >>> 16) & 0xFF, (h2 >>> 8) & 0xFF, h2 & 0xFF,
      (h3 >>> 24) & 0xFF, (h3 >>> 16) & 0xFF, (h3 >>> 8) & 0xFF, h3 & 0xFF,
      (h4 >>> 24) & 0xFF, (h4 >>> 16) & 0xFF, (h4 >>> 8) & 0xFF, h4 & 0xFF,
      (h5 >>> 24) & 0xFF, (h5 >>> 16) & 0xFF, (h5 >>> 8) & 0xFF, h5 & 0xFF,
      (h6 >>> 24) & 0xFF, (h6 >>> 16) & 0xFF, (h6 >>> 8) & 0xFF, h6 & 0xFF
    ];
    if (!this.is224) {
      arr.push((h7 >>> 24) & 0xFF, (h7 >>> 16) & 0xFF, (h7 >>> 8) & 0xFF, h7 & 0xFF);
    }
    return arr;
  };

  Sha256.prototype.array = Sha256.prototype.digest;

  Sha256.prototype.arrayBuffer = function () {
    this.finalize();

    var buffer = new ArrayBuffer(this.is224 ? 28 : 32);
    var dataView = new DataView(buffer);
    dataView.setUint32(0, this.h0);
    dataView.setUint32(4, this.h1);
    dataView.setUint32(8, this.h2);
    dataView.setUint32(12, this.h3);
    dataView.setUint32(16, this.h4);
    dataView.setUint32(20, this.h5);
    dataView.setUint32(24, this.h6);
    if (!this.is224) {
      dataView.setUint32(28, this.h7);
    }
    return buffer;
  };

  function HmacSha256(key, is224, sharedMemory) {
    var i, result = formatMessage(key);
    key = result[0];
    if (result[1]) {
      var bytes = [], length = key.length, index = 0, code;
      for (i = 0; i < length; ++i) {
        code = key.charCodeAt(i);
        if (code < 0x80) {
          bytes[index++] = code;
        } else if (code < 0x800) {
          bytes[index++] = (0xc0 | (code >>> 6));
          bytes[index++] = (0x80 | (code & 0x3f));
        } else if (code < 0xd800 || code >= 0xe000) {
          bytes[index++] = (0xe0 | (code >>> 12));
          bytes[index++] = (0x80 | ((code >>> 6) & 0x3f));
          bytes[index++] = (0x80 | (code & 0x3f));
        } else {
          code = 0x10000 + (((code & 0x3ff) << 10) | (key.charCodeAt(++i) & 0x3ff));
          bytes[index++] = (0xf0 | (code >>> 18));
          bytes[index++] = (0x80 | ((code >>> 12) & 0x3f));
          bytes[index++] = (0x80 | ((code >>> 6) & 0x3f));
          bytes[index++] = (0x80 | (code & 0x3f));
        }
      }
      key = bytes;
    }

    if (key.length > 64) {
      key = (new Sha256(is224, true)).update(key).array();
    }

    var oKeyPad = [], iKeyPad = [];
    for (i = 0; i < 64; ++i) {
      var b = key[i] || 0;
      oKeyPad[i] = 0x5c ^ b;
      iKeyPad[i] = 0x36 ^ b;
    }

    Sha256.call(this, is224, sharedMemory);

    this.update(iKeyPad);
    this.oKeyPad = oKeyPad;
    this.inner = true;
    this.sharedMemory = sharedMemory;
  }
  HmacSha256.prototype = new Sha256();

  HmacSha256.prototype.finalize = function () {
    Sha256.prototype.finalize.call(this);
    if (this.inner) {
      this.inner = false;
      var innerHash = this.array();
      Sha256.call(this, this.is224, this.sharedMemory);
      this.update(this.oKeyPad);
      this.update(innerHash);
      Sha256.prototype.finalize.call(this);
    }
  };

  var sha256 = createMethod();
  var sha224 = createMethod(true);
  sha256.sha256 = sha256;
  sha256.sha224 = sha224;
  sha256.hmac = createHmacMethod();
  sha224.hmac = createHmacMethod(true);

  const root =
    typeof globalThis === 'object' ? globalThis :
    typeof self === 'object' ? self :
    typeof window === 'object' ? window :
    typeof global === 'object' ? global :
    undefined;

  if (root) {
    root.sha224 = sha224;
  }

  return sha256;

}));

return module.exports;
})();


/**
 * Phase 1 candidate. Reconcile with exported LIVE source before deployment.
 * Owner-only setup: back up workbook + Apps Script; set DMI_SESSION_SECRET
 * to an independently generated random secret of at least 32 bytes; then run
 * initializeSecurity(). See PHASE1-SECURITY.md. Never put the secret in GitHub.
 */
const DMI_SESSION_HOURS = 4;
const DMI_PASSWORD_ITERATIONS = 600000;
const DMI_TEACHER_ACTIONS = ['listStudents','addStudent','deleteStudent',
  'renewStudent','addCourse','deleteCourse','addMark','resetStudentPassword','setLMSData','saveCourseDetails','listCourseEnrollments','setCourseEnrollment'];
const DMI_ACTIONS = DMI_TEACHER_ACTIONS.concat(['listCourses','listMarks',
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


/**
 * Course details and enrolment for the dashboard.
 * Existing lesson courses remain available to all active students until a teacher
 * explicitly selects "Enrolled students only". New courses default to restricted.
 * Course enrolment controls API listings; it does not protect public media URLs
 * or change the separate video tutorial library.
 */
const DMI_COURSE_HEADERS=['CourseKey','Course','Description','Instructor','Duration','Syllabus','MaterialsURL','CourseURL','EnrolmentRequired'];
const DMI_ENROLMENT_HEADERS=['CourseKey','StudentEmail','EnrolledAt','EnrolledBy'];
function courseKey_(name){return digest_(String(name||'').trim().toLowerCase());}
function courseSheet_(name,head,required){
  const sheet=ss().getSheetByName(name);
  if(!sheet){if(required)securityError_('COURSE_SETUP_REQUIRED','Course management is not enabled yet');return null;}
  const actual=sheet.getDataRange().getValues()[0].map(headerName_);
  if(!head.every(k=>actual.includes(k)))securityError_('COURSE_SETUP_REQUIRED','Course setup needs attention');
  return sheet;
}
function initializeCourseManagement(){
  secret_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))securityError_('BUSY','Please retry shortly');
  try{
    const book=ss();
    [['CourseDetails',DMI_COURSE_HEADERS],['CourseEnrollments',DMI_ENROLMENT_HEADERS]].forEach(pair=>{
      if(!book.getSheetByName(pair[0]))book.insertSheet(pair[0]).appendRow(pair[1]);
      courseSheet_(pair[0],pair[1],true);
    });
    Logger.log('Course management ready. Existing students, lessons, marks and sessions preserved.');
  }finally{lock.releaseLock();}
}
function courseRecords_(){
  const details=courseSheet_('CourseDetails',DMI_COURSE_HEADERS,false);
  const catalogue=new Map();
  rows(tab('Courses')).forEach(lesson=>{
    const name=String(lesson.Course||'').trim();
    if(name){const key=courseKey_(name);if(!catalogue.has(key))catalogue.set(key,{CourseKey:key,Course:name,EnrolmentRequired:false});}
  });
  if(details)rows(details).forEach(record=>{
    if(record.CourseKey!==courseKey_(record.Course))securityError_('COURSE_SETUP_REQUIRED','Course identity needs attention');
    catalogue.set(record.CourseKey,Object.assign({},record,{EnrolmentRequired:String(record.EnrolmentRequired).toLowerCase()==='true'}));
  });
  return Array.from(catalogue.values()).sort((a,b)=>a.Course.localeCompare(b.Course));
}
function courseEnrolments_(){
  const sheet=courseSheet_('CourseEnrollments',DMI_ENROLMENT_HEADERS,false);
  return sheet?rows(sheet):[];
}
function courseVisible_(course,ctx,enrolments){
  return ctx.role==='teacher' || !course.EnrolmentRequired ||
    enrolments.some(e=>e.CourseKey===course.CourseKey && email_(e.StudentEmail)===email_(ctx.user.email));
}
function listCourseCatalogue_(ctx){
  const courses=courseRecords_(), enrolments=courseEnrolments_(), lessons=rows(tab('Courses'));
  const data=courses.filter(c=>courseVisible_(c,ctx,enrolments)).map(c=>{
    const out=Object.assign({},c);
    out.Lessons=lessons.filter(l=>courseKey_(l.Course)===c.CourseKey);
    out.Enrolled=enrolments.some(e=>e.CourseKey===c.CourseKey && email_(e.StudentEmail)===email_(ctx.user.email));
    if(ctx.role==='teacher')out.EnrolledCount=enrolments.filter(e=>e.CourseKey===c.CourseKey).length;
    return out;
  });
  return {ok:true,data,courseManagementReady:!!courseSheet_('CourseDetails',DMI_COURSE_HEADERS,false) &&
    !!courseSheet_('CourseEnrollments',DMI_ENROLMENT_HEADERS,false)};
}
function visibleCourseLessons_(ctx){
  const courses=courseRecords_(), enrolments=courseEnrolments_();
  const visible=new Set(courses.filter(c=>courseVisible_(c,ctx,enrolments)).map(c=>c.CourseKey));
  return {ok:true,data:rows(tab('Courses')).filter(l=>visible.has(courseKey_(l.Course)))};
}
function courseText_(value,label,max){
  const text=String(value||'').trim();
  if(text.length>max)securityError_('VALIDATION',label+' is too long');
  return text;
}
function courseURL_(value,label){
  const text=courseText_(value,label,2000);
  if(text && (!/^https?:\/\/[^\s]+$/i.test(text) || /^https?:\/\/[^/?#]*@/i.test(text)))
    securityError_('VALIDATION',label+' must be an http or https link without embedded credentials');
  return text;
}
function requireCourseTeacher_(ctx){
  if(!ctx || ctx.role!=='teacher')securityError_('FORBIDDEN','Teacher access required');
}
function saveCourseDetails_(p,ctx){
  requireCourseTeacher_(ctx);
  const sheet=courseSheet_('CourseDetails',DMI_COURSE_HEADERS,true);
  const name=courseText_(p.course,'Course name',150);
  if(!name)securityError_('VALIDATION','Course name is required');
  if(/^[=+\-@]/.test(name))securityError_('VALIDATION','Course name must start with a letter or number');
  const key=courseKey_(name), courses=courseRecords_();
  if(p.courseKey && (p.courseKey!==key || !courses.some(c=>c.CourseKey===key)))
    securityError_('VALIDATION','Choose the existing course without changing its name');
  if(!p.courseKey && courses.some(c=>c.CourseKey===key))
    securityError_('VALIDATION','This course already exists. Select it to edit its details.');
  if(!['true','false'].includes(String(p.enrolmentRequired)))securityError_('VALIDATION','Choose who can access the course');
  const record={CourseKey:key,Course:sheetText_(name),
    Description:sheetText_(courseText_(p.description,'Description',4000)),
    Instructor:sheetText_(courseText_(p.instructor,'Teacher',150)),
    Duration:sheetText_(courseText_(p.duration,'Duration',100)),
    Syllabus:sheetText_(courseText_(p.syllabus,'Syllabus',8000)),
    MaterialsURL:courseURL_(p.materialsURL,'Materials link'),
    CourseURL:courseURL_(p.courseURL,'Course link'),
    EnrolmentRequired:String(p.enrolmentRequired)==='true'};
  const data=sheet.getDataRange().getValues(), head=data[0].map(headerName_);
  const i=data.findIndex((r,j)=>j>0 && r[head.indexOf('CourseKey')]===key);
  if(i<1)sheet.appendRow(head.map(h=>Object.prototype.hasOwnProperty.call(record,h)?record[h]:''));
  else Object.keys(record).forEach(h=>sheet.getRange(i+1,head.indexOf(h)+1).setValue(record[h]));
  return {ok:true,courseKey:key};
}
function listCourseEnrolments_(p,ctx){
  requireCourseTeacher_(ctx);
  if(!courseRecords_().some(c=>c.CourseKey===p.courseKey))securityError_('NOT_FOUND','Course not found');
  return {ok:true,data:courseEnrolments_().filter(e=>e.CourseKey===p.courseKey).map(e=>({
    studentEmail:e.StudentEmail,enrolledAt:e.EnrolledAt
  }))};
}
function setCourseEnrolment_(p,ctx){
  requireCourseTeacher_(ctx);
  const sheet=courseSheet_('CourseEnrollments',DMI_ENROLMENT_HEADERS,true);
  if(!courseRecords_().some(c=>c.CourseKey===p.courseKey))securityError_('NOT_FOUND','Course not found');
  const email=email_(p.studentEmail);
  if(!['true','false'].includes(String(p.enrolled)))securityError_('VALIDATION','Choose enrol or remove');
  if(p.enrolled==='true'){
    const student=account_('student',email);
    if(!student)securityError_('NOT_FOUND','Student not found');
    active_('student',student);
  }
  const data=sheet.getDataRange().getValues(), head=data[0].map(headerName_);
  const matches=[];
  for(let i=1;i<data.length;i++)if(data[i][head.indexOf('CourseKey')]===p.courseKey &&
    email_(data[i][head.indexOf('StudentEmail')])===email)matches.push(i+1);
  if(p.enrolled==='true' && !matches.length){
    const record={CourseKey:p.courseKey,StudentEmail:email,EnrolledAt:new Date(),EnrolledBy:ctx.user.email};
    sheet.appendRow(head.map(h=>Object.prototype.hasOwnProperty.call(record,h)?record[h]:''));
  }
  if(p.enrolled==='false')matches.reverse().forEach(i=>sheet.deleteRow(i));
  return {ok:true};
}

function removeStudentCourseEnrolments_(email){
  const sheet=courseSheet_('CourseEnrollments',DMI_ENROLMENT_HEADERS,false);
  if(!sheet)return;
  const data=sheet.getDataRange().getValues(), head=data[0].map(headerName_);
  for(let i=data.length-1;i>0;i--)if(email_(data[i][head.indexOf('StudentEmail')])===email_(email))sheet.deleteRow(i+1);
}
