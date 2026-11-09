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
  recordingWindow:current&&current.phase!=='preparation'?mockSpeakingWindow_(a,plan,current.part,true):null,
  stage:current?{phase:current.phase,part:current.part,prompt:current.prompt,
   startedAt:new Date(start+current.startSeconds*1000).toISOString(),deadline:new Date(start+current.endSeconds*1000).toISOString()}:null}};
}
function startMockSpeakingTimed_(p,ctx){
 mockSpeakingTimedGate_();const a=mockSpeakingAccess_(p,ctx);mockSpeakingFolder_();const plan=mockSpeakingPlan_(a),state=mockAttemptState_(a);
 if(!state.speaking){
  if(![true,'true'].includes(p.consent)||![true,'true'].includes(p.microphoneReady))securityError_('VALIDATION','Complete microphone preflight and recording consent first');
  state.speaking={startedAt:new Date().toISOString(),paperDigest:a.PaperDigest,recordingIDs:{1:opaque_(),2:opaque_(),3:opaque_()}};mockAttemptPatch_(a,state);
 }
 return mockSpeakingTimedPublic_(a,plan);
}
function resumeMockSpeakingTimed_(p,ctx){
 mockSpeakingTimedGate_();const a=mockSpeakingAccess_(p,ctx);mockSpeakingFolder_();return mockSpeakingTimedPublic_(a,mockSpeakingPlan_(a));
}

/** Window metadata does not prove audio content/duration; real decoding/assessment remains pending. */
function mockSpeakingWindow_(a,plan,part,publicView){
 const s=mockSpeakingTimedState_(a),stages=plan.stages.filter(v=>v.part===part&&v.phase!=='preparation');
 const start=new Date(s.startedAt).getTime()+stages[0].startSeconds*1000,end=new Date(s.startedAt).getTime()+stages[stages.length-1].endSeconds*1000;
 const id=s.recordingIDs&&s.recordingIDs[part];
 if(typeof id!=='string'||!id)securityError_('MOCK_SETUP_REQUIRED','Recording identities need teacher assistance');
 const eligible=Date.now()>=start&&Date.now()<=start+15000;
 return {part,startedAt:new Date(start).toISOString(),deadline:new Date(end).toISOString(),uploadDeadline:new Date(end+900000).toISOString(),
  recordingID:!publicView||eligible?id:null,eligible};
}
function mockSpeakingTimedUpload_(a,p,recovery){
 const state=mockAttemptState_(a);
 if(!state.speaking&&PropertiesService.getScriptProperties().getProperty('DMI_MOCK_SPEAKING_TIMED_ENABLED')!=='true')return;
 mockSpeakingTimedGate_();const plan=mockSpeakingPlan_(a),window=mockSpeakingWindow_(a,plan,Number(p.part),false);
 if(typeof p.recordingID!=='string'||!equal_(window.recordingID,p.recordingID))
 securityError_('MOCK_RECORDING_ID','This recording does not belong to the timed part');
 if(!recovery&&(Date.now()<new Date(window.deadline).getTime()||Date.now()>new Date(window.uploadDeadline).getTime()))
 securityError_('MOCK_UPLOAD_WINDOW','The timed recording upload window is closed; ask your teacher');
 if(Number(p.durationSeconds)>(new Date(window.deadline)-new Date(window.startedAt))/1000+5)
 securityError_('VALIDATION','Recording exceeds its timed part');
}
