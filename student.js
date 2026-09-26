import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, get, runTransaction, update, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const $=id=>document.getElementById(id);
let confirmation=null,room="",studentKey="",selected="",questionNo=0,openedAt=0,answered=false,timer,recaptcha,phoneVerified=false,violationCount=0,lastViolationAt=0;
const opts=["A","B","C","D"];
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function msg(t,cls=""){$("joinMsg").textContent=t;$("joinMsg").className=cls;}
function normalizePhone(v){v=v.trim().replace(/\s|-/g,"");return /^\d{10}$/.test(v)?"+91"+v:v;}
function setupRecaptcha(){if(recaptcha)return;recaptcha=new RecaptchaVerifier(auth,"recaptcha-container",{size:"normal"});recaptcha.render().catch(e=>msg("reCAPTCHA could not load: "+e.message));}
async function sendOtp(){
 room=$("roomCodeInput").value.trim().toUpperCase();const phone=normalizePhone($("phoneNumber").value);
 if(!room||!/^[+]\d{8,15}$/.test(phone))return msg("Enter a valid room code and mobile number, e.g. +91XXXXXXXXXX.");
 const rs=await get(ref(db,`rooms/${room}`));if(!rs.exists())return msg("Room not found.");
 setupRecaptcha();
 try{confirmation=await signInWithPhoneNumber(auth,phone,recaptcha);phoneVerified=false;$("otpArea").classList.remove("hidden");msg("OTP sent. Enter the OTP received on your phone.");}
 catch(e){msg("OTP could not be sent: "+e.message);if(recaptcha){recaptcha.clear();recaptcha=null;setupRecaptcha();}}
}
async function verifyOtp(){
 if(!confirmation)return msg("Please request an OTP first.");const code=$("otpCode").value.trim();if(!/^\d{6}$/.test(code))return msg("Enter the 6-digit OTP.");
 try{await confirmation.confirm(code);studentKey=auth.currentUser.uid;phoneVerified=true;$("detailsArea").classList.remove("hidden");$("sendOtpBtn").disabled=true;$("verifyOtpBtn").disabled=true;$("phoneNumber").disabled=true;msg("Phone verified successfully. Now enter your details and join the quiz.");}
 catch(e){msg("Invalid OTP or verification failed: "+e.message);}
}
async function join(){
 if(!phoneVerified||!auth.currentUser)return msg("Please verify your mobile number first.");
 room=$("roomCodeInput").value.trim().toUpperCase();const name=$("studentName").value.trim(),sid=$("studentId").value.trim(),city=$("city").value.trim();
 if(!name||!sid||!city)return msg("Please fill Name, Student ID and City.");
 const rs=await get(ref(db,`rooms/${room}`));if(!rs.exists())return msg("Room not found.");const r=rs.val();
 const pRef=ref(db,`rooms/${room}/participants/${studentKey}`);
 const result=await runTransaction(pRef,current=>current===null?{studentKey,name,studentId:sid,city,phoneVerified:true,phoneLast4:normalizePhone($("phoneNumber").value).slice(-4),blocked:false,winner:false,violationCount:0,joinedAt:{".sv":"timestamp"}}:undefined);
 if(!result.committed)return msg("This verified phone number has already participated in this quiz. You cannot join again.");
 $("joinCard").classList.add("hidden");$("quizCard").classList.remove("hidden");$("title").textContent=r.title||"Live Quiz";$("room").textContent=room;startAntiCheat();requestFullScreen();listen();
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
$("sendOtpBtn").onclick=sendOtp;$("verifyOtpBtn").onclick=verifyOtp;$("joinBtn").onclick=join;
$("submitBtn").onclick=async()=>{
 if(answered||!selected)return alert("Select an answer first.");answered=true;$("submitBtn").disabled=true;
 const r=(await get(ref(db,`rooms/${room}`))).val()||{};if(r.state!=="open"||r.currentQuestion!==questionNo)return $("result").textContent="Answers are closed.";
 const p=(await get(ref(db,`rooms/${room}/participants/${studentKey}`))).val()||{};if(p.blocked)return disable();
 const q=(await get(ref(db,`rooms/${room}/questions/q${questionNo}`))).val()||{};const elapsed=Math.max(0,Date.now()-Number(r.openedAt||Date.now()));
 await update(ref(db,`rooms/${room}/answers/q${questionNo}/${studentKey}`),{studentKey,name:p.name,studentId:p.studentId,city:p.city,answer:selected,correct:selected===q.correct,elapsedMs:elapsed,serverReceivedAt:serverTimestamp(),eligible:true});$("result").textContent="Answer submitted. Waiting for host.";
};
setupRecaptcha();$("connection").textContent="Ready for phone verification";
