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
 * Deploy: Extensions → Apps Script → paste this file → Save
 *         Deploy → New deployment → Web app → Execute as: Me, Access: Anyone
 *         Copy the URL, paste into login.html, teacher-panel.html, student-panel.html
 *         AND lms-result-sender.js
 */

// ====== CONFIG ======
// Paste your Sheet ID below. (Easiest: triple-click the part of the
// Google Sheet URL between /d/ and /edit, copy, paste between the quotes.)
const SHEET_ID = '1lewfmmCpqrn8421yOa6oMYh5OGJK67FYIAaXiyXVkis'; // <-- EDIT THIS
const STUDENT_VALIDITY_DAYS = 30; // 1 month

/**
 * ⚙ TEST FUNCTION — run this once in Apps Script to verify everything works.
 * Top of editor: pick "testConnection" in the function dropdown, click ▶ Run.
 * Then View → Logs (or Ctrl+Enter) to see the result.
 */
/** Dumps every row of the Teachers tab so you can see exactly what's stored. */
function debugTeachers() {
  try {
    const sheet = tab('Teachers');
    const data = sheet.getDataRange().getValues();
    Logger.log('Teachers tab has ' + data.length + ' rows (including header)');
    data.forEach((row, i) => {
      Logger.log('Row ' + i + ': ' + JSON.stringify(row));
    });
    if (data.length < 2) {
      Logger.log('⚠ NO TEACHER DATA. Add a row 2 with: T-001 | Niroshan | niroshan.dmi@gmail.com | Pass1234 | IELTS');
    }
  } catch (e) {
    Logger.log('ERROR: ' + e.message);
  }
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
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || '';
    let result;

    switch (action) {
      case 'login':            result = login(params); break;
      case 'listStudents':     result = listStudents(); break;
      case 'addStudent':       result = addStudent(params); break;
      case 'deleteStudent':    result = deleteStudent(params); break;
      case 'renewStudent':     result = renewStudent(params); break;
      case 'listCourses':      result = listCourses(); break;
      case 'addCourse':        result = addCourse(params); break;
      case 'deleteCourse':     result = deleteCourse(params); break;
      case 'addMark':          result = addMark(params); break;
      case 'listMarks':        result = listMarks(params); break;
      case 'submitExamResult': result = submitExamResult(params); break;
      case 'listExamResults':  result = listExamResults(params); break;
      case 'ping':             result = { ok: true, time: new Date() }; break;
      default:                 result = { ok: false, error: 'Unknown action: ' + action };
    }
    return json(result);
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ====== HELPERS ======
function ss() { return SpreadsheetApp.openById(SHEET_ID); }
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
function rows(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const head = data[0];
  return data.slice(1).map(r => {
    const o = {};
    head.forEach((h, i) => o[h] = r[i]);
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
function login(p) {
  const email = (p.email || '').toString().trim().toLowerCase();
  const pass  = (p.password || '').toString();
  if (!email || !pass) return { ok: false, error: 'Email and password required' };

  const teachers = rows(tab('Teachers'));
  const t = teachers.find(r => String(r.Email).toLowerCase() === email && String(r.Password) === pass);
  if (t) return { ok: true, role: 'teacher', user: { id: t.ID, name: t.Name, email: t.Email, subject: t.Subject } };

  const students = rows(tab('Students'));
  const s = students.find(r => String(r.Email).toLowerCase() === email && String(r.Password) === pass);
  if (s) {
    if (isExpired(s.ExpiryDate)) {
      return { ok: false, expired: true, error: 'Your access has expired on ' + new Date(s.ExpiryDate).toLocaleDateString() + '. Please contact the admin to renew your account.' };
    }
    return { ok: true, role: 'student', user: {
      id: s.ID, name: s.Name, email: s.Email, class: s.Class,
      expiryDate: s.ExpiryDate
    }};
  }
  return { ok: false, error: 'Invalid email or password' };
}

function listStudents() {
  const data = rows(tab('Students')).map(s => {
    s.expired = isExpired(s.ExpiryDate);
    return s;
  });
  return { ok: true, data };
}

function addStudent(p) {
  const name = (p.name || '').toString().trim();
  const email = (p.email || '').toString().trim().toLowerCase();
  const password = (p.password || '').toString();
  const klass = (p.class || '').toString();
  if (!name || !email || !password) return { ok: false, error: 'Name, email, password required' };

  const sheet = tab('Students');
  const existing = rows(sheet).find(r => String(r.Email).toLowerCase() === email);
  if (existing) return { ok: false, error: 'A student with this email already exists' };

  const id = uid('STU');
  const today = new Date();
  const expiry = addDays(today, STUDENT_VALIDITY_DAYS);
  sheet.appendRow([id, name, email, password, klass, today, expiry]);
  return { ok: true, id, expiryDate: expiry };
}

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
  const head = data[0];
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
