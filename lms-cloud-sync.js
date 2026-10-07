/**
 * Phase 1 content sync. Server determines access. Credentials/user lists and
 * learner notes/progress/Q&A never enter shared cloud snapshots.
 * Existing per-student progress/notes remain local until a separate API exists.
 */
(function(){
  var origSet=Storage.prototype.setItem, origRemove=Storage.prototype.removeItem;
  var verified=null, pulling=true, timer=null;
  function shared(k){return k==='lms_courses'||/^lms_announce_[A-Za-z0-9_-]+$/.test(k);}
  function status(text,bad){
    var p=document.getElementById('dmiSyncPill');
    if(!p && document.body){
      p=document.createElement('div');p.id='dmiSyncPill';
      p.style.cssText='position:fixed;bottom:14px;right:14px;color:white;padding:8px 14px;border-radius:20px;font:12px Arial;z-index:99999';
      document.body.appendChild(p);
    }
    if(p){p.textContent=text;p.style.background=bad?'#7f1d1d':'#0f1e2d';}
  }
  function snapshot(){
    var out={};
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);if(shared(k))out[k]=localStorage.getItem(k);
    }
    return out;
  }
  function apply(cloud){
    // Merge published content only. No wholesale clearing of lms_* storage.
    Object.keys(cloud).forEach(function(k){
      if(shared(k) && typeof cloud[k]==='string')origSet.call(localStorage,k,cloud[k]);
    });
  }
  async function pull(){
    pulling=true;
    var stage='session verification';
    try{
      verified=await DMI_AUTH.requireRole();
      if(!verified)return {ok:false};
      stage='course data request';
      var res=await DMI_AUTH.call('getLMSData');
      if(!res.ok){status(res.error||'Sync unavailable',true);return res;}
      stage='applying course data';
      apply(res.data||{});status('Synced',false);return res;
    }catch(e){
      var reason=e instanceof SyntaxError?'response was not valid JSON':e instanceof TypeError?'request could not complete':'operation failed';
      var message='Unable to complete '+stage+': '+reason+'.';
      status(message,true);return {ok:false,error:message};
    }
    finally{pulling=false;}
  }
  async function pushNow(){
    clearTimeout(timer);timer=null;
    if(pulling||!verified||verified.role!=='teacher')return {ok:false,localOnly:true};
    try{
      status('Saving…',false);
      var res=await DMI_AUTH.call('setLMSData',{payload:JSON.stringify(snapshot())});
      status(res.ok?'Synced':(res.error||'Save failed'),!res.ok);
      return res;
    }catch(e){status('Save failed — please retry',true);return {ok:false,error:e.message};}
  }
  function schedule(k){
    if(shared(k)&&!pulling&&verified&&verified.role==='teacher'){
      clearTimeout(timer);timer=setTimeout(pushNow,500);
    }
  }
  Storage.prototype.setItem=function(k,v){
    var r=origSet.apply(this,arguments);if(this===localStorage)schedule(k);return r;
  };
  Storage.prototype.removeItem=function(k){
    var r=origRemove.apply(this,arguments);if(this===localStorage)schedule(k);return r;
  };
  // No storage.clear interception and no synchronous unload requests.
  // Explicit saves report success only after receiving the server response.
  var ready=pull();
  window.__DMI_SYNC_INITIAL=ready;
  window.DMI_LMS_SYNC={pushNow:pushNow,pullAndReload:async function(){
    var r=await pull();if(r.ok)location.reload();return r;
  },ready:function(){return ready;}};
})();
