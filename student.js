import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, get, runTransaction, update, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const authReady=signInAnonymously(auth).catch(e=>{console.error("Participant anonymous authentication failed",e);return null;});
const $=id=>document.getElementById(id);
let room="",studentKey="",selected="",questionNo=0,openedAt=0,answered=false,timer,violationCount=0,lastViolationAt=0;
let questionTimerSeconds=30;
const opts=["A","B","C","D"];
const IST_TIME_ZONE="Asia/Kolkata";
function formatIST(timestamp){if(!timestamp)return "";const d=new Date(Number(timestamp));if(Number.isNaN(d.getTime()))return "";return d.toLocaleString("en-IN",{timeZone:IST_TIME_ZONE,dateStyle:"medium",timeStyle:"short",hour12:true})+" IST";}
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
 const signedIn=await authReady;
 if(!signedIn){$("roomModalMsg").className="status blocked";$("roomModalMsg").textContent="Participant sign-in is unavailable. Please enable Anonymous sign-in in Firebase Authentication.";return;}
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
 const signedIn=await authReady;
 if(!signedIn){alert("Participant sign-in is unavailable. Please enable Anonymous sign-in in Firebase Authentication.");return;}
 room=code; const phone=p.phone;
 studentKey=phoneKey(phone);
 const rs=await get(ref(db,`rooms/${room}`)); if(!rs.exists())return alert("Room not found."); const r=rs.val()||{};
 if(r.competitionClosed||r.state==="competition_closed")return alert("This competition is closed. You cannot join this room now.");
 const pRef=ref(db,`rooms/${room}/participants/${studentKey}`);
 const result=await runTransaction(pRef,current=>{
   if(current===null)return {studentKey,phone,name:p.name,designation:p.designation,placeOfPosting:p.placeOfPosting,blocked:false,winner:false,disqualified:false,violationCount:0,joinedAt:{".sv":"timestamp"}};
   if(current.canRejoin===true&&!current.blocked&&!current.disqualified&&!current.winner)return {...current,studentKey,phone:current.phone||phone,name:current.name||p.name,designation:current.designation||p.designation,placeOfPosting:current.placeOfPosting||p.placeOfPosting,canRejoin:false,lastRejoinedAt:{".sv":"timestamp"}};
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
$("viewResultBtn").onclick=async()=>{
 const code=$("resultRoomCode").value.trim().toUpperCase();
 const resultPhone=$("resultPhoneNumber").value.trim();
 const p=JSON.parse(sessionStorage.getItem("quizParticipant")||"null");
 if(!/^[A-Z0-9]{6}$/.test(code)){ $("resultSummary").textContent="Enter a valid 6-character room code.";return; }
 const key=phoneKey(resultPhone);
 if(key.length<10){ $("resultSummary").textContent="Enter the 10-digit phone number used during the examination.";return; }
 const snap=await get(ref(db,`rooms/${code}`));
 if(!snap.exists()){ $("resultSummary").textContent="Room not found.";return; }
 const roomData=snap.val()||{};
 if(roomData.mcqQuestions && roomData.mcqAnswers){
   // Find the participant result in the active run first. If the Host used
   // RESTART EXAM, the previous run is preserved under mcqHistory, so search
   // the archived runs as well. This prevents a valid submitted result from
   // disappearing after a restart.
   let mcqAnswers=roomData.mcqAnswers||{};
   let rec=mcqAnswers[key]||null;
   if(!rec){for(const v of Object.values(mcqAnswers)){if(v && phoneKey(String(v.phone||""))===key){rec=v;break;}}}
   let resultRunLabel="Current Run";
   if(!rec){
     const history=roomData.mcqHistory||{};
     const historyEntries=Object.entries(history).sort((a,b)=>{
       const ta=Number(a[1]?.closedAt||a[1]?.archivedAt||a[1]?.startedAt||a[0]||0);
       const tb=Number(b[1]?.closedAt||b[1]?.archivedAt||b[1]?.startedAt||b[0]||0);
       return tb-ta;
     });
     for(const [runId,run] of historyEntries){
       const aa=run?.mcqAnswers||{};
       let candidate=aa[key]||null;
       if(!candidate){for(const v of Object.values(aa)){if(v && phoneKey(String(v.phone||""))===key){candidate=v;break;}}}
       if(candidate){rec=candidate;mcqAnswers=aa;resultRunLabel=`Archived Run ${runId}`;break;}
     }
   }
   if(!rec){$("resultSummary").className="status";$("resultSummary").textContent="No MCQ result found for this participant in this room.";return;}
   const qObj=roomData.mcqQuestions||{};
   const qs=Object.keys(qObj).sort((a,b)=>Number((a.match(/\d+/)||[0])[0])-Number((b.match(/\d+/)||[0])[0])).map(k=>({id:k,...qObj[k]}));
   let correct=0,wrong=0,unanswered=0;
   const details=qs.map((q,i)=>{const a=String((rec.answers||{})[q.id]||"").toUpperCase();let r="Unanswered";if(a){if(a===String(q.correct||"").toUpperCase()){correct++;r="Correct"}else{wrong++;r="Wrong"}}else unanswered++;return {no:i+1,q,answer:a,result:r};});
   const pct=qs.length?correct*100/qs.length:0;
   const safe=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
   const ansText=(q,o)=>o?`${o}. ${q.options?.[o]||""}`:"Not answered";
   // Build participant rank from all submitted MCQ records in this room.
   const allMcqRecords=Object.values(mcqAnswers||{}).filter(v=>v&&typeof v==="object");
   const ranked=allMcqRecords.map(v=>{
     const aa=v.answers||{}; let c=0;
     qs.forEach(q=>{if(String(aa[q.id]||"").toUpperCase()===String(q.correct||"").toUpperCase())c++;});
     return {v,correct:c,submittedAt:Number(v.submittedAt||Number.MAX_SAFE_INTEGER)};
   }).sort((a,b)=>b.correct-a.correct || a.submittedAt-b.submittedAt);
   let rank=ranked.findIndex(x=>phoneKey(String(x.v.phone||""))===key);
   rank=rank>=0?rank+1:"—";

   window.downloadParticipantMcqPdf=async()=>{
     const src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
     if(!window.jspdf)await new Promise((res,rej)=>{const z=document.createElement("script");z.src=src;z.onload=res;z.onerror=rej;document.head.appendChild(z)});
     const {jsPDF}=window.jspdf;
     const doc=new jsPDF({unit:"mm",format:"a4"});
     const W=210,M=14,RIGHT=W-M;
     let y=15;
     const navy=[22,53,92],blue=[37,99,235],green=[22,163,74],red=[220,38,38],gold=[245,158,11],light=[241,245,249],dark=[30,41,59],muted=[71,85,105];
     const safeText=v=>String(v??"");
     const pageHeader=()=>{
       doc.setFillColor(...navy);doc.rect(0,0,W,30,"F");
       doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(18);
       doc.text("MCQ EXAMINATION",M,12);
       doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text("PARTICIPANT RESULT",M,19);
       doc.setFontSize(8);doc.text(`Room: ${code}`,RIGHT,12,{align:"right"});
       doc.text("Official Result",RIGHT,19,{align:"right"});
       y=38;doc.setTextColor(...dark);
     };
     const ensure=need=>{if(y+need>281){doc.addPage();pageHeader();}};
     const text=(t,size=9,bold=false,color=dark,max=180)=>{
       doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);doc.setTextColor(...color);
       const lines=doc.splitTextToSize(safeText(t),max);
       ensure(lines.length*(size*0.42+2.2)+2);
       doc.text(lines,M,y);y+=lines.length*(size*0.42+2.2);
     };
     const card=(x,yy,w,h,label,value,color)=>{
       doc.setFillColor(248,250,252);doc.roundedRect(x,yy,w,h,3,3,"F");
       doc.setFillColor(...color);doc.roundedRect(x,yy,3,h,1.5,1.5,"F");
       doc.setTextColor(...muted);doc.setFont("helvetica","bold");doc.setFontSize(7);doc.text(label,x+7,yy+7);
       doc.setTextColor(...dark);doc.setFont("helvetica","bold");doc.setFontSize(14);doc.text(String(value),x+7,yy+15);
     };
     const resultBadge=(x,yy,label,color)=>{
       doc.setFillColor(...color);doc.roundedRect(x,yy,31,7,3.5,3.5,"F");
       doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(7);doc.text(label,x+15.5,yy+4.7,{align:"center"});
     };
     pageHeader();
     doc.setTextColor(...dark);doc.setFont("helvetica","bold");doc.setFontSize(14);doc.text(roomData.mcqTitle||"MCQ Examination",M,y);y+=7;
     const examName=rec.examName||rec.name||"Participant";
     const examDesignation=rec.examDesignation||rec.designation||"";
     const examPlace=rec.examPlaceOfPosting||rec.placeOfPosting||"";
     const examRoll=rec.rollNo||rec.phone||resultPhone;
     text(`Participant Name: ${examName}`,10,true,navy); 
     text(`${examDesignation||""}  •  ${examPlace||""}`,8,false,muted);
     text(`Roll No.: ${examRoll||""}  •  Submitted: ${rec.submittedAt?new Date(Number(rec.submittedAt)).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",hour12:true}):"—"} IST`,8,false,muted);
     y+=4;
     const gap=4,cw=(W-2*M-3*gap)/4;
     card(M,y,cw,21,"CORRECT",correct,green);card(M+cw+gap,y,cw,21,"WRONG",wrong,red);card(M+2*(cw+gap),y,cw,21,"UNANSWERED",unanswered,blue);card(M+3*(cw+gap),y,cw,21,"PERCENTAGE",pct.toFixed(1)+"%",gold);
     y+=27;
     doc.setFillColor(...navy);doc.roundedRect(M,y,W-2*M,27,4,4,"F");
     doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text("FINAL RANK",M+8,y+9);
     doc.setFontSize(21);doc.text(`#${rank}`,M+8,y+20);
     doc.setFontSize(9);doc.text(`SCORE  ${correct}/${qs.length}`,RIGHT-8,y+10,{align:"right"});
     doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text(`Percentage  ${pct.toFixed(2)}%`,RIGHT-8,y+18,{align:"right"});
     y+=34;
     text("QUESTION-WISE PERFORMANCE",11,true,navy);y+=2;
     details.forEach(d=>{
       const qLines=doc.splitTextToSize(`Q${d.no}. ${d.q.text}`,170);
       const a1=ansText(d.q,d.answer),a2=ansText(d.q,d.q.correct);
       const boxH=Math.max(28,qLines.length*4.2+20);
       ensure(boxH+4);
       const boxY=y;doc.setFillColor(...light);doc.roundedRect(M,boxY,W-2*M,boxH,3,3,"F");
       doc.setFillColor(...(d.result==="Correct"?green:d.result==="Wrong"?red:blue));doc.roundedRect(M,boxY,3,boxH,1.5,1.5,"F");
       doc.setTextColor(...dark);doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text(qLines,M+7,boxY+7);
       let yy=boxY+7+qLines.length*4.2;
       doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(...muted);
       doc.text(`Your Answer: ${a1}`,M+7,yy);yy+=5;
       doc.text(`Correct Answer: ${a2}`,M+7,yy);
       resultBadge(RIGHT-38,boxY+6,d.result,d.result==="Correct"?green:d.result==="Wrong"?red:blue);
       y=boxY+boxH+4;
     });
     doc.setDrawColor(203,213,225);doc.line(M,286,RIGHT,286);
     doc.setTextColor(...muted);doc.setFont("helvetica","normal");doc.setFontSize(7);
     doc.text("Generated electronically • National/Institutional Examination Result",M,291);
     doc.text(`Page ${doc.internal.getNumberOfPages()}`,RIGHT,291,{align:"right"});
     const totalPages=doc.internal.getNumberOfPages();
     for(let i=1;i<=totalPages;i++){doc.setPage(i);doc.setTextColor(...muted);doc.setFontSize(7);doc.text(`Page ${i} of ${totalPages}`,RIGHT,291,{align:"right"});}
     doc.save(`MCQ_${code}_Result.pdf`);
   };
   $("resultSummary").className="status";
   $("resultSummary").innerHTML=`<div style="font-size:22px;font-weight:800;color:#16355c;margin-bottom:8px">🏆 FINAL RANK: #${rank}</div><b>${safe(rec.name||p.name)}</b><br>Exam: <b>${safe(roomData.mcqTitle||"MCQ Examination")}</b><br>Room: <b>${code}</b><br>Run: <b>${safe(resultRunLabel)}</b><br>Correct: <b>${correct}</b> &nbsp; Wrong: <b>${wrong}</b> &nbsp; Unanswered: <b>${unanswered}</b><br>Total Marks: <b>${correct}/${qs.length}</b> &nbsp; Percentage: <b>${pct.toFixed(2)}%</b><br><button class="success" type="button" style="margin-top:10px" onclick="downloadParticipantMcqPdf()">📄 DOWNLOAD MY RESULT – PDF</button>`;
   return;
 }
 function findParticipant(obj){
   if(!obj)return null;
   if(obj[key])return obj[key];
   for(const [k,v] of Object.entries(obj)){
     if(v && phoneKey(String(v.phone||""))===key)return v;
   }
   return null;
 }
 function makeSummary(ps,answers,label){
   let correct=0,total=0;
   Object.keys(answers||{}).forEach(q=>{const a=answers[q]?.[key] || Object.values(answers[q]||{}).find(x=>x && phoneKey(String(x.phone||""))===key);if(a){total++;if(a.correct)correct++;}});
   // Use the participant identity stored when the exam was taken. A later Result-login name is ignored.
   const examName=ps.name||"Participant";
   const examPhone=ps.phone||resultPhone||"";
   const status=ps.disqualified?"Disqualified":ps.winner?`CONGRATULATION ! YOU HAVE WON THE PRIZE FOR QUESTION NUMBER ${esc(ps.winnerQuestion||"")}.`:ps.blocked?"Blocked":"Participant";
   return `<b>${esc(examName)}</b><br>Roll No.: <b>${esc(examPhone)}</b><br>Room: <b>${esc(code)}</b><br>${label?`Competition: <b>${esc(label)}</b><br>`:""}Answered: <b>${total}</b><br>Correct: <b>${correct}</b><br>Status: <b>${esc(status)}</b>${ps.winner?`<br>Winning Question: <b>Q${esc(ps.winnerQuestion||"")}</b>`:""}`;
 }
 const current=findParticipant(roomData.participants);
 if(current){ $("resultSummary").className="status"; $("resultSummary").innerHTML=makeSummary(current,roomData.answers||{},"Current competition"); return; }
 const runs=roomData.runs||{};
 const matches=[];
 for(const [runId,run] of Object.entries(runs)){
   const rp=findParticipant(run?.participants);
   if(rp)matches.push({runId,run,rp});
 }
 matches.sort((a,b)=>(Number(b.run?.closedAt)||0)-(Number(a.run?.closedAt)||0));
 if(matches.length){
   const m=matches[0];
   $("resultSummary").className="status";
   $("resultSummary").innerHTML=makeSummary(m.rp,m.run?.answers||{},`${m.run?.runDate||""}${m.run?.runStartedAt?` — ${new Date(Number(m.run.runStartedAt)).toLocaleTimeString("en-IN", {timeZone:"Asia/Kolkata", hour:"2-digit", minute:"2-digit", hour12:true})} IST`:""}`);
   return;
 }
 $("resultSummary").className="status";
 $("resultSummary").textContent="No result found for this participant in this room.";
};
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

// ---------------- Other Exam Result (externally conducted exams) ----------------
async function sha256Student(s){const b=new TextEncoder().encode(String(s));const h=await crypto.subtle.digest("SHA-256",b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function otherNormalizePhone(v){let s=String(v??"").trim().replace(/\D/g,"");if(s.length===10)return "+91"+s;if(s.length===12&&s.startsWith("91"))return "+"+s;return "";}
function otherSafe(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
let otherExamResults=[];
async function searchOtherExamResults(){const input=$("otherResultPhone"),msgEl=$("otherResultMsg"),cards=$("otherResultCards");const phone=otherNormalizePhone(input.value);if(!phone){msgEl.className="status blocked";msgEl.textContent="Please enter a valid 10-digit mobile number.";cards.innerHTML="";$("otherResultDownloadAll").classList.add("hidden");return;}try{msgEl.className="status";msgEl.textContent="Searching published results…";cards.innerHTML="";const hash=await sha256Student(phone.replace(/\D/g,""));const snap=await get(ref(db,`otherExamResults/${hash}`));const data=snap.val()||{};otherExamResults=Object.values(data).sort((a,b)=>String(a.examDate||"").localeCompare(String(b.examDate||"")));if(!otherExamResults.length){msgEl.className="status blocked";msgEl.textContent="No published Other Exam Result was found for this mobile number.";$("otherResultDownloadAll").classList.add("hidden");return;}msgEl.className="status live";msgEl.textContent=`✓ ${otherExamResults.length} result(s) found.`;cards.innerHTML=otherExamResults.map((r,i)=>`<div class="card" style="border-left:5px solid #7c3aed"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 style="margin-bottom:5px">${otherSafe(r.examName||"Other Examination")}</h3><div class="muted">Exam Date: <b>${otherSafe(r.examDate||"—")}</b> &nbsp; | &nbsp; Roll No: <b>${otherSafe(r.rollNo||"—")}</b></div></div><button class="success otherPdfBtn" data-index="${i}">📄 DOWNLOAD RESULT</button></div><div class="grid" style="margin-top:14px"><div><b>Name</b><div>${otherSafe(r.name||"—")}</div></div><div><b>Designation</b><div>${otherSafe(r.designation||"—")}</div></div><div><b>Place of Posting</b><div>${otherSafe(r.placeOfPosting||"—")}</div></div><div><b>Marks</b><div>${otherSafe(r.obtainedMarks||"—")} / ${otherSafe(r.totalMarks||"—")}</div></div><div><b>Percentage</b><div>${otherSafe(r.percentage||"—")}</div></div><div><b>Rank</b><div>${otherSafe(r.rank||"—")}</div></div><div><b>Result / Status</b><div><span class="badge green">${otherSafe(r.status||"—")}</span></div></div><div><b>Remarks</b><div>${otherSafe(r.remarks||"—")}</div></div></div></div>`).join("");document.querySelectorAll(".otherPdfBtn").forEach(b=>b.onclick=()=>downloadOtherResultPdf(otherExamResults[Number(b.dataset.index)]));$("otherResultDownloadAll").classList.toggle("hidden",otherExamResults.length<1);$("downloadOtherAllBtn").onclick=()=>downloadOtherAllPdf();}catch(e){console.error(e);msgEl.className="status blocked";msgEl.textContent=`Unable to search result: ${e.message||e}`;}}
async function loadJsPdf(){if(window.jspdf)return;await new Promise((res,rej)=>{const z=document.createElement("script");z.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";z.onload=res;z.onerror=rej;document.head.appendChild(z)});}
function pdfText(doc,text,x,y,max=180,size=9,bold=false){doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);const lines=doc.splitTextToSize(String(text??""),max);doc.text(lines,x,y);return y+lines.length*(size*0.42+2.2);}
async function downloadOtherResultPdf(r){try{await loadJsPdf();const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a4"});const W=210,M=14;doc.setFillColor(59,7,100);doc.rect(0,0,W,32,"F");doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(18);doc.text("OTHER EXAMINATION RESULT",M,13);doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text("Published Result — Separate from Portal Examinations",M,21);let y=43;doc.setTextColor(30,41,59);doc.setFont("helvetica","bold");doc.setFontSize(15);doc.text(String(r.examName||"Other Examination"),M,y);y+=9;const rows=[["Exam Date",r.examDate||"—"],["Publication ID",r.publicationId||"—"],["Roll No",r.rollNo||"—"],["Name",r.name||"—"],["Designation",r.designation||"—"],["Place of Posting",r.placeOfPosting||"—"],["Total Marks",r.totalMarks||"—"],["Obtained Marks",r.obtainedMarks||"—"],["Percentage",r.percentage||"—"],["Rank",r.rank||"—"],["Result / Status",r.status||"—"],["Remarks",r.remarks||"—"]];for(const [lab,val] of rows){doc.setFillColor(248,250,252);doc.roundedRect(M,y-5,W-2*M,11,2,2,"F");doc.setTextColor(71,85,105);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text(lab,M+5,y+1);doc.setTextColor(30,41,59);doc.setFont("helvetica",lab==="Result / Status"?"bold":"normal");doc.setFontSize(10);doc.text(String(val),M+55,y+1);y+=14;if(y>275){doc.addPage();y=20;}}doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(100,116,139);doc.text(`Downloaded on ${new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST`,M,289);const safe=String(r.name||"Result").replace(/[^a-z0-9]+/gi,"_");doc.save(`Other_Exam_Result_${safe}_${r.publicationId||""}.pdf`);}catch(e){alert(`PDF generation failed: ${e.message||e}`);}}
async function downloadOtherAllPdf(){if(!otherExamResults.length)return;try{await loadJsPdf();const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a4"});otherExamResults.forEach((r,idx)=>{if(idx)doc.addPage();const W=210,M=14;doc.setFillColor(59,7,100);doc.rect(0,0,W,32,"F");doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(18);doc.text("OTHER EXAMINATION RESULT",M,13);doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text("Published Result",M,21);let y=43;doc.setTextColor(30,41,59);doc.setFont("helvetica","bold");doc.setFontSize(15);doc.text(String(r.examName||"Other Examination"),M,y);y+=9;const rows=[["Exam Date",r.examDate||"—"],["Publication ID",r.publicationId||"—"],["Roll No",r.rollNo||"—"],["Name",r.name||"—"],["Designation",r.designation||"—"],["Place of Posting",r.placeOfPosting||"—"],["Total Marks",r.totalMarks||"—"],["Obtained Marks",r.obtainedMarks||"—"],["Percentage",r.percentage||"—"],["Rank",r.rank||"—"],["Result / Status",r.status||"—"],["Remarks",r.remarks||"—"]];for(const [lab,val] of rows){doc.setFillColor(248,250,252);doc.roundedRect(M,y-5,W-2*M,11,2,2,"F");doc.setTextColor(71,85,105);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text(lab,M+5,y+1);doc.setTextColor(30,41,59);doc.setFont("helvetica",lab==="Result / Status"?"bold":"normal");doc.setFontSize(10);doc.text(String(val),M+55,y+1);y+=14;}});doc.save("Other_Exam_Results.pdf");}catch(e){alert(`PDF generation failed: ${e.message||e}`);}}
function showOtherResultPanel(){$("portalResultLookup").classList.add("hidden");$("otherResultLookup").classList.remove("hidden");$("otherResultPhone").focus();}
function showPortalResultPanel(){$("otherResultLookup").classList.add("hidden");$("portalResultLookup").classList.remove("hidden");}
$("otherResultAssignment")?.addEventListener("click",()=>{showDashboard(JSON.parse(sessionStorage.getItem("quizParticipant")||"{}"));$("resultTab").click();showOtherResultPanel();});
$("otherResultCard")?.addEventListener("click",showOtherResultPanel);
$("portalResultCard")?.addEventListener("click",showPortalResultPanel);
$("searchOtherResultBtn")?.addEventListener("click",searchOtherExamResults);
$("otherResultPhone")?.addEventListener("keydown",e=>{if(e.key==="Enter")searchOtherExamResults();});
