/** Disabled timed Speaking prompt draft. No examiner simulation or assessment. */
function mockSpeakingTimedGate_(){
 if(PropertiesService.getScriptProperties().getProperty('DMI_MOCK_SPEAKING_TIMED_ENABLED')!=='true')
 securityError_('MOCK_NOT_READY','Timed Speaking is still being prepared');
}
function mockSpeakingPlan_(a){
 const loaded=mockPaper_(a.PaperID,a.PaperVersion);
 if(!equal_(loaded.digest,a.PaperDigest))securityError_('MOCK_PAPER_CHANGED','The pinned paper changed; ask your teacher');
 const s=loaded.paper.speakingTiming,fail=()=>securityError_('MOCK_NOT_READY','The Speaking prompts and timing need review');
 if(!s||s.reviewed!==true||!Array.isArray(s.part1)||!Array.isArray(s.part3)||
 s.part1.length<4||s.part1.length>12||s.part3.length<4||s.part3.length>8||
 typeof s.cue!=='string'||!s.cue.trim()||s.cue.length>3000)fail();
 const stages=[];let offset=0;
 function add(phase,part,seconds,prompt){stages.push({phase,part,startSeconds:offset,endSeconds:offset+seconds,prompt});offset+=seconds;}
 function questions(list,phase,part){
  let total=0;
  list.forEach(q=>{if(!q||typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>1500||
   !Number.isInteger(q.seconds)||q.seconds<15||q.seconds>90)fail();total+=q.seconds;});
  if(total<240||total>300)fail();
  list.forEach(q=>add(phase,part,q.seconds,q.prompt));
 }
 questions(s.part1,'part1',1);add('preparation',2,60,s.cue);add('long_turn',2,120,s.cue);questions(s.part3,'part3',3);
 return {stages,totalSeconds:offset,digest:loaded.digest};
}
function mockSpeakingTimedState_(a){
 const state=mockAttemptState_(a),s=state.speaking;
 if(!s||typeof s.startedAt!=='string'||!Number.isFinite(new Date(s.startedAt).getTime())||s.paperDigest!==a.PaperDigest)
 securityError_('MOCK_SPEAKING_NOT_STARTED','Start timed Speaking after the microphone preflight');
 return s;
}
function mockSpeakingTimedPublic_(a,plan){
 const s=mockSpeakingTimedState_(a),start=new Date(s.startedAt).getTime(),now=Date.now(),elapsed=Math.max(0,(now-start)/1000);
 const current=plan.stages.find(v=>elapsed<v.endSeconds);
 return {ok:true,speaking:{attemptID:a.AttemptID,serverNow:new Date(now).toISOString(),startedAt:s.startedAt,
  deadline:new Date(start+plan.totalSeconds*1000).toISOString(),totalSeconds:plan.totalSeconds,
  status:current?'in_progress':'finished',assessment:'pending',
  stage:current?{phase:current.phase,part:current.part,prompt:current.prompt,
   startedAt:new Date(start+current.startSeconds*1000).toISOString(),deadline:new Date(start+current.endSeconds*1000).toISOString()}:null}};
}
function startMockSpeakingTimed_(p,ctx){
 mockSpeakingTimedGate_();const a=mockSpeakingAccess_(p,ctx);mockSpeakingFolder_();const plan=mockSpeakingPlan_(a),state=mockAttemptState_(a);
 if(!state.speaking){
  if(p.consent!==true||p.microphoneReady!==true)securityError_('VALIDATION','Complete microphone preflight and recording consent first');
  state.speaking={startedAt:new Date().toISOString(),paperDigest:a.PaperDigest};mockAttemptPatch_(a,state);
 }
 return mockSpeakingTimedPublic_(a,plan);
}
function resumeMockSpeakingTimed_(p,ctx){
 mockSpeakingTimedGate_();const a=mockSpeakingAccess_(p,ctx);mockSpeakingFolder_();return mockSpeakingTimedPublic_(a,mockSpeakingPlan_(a));
}
