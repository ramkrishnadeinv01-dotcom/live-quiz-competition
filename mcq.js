import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase,ref,get,update,serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=initializeApp(firebaseConfig),db=getDatabase(app),$=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);const room=(params.get("room")||sessionStorage.getItem("mcqRoom")||"").toUpperCase();const participant=JSON.parse(sessionStorage.getItem("quizParticipant")||"null");let questions=[],idx=0,selected="",answers={},timer=null,endAt=0,startedAt=Date.now();
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
async function init(){
 try{
  // Load the room FIRST. Do not block the exam screen just because a participant
  // session is missing or stale; this was leaving the participant page blank.
  if(!/^[A-Z0-9]{6}$/.test(room)){return showError("Room code is missing or invalid. Please return to Assignments and enter the room code again.");}
  $("roomCode").textContent=room;
  $("status").className="status";
  $("status").textContent="Connecting to examination…";
  const snap=await get(ref(db,`rooms/${room}`));
  if(!snap.exists())return showError("Room not found. Please check the room code.");
  const r=snap.val()||{};
  if(r.examType && String(r.examType).toLowerCase()!=="mcq") return showError("This room is not configured for an MCQ examination.");
  $("examTitle").textContent=r.mcqTitle||r.title||"MCQ Examination";
  const qObj=r.mcqQuestions||r.questions||{};
  if(Array.isArray(qObj)){
    questions=qObj.map((q,i)=>({id:q?.id||`q${i+1}`,...q}));
  }else{
    questions=Object.keys(qObj).sort((a,b)=>Number((a.match(/\d+/)||[0])[0])-Number((b.match(/\d+/)||[0])[0])).map(k=>({id:k,...(qObj[k]||{})}));
  }
  if(!questions.length)return showError("No MCQ questions have been configured for this room yet.");
  // Participant details are needed only when submitting. Accept common session keys.
  let stored=null;
  for(const key of ["quizParticipant","participant","studentParticipant"]){
   try{const x=sessionStorage.getItem(key);if(x){stored=JSON.parse(x);break;}}catch(e){}
  }
  if(stored) window.currentParticipant=stored;
  else {
   window.currentParticipant=null;
   $("message").innerHTML='<div class="status">Participant details are not loaded. You can view the examination, but please return to Assignments and enter your participant details before submitting.</div>';
  }
  const seconds=Number(r.mcqTimeSeconds||r.durationSeconds||0);
  if(seconds>0){
   // If the host has not started the exam, wait rather than inventing a timer.
   const status=String(r.examStatus||"").toUpperCase();
   if(status && status!=="LIVE" && status!=="RUNNING" && status!=="STARTED"){
    $("timer").textContent="--:--";
    $("status").textContent=status==="CLOSED"?"Exam is closed.":"Waiting for the host to start the examination…";
   }else{
    endAt=Date.now()+seconds*1000;tick();timer=setInterval(tick,250);
   }
  }
  $("status").textContent="Examination loaded.";
  showQuestion();
 }catch(err){
  console.error("MCQ participant load error",err);
  showError("Unable to load the examination. Please refresh once. Error: "+(err?.message||err));
 }
}

function showError(t){$("status").className="status blocked";$("status").textContent=t;$("question").textContent="";$("options").innerHTML="";$("nextBtn").disabled=true;}
function tick(){const left=Math.max(0,endAt-Date.now());const sec=Math.ceil(left/1000);$("timer").textContent=`${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;if(left<=0){clearInterval(timer);finish(true);}}
function showQuestion(){const q=questions[idx];selected=answers[q.id]||"";$("qNo").textContent=`Question ${idx+1} of ${questions.length}`;$("question").innerHTML=esc(q.text||"");const opts=q.options||{};$("options").innerHTML=["A","B","C","D"].map(o=>`<button class="mcq-option ${selected===o?"selected":""}" data-o="${o}"><b>${o}.</b> ${esc(opts[o]||"")}</button>`).join("");document.querySelectorAll(".mcq-option").forEach(b=>b.onclick=()=>{selected=b.dataset.o;answers[q.id]=selected;document.querySelectorAll(".mcq-option").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");$("nextBtn").disabled=false;});$("nextBtn").disabled=!selected;$("nextBtn").textContent=idx===questions.length-1?"REVIEW / SUBMIT":"NEXT";}
async function finish(auto=false){clearInterval(timer);$("nextBtn").disabled=true;const p=window.currentParticipant||participant;if(!p||!p.phone){showError("Participant details are missing. Please return to Assignments, enter your details, and open the exam again.");return;}const key=String(p.phone).replace(/\D/g,"");const payload={name:p.name,designation:p.designation,placeOfPosting:p.placeOfPosting,phone:p.phone,answers,startedAt,submittedAt:serverTimestamp(),timeTakenSeconds:Math.max(0,Math.round((Date.now()-startedAt)/1000)),autoSubmitted:!!auto};await update(ref(db,`rooms/${room}/mcqAnswers/${key}`),payload);let correct=0;questions.forEach(q=>{if(answers[q.id]&&answers[q.id]===q.correct)correct++;});$("status").className="status live";$("status").textContent=`Exam submitted. Correct answers: ${correct} / ${questions.length}.`;$("message").innerHTML=`<div class="successbox">Your MCQ examination has been submitted.</div>`;$("options").innerHTML="";$("finishBtnWrap").classList.add("hidden");}
$("nextBtn").onclick=()=>{if(idx<questions.length-1){idx++;showQuestion();}else finish(false);};$("finishBtn")?.addEventListener("click",()=>finish(false));$("backBtn").onclick=()=>location.href="student.html";init();