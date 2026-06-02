/**
 * DMI LMS — Cloud Sync Bridge
 *
 * Makes the old video-tutorial LMS sync its localStorage across devices via
 * the same Apps Script + Google Sheet backend used by login/teacher panel.
 *
 * HOW IT WORKS
 *   On page load (BEFORE the main script runs):
 *     1. Synchronously fetch the latest data blob from the Google Sheet
 *     2. Overwrite local lms_* keys with what came back
 *     3. Main script then boots normally — it reads localStorage as usual
 *
 *   On any localStorage write to an lms_* key:
 *     1. Debounce 1.5 seconds
 *     2. Push the full snapshot to the Google Sheet
 *
 *   Visual: small "Sync" pill in the corner shows status
 *     · Grey "Syncing…"   while a push/pull is in flight
 *     · Green "Synced ✓"  for 2 seconds after a successful push
 *     · Red   "Offline"   if a request fails
 *
 * HOW TO USE
 *   Include this script tag in the <head> of video tutorial/index.html
 *   BEFORE the main <script> block:
 *
 *     <script src="../lms-cloud-sync.js"></script>
 *
 *   (The path is "../" because video tutorial/index.html is in a subfolder.)
 */
(function () {
  // === CONFIG ===
  var API_URL = 'https://script.google.com/macros/s/AKfycbxl15H-Esfx0t4GZrZki0cTyVRQf4SDWFD6wmUmE0f5i24wVksWAnztIxcOPcAooZXp/exec';
  var SYNC_PREFIX = 'lms_'; // every localStorage key starting with this is synced

  // ===== Pill UI =====
  function makePill() {
    if (typeof document === 'undefined' || !document.body) return null;
    if (document.getElementById('dmiSyncPill')) return document.getElementById('dmiSyncPill');
    var p = document.createElement('div');
    p.id = 'dmiSyncPill';
    p.style.cssText =
      'position:fixed;bottom:14px;right:14px;background:#0f1e2d;color:#fff;' +
      'font:600 12px/1 Arial,Helvetica,sans-serif;padding:7px 13px;border-radius:99px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:99999;display:flex;align-items:center;' +
      'gap:7px;transition:opacity .25s,background .25s;opacity:0;pointer-events:none';
    p.innerHTML = '<span id="dmiSyncDot" style="width:8px;height:8px;border-radius:50%;background:#94a3b8"></span><span id="dmiSyncTxt">Syncing…</span>';
    document.body.appendChild(p);
    return p;
  }
  function pillSet(state) {
    var p = makePill();
    if (!p) return;
    var dot = document.getElementById('dmiSyncDot');
    var txt = document.getElementById('dmiSyncTxt');
    if (state === 'syncing') { p.style.background = '#0f1e2d'; dot.style.background = '#94a3b8'; txt.textContent = 'Syncing…'; p.style.opacity = '1'; }
    else if (state === 'ok') { p.style.background = '#0f1e2d'; dot.style.background = '#22c55e'; txt.textContent = 'Synced ✓'; p.style.opacity = '1';
      clearTimeout(p._fade); p._fade = setTimeout(function(){ p.style.opacity = '0'; }, 2200); }
    else if (state === 'err') { p.style.background = '#7f1d1d'; dot.style.background = '#fca5a5'; txt.textContent = 'Offline (no sync)'; p.style.opacity = '1';
      clearTimeout(p._fade); p._fade = setTimeout(function(){ p.style.opacity = '0'; }, 4000); }
    else { p.style.opacity = '0'; }
  }

  // ===== INITIAL PULL (synchronous, runs before main script) =====
  function pullSync() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_URL, false); // synchronous so main script waits
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.send('action=getLMSData');
      if (xhr.status !== 200) throw new Error('HTTP ' + xhr.status);
      var res = JSON.parse(xhr.responseText);
      if (!res.ok) throw new Error(res.error || 'unknown server error');
      var cloud = res.data || {};
      var cloudKeys = Object.keys(cloud);
      if (cloudKeys.length === 0) {
        // Cloud empty → first run. Whatever this device has becomes the seed.
        return { ok: true, seeded: false };
      }
      // Wipe local lms_* and apply cloud version
      var toRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(SYNC_PREFIX) === 0) toRemove.push(k);
      }
      toRemove.forEach(function (k) { localStorage.removeItem(k); });
      cloudKeys.forEach(function (k) { localStorage.setItem(k, cloud[k]); });
      return { ok: true, applied: cloudKeys.length };
    } catch (e) {
      console.warn('[DMI Sync] initial pull failed:', e.message);
      return { ok: false, error: e.message };
    }
  }
  var initial = pullSync();
  window.__DMI_SYNC_INITIAL = initial;

  // ===== PUSH (debounced) =====
  var pushTimer = null;
  function snapshot() {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(SYNC_PREFIX) === 0) out[k] = localStorage.getItem(k);
    }
    return out;
  }
  function pushNow() {
    pillSet('syncing');
    var data = JSON.stringify(snapshot());
    var body = new URLSearchParams({ action: 'setLMSData', payload: data });
    fetch(API_URL, { method: 'POST', body: body })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.ok) pillSet('ok');
        else pillSet('err');
      })
      .catch(function () { pillSet('err'); });
  }
  function schedulePush() {
    pillSet('syncing');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 1500);
  }

  // ===== Hook every localStorage write =====
  var origSetItem = Storage.prototype.setItem;
  var origRemoveItem = Storage.prototype.removeItem;
  var origClear = Storage.prototype.clear;

  Storage.prototype.setItem = function (key, value) {
    var r = origSetItem.apply(this, arguments);
    if (this === window.localStorage && typeof key === 'string' && key.indexOf(SYNC_PREFIX) === 0) {
      schedulePush();
    }
    return r;
  };
  Storage.prototype.removeItem = function (key) {
    var r = origRemoveItem.apply(this, arguments);
    if (this === window.localStorage && typeof key === 'string' && key.indexOf(SYNC_PREFIX) === 0) {
      schedulePush();
    }
    return r;
  };
  Storage.prototype.clear = function () {
    var r = origClear.apply(this, arguments);
    if (this === window.localStorage) schedulePush();
    return r;
  };

  // ===== Public helpers =====
  window.DMI_LMS_SYNC = {
    /** Force an immediate push. Useful from an admin button. */
    pushNow: pushNow,
    /** Force a pull and reload. Useful from a Refresh button. */
    pullAndReload: function () {
      pullSync();
      location.reload();
    },
    /** Returns { ok, applied?, seeded?, error? } from the initial sync. */
    status: function () { return window.__DMI_SYNC_INITIAL; }
  };

  // Ready event
  window.addEventListener('DOMContentLoaded', function () {
    if (initial.ok) {
      if (initial.applied) pillSet('ok');
    } else {
      pillSet('err');
    }
  });
})();
