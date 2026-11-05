import{initializeApp,getApps,getApp}from'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import{getAuth,signInAnonymously}from'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import{getDatabase,ref,get,set,update,push}from'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import{firebaseConfig}from'./firebase-config.js';
const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app),$=id=>document.getElementById(id);
let test=null,testId=null,uid=null,timer=null,started=0,submitted=false,attemptId=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanMobile=v=>String(v||'').replace(/\D/g,'');
$('pClass').innerHTML='<option value="">Select class</option>'+Array.from({length:12},(_,i)=>`<option>Class ${i+1}</option>`).join('');
async function init(){try{const cred=await signInAnonymously(auth);uid=cred.user.uid}catch(e){$('joinStatus').textContent='Unable to connect. Please refresh and try again.'}}init();
$('joinBtn').onclick=async()=>{try{
 if(!uid)throw Error('Please wait for the connection to complete.');
 const name=$('pName').value.trim(),mobile=cleanMobile($('pMobile').value),className=$('pClass').value,subject=$('pSubject').value.trim(),code=$('pCode').value.trim().toUpperCase();
 if(!name||mobile.length!==10||!className||!subject||!code)throw Error('Enter your name, valid 10-digit mobile number, class, subject and room code.');
 $('joinStatus').textContent='Checking room and participant access…';
 const s=await get(ref(db,'academicOlympiadTests')),all=s.val()||{},requestedId=new URLSearchParams(location.search).get('id');
 const found=requestedId&&all[requestedId]?[requestedId,all[requestedId]]:Object.entries(all).find(([id,x])=>x?.roomCode===code);
 if(!found)throw Error('Invalid room code.');
 [testId,test]=found;
 if(test.className!==className||String(test.subject).toLowerCase()!==subject.toLowerCase())throw Error('Your selected class or subject does not match this room.');
 if(test.status!=='LIVE')throw Error(test.status==='CLOSED'?'This examination is closed.':'The examination has not been started by the administrator.');
 if(test.accessMode==='private'){
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
 if(last&&!confirm('You have already attempted this examination. Do you want to reattempt?')){$('joinStatus').textContent='Your previous result is retained. You may return to the Participant Panel.';return;}
 attemptId=push(ref(db,`academicOlympiadAttempts/${testId}/${uid}`)).key;
 started=Date.now();
 await set(ref(db,`academicOlympiadAttempts/${testId}/${uid}/${attemptId}`),{name,mobile,className,subject,status:'IN PROGRESS',joinedAt:started,answered:0,correct:0,wrong:0,score:0,attemptNo:priorList.length+1});
 renderExam();
 }catch(e){$('joinStatus').textContent=e.message||'Unable to join examination.'}};
function renderExam(){
 const qs=Array.isArray(test.questions)?test.questions:[];
 if(!qs.length){$('joinStatus').textContent='No questions have been published for this room.';return;}
 $('joinPanel').classList.add('hidden');$('examPanel').classList.remove('hidden');
 $('testTitle').textContent=test.title;$('testMeta').textContent=`${test.className} · ${test.subject} · ${qs.length} questions · ${test.durationMinutes} minutes`;
 $('testArea').classList.remove('hidden');$('testArea').innerHTML=qs.map((q,i)=>`<div class="q"><b>${i+1}. ${esc(q.question)}</b>${['A','B','C','D'].map(k=>`<label><input type="radio" name="q${i}" value="${k}"> ${k}. ${esc(q.options?.[k]||'')}</label>`).join('')}</div>`).join('');
 $('testResult').innerHTML='';$('submitBtn').classList.remove('hidden');$('submitBtn').disabled=false;
 let remain=Number(test.durationMinutes||30)*60;
 const tick=()=>{$('timer').textContent=`${String(Math.floor(remain/60)).padStart(2,'0')}:${String(remain%60).padStart(2,'0')}`;if(remain<=0){submit(true);return;}remain--;};
 tick();timer=setInterval(tick,1000);$('submitBtn').onclick=()=>submit(false);
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
  await update(ref(db,`academicOlympiadAttempts/${testId}/${uid}/${attemptId}`),{...result,status:'SUBMITTED',submittedAt:Date.now()});
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
 const JsPDF=window.jspdf?.jsPDF;if(!JsPDF){alert('PDF generator did not load. Please refresh and click Download Detailed Result PDF.');return;}
 const doc=new JsPDF({unit:'mm',format:'a4'});let y=16;
 doc.setFontSize(16);doc.text('OLYMPIAD EXAMINATION - DETAILED RESULT',105,y,{align:'center'});y+=10;
 doc.setFontSize(10);doc.text(`Name: ${$('pName').value.trim()}    Mobile: ${cleanMobile($('pMobile').value)}`,14,y);y+=6;
 doc.text(`Class: ${test.className}    Subject: ${test.subject}`,14,y);y+=6;
 doc.text(`Room: ${test.roomCode||$('pCode').value.trim()}    Exam: ${test.title}`,14,y);y+=8;
 doc.setFontSize(11);doc.text(`Answered: ${r.answered}   Correct: ${r.correct}   Wrong: ${r.wrong}   Unanswered: ${r.unanswered}   Score: ${Number(r.score).toFixed(2)}`,14,y);y+=9;
 rows.forEach(d=>{
  const qLines=doc.splitTextToSize(`${d.i+1}. ${d.q.question}`,180),lines=[...qLines,`Your answer: ${d.opt(d.chosen)}`,`Correct answer: ${d.opt(d.key)}`,`Result: ${d.state}`];
  const needed=lines.reduce((n,line)=>n+doc.splitTextToSize(String(line),180).length*5,0)+5;if(y+needed>280){doc.addPage();y=16;}
  doc.setFont(undefined,'bold');const first=doc.splitTextToSize(lines[0],180);doc.text(first,14,y);y+=first.length*5;doc.setFont(undefined,'normal');
  for(const line of lines.slice(1)){const ls=doc.splitTextToSize(String(line),180);doc.text(ls,14,y);y+=ls.length*5;}y+=3;
 });
 const safe=(test.title||'Olympiad').replace(/[^a-z0-9_-]+/gi,'_');
 doc.save(`${safe}_${cleanMobile($('pMobile').value)}_Detailed_Result.pdf`);
}
