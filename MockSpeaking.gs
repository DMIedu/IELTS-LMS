/** Disabled Speaking capture/upload draft. No provider call, bands or result writes. */
const DMI_SPEAKING_HEADERS=['ReceiptID','AttemptID','Part','RequestID','Digest','Bytes','Mime','DurationSeconds','FileID','UploadedAt'];
function initializeMockSpeaking(){
 secret_();const lock=LockService.getScriptLock();if(!lock.tryLock(20000))securityError_('BUSY','Please retry shortly');
 try{const book=ss();if(!book.getSheetByName('MockSpeakingUploads'))book.insertSheet('MockSpeakingUploads').appendRow(DMI_SPEAKING_HEADERS);mockSheet_('MockSpeakingUploads',DMI_SPEAKING_HEADERS);
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
 const fingerprint=digest_(JSON.stringify([a.AttemptID,part,requestID,hash,mime,duration]));
 const sheet=mockSheet_('MockSpeakingUploads',DMI_SPEAKING_HEADERS),records=rows(sheet),same=records.find(r=>r.RequestID===requestID);
 if(same){if(same.AttemptID!==a.AttemptID||Number(same.Part)!==part||same.Digest!==fingerprint)securityError_('VALIDATION','Upload identity already used');
 return {ok:true,receipt:mockSpeakingReceipt_(same),recovered:true,assessment:'pending'};}
 if(records.some(r=>r.AttemptID===a.AttemptID&&Number(r.Part)===part))securityError_('MOCK_RECORDING_EXISTS','This part already has an acknowledged recording');
 const name='mock-speaking-'+digest_(a.AttemptID+'|'+part).slice(0,32),found=folder.getFilesByName(name);let file;
 if(found.hasNext()){file=found.next();if(found.hasNext()||file.getDescription()!==fingerprint)securityError_('MOCK_UPLOAD_CONFLICT','An interrupted upload needs owner review');mockSpeakingPrivate_(file);}
 else{file=folder.createFile(Utilities.newBlob(bytes,mime,name));mockSpeakingPrivate_(file);file.setDescription(fingerprint);}
 const r={ReceiptID:'AUDIO-'+opaque_().slice(0,24),AttemptID:a.AttemptID,Part:part,RequestID:requestID,Digest:fingerprint,Bytes:bytes.length,Mime:mime,DurationSeconds:duration,FileID:file.getId(),UploadedAt:new Date()};
 const head=sheet.getDataRange().getValues()[0].map(headerName_);sheet.appendRow(head.map(k=>r[k]));
 return {ok:true,receipt:mockSpeakingReceipt_(r),assessment:'pending'};
}
function listMockSpeakingUploads_(p,ctx){
 const a=mockReviewAttempt_(p,ctx);mockSpeakingFolder_();
 return {ok:true,receipts:rows(mockSheet_('MockSpeakingUploads',DMI_SPEAKING_HEADERS)).filter(r=>r.AttemptID===a.AttemptID).map(mockSpeakingReceipt_),assessment:'pending'};
}
