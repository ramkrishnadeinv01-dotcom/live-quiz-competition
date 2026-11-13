import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth,onAuthStateChanged,signOut,reload,getIdToken } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase,ref,get,set,update } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const $=id=>document.getElementById(id);
let profile=null,uid=null,assignments=[],pendingEntries=[];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function status(t){$("pageStatus").textContent=t;}
function showSection(which){["pending","completed","results"].forEach(k=>{$(k+"Section").classList.toggle("at-hidden",k!==which);document.querySelector(`[data-section="${k}"]`).classList.toggle("active",k===which);});}
document.querySelectorAll(".at-tab").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.section)));
$("closeResultModal")?.addEventListener("click",closeResultModal);
$("resultModal")?.addEventListener("click",e=>{if(e.target===$("resultModal"))closeResultModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("resultModal")?.classList.contains("open"))closeResultModal();});

$("backBtn").onclick=()=>location.href="student.html";
$("refreshBtn").onclick=()=>loadAssignments();
$("logoutBtn").onclick=async()=>{if(!confirm("Log out of your participant account? Your profile and examination history will remain saved."))return;await signOut(auth);location.href="student.html";};
function startExam(a){if(a.category==="olympiad")location.href=`academic-test.html?id=${encodeURIComponent(a.testId)}&assignment=${encodeURIComponent(a.id)}`;else if(a.category==="mcq")location.href=`mcq.html?room=${encodeURIComponent(a.testId)}&assignment=${encodeURIComponent(a.id)}`;else if(a.category==="general")location.href=`general.html?room=${encodeURIComponent(a.testId)}&assignment=${encodeURIComponent(a.id)}`;else alert("Unsupported examination category.");}
async function latestAttempt(a){
 if(a.category==="olympiad"){
  const snap=await get(ref(db,`academicOlympiadAttempts/${a.testId}/${uid}`)),v=snap.val()||{};
  const arr=v.status?[v]:Object.values(v).filter(x=>x&&typeof x==="object");
  return arr.filter(x=>x.status==="SUBMITTED" && (x.assignmentId===a.id || (!x.assignmentId && Number(a.generation||1)===1))).sort((x,y)=>(y.submittedAt||0)-(x.submittedAt||0))[0]||null;
 }
 const phone=String(profile?.phone||"").replace(/\D/g,"");
 if(a.category==="mcq"){const snap=await get(ref(db,`rooms/${a.testId}/mcqAnswers/${phone}`));const v=snap.val();return snap.exists()&&v?.status==="SUBMITTED"&&Number(v.submittedAt||0)>=Number(a.assignedAt||0)?v:null;}
 if(a.category==="general"){const snap=await get(ref(db,`rooms/${a.testId}/generalAnswers/${phone}`));const v=snap.val();return snap.exists()&&Number(v.submittedAt||0)>=Number(a.assignedAt||0)?v:null;}
 return null;
}
function meta(label,value){return `<div><small>${esc(label)}</small><b>${esc(value||"—")}</b></div>`;}
function card(a,latest,done,expired){
 const category=String(a.category||"").toUpperCase(),title=a.testTitle||"Assigned Examination";
 const due=a.dueAt?new Date(a.dueAt).toLocaleString("en-IN"):"No deadline";
 const assigned=a.assignedAt?new Date(a.assignedAt).toLocaleString("en-IN"):"—";
 const state=done?"COMPLETED":expired?"OVERDUE":"PENDING";
 const stateClass=done?"done":expired?"over":"";
 const actions=done?`<button class="at-btn" data-action="reattempt" data-id="${esc(a.id)}">↻ Reattempt Test</button><button class="at-btn danger" data-action="delete" data-id="${esc(a.id)}">Delete Completed Assignment</button>`:(!expired?`<button class="at-btn" data-action="start" data-id="${esc(a.id)}">Start Examination →</button>`:`<span class="at-status over">Deadline passed</span>`);
 const result=latest?(a.category==="olympiad"?`Score: ${Number(latest.score||0).toFixed(2)} · Correct: ${Number(latest.correct||0)} · Wrong: ${Number(latest.wrong||0)} · Unanswered: ${Number(latest.unanswered||0)}`:a.category==="mcq"?`Correct: ${Number(latest.correctCount||0)} · Wrong: ${Number(latest.wrongCount||0)} · Answered: ${Number(latest.answeredCount||0)}`:"Submission recorded."):"";
 const reviewActions=latest?`<button class="at-btn" data-action="view-result" data-id="${esc(a.id)}">📋 View Detailed Result</button><button class="at-btn secondary" data-action="download-result" data-id="${esc(a.id)}">⬇ Download Result PDF</button>`:"";
 return `<article class="at-card"><div class="at-card-head"><h3>${esc(title)}</h3><span class="at-status ${stateClass}">${state}${a.isLatest===false?" · PREVIOUS ALLOTMENT":" · LATEST ALLOTMENT"}</span></div><div class="at-meta">${meta("EXAM CATEGORY",category)}${meta("ROOM CODE",a.roomCode||a.testId)}${meta("ASSIGNED ON",assigned)}${meta("DUE DATE",due)}${meta("CLASS",a.className||"—")}${meta("SUBJECT",a.subject||"—")}</div><div style="color:#cbd9ed;font-size:13px">Assignment ID: ${esc(a.id)}</div>${result?`<div class="at-result">${esc(result)}<br>Submitted: ${latest?.submittedAt?new Date(latest.submittedAt).toLocaleString("en-IN"):"Recorded"}</div>`:""}<div class="at-actions">${reviewActions}${actions}</div><div class="at-detail" id="detail-${esc(a.id)}"></div></article>`;
}

