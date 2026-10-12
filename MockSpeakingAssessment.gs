/** Provider-neutral response validation only. No AI call, scoring or result release. */
const DMI_SPEAKING_CRITERIA=['fluencyCoherence','lexicalResource','grammar','pronunciation'];
function validateMockSpeakingAssessment_(report,recordings){
 const fail=()=>securityError_('ASSESSMENT_INVALID','Audio assessment needs teacher review');
 if(!report||report.schemaVersion!==1||report.status!=='draft'||report.audioEvaluated!==true||
 typeof report.provider!=='string'||!report.provider.trim()||report.provider.length>100||
 typeof report.modelVersion!=='string'||!report.modelVersion.trim()||report.modelVersion.length>100||
 typeof report.attemptID!=='string'||!report.attemptID||!Array.isArray(recordings)||recordings.length!==3||
 !Array.isArray(report.recordings)||report.recordings.length!==3)fail();
 const byPart={};recordings.forEach(r=>{
  if(!r||![1,2,3].includes(r.part)||byPart[r.part]||r.attemptID!==report.attemptID||
   typeof r.receiptID!=='string'||!r.receiptID||! /^[a-f0-9]{64}$/.test(r.audioSHA256)||
   !Number.isFinite(r.decodedSeconds)||r.decodedSeconds<1||r.decodedSeconds>(r.part===2?125:360)||
   r.decodingVerified!==true)fail();byPart[r.part]=r;
 });
 const seen={};report.recordings.forEach(r=>{
  if(!r||![1,2,3].includes(r.part)||!byPart[r.part]||seen[r.part])fail();seen[r.part]=true;
  const expected=byPart[r.part];
  if(r.receiptID!==expected.receiptID||r.audioSHA256!==expected.audioSHA256||
   r.decodedSeconds!==expected.decodedSeconds)fail();
 });
 if(!report.criteria||typeof report.criteria!=='object'||
 Object.keys(report.criteria).sort().join('|')!==DMI_SPEAKING_CRITERIA.slice().sort().join('|'))fail();
 const criteria={};
 DMI_SPEAKING_CRITERIA.forEach(key=>{
  const c=report.criteria[key];
  if(!c||!Number.isInteger(c.band)||c.band<1||c.band>9||typeof c.feedback!=='string'||
   !c.feedback.trim()||c.feedback.length>3000||!Array.isArray(c.evidence)||c.evidence.length<3||c.evidence.length>24)fail();
  const parts={};
  const evidence=c.evidence.map(e=>{
   if(!e||!byPart[e.part]||e.source!=='audio'||!Number.isFinite(e.startSeconds)||!Number.isFinite(e.endSeconds)||
    e.startSeconds<0||e.endSeconds<=e.startSeconds||e.endSeconds>byPart[e.part].decodedSeconds||
    typeof e.observation!=='string'||!e.observation.trim()||e.observation.length>1000)fail();
   parts[e.part]=true;
   return{part:e.part,source:'audio',startSeconds:e.startSeconds,endSeconds:e.endSeconds,observation:e.observation.trim()};
  });
  if(Object.keys(parts).length!==3)fail();
  criteria[key]={band:c.band,feedback:c.feedback.trim(),evidence};
 });
 // Caller must supply server-verified decoded recording identities, not candidate claims.
 // Provider audioEvaluated/evidence claims require independent calibration; this validates shape/binding only.
 return{schemaVersion:1,attemptID:report.attemptID,status:'draft',provider:report.provider.trim(),
  modelVersion:report.modelVersion.trim(),criteria,teacherReviewRequired:true,releaseApproved:false};
}
