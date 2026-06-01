/**
 * DMI LMS — Result Sender
 *
 * Drop this into any existing test page (reading, listening, writing…)
 * and the student's final score + answers + questions are sent to the
 * admin's Google Sheet automatically.
 *
 * HOW TO USE in a test HTML file:
 *
 *   <script src="lms-result-sender.js"></script>
 *
 * Then when the student clicks "Finish" / "Submit", call:
 *
 *   DMI_LMS.submit({
 *     testName: 'Book 19 Reading Test 1',
 *     course:   'IELTS Reading',
 *     score:    27,
 *     maxScore: 40,
 *     answers:  { 1:'TRUE', 2:'FALSE', 3:'B', ... },
 *     questions:{ 1:'Q1 text…', 2:'Q2 text…' }   // optional but recommended
 *   });
 *
 * It will:
 *   - Block use if the student is not signed in (or has expired)
 *   - POST everything to the Apps Script API
 *   - Show a small toast confirming "Submitted to admin"
 *
 * For unsigned visitors (just browsing), `DMI_LMS.submit` quietly skips —
 * so anonymous practice still works.
 */
(function () {
  // === CONFIG: paste your Apps Script Web App URL here ===
  var API_URL = 'https://script.google.com/macros/s/AKfycbxl15H-Esfx0t4GZrZki0cTyVRQf4SDWFD6wmUmE0f5i24wVksWAnztIxcOPcAooZXp/exec';

  function getUser() {
    try {
      var u = JSON.parse(localStorage.getItem('dmi_lms_user') || 'null');
      var r = localStorage.getItem('dmi_lms_role');
      if (u && r === 'student') return u;
    } catch (e) {}
    return null;
  }

  function toast(msg, type) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:' + (type === 'err' ? '#c0202a' : '#1e7a45') + ';color:#fff;' +
      'padding:12px 22px;border-radius:8px;font-family:Outfit,Arial,sans-serif;' +
      'font-size:13.5px;font-weight:700;z-index:99999;box-shadow:0 8px 28px rgba(0,0,0,.25);' +
      'opacity:0;transition:opacity .25s';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 300);
    }, 3500);
  }

  function showLoginPrompt() {
    if (document.getElementById('dmiLoginBar')) return;
    var u = getUser();
    if (u) return;
    var bar = document.createElement('div');
    bar.id = 'dmiLoginBar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#0f1e2d;color:#fff;' +
      'padding:8px 16px;font-family:Outfit,Arial,sans-serif;font-size:13px;' +
      'display:flex;align-items:center;justify-content:center;gap:14px;z-index:99998;' +
      'border-bottom:2px solid #c0202a';
    bar.innerHTML =
      '<span>Sign in to have this result saved to your DMI LMS account.</span>' +
      '<a href="login.html" style="background:#c0202a;color:#fff;padding:5px 14px;' +
      'border-radius:5px;text-decoration:none;font-weight:700">Sign in</a>';
    document.body.appendChild(bar);
  }

  window.DMI_LMS = {
    /** Submit a completed exam to the admin sheet. Safe to call without login. */
    submit: function (data) {
      var user = getUser();
      if (!user) {
        toast('Not signed in — result not saved to admin', 'err');
        return Promise.resolve({ ok: false, error: 'not signed in' });
      }
      var body = new URLSearchParams({
        action: 'submitExamResult',
        studentEmail:  user.email,
        studentName:   user.name,
        testName:      (data.testName || ''),
        course:        (data.course || ''),
        score:         (data.score || 0),
        maxScore:      (data.maxScore || 0),
        answersJSON:   JSON.stringify(data.answers || {}),
        questionsJSON: JSON.stringify(data.questions || {})
      });
      return fetch(API_URL, { method: 'POST', body: body })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok) toast('Result sent to admin ✓');
          else toast('Save failed: ' + (res.error || 'unknown'), 'err');
          return res;
        })
        .catch(function (e) {
          toast('Network error — result not sent', 'err');
          return { ok: false, error: e.message };
        });
    },
    /** Returns the current signed-in student, or null. */
    user: getUser
  };

  // Show a small "sign in" bar on test pages for anonymous users
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showLoginPrompt);
  } else {
    showLoginPrompt();
  }
})();
