/** Owner-only retention dry run. No deletion, scheduling, provider call or result writes. */
function previewMockSpeakingRetention(days){
 const owner=email_(Session.getEffectiveUser().getEmail()),active=email_(Session.getActiveUser().getEmail());
 if(!owner||!active||active!==owner)securityError_('FORBIDDEN','Only the deployment owner can preview retention');
 if(typeof days!=='number'||!Number.isInteger(days)||days<7||days>365)securityError_('VALIDATION','Choose an explicit retention period from 7 to 365 days');
 const folder=mockSpeakingFolder_(),now=Date.now(),cutoff=now-days*86400000;
 const uploads=rows(mockSheet_('MockSpeakingUploads',DMI_SPEAKING_HEADERS));
 const notes=rows(mockSheet_('MockSpeakingReviews',DMI_SPEAKING_REVIEW_HEADERS));
 const candidates=[],held=[];const receiptCounts={},fileCounts={},partCounts={};
 uploads.forEach(r=>{
  const partKey=String(r.AttemptID)+'|'+String(r.Part);
  receiptCounts[r.ReceiptID]=(receiptCounts[r.ReceiptID]||0)+1;
  fileCounts[r.FileID]=(fileCounts[r.FileID]||0)+1;
  partCounts[partKey]=(partCounts[partKey]||0)+1;
 });
 uploads.forEach(r=>{
  const at=new Date(r.UploadedAt).getTime(),part=Number(r.Part);
  const item={receiptID:String(r.ReceiptID||''),attemptID:String(r.AttemptID||''),part};
  if(!r.ReceiptID||!r.AttemptID||!r.FileID||![1,2,3].includes(part)||!Number.isFinite(at)||at>now){
   held.push({...item,reason:'INVALID_METADATA'});return;
  }
  if(receiptCounts[r.ReceiptID]!==1||fileCounts[r.FileID]!==1||partCounts[String(r.AttemptID)+'|'+String(r.Part)]!==1){
   held.push({...item,reason:'DUPLICATE_IDENTITY'});return;
  }
  if(at>cutoff)return;
  const found=folder.getFilesByName('mock-speaking-'+digest_(r.AttemptID+'|'+part).slice(0,32));
  if(!found.hasNext()){held.push({...item,reason:'FILE_UNAVAILABLE'});return;}
  const file=found.next();
  if(found.hasNext()||file.getId()!==r.FileID||file.getDescription()!==r.Digest){held.push({...item,reason:'FILE_IDENTITY_CONFLICT'});return;}
  // Permission uncertainty fails the entire preview closed; never reads audio bytes.
  mockSpeakingPrivate_(file);
  const reviews=notes.filter(n=>n.AttemptID===r.AttemptID&&Number(n.Part)===part&&n.ReceiptID===r.ReceiptID);
  candidates.push({...item,uploadedAt:new Date(at).toISOString(),reviewCount:reviews.length,
   holdForAssessment:reviews.length===0,deletionApproved:false});
 });
 return{ok:true,dryRun:true,retentionDays:days,asOf:new Date(now).toISOString(),cutoff:new Date(cutoff).toISOString(),
  candidates,held,deletionEnabled:false,assessment:'pending'};
}
