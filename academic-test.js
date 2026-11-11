import{initializeApp,getApps,getApp}from'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import{getAuth,signInAnonymously,onAuthStateChanged}from'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import{getDatabase,ref,get,set,update,push}from'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import{firebaseConfig}from'./firebase-config.js';
const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app),$=id=>document.getElementById(id);
let test=null,testId=null,uid=null,timer=null,started=0,submitted=false,attemptId=null,progressWrite=Promise.resolve();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanMobile=v=>String(v||'').replace(/\\D/g,'');
// Assigned examinations use the authenticated participant identity and test ID.
// Hide the manual room-code/class/subject entry fields; the assignment is verified
// against Firebase before the examination can begin.
const assignedMode=new URLSearchParams(location.search).has('assignment');
if(assignedMode){
 const heading=document.querySelector('#joinPanel h1');
 const intro=document.querySelector('#joinPanel .muted');
 if(heading)heading.textContent='Assigned Olympiad Examination';
 if(intro)intro.textContent='Your allotted examination details are loaded automatically. No manual entry or Host presence is required.';
 ['pName','pMobile','pSubject','pCode'].forEach(id=>{const el=$(id);if(el){el.readOnly=true;el.required=false;}});
 const cls=$('pClass');if(cls){cls.disabled=true;cls.required=false;}
 const join=$('joinBtn');if(join)join.textContent='Start Assigned Examination';
 const status=$('joinStatus');if(status)status.textContent='Verifying your assignment and loading the examination details…';
}
$('pClass').innerHTML='<option value="">Select class</option>'+Array.from({length:12},(_,i)=>`<option>Class ${i+1}</option>`).join('');
async function init(){try{
 // Wait until Firebase restores the persisted login before deciding whether
 // anonymous authentication is needed; otherwise a signed-in participant could
 // accidentally be switched to a different anonymous UID on page load.
 const current=await new Promise(resolve=>{
  const stop=onAuthStateChanged(auth,user=>{stop();resolve(user||null);});
 });
 if(current && !current.isAnonymous){uid=current.uid;
  if(assignedMode){const profile=JSON.parse(sessionStorage.getItem('quizParticipant')||'{}');$('pName').value=profile.name||'';$('pMobile').value=cleanMobile(profile.phone||'');}
  return;
 }
 const cred=await signInAnonymously(auth);uid=cred.user.uid;
 }catch(e){$('joinStatus').textContent='Unable to connect. Please refresh and try again.'}}init();
