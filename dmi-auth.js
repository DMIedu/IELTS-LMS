/**
 * Shared DMI session client. Role/profile in localStorage are display caches;
 * only the server session grants access. One token serves every LMS page.
 */
(function(){
  var API_URL='https://script.google.com/macros/s/AKfycbzEIzTnSwNuEJ_QGVS94YpcyU6K0JlN-Aa3LE88LhkICGgR2wt5AoxcrFRBIpSvQC-qew/exec';
  var here=document.currentScript && document.currentScript.src;
  var base=here?here.replace(/[^\/]*$/,''):'./';
  function token(){return localStorage.getItem('phase1_test_dmi_lms_token')||'';}
  function clear(){
    ['phase1_test_dmi_lms_token','phase1_test_dmi_lms_session_expiry','phase1_test_dmi_lms_user','phase1_test_dmi_lms_role','phase1_test_lms_session','phase1_test_lms_users']
      .forEach(function(k){localStorage.removeItem(k);});
    ['phase1_test_dmiSyncedThisSession','phase1_test_dmiSSOReloaded'].forEach(function(k){sessionStorage.removeItem(k);});
    window.__DMI_VERIFIED=null;
  }
  function save(res){
    if(!res.sessionToken)throw new Error('The secure backend has not been deployed');
    clear();
    localStorage.setItem('phase1_test_dmi_lms_token',res.sessionToken);
    localStorage.setItem('phase1_test_dmi_lms_session_expiry',res.sessionExpiresAt);
    localStorage.setItem('phase1_test_dmi_lms_user',JSON.stringify(res.user));
    localStorage.setItem('phase1_test_dmi_lms_role',res.role);
  }
  function request(action,params,includeSession){
    var payload=Object.assign({},params||{}, {action:action});
    if(includeSession)payload.sessionToken=token();
    var body=new URLSearchParams(payload);
    var readOnly=['session','listStudents','listCourses','listMarks','listExamResults','myMarks','getLMSData','listCourseCatalogue','listCourseEnrollments','listCourseProgress'].indexOf(action)>=0;
    async function attempt(retried){
      var res;
      try{
        var response=await fetch(API_URL,{method:'POST',body:body});
        res=await response.json();
      }catch(error){
        if(readOnly && !retried && (error instanceof SyntaxError || error instanceof TypeError))return attempt(true);
        throw error;
      }
      // POST_REQUIRED is rejected before authentication or any database writes.
      // Retry login only for that explicit rejection, never for an ambiguous
      // network failure, invalid password, or rate limit.
      if(!retried && res && (readOnly && res.error==='Use POST' ||
        action==='login' && res.code==='POST_REQUIRED'))return attempt(true);
      if(['UNAUTHENTICATED','ACCESS_EXPIRED'].indexOf(res.code)>=0)clear();
      return res;
    }
    return attempt(false);
  }
  function call(action,params){return request(action,params,true);}
  function login(params){return request('login',params,false);}
  function verify(){
    if(!token())return Promise.resolve(null);
    return call('session').then(function(res){
      if(!res.ok){
        if(['UNAUTHENTICATED','ACCESS_EXPIRED'].indexOf(res.code)>=0)return null;
        throw new Error(res.error==='Use POST'?'The server returned Use POST during session verification.':'The server could not verify the session.');
      }
      localStorage.setItem('phase1_test_dmi_lms_user',JSON.stringify(res.user));
      localStorage.setItem('phase1_test_dmi_lms_role',res.role);
      return window.__DMI_VERIFIED={user:res.user,role:res.role};
    });
  }
  function redirect(){location.replace(base+'login.html?next='+encodeURIComponent(location.pathname+location.search));}
  function retryVerification(error){
    window.__DMI_VERIFIED=null;
    function show(){
      var box=document.createElement('div');
      box.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#f2f5f9;color:#1e2d40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:32px;text-align:center;font:16px system-ui';
      var title=document.createElement('h2');title.textContent='Session verification could not complete';box.appendChild(title);
      var detail=document.createElement('p');detail.textContent=error instanceof SyntaxError?'The server response was not valid JSON.':error instanceof TypeError?'The verification request could not complete.':error.message==='The server returned Use POST during session verification.'?error.message:'The server could not verify the session.';
      box.appendChild(detail);
      var note=document.createElement('p');note.textContent='Your saved sign-in was kept. Retry verification to continue.';box.appendChild(note);
      var button=document.createElement('button');button.textContent='Retry verification';
      button.style.cssText='padding:12px 20px;background:#c0202a;color:#fff;border:0;border-radius:7px;cursor:pointer;font:inherit';
      button.onclick=function(){location.reload();};box.appendChild(button);document.body.appendChild(box);
    }
    if(document.body)show();else document.addEventListener('DOMContentLoaded',show,{once:true});
  }
  function requireRole(role){
    return verify().then(function(info){
      if(!info || (role && info.role!==role)){redirect();return null;}
      return info;
    }).catch(function(error){retryVerification(error);return null;});
  }
  async function logout(){
    try{await call('logout');}finally{clear();location.href=base+'login.html';}
  }
  window.DMI_AUTH={token:token,clear:clear,save:save,call:call,login:login,verify:verify,
    requireRole:requireRole,logout:logout};
})();
