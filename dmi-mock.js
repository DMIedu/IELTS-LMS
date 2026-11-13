/**
 * DMI lab mock test: runs inside a practice paper when it is opened from mock-test.html.
 * Loaded by dmi-sso.js only when the page address has ?mock=<session>.
 * - Covers the paper until the student presses Start (the invigilator decides when).
 * - Hides the paper's exit/back buttons and warns before closing the tab.
 * - When the paper is submitted, records the section, hides the answer review,
 *   and sends the student to the next section in order. No scores are shown between sections.
 */
(function () {
  var MOCK_API = 'https://script.google.com/macros/s/AKfycbwLkFpHNFGyaKrFv0Lfji6y75OdX13L21l7Q3A81jYujsRSHYigDUgCfqxhcsBUfoKqag/exec';
  var here = document.currentScript && document.currentScript.src;
  var BASE = here ? here.replace(/[^\/]*$/, '') : './';
  var KEY = 'dmi_mock';
  var NAMES = { listening: 'Listening', reading: 'Reading', writing: 'Writing' };

  function load() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(s) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  var st = load();
  var params = new URLSearchParams(location.search);
  if (!st || params.get('mock') !== st.sessionId) {
    // Not a real mock run on this tab (e.g. an old link opened at home): leave the paper as normal practice.
    return;
  }
  var file = decodeURIComponent(location.pathname.split('/').pop() || '');
  var idx = -1;
  for (var i = 0; i < st.sections.length; i++) { if (st.sections[i].file === file) { idx = i; break; } }
  if (idx === -1 || idx !== st.idx) { location.replace(BASE + 'mock-test.html'); return; }
  var sec = st.sections[idx];
  var total = st.sections.length;
  var leaving = false;

  var css = document.createElement('style');
  css.textContent =
    '.dmi-mock-cover{position:fixed;inset:0;z-index:2147483646;background:linear-gradient(150deg,#0f1e2d,#1a2e45 55%,#0f2236);color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Outfit,Arial,sans-serif}' +
    '.dmi-mock-box{max-width:560px;width:100%;text-align:center}' +
    '.dmi-mock-box small{display:block;letter-spacing:.14em;text-transform:uppercase;color:#e7c27d;font-weight:700;font-size:13px;margin-bottom:10px}' +
    '.dmi-mock-box h1{font-family:"Playfair Display",Georgia,serif;font-size:clamp(30px,6vw,46px);margin:0 0 10px;line-height:1.15}' +
    '.dmi-mock-box p{color:#c9d3e2;font-size:17px;line-height:1.55;margin:0 0 8px}' +
    '.dmi-mock-steps{display:flex;gap:8px;justify-content:center;margin:18px 0 22px;flex-wrap:wrap}' +
    '.dmi-mock-steps span{padding:6px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.3);font-size:14px;font-weight:600;color:#c9d3e2}' +
    '.dmi-mock-steps span.on{background:#c9903a;border-color:#c9903a;color:#0f1e2d}' +
    '.dmi-mock-steps span.done{border-color:#4fd08d;color:#4fd08d}' +
    '.dmi-mock-btn{border:0;background:#c9903a;color:#0f1e2d;font:700 18px Outfit,Arial,sans-serif;padding:14px 28px;border-radius:10px;cursor:pointer;margin-top:10px}' +
    '.dmi-mock-btn:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
    '.dmi-mock-tag{position:fixed;left:12px;bottom:12px;z-index:2147483645;background:#c0202a;color:#fff;font:700 12.5px Outfit,Arial,sans-serif;padding:6px 12px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none}';
  document.head.appendChild(css);

  function steps() {
    return '<div class="dmi-mock-steps">' + st.sections.map(function (s, i) {
      return '<span class="' + (i < st.idx ? 'done' : i === st.idx ? 'on' : '') + '">' + (i + 1) + '. ' + NAMES[s.skill] + (i < st.idx ? ' ✓' : '') + '</span>';
    }).join('') + '</div>';
  }
  function cover(html) {
    var c = document.createElement('div');
    c.className = 'dmi-mock-cover';
    c.innerHTML = '<div class="dmi-mock-box">' + html + '</div>';
    document.body.appendChild(c);
    return c;
  }
  function api(q) {
    q.session = st.sessionId;
    return fetch(MOCK_API + '?' + new URLSearchParams(q)).then(function (r) { return r.json(); }).catch(function () { return null; });
  }

  function hideExits() {
    document.querySelectorAll('[onclick*="screenLanding"], .admin-link, .back-link, a[href*="index.html"]').forEach(function (el) { el.style.display = 'none'; });
  }

  // The papers' branch lists differ slightly (e.g. "Jaffna (Head Office)"), so match the branch chosen on mock-test.html.
  function fillMissing() {
    var sel = document.getElementById('school');
    var b = '';
    try { b = (localStorage.getItem('dmi_lms_branch') || '').toLowerCase(); } catch (e) {}
    if (sel && !sel.value && b) {
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value && sel.options[i].text.toLowerCase().indexOf(b) === 0) { sel.value = sel.options[i].value || sel.options[i].text; sel.dispatchEvent(new Event('change', { bubbles: true })); break; }
      }
    }
    var agree = document.getElementById('agree');
    if (agree && !agree.checked) { agree.checked = true; agree.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  function showStart() {
    hideExits();
    var tag = document.createElement('div');
    tag.className = 'dmi-mock-tag';
    tag.textContent = 'MOCK TEST ' + st.mock + ' · ' + NAMES[sec.skill] + ' · do not close this tab';
    document.body.appendChild(tag);
    var c = cover(
      '<small>DMI IELTS Mock Test ' + st.mock + ' · Section ' + (idx + 1) + ' of ' + total + '</small>' +
      '<h1>' + NAMES[sec.skill] + '</h1>' + steps() +
      '<p>' + sec.minutes + ' minutes. The timer starts when you press Start.</p>' +
      (sec.skill === 'listening' ? '<p>Put on your headphones. Press play on each part when the test asks you to.</p>' : '') +
      '<p>Wait for your invigilator, then press Start.</p>' +
      '<button class="dmi-mock-btn" type="button">Start ' + NAMES[sec.skill] + '</button>');
    c.querySelector('button').addEventListener('click', function () {
      if (typeof window.startExam !== 'function') { alert('This paper could not start. Please call your invigilator.'); return; }
      fillMissing();
      c.remove();
      window.startExam();
      hideExits();
    });
    window.addEventListener('beforeunload', function (e) { if (!leaving) { e.preventDefault(); e.returnValue = ''; } });
  }

  function summary(rec) {
    if (sec.skill === 'writing') {
      return 'Submitted: Task 1 ' + (rec.wc1 || 0) + ' words, Task 2 ' + (rec.wc2 || 0) + ' words';
    }
    var score = rec.correct != null ? rec.correct : rec.score;
    return score + '/40' + (rec.band != null ? ' (Band ' + rec.band + ')' : '');
  }

  window.DMI_MOCK = {
    onResult: function (rec) {
      st = load() || st;
      if (st.idx !== idx) return;
      var text = summary(rec);
      st.results = st.results || {};
      st.results[sec.skill] = { text: text, score: rec.correct != null ? rec.correct : rec.score, band: rec.band, wc1: rec.wc1, wc2: rec.wc2, paper: sec.title };
      st.idx = idx + 1;
      save(st);
      api({ action: 'mockSection', skill: sec.skill, result: text + ' · ' + sec.title });
      var last = st.idx >= total;
      var next = last ? null : st.sections[st.idx];
      var c = cover(
        '<small>DMI IELTS Mock Test ' + st.mock + '</small>' +
        '<h1>' + NAMES[sec.skill] + ' finished</h1>' + steps() +
        (last ? '<p>You have finished all sections. Well done.</p>' : '<p>Next: <b>' + NAMES[next.skill] + '</b> (' + next.minutes + ' minutes). Rest for a moment, then continue when your invigilator says so.</p>') +
        '<button class="dmi-mock-btn" type="button">' + (last ? 'See my mock result' : 'Continue to ' + NAMES[next.skill]) + '</button>');
      c.querySelector('button').addEventListener('click', function () {
        leaving = true;
        location.href = last ? BASE + 'mock-test.html?done=1' : BASE + encodeURIComponent(next.file).replace(/%2F/g, '/') + '?mock=' + encodeURIComponent(st.sessionId);
      });
    }
  };

  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  // Give dmi-sso.js a moment to fill in the candidate form first.
  ready(function () { setTimeout(showStart, 400); });
})();