$('joinBtn').onclick=async()=>{try{
 if(!uid)throw Error('Please wait for the connection to complete.');
 const params=new URLSearchParams(location.search),assignmentId=params.get('assignment');
 const savedParticipant=JSON.parse(sessionStorage.getItem('quizParticipant')||'null')||{};
 const name=$('pName').value.trim()||savedParticipant.name||'',mobile=cleanMobile($('pMobile').value||savedParticipant.phone||'');
 let className=$('pClass').value||'',subject=$('pSubject').value.trim(),code=$('pCode').value.trim().toUpperCase(),assignment=null;
 if(!assignmentId&&(!name||mobile.length!==10||!className||!subject||!code))throw Error('Enter your name, valid 10-digit mobile number, class, subject and room code.');
 $('joinStatus').textContent=assignmentId?'Loading your allotted examination…':'Checking room and participant access…';
 if(assignmentId){
  if(!uid)throw Error('Please sign in to your approved participant account again.');
  assignment=(await get(ref(db,`testAssignments/${uid}/${assignmentId}`))).val();
  if(!assignment||assignment.category!=='olympiad'||assignment.participantUid!==uid)throw Error('This Olympiad examination is not assigned to your participant account.');
  if(assignment.dueAt&&Date.now()>assignment.dueAt)throw Error('The deadline for this assigned examination has passed.');
  code=String(assignment.roomCode||'').trim().toUpperCase();
  if(!code)throw Error('The Host assignment does not contain a room code. Please ask the Host to refresh or recreate this allotment.');
 }
 const s=await get(ref(db,'academicOlympiadTests')),all=s.val()||{},requestedId=assignment?.testId||params.get('id');
 const found=requestedId&&all[requestedId]?[requestedId,all[requestedId]]:Object.entries(all).find(([id,x])=>x?.roomCode===code);
 if(!found)throw Error('The allotted Olympiad test could not be found. Please ask the Host to verify the selected test.');
 [testId,test]=found;
 if(assignment){
  if(assignment.testId!==testId)throw Error('The allotted test ID does not match the examination record.');
  className=test.className||assignment.className||'';
  subject=test.subject||assignment.subject||'';
  $('pName').value=name||assignment.participantName||'';
  $('pMobile').value=mobile||'';
  const cls=$('pClass');if(cls){cls.value=className;if(!cls.value&&className){const opt=document.createElement('option');opt.value=className;opt.textContent=className;cls.appendChild(opt);cls.value=className;}}
  $('pSubject').value=subject;
  $('pCode').value=code;
 } else if(test.className!==className||String(test.subject).toLowerCase()!==subject.toLowerCase())throw Error('Your selected class or subject does not match this room.');
 if(assignment){
  if(test.status==='CLOSED'||test.examStatus==='CLOSED'||test.active===false)throw Error('This assigned examination has been closed or disabled by the Host.');
  if(!Array.isArray(test.questions)||!test.questions.length)throw Error('The Host has not saved the questions for this assigned examination yet. Please contact the Host.');
  if(test.startMode==='scheduled'&&test.scheduleAt){
   const scheduledAt=new Date(test.scheduleAt).getTime();
   if(Number.isFinite(scheduledAt)&&Date.now()<scheduledAt)throw Error('This assigned examination is scheduled to open at '+new Date(scheduledAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST.');
  }
 } else if(test.status!=='LIVE')throw Error(test.status==='CLOSED'?'This examination is closed.':'The examination has not been started by the administrator.');
 if(!assignmentId&&test.accessMode==='private'){
  const normName=v=>String(v||'').trim().normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase();
  const ok=(test.approvedParticipants||[]).some(p=>cleanMobile(p.mobile)===mobile&&normName(p.name)===normName(name)&&String(p.className||test.className).trim().toLowerCase()===className.trim().toLowerCase());
  if(!ok)throw Error('Access denied. Your name, mobile number and class must match the administrator-approved participant list.');
 }
 const priorSnap=await get(ref(db,`academicOlympiadAttempts/${testId}/${uid}`));
 let priorList=[];
 if(priorSnap.exists()){
  const v=priorSnap.val();
  if(v.status)priorList.push({id:'legacy',...v});
  else priorList=Object.entries(v||{}).map(([id,a])=>({id,...a})).filter(a=>a&&typeof a==='object');
 }
 const last=priorList.filter(a=>a.status==='SUBMITTED').sort((a,b)=>(b.submittedAt||0)-(a.submittedAt||0))[0];
 // Assigned Olympiad examinations allow reattempts; every attempt is stored under a new attemptId.
 if(last&&!assignment&&!confirm('You have already attempted this examination. Do you want to reattempt?')){$('joinStatus').textContent='Your previous result is retained. You may return to the Participant Panel.';return;}
 attemptId=push(ref(db,`academicOlympiadAttempts/${testId}/${uid}`)).key;
 started=Date.now();
 await set(ref(db,`academicOlympiadAttempts/${testId}/${uid}/${attemptId}`),{name,mobile,className,subject,status:'IN PROGRESS',joinedAt:started,answered:0,correct:0,wrong:0,score:0,attemptNo:priorList.length+1,assignmentId:assignmentId||null});
 renderExam();
 }catch(e){$('joinStatus').textContent=e.message||'Unable to join examination.'}};
function renderExam(){
 const qs=Array.isArray(test.questions)?test.questions:[];
 if(!qs.length){$('joinStatus').textContent='No questions have been published for this room.';return;}
 $('joinPanel').classList.add('hidden');$('examPanel').classList.remove('hidden');
 $('testTitle').textContent=test.title;$('testMeta').textContent=`${test.className} · ${test.subject} · ${qs.length} questions · ${test.durationMinutes} minutes`;
 $('testArea').classList.remove('hidden');$('testArea').innerHTML=qs.map((q,i)=>`<div class="q"><b>${i+1}. ${esc(q.question)}</b>${['A','B','C','D'].map(k=>`<label><input type="radio" name="q${i}" value="${k}"> ${k}. ${esc(q.options?.[k]||'')}</label>`).join('')}</div>`).join('');
 $('testArea').addEventListener('change',onAnswerChanged);
 $('testResult').innerHTML='';$('submitBtn').classList.remove('hidden');$('submitBtn').disabled=false;
 let remain=Number(test.durationMinutes||30)*60;
 const tick=()=>{$('timer').textContent=`${String(Math.floor(remain/60)).padStart(2,'0')}:${String(remain%60).padStart(2,'0')}`;if(remain<=0){submit(true);return;}remain--;};
 tick();timer=setInterval(tick,1000);$('submitBtn').onclick=()=>submit(false);
}
function onAnswerChanged(){
 if(submitted)return;
 const result=collectResult();
 // Queue writes so rapid answer changes cannot let an older snapshot overwrite a newer one.
 progressWrite=progressWrite.then(()=>update(ref(db,`academicOlympiadAttempts/${testId}/${uid}/${attemptId}`),{
  ...result,status:'IN PROGRESS',lastActivityAt:Date.now()
 })).catch(e=>{console.warn('Live progress update failed:',e);$('testResult').innerHTML=`<p class="status">Your answer is selected, but live progress could not be synchronized. Check your connection.</p>`;});
}
function collectResult(){
 const qs=test.questions||[];let answered=0,correct=0,wrong=0;const answers={};
 qs.forEach((q,i)=>{const selected=document.querySelector(`input[name="q${i}"]:checked`),v=selected?.value||'';answers[String(i)]=v;if(v){answered++;if(v===String(q.correct||'').toUpperCase())correct++;else wrong++;}});
 const score=correct*Number(test.positiveMarks??1)-wrong*Number(test.negativeMarks??0);
 return{answered,correct,wrong,unanswered:qs.length-answered,score,timeTaken:Math.round((Date.now()-started)/1000),answers};
}
async function submit(auto=false){
 if(submitted)return;
 if(!auto&&!confirm('Are you sure you want to submit your examination? You will not be able to change your answers after submission.'))return;
 submitted=true;if(timer)clearInterval(timer);
 const result=collectResult();
 try{
  await progressWrite;
  await update(ref(db,`academicOlympiadAttempts/${testId}/${uid}/${attemptId}`),{...result,status:'SUBMITTED',submittedAt:Date.now(),lastActivityAt:Date.now()});
  const assignmentId=new URLSearchParams(location.search).get('assignment');if(assignmentId){try{await update(ref(db,`testAssignments/${uid}/${assignmentId}`),{status:'SUBMITTED',submittedAt:Date.now()});}catch(assignmentUpdateError){console.warn('Attempt saved, but assignment status could not be updated under current database rules:',assignmentUpdateError);}}
  document.querySelectorAll('#testArea input').forEach(x=>x.disabled=true);
  $('testArea').classList.add('hidden');$('submitBtn').classList.add('hidden');
  $('testResult').innerHTML=`<section class="result-summary"><h2>Examination submitted successfully</h2><p>Your question paper has been closed.</p><p>Please check your result by clicking the button below.</p><button class="btn" id="checkResultBtn" type="button">Check Result</button></section>`;
  $('testResult').scrollIntoView({behavior:'smooth',block:'start'});
  $('checkResultBtn').onclick=()=>showResultAndDownload(result);
 }catch(e){submitted=false;$('testResult').innerHTML=`<p class="status">Submission could not be saved: ${esc(e.message)}. Please contact the administrator.</p>`;}
}
function showResultAndDownload(r){
 const qs=test.questions||[],rows=qs.map((q,i)=>{const chosen=r.answers[String(i)]||'',key=String(q.correct||'').toUpperCase(),state=!chosen?'Unanswered':chosen===key?'Correct':'Wrong',opt=k=>k?`${k}. ${q.options?.[k]||''}`:'Not answered';return{q,i,chosen,key,state,opt};});
 $('testResult').innerHTML=`<section class="result-summary"><h2>Your Result</h2><p>Answered: ${r.answered} · Correct: ${r.correct} · Wrong: ${r.wrong} · Unanswered: ${r.unanswered}</p><p><b>Score: ${Number(r.score).toFixed(2)}</b></p><button class="btn" id="downloadAgainBtn" type="button">Download Detailed Result PDF</button><p class="muted">The detailed result PDF is being downloaded automatically. You can download it again using the button.</p><button class="btn" id="reattemptHereBtn" type="button">Reattempt This Test</button></section><h2 class="review-heading">Question-wise Detailed Result</h2>${rows.map(d=>`<article class="review-card ${d.state.toLowerCase()}"><div class="review-top"><b>Question ${d.i+1}</b><span class="review-status">${d.state}</span></div><p class="review-question">${esc(d.q.question)}</p><p><b>Your answer:</b> ${esc(d.opt(d.chosen))}</p><p><b>Correct answer:</b> ${esc(d.opt(d.key))}</p></article>`).join('')}`;
 $('downloadAgainBtn').onclick=()=>downloadPdf(r,rows);
 $('reattemptHereBtn').onclick=()=>location.reload();
 downloadPdf(r,rows);
}
function downloadPdf(r,rows){
 const JsPDF=window.jspdf?.jsPDF;
 if(!JsPDF){alert('PDF generator did not load. Please refresh and click Download Detailed Result PDF.');return;}
 const doc=new JsPDF({unit:'mm',format:'a4'});
 const W=210,H=297,L=15,R=15,CW=W-L-R;
 const C={navy:[16,31,61],navy2:[27,49,88],blue:[45,108,223],gold:[217,182,111],paper:[244,247,251],ink:[24,36,58],muted:[101,116,139],red:[197,61,81],redBg:[255,240,241],green:[22,132,91],greenBg:[234,247,240],grey:[122,135,152],greyBg:[240,243,247],white:[255,255,255],line:[220,229,240]};
 const set=(k)=>doc.setTextColor(...C[k]), fill=(k)=>doc.setFillColor(...C[k]), draw=(k)=>doc.setDrawColor(...C[k]);
 const text=(str,x,y,size=8,color='ink',style='normal',opts={})=>{doc.setFont('helvetica',style);doc.setFontSize(size);set(color);doc.text(String(str),x,y,opts);};
 const wrap=(str,max,size=8,style='normal')=>{doc.setFont('helvetica',style);doc.setFontSize(size);return doc.splitTextToSize(String(str??''),max);};
 const rounded=(x,y,w,h,bg,stroke='line',rad=2)=>{fill(bg);draw(stroke);doc.setLineWidth(.35);doc.roundedRect(x,y,w,h,rad,rad,'FD');};
 const line=(x1,y1,x2,y2,color='line')=>{draw(color);doc.setLineWidth(.3);doc.line(x1,y1,x2,y2);};
 const safeName=(test.title||'Olympiad').replace(/[^a-z0-9_-]+/gi,'_');
 let y=15;
 // premium first-page masthead
 fill('blue');doc.rect(0,0,W,4,'F');
 fill('navy');doc.roundedRect(L,y,CW,42,3,3,'F');
 fill('navy2');doc.roundedRect(W-L-34,y,34,42,3,3,'F');
 text('ACADEMIC EXCELLENCE SERIES  /  2026',L+7,y+8,7,'gold','bold');
 text('OLYMPIAD',L+7,y+20,22,'white','bold');
 text('PERFORMANCE REPORT',L+7,y+29,16,'white','bold');
 text('A detailed assessment of your examination performance',L+7,y+36,7.5,'white');
 text('OFFICIAL',W-L-17,y+18,8,'gold','bold',{align:'center'});text('RESULT',W-L-17,y+25,8,'gold','bold',{align:'center'});
 y+=48;
 // identity panel
 rounded(L,y,CW,31,'white');
 const col=[L+5,L+60,L+137];
 text('PARTICIPANT',col[0],y+7,6.2,'muted','bold');
 text($('pName').value.trim()||'Participant',col[0],y+14,10,'ink','bold');
 text(`ROOM  ${test.roomCode||$('pCode').value.trim()}`,col[0],y+23,6.5,'muted');
 text('EXAMINATION',col[1],y+7,6.2,'muted','bold');
 const titleLines=wrap(test.title||'Olympiad Examination',72,8,'bold').slice(0,2);doc.setFont('helvetica','bold');doc.setFontSize(8);set('ink');doc.text(titleLines,col[1],y+14);
 text(`MOBILE  ${cleanMobile($('pMobile').value)}`,col[1],y+25,6.5,'muted');
 text('SUBJECT / CLASS',col[2],y+7,6.2,'muted','bold');
 text(`${test.subject||''} / ${test.className||''}`,col[2],y+15,8.5,'ink','bold');
 text(`${Math.round(Number(r.timeTaken||0))} SEC  •  SUBMITTED`,col[2],y+24,6.2,'muted','bold');
 y+=37;
 text('PERFORMANCE OVERVIEW',L,y+3,12,'navy','bold');y+=7;
 const metrics=[['TOTAL',rows.length,'navy'],['ANSWERED',r.answered,'blue'],['CORRECT',r.correct,'green'],['WRONG',r.wrong,'red'],['SKIPPED',r.unanswered,'grey']];
 const gap=2, mw=(CW-gap*4)/5;
 metrics.forEach((m,i)=>{const x=L+i*(mw+gap);rounded(x,y,mw,22,'white');text(m[0],x+mw/2,y+7,6,'muted','bold',{align:'center'});text(m[1],x+mw/2,y+17,17,m[2],'bold',{align:'center'});});
 y+=27;
 // score and accuracy block
 rounded(L,y,60,34,'navy','navy');
 text('FINAL SCORE',L+30,y+9,6.5,'white','bold',{align:'center'});text(Number(r.score||0).toFixed(2),L+30,y+23,23,'white','bold',{align:'center'});text('MARKS OBTAINED',L+30,y+29,6,'white','bold',{align:'center'});
 rounded(L+63,y,CW-63,34,'white');
 text('ACCURACY',L+69,y+9,6.5,'muted','bold');
 const accuracy=r.answered?Math.round((Number(r.correct||0)/Number(r.answered))*100):0;
 text(`${accuracy}%`,L+69,y+23,20,accuracy===100?'green':accuracy>=50?'blue':'red','bold');
 text(`${r.correct} correct  /  ${r.answered} attempted`,L+105,y+15,7,'muted');
 text(`${r.wrong} incorrect response(s)  •  ${r.unanswered} not attempted`,L+105,y+23,7,'muted');
 y+=40;
 // focus panel: first wrong answer if present
 const wrongRows=rows.filter(d=>d.state==='Wrong');
 if(wrongRows.length){
  text('REVIEW YOUR INCORRECT ANSWERS',L,y+3,11,'navy','bold');y+=7;
  const d=wrongRows[0];rounded(L,y,CW,43,'white','red');
  fill('red');doc.roundedRect(L,y,CW,8,2,2,'F');text(`QUESTION ${d.i+1}  /  INCORRECT`,L+4,y+5.5,6.5,'white','bold');
  const ql=wrap(d.q.question,CW-9,8,'bold');doc.setFont('helvetica','bold');doc.setFontSize(8);set('ink');doc.text(ql,L+4,y+15);
  let ay=y+17+ql.length*3.7;
  rounded(L+3,ay,CW/2-5,Math.max(15,38-(ay-y)),'redBg','red');
  rounded(L+CW/2+2,ay,CW/2-5,Math.max(15,38-(ay-y)),'greenBg','green');
  text('YOUR RESPONSE',L+6,ay+5,6,'red','bold');
  const yl=wrap(d.opt(d.chosen),CW/2-13,7.2);doc.setFont('helvetica','normal');doc.setFontSize(7.2);set('ink');doc.text(yl,L+6,ay+10);
  text('EXPECTED RESPONSE',L+CW/2+5,ay+5,6,'green','bold');
  const cl=wrap(d.opt(d.key),CW/2-13,7.2);doc.setFont('helvetica','normal');doc.setFontSize(7.2);set('ink');doc.text(cl,L+CW/2+5,ay+10);
  y+=46;
 }else{
  text('ANSWER REVIEW',L,y+3,11,'navy','bold');y+=9;
 }
 text('ANSWER KEY & QUESTION-WISE REVIEW',L,y+2,9,'navy','bold');
 text('Red = wrong  •  Green = correct  •  Grey = not attempted',L+CW,y+2,6,'muted','normal',{align:'right'});
 // first page footer space; question cards begin on next page for consistent layout
 doc.addPage();
 let pageY=17;
 const addPageHeader=()=>{
   fill('navy');doc.rect(0,0,W,13,'F');text('OLYMPIAD PERFORMANCE REPORT',L,8.5,7,'white','bold');
   text(`${test.subject||''}  /  ${test.className||''}`,W-L,8.5,7,'gold','bold',{align:'right'});pageY=20;
 };
 addPageHeader();
 rows.forEach(d=>{
   const isWrong=d.state==='Wrong',isCorrect=d.state==='Correct';
   const status=isWrong?'WRONG ANSWER':isCorrect?'CORRECT':'NOT ATTEMPTED';
   const statusColor=isWrong?'red':isCorrect?'green':'grey';
   const yourBg=isWrong?'redBg':isCorrect?'greenBg':'greyBg';
   const yourColor=isWrong?'red':isCorrect?'green':'grey';
   const qLines=wrap(`${d.i+1}. ${d.q.question}`,CW-10,8.2,'bold');
   const yourLines=wrap(d.opt(d.chosen),CW/2-12,7.3,'normal');
   const correctLines=wrap(d.opt(d.key),CW/2-12,7.3,'normal');
   const ansH=Math.max(15,10+Math.max(yourLines.length,correctLines.length)*3.5);
   const cardH=7+3+qLines.length*4+2+ansH+3;
   if(pageY+cardH>H-20){doc.addPage();addPageHeader();}
   rounded(L,pageY,CW,cardH,'white');
   fill(statusColor);doc.roundedRect(L,pageY,CW,7,1.5,1.5,'F');
   text(`QUESTION ${String(d.i+1).padStart(2,'0')}`,L+3,pageY+4.8,6.5,'white','bold');
   text(status,W-L-3,pageY+4.8,6.2,'white','bold',{align:'right'});
   doc.setFont('helvetica','bold');doc.setFontSize(8.2);set('ink');doc.text(qLines,L+4,pageY+11);
   const by=pageY+12+qLines.length*4;
   const half=(CW-7)/2;
   rounded(L+3,by,half,ansH,yourBg,yourColor);
   rounded(L+4+half,by,half,ansH,'greenBg','green');
   text('YOUR ANSWER',L+6,by+5.5,5.8,yourColor,'bold');
   doc.setFont('helvetica','normal');doc.setFontSize(7.3);set('ink');doc.text(yourLines,L+6,by+10);
   text('CORRECT ANSWER',L+7+half,by+5.5,5.8,'green','bold');
   doc.setFont('helvetica','normal');doc.setFontSize(7.3);set('ink');doc.text(correctLines,L+7+half,by+10);
   pageY+=cardH+3;
 });
 // consistent premium footer on all pages
 const total=doc.internal.getNumberOfPages();
 for(let i=1;i<=total;i++){
   doc.setPage(i);line(L,H-13,W-L,H-13,'line');
   text('OLYMPIAD PERFORMANCE REPORT',L,H-8,6,'muted','bold');
   text(`PARTICIPANT COPY  •  ${i} / ${total}`,W-L,H-8,6,'muted','normal',{align:'right'});
 }
 doc.save(`${safeName}_${cleanMobile($('pMobile').value)}_Detailed_Result.pdf`);
}
