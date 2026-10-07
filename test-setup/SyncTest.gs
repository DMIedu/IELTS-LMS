/**
 * Owner/editor-only sync round-trip for the exact security TEST workbook.
 * Reads private snapshot only in memory, never prints it. Creates a temporary
 * backup tab before writing and restores values/formulas in finally.
 * If interrupted before restoration, backup tab remains; report the log.
 */
function runTestSyncRoundTrip() {
  const props=PropertiesService.getScriptProperties();
  const testId='1E1v8jEkNMOjgAeKH8ubzV6Peh77535Sj8YpZYxRMwnQ';
  if(props.getProperty('DMI_TEST_MODE')!=='true' ||
     props.getProperty('DMI_SPREADSHEET_ID')!==testId || SHEET_ID!==testId)
    throw new Error('TEST ONLY: wrong workbook');
  secret_();
  const book=ss();
  if(book.getId()!==testId)throw new Error('TEST ONLY: workbook mismatch');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw new Error('Test database busy; retry later');
  let backup=null, failure=null, passed=0;
  try {
    if(book.getSheets().some(s=>/^SECURITY_SYNC_BACKUP_/.test(s.getName())))
      throw new Error('Previous sync backup exists. Stop and report this message; do not rerun.');
    const sheet=tab('LMSSync');
    const original=readLiveLMSData_(); // Fail before writing if old data is corrupt.
    const range=sheet.getDataRange(),values=range.getValues(),formulas=range.getFormulas();
    const rowCount=values.length,colCount=values[0].length;
    const canonical=(v,f)=>v.map((r,i)=>r.map((x,j)=>(f[i]&&f[i][j])||x));
    const restoredValues=canonical(values,formulas);
    const before=JSON.stringify(restoredValues);
    const id=Utilities.getUuid().replace(/-/g,'');
    const key='lms_announce_securityTest_'+id;
    if(Object.prototype.hasOwnProperty.call(original,key))throw new Error('Test key collision');
    // Durable fallback if execution is stopped or times out before finally.
    backup=sheet.copyTo(book);
    backup.setName('SECURITY_SYNC_BACKUP_'+id.slice(0,20));
    SpreadsheetApp.flush();
    function check(label,condition) {
      if(!condition)throw new Error('FAIL: '+label);
      passed++;Logger.log('PASS: '+label);
    }
    try {
      const patch={};patch[key]=JSON.stringify([{id:id,text:'Temporary security sync check'}]);
      check('test content write accepted',secureSetLMSData_({payload:JSON.stringify(patch)}).ok);
      const updated=readLiveLMSData_();
      check('written content reads back',updated[key]===patch[key]);
      check('existing content and private keys preserved',
        Object.keys(original).every(k=>JSON.stringify(original[k])===JSON.stringify(updated[k])) &&
        Object.keys(updated).length===Object.keys(original).length+1);
      const published=secureGetLMSData_({role:'student',user:{}}).data;
      check('sync response contains published keys only',Object.keys(published).every(sharedSyncKey_));
      check('temporary announcement is available',published[key]===patch[key]);
    } catch(e) {failure=e;}
    finally {
      // Restore the original table without replacing/deleting its sheet ID.
      const currentRows=sheet.getLastRow(),currentCols=sheet.getLastColumn();
      sheet.getRange(1,1,rowCount,colCount).setValues(restoredValues);
      if(currentRows>rowCount)
        sheet.getRange(rowCount+1,1,currentRows-rowCount,Math.max(colCount,currentCols)).clearContent();
      if(currentCols>colCount)
        sheet.getRange(1,colCount+1,Math.max(rowCount,currentRows),currentCols-colCount).clearContent();
      SpreadsheetApp.flush();
      const finalRange=sheet.getDataRange();
      const after=JSON.stringify(canonical(finalRange.getValues(),finalRange.getFormulas()));
      if(after!==before)throw new Error('Restore verification failed. Backup tab retained; stop and report the log.');
      check('original sync table values and formulas restored',true);
      check('temporary announcement removed',!Object.prototype.hasOwnProperty.call(readLiveLMSData_(),key));
      book.deleteSheet(backup);backup=null;
      Logger.log('PASS: original sync data restored; temporary backup tab removed.');
    }
    if(failure)throw failure;
    Logger.log('PASS: '+passed+' sync checks completed in the TEST workbook. Production was not accessed.');
  } finally {
    if(backup)Logger.log('A SECURITY_SYNC_BACKUP_ tab remains for recovery. Stop and report the log.');
    if(lock.hasLock())lock.releaseLock();
  }
}
