const fs=require('node:fs');
const path=require('node:path');
async function runCourseTests(sources){
  function assert(condition,message){if(!condition)throw new Error(message);}
  let checks=0;function check(c,m){assert(c,m);checks++;}
  function errorCode(fn,code){let e;try{fn();}catch(x){e=x;}check(e && e.code===code,'Expected '+code);}
  const writes=[];
  class Sheet{
    constructor(name,data){this.name=name;this.data=data.map(r=>r.slice());}
    getDataRange(){return {getValues:()=>this.data.map(r=>r.slice())};}
    appendRow(r){writes.push(this.name);this.data.push(r.slice());return this;}
    getRange(row,col){return {setValue:value=>{writes.push(this.name);while(this.data.length<row)this.data.push([]);this.data[row-1][col-1]=value;}};}
    deleteRow(row){writes.push(this.name);this.data.splice(row-1,1);}
  }
  const future=new Date(Date.now()+86400000),past=new Date(1);
  const book=new Map([
    ['Courses',new Sheet('Courses',[['CourseID','Course','Lesson','VideoURL','PDFURL'],['L1','Existing course','Intro','','https://example.invalid/intro.pdf']])],
    ['Students',new Sheet('Students',[['ID','Email','Name','ExpiryDate','Status','PasswordHash'],['S1','a@example.invalid','Student A',future,'Active','hashA'],['S2','b@example.invalid','Student B',future,'Active','hashB'],['S3','expired@example.invalid','Expired',past,'Active','hashE']])],
    ['Teachers',new Sheet('Teachers',[['ID','Email','Name','PasswordHash'],['T1','teacher@example.invalid','Teacher','hashT']])],
    ['Sessions',new Sheet('Sessions',[['TokenHash','Email','Role','CredentialVersion','ExpiresAt']])],
    ['Marks',new Sheet('Marks',[['MarkID','StudentEmail']])]
  ]);
  const spreadsheet={getSheetByName:n=>book.get(n)||null,insertSheet:n=>{const s=new Sheet(n,[]);book.set(n,s);return s;}};
  const lock={tryLock:()=>true,hasLock:()=>true,releaseLock:()=>{}};
  const properties={getProperty:k=>k==='DMI_SPREADSHEET_ID'?'fictional-book':k==='DMI_SESSION_SECRET'?'fictional-secret'.repeat(6):null};
  const Utilities={DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},computeDigest:(alg,s)=>{
    // Deterministic test double, not a production cryptographic implementation.
    let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;
    return Array.from({length:32},(_,i)=>(n>>((i%4)*8)&255)^i);
  }};
  const ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})};
  const api=new Function('PropertiesService','SpreadsheetApp','LockService','Utilities','ContentService','Logger',
    sources.code+'\n'+sources.security+'\n'+sources.management+
    '\nreturn {initializeCourseManagement,courseRecords_,courseKey_,listCourseCatalogue_,saveCourseDetails_,setCourseEnrolment_,listCourseEnrolments_,digest_,credentialVersion_,handle,account_,deleteStudent};')(
    {getScriptProperties:()=>properties},{openById:()=>spreadsheet},{getScriptLock:()=>lock},Utilities,ContentService,{log:()=>{}});
  const teacher={role:'teacher',user:{email:'teacher@example.invalid'}},student={role:'student',user:{email:'a@example.invalid'}},other={role:'student',user:{email:'b@example.invalid'}};
  const legacy=api.courseKey_('Existing course'),before=JSON.stringify(Array.from(book,([n,s])=>[n,s.data]));
  check(api.listCourseCatalogue_(student).data[0].Lessons.length===1,'Legacy lessons remain available before setup');
  check(JSON.stringify(Array.from(book,([n,s])=>[n,s.data]))===before,'Reads do not create sheets');
  api.initializeCourseManagement();api.initializeCourseManagement();
  check(book.get('CourseDetails').data.length===1 && book.get('CourseEnrollments').data.length===1,'Setup idempotent');
  check(book.get('Courses').data.length===2 && book.get('Students').data.length===4,'Setup preserves original data');
  const fields={course:'New course',description:'Learning goals',instructor:'Teacher',duration:'8 weeks',syllabus:'Topic one\nTopic two',materialsURL:'https://example.invalid/materials',courseURL:'https://example.invalid/course',enrolmentRequired:'true'};
  const saved=api.saveCourseDetails_(fields,teacher),key=saved.courseKey;
  check(api.listCourseCatalogue_(student).data.length===1,'Unassigned restricted course hidden');
  check(api.listCourseCatalogue_(teacher).data.length===2,'Teacher sees all courses');
  check(api.handle({parameter:{action:'ping'}}).ok,'Ping remains available');
  check(api.handle({parameter:{action:'listCourseCatalogue'}}).code==='POST_REQUIRED','GET cannot read protected data');
  check(api.handle({parameter:{action:'listCourseCatalogue'},postData:{}}).code==='UNAUTHENTICATED','Unauthenticated POST blocked');
  const tokens={student:'a'.repeat(64),teacher:'b'.repeat(64)};
  function session(role,email,token){
    book.get('Sessions').appendRow([api.digest_(token),email,role,api.credentialVersion_(api.account_(role,email)),future]);
  }
  session('student',student.user.email,tokens.student);session('teacher',teacher.user.email,tokens.teacher);
  function request(action,p,role='student'){return api.handle({parameter:Object.assign({},p,{action,sessionToken:tokens[role]}),postData:{contents:'fictional'}});}
  check(request('saveCourseDetails',fields).code==='FORBIDDEN','Student cannot save course details');
  check(request('setCourseEnrollment',{courseKey:key,studentEmail:student.user.email,enrolled:'true'}).code==='FORBIDDEN','Student cannot self-enrol');
  check(request('listCourseEnrollments',{courseKey:key}).code==='FORBIDDEN','Student cannot read roster');
  check(request('setCourseEnrollment',{courseKey:key,studentEmail:student.user.email,enrolled:'true'},'teacher').ok,'Teacher can enrol');
  api.setCourseEnrolment_({courseKey:key,studentEmail:'A@EXAMPLE.INVALID',enrolled:'true'},teacher);
  check(book.get('CourseEnrollments').data.length===2,'Repeated enrolment is idempotent');
  check(api.listCourseCatalogue_(student).data.some(c=>c.CourseKey===key && c.Enrolled),'Assigned student sees course and enrolled state');
  check(!api.listCourseCatalogue_(other).data.some(c=>c.CourseKey===key),'Other student cannot see restricted course');
  check(!request('listCourseCatalogue',{studentEmail:student.user.email},'teacher').data.some(c=>Object.keys(c).includes('StudentEmail')),'Catalogue does not leak student emails');
  errorCode(()=>api.setCourseEnrolment_({courseKey:key,studentEmail:'expired@example.invalid',enrolled:'true'},teacher),'ACCESS_EXPIRED');
  errorCode(()=>api.setCourseEnrolment_({courseKey:key,studentEmail:'missing@example.invalid',enrolled:'true'},teacher),'NOT_FOUND');
  errorCode(()=>api.setCourseEnrolment_({courseKey:'missing',studentEmail:student.user.email,enrolled:'true'},teacher),'NOT_FOUND');
  errorCode(()=>api.saveCourseDetails_(Object.assign({},fields,{materialsURL:'javascript:alert(1)',courseKey:key}),teacher),'VALIDATION');
  errorCode(()=>api.saveCourseDetails_(Object.assign({},fields,{courseURL:'https://user:pass@example.invalid',courseKey:key}),teacher),'VALIDATION');
  errorCode(()=>api.saveCourseDetails_(Object.assign({},fields,{description:'x'.repeat(4001),courseKey:key}),teacher),'VALIDATION');
  errorCode(()=>api.saveCourseDetails_(Object.assign({},fields,{course:'=formula',courseKey:''}),teacher),'VALIDATION');
  errorCode(()=>api.saveCourseDetails_(Object.assign({},fields,{course:'Renamed',courseKey:key}),teacher),'VALIDATION');
  errorCode(()=>api.saveCourseDetails_(fields,teacher),'VALIDATION');
  const details=book.get('CourseDetails');details.data[0].push('Extra');details.data[1].push('preserve');
  api.saveCourseDetails_(Object.assign({},fields,{courseKey:key,description:'Updated'}),teacher);
  check(details.data[1].at(-1)==='preserve','Updates preserve extra columns');
  const lesson={course:'New course',lesson:'New lesson',videoURL:'',pdfURL:'https://example.invalid/new.pdf'};
  check(request('addCourse',lesson,'teacher').ok,'Teacher can add a managed course lesson');
  check(request('listCourses',{}).data.length===2,'Enrolled student sees protected lessons');
  const sessions=book.get('Sessions');const last=sessions.data[1].slice();sessions.data[1][1]=other.user.email;sessions.data[1][3]=api.credentialVersion_(api.account_('student',other.user.email));
  check(request('listCourses',{studentEmail:student.user.email}).data.length===1,'Forged email cannot fetch another student’s lessons');
  sessions.data[1]=last;
  check(!request('addCourse',{course:'Unsaved course',lesson:'Lesson'},'teacher').ok,'New lesson group requires course details');
  api.saveCourseDetails_({courseKey:legacy,course:'Existing course',enrolmentRequired:'true'},teacher);
  check(api.listCourseCatalogue_(other).data.length===0,'Legacy course restriction takes effect only when teacher selects it');
  api.setCourseEnrolment_({courseKey:key,studentEmail:student.user.email,enrolled:'false'},teacher);
  check(api.listCourseCatalogue_(student).data.length===0,'Removal revokes course listing access');
  api.setCourseEnrolment_({courseKey:key,studentEmail:student.user.email,enrolled:'true'},teacher);
  api.deleteStudent({email:student.user.email});
  check(book.get('CourseEnrollments').data.length===1,'Account deletion clears enrolments');
  check(request('listCourseCatalogue',{}).code==='UNAUTHENTICATED','Deleted account cannot reuse session');
  const mismatch=details.data[1][0];details.data[1][0]='broken';
  errorCode(()=>api.courseRecords_(),'COURSE_SETUP_REQUIRED');details.data[1][0]=mismatch;
  return checks;
}

const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
runCourseTests({code:read('Code.gs'),security:read('Security.gs'),management:read('CourseManagement.gs')})
.then(count=>console.log(count+' course management checks passed'))
.catch(error=>{console.error(error.message);process.exitCode=1;});
