import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, get, runTransaction, update, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig),db=getDatabase(app);
const $=id=>document.getElementById(id);
let room="",studentKey="",selected="",questionNo=0,openedAt=0,answered=false,timer,violationCount=0,lastViolationAt=0;
const opts=["A","B","C","D"];
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function msg(t,cls=""){$("joinMsg").textContent=t;$("joinMsg").className=cls;}
function normalizePhone(v){v=v.trim().replace(/[\s()-]/g,"");if(/^\+91\d{10}$/.test(v))return v;if(/^91\d{10}$/.test(v))return "+"+v;if(/^\d{10}$/.test(v))return "+91"+v;return "";}
function phoneKey(phone){return phone.replace(/\D/g,"");}
async function join(){
 room=$("roomCodeInput").value.trim().toUpperCase();
 const phone=normalizePhone($("phoneNumber").value);
 const name=$("studentName").value.trim();
 const designation=$("designation").value.trim();
 const placeOfPosting=$("placeOfPosting").value.trim();
 if(!room||!/^[A-Z0-9]{6}$/.test(room))return msg("Enter the 6-character room code.");
 if(!phone)return msg("Enter a valid 10-digit Indian mobile number.");
 if(!name||!designation||!placeOfPosting)return msg("Please fill Name, Designation and Place of Posting.");
 const rs=await get(ref(db,`rooms/${room}`));
 if(!rs.exists())return msg("Room not found.");
 const r=rs.val();
 if(r.state==="finished")return msg("This quiz has already finished.");
 studentKey=phoneKey(phone);
 const pRef=ref(db,`rooms/${room}/participants/${studentKey}`);
 const result=await runTransaction(pRef,current=>current===null?{
   studentKey,phone,name,designation,placeOfPosting,
   blocked:false,winner:false,violationCount:0,joinedAt:{".sv":"timestamp"}
 }:undefined);
 if(!result.committed)return msg("This mobile number has already participated in this quiz. You cannot join again.");
 $("joinCard").classList.add("hidden");$("quizCard").classList.remove("hidden");
 $("title").textContent=r.title||"Live Quiz";$("room").textContent=room;
 $("connection").textContent="Connected";startAntiCheat();requestFullScreen();listen();
}
function requestFullScreen(){const el=document.documentElement;const fn=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen;if(fn)Promise.resolve(fn.call(el)).catch(()=>{});}
async function recordViolation(type){
 const now=Date.now();if(now-lastViolationAt<1200||!room||!studentKey)return;lastViolationAt=now;violationCount++;
 const p=await get(ref(db,`rooms/${room}/participants/${studentKey}`));if(!p.exists())return;
 await update(ref(db,`rooms/${room}/participants/${studentKey}`),{violationCount,lastViolationType:type,lastViolationAt:serverTimestamp()});
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
 onValue(ref(db,`rooms/${room}`),async s=>{const r=s.val()||{};const p=(await get(ref(db,`rooms/${room}/participants/${studentKey}`))).val()||{};
  if(p.blocked){$("studentStatus").className="status blocked";$("studentStatus").textContent="🏆 You have won a prize and are blocked from the remaining questions.";disable();return;}
  violationCount=p.violationCount||0;$(`studentStatus`).className="status "+(r.state==="open"?"live":"");
  $("studentStatus").textContent=r.state==="open"?"Question is LIVE — answer now!":r.state==="closed"?"Answers are closed.":r.state==="revealed"?(r.winnerName?`Winner: ${r.winnerName}`:"No eligible winner"):"Waiting for the host to show the next question.";
  if(r.state==="open"&&r.currentQuestion){loadQuestion(r.currentQuestion);startTimer(r.openedAt);}
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
function startTimer(serverOpen){if(!serverOpen)return;openedAt=serverOpen;clearInterval(timer);timer=setInterval(()=>$("timer").textContent=Math.max(0,(Date.now()-openedAt)/1000).toFixed(3),50);}
function disable(){answered=true;$("submitBtn").disabled=true;document.querySelectorAll(".option").forEach(b=>b.disabled=true);}
$("joinBtn").onclick=join;
$("submitBtn").onclick=async()=>{
 if(answered||!selected)return alert("Select an answer first.");answered=true;$("submitBtn").disabled=true;
 const r=(await get(ref(db,`rooms/${room}`))).val()||{};if(r.state!=="open"||r.currentQuestion!==questionNo)return $("result").textContent="Answers are closed.";
 const p=(await get(ref(db,`rooms/${room}/participants/${studentKey}`))).val()||{};if(p.blocked)return disable();
 const q=(await get(ref(db,`rooms/${room}/questions/q${questionNo}`))).val()||{};const elapsed=Math.max(0,Date.now()-Number(r.openedAt||Date.now()));
 await update(ref(db,`rooms/${room}/answers/q${questionNo}/${studentKey}`),{studentKey,name:p.name,designation:p.designation,placeOfPosting:p.placeOfPosting,phone:p.phone,answer:selected,correct:selected===q.correct,elapsedMs:elapsed,serverReceivedAt:serverTimestamp(),eligible:true});$("result").textContent="Answer submitted. Waiting for host.";
};
$("connection").textContent="Ready to join";
