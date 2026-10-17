import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {getAuth,signInAnonymously} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {getDatabase,ref,get,set} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app),$=id=>document.getElementById(id);
const authReady=signInAnonymously(auth).catch(e=>{console.error(e);return null;});
const p=JSON.parse(sessionStorage.getItem("quizParticipant")||"null");
const params=new URLSearchParams(location.search);
const room=(params.get("room")||sessionStorage.getItem("generalRoom")||"").toUpperCase();
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
let questions={},submitted=false,rendered=false,lastStatus="",pollBusy=false;
function show(t){$("status").textContent=t;}
function questionKeys(){return Object.keys(questions).sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));}
function hideQuestions(message){$("questions").innerHTML="";rendered=false;show(message);}
function renderQuestions(keys){if(rendered)return;$("questions").innerHTML=keys.map((k,i)=>`<div class="card"><h3>Question ${i+1}</h3><div class="question">${esc(questions[k].text||"")}</div><textarea id="a_${k}" rows="4" style="width:100%;box-sizing:border-box" placeholder="Write your answer here"></textarea></div>`).join("")+`<div class="card"><button id="submit" class="success">SUBMIT EXAM</button></div>`;$("submit").onclick=()=>submit(keys);rendered=true;}
async function init(){
 const user=await authReady;if(!user)return show("Participant sign-in failed. Please refresh or contact the host.");
 if(!p||!/^[A-Z0-9]{6}$/.test(room))return show("Participant details or room code are missing. Return to Participant Panel and open the exam again.");
 $("room").textContent=room;await refreshExam();setInterval(refreshExam,2000);
}
async function refreshExam(){if(pollBusy||submitted)return;pollBusy=true;try{
 const snap=await get(ref(db,`rooms/${room}`));if(!snap.exists()){hideQuestions("Room not found. Check the room code.");return;}
 const r=snap.val()||{};if(r.examType!=="general"){hideQuestions("This room is not a General Question exam.");return;}
 $("title").textContent=r.generalTitle||r.title||"General Question Based Exam";questions=r.generalQuestions||{};
 const keys=questionKeys(),status=String(r.examStatus||"NOT STARTED").toUpperCase(),now=Date.now();
 if(status==="SCHEDULED"&&Number(r.scheduledStartAt)<=now){show("The exam start time has arrived. Waiting for the host/database to activate the exam…");hideQuestions("The exam has not been activated yet.");return;}
 if(status!=="LIVE"){
  if(status==="CLOSED")hideQuestions("This exam is closed. Questions are no longer available for submission.");
  else if(status==="SCHEDULED")hideQuestions(`Exam scheduled for ${new Date(Number(r.scheduledStartAt)).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST. Questions will appear only after the host starts the exam.`);
  else hideQuestions("The host has not clicked START EXAM NOW yet. Questions are hidden until the exam starts.");
  lastStatus=status;return;
 }
 if(!keys.length){hideQuestions("The host has started the exam, but questions have not been saved yet.");return;}
 if(r.scheduledEndAt&&now>=Number(r.scheduledEndAt)){
  hideQuestions("Exam time is over. Submission is closed.");return;
 }
 if(!rendered)renderQuestions(keys);
 let msg=`EXAM LIVE — ${keys.length} question(s).`;
 if(r.scheduledEndAt){const left=Math.max(0,Number(r.scheduledEndAt)-now);msg+=` Time remaining: ${Math.floor(left/60000)} min ${Math.floor((left%60000)/1000)} sec.`;}
 show(msg);lastStatus=status;
 }catch(e){console.error(e);show(`Could not check exam status: ${e.message||e}`);}finally{pollBusy=false;}}
async function submit(keys){if(submitted)return;const btn=$("submit");btn.disabled=true;btn.textContent="SUBMITTING…";try{
 const roomSnap=await get(ref(db,`rooms/${room}`));const r=roomSnap.val()||{};if(!roomSnap.exists()||String(r.examStatus||"").toUpperCase()!=="LIVE")throw new Error("The host has not started the exam or it has been closed. Answers were not submitted.");if(r.scheduledEndAt&&Date.now()>=Number(r.scheduledEndAt))throw new Error("Exam time is over. Answers were not submitted.");
 const answers={};keys.forEach(k=>answers[k]=($("a_"+k)?.value||"").trim());if(keys.some(k=>!answers[k]))throw new Error("Please answer every question before submitting.");
 const phone=String(p.phone||"").replace(/\D/g,"");if(!phone)throw new Error("Registered phone number is missing. Return to Participant Panel and enter your details again.");
 const path=ref(db,`rooms/${room}/generalAnswers/${phone}`);if((await get(path)).exists())throw new Error("An answer sheet has already been submitted for this phone number.");
 await set(path,{name:p.name||"",designation:p.designation||"",placeOfPosting:p.placeOfPosting||p.place||"",phone:p.phone||"",answers,submittedAt:Date.now(),authUid:auth.currentUser?.uid||""});submitted=true;show("Exam over, your answer has been successfully submitted. Thank you.");$("questions").querySelectorAll("textarea,button").forEach(x=>x.disabled=true);alert("Exam over, your answer has been successfully submitted. Thank you.");
 }catch(e){console.error(e);show(`Submission failed: ${e.message||e}`);btn.disabled=false;btn.textContent="SUBMIT EXAM";}}
$("back").onclick=()=>location.href="student.html";init();
