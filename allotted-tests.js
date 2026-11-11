import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth,onAuthStateChanged,signOut,reload,getIdToken } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase,ref,get,set,update } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const $=id=>document.getElementById(id);
let profile=null,uid=null,assignments=[];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function status(t){$("pageStatus").textContent=t;}
function showSection(which){["pending","completed","results"].forEach(k=>{$(k+"Section").classList.toggle("at-hidden",k!==which);document.querySelector(`[data-section="${k}"]`).classList.toggle("active",k===which);});}
document.querySelectorAll(".at-tab").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.section)));
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
 return `<article class="at-card"><div class="at-card-head"><h3>${esc(title)}</h3><span class="at-status ${stateClass}">${state}${a.isLatest===false?" · PREVIOUS ALLOTMENT":" · LATEST ALLOTMENT"}</span></div><div class="at-meta">${meta("EXAM CATEGORY",category)}${meta("ROOM CODE",a.roomCode||a.testId)}${meta("ASSIGNED ON",assigned)}${meta("DUE DATE",due)}${meta("CLASS",a.className||"—")}${meta("SUBJECT",a.subject||"—")}</div><div style="color:#cbd9ed;font-size:13px">Assignment ID: ${esc(a.id)}</div>${result?`<div class="at-result">${esc(result)}<br>Submitted: ${latest?.submittedAt?new Date(latest.submittedAt).toLocaleString("en-IN"):"Recorded"}</div>`:""}<div class="at-actions">${actions}</div></article>`;
}
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
   if(done){completed.push(html);results.push(html);}else pending.push(html);
  }
  $("pendingList").innerHTML=pending.join("")||'<div class="at-empty">You have no pending allotted examinations.</div>';
  $("completedList").innerHTML=completed.join("")||'<div class="at-empty">No completed examinations yet.</div>';
  $("resultsList").innerHTML=results.join("")||'<div class="at-empty">Your submitted results will appear here after you complete an allotted test.</div>';
  $("pendingCount").textContent=`${pending.length} examination(s) awaiting submission`;
  $("completedCount").textContent=`${completed.length} submitted examination(s)`;
  $("resultCount").textContent=`${results.length} result record(s) available`;
  document.querySelectorAll("[data-action]").forEach(btn=>btn.addEventListener("click",async()=>{
   const a=assignments.find(x=>x.id===btn.dataset.id);if(!a)return;
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
