/**
 * Server-owned written mock lifecycle. All calls use handle()'s script lock.
 * No content is shipped in public assets. Owner-reviewed papers live in MockPapers.
 * This module does not enable the unfinished audio/Speaking candidate interface.
 */
const DMI_MOCK_PAPER_HEADERS=['PaperID','Version','Reviewed','AudioReviewed','PaperJSON'];
const DMI_MOCK_ATTEMPT_HEADERS=['AttemptID','AdmissionID','SittingID','StudentEmail','StudentID','PaperID','PaperVersion','PaperDigest','StartedAt','ListeningDeadline','ReadingDeadline','WritingDeadline','StateJSON','Revision'];
function initializeMockAttempts(){
  secret_();const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))securityError_('BUSY','Please retry shortly');
  try{
    const book=ss();
    [['MockPapers',DMI_MOCK_PAPER_HEADERS],['MockAttempts',DMI_MOCK_ATTEMPT_HEADERS]].forEach(pair=>{
      if(!book.getSheetByName(pair[0]))book.insertSheet(pair[0]).appendRow(pair[1]);
      mockSheet_(pair[0],pair[1]);
    });
    Logger.log('Mock attempt storage ready. No paper was enabled and no existing results were changed.');
  }finally{lock.releaseLock();}
}
function mockPaper_(id,version){
  const matches=rows(mockSheet_('MockPapers',DMI_MOCK_PAPER_HEADERS)).filter(r=>r.PaperID===id&&(!version||String(r.Version)===String(version)));
  if(matches.length!==1)securityError_('MOCK_NOT_READY','An immutable reviewed paper version is required');
  const r=matches[0];
  if(String(r.Reviewed).toLowerCase()!=='true'||String(r.AudioReviewed).toLowerCase()!=='true')
    securityError_('MOCK_NOT_READY','The mock paper and Listening recording are not ready');
  let paper;try{paper=JSON.parse(r.PaperJSON);}catch(e){securityError_('MOCK_NOT_READY','The mock paper needs review');}
  if(!paper||typeof paper!=='object'||!Array.isArray(paper.sections)||paper.sections.length!==3||
    !Number.isInteger(paper.listeningSeconds)||paper.listeningSeconds<1200||paper.listeningSeconds>2400||
    !String(r.Version).match(/^[A-Za-z0-9._-]{1,40}$/))
    securityError_('MOCK_NOT_READY','The mock paper needs review');
  ['listening','reading','writing'].forEach((name,i)=>{
    const section=paper.sections[i],total=i===2?2:40;
    if(!section||section.name!==name||!Array.isArray(section.questions)||section.questions.length!==total||
      !section.questions.every((q,j)=>q&&q.id===String(j+1)&&typeof q.prompt==='string'&&q.prompt.trim()))
      securityError_('MOCK_NOT_READY','The mock questions need review');
  });
  // No arbitrary URLs/keys are exposed: public content is a strict allowlist.
  return {record:r,paper,digest:digest_(r.PaperJSON)};
}
function mockAttemptFor_(sitting,ctx){
  return rows(mockSheet_('MockAttempts',DMI_MOCK_ATTEMPT_HEADERS)).find(a=>a.SittingID===sitting.SittingID&&
    email_(a.StudentEmail)===email_(ctx.user.email)&&String(a.StudentID)===String(ctx.user.id));
}
function mockAttemptAccess_(p,ctx){
  mockRole_(ctx,'student');const sitting=mockRecord_(p.sittingID);
  if(!mockCandidates_(sitting).includes(email_(ctx.user.email)))securityError_('FORBIDDEN','You are not assigned to this sitting');
  const a=mockAttemptFor_(sitting,ctx);
  if(!a)securityError_('MOCK_NOT_STARTED','Start the mock before saving answers');
  if(p.attemptID&&String(p.attemptID)!==a.AttemptID)securityError_('FORBIDDEN','Attempt does not belong to this candidate');
  return a;
}
function mockAttemptState_(a){
  let state;try{state=JSON.parse(a.StateJSON);}catch(e){securityError_('MOCK_SETUP_REQUIRED','Attempt needs teacher assistance');}
  if(!state||!Array.isArray(state.sections)||state.sections.length!==3)securityError_('MOCK_SETUP_REQUIRED','Attempt needs teacher assistance');
  return state;
}
function mockAttemptPatch_(a,state){
  const sheet=mockSheet_('MockAttempts',DMI_MOCK_ATTEMPT_HEADERS),data=sheet.getDataRange().getValues(),head=data[0].map(headerName_);
  const i=data.findIndex((r,i)=>i>0&&r[head.indexOf('AttemptID')]===a.AttemptID);
  if(i<1)securityError_('NOT_FOUND','Attempt not found');
  const json=JSON.stringify(state);
  if(json.length>45000)securityError_('VALIDATION','Answers exceed the storage limit');
  const next=Number(a.Revision)+1,row=data[i].slice();
  row[head.indexOf('StateJSON')]=json;row[head.indexOf('Revision')]=next;
  sheet.getRange(i+1,1,1,head.length).setValues([row]);
  a.StateJSON=json;a.Revision=next;return state;
}
function mockDeadlines_(a){return [a.ListeningDeadline,a.ReadingDeadline,a.WritingDeadline].map(x=>new Date(x).getTime());}
function mockReconcileAttempt_(a){
  const state=mockAttemptState_(a),deadlines=mockDeadlines_(a);let changed=false;
  if(!deadlines.every(Number.isFinite)||!deadlines.every((v,i)=>i===0||v>deadlines[i-1]))
    securityError_('MOCK_SETUP_REQUIRED','Attempt deadlines need teacher assistance');
  state.sections.forEach((s,i)=>{if(Date.now()>=deadlines[i]&&!s.closed){s.closed=true;s.reason='deadline';s.closedAt=new Date(deadlines[i]).toISOString();changed=true;}});
  if(changed)mockAttemptPatch_(a,state);return state;
}
function mockAttemptPublic_(a,state){
  const deadlines=mockDeadlines_(a),index=deadlines.findIndex(d=>Date.now()<d);
  const result={id:a.AttemptID,sittingID:a.SittingID,revision:Number(a.Revision),serverNow:new Date().toISOString(),
    startedAt:new Date(a.StartedAt).toISOString(),deadlines:deadlines.map(d=>new Date(d).toISOString()),
    section:index<0?null:['listening','reading','writing'][index],status:index<0?'written_submitted':'in_progress',
    assessment:'pending',speaking:'not_started',sections:state.sections.map(s=>({closed:s.closed,reason:s.reason||null}))};
  if(index>=0){
    const loaded=mockPaper_(a.PaperID,a.PaperVersion);
    if(!equal_(loaded.digest,a.PaperDigest))securityError_('MOCK_PAPER_CHANGED','The paper changed. Contact your teacher; your saved work is preserved.');
    const section=loaded.paper.sections[index];
    result.answers=state.sections[index].answers;
    result.content={name:section.name,instructions:String(section.instructions||''),passages:Array.isArray(section.passages)?
      section.passages.map(v=>({title:String(v.title||''),text:String(v.text||'')})):[],
      questions:section.questions.map(q=>({id:q.id,prompt:q.prompt,options:Array.isArray(q.options)?q.options.map(String):[],
        wordLimit:Number.isInteger(q.wordLimit)?q.wordLimit:null}))};
  }
  return {ok:true,attempt:result};
}
function startMockAttempt_(p,ctx){
  mockRole_(ctx,'student');const sitting=mockRecord_(p.sittingID);
  if(!mockCandidates_(sitting).includes(email_(ctx.user.email)))securityError_('FORBIDDEN','You are not assigned to this sitting');
  const prior=mockAttemptFor_(sitting,ctx);
  if(prior)return mockAttemptPublic_(prior,mockReconcileAttempt_(prior));
  if(mockState_(sitting)!=='open'||!mockAdmission_(sitting,ctx))securityError_('MOCK_ENTRY_REQUIRED','Enter the open sitting with your teacher code first');
  // The browser runner/audio pipeline must be enabled explicitly by a later rollout.
  if(PropertiesService.getScriptProperties().getProperty('DMI_MOCK_RUNNER_ENABLED')!=='true')
    securityError_('MOCK_NOT_READY','The timed mock is still being prepared. Your admission is saved.');
  const loaded=mockPaper_(sitting.PaperID),now=Date.now(),listenEnd=now+(loaded.paper.listeningSeconds+120)*1000;
  const admission=mockAdmission_(sitting,ctx),a={AttemptID:'ATTEMPT-'+opaque_().slice(0,24),AdmissionID:admission.AdmissionID,
    SittingID:sitting.SittingID,StudentEmail:email_(ctx.user.email),StudentID:ctx.user.id,PaperID:sitting.PaperID,
    PaperVersion:String(loaded.record.Version),PaperDigest:loaded.digest,StartedAt:new Date(now),
    ListeningDeadline:new Date(listenEnd),ReadingDeadline:new Date(listenEnd+3600000),WritingDeadline:new Date(listenEnd+7200000),
    StateJSON:JSON.stringify({sections:[0,1,2].map(()=>({answers:{},closed:false}))}),Revision:0};
  const sheet=mockSheet_('MockAttempts',DMI_MOCK_ATTEMPT_HEADERS),head=sheet.getDataRange().getValues()[0].map(headerName_);
  sheet.appendRow(head.map(k=>a[k]));
  return mockAttemptPublic_(a,mockAttemptState_(a));
}
function resumeMockAttempt_(p,ctx){
  const a=mockAttemptAccess_(p,ctx);return mockAttemptPublic_(a,mockReconcileAttempt_(a));
}
function mutateMockAnswers_(p,ctx,submit){
  const a=mockAttemptAccess_(p,ctx),state=mockReconcileAttempt_(a),names=['listening','reading','writing'],index=names.indexOf(String(p.section));
  if(index<0)securityError_('VALIDATION','Choose a valid section');
  const section=state.sections[index],request=mockRequestID_(p.requestID);
  if(section.lastRequest===request)return mockAttemptPublic_(a,state);
  if(section.closed)securityError_('MOCK_SECTION_CLOSED','This section is closed. Late answers were not saved.');
  const current=mockDeadlines_(a).findIndex(d=>Date.now()<d);
  if(current!==index)securityError_('MOCK_SECTION_ORDER','Complete sections in the test order');
  if(!Number.isInteger(Number(p.revision))||Number(p.revision)!==Number(a.Revision))
    securityError_('MOCK_REVISION_CONFLICT','A newer save exists. Resume the attempt before saving again.');
  const loaded=mockPaper_(a.PaperID,a.PaperVersion);
  if(!equal_(loaded.digest,a.PaperDigest))securityError_('MOCK_PAPER_CHANGED','The paper changed. Contact your teacher.');
  const raw=String(p.answersJSON||'');
  if(raw.length>(index===2?28000:6000))securityError_('VALIDATION','Answers are too long');
  let answers;try{answers=JSON.parse(raw);}catch(e){securityError_('VALIDATION','Invalid answer draft');}
  const allowed=loaded.paper.sections[index].questions.map(q=>q.id);
  if(!answers||Array.isArray(answers)||typeof answers!=='object'||
    !Object.keys(answers).every(k=>allowed.includes(k)&&typeof answers[k]==='string'&&answers[k].length<=(index===2?12000:100)))
    securityError_('VALIDATION','Invalid answer draft');
  section.answers=answers;section.lastRequest=request;
  if(submit){section.closed=true;section.reason='candidate';section.closedAt=new Date().toISOString();}
  mockAttemptPatch_(a,state);return mockAttemptPublic_(a,state);
}
function saveMockAnswers_(p,ctx){return mutateMockAnswers_(p,ctx,false);}
function submitMockSection_(p,ctx){return mutateMockAnswers_(p,ctx,true);}
