/**
 * TEST workbook only. Owner/editor functions, never HTTP routes.
 * Temporary browser-test passwords are private Script Properties, never logs.
 * Do not paste the properties into chat or deploy this helper to production.
 */
function browserTestBook_() {
  const p=PropertiesService.getScriptProperties();
  const id='1E1v8jEkNMOjgAeKH8ubzV6Peh77535Sj8YpZYxRMwnQ';
  if(p.getProperty('DMI_TEST_MODE')!=='true' ||
     p.getProperty('DMI_SPREADSHEET_ID')!==id || SHEET_ID!==id || ss().getId()!==id)
    throw new Error('Browser accounts require the exact Security Test workbook');
  secret_();return p;
}
function createBrowserTestAccounts() {
  const p=browserTestBook_(),lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw new Error('Test database busy; retry later');
  try {
    if(p.getProperty('DMI_BROWSER_TEST_TEACHER_EMAIL') || p.getProperty('DMI_BROWSER_TEST_STUDENT_EMAIL'))
      throw new Error('Browser test accounts already configured. View their private Script Properties, or run cleanupBrowserTestAccounts first.');
    const suffix=Utilities.getUuid().replace(/-/g,'');
    const teacherEmail='dmi-browser-teacher-'+suffix+'@example.invalid';
    const studentEmail='dmi-browser-student-'+suffix+'@example.invalid';
    if(account_('teacher',teacherEmail)||account_('student',studentEmail))throw new Error('Test account collision');
    // Store generated identifiers before writes so interrupted runs can be cleaned up.
    p.setProperty('DMI_BROWSER_TEST_TEACHER_EMAIL',teacherEmail);
    p.setProperty('DMI_BROWSER_TEST_STUDENT_EMAIL',studentEmail);
    const teacherPassword='DMI-test-'+opaque_(),studentPassword='DMI-test-'+opaque_();
    const sheet=tab('Teachers'),head=sheet.getDataRange().getValues()[0].map(headerName_);
    const fields=Object.assign({ID:'DMI-BROWSER-TEST-'+suffix,Name:'Browser Test Teacher',
      Email:teacherEmail,Subject:'IELTS',Status:'Active'},passwordFields_(teacherPassword));
    sheet.appendRow(head.map(k=>Object.prototype.hasOwnProperty.call(fields,k)?fields[k]:''));
    const result=createStudent_({name:'Browser Test Student',email:studentEmail,password:studentPassword,class:'Security Test'});
    if(!result.ok)throw new Error('Test student creation failed');
    setFields_(tab('Students'),studentEmail,{ExpiryDate:new Date(Date.now()+2*86400000)});
    p.setProperty('DMI_BROWSER_TEST_TEACHER_PASSWORD',teacherPassword);
    p.setProperty('DMI_BROWSER_TEST_STUDENT_PASSWORD',studentPassword);
    Logger.log('PASS: two temporary hashed browser-test accounts created in the TEST database.');
    Logger.log('View DMI_BROWSER_TEST_TEACHER_EMAIL / PASSWORD and DMI_BROWSER_TEST_STUDENT_EMAIL / PASSWORD in private Script Properties. Do not share these values.');
    Logger.log('After browser testing, run cleanupBrowserTestAccounts. No existing passwords were migrated.');
  } finally {if(lock.hasLock())lock.releaseLock();}
}
function cleanupBrowserTestAccounts() {
  const p=browserTestBook_(),lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw new Error('Test database busy; retry later');
  try {
    const teacher=p.getProperty('DMI_BROWSER_TEST_TEACHER_EMAIL');
    const student=p.getProperty('DMI_BROWSER_TEST_STUDENT_EMAIL');
    if(teacher && !/^dmi-browser-teacher-[a-zA-Z0-9]+@example\.invalid$/.test(teacher))throw new Error('Unexpected test teacher identifier');
    if(student && !/^dmi-browser-student-[a-zA-Z0-9]+@example\.invalid$/.test(student))throw new Error('Unexpected test student identifier');
    const emails=[teacher,student].filter(Boolean);
    [['Sessions','Email'],['Marks','StudentEmail'],['ExamResults','StudentEmail'],
      ['Teachers','Email'],['Students','Email']].forEach(pair=>{
      const sheet=tab(pair[0]),data=sheet.getDataRange().getValues();
      const index=data[0].map(headerName_).indexOf(pair[1]);
      if(index<0)throw new Error('Test cleanup column missing');
      for(let i=data.length-1;i>0;i--)if(emails.includes(email_(data[i][index])))sheet.deleteRow(i+1);
    });
    ['TEACHER_EMAIL','TEACHER_PASSWORD','STUDENT_EMAIL','STUDENT_PASSWORD']
      .forEach(k=>p.deleteProperty('DMI_BROWSER_TEST_'+k));
    Logger.log('PASS: browser-test accounts, their sessions/results and private test credentials removed.');
  } finally {if(lock.hasLock())lock.releaseLock();}
}
