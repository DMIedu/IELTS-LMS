/** Disabled Speaking capture/upload draft. No provider call, bands or result writes. */
const DMI_SPEAKING_HEADERS=['ReceiptID','AttemptID','Part','RequestID','Digest','Bytes','Mime','DurationSeconds','FileID','UploadedAt','RecordingID'];
function initializeMockSpeaking(){
 secret_();const lock=LockService.getScriptLock();if(!lock.tryLock(20000))securityError_('BUSY','Please retry shortly');
 try{const book=ss();if(!book.getSheetByName('MockSpeakingUploads'))book.insertSheet('MockSpeakingUploads').appendRow(DMI_SPEAKING_HEADERS);
 const uploads=book.getSheetByName('MockSpeakingUploads'),head=uploads.getDataRange().getValues()[0].map(headerName_);
 if(!head.includes('RecordingID'))uploads.getRange(1,head.length+1).setValue('RecordingID');
 mockSheet_('MockSpeakingUploads',DMI_SPEAKING_HEADERS);
 if(!book.getSheetByName('MockSpeakingReviews'))book.insertSheet('MockSpeakingReviews').appendRow(DMI_SPEAKING_REVIEW_HEADERS);
 const reviewSheet=book.getSheetByName('MockSpeakingReviews'),reviewHead=reviewSheet.getDataRange().getValues()[0].map(headerName_);
 if(!reviewHead.includes('FeedbackDigest'))reviewSheet.getRange(1,reviewHead.length+1).setValue('FeedbackDigest');
 mockSheet_('MockSpeakingReviews',DMI_SPEAKING_REVIEW_HEADERS);
 Logger.log('Speaking upload storage ready. Capture remains disabled; no recordings or results changed.');}finally{lock.releaseLock();}
}
function mockSpeakingFolder_(){
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('DMI_MOCK_SPEAKING_ENABLED')!=='true')securityError_('MOCK_NOT_READY','Speaking capture is still being prepared');
 const id=String(props.getProperty('DMI_MOCK_SPEAKING_FOLDER_ID')||'');if(!/^[A-Za-z0-9_-]{10,100}$/.test(id))securityError_('MOCK_NOT_READY','Private Speaking storage needs setup');
 const folder=DriveApp.getFolderById(id);mockSpeakingPrivate_(folder);return folder;
}
function mockSpeakingPrivate_(item){
 const owner=email_(Session.getEffectiveUser().getEmail());
 if(!owner||!item.getOwner()||email_(item.getOwner().getEmail())!==owner||
 item.getSharingAccess()!==DriveApp.Access.PRIVATE||item.getViewers().length||
 item.getEditors().some(u=>email_(u.getEmail())!==owner))
 securityError_('MOCK_NOT_READY','Speaking storage must be private to the deployment owner');
 let permissions;
 try{
  const response=UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(item.getId())+'/permissions?fields=permissions(type,role,emailAddress),nextPageToken&supportsAllDrives=true',
   {headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw new Error('Permission lookup failed');
  permissions=JSON.parse(response.getContentText());
 }catch(e){securityError_('MOCK_NOT_READY','Private Speaking permissions need verification');}
 const list=permissions.permissions;
 if(permissions.nextPageToken||!Array.isArray(list)||list.length!==1||list[0].type!=='user'||list[0].role!=='owner'||email_(list[0].emailAddress)!==owner)
 securityError_('MOCK_NOT_READY','Speaking storage must have only its owner permission');
}
function mockSpeakingAccess_(p,ctx){
 const a=mockAttemptAccess_(p,ctx),state=mockReconcileAttempt_(a);
 if(!state.sections.every(s=>s.closed)||Date.now()<mockDeadlines_(a)[2])securityError_('MOCK_SPEAKING_NOT_READY','Finish the written test before Speaking capture');
 return a;
}
function mockSpeakingReceipt_(r){return {id:r.ReceiptID,part:Number(r.Part),bytes:Number(r.Bytes),durationSeconds:Number(r.DurationSeconds),uploadedAt:new Date(r.UploadedAt).toISOString(),assessment:'pending'};}
function myMockSpeakingUploads_(p,ctx){
 const a=mockSpeakingAccess_(p,ctx);mockSpeakingFolder_();
 return {ok:true,receipts:rows(mockSheet_('MockSpeakingUploads',DMI_SPEAKING_HEADERS)).filter(r=>r.AttemptID===a.AttemptID).map(mockSpeakingReceipt_),assessment:'pending'};
}
function uploadMockSpeaking_(p,ctx){
 const a=mockSpeakingAccess_(p,ctx),folder=mockSpeakingFolder_(),part=Number(p.part),requestID=mockRequestID_(p.requestID),duration=Number(p.durationSeconds);
 if(![1,2,3].includes(part)||!Number.isFinite(duration)||duration<1||duration>(part===2?125:360))securityError_('VALIDATION','Choose a valid recorded Speaking part');
 const mime=String(p.mime||'');if(!['audio/webm','audio/webm;codecs=opus','audio/ogg','audio/ogg;codecs=opus','audio/mp4'].includes(mime))securityError_('VALIDATION','Unsupported audio format');
 const raw=String(p.audioBase64||'');
 if(raw.length<32||raw.length>5600000||raw.length%4||! /^[A-Za-z0-9+/]+={0,2}$/.test(raw))securityError_('VALIDATION','Invalid recording data');
 let bytes;try{bytes=Utilities.base64Decode(raw);}catch(e){securityError_('VALIDATION','Invalid recording data');}
 if(bytes.length<64||bytes.length>4194304)securityError_('VALIDATION','Recording must be at most 4 MB');
 const u=bytes.map(v=>(v+256)%256),webm=u[0]===26&&u[1]===69&&u[2]===223&&u[3]===163,
 ogg=u.slice(0,4).join(',')==='79,103,103,83',mp4=u.slice(4,8).join(',')==='102,116,121,112';
 if(!(mime.startsWith('audio/webm')&&webm||mime.startsWith('audio/ogg')&&ogg||mime==='audio/mp4'&&mp4))securityError_('VALIDATION','Recording container does not match its format');
 const hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
 const fingerprint=digest_(JSON.stringify([a.AttemptID,part,requestID,hash,mime,duration,String(p.recordingID||'')]));
 const sheet=mockSheet_('MockSpeakingUploads',DMI_SPEAKING_HEADERS),records=rows(sheet),same=records.find(r=>r.RequestID===requestID);
 if(same){if(same.AttemptID!==a.AttemptID||Number(same.Part)!==part||same.Digest!==fingerprint)securityError_('VALIDATION','Upload identity already used');
 return {ok:true,receipt:mockSpeakingReceipt_(same),recovered:true,assessment:'pending'};}
 if(records.some(r=>r.AttemptID===a.AttemptID&&Number(r.Part)===part))securityError_('MOCK_RECORDING_EXISTS','This part already has an acknowledged recording');
 const done=records.filter(r=>r.AttemptID===a.AttemptID).map(r=>Number(r.Part)).sort();
 if(done.some((v,i)=>v!==i+1))securityError_('MOCK_SETUP_REQUIRED','Speaking receipts need owner review');
 if(part!==done.length+1)securityError_('MOCK_SECTION_ORDER','Upload Speaking parts in order');
 const name='mock-speaking-'+digest_(a.AttemptID+'|'+part).slice(0,32),found=folder.getFilesByName(name);let file;
 if(found.hasNext()){file=found.next();if(found.hasNext()||file.getDescription()!==fingerprint)securityError_('MOCK_UPLOAD_CONFLICT','An interrupted upload needs owner review');mockSpeakingPrivate_(file);mockSpeakingTimedUpload_(a,p,true);}
 else{mockSpeakingTimedUpload_(a,p,false);file=folder.createFile(Utilities.newBlob(bytes,mime,name));mockSpeakingPrivate_(file);file.setDescription(fingerprint);}
 const r={ReceiptID:'AUDIO-'+opaque_().slice(0,24),AttemptID:a.AttemptID,Part:part,RequestID:requestID,Digest:fingerprint,Bytes:bytes.length,Mime:mime,DurationSeconds:duration,FileID:file.getId(),UploadedAt:new Date(),RecordingID:String(p.recordingID||'')};
 const head=sheet.getDataRange().getValues()[0].map(headerName_);sheet.appendRow(head.map(k=>r[k]));
 return {ok:true,receipt:mockSpeakingReceipt_(r),assessment:'pending'};
}
function listMockSpeakingUploads_(p,ctx){
 const a=mockReviewAttempt_(p,ctx);mockSpeakingFolder_();
 return {ok:true,receipts:rows(mockSheet_('MockSpeakingUploads',DMI_SPEAKING_HEADERS)).filter(r=>r.AttemptID===a.AttemptID).map(mockSpeakingReceipt_),assessment:'pending'};
}

/** Teacher-only private audio and append-only notes. No band scoring or public links. */
const DMI_SPEAKING_REVIEW_HEADERS=['ReviewID','AttemptID','Part','ReceiptID','Feedback','TeacherEmail','TeacherName','ReviewedAt','RequestID','BaseRevision','FeedbackDigest'];
function mockSpeakingUploadForReview_(a,p){
 const part=Number(p.part),id=String(p.receiptID||'');
 if(![1,2,3].includes(part))securityError_('VALIDATION','Choose a Speaking part');
 const matches=rows(mockSheet_('MockSpeakingUploads',DMI_SPEAKING_HEADERS)).filter(r=>r.AttemptID===a.AttemptID&&Number(r.Part)===part&&r.ReceiptID===id);
 if(matches.length!==1)securityError_('NOT_FOUND','Recording receipt not found for this attempt');
 return matches[0];
}
function mockSpeakingReviewPublic_(r){return{id:r.ReviewID,part:Number(r.Part),receiptID:r.ReceiptID,feedback:String(r.Feedback||''),teacherName:r.TeacherName,reviewedAt:new Date(r.ReviewedAt).toISOString(),revision:Number(r.BaseRevision)+1};}
function getMockSpeakingReview_(p,ctx){
 const a=mockReviewAttempt_(p,ctx);mockSpeakingFolder_();
 const uploads=rows(mockSheet_('MockSpeakingUploads',DMI_SPEAKING_HEADERS)).filter(r=>r.AttemptID===a.AttemptID);
 const history=rows(mockSheet_('MockSpeakingReviews',DMI_SPEAKING_REVIEW_HEADERS)).filter(r=>r.AttemptID===a.AttemptID);
 return {ok:true,review:{attemptID:a.AttemptID,studentID:a.StudentID,studentEmail:a.StudentEmail,assessment:'pending',
 parts:[1,2,3].map(part=>{const receipt=uploads.find(r=>Number(r.Part)===part),notes=history.filter(r=>Number(r.Part)===part);
 return{part,receipt:receipt?mockSpeakingReceipt_(receipt):null,revision:notes.length,history:notes.map(mockSpeakingReviewPublic_)};})}};
}
function getMockSpeakingRecording_(p,ctx){
 const a=mockReviewAttempt_(p,ctx),r=mockSpeakingUploadForReview_(a,p),folder=mockSpeakingFolder_();
 const found=folder.getFilesByName('mock-speaking-'+digest_(a.AttemptID+'|'+Number(r.Part)).slice(0,32));
 if(!found.hasNext())securityError_('NOT_FOUND','Private recording unavailable');
 const file=found.next();if(found.hasNext()||file.getId()!==r.FileID||file.getDescription()!==r.Digest)
 securityError_('MOCK_UPLOAD_CONFLICT','Recording identity needs owner review');
 mockSpeakingPrivate_(file);const bytes=file.getBlob().getBytes();
 if(bytes.length!==Number(r.Bytes)||bytes.length<64||bytes.length>4194304)securityError_('MOCK_UPLOAD_CONFLICT','Recording integrity needs owner review');
 const hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
 const base=[a.AttemptID,Number(r.Part),r.RequestID,hash,r.Mime,Number(r.DurationSeconds)];
 let identities=[String(r.RecordingID||'')];
 if(!r.RecordingID){const s=mockAttemptState_(a).speaking;if(s&&s.recordingIDs&&s.recordingIDs[r.Part])identities.push(s.recordingIDs[r.Part]);}
 const valid=identities.some(id=>equal_(digest_(JSON.stringify(base.concat([id]))),r.Digest))||
 (!r.RecordingID&&equal_(digest_(JSON.stringify(base)),r.Digest));
 if(!valid)securityError_('MOCK_UPLOAD_CONFLICT','Recording bytes changed; ask the owner to review');
 if(!['audio/webm','audio/webm;codecs=opus','audio/ogg','audio/ogg;codecs=opus','audio/mp4'].includes(r.Mime))securityError_('MOCK_UPLOAD_CONFLICT','Unsupported recording format');
 return{ok:true,recording:{receiptID:r.ReceiptID,part:Number(r.Part),mime:r.Mime,audioBase64:Utilities.base64Encode(bytes),assessment:'pending'}};
}
function saveMockSpeakingReview_(p,ctx){
 const a=mockReviewAttempt_(p,ctx),receipt=mockSpeakingUploadForReview_(a,p);mockSpeakingFolder_();
 const part=Number(p.part),requestID=mockRequestID_(p.requestID),feedback=String(p.feedback||'').trim(),revision=Number(p.revision);
 if(!feedback||feedback.length>5000||!Number.isInteger(revision)||revision<0)securityError_('VALIDATION','Enter a review note of up to 5000 characters');
 const sheet=mockSheet_('MockSpeakingReviews',DMI_SPEAKING_REVIEW_HEADERS),all=rows(sheet),prior=all.find(r=>r.TeacherEmail===email_(ctx.user.email)&&r.RequestID===requestID);
 if(prior){
  if(prior.AttemptID!==a.AttemptID||Number(prior.Part)!==part||prior.ReceiptID!==receipt.ReceiptID||!(prior.FeedbackDigest?equal_(prior.FeedbackDigest,digest_(feedback)):[feedback,sheetText_(feedback)].includes(prior.Feedback))||Number(prior.BaseRevision)!==revision)
  securityError_('VALIDATION','Review request identity already used');
  return{ok:true,saved:mockSpeakingReviewPublic_(prior),recovered:true,assessment:'pending'};
 }
 const history=all.filter(r=>r.AttemptID===a.AttemptID&&Number(r.Part)===part);
 if(revision!==history.length)securityError_('MOCK_REVIEW_CONFLICT','A newer Speaking note exists. Reload before saving.');
 const r={ReviewID:'SPEAK-REVIEW-'+opaque_().slice(0,24),AttemptID:a.AttemptID,Part:part,ReceiptID:receipt.ReceiptID,
 Feedback:sheetText_(feedback),TeacherEmail:email_(ctx.user.email),TeacherName:sheetText_(ctx.user.name),ReviewedAt:new Date(),RequestID:requestID,BaseRevision:revision,FeedbackDigest:digest_(feedback)};
 const head=sheet.getDataRange().getValues()[0].map(headerName_);sheet.appendRow(head.map(k=>r[k]));
 return{ok:true,saved:mockSpeakingReviewPublic_(r),assessment:'pending'};
}
