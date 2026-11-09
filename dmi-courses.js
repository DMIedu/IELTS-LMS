/* Course dashboard UI. Identity and enrolment are checked by the backend. */
(function(){
  const byId=id=>document.getElementById(id);
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function url(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol) && !u.username && !u.password?esc(u.href):'';}catch(e){return '';}}
  function link(value,label){const target=url(value);return target?'<a href="'+target+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>':'';}
  async function request(action,params){
    const result=await DMI_AUTH.call(action,params||{});
    if(!result.ok){const error=new Error(result.error||'The request could not complete.');error.code=result.code;throw error;}
    return result;
  }
  function errorText(error){
    return error instanceof SyntaxError?'The server returned an unreadable response. Click Refresh to retry loading courses.':
      error instanceof TypeError?'The course request could not complete. Click Refresh to retry.':error.message;
  }
  let courses=[],students=[],ready=false;
  function notice(text,kind){const node=byId('courseNotice');node.textContent=text;node.className='msg '+kind;}
  function selected(){return courses.find(c=>c.CourseKey===byId('detailCourse').value);}
  function setStudents(values){
    students=values||[];
    if(!byId('enrolStudent'))return;
    byId('enrolStudent').innerHTML='<option value="">Select student</option>'+students.filter(s=>!s.expired &&
      (!s.Status || ['active','enabled'].includes(String(s.Status).toLowerCase())))
      .map(s=>'<option value="'+esc(s.Email)+'">'+esc(s.Name)+' — '+esc(s.Email)+'</option>').join('');
  }
  function fill(user){
    const c=selected();
    const fields={detailName:'Course',detailInstructor:'Instructor',detailDuration:'Duration',
      detailDescription:'Description',detailSyllabus:'Syllabus',detailMaterials:'MaterialsURL',detailURL:'CourseURL'};
    Object.keys(fields).forEach(id=>{byId(id).value=c?c[fields[id]]||'':'';});
    if(!c)byId('detailInstructor').value=user.name||'';
    byId('detailName').readOnly=!!c;
    byId('detailRestricted').checked=c?!!c.EnrolmentRequired:true;
    byId('courseDetailFields').disabled=!ready;
    byId('courseEnrolmentFields').disabled=!ready || !c;
    byId('enrolmentHint').textContent=!c?'Save or select a course to assign students.':c.EnrolmentRequired?
      'Only enrolled students can see this course in My Courses.':'All active students can see this course. Enrolments can still be recorded.';
    byId('courseRoster').replaceChildren();
    byId('courseProgressBox').replaceChildren();
  }
  let rosterRevision=0;
  async function roster(){
    const revision=++rosterRevision,c=selected();
    if(!c || !ready)return;
    byId('courseRoster').textContent='Loading enrolments…';
    try{
      const result=await request('listCourseEnrollments',{courseKey:c.CourseKey});
      if(revision!==rosterRevision || selected()?.CourseKey!==c.CourseKey)return;
      const box=byId('courseRoster');box.replaceChildren();
      if(!result.data.length){box.textContent='No students enrolled yet.';return;}
      const table=document.createElement('table');
      table.innerHTML='<thead><tr><th>Student</th><th>Enrolled</th><th></th></tr></thead>';
      const body=document.createElement('tbody');
      result.data.forEach(e=>{
        const row=document.createElement('tr'), student=students.find(s=>String(s.Email).toLowerCase()===String(e.studentEmail).toLowerCase());
        row.innerHTML='<td>'+esc(student?.Name||e.studentEmail)+'<br/><small>'+esc(e.studentEmail)+'</small></td><td>'+esc(e.enrolledAt?new Date(e.enrolledAt).toLocaleDateString():'')+'</td>';
        const cell=document.createElement('td'),button=document.createElement('button');
        button.type='button';button.className='btn btn-ghost btn-sm';button.textContent='Remove';
        button.onclick=async()=>{
          if(!confirm('Remove this student’s enrolment from '+c.Course+'?'))return;
          button.disabled=true;
          try{await request('setCourseEnrollment',{courseKey:c.CourseKey,studentEmail:e.studentEmail,enrolled:'false'});notice('Enrolment removed.','ok');await roster();}
          catch(error){notice(errorText(error),'err');}finally{button.disabled=false;}
        };
        cell.appendChild(button);row.appendChild(cell);body.appendChild(row);
      });
      table.appendChild(body);const wrap=document.createElement('div');wrap.className='tbl-wrap';wrap.appendChild(table);box.appendChild(wrap);
    }catch(error){if(revision===rosterRevision)byId('courseRoster').textContent=errorText(error);}
  }
  async function loadTeacher(user,key){
    ++rosterRevision;
    byId('courseDetailFields').disabled=true;byId('courseEnrolmentFields').disabled=true;
    try{
      const result=await request('listCourseCatalogue');
      courses=result.data;ready=result.courseManagementReady;
      const current=key===undefined?byId('detailCourse').value:key;
      byId('detailCourse').innerHTML='<option value="">New course</option>'+courses.map(c=>'<option value="'+esc(c.CourseKey)+'">'+esc(c.Course)+'</option>').join('');
      byId('detailCourse').value=current||'';
      if(byId('kCourses'))byId('kCourses').textContent=courses.length;
      fill(user);await roster();
      if(!ready)notice('Course management is not enabled yet. Existing lessons remain available.','err');
      else if(byId('courseNotice').className==='msg err')notice('Courses loaded.','ok');
    }catch(error){notice(error.code==='UNKNOWN_ACTION'?'Course management is not enabled yet. Existing lessons remain available.':errorText(error),'err');}
  }
  async function showTeacherProgress(){
    const c=selected(),box=byId('courseProgressBox');box.replaceChildren();
    if(!c){box.textContent='Select a course to view progress.';return;}
    box.textContent='Loading student progress…';
    try{
      const result=await request('listCourseProgress',{courseKey:c.CourseKey});
      if(selected()?.CourseKey!==c.CourseKey)return;
      if(!result.progressTrackingReady){box.textContent='Lesson progress is not enabled yet.';return;}
      if(!result.data.length){box.textContent='No students to show for this course.';return;}
      box.innerHTML='<div class="tbl-wrap"><table><thead><tr><th>Student</th><th>Lessons complete</th><th>Progress</th><th>Course access</th></tr></thead><tbody>'+
        result.data.map(s=>'<tr><td>'+esc(s.studentName)+'<br/><small>'+esc(s.studentEmail)+'</small></td><td>'+s.completedLessons+' / '+s.totalLessons+
          '</td><td>'+s.percent+'%</td><td>'+(s.canAccess?'Available':'Unavailable')+'</td></tr>').join('')+'</tbody></table></div>';
    }catch(error){if(selected()?.CourseKey===c.CourseKey)box.textContent=error.code==='UNKNOWN_ACTION'?'Lesson progress is not enabled yet.':errorText(error);}
  }
  function initTeacher(user){
    byId('courseProgressRefresh').onclick=showTeacherProgress;
    byId('detailCourse').onchange=()=>{++rosterRevision;fill(user);roster();};
    byId('courseRefresh').onclick=()=>loadTeacher(user);
    byId('courseDetailForm').onsubmit=async event=>{
      event.preventDefault();if(!ready)return;
      const c=selected(), params={courseKey:c?.CourseKey||'',course:byId('detailName').value,
        description:byId('detailDescription').value,instructor:byId('detailInstructor').value,
        duration:byId('detailDuration').value,syllabus:byId('detailSyllabus').value,
        materialsURL:byId('detailMaterials').value,courseURL:byId('detailURL').value,
        enrolmentRequired:String(byId('detailRestricted').checked)};
      if(c && !c.EnrolmentRequired && params.enrolmentRequired==='true' &&
        !confirm('Only enrolled students will see this course in My Courses. Continue?'))return;
      byId('courseDetailFields').disabled=true;
      notice('Saving course details…','ok');
      try{const result=await request('saveCourseDetails',params);notice('Course details saved.','ok');await loadTeacher(user,result.courseKey);}
      catch(error){notice(error.message,'err');}finally{byId('courseDetailFields').disabled=!ready;}
    };
    byId('courseEnrolmentForm').onsubmit=async event=>{
      event.preventDefault();const c=selected(),email=byId('enrolStudent').value;
      if(!ready || !c || !email){notice('Select a course and an active student.','err');return;}
      byId('courseEnrolmentFields').disabled=true;
      try{await request('setCourseEnrollment',{courseKey:c.CourseKey,studentEmail:email,enrolled:'true'});notice('Student enrolled.','ok');await roster();}
      catch(error){notice(error.message,'err');}finally{byId('courseEnrolmentFields').disabled=!ready || !selected();}
    };
    loadTeacher(user);
  }
  function renderCourses(data,progressReady){
    return data.map(c=>'<article class="lesson" data-course-key="'+esc(c.CourseKey||'')+'" style="margin-bottom:16px">'+
      '<span class="course-tag">'+(c.Enrolled?'Enrolled':'Available to all active students')+'</span>'+
      '<h3 class="lesson-title">'+esc(c.Course)+'</h3>'+
      (c.Description?'<p style="white-space:pre-wrap;margin-bottom:12px">'+esc(c.Description)+'</p>':'')+
      (c.Instructor?'<p><b>Teacher:</b> '+esc(c.Instructor)+'</p>':'')+
      (c.Duration?'<p><b>Duration:</b> '+esc(c.Duration)+'</p>':'')+
      (c.Syllabus?'<details style="margin:12px 0"><summary>Syllabus</summary><p style="white-space:pre-wrap">'+esc(c.Syllabus)+'</p></details>':'')+
      '<div class="actions" style="margin:12px 0">'+link(c.CourseURL,'Open course')+link(c.MaterialsURL,'Learning materials')+'</div>'+
      (progressReady?'<p style="margin:12px 0"><b data-completion-count>'+new Set(c.CompletedLessonIDs||[]).size+' / '+new Set(c.Lessons.map(l=>String(l.CourseID||'')).filter(Boolean)).size+'</b> lessons complete</p><p data-progress-message role="status" aria-live="polite"></p>':'')+
      (c.Lessons.length?'<details><summary>'+c.Lessons.length+' lesson'+(c.Lessons.length===1?'':'s')+'</summary>'+
        c.Lessons.map(l=>'<div style="padding:12px 0;border-top:1px solid var(--border)"><b>'+esc(l.Lesson)+'</b>'+(progressReady && l.CourseID?'<label style="display:flex;align-items:center;gap:8px;margin:10px 0"><input type="checkbox" data-progress-course="'+esc(c.CourseKey)+'" data-progress-lesson="'+esc(l.CourseID)+'" '+((c.CompletedLessonIDs||[]).includes(String(l.CourseID))?'checked':'')+'/> Mark complete</label>':'')+'<div class="actions" style="margin-top:8px">'+link(l.VideoURL,'Watch video')+link(l.PDFURL,'PDF')+'</div></div>').join('')+'</details>':'<p>Lessons will appear here when your teacher adds them.</p>')+'</article>').join('');
  }
  function bindCompletion(box,courses){
    box.querySelectorAll('[data-progress-lesson]').forEach(input=>{
      input.onchange=async()=>{
        const course=courses.find(c=>c.CourseKey===input.dataset.progressCourse);
        if(!course)return;
        const lessonID=input.dataset.progressLesson,completed=input.checked,previous=(course.CompletedLessonIDs||[]).includes(lessonID);
        const card=input.closest('[data-course-key]'),message=card.querySelector('[data-progress-message]');
        input.disabled=true;message.textContent='Saving progress…';
        try{
          await request('setLessonProgress',{courseKey:course.CourseKey,lessonID,completed:String(completed)});
          const ids=new Set(course.CompletedLessonIDs||[]);completed?ids.add(lessonID):ids.delete(lessonID);
          course.CompletedLessonIDs=Array.from(ids);
          card.querySelector('[data-completion-count]').textContent=ids.size+' / '+new Set(course.Lessons.map(l=>String(l.CourseID||'')).filter(Boolean)).size;
          message.textContent='Progress saved.';
        }catch(error){
          input.checked=previous;
          message.textContent=error instanceof SyntaxError || error instanceof TypeError?
            'Could not confirm the change. Refresh My Courses before trying again.':error.message;
        }finally{input.disabled=false;}
      };
    });
  }
  async function loadStudent(){
    const box=byId('coursesBox');box.textContent='Loading courses…';
    try{
      let result;
      try{result=await request('listCourseCatalogue');}
      catch(error){
        if(error.code!=='UNKNOWN_ACTION')throw error;
        const old=await request('listCourses'),groups=new Map();
        old.data.forEach(l=>{if(!groups.has(l.Course))groups.set(l.Course,{Course:l.Course,Lessons:[]});groups.get(l.Course).Lessons.push(l);});
        result={data:Array.from(groups.values())};
      }
      box.innerHTML=result.data.length?renderCourses(result.data,result.progressTrackingReady):'<div class="empty">No courses assigned yet. Please contact your teacher.</div>';
      bindCompletion(box,result.data);
    }catch(error){
      box.replaceChildren();const message=document.createElement('p');message.textContent=errorText(error);
      const retry=document.createElement('button');retry.type='button';retry.textContent='Retry loading courses';retry.onclick=loadStudent;
      box.append(message,retry);
    }
  }
  window.DMI_COURSES={initTeacher,setStudents,loadStudent,renderCourses};
})();