async function getQuestionReview(a,attempt){
 let questions=[];
 if(a.category==="olympiad"){
  const snap=await get(ref(db,`academicOlympiadTests/${a.testId}`));
  questions=Array.isArray(snap.val()?.questions)?snap.val().questions:[];
  return questions.map((q,i)=>{const chosen=String(attempt.answers?.[String(i)]||"").toUpperCase(),key=String(q.correct||"").toUpperCase(),opt=k=>k?`${k}. ${q.options?.[k]||""}`:"Not answered";return{number:i+1,question:q.question||`Question ${i+1}`,your:opt(chosen),correct:opt(key),status:!chosen?"Unanswered":chosen===key?"Correct":"Wrong"};});
 }
 if(a.category==="mcq"){
  const snap=await get(ref(db,`rooms/${a.testId}`)),room=snap.val()||{},raw=room.mcqQuestions||{};
  const entries=Array.isArray(raw)?raw.map((q,i)=>[`q${i+1}`,q]):Object.entries(raw);
  entries.sort((x,y)=>Number((String(x[0]).match(/\d+/)||[0])[0])-Number((String(y[0]).match(/\d+/)||[0])[0]));
  return entries.map(([id,q],i)=>{const key=String(q.correct||q.answer||"").toUpperCase(),chosen=String(attempt.answers?.[id]||"").toUpperCase(),opts=q.options||{},getOpt=k=>opts[k]??opts[k.toLowerCase()]??q[`option${k}`]??q[`Option${k}`]??"",opt=k=>k?`${k}. ${getOpt(k)}`:"Not answered";return{number:i+1,question:q.text||q.question||`Question ${i+1}`,your:opt(chosen),correct:opt(key),status:!chosen?"Unanswered":key?(chosen===key?"Correct":"Wrong"):"Answer key unavailable"};});
 }
 if(a.category==="general"){
  const snap=await get(ref(db,`rooms/${a.testId}`)),raw=snap.val()?.generalQuestions||{};
  const entries=Array.isArray(raw)?raw.map((q,i)=>[`q${i+1}`,q]):Object.entries(raw);
  return entries.map(([id,q],i)=>({number:i+1,question:q.text||q.question||`Question ${i+1}`,your:String(attempt.answers?.[id]||"Not answered"),correct:"Not applicable — descriptive answer",status:"Submitted"}));
 }
 return [];
}
function resultMarkup(rows){return `<div class="at-review-list">${rows.map(r=>`<article class="at-review-row"><div class="at-review-head"><b>Question ${r.number}</b><span class="at-review-status ${String(r.status).toLowerCase()}">${esc(r.status)}</span></div><p class="at-review-question">${esc(r.question)}</p><p><strong>Your answer:</strong> ${esc(r.your)}</p><p><strong>Correct answer:</strong> ${esc(r.correct)}</p></article>`).join("")||'<p>Question-wise review is not available for this examination.</p>'}</div>`;}
function closeResultModal(){
 const modal=$("resultModal");if(modal){modal.classList.remove("open");modal.setAttribute("aria-hidden","true");}
 document.body.classList.remove("at-modal-open");
}
function openResultModal(rows){
 const modal=$("resultModal"),body=$("resultModalBody");
 if(!modal||!body){alert("Result viewer is unavailable. Please refresh the page.");return;}
 body.innerHTML=resultMarkup(rows);
 modal.classList.add("open");modal.setAttribute("aria-hidden","false");document.body.classList.add("at-modal-open");
 $("closeResultModal")?.focus();
}
async function downloadResultPdf(a,attempt,rows){
 const JsPDF=window.jspdf?.jsPDF;if(!JsPDF){alert("PDF generator is not available. Please refresh the page and try again.");return;}
 const doc=new JsPDF({unit:"mm",format:"a4"}),W=210,L=15,CW=180,R=L+CW,contentX=L+4,contentW=CW-8;
 const pageBottom=282,lineH=4.8;let y=18;
 const addHeader=()=>{doc.setFillColor(12,37,72);doc.rect(0,0,W,38,"F");doc.setTextColor(255,226,160);doc.setFont("helvetica","bold");doc.setFontSize(18);doc.text("WORLD OF EXAM",L,16);doc.setFontSize(13);doc.text("DETAILED EXAMINATION RESULT",L,27);};
 const ensureSpace=h=>{if(y+h>pageBottom){doc.addPage();y=18;}};
 const addInfo=(label,value,size=9)=>{doc.setFont("helvetica","normal");doc.setFontSize(size);const lines=doc.splitTextToSize(`${label}${value}`,contentW);const h=Math.max(lineH,lines.length*lineH);ensureSpace(h+1);doc.setTextColor(25,40,65);doc.text(lines,contentX,y);y+=h+1;};
 addHeader();doc.setTextColor(25,40,65);y=49;
 addInfo("Participant: ",profile?.name||"Participant",10);
 addInfo("Examination: ",a.testTitle||"Examination",10);
 addInfo("Subject: ",a.subject||"Other Tests");
 addInfo("Category: ",String(a.category||"").toUpperCase());
 addInfo("Submitted: ",attempt.submittedAt?new Date(attempt.submittedAt).toLocaleString("en-IN"):"Recorded");
 const score=a.category==="olympiad"?`Score: ${Number(attempt.score||0).toFixed(2)} | Correct: ${attempt.correct||0} | Wrong: ${attempt.wrong||0} | Unanswered: ${attempt.unanswered||0}`:a.category==="mcq"?`Correct: ${attempt.correctCount||0} | Wrong: ${attempt.wrongCount||0} | Answered: ${attempt.answeredCount||0}`:"Submission recorded";
 const scoreLines=doc.splitTextToSize(score,contentW);const scoreH=Math.max(13,scoreLines.length*lineH+6);ensureSpace(scoreH+6);
 doc.setFillColor(238,243,250);doc.roundedRect(L,y,CW,scoreH,2,2,"F");doc.setTextColor(25,40,65);doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text(scoreLines,contentX,y+6);y+=scoreH+8;
 rows.forEach(r=>{
  doc.setFont("helvetica","bold");doc.setFontSize(9);
  const qLines=doc.splitTextToSize(`${r.number}. ${r.question}`,contentW);
  doc.setFont("helvetica","normal");doc.setFontSize(8.5);
  const yourLines=doc.splitTextToSize(`Your answer: ${r.your}`,contentW);
  const correctLines=doc.splitTextToSize(`Correct answer: ${r.correct}`,contentW);
  const statusH=6,qH=qLines.length*lineH,yourH=yourLines.length*lineH,correctH=correctLines.length*lineH;
  const h=5+statusH+qH+3+yourH+2+correctH+5;
  ensureSpace(h+3);
  doc.setDrawColor(210,220,233);
  const fill=r.status==="Wrong"?[255,240,241]:r.status==="Correct"?[235,248,241]:[245,247,250];
  doc.setFillColor(fill[0],fill[1],fill[2]);doc.roundedRect(L,y,CW,h,2,2,"FD");
  doc.setFont("helvetica","bold");doc.setFontSize(8);
  doc.setTextColor(r.status==="Wrong"?175:r.status==="Correct"?20:70,r.status==="Wrong"?45:100,r.status==="Wrong"?55:75);
  doc.text(String(r.status).toUpperCase(),R-4,y+6,{align:"right"});
  let yy=y+5+statusH;
  doc.setTextColor(25,40,65);doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text(qLines,contentX,yy);yy+=qH+3;
  doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.text(yourLines,contentX,yy);yy+=yourH+2;
  doc.text(correctLines,contentX,yy);
  y+=h+3;
 });
 const safe=(a.testTitle||"Examination").replace(/[^a-z0-9_-]+/gi,"_");doc.save(`${safe}_Detailed_Result.pdf`);
}
async function handleResultAction(btn){const a=assignments.find(x=>x.id===btn.dataset.id);if(!a)return;const attempt=await latestAttempt(a);if(!attempt){alert("The saved submission could not be found.");return;}try{btn.disabled=true;btn.textContent="Loading result…";const rows=await getQuestionReview(a,attempt);if(btn.dataset.action==="view-result"){openResultModal(rows);}else await downloadResultPdf(a,attempt,rows);}catch(e){console.error(e);alert("Unable to load detailed result: "+(e.message||e));}finally{btn.disabled=false;btn.textContent=btn.dataset.action==="view-result"?"📋 View Detailed Result":"⬇ Download Result PDF";}}

