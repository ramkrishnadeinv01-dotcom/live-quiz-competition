import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, get, runTransaction, update, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig),db=getDatabase(app);
const $=id=>document.getElementById(id);
let room="",studentKey="",selected="",questionNo=0,openedAt=0,answered=false,timer,violationCount=0,lastViolationAt=0;
let questionTimerSeconds=30;
const opts=["A","B","C","D"];
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function msg(t,cls=""){$("joinMsg").textContent=t;$("joinMsg").className=cls;}
function normalizePhone(v){v=v.trim().replace(/[\s()-]/g,"");if(/^\+91\d{10}$/.test(v))return v;if(/^91\d{10}$/.test(v))return "+"+v;if(/^\d{10}$/.test(v))return "+91"+v;return "";}
function phoneKey(phone){return phone.replace(/\D/g,"");}
function saveParticipantSession(){
 const phone=normalizePhone($("phoneNumber").value);
 const name=$("studentName").value.trim();
 const designation=$("designation").value.trim();
 const placeOfPosting=$("placeOfPosting").value.trim();
 if(!phone)return msg("Enter a valid 10-digit Indian mobile number.");
 if(!name||!designation||!placeOfPosting)return msg("Please fill Name, Designation, Place of Posting and Mobile Number.");
 sessionStorage.setItem("quizParticipant",JSON.stringify({name,designation,placeOfPosting,phone}));
 showDashboard({name,designation,placeOfPosting,phone});
}
function showDashboard(p){
 $("joinCard").classList.add("hidden");$("dashboardCard").classList.remove("hidden");$("quizCard").classList.add("hidden");
 $("participantWelcome").textContent=`Welcome, ${p.name} • ${p.designation} • ${p.placeOfPosting}`;
 $("connection").textContent="Ready";
}
function openRoomModal(type){
 $("roomModal").classList.remove("hidden");
 $("assignmentRoomCode").value="";$("roomModalMsg").textContent="";
 const title=type==="quiz"?"Join Quiz":type==="mcq"?"Exam — MCQ Based":"General Question Based Exam";
 $("roomModalTitle").textContent=title;$("roomModalText").textContent=`Please insert the room code for ${title.toLowerCase()}.`;
 $("roomContinueBtn").dataset.type=type;$("assignmentRoomCode").focus();
}
function closeRoomModal(){$("roomModal").classList.add("hidden");}
async function enterAssignment(type){
 const code=$("assignmentRoomCode").value.trim().toUpperCase();
 if(!/^[A-Z0-9]{6}$/.test(code)){ $("roomModalMsg").className="status blocked";$("roomModalMsg").textContent="Enter a valid 6-character room code.";return; }
 const rs=await get(ref(db,`rooms/${code}`));
 if(!rs.exists()){ $("roomModalMsg").className="status blocked";$("roomModalMsg").textContent="Room not found.";return; }
 const r=rs.val()||{};
 if(r.competitionClosed||r.state==="competition_closed"){
   if(type==="quiz"){ $("roomModalMsg").className="status blocked";$("roomModalMsg").textContent="This quiz competition is closed.";return; }
 }
 const p=JSON.parse(sessionStorage.getItem("quizParticipant")||"null");
 if(!p){closeRoomModal();return;}
 if(type==="mcq"){sessionStorage.setItem("mcqRoom",code);window.location.href=`mcq.html?room=${encodeURIComponent(code)}`;return;}
 if(type==="general"){sessionStorage.setItem("generalRoom",code);window.location.href=`general.html?room=${encodeURIComponent(code)}`;return;}
 closeRoomModal(); await joinExistingQuiz(code,p);
}
async function joinExistingQuiz(code,p){
 room=code; const phone=p.phone;
 studentKey=phoneKey(phone);
 const rs=await get(ref(db,`rooms/${room}`)); if(!rs.exists())return alert("Room not found."); const r=rs.val()||{};
 if(r.competitionClosed||r.state==="competition_closed")return alert("This competition is closed. You cannot join this room now.");
 const pRef=ref(db,`rooms/${room}/participants/${studentKey}`);
 const result=await runTransaction(pRef,current=>{
   if(current===null)return {studentKey,phone,name:p.name,designation:p.designation,placeOfPosting:p.placeOfPosting,blocked:false,winner:false,disqualified:false,violationCount:0,joinedAt:{".sv":"timestamp"}};
   if(current.canRejoin===true&&!current.blocked&&!current.disqualified&&!current.winner)return {...current,studentKey,phone,name:p.name,designation:p.designation,placeOfPosting:p.placeOfPosting,canRejoin:false,lastRejoinedAt:{".sv":"timestamp"}};
   return;
 });
 if(!result.committed){alert("This mobile number has already participated in this quiz. You cannot join again.");return;}
 $("dashboardCard").classList.add("hidden");$("quizCard").classList.remove("hidden");
 $("title").textContent=r.title||"Live Quiz";$("room").textContent=room;$("connection").textContent="Connected";startAntiCheat();requestFullScreen();listen();
}
function requestFullScreen(){const el=document.documentElement;const fn=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen;if(fn)Promise.resolve(fn.call(el)).catch(()=>{});}
async function recordViolation(type){
 const now=Date.now();if(now-lastViolationAt<1200||!room||!studentKey)return;
 // Once the host closes the competition, the entire competition is frozen.
 // Leaving the page, changing tabs, losing focus or exiting fullscreen after closure
 // must NOT create a new violation or change any participant record.
 const roomSnap=await get(ref(db,`rooms/${room}`));
 const roomData=roomSnap.val()||{};
 if(roomData.competitionClosed || roomData.state==="competition_closed")return;
 lastViolationAt=now;violationCount++;
 const p=await get(ref(db,`rooms/${room}/participants/${studentKey}`));if(!p.exists())return;
 // Re-check closure immediately before writing, so a close occurring while the
 // participant is leaving cannot create a late disqualification.
 const latestRoom=await get(ref(db,`rooms/${room}`));
 const latest=latestRoom.val()||{};
 if(latest.competitionClosed || latest.state==="competition_closed")return;
 const audit={violationCount,lastViolationType:type,lastViolationAt:serverTimestamp()};
 // A legitimate prize winner remains a BLOCKED WINNER, not DISQUALIFIED. Keep the violation in the audit log.
 if(!(p.val()?.blocked && p.val()?.winner)) Object.assign(audit,{blocked:true,disqualified:true,disqualificationReason:"Anti-cheating violation"});
 await update(ref(db,`rooms/${room}/participants/${studentKey}`),audit);
 await update(ref(db,`rooms/${room}/violations/${studentKey}/${Date.now()}`),{type,at:serverTimestamp(),question:questionNo});
 $("violationStatus").classList.remove("hidden");$("violationStatus").textContent=`⚠️ Violation recorded: ${type}. Total: ${violationCount}`;
}
function startAntiCheat(){
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState!=="visible")recordViolation("TAB/WINDOW SWITCH OR MINIMIZE");});
 window.addEventListener("blur",()=>recordViolation("WINDOW LOST FOCUS"));
 document.addEventListener("fullscreenchange",()=>{if(document.fullscreenElement!==document.documentElement)recordViolation("EXITED FULL SCREEN");});
 document.addEventListener("contextmenu",e=>e.preventDefault());document.addEventListener("copy",e=>e.preventDefault());document.addEventListener("cut",e=>e.preventDefault());document.addEventListener("selectstart",e=>e.preventDefault());
 document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&["c","u","s","p","a"].includes(e.key.toLowerCase()))e.preventDefault();if(e.key==="F12")e.preventDefault();});
}
function listen(){
 onValue(ref(db,`rooms/${room}`),async s=>{const r=s.val()||{};
  if(r.competitionClosed || r.state==="competition_closed"){
   clearInterval(timer); answered=true; questionNo=0;
   $("studentStatus").className="status blocked";
   $("studentStatus").textContent="🔒 Competition Closed — This competition has been closed by the host. No further participation is allowed.";
   $("qNo").textContent=""; $("prize").textContent=""; $("question").textContent="Competition Closed";
   $("options").innerHTML=""; $("result").textContent=""; $("timer").textContent="00:00";
   $("submitBtn").disabled=true;
   return;
  }
  const p=(await get(ref(db,`rooms/${room}/participants/${studentKey}`))).val()||{};
  violationCount=p.violationCount||0;
  if(p.disqualified){$("studentStatus").className="status blocked";$("studentStatus").textContent="⛔ Disqualified and blocked from the competition. Please contact the host if you need to be unblocked.";disable();return;}
  if(p.blocked&&p.winner){$("studentStatus").className="status blocked";$("studentStatus").textContent="🏆 You have won a prize and are blocked from the remaining questions.";disable();return;}
  if(p.blocked){$("studentStatus").className="status blocked";$("studentStatus").textContent="⛔ You are currently blocked from the competition.";disable();return;}$("studentStatus").className="status "+(r.state==="open"?"live":"");
  $("studentStatus").textContent=r.state==="open"?"Question is LIVE — answer now!":r.state==="closed"?"Answers are closed.":r.state==="revealed"?(r.winnerName?`Winner: ${r.winnerName}`:"No eligible winner"):"Waiting for the host to show the next question.";
  if(r.state==="open"&&r.currentQuestion){questionTimerSeconds=Math.max(5,Number(r.timerSeconds||30));loadQuestion(r.currentQuestion);startCountdown(r.openedAt,questionTimerSeconds);}
  if(r.state==="revealed"&&r.currentQuestion===questionNo){$("result").innerHTML=r.winnerKey===studentKey?'<div class="successbox">🏆 Congratulations! You are the winner.</div>':`Winner: <b>${esc(r.winnerName||"None")}</b>`;}
  if(r.state!=="open"){$("submitBtn").disabled=true;if(r.state!=="revealed")$("options").innerHTML="";}
 });
}
async function loadQuestion(n){
 if(n===questionNo&&$("question").textContent!=="Waiting for the host to show the next question.")return;questionNo=n;answered=false;selected="";$("result").textContent="";
 const s=await get(ref(db,`rooms/${room}/questions/q${n}`));const q=s.val()||{};$("qNo").textContent=`Question ${n}`;$("prize").textContent=`₹${Number(q.prize||0)}`;$("question").textContent=q.text||"";
 $("options").innerHTML=opts.map(x=>`<button class="option" data-o="${x}"><b>${x}.</b> ${esc(q.options?.[x]||"")}</button>`).join("");
 document.querySelectorAll(".option").forEach(b=>b.onclick=()=>{if(answered)return;selected=b.dataset.o;document.querySelectorAll(".option").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");});$("submitBtn").disabled=false;
}
function startCountdown(serverOpen,seconds){
 if(!serverOpen)return;
 openedAt=Number(serverOpen);
 clearInterval(timer);
 const duration=Math.max(5,Number(seconds||30))*1000;
 const tick=()=>{
   const remaining=Math.max(0,duration-(Date.now()-openedAt));
   const total=Math.ceil(remaining/1000);
   const mm=String(Math.floor(total/60)).padStart(2,"0");
   const ss=String(total%60).padStart(2,"0");
   $("timer").textContent=`${mm}:${ss}`;
   if(remaining<=0){
     clearInterval(timer);
     answered=true;
     $("submitBtn").disabled=true;
     document.querySelectorAll(".option").forEach(b=>b.disabled=true);
     $("result").textContent="⏰ Time is over. Answers are closed.";
   }
 };
 tick();
 timer=setInterval(tick,100);
}
function disable(){answered=true;$("submitBtn").disabled=true;document.querySelectorAll(".option").forEach(b=>b.disabled=true);}
document.addEventListener("DOMContentLoaded",()=>{
 const btn=$("participantContinueBtn");
 if(btn) btn.addEventListener("click",saveParticipantSession);
});
$("quizAssignment").onclick=()=>openRoomModal("quiz");
$("mcqAssignment").onclick=()=>openRoomModal("mcq");
$("generalAssignment").onclick=()=>openRoomModal("general");
$("roomCancelBtn").onclick=closeRoomModal;
$("roomContinueBtn").onclick=()=>enterAssignment($("roomContinueBtn").dataset.type);
$("assignmentTab").onclick=()=>{ $("assignmentTab").classList.add("active");$("resultTab").classList.remove("active");$("assignmentPanel").classList.remove("hidden");$("resultPanel").classList.add("hidden"); };
$("resultTab").onclick=()=>{ $("resultTab").classList.add("active");$("assignmentTab").classList.remove("active");$("resultPanel").classList.remove("hidden");$("assignmentPanel").classList.add("hidden"); };
$("participantSignOut").onclick=()=>{ sessionStorage.removeItem("quizParticipant");sessionStorage.removeItem("mcqRoom");sessionStorage.removeItem("generalRoom");location.reload(); };
$("viewResultBtn").onclick=async()=>{ const code=$("resultRoomCode").value.trim().toUpperCase();const p=JSON.parse(sessionStorage.getItem("quizParticipant")||"null");if(!p)return; if(!/^[A-Z0-9]{6}$/.test(code)){ $("resultSummary").textContent="Enter a valid 6-character room code.";return;} const key=phoneKey(p.phone); const snap=await get(ref(db,`rooms/${code}`)); if(!snap.exists()){ $("resultSummary").textContent="Room not found.";return;} const r=snap.val()||{}; const ps=(r.participants||{})[key]; if(!ps){ $("resultSummary").textContent="No result found for this participant in this room.";return;} const answers=r.answers||{};let correct=0,total=0;Object.keys(answers).forEach(q=>{const a=answers[q]?.[key];if(a){total++;if(a.correct)correct++;}});$("resultSummary").className="status";$("resultSummary").innerHTML=`<b>${esc(p.name)}</b><br>Room: <b>${esc(code)}</b><br>Answered: <b>${total}</b><br>Correct: <b>${correct}</b><br>Status: <b>${ps.disqualified?"Disqualified":ps.winner?"Prize Winner":ps.blocked?"Blocked":"Participant"}</b>`; };
const saved=JSON.parse(sessionStorage.getItem("quizParticipant")||"null"); if(saved)showDashboard(saved);
$("submitBtn").onclick=async()=>{
 if(answered||!selected)return alert("Select an answer first.");answered=true;$("submitBtn").disabled=true;
 const r=(await get(ref(db,`rooms/${room}`))).val()||{};if(r.competitionClosed||r.state==="competition_closed")return $("result").textContent="🔒 Competition Closed.";if(r.state!=="open"||r.currentQuestion!==questionNo)return $("result").textContent="Answers are closed.";
 const p=(await get(ref(db,`rooms/${room}/participants/${studentKey}`))).val()||{};if(p.blocked||p.disqualified)return disable();
 const q=(await get(ref(db,`rooms/${room}/questions/q${questionNo}`))).val()||{};
 const elapsed=Math.max(0,Date.now()-Number(r.openedAt||Date.now()));
 const limitMs=Math.max(5,Number(r.timerSeconds||30))*1000;
 if(elapsed>limitMs){$("result").textContent="⏰ Time is over. Answers are closed.";return;}
 await update(ref(db,`rooms/${room}/answers/q${questionNo}/${studentKey}`),{studentKey,name:p.name,designation:p.designation,placeOfPosting:p.placeOfPosting,phone:p.phone,answer:selected,correct:selected===q.correct,elapsedMs:elapsed,serverReceivedAt:serverTimestamp(),eligible:!p.disqualified});$("result").textContent="Answer submitted. Waiting for host.";
};
$("connection").textContent="Ready to join";
