/* TEST COPY ONLY: prevents production backend calls before LMS scripts run. */
(function(){
const endpoint="https://script.google.com/macros/s/AKfycbzEIzTnSwNuEJ_QGVS94YpcyU6K0JlN-Aa3LE88LhkICGgR2wt5AoxcrFRBIpSvQC-qew/exec";
const allowed=new URL(endpoint),nativeFetch=window.fetch.bind(window);
window.fetch=function(input,options){
 const url=new URL(input instanceof Request?input.url:String(input),location.href);
 if(url.hostname==='script.google.com' && url.pathname!==allowed.pathname)
  return Promise.reject(new Error('Test copy blocked a production Apps Script request'));
 return nativeFetch(input,options);
};
function show(){
 document.title='[TEST] '+document.title;
 const bar=document.createElement('div');bar.textContent='DMI SECURITY TEST COPY — uses the test database';
 bar.style.cssText='position:sticky;top:0;z-index:2147483647;padding:10px;background:#fff2b8;color:#4c3500;text-align:center;font:700 14px system-ui';
 document.body.prepend(bar);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show);else show();
})();