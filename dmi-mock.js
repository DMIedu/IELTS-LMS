/* Secure mock entry client. Codes remain only in the current page's memory. */
(async function(){
  'use strict';
  const $=id=>document.getElementById(id),role=document.body.dataset.mockRole;
  const auth=await DMI_AUTH.requireRole(role);if(!auth)return;
  $('dashboard-link').href=role==='teacher'?'teacher-panel.html':'student-panel.html';
  $('logout').onclick=()=>DMI_AUTH.logout();
  $('content').hidden=false;
  let busy=false,sittings=[],createRequest=null,rotateRequests={},admitted=false;
  const requestID=()=>crypto.randomUUID();
  function status(message,bad){$('status').textContent=message;$('status').className=bad?'error':message?'success':'';}
  async function call(action,p){
    const res=await DMI_AUTH.call(action,p);
    if(!res || !res.ok){const error=Error(res&&res.error||'The request could not complete. Please retry.');error.code=res&&res.code;throw error;}
    return res;
  }
  async function work(fn){
    if(busy)return;busy=true;
    const buttons=Array.from(document.querySelectorAll('button'));
    const previous=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
    try{status('');await fn();}catch(e){status(e.message==='Failed to fetch'?'Connection failed. Refresh the sitting list before retrying.':e.message,true);}
    finally{busy=false;buttons.forEach((b,i)=>b.disabled=previous[i]);if(role==='student'){const s=sittings.find(s=>s.id===$('sitting').value);$('entry-button').disabled=admitted||!s||s.state!=='open';}}
  }
  const localDate=value=>new Date(value).toLocaleString();
  function node(tag,text,cls){const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;}
  function issued(res){
    if(!res.code){$('code-box').hidden=true;status('The request was already saved. Use Issue replacement code if the code was not received.');return;}
    $('code-box').hidden=false;$('issued-code').textContent=res.code;
    $('code-note').textContent=res.sitting.title+' — entry closes '+localDate(res.sitting.closesAt);
  }
  async function loadSittings(){const res=await call('listMockSittings');sittings=res.data;return sittings;}
  if(role==='teacher'){
    let students=[],chosen=new Set();
    const inputDate=d=>new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
    $('opens').value=inputDate(new Date());$('closes').value=inputDate(new Date(Date.now()+3*3600000));
    $('timezone').textContent=Intl.DateTimeFormat().resolvedOptions().timeZone||'local time';
    function renderCandidates(){
      const search=$('candidate-search').value.trim().toLowerCase(),wrap=$('candidates');wrap.replaceChildren();
      students.filter(s=>[s.Name,s.Email,s.Class].join(' ').toLowerCase().includes(search)).forEach(s=>{
        const label=node('label',''),box=document.createElement('input');box.type='checkbox';box.checked=chosen.has(s.Email);
        box.onchange=()=>{if(box.checked&&chosen.size>=100){box.checked=false;status('Choose no more than 100 students.',true);return;}
          box.checked?chosen.add(s.Email):chosen.delete(s.Email);$('selected-count').textContent=chosen.size+' selected';};
        label.append(box,node('span',s.Name+' — '+s.Email+(s.Class?' · '+s.Class:'')));wrap.append(label);
      });
      $('selected-count').textContent=chosen.size+' selected';
      if(!wrap.children.length)wrap.append(node('p','No active students match.','muted'));
    }
    function button(text,fn){const b=node('button',text,'secondary');b.type='button';b.onclick=()=>work(fn);return b;}
    async function refresh(){
      await loadSittings();if(createRequest&&sittings.some(s=>s.createRequestID===createRequest.id)){createRequest=null;status('The previous sitting was saved. Issue a replacement code if you did not receive it.');}const wrap=$('sittings');wrap.replaceChildren();
      if(!sittings.length)wrap.append(node('p','No mock sittings yet.','muted'));
      sittings.forEach(s=>{
        const card=node('article','','card');card.append(node('h3',s.title),node('p',s.paperTitle||s.paper||'','muted'),node('p',s.state,'state'),
          node('p',localDate(s.opensAt)+' → '+localDate(s.closesAt),'muted'),
          node('p',(s.class?s.class+' · ':'')+s.candidates.length+' assigned students','muted'));
        const actions=node('div','','actions');
        actions.append(button('View entries',async()=>{
          const res=await call('listMockAdmissions',{sittingID:s.id});$('admissions-card').hidden=false;$('admissions').replaceChildren(node('p',s.title));
          if(!res.data.length)$('admissions').append(node('p','No students have entered yet.','muted'));
          res.data.forEach(a=>$('admissions').append(node('p',a.studentName+' · '+a.studentID+' · '+localDate(a.admittedAt))));
        }));
        if(['scheduled','open'].includes(s.state)){
          actions.append(button('Issue replacement code',async()=>{
            if(!confirm('Replace the code for '+s.title+'? The previous code will stop admitting new students.'))return;
            const id=rotateRequests[s.id]||(rotateRequests[s.id]=requestID());
            const res=await call('rotateMockCode',{sittingID:s.id,requestID:id});delete rotateRequests[s.id];issued(res);await refresh();
          }),button('Close entry',async()=>{
            if(!confirm('Close entry for '+s.title+'? This cannot be reopened.'))return;
            await call('closeMockSitting',{sittingID:s.id});$('code-box').hidden=true;status('Entry closed.');await refresh();
          }));
        }
        card.append(actions);wrap.append(card);
      });
    }
    $('candidate-search').oninput=renderCandidates;
    $('select-visible').onclick=()=>{const q=$('candidate-search').value.trim().toLowerCase();
      for(const s of students.filter(s=>[s.Name,s.Email,s.Class].join(' ').toLowerCase().includes(q))){if(chosen.size>=100)break;chosen.add(s.Email);}renderCandidates();};
    $('clear-selection').onclick=()=>{chosen.clear();renderCandidates();};
    $('copy-code').onclick=()=>work(async()=>{await navigator.clipboard.writeText($('issued-code').textContent);status('Code copied.');});
    $('refresh').onclick=()=>work(refresh);
    $('create-form').onsubmit=e=>{e.preventDefault();work(async()=>{
      if(!chosen.size)throw Error('Choose at least one active student.');
      const payload={paperID:$('paper').value,title:$('title').value,class:$('class').value,opensAt:new Date($('opens').value).toISOString(),
        closesAt:new Date($('closes').value).toISOString(),candidatesJSON:JSON.stringify(Array.from(chosen))};
      const fingerprint=JSON.stringify(payload);
      if(createRequest&&createRequest.fingerprint!==fingerprint)throw Error('The previous request may have saved. Refresh sittings before creating another.');
      if(!createRequest)createRequest={fingerprint,id:requestID()};
      let res;try{res=await call('createMockSitting',Object.assign(payload,{requestID:createRequest.id}));}catch(e){if(e.code&&['SERVER_ERROR','BUSY'].indexOf(e.code)<0)createRequest=null;throw e;}
      createRequest=null;issued(res);await refresh();
    });};
    await work(async()=>{const res=await call('listStudents');students=res.data.filter(s=>!s.expired&&(!s.Status||['active','enabled'].includes(String(s.Status).toLowerCase())));renderCandidates();await refresh();});
  }else{
    $('candidate-name').textContent='Signed in as '+auth.user.name+' · '+auth.user.id;
    function showAdmission(res){
      admitted=!!res.admission;
      $('admitted').hidden=!res.admission;
      $('admitted').textContent=res.admission?'Entry confirmed for '+res.sitting.title+'. Your candidate ID is '+res.admission.studentID+'. This rehearsal does not start the exam.':'';
      $('code').required=!res.admission;$('code').disabled=!!res.admission;$('entry-button').disabled=!!res.admission;
    }
    async function selection(){
      const s=sittings.find(s=>s.id===$('sitting').value);admitted=false;$('admitted').hidden=true;
      $('code').value='';$('code').required=true;$('code').disabled=false;
      if(!s){$('schedule').textContent='No assigned sittings are available.';$('entry-button').disabled=true;return;}
      $('schedule').textContent=localDate(s.opensAt)+' → '+localDate(s.closesAt)+' · '+s.state;
      $('entry-button').disabled=s.state!=='open';
      const selectedID=s.id;
      const res=await call('myMockAdmission',{sittingID:selectedID});
      if($('sitting').value===selectedID)showAdmission(res);
      if(s.state!=='open')$('entry-button').disabled=true;
    }
    async function refresh(){
      const selected=$('sitting').value;await loadSittings();$('sitting').replaceChildren();
      sittings.forEach(s=>{const option=node('option',s.title+' — '+s.state);option.value=s.id;$('sitting').append(option);});
      if(sittings.some(s=>s.id===selected))$('sitting').value=selected;
      await selection();
    }
    $('sitting').onchange=()=>work(selection);
    $('refresh').onclick=()=>work(refresh);
    $('entry-form').onsubmit=e=>{e.preventDefault();work(async()=>{
      const res=await call('enterMockSitting',{sittingID:$('sitting').value,code:$('code').value});
      $('code').value='';showAdmission(res);status('Your entry has been saved.');
    });};
    await work(refresh);
  }
})();
