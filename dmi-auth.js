/**
 * Shared DMI session client. Role/profile in localStorage are display caches;
 * only the server session grants access. One token serves every LMS page.
 */
(function(){
  var API_URL='https://script.google.com/macros/s/AKfycbxl15H-Esfx0t4GZrZki0cTyVRQf4SDWFD6wmUmE0f5i24wVksWAnztIxcOPcAooZXp/exec';
  var here=document.currentScript && document.currentScript.src;
  var base=here?here.replace(/[^\/]*$/,''):'./';
  function token(){return localStorage.getItem('dmi_lms_token')||'';}
  function clear(){
    ['dmi_lms_token','dmi_lms_session_expiry','dmi_lms_user','dmi_lms_role','lms_session','lms_users']
      .forEach(function(k){localStorage.removeItem(k);});
    ['dmiSyncedThisSession','dmiSSOReloaded'].forEach(function(k){sessionStorage.removeItem(k);});
    window.__DMI_VERIFIED=null;
  }
  function save(res){
    if(!res.sessionToken)throw new Error('The secure backend has not been deployed');
    clear();
    localStorage.setItem('dmi_lms_token',res.sessionToken);
    localStorage.setItem('dmi_lms_session_expiry',res.sessionExpiresAt);
    localStorage.setItem('dmi_lms_user',JSON.stringify(res.user));
    localStorage.setItem('dmi_lms_role',res.role);
  }
  function call(action,params){
    var body=new URLSearchParams(Object.assign({},params||{}, {action:action,sessionToken:token()}));
    return fetch(API_URL,{method:'POST',body:body}).then(function(r){return r.json();})
      .then(function(res){
        if(['UNAUTHENTICATED','ACCESS_EXPIRED'].indexOf(res.code)>=0)clear();
        return res;
      });
  }
  function verify(){
    if(!token())return Promise.resolve(null);
    return call('session').then(function(res){
      if(!res.ok)return null;
      localStorage.setItem('dmi_lms_user',JSON.stringify(res.user));
      localStorage.setItem('dmi_lms_role',res.role);
      return window.__DMI_VERIFIED={user:res.user,role:res.role};
    });
  }
  function redirect(){location.replace(base+'login.html?next='+encodeURIComponent(location.pathname+location.search));}
  function requireRole(role){
    return verify().then(function(info){
      if(!info || (role && info.role!==role)){redirect();return null;}
      return info;
    }).catch(function(){redirect();return null;});
  }
  async function logout(){
    try{await call('logout');}finally{clear();location.href=base+'login.html';}
  }
  window.DMI_AUTH={token:token,clear:clear,save:save,call:call,verify:verify,
    requireRole:requireRole,logout:logout};
})();
