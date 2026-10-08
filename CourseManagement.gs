/**
 * Course details and enrolment for the dashboard.
 * Existing lesson courses remain available to all active students until a teacher
 * explicitly selects "Enrolled students only". New courses default to restricted.
 * Course enrolment controls API listings; it does not protect public media URLs
 * or change the separate video tutorial library.
 */
const DMI_COURSE_HEADERS=['CourseKey','Course','Description','Instructor','Duration','Syllabus','MaterialsURL','CourseURL','EnrolmentRequired'];
const DMI_ENROLMENT_HEADERS=['CourseKey','StudentEmail','EnrolledAt','EnrolledBy'];
function courseKey_(name){return digest_(String(name||'').trim().toLowerCase());}
function courseSheet_(name,head,required){
  const sheet=ss().getSheetByName(name);
  if(!sheet){if(required)securityError_('COURSE_SETUP_REQUIRED','Course management is not enabled yet');return null;}
  const actual=sheet.getDataRange().getValues()[0].map(headerName_);
  if(!head.every(k=>actual.includes(k)))securityError_('COURSE_SETUP_REQUIRED','Course setup needs attention');
  return sheet;
}
function initializeCourseManagement(){
  secret_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))securityError_('BUSY','Please retry shortly');
  try{
    const book=ss();
    [['CourseDetails',DMI_COURSE_HEADERS],['CourseEnrollments',DMI_ENROLMENT_HEADERS]].forEach(pair=>{
      if(!book.getSheetByName(pair[0]))book.insertSheet(pair[0]).appendRow(pair[1]);
      courseSheet_(pair[0],pair[1],true);
    });
    Logger.log('Course management ready. Existing students, lessons, marks and sessions preserved.');
  }finally{lock.releaseLock();}
}
function courseRecords_(){
  const details=courseSheet_('CourseDetails',DMI_COURSE_HEADERS,false);
  const catalogue=new Map();
  rows(tab('Courses')).forEach(lesson=>{
    const name=String(lesson.Course||'').trim();
    if(name){const key=courseKey_(name);if(!catalogue.has(key))catalogue.set(key,{CourseKey:key,Course:name,EnrolmentRequired:false});}
  });
  if(details)rows(details).forEach(record=>{
    if(record.CourseKey!==courseKey_(record.Course))securityError_('COURSE_SETUP_REQUIRED','Course identity needs attention');
    catalogue.set(record.CourseKey,Object.assign({},record,{EnrolmentRequired:String(record.EnrolmentRequired).toLowerCase()==='true'}));
  });
  return Array.from(catalogue.values()).sort((a,b)=>a.Course.localeCompare(b.Course));
}
function courseEnrolments_(){
  const sheet=courseSheet_('CourseEnrollments',DMI_ENROLMENT_HEADERS,false);
  return sheet?rows(sheet):[];
}
function courseVisible_(course,ctx,enrolments){
  return ctx.role==='teacher' || !course.EnrolmentRequired ||
    enrolments.some(e=>e.CourseKey===course.CourseKey && email_(e.StudentEmail)===email_(ctx.user.email));
}
function listCourseCatalogue_(ctx){
  const courses=courseRecords_(), enrolments=courseEnrolments_(), lessons=rows(tab('Courses'));
  const data=courses.filter(c=>courseVisible_(c,ctx,enrolments)).map(c=>{
    const out=Object.assign({},c);
    out.Lessons=lessons.filter(l=>courseKey_(l.Course)===c.CourseKey);
    out.Enrolled=enrolments.some(e=>e.CourseKey===c.CourseKey && email_(e.StudentEmail)===email_(ctx.user.email));
    if(ctx.role==='teacher')out.EnrolledCount=enrolments.filter(e=>e.CourseKey===c.CourseKey).length;
    return out;
  });
  return {ok:true,data,courseManagementReady:!!courseSheet_('CourseDetails',DMI_COURSE_HEADERS,false) &&
    !!courseSheet_('CourseEnrollments',DMI_ENROLMENT_HEADERS,false)};
}
function visibleCourseLessons_(ctx){
  const courses=courseRecords_(), enrolments=courseEnrolments_();
  const visible=new Set(courses.filter(c=>courseVisible_(c,ctx,enrolments)).map(c=>c.CourseKey));
  return {ok:true,data:rows(tab('Courses')).filter(l=>visible.has(courseKey_(l.Course)))};
}
function courseText_(value,label,max){
  const text=String(value||'').trim();
  if(text.length>max)securityError_('VALIDATION',label+' is too long');
  return text;
}
function courseURL_(value,label){
  const text=courseText_(value,label,2000);
  if(text && (!/^https?:\/\/[^\s]+$/i.test(text) || /^https?:\/\/[^/?#]*@/i.test(text)))
    securityError_('VALIDATION',label+' must be an http or https link without embedded credentials');
  return text;
}
function requireCourseTeacher_(ctx){
  if(!ctx || ctx.role!=='teacher')securityError_('FORBIDDEN','Teacher access required');
}
function saveCourseDetails_(p,ctx){
  requireCourseTeacher_(ctx);
  const sheet=courseSheet_('CourseDetails',DMI_COURSE_HEADERS,true);
  const name=courseText_(p.course,'Course name',150);
  if(!name)securityError_('VALIDATION','Course name is required');
  if(/^[=+\-@]/.test(name))securityError_('VALIDATION','Course name must start with a letter or number');
  const key=courseKey_(name), courses=courseRecords_();
  if(p.courseKey && (p.courseKey!==key || !courses.some(c=>c.CourseKey===key)))
    securityError_('VALIDATION','Choose the existing course without changing its name');
  if(!p.courseKey && courses.some(c=>c.CourseKey===key))
    securityError_('VALIDATION','This course already exists. Select it to edit its details.');
  if(!['true','false'].includes(String(p.enrolmentRequired)))securityError_('VALIDATION','Choose who can access the course');
  const record={CourseKey:key,Course:sheetText_(name),
    Description:sheetText_(courseText_(p.description,'Description',4000)),
    Instructor:sheetText_(courseText_(p.instructor,'Teacher',150)),
    Duration:sheetText_(courseText_(p.duration,'Duration',100)),
    Syllabus:sheetText_(courseText_(p.syllabus,'Syllabus',8000)),
    MaterialsURL:courseURL_(p.materialsURL,'Materials link'),
    CourseURL:courseURL_(p.courseURL,'Course link'),
    EnrolmentRequired:String(p.enrolmentRequired)==='true'};
  const data=sheet.getDataRange().getValues(), head=data[0].map(headerName_);
  const i=data.findIndex((r,j)=>j>0 && r[head.indexOf('CourseKey')]===key);
  if(i<1)sheet.appendRow(head.map(h=>Object.prototype.hasOwnProperty.call(record,h)?record[h]:''));
  else Object.keys(record).forEach(h=>sheet.getRange(i+1,head.indexOf(h)+1).setValue(record[h]));
  return {ok:true,courseKey:key};
}
function listCourseEnrolments_(p,ctx){
  requireCourseTeacher_(ctx);
  if(!courseRecords_().some(c=>c.CourseKey===p.courseKey))securityError_('NOT_FOUND','Course not found');
  return {ok:true,data:courseEnrolments_().filter(e=>e.CourseKey===p.courseKey).map(e=>({
    studentEmail:e.StudentEmail,enrolledAt:e.EnrolledAt
  }))};
}
function setCourseEnrolment_(p,ctx){
  requireCourseTeacher_(ctx);
  const sheet=courseSheet_('CourseEnrollments',DMI_ENROLMENT_HEADERS,true);
  if(!courseRecords_().some(c=>c.CourseKey===p.courseKey))securityError_('NOT_FOUND','Course not found');
  const email=email_(p.studentEmail);
  if(!['true','false'].includes(String(p.enrolled)))securityError_('VALIDATION','Choose enrol or remove');
  if(p.enrolled==='true'){
    const student=account_('student',email);
    if(!student)securityError_('NOT_FOUND','Student not found');
    active_('student',student);
  }
  const data=sheet.getDataRange().getValues(), head=data[0].map(headerName_);
  const matches=[];
  for(let i=1;i<data.length;i++)if(data[i][head.indexOf('CourseKey')]===p.courseKey &&
    email_(data[i][head.indexOf('StudentEmail')])===email)matches.push(i+1);
  if(p.enrolled==='true' && !matches.length){
    const record={CourseKey:p.courseKey,StudentEmail:email,EnrolledAt:new Date(),EnrolledBy:ctx.user.email};
    sheet.appendRow(head.map(h=>Object.prototype.hasOwnProperty.call(record,h)?record[h]:''));
  }
  if(p.enrolled==='false')matches.reverse().forEach(i=>sheet.deleteRow(i));
  return {ok:true};
}

function removeStudentCourseEnrolments_(email){
  const sheet=courseSheet_('CourseEnrollments',DMI_ENROLMENT_HEADERS,false);
  if(!sheet)return;
  const data=sheet.getDataRange().getValues(), head=data[0].map(headerName_);
  for(let i=data.length-1;i>0;i--)if(email_(data[i][head.indexOf('StudentEmail')])===email_(email))sheet.deleteRow(i+1);
}
