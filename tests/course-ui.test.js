const fs=require('node:fs');const path=require('node:path');
async function runCourseUITests(source){
  function assert(condition,message){if(!condition)throw new Error(message);}
  let checks=0;const nodes=new Map(),calls=[],requests=[];
  class Node{
    constructor(){this.value='';this.innerHTML='';this.textContent='';this.disabled=false;this.children=[];}
    querySelectorAll(){return this.inputs||[];}
    replaceChildren(...children){this.children=children;this.innerHTML='';this.textContent='';}
    appendChild(child){this.children.push(child);return child;}
    append(...children){children.forEach(c=>this.appendChild(c));}
  }
  const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);},createElement:()=>new Node()};
  class TestURL{
    constructor(value){const m=/^(https?):\/\/([^/]+)(.*)$/i.exec(String(value));if(!m)throw Error('URL');this.protocol=m[1].toLowerCase()+':';this.href=String(value);this.username=m[2].includes('@')?'user':'';this.password='';}
  }
  const window={},DMI_AUTH={call:async(action,params)=>{calls.push({action,params});const next=requests.shift();if(next instanceof Error)throw next;return next;}};
  new Function('window','document','DMI_AUTH','URL','confirm',source)(window,document,DMI_AUTH,TestURL,()=>true);
  const ui=window.DMI_COURSES,c={CourseKey:'key',Course:'<script>bad</script>',Description:'<img src=x onerror=bad>',Instructor:'Teacher',Duration:'8 weeks',Syllabus:'<svg onload=bad>',Enrolled:true,CourseURL:'javascript:bad',MaterialsURL:'https://user:pass@example.invalid/materials',Lessons:[{Lesson:'<script>lesson</script>',VideoURL:'javascript:bad',PDFURL:'https://example.invalid/materials'}]};
  const html=ui.renderCourses([c]);
  assert(!html.includes('<script>') && !html.includes('<img') && !html.includes('<svg'),'Course text must be escaped');checks++;
  assert(!html.includes('javascript:') && !html.includes('user:pass'),'Unsafe URLs omitted');checks++;
  assert(html.includes('rel="noopener noreferrer"') && html.includes('https://example.invalid/materials'),'Safe links rendered safely');checks++;
  assert(html.includes('Enrolled') && html.includes('Syllabus'),'Student card has status and syllabus');checks++;
  requests.push({ok:true,data:[]});await ui.loadStudent();
  assert(document.getElementById('coursesBox').innerHTML.includes('No courses assigned'),'Empty student state');checks++;
  requests.push({ok:false,code:'UNKNOWN_ACTION',error:'Unknown action'},{ok:true,data:[{Course:'Legacy',Lesson:'Intro'}]});await ui.loadStudent();
  assert(document.getElementById('coursesBox').innerHTML.includes('Legacy'),'Legacy backend fallback');checks++;
  requests.push(new TypeError('Network unavailable'));await ui.loadStudent();
  assert(document.getElementById('coursesBox').children[1].textContent==='Retry loading courses','Network failure offers retry');checks++;
  ui.setStudents([{Email:'active@example.invalid',Name:'Active',Status:'Active'},{Email:'expired@example.invalid',Name:'Expired',expired:true},{Email:'disabled@example.invalid',Name:'Disabled',Status:'Disabled'}]);
  assert(document.getElementById('enrolStudent').innerHTML.includes('active@example.invalid') && !document.getElementById('enrolStudent').innerHTML.includes('expired@example.invalid') && !document.getElementById('enrolStudent').innerHTML.includes('disabled@example.invalid'),'Enrolment dropdown includes active students only');checks++;
  requests.push({ok:true,data:[{CourseKey:'key',Course:'Existing',EnrolmentRequired:false,Lessons:[]}],courseManagementReady:true});
  ui.initTeacher({name:'Teacher'});
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert(document.getElementById('detailRestricted').checked===true,'New course defaults restricted');checks++;
  document.getElementById('detailCourse').value='key';
  requests.push({ok:true,data:[]});document.getElementById('detailCourse').onchange();
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert(document.getElementById('detailName').readOnly && document.getElementById('detailRestricted').checked===false,'Legacy editor preserves availability and course identity');checks++;
  requests.push({ok:true,data:[],courseManagementReady:false});await document.getElementById('courseRefresh').onclick();
  assert(document.getElementById('courseDetailFields').disabled && document.getElementById('courseEnrolmentFields').disabled,'Missing setup disables writes');checks++;
  requests.push(new SyntaxError('Unexpected token < private HTML'));
  await document.getElementById('courseRefresh').onclick();
  assert(document.getElementById('courseNotice').textContent.includes('unreadable response') &&
    !document.getElementById('courseNotice').textContent.includes('private HTML'),'Unparseable responses use a helpful message');checks++;
  requests.push({ok:true,data:[],courseManagementReady:true});
  await document.getElementById('courseRefresh').onclick();
  assert(document.getElementById('courseNotice').className==='msg ok' &&
    !document.getElementById('courseDetailFields').disabled,'Successful refresh clears stale error and enables editing');checks++;

  const progressCourse={CourseKey:'pkey',Course:'Progress course',Lessons:[{CourseID:'L1',Lesson:'First'},{CourseID:'L2',Lesson:'Second'}],CompletedLessonIDs:['L1']};
  const progressHTML=ui.renderCourses([progressCourse],true);
  assert(progressHTML.includes('1 / 2') && progressHTML.includes('checked') && progressHTML.includes('Mark complete'),'Completion checkboxes and totals rendered');checks++;
  assert(!ui.renderCourses([progressCourse],false).includes('Mark complete'),'Old backend does not show completion writes');checks++;
  const hostile=Object.assign({},progressCourse,{CourseKey:'"><script>',Lessons:[{CourseID:'"><img>',Lesson:'Safe'}]});
  assert(!ui.renderCourses([hostile],true).includes('<script>') && !ui.renderCourses([hostile],true).includes('<img>'),'Completion attributes escaped');checks++;
  const message=new Node(),count=new Node(),card={querySelector:s=>s==='[data-progress-message]'?message:count};
  const input={dataset:{progressCourse:'pkey',progressLesson:'L2'},checked:false,disabled:false,closest:()=>card};
  document.getElementById('coursesBox').inputs=[input];
  requests.push({ok:true,data:[progressCourse],progressTrackingReady:true});await ui.loadStudent();
  input.checked=true;requests.push({ok:true});await input.onchange();
  assert(count.textContent==='2 / 2' && message.textContent==='Progress saved.' && !input.disabled,'Successful completion updates count and releases checkbox');checks++;
  const last=calls.at(-1);
  assert(last.action==='setLessonProgress' && last.params.completed==='true' && !('studentEmail' in last.params),'Browser sends completion without a selectable student identity');checks++;
  input.checked=false;requests.push({ok:false,code:'FORBIDDEN',error:'Not enrolled'});await input.onchange();
  assert(input.checked===true && message.textContent==='Not enrolled','Rejected completion restores confirmed state');checks++;
  const prior=calls.length;input.checked=false;requests.push(new SyntaxError('private HTML'));await input.onchange();
  assert(input.checked===true && message.textContent.includes('Could not confirm') && !message.textContent.includes('private HTML') && calls.length===prior+1,'Ambiguous writes require refresh and never retry automatically');checks++;
  input.checked=false;requests.push({ok:true});await input.onchange();
  assert(count.textContent==='1 / 2','Unmarking updates confirmed total');checks++;
  document.getElementById('coursesBox').inputs=[];
  requests.push({ok:true,data:[progressCourse],courseManagementReady:true});
  await document.getElementById('courseRefresh').onclick();
  document.getElementById('detailCourse').value='pkey';
  requests.push({ok:true,data:[{studentName:'<script>name</script>',studentEmail:'<img>',completedLessons:1,totalLessons:2,percent:50,canAccess:true}],progressTrackingReady:true});
  await document.getElementById('courseProgressRefresh').onclick();
  const teacherHTML=document.getElementById('courseProgressBox').innerHTML;
  assert(teacherHTML.includes('50%') && teacherHTML.includes('1 / 2') && !teacherHTML.includes('<script>') && !teacherHTML.includes('<img>'),'Teacher report escapes identities and shows completion');checks++;
  requests.push({ok:true,data:[],progressTrackingReady:false});
  await document.getElementById('courseProgressRefresh').onclick();
  assert(document.getElementById('courseProgressBox').textContent==='Lesson progress is not enabled yet.','Teacher sees clear setup state');checks++;

  return checks;
}

runCourseUITests(fs.readFileSync(path.join(__dirname,'..','dmi-courses.js'),'utf8'))
.then(count=>console.log(count+' course UI checks passed'))
.catch(error=>{console.error(error.message);process.exitCode=1;});
