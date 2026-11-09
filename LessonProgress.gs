/**
 * Dashboard lesson completion. Students explicitly mark completion; this does
 * not measure video playback or change test marks. Records survive renewal,
 * enrolment removal and re-enrolment; deleted accounts lose their progress.
 */
const DMI_PROGRESS_HEADERS=['CourseKey','StudentEmail','LessonID','CompletedAt'];
function initializeLessonProgress(){
  secret_();
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))securityError_('BUSY','Please retry shortly');
  try{
    courseSheet_('CourseDetails',DMI_COURSE_HEADERS,true);
    courseSheet_('CourseEnrollments',DMI_ENROLMENT_HEADERS,true);
    const book=ss();
    if(!book.getSheetByName('CourseProgress'))book.insertSheet('CourseProgress').appendRow(DMI_PROGRESS_HEADERS);
    courseSheet_('CourseProgress',DMI_PROGRESS_HEADERS,true);
    Logger.log('Lesson progress ready. Existing courses, enrolments and marks preserved.');
  }finally{lock.releaseLock();}
}
function progressRecords_(){
  const sheet=courseSheet_('CourseProgress',DMI_PROGRESS_HEADERS,false);
  return sheet?rows(sheet):[];
}
function progressLessonIDs_(courseKey,email,lessons,records){
  const available=new Set(lessons.map(l=>String(l.CourseID||'')).filter(Boolean));
  return Array.from(new Set(records.filter(r=>r.CourseKey===courseKey &&
    email_(r.StudentEmail)===email_(email) && available.has(String(r.LessonID)))
    .map(r=>String(r.LessonID))));
}
function progressCourse_(courseKey,ctx){
  const course=courseRecords_().find(c=>c.CourseKey===courseKey);
  if(!course)securityError_('NOT_FOUND','Course not found');
  if(!courseVisible_(course,ctx,courseEnrolments_()))securityError_('FORBIDDEN','You are not enrolled in this course');
  return course;
}
function setLessonProgress_(p,ctx){
  if(!ctx || ctx.role!=='student')securityError_('FORBIDDEN','Student access required');
  const sheet=courseSheet_('CourseProgress',DMI_PROGRESS_HEADERS,true);
  progressCourse_(p.courseKey,ctx);
  if(!['true','false'].includes(p.completed))securityError_('VALIDATION','Choose complete or incomplete');
  const lessonID=String(p.lessonID||'');
  if(!rows(tab('Courses')).some(l=>String(l.CourseID)===lessonID && courseKey_(l.Course)===p.courseKey))
    securityError_('NOT_FOUND','Lesson not found in this course');
  if(p.studentEmail && email_(p.studentEmail)!==email_(ctx.user.email))securityError_('FORBIDDEN','You can only update your own progress');
  const data=sheet.getDataRange().getValues(),head=data[0].map(headerName_),matches=[];
  for(let i=1;i<data.length;i++)if(data[i][head.indexOf('CourseKey')]===p.courseKey &&
    email_(data[i][head.indexOf('StudentEmail')])===email_(ctx.user.email) &&
    String(data[i][head.indexOf('LessonID')])===lessonID)matches.push(i+1);
  if(p.completed==='true' && !matches.length){
    const record={CourseKey:p.courseKey,StudentEmail:ctx.user.email,LessonID:lessonID,CompletedAt:new Date()};
    sheet.appendRow(head.map(h=>Object.prototype.hasOwnProperty.call(record,h)?record[h]:''));
  }
  if(p.completed==='false')matches.reverse().forEach(i=>sheet.deleteRow(i));
  return {ok:true};
}
function listCourseProgress_(p,ctx){
  requireCourseTeacher_(ctx);
  const course=progressCourse_(p.courseKey,ctx),records=progressRecords_(),enrolments=courseEnrolments_();
  const lessons=rows(tab('Courses')).filter(l=>courseKey_(l.Course)===p.courseKey);
  const total=new Set(lessons.map(l=>String(l.CourseID||'')).filter(Boolean)).size;
  const data=rows(tab('Students')).filter(s=>!course.EnrolmentRequired ||
    enrolments.some(e=>e.CourseKey===p.courseKey && email_(e.StudentEmail)===email_(s.Email)) ||
    records.some(r=>r.CourseKey===p.courseKey && email_(r.StudentEmail)===email_(s.Email)))
    .map(s=>{
      let active=true;try{active_('student',s);}catch(error){if(['UNAUTHENTICATED','ACCESS_EXPIRED'].includes(error.code))active=false;else throw error;}
      const completed=progressLessonIDs_(p.courseKey,s.Email,lessons,records).length;
      return {studentName:s.Name,studentEmail:s.Email,completedLessons:completed,totalLessons:total,
        percent:total?Math.round(completed/total*100):0,
        canAccess:active && courseVisible_(course,{role:'student',user:{email:s.Email}},enrolments)};
    }).sort((a,b)=>String(a.studentName||'').localeCompare(String(b.studentName||'')));
  return {ok:true,data,progressTrackingReady:!!courseSheet_('CourseProgress',DMI_PROGRESS_HEADERS,false)};
}
function removeStudentLessonProgress_(email){
  const sheet=courseSheet_('CourseProgress',DMI_PROGRESS_HEADERS,false);
  if(!sheet)return;
  const data=sheet.getDataRange().getValues(),head=data[0].map(headerName_);
  for(let i=data.length-1;i>0;i--)if(email_(data[i][head.indexOf('StudentEmail')])===email_(email))sheet.deleteRow(i+1);
}