async function loadAssignments(){
 if(!uid)return;
 status("Loading your assignments and examination history…");
 ["pendingList","completedList","resultsList"].forEach(id=>$(id).innerHTML='<div class="at-empty">Loading…</div>');
 try{
  const snap=await get(ref(db,`testAssignments/${uid}`));
  assignments=Object.entries(snap.val()||{}).map(([id,a])=>({...a,id})).filter(a=>a&&a.status!=="ARCHIVED").sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0));
  const pending=[],completed=[],results=[];
  for(const a of assignments){
   const latest=await latestAttempt(a),done=!!latest||a.status==="SUBMITTED",expired=!!(a.dueAt&&Date.now()>a.dueAt);
   const html=card(a,latest,done,expired);
   if(done){completed.push(html);results.push(html);}else pending.push({html,a});
  }
  pendingEntries=pending;
  const pendingSubjectFilter=$("pendingSubjectFilter");
  const pendingSubjects=[...new Set(pendingEntries.map(x=>String(x.a?.subject||"").trim()||"Other Tests"))].sort((a,b)=>a.localeCompare(b));
  if(pendingSubjectFilter){const previous=pendingSubjectFilter.value;pendingSubjectFilter.innerHTML='<option value="">All Subjects</option>'+pendingSubjects.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");pendingSubjectFilter.value=pendingSubjects.includes(previous)?previous:"";}
  const renderPendingBySubject=()=>{const selected=pendingSubjectFilter?.value||"";const filtered=pendingEntries.filter(x=>!selected||(String(x.a?.subject||"").trim()||"Other Tests")===selected);$("pendingList").innerHTML=filtered.map(x=>x.html).join("")||'<div class="at-empty">No pending examinations under this subject.</div>';};
  if(pendingSubjectFilter)pendingSubjectFilter.onchange=renderPendingBySubject;renderPendingBySubject();
  $("completedList").innerHTML=completed.join("")||'<div class="at-empty">No completed examinations yet.</div>';
  $("resultsList").innerHTML=results.join("")||'<div class="at-empty">Your submitted results will appear here after you complete an allotted test.</div>';
  $("pendingCount").textContent=`${pending.length} examination(s) awaiting submission`;
  $("completedCount").textContent=`${completed.length} submitted examination(s)`;
  $("resultCount").textContent=`${results.length} result record(s) available`;
  document.querySelectorAll("[data-action]").forEach(btn=>btn.addEventListener("click",async()=>{
   const a=assignments.find(x=>x.id===btn.dataset.id);if(!a)return;
   if(btn.dataset.action==="view-result"||btn.dataset.action==="download-result"){await handleResultAction(btn);return;}
   if(btn.dataset.action==="start"||btn.dataset.action==="reattempt"){startExam(a);return;}
   if(btn.dataset.action==="delete"){
    const latest=await latestAttempt(a);if(!latest&&a.status!=="SUBMITTED"){alert("Only a completed assignment can be deleted.");return;}
    if(!confirm(`Delete the completed assignment “${a.testTitle||"this examination"}”? Your saved result history will remain in the examination records.`))return;
    try{await update(ref(db,`testAssignments/${uid}/${a.id}`),{status:"ARCHIVED",archivedAt:Date.now(),archivedBy:uid,isLatest:false});await loadAssignments();}catch(e){alert("Unable to archive this completed assignment: "+(e.message||e));}
   }
  }));
  status(`Loaded ${assignments.length} allotted examination(s). Your profile and saved results remain linked to your account.`);
 }catch(e){console.error(e);status("Unable to load allotted tests: "+(e.message||e));}
}
onAuthStateChanged(auth,async user=>{
 if(!user){status("Please sign in to your approved participant account.");setTimeout(()=>location.href="student.html",1200);return;}
 if(user.isAnonymous){await signOut(auth);location.href="student.html";return;}
 try{await reload(user);await getIdToken(user,true);}catch(e){console.warn(e);}
 if(!user.emailVerified){status("Please verify your email and sign in again.");return;}
 uid=user.uid;
 try{
  const snap=await get(ref(db,`participants/${uid}`));profile=snap.val();
  if(!profile||profile.status!=="approved"){status("Your participant account is not approved. Please contact the Administrator.");return;}
  $("profileLine").innerHTML=`<span>👤 ${esc(profile.name||"Participant")}</span><span>📱 ${esc(profile.phone||"")}</span><span>✉ ${esc(user.email||"")}</span><span>Account: Approved</span>`;
  await loadAssignments();
 }catch(e){status("Account verification failed: "+(e.message||e));}
});
