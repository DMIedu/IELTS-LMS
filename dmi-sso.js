/**
 * DMI LMS — one sign-in for every practice paper.
 *
 * Add to the <head> of a paper:   <script src="dmi-sso.js"></script>
 * (papers inside a sub-folder use  <script src="../dmi-sso.js"></script>)
 *
 * 1. Not signed in (or access expired)  -> sent to login.html once, then straight back here.
 * 2. Signed in                          -> the candidate form is filled in automatically
 *                                          (name, ID, email, class; branch is remembered).
 * 3. When a student submits             -> the score is also saved to the DMI LMS Google Sheet
 *                                          (ExamResults + Marks), so it shows on their dashboard
 *                                          and in the Teacher Panel.
 */
(async function () {
  var API_URL = 'https://script.google.com/macros/s/AKfycbzEIzTnSwNuEJ_QGVS94YpcyU6K0JlN-Aa3LE88LhkICGgR2wt5AoxcrFRBIpSvQC-qew/exec';
  var BRANCH_KEY = 'phase1_test_dmi_lms_branch';

  // Folder that holds login.html (the folder this script lives in)
  var here = document.currentScript && document.currentScript.src;
  var BASE = here ? here.replace(/[^\/]*$/, '') : './';

  function readUser() {
    try {
      var u = JSON.parse(localStorage.getItem('phase1_test_dmi_lms_user') || 'null');
      var role = localStorage.getItem('phase1_test_dmi_lms_role');
      if (!u) return null;
      if (role !== 'teacher' && u.expiryDate && new Date(u.expiryDate) < new Date()) return null;
      return { user: u, role: role };
    } catch (e) { return null; }
  }

  if(!window.DMI_AUTH){
    await new Promise(function(resolve,reject){
      var script=document.createElement('script'); script.src=BASE+'dmi-auth.js';
      script.onload=resolve; script.onerror=reject; document.head.appendChild(script);
    });
  }
  var auth = await DMI_AUTH.requireRole();
  if (!auth) return; // requireRole already handles sign-in or retry UI.
  var user = auth.user, role = auth.role;

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function setVal(id, v) {
    var el = $(id);
    if (!el || v == null || v === '') return false;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function rowOf(el) { return el && (el.closest('.form-row') || el.closest('.field')); }
  function paperInfo() {
    var file = decodeURIComponent(location.pathname.split('/').pop() || '').replace(/\.html$/i, '');
    var name = file.replace(/reding/i, 'reading').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    var m = name.match(/reading|listening|writing|speaking/i);
    return { testName: name || document.title, course: m ? 'IELTS ' + m[0].charAt(0).toUpperCase() + m[0].slice(1).toLowerCase() : 'IELTS' };
  }
  function toast(msg, bad) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' + (bad ? '#c0202a' : '#1e7a45') +
      ';color:#fff;padding:12px 22px;border-radius:8px;font:700 13.5px Outfit,Arial,sans-serif;z-index:99999;box-shadow:0 8px 28px rgba(0,0,0,.25)';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }

  // ---------- 2. fill the candidate form ----------
  function prefill() {
    var parts = String(user.name || '').trim().split(/\s+/);
    var first = parts.shift() || '', last = parts.join(' ') || '-';
    var filled = false;

    // Reading / Listening / Writing papers
    if ($('fname')) {
      setVal('fname', first); setVal('lname', last);
      setVal('sid', user.id); setVal('email', user.email); setVal('classgroup', user['class']);
      var branch = $('school'), saved = localStorage.getItem(BRANCH_KEY);
      if (branch && saved) setVal('school', saved);
      if (branch) branch.addEventListener('change', function () { if (branch.value) localStorage.setItem(BRANCH_KEY, branch.value); });
      if ($('agree')) $('agree').checked = true;
      // hide the rows we filled; keep anything still empty (e.g. branch the first time)
      ['fname', 'sid', 'email', 'classgroup'].forEach(function (id) {
        var r = rowOf($(id));
        if (!r) return;
        var inputs = r.querySelectorAll('input,select'), empty = false;
        inputs.forEach(function (i) { if (i.id === 'school' && !i.value) empty = true; });
        if (!empty) r.style.display = 'none';
      });
      filled = $('fname');
    }
    // Speaking papers
    if ($('fName')) {
      setVal('fName', user.name); setVal('fId', user.id); setVal('fEmail', user.email);
      if ($('fAgree')) { $('fAgree').checked = true; $('fAgree').dispatchEvent(new Event('change', { bubbles: true })); }
      filled = $('fName');
    }
    if (!filled) return;

    var note = document.createElement('div');
    note.style.cssText = 'margin:0 0 14px;padding:10px 14px;border-radius:8px;background:#e6f4ec;border:1px solid #b6e3d2;color:#1e7a45;font:600 13.5px Outfit,Arial,sans-serif';
    note.innerHTML = '✓ Signed in as <b></b>. Your details are filled in, so just press the start button.';
    note.querySelector('b').textContent = user.name + (user.id ? ' (' + user.id + ')' : '');
    var row = rowOf(filled);
    if (row && row.parentNode) row.parentNode.insertBefore(note, row);

    // Students do not need the paper's teacher dashboard link
    if (role !== 'teacher') document.querySelectorAll('.admin-link').forEach(function (a) { a.style.display = 'none'; });
  }

  // ---------- 3. send the score to the Google Sheet ----------
  function captureExamDetail(record) {
    var answers={}, questions={}, source=record.answers||{};
    Object.keys(source).forEach(function(k){answers[k]=source[k];});
    (record.rows||[]).forEach(function(row){
      if(row.q!=null && !Object.prototype.hasOwnProperty.call(answers,String(row.q)))
        answers[String(row.q)]=row.ua==null?'':String(row.ua);
    });
    var total=Number(record.total)||0;
    for(var n=1;n<=Math.min(total,200);n++){
      var marker=document.getElementById('qn'+n) || document.getElementById('q'+n);
      var block=marker && marker.closest('.q-block');
      if(!block)continue;
      var copy=block.cloneNode(true);
      copy.querySelectorAll('input,select,textarea,button').forEach(function(el){el.remove();});
      questions[String(n)]=copy.textContent.replace(/\s+/g,' ').trim();
    }
    if(record.band!=null)answers._band=record.band;
    return {answers:answers,questions:questions};
  }

  function send(record) {
    if (role !== 'student' || !record) return;
    var info = paperInfo();
    var isWriting = /writing/i.test(info.course);
    var score = record.correct != null ? record.correct : (record.score != null ? record.score : 0);
    var detail=captureExamDetail(record);
    var answers = isWriting ? { task1: record.task1 || '', task2: record.task2 || '', words: [record.wc1, record.wc2] } : detail.answers;
    if (record.band != null) answers._band = record.band;
    var body = new URLSearchParams({
      action: 'submitExamResult', sessionToken: DMI_AUTH.token(),
      studentEmail: user.email || '', studentName: user.name || '',
      testName: info.testName, course: info.course,
      score: isWriting ? 0 : score, maxScore: isWriting ? 0 : (record.total || 40),
      answersJSON: JSON.stringify(answers), questionsJSON: JSON.stringify(isWriting?{}:detail.questions)
    });
    fetch(API_URL, { method: 'POST', body: body })
      .then(function (r) { return r.json(); })
      .then(function (res) { toast(res && res.ok ? 'Result saved to your DMI account ✓' : 'Result not saved: ' + ((res && res.error) || 'unknown'), !(res && res.ok)); })
      .catch(function () { toast('No internet: result kept on this device only', true); });
  }

  var nativeSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    var added = null;
    if (this === window.localStorage && /^dmi:ielts:/.test(String(key))) {
      try {
        var before = JSON.parse(localStorage.getItem(key) || '[]');
        var after = JSON.parse(value);
        if (Array.isArray(after) && Array.isArray(before) && after.length === before.length + 1) added = after[after.length - 1];
      } catch (e) { added = null; }
    }
    var out = nativeSet.apply(this, arguments);
    if (added) send(added);
    return out;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prefill);
  else prefill();
})().catch(function(){
  var here=document.currentScript && document.currentScript.src;
  location.replace((here?here.replace(/[^\/]*$/,''):'/')+'login.html');
});
