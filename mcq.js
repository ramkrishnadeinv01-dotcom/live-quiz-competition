import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase,ref,get,update,onValue,serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig),db=getDatabase(app),$=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const room=(params.get("room")||sessionStorage.getItem("mcqRoom")||"").toUpperCase();
const participant=JSON.parse(sessionStorage.getItem("quizParticipant")||"null");
let questions=[],idx=0,selected="",answers={},timer=null,endAt=0,startedAt=0,roomUnsub=null,runId="";
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const statusOf=r=>String(r?.examStatus||"NOT STARTED").toUpperCase();
const keyForParticipant=()=>String(participant?.phone||"").replace(/\D/g,"");

function hideExam(){
  $("question").textContent="";$("options").innerHTML="";$("qNo").textContent="Question";
  $("nextBtn").disabled=true;$("finishBtnWrap")?.classList.add("hidden");
}
function showError(t){
  $("status").className="status blocked";$("status").textContent=t;hideExam();
}
function showWaiting(r){
  clearInterval(timer);timer=null;hideExam();
  const st=statusOf(r);
  if(st==="CLOSED"){$("status").className="status blocked";$("status").textContent="EXAM CLOSED — The Host has closed this examination.";return;}
  $("status").className="status";$("status").textContent="WAITING FOR HOST — The questions will appear only after the Host clicks START EXAM NOW or RESTART EXAM.";
}
function normalizeOptions(q){
  const raw=q?.options;
  const out={A:"",B:"",C:"",D:""};
  if(Array.isArray(raw)){["A","B","C","D"].forEach((k,i)=>out[k]=raw[i]??"");}
  else if(raw&&typeof raw==="object"){["A","B","C","D"].forEach(k=>{out[k]=raw[k]??raw[k.toLowerCase()]??raw["option"+k]??raw["Option"+k]??"";});}
  const aliases={A:["A","a","optionA","OptionA","option1","Option1","optA","answerA","choiceA"],B:["B","b","optionB","OptionB","option2","Option2","optB","answerB","choiceB"],C:["C","c","optionC","OptionC","option3","Option3","optC","answerC","choiceC"],D:["D","d","optionD","OptionD","option4","Option4","optD","answerD","choiceD"]};
  for(const k of ["A","B","C","D"]){if(!String(out[k]??"").trim()){for(const key of aliases[k]){if(q?.[key]!==undefined&&q[key]!==null&&String(q[key]).trim()){out[k]=q[key];break;}}}}
  return out;
}
function normalizeQuestion(id,q){
  q=q&&typeof q==="object"?q:{};
  return {id,...q,options:normalizeOptions(q)};
}
function loadQuestions(r){
  const qObj=r.mcqQuestions||{};
  const entries=Array.isArray(qObj)?qObj.map((q,i)=>["q"+(i+1),q]):Object.entries(qObj);
  questions=entries.sort((a,b)=>Number((String(a[0]).match(/\d+/)||[0])[0])-Number((String(b[0]).match(/\d+/)||[0])[0])).map(([k,q])=>normalizeQuestion(k,q));
  if(!questions.length){showError("No MCQ questions have been configured for this room yet.");return false;}
  return true;
}
function startExamClock(r){
  clearInterval(timer);timer=null;
  startedAt=Number(r.startedAt||Date.now());runId=String(r.runId||"");
  const seconds=Number(r.mcqTimeSeconds||0);
  endAt=startedAt+(seconds>0?seconds*1000:0);
  if(seconds>0){tick();timer=setInterval(tick,250);}else $("timer").textContent="--:--";
}
function tick(){
  const left=Math.max(0,endAt-Date.now());const sec=Math.ceil(left/1000);
  $("timer").textContent=`${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
  if(left<=0){clearInterval(timer);timer=null;finish(true);}
}
function renderQuestion(){
  const q=questions[idx];if(!q)return;
  selected=answers[q.id]||"";
  $("qNo").textContent=`Question ${idx+1} of ${questions.length}`;
  $("question").innerHTML=esc(q.text||"");
  const opts=normalizeOptions(q);
  const hasOptions=["A","B","C","D"].some(o=>String(opts[o]??"").trim());
  $("options").innerHTML=hasOptions?["A","B","C","D"].map(o=>`<button type="button" class="mcq-option ${selected===o?"selected":""}" data-o="${o}"><b>${o}.</b> ${esc(opts[o]||"")}</button>`).join(""):`<div class="status blocked">Answer options could not be loaded for this question. Please contact the Host.</div>`;
  document.querySelectorAll(".mcq-option").forEach(b=>b.onclick=async()=>{
    selected=b.dataset.o;answers[q.id]=selected;
    document.querySelectorAll(".mcq-option").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");
    $("nextBtn").disabled=false;
    await persistLive(false);
  });
  $("nextBtn").disabled=!selected;
  $("nextBtn").textContent=idx===questions.length-1?"SUBMIT EXAM":"NEXT";
}
function countResults(){
  let correct=0,wrong=0,answered=0;
  questions.forEach(q=>{const a=answers[q.id];if(a){answered++;if(String(a).toUpperCase()===String(q.correct||"").toUpperCase())correct++;else wrong++;}});
  return {answered,correct,wrong};
}
async function persistLive(submitted=false){
  if(!participant||!keyForParticipant()||!room)return;
  const c=countResults();
  const payload={name:participant.name||"",designation:participant.designation||"",placeOfPosting:participant.placeOfPosting||"",phone:participant.phone||"",answers,currentQuestion:Math.min(idx+1,questions.length),answeredCount:c.answered,correctCount:c.correct,wrongCount:c.wrong,timeTakenSeconds:Math.max(0,Math.round((Date.now()-startedAt)/1000)),status:submitted?"SUBMITTED":"LIVE",updatedAt:serverTimestamp(),runId};
  try{await update(ref(db,`rooms/${room}/mcqLive/${keyForParticipant()}`),payload);}catch(e){console.warn("Live progress update failed",e);}
}
async function finish(auto=false){
  clearInterval(timer);timer=null;$("nextBtn").disabled=true;
  const key=keyForParticipant();if(!key)return showError("Participant mobile number is missing.");
  const c=countResults();
  const payload={name:participant.name,designation:participant.designation,placeOfPosting:participant.placeOfPosting,phone:participant.phone,answers,startedAt,submittedAt:serverTimestamp(),timeTakenSeconds:Math.max(0,Math.round((Date.now()-startedAt)/1000)),autoSubmitted:!!auto,runId};
  try{
    await update(ref(db,`rooms/${room}/mcqAnswers/${key}`),payload);
    await update(ref(db,`rooms/${room}/mcqLive/${key}`),{...payload,currentQuestion:questions.length,answeredCount:c.answered,correctCount:c.correct,wrongCount:c.wrong,status:"SUBMITTED",updatedAt:serverTimestamp(),runId});
    $("status").className="status live";$("status").textContent=`Exam submitted. Correct answers: ${c.correct} / ${questions.length}.`;
    $("message").innerHTML=`<div class="successbox">Your MCQ examination has been submitted.</div>`;$("options").innerHTML="";$("finishBtnWrap")?.classList.add("hidden");
  }catch(e){$("status").className="status blocked";$("status").textContent=`Submission failed: ${e?.message||e}`;$("nextBtn").disabled=false;}
}
async function activateRoom(r){
  if(statusOf(r)!=="LIVE"){showWaiting(r);return;}
  if(!loadQuestions(r))return;
  $("status").className="status live";$("status").textContent="EXAM LIVE — You may answer the current questions.";
  startExamClock(r);
  if(runId!==String(r.runId||"")){idx=0;selected="";answers={};}
  renderQuestion();
}
async function init(){
  if(!/^[A-Z0-9]{6}$/.test(room))return showError("Room code is missing or invalid.");
  $("roomCode").textContent=room;
  if(!participant)return showError("Participant details are missing. Please return to the Participant Panel and enter your details.");
  try{
    const snap=await get(ref(db,`rooms/${room}`));
    if(!snap.exists())return showError("Room not found.");
    const r=snap.val()||{};
    $("examTitle").textContent=r.mcqTitle||"MCQ Examination";
    await activateRoom(r);
    roomUnsub=onValue(ref(db,`rooms/${room}`),async s=>{const live=s.val();if(!live)return showError("Room is no longer available.");$("roomCode").textContent=room;$("examTitle").textContent=live.mcqTitle||"MCQ Examination";await activateRoom(live);});
  }catch(e){showError(`Unable to load examination: ${e?.message||e}`);}
}
$("nextBtn").onclick=async()=>{if(idx<questions.length-1){idx++;await persistLive(false);renderQuestion();}else await finish(false);};
$("backBtn").onclick=()=>location.href="student.html";
init();
