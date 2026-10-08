/**
 * Editor-only integration checks for the disposable DMI LMS Security Test.
 * Requires the bundled test Code.gs and initialized security columns.
 * Refuses every workbook except the exact test copy. No deployment needed.
 * Creates temporary hashed accounts/results, removes them in finally.
 * Logs only check names/status; never passwords, tokens, original rows or sync data.
 */
function runTestWorkbookSecurityChecks() {
  const expectedBook='1E1v8jEkNMOjgAeKH8ubzV6Peh77535Sj8YpZYxRMwnQ';
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('DMI_TEST_MODE')!=='true' ||
     props.getProperty('DMI_SPREADSHEET_ID')!==expectedBook || SHEET_ID!==expectedBook)
    throw new Error('TEST ONLY: select the copied security-test workbook');
  secret_();
  const book=ss();
  if(book.getId()!==expectedBook)throw new Error('TEST ONLY: workbook mismatch');
  const names=['Teachers','Students','Sessions','Marks','ExamResults','LMSSync'];
  const before={};
  names.forEach(n=>{before[n]=tab(n).getLastRow();});
  // secureLogin prunes expired sessions; an empty test Sessions sheet prevents
  // touching any pre-existing sessions during this integration check.
  if(rows(tab('Sessions')).length)throw new Error('Test requires an empty Sessions tab; do not delete existing rows. Report this message.');
  ['Teachers','Students'].forEach(n=>{
    const h=tab(n).getDataRange().getValues()[0].map(headerName_);
    ['Email','Password','PasswordHash','PasswordSalt','PasswordIterations'].forEach(k=>{
      if(!h.includes(k))throw new Error('Run initializeSecurity in the test project first');
    });
  });
  const suffix=Utilities.getUuid().replace(/-/g,'');
  const teacherEmail='dmi-security-teacher-'+suffix+'@example.invalid';
  const studentEmail='dmi-security-student-'+suffix+'@example.invalid';
  if(account_('teacher',teacherEmail)||account_('student',studentEmail))
    throw new Error('Temporary account collision; retry');
  const password='DMI-test-'+opaque_(), newPassword='DMI-reset-'+opaque_();
  let passed=0, failure=null;
  function check(label,condition) {
    if(!condition)throw new Error('FAIL: '+label);
    passed++;Logger.log('PASS: '+label);
  }
  function request(action,p,post) {
    const event={parameter:Object.assign({action:action},p||{})};
    if(post!==false)event.postData={contents:'editor test'};
    return JSON.parse(handle(event).getContent());
  }
  function asUser(token,action,p) {
    return request(action,Object.assign({},p||{},{sessionToken:token}));
  }
  function removeTemporaryRows(name,column,emails) {
    const sheet=tab(name),data=sheet.getDataRange().getValues();
    const index=data[0].map(headerName_).indexOf(column);
    if(index<0)throw new Error('Cleanup column missing: '+name);
    for(let i=data.length-1;i>0;i--)
      if(emails.includes(email_(data[i][index])))sheet.deleteRow(i+1);
  }
  try {
    const teacherSheet=tab('Teachers'),head=teacherSheet.getDataRange().getValues()[0].map(headerName_);
    const teacherFields=Object.assign({
      ID:'DMI-SECURITY-TEST-'+suffix,Name:'Temporary security teacher',
      Email:teacherEmail,Subject:'IELTS',Status:'Active'
    },passwordFields_(password));
    teacherSheet.appendRow(head.map(k=>Object.prototype.hasOwnProperty.call(teacherFields,k)?teacherFields[k]:''));
    const teacher=request('login',{email:teacherEmail,password:password,role:'student'});
    check('teacher login and server role',teacher.ok && teacher.role==='teacher' && /^[a-f0-9]{64}$/.test(teacher.sessionToken||''));
    check('login profile excludes credentials',!JSON.stringify(teacher.user).match(/Password|sessionToken|PasswordSalt/i));
    const added=asUser(teacher.sessionToken,'addStudent',{
      name:'Temporary security student',email:studentEmail,password:password,class:'Security Test'
    });
    check('teacher creates hashed test student',added.ok);
    const record=account_('student',studentEmail);
    check('plaintext cleared and hash stored',record && !record.Password && !!record.PasswordHash && Number(record.PasswordIterations)===600000);
    const student=request('login',{email:studentEmail,password:password,role:'teacher'});
    check('student login ignores forged role',student.ok && student.role==='student');
    check('server session verifies',asUser(student.sessionToken,'session').ok);
    check('anonymous account listing denied',request('listStudents').code==='UNAUTHENTICATED');
    check('anonymous sync read denied',request('getLMSData').code==='UNAUTHENTICATED');
    check('anonymous sync write denied',request('setLMSData',{payload:'{}'}).code==='UNAUTHENTICATED');
    check('student teacher access denied',asUser(student.sessionToken,'listStudents',{role:'teacher'}).code==='FORBIDDEN');
    check('student sync write denied',asUser(student.sessionToken,'setLMSData',{payload:'{}'}).code==='FORBIDDEN');
    check('GET token rejected',request('session',{sessionToken:student.sessionToken},false).code==='POST_REQUIRED');
    check('forged token denied',request('session',{sessionToken:'f'.repeat(64)}).code==='UNAUTHENTICATED');
    check('other student results denied',asUser(student.sessionToken,'listMarks',{studentEmail:teacherEmail}).code==='FORBIDDEN');
    const sync=asUser(student.sessionToken,'getLMSData');
    check('sync read exposes published keys only',sync.ok && Object.keys(sync.data).every(sharedSyncKey_));
    const submission=asUser(student.sessionToken,'submitExamResult',{
      testName:'Temporary security check',studentName:'Forged Name',course:'Security Test',
      score:20,maxScore:40,answersJSON:'{}',questionsJSON:'[]'
    });
    check('own test result saved',submission.ok);
    const results=asUser(student.sessionToken,'listExamResults');
    check('result ownership and server identity',results.ok && results.data.length===1 &&
      results.data[0].StudentEmail===studentEmail &&
      results.data[0].StudentName==='Temporary security student');
    const expiry=record.ExpiryDate;
    setFields_(tab('Students'),studentEmail,{ExpiryDate:new Date(Date.now()-60000)});
    check('account expiry checked on session',asUser(student.sessionToken,'session').code==='ACCESS_EXPIRED');
    setFields_(tab('Students'),studentEmail,{ExpiryDate:expiry});
    check('teacher reset succeeds',asUser(teacher.sessionToken,'resetStudentPassword',{
      email:studentEmail,newPassword:newPassword
    }).ok);
    check('password reset revokes old session',asUser(student.sessionToken,'session').code==='UNAUTHENTICATED');
    check('old password rejected',!request('login',{email:studentEmail,password:password}).ok);
    const resetLogin=request('login',{email:studentEmail,password:newPassword});
    check('new password works',resetLogin.ok && resetLogin.role==='student');
    check('logout succeeds',asUser(resetLogin.sessionToken,'logout').ok);
    check('logged-out token rejected',asUser(resetLogin.sessionToken,'session').code==='UNAUTHENTICATED');
  } catch(e) {
    failure=e;
  } finally {
    // Attempt every cleanup even if one table fails. No copied existing account
    // or original result is selected by these generated email addresses.
    const cleanupErrors=[];
    [['Sessions','Email',[teacherEmail,studentEmail]],
     ['Marks','StudentEmail',[studentEmail]],
     ['ExamResults','StudentEmail',[studentEmail]],
     ['Students','Email',[studentEmail]],
     ['Teachers','Email',[teacherEmail]]].forEach(item=>{
      try{removeTemporaryRows(item[0],item[1],item[2]);}
      catch(e){cleanupErrors.push(item[0]);}
    });
    if(cleanupErrors.length)throw new Error('Cleanup incomplete for '+cleanupErrors.join(', ')+'. Stop and report the log.');
    const mismatches=names.filter(n=>tab(n).getLastRow()!==before[n]);
    if(mismatches.length)throw new Error('Row-count verification failed for '+mismatches.join(', ')+'. Stop and report the log.');
    Logger.log('PASS: temporary accounts, sessions and results removed; original row counts restored.');
  }
  if(failure)throw failure;
  Logger.log('PASS: '+passed+' security checks completed on the TEST workbook only. Production was not accessed.');
  Logger.log('Web-app/browser one-login, concurrent requests and sync write round-trip still require separate testing.');
}
