/** Disabled owner-only audio-service pilot. No public endpoint or automatic result release. */
function mockSpeakingAssessmentConfig_(){
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('DMI_MOCK_ASSESSMENT_ENABLED')!=='true')securityError_('ASSESSMENT_NOT_READY','Audio assessment is not configured');
 const endpoint=String(p.getProperty('DMI_MOCK_ASSESSMENT_ENDPOINT')||''),host=String(p.getProperty('DMI_MOCK_ASSESSMENT_HOST')||'');
 const match=/^https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/[A-Za-z0-9/_-]*)$/.exec(endpoint);
 const token=String(p.getProperty('DMI_MOCK_ASSESSMENT_TOKEN')||''),provider=String(p.getProperty('DMI_MOCK_ASSESSMENT_PROVIDER')||''),version=String(p.getProperty('DMI_MOCK_ASSESSMENT_VERSION')||'');
 if(!match||match[1]!==host||/^(?:[0-9.]+)$/.test(host)||/(?:^|\.)(?:localhost|local|internal)$/.test(host)||
 token.length<32||token.length>4096||/[\r\n]/.test(token)||!provider.trim()||provider.length>100||!version.trim()||version.length>100)
 securityError_('ASSESSMENT_NOT_READY','The private audio service needs owner setup');
 return{endpoint,token,provider,version};
}
function mockSpeakingQuality_(decoded,expected){
 const fail=()=>securityError_('ASSESSMENT_INVALID','Decoded audio metadata needs owner review');
 if(!Array.isArray(decoded)||decoded.length!==3)fail();
 const seen={},recordings=[],issues=[];
 decoded.forEach(d=>{
  if(!d||![1,2,3].includes(d.part)||seen[d.part])fail();seen[d.part]=true;
  const e=expected.find(r=>r.part===d.part);
  if(!e||d.receiptID!==e.receiptID||d.audioSHA256!==e.audioSHA256||d.decodingVerified!==true||
   d.speechDetectionVerified!==true||!Number.isFinite(d.decodedSeconds)||d.decodedSeconds<1||
   d.decodedSeconds>(d.part===2?125:360)||!Number.isFinite(d.speechSeconds)||d.speechSeconds<0||
   d.speechSeconds>d.decodedSeconds||!Number.isFinite(d.silenceRatio)||d.silenceRatio<0||d.silenceRatio>1||
   !Number.isFinite(d.clippingRatio)||d.clippingRatio<0||d.clippingRatio>1)fail();
  if(Math.abs(d.decodedSeconds-e.reportedSeconds)>5)issues.push({part:d.part,code:'DURATION_MISMATCH'});
  if(d.speechSeconds<(d.part===2?10:5)||d.silenceRatio>=0.95)issues.push({part:d.part,code:'INSUFFICIENT_SPEECH'});
  if(d.clippingRatio>=0.1)issues.push({part:d.part,code:'CLIPPING'});
  recordings.push({part:d.part,attemptID:e.attemptID,receiptID:e.receiptID,audioSHA256:e.audioSHA256,decodedSeconds:d.decodedSeconds,decodingVerified:true});
 });
 return{recordings,issues};
}
function previewMockSpeakingAssessment(attemptID){
 const owner=email_(Session.getEffectiveUser().getEmail()),active=email_(Session.getActiveUser().getEmail());
 if(!owner||active!==owner)securityError_('FORBIDDEN','Only the deployment owner can pilot audio assessment');
 const config=mockSpeakingAssessmentConfig_(),p={attemptID:String(attemptID||'')},ctx={user:{role:'teacher',email:owner,name:'Owner'}};
 const a=mockReviewAttempt_(p,ctx),plan=mockSpeakingPlan_(a);
 const receipts=rows(mockSheet_('MockSpeakingUploads',DMI_SPEAKING_HEADERS)).filter(r=>r.AttemptID===a.AttemptID);
 if(receipts.length!==3||[1,2,3].some(part=>receipts.filter(r=>Number(r.Part)===part).length!==1))
 securityError_('ASSESSMENT_NOT_READY','Three acknowledged recordings are required');
 const expected=[],recordings=[1,2,3].map(part=>{
  const r=receipts.find(r=>Number(r.Part)===part),audio=getMockSpeakingRecording_({...p,part,receiptID:r.ReceiptID},ctx).recording;
  const bytes=Utilities.base64Decode(audio.audioBase64);
  const hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  expected.push({part,attemptID:a.AttemptID,receiptID:r.ReceiptID,audioSHA256:hash,reportedSeconds:Number(r.DurationSeconds)});
  return{part,receiptID:r.ReceiptID,audioSHA256:hash,mime:audio.mime,audioBase64:audio.audioBase64};
 });
 const requestID=digest_(JSON.stringify([a.AttemptID,a.PaperDigest,config.provider,config.version,expected.map(r=>[r.part,r.receiptID,r.audioSHA256])]));
 const body={schemaVersion:1,requestID,attemptID:a.AttemptID,provider:config.provider,modelVersion:config.version,
  speakingPlan:plan.stages,recordings};
 let response;
 try{response=UrlFetchApp.fetch(config.endpoint,{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+config.token,'Idempotency-Key':requestID},
  payload:JSON.stringify(body),followRedirects:false,muteHttpExceptions:true});}
 catch(e){securityError_('ASSESSMENT_SERVICE_ERROR','The audio service is unavailable. No score was released.');}
 if(response.getResponseCode()!==200)securityError_('ASSESSMENT_SERVICE_ERROR','The audio service did not complete the request. No score was released.');
 const raw=response.getContentText();if(raw.length>262144)securityError_('ASSESSMENT_INVALID','The audio response exceeds its limit');
 let data;try{data=JSON.parse(raw);}catch(e){securityError_('ASSESSMENT_INVALID','The audio service returned an invalid response');}
 if(!data||data.requestID!==requestID)securityError_('ASSESSMENT_INVALID','Audio response identity does not match');
 const quality=mockSpeakingQuality_(data.decoded,expected);
 if(quality.issues.length)return{ok:true,status:'needs_teacher_review',qualityIssues:quality.issues,assessment:null,releaseApproved:false};
 if(!data.assessment||data.assessment.provider!==config.provider||data.assessment.modelVersion!==config.version)
 securityError_('ASSESSMENT_INVALID','Assessment model identity does not match');
 return{ok:true,status:'draft',qualityIssues:[],assessment:validateMockSpeakingAssessment_(data.assessment,quality.recordings),releaseApproved:false};
}
