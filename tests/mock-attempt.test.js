/* Fake workbook, synthetic candidates and controllable clock. No network. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createHarness}=require('./mock-entry.test.js');
const h=createHarness(),{ctx,req,payload,sheets,clock}=h;let checks=0;
const check=(name,value)=>{assert.ok(value,name);checks++;};
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','MockAttempts.gs'),'utf8'),ctx);
ctx.initializeMockTests();ctx.initializeMockAttempts();ctx.initializeMockAttempts();
check('new storage setup is idempotent',sheets.MockAttempts.vals.length===1&&sheets.MockPapers.vals.length===1);
const sitting=req('createMockSitting',payload()),id=sitting.sitting.id;
check('no admission cannot start',req('startMockAttempt',{sittingID:id},'student').code==='MOCK_ENTRY_REQUIRED');
req('enterMockSitting',{sittingID:id,code:sitting.code},'student');
check('unfinished runner cannot start',req('startMockAttempt',{sittingID:id},'student').code==='MOCK_NOT_READY');
check('disabled runner creates no attempts',sheets.MockAttempts.vals.length===1);
const oldProps=ctx.PropertiesService.getScriptProperties;
ctx.PropertiesService.getScriptProperties=()=>({getProperty:k=>k==='DMI_MOCK_RUNNER_ENABLED'?'true':k==='DMI_MOCK_AUDIO_HOST'?'audio.example':oldProps().getProperty(k)});
check('missing paper fails closed',req('startMockAttempt',{sittingID:id},'student').code==='MOCK_NOT_READY');
const paper={listeningSeconds:1800,listeningAudio:{clips:[{url:'https://audio.example/synthetic.wav',startSeconds:0,durationSeconds:1800,answerKey:'NEVER-EXPOSE-KEY'}]},sections:['listening','reading','writing'].map((name,i)=>({
 name,instructions:'Private instructions',passages:[{title:'Private text',text:'Synthetic passage'}],
 questions:Array.from({length:i===2?2:40},(_,j)=>({id:String(j+1),prompt:'Question '+(j+1),key:'NEVER-EXPOSE-KEY',options:['A','B']}))
}))};
const chart={type:'bar',title:'Synthetic chart',unit:'%',maximum:100,categories:['Category A','Category B'],series:[{name:'Year A',values:[20,80]},{name:'Year B',values:[30,70]}],answerKey:'NEVER-EXPOSE-KEY'};
paper.sections[2].questions[0].chart=chart;
const paperJSON=JSON.stringify(paper);
sheets.MockPapers.appendRow(['DMI-ACADEMIC-MOCK-01','v1',false,true,paperJSON]);
check('unreviewed paper fails closed',req('startMockAttempt',{sittingID:id},'student').code==='MOCK_NOT_READY');
sheets.MockPapers.vals[1][2]=true;
for(const invalid of [{...chart,maximum:0},{...chart,series:[{name:'x',values:[-1,2]}]},{...chart,categories:['x'],series:[{name:'x',values:[2,3]}]},{...chart,series:[{name:'x',values:['20',80]}]}]){
 const bad=JSON.parse(paperJSON);bad.sections[2].questions[0].chart=invalid;sheets.MockPapers.vals[1][4]=JSON.stringify(bad);
 check('invalid chart blocks starting paper',req('startMockAttempt',{sittingID:id},'student').code==='MOCK_NOT_READY');
}
const lineChart={type:'line',title:'Synthetic trend',unit:'units',maximum:100,categories:Array.from({length:11},(_,i)=>String(2030+i)),series:[{name:'Synthetic series',values:Array.from({length:11},(_,i)=>i*5)}],projectionStartIndex:8,answerKey:'NEVER-EXPOSE-KEY'};
const cleaned=ctx.mockChart_(lineChart);
check('line chart retains numeric trend and forecast boundary',cleaned.type==='line'&&cleaned.categories.length===11&&cleaned.series[0].values[10]===50&&cleaned.projectionStartIndex===8);
check('line chart strips extra key fields',!JSON.stringify(cleaned).includes('NEVER-EXPOSE-KEY'));
for(const invalid of [{...lineChart,projectionStartIndex:-1},{...lineChart,projectionStartIndex:11},{...lineChart,projectionStartIndex:1.5},{...lineChart,categories:['one'],series:[{name:'x',values:[10]}]},{...lineChart,categories:Array(17).fill('x'),series:[{name:'x',values:Array(17).fill(10)}]}]){
 const bad=JSON.parse(paperJSON);bad.sections[2].questions[0].chart=invalid;sheets.MockPapers.vals[1][4]=JSON.stringify(bad);
 check('invalid line chart blocks paper',req('startMockAttempt',{sittingID:id},'student').code==='MOCK_NOT_READY');
}
for(const badAudio of [null,{clips:[]},{clips:[{url:'http://audio.example/x',startSeconds:0,durationSeconds:1800}]},{clips:[{url:'https://evil.example/x',startSeconds:0,durationSeconds:1800}]},{clips:[{url:'https://audio.example/x',startSeconds:1,durationSeconds:1800}]},{clips:[{url:'https://audio.example/x',startSeconds:0,durationSeconds:1700}]},{clips:[{url:'https://audio.example/x#bad',startSeconds:0,durationSeconds:1800}]}]){
 const bad=JSON.parse(paperJSON);bad.listeningAudio=badAudio;sheets.MockPapers.vals[1][4]=JSON.stringify(bad);
 check('invalid audio schedule blocks start',req('startMockAttempt',{sittingID:id},'student').code==='MOCK_NOT_READY');
}
sheets.MockPapers.vals[1][4]=paperJSON;
const begin=req('startMockAttempt',{sittingID:id},'student'),attempt=begin.attempt;
check('reviewed test fixture starts Listening',begin.ok&&attempt.section==='listening'&&attempt.revision===0);
check('Listening exposes only validated schedule',begin.attempt.listeningAudio.clips[0].url==='https://audio.example/synthetic.wav'&&!JSON.stringify(begin.attempt.listeningAudio).includes('answerKey'));
check('Writing chart not revealed in Listening',!JSON.stringify(begin).includes('Synthetic chart'));
check('keys never returned',!JSON.stringify(begin).includes('NEVER-EXPOSE-KEY'));
check('future sections not returned',!JSON.stringify(begin).includes('"name":"reading"'));
check('Listening includes two minute review',Date.parse(attempt.deadlines[0])-clock.now===1920000);
const again=req('startMockAttempt',{sittingID:id},'student');
check('duplicate start resumes identical deadline',again.attempt.id===attempt.id&&again.attempt.deadlines[0]===attempt.deadlines[0]&&sheets.MockAttempts.vals.length===2);
check('teacher cannot start a candidate attempt',req('startMockAttempt',{sittingID:id}).code==='FORBIDDEN');
check('unassigned candidate cannot resume',req('resumeMockAttempt',{sittingID:id},'other').code==='FORBIDDEN');
req('enterMockSitting',{sittingID:id,code:sitting.code},'second');
check('another assigned student cannot resume first attempt',req('resumeMockAttempt',{sittingID:id,attemptID:attempt.id},'second').code==='MOCK_NOT_STARTED');
const base={sittingID:id,attemptID:attempt.id,section:'listening',revision:0,requestID:crypto.randomUUID(),answersJSON:'{"1":"A"}'};
check('GET writes refused',req('saveMockAnswers',base,'student',false).code==='POST_REQUIRED');
check('future section refused',req('saveMockAnswers',{...base,section:'reading'},'student').code==='MOCK_SECTION_ORDER');
check('forged attempt refused',req('saveMockAnswers',{...base,attemptID:'other'},'student').code==='FORBIDDEN');
for(const raw of ['[]','null','{','{"41":"A"}','{"1":123}','{"1":"'+ 'x'.repeat(101)+'"}'])
 check('invalid answer shape refused',req('saveMockAnswers',{...base,answersJSON:raw},'student').code==='VALIDATION');
const saved=req('saveMockAnswers',base,'student');
check('answers saved and revision advanced',saved.ok&&saved.attempt.revision===1&&saved.attempt.answers['1']==='A');
check('lost response retry does not duplicate write',req('saveMockAnswers',base,'student').attempt.revision===1);
check('stale revision cannot overwrite',req('saveMockAnswers',{...base,requestID:crypto.randomUUID(),answersJSON:'{"1":"B"}'},'student').code==='MOCK_REVISION_CONFLICT');
const own=req('resumeMockAttempt',{sittingID:id},'student');
check('resume preserves saved work',own.attempt.answers['1']==='A');
const final=req('submitMockSection',{...base,revision:1,requestID:crypto.randomUUID()},'student');
check('explicit submit locks section',final.ok&&final.attempt.sections[0].closed);
check('early submit cannot shorten Listening or unlock Reading',final.attempt.section==='listening'&&final.attempt.deadlines[0]===attempt.deadlines[0]);
check('late autosave cannot alter submitted work',req('saveMockAnswers',{...base,revision:2,requestID:crypto.randomUUID()},'student').code==='MOCK_SECTION_CLOSED');
clock.now=Date.parse(attempt.deadlines[0]);
const reading=req('resumeMockAttempt',{sittingID:id},'student');
check('deadline advances to Reading automatically',reading.attempt.section==='reading');
check('Listening audio not delivered to Reading',!reading.attempt.listeningAudio);
check('Reading has sixty minutes',Date.parse(attempt.deadlines[1])-clock.now===3600000);
check('cannot return to Listening',req('saveMockAnswers',{...base,revision:reading.attempt.revision,requestID:crypto.randomUUID()},'student').code==='MOCK_SECTION_CLOSED');
const readingSave=req('saveMockAnswers',{...base,section:'reading',revision:reading.attempt.revision,requestID:crypto.randomUUID(),answersJSON:'{"2":"B"}'},'student');
check('Reading answers stored',readingSave.ok&&readingSave.attempt.answers['2']==='B');
const originalPaper=sheets.MockPapers.vals[1][4];
sheets.MockPapers.vals[1][4]=originalPaper.replace('Question 1','Changed question');
check('edited pinned paper pauses safely',req('resumeMockAttempt',{sittingID:id},'student').code==='MOCK_PAPER_CHANGED');
sheets.MockPapers.vals[1][4]=originalPaper;
req('closeMockSitting',{sittingID:id});
check('closing entry does not cancel a started attempt',req('resumeMockAttempt',{sittingID:id},'student').ok);
clock.now=Date.parse(attempt.deadlines[1]);
const writing=req('resumeMockAttempt',{sittingID:id},'student');
check('clock advances to Writing',writing.attempt.section==='writing');
check('Reading auto locks its last saved answers',writing.attempt.sections[1].closed);
check('Writing receives chart values',writing.attempt.content.questions[0].chart.series[0].values[0]===20);
check('chart strips unknown key fields',!JSON.stringify(writing).includes('NEVER-EXPOSE-KEY'));
check('Writing has sixty minutes',Date.parse(attempt.deadlines[2])-clock.now===3600000);
const writingSave=req('saveMockAnswers',{...base,section:'writing',revision:writing.attempt.revision,requestID:crypto.randomUUID(),answersJSON:JSON.stringify({'1':'Task one text','2':'Task two text'})},'student');
check('teacher cannot mark unfinished Writing',req('saveMockWritingReview',{attemptID:attempt.id,task:1,requestID:crypto.randomUUID(),revision:0,scoresJSON:'{}',feedback:'Draft'}).code==='MOCK_REVIEW_NOT_READY');
check('both writing tasks saved',writingSave.ok&&writingSave.attempt.answers['2']==='Task two text');
clock.now=Date.parse(attempt.deadlines[2]);
const finished=req('resumeMockAttempt',{sittingID:id},'student');
check('expiry freezes written attempt',finished.attempt.status==='written_submitted'&&finished.attempt.section===null&&finished.attempt.sections.every(s=>s.closed));
check('no premature score or fake Speaking band',finished.attempt.assessment==='pending'&&finished.attempt.speaking==='not_started'&&!('score' in finished.attempt));
check('expired timer cannot restart',req('startMockAttempt',{sittingID:id},'student').attempt.id===attempt.id&&sheets.MockAttempts.vals.length===2);
check('deadline rejects late writing',req('saveMockAnswers',{...base,section:'writing',revision:finished.attempt.revision,requestID:crypto.randomUUID()},'student').code==='MOCK_SECTION_CLOSED');
check('existing results never changed',sheets.Marks.vals.length===1&&sheets.ExamResults.vals.length===1);
new vm.Script(fs.readFileSync(path.join(__dirname,'..','release-candidate','Code.gs'),'utf8'));
check('consolidated backend contains attempt module',fs.readFileSync(path.join(__dirname,'..','release-candidate','Code.gs'),'utf8').includes(fs.readFileSync(path.join(__dirname,'..','MockAttempts.gs'),'utf8')));

for(const action of ['listMockAttempts','getMockAttemptReview','saveMockWritingReview']){
 check('student denied teacher review '+action,req(action,{sittingID:id,attemptID:attempt.id},'student').code==='FORBIDDEN');
 check('anonymous denied teacher review '+action,req(action,{sessionToken:'',sittingID:id,attemptID:attempt.id}).code==='UNAUTHENTICATED');
}
check('teacher lists submitted attempt',req('listMockAttempts',{sittingID:id}).data[0].writtenComplete);
const view=req('getMockAttemptReview',{attemptID:attempt.id});
check('teacher sees saved Writing text',view.review.sections[2].answers['2']==='Task two text');
check('review starts pending with no zero mark',view.review.assessment==='pending'&&view.review.writingTasks.every(t=>t.history.length===0));
check('review does not leak stored answer keys',!JSON.stringify(view).includes('NEVER-EXPOSE-KEY'));
const rubric={task:6,coherence:6,lexical:7,grammar:6};
const rp={attemptID:attempt.id,task:1,revision:0,requestID:crypto.randomUUID(),scoresJSON:JSON.stringify(rubric),feedback:'Synthetic teacher feedback'};
for(const scoresJSON of ['{}','[]','null','{','{"task":6,"coherence":6,"lexical":7,"grammar":10}','{"task":"","coherence":6,"lexical":7,"grammar":6}'])
 check('invalid rubric denied',req('saveMockWritingReview',{...rp,scoresJSON}).code==='VALIDATION');
const marked=req('saveMockWritingReview',rp);
check('teacher rubric saved as pending',marked.ok&&marked.assessment==='pending'&&marked.saved.revision===1);
check('review retry is idempotent',req('saveMockWritingReview',rp).recovered&&sheets.MockReviews.vals.length===2);
check('request cannot be reused for different task',req('saveMockWritingReview',{...rp,task:2}).code==='VALIDATION');
check('stale review cannot overwrite',req('saveMockWritingReview',{...rp,requestID:crypto.randomUUID()}).code==='MOCK_REVIEW_CONFLICT');
check('second review appends history',req('saveMockWritingReview',{...rp,revision:1,requestID:crypto.randomUUID(),feedback:'Revised feedback'}).ok&&sheets.MockReviews.vals.length===3);
check('history retains old feedback',req('getMockAttemptReview',{attemptID:attempt.id}).review.writingTasks[0].history[0].feedback==='Synthetic teacher feedback');
sheets.MockPapers.vals[1][4]=originalPaper.replace('Question 1','Changed');
const changed=req('getMockAttemptReview',{attemptID:attempt.id});
check('paper problem preserves review answers',changed.ok&&changed.review.paperProblem&&changed.review.sections[2].answers['2']==='Task two text');
check('changed paper cannot be marked',req('saveMockWritingReview',{...rp,revision:2,requestID:crypto.randomUUID()}).code==='MOCK_PAPER_CHANGED');
sheets.MockPapers.vals[1][4]=originalPaper;
check('review does not release student results',sheets.Marks.vals.length===1&&sheets.ExamResults.vals.length===1&&req('resumeMockAttempt',{sittingID:id},'student').attempt.assessment==='pending');
console.log(JSON.stringify({mockAttemptChecks:checks,nativeAppsScript:'PENDING',runnerEnabled:false},null,2));
