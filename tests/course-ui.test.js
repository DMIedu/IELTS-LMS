const fs=require('node:fs');const path=require('node:path');
async function runCourseUITests(source){
  function assert(condition,message){if(!condition)throw new Error(message);}
  let checks=0;const nodes=new Map(),calls=[],requests=[];
  class Node{
    constructor(){this.value='';this.innerHTML='';this.textContent='';this.disabled=false;this.children=[];}
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
  return checks;
}

runCourseUITests(fs.readFileSync(path.join(__dirname,'..','dmi-courses.js'),'utf8'))
.then(count=>console.log(count+' course UI checks passed'))
.catch(error=>{console.error(error.message);process.exitCode=1;});
