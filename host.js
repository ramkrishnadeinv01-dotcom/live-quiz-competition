import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, set, update, get, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getDatabase(app);
const $=id=>document.getElementById(id);
let uid=null, room=null, qNo=1, answersCache={}, participantsCache={}, questionsCache={}, allAnswersCache={};
let unsubRoom=null, unsubParticipants=null, unsubQuestions=null, answerListeners={};

function msg(t,cls=""){ $("loginMsg").textContent=t; $("loginMsg").className=cls; }
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function roomRef(){return ref(db,`rooms/${room}`);}
function qRef(n){return ref(db,`rooms/${room}/questions/q${n}`);}
function clearSubscriptions(){
  // Firebase onValue unsubscribe functions are not stored by older SDK code here; page refresh is the normal lifecycle.
  answerListeners={};
}
function renderParticipants(){
 const arr=Object.values(participantsCache);
 $("participants").innerHTML=arr.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.designation)}</td><td>${esc(p.placeOfPosting)}</td><td>${esc(p.phone)}</td><td>${Number(p.violationCount||0)}</td><td>${p.disqualified?'<span class="badge red">DISQUALIFIED</span>':p.blocked?'<span class="badge red">BLOCKED</span>':'<span class="badge green">ACTIVE</span>'}</td></tr>`).join("");
 const blockedWinners=arr.filter(x=>x.blocked&&x.winner&&!x.disqualified), disqualified=arr.filter(x=>x.disqualified&&!x.winner);
 $("blockedWinners").innerHTML=blockedWinners.length?blockedWinners.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.phone)}</td><td>${esc(p.winnerQuestion||"")}</td><td>₹${Number(p.winnerPrize||0)}</td><td><span class="badge red">BLOCKED WINNER</span></td></tr>`).join(""):"<tr><td colspan=5>No blocked winners</td></tr>";
 $("disqualifiedParticipants").innerHTML=disqualified.length?disqualified.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.phone)}</td><td>${Number(p.violationCount||0)}</td><td>${esc(p.disqualificationReason||"Anti-cheating violation")}</td><td><span class="badge red">DISQUALIFIED</span></td></tr>`).join(""):"<tr><td colspan=5>No disqualified participants</td></tr>";
 const blocked=arr.filter(x=>x.blocked&&!x.disqualified).length,winners=arr.filter(x=>x.winner).length;
 $("onlineCount").textContent=arr.length;$("blockedCount").textContent=blocked;$("winnerCount").textContent=winners;
}
function renderAnswers(){
 const arr=Object.values(answersCache).sort((a,b)=>(a.serverReceivedAt??Infinity)-(b.serverReceivedAt??Infinity));
 $("answerCount").textContent=arr.length;
 $("answers").innerHTML=arr.map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.designation)}</td><td>${esc(a.placeOfPosting)}</td><td>${esc(a.answer)}</td><td>${a.correct?'✓':'✗'}</td><td>${a.elapsedMs==null?'—':(a.elapsedMs/1000).toFixed(3)+' s'}</td><td>${a.eligible===false?'<span class="badge red">NO</span>':'<span class="badge green">YES</span>'}</td></tr>`).join("");
}
async function loadQ(n){
 qNo=Math.max(1,Math.min(Number($("qCount").value||10),n)); $("editorHeading").textContent=`Question ${qNo}`;
 const s=await get(qRef(qNo)); const q=s.val()||{};
 $("questionText").value=q.text||"";$("optA").value=q.options?.A||"";$("optB").value=q.options?.B||"";$("optC").value=q.options?.C||"";$("optD").value=q.options?.D||"";$("correct").value=q.correct||"A";$("prize").value=q.prize??500;
}
async function saveQuestion(){
 if(!room)return alert("Create or resume a quiz room first.");
 const data={number:qNo,text:$("questionText").value.trim(),options:{A:$("optA").value.trim(),B:$("optB").value.trim(),C:$("optC").value.trim(),D:$("optD").value.trim()},correct:$("correct").value,prize:Number($("prize").value||0),updatedAt:serverTimestamp()};
 if(!data.text || Object.values(data.options).some(x=>!x)) return alert("Please fill the question and all four options.");
 await set(qRef(qNo),data); questionsCache[`q${qNo}`]=data; $("controlMsg").textContent=`Question ${qNo} saved.`;
}
async function createRoom(){
 const code=Math.random().toString(36).slice(2,8).toUpperCase(); room=code;
 const title=$("quizTitle").value.trim()||"Live Quiz", count=Number($("qCount").value||10);
 await set(roomRef(),{title,hostUid:uid,state:"waiting",currentQuestion:0,createdAt:serverTimestamp(),closedAt:null,revealed:false,winnerKey:null,qCount:count});
 localStorage.setItem("liveQuizLastRoom",code);
 await openRoom(code);
}
async function loadExistingRooms(){
 const sel=$("existingRooms"); sel.innerHTML='<option value="">Select a saved quiz room</option>';
 try{
   const snap=await get(ref(db,"rooms")); const rooms=snap.val()||{}; let found=0;
   Object.entries(rooms).filter(([,r])=>r && r.hostUid===uid).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0)).forEach(([code,r])=>{
     found++; const opt=document.createElement("option"); opt.value=code; opt.textContent=`${code} — ${r.title||"Live Quiz"}`; sel.appendChild(opt);
   });
   const last=localStorage.getItem("liveQuizLastRoom"); if(last && rooms[last]?.hostUid===uid) sel.value=last;
   if(!found) $("controlMsg").textContent="No saved quiz rooms found yet.";
 }catch(e){ console.error(e); }
}
async function openRoom(code){
 const snap=await get(ref(db,`rooms/${code}`)); const r=snap.val();
 if(!r || r.hostUid!==uid) return alert("Saved quiz room not found or not owned by this host.");
 room=code; localStorage.setItem("liveQuizLastRoom",code);
 $("quizTitle").value=r.title||"Live Quiz Competition"; $("qCount").value=Number(r.qCount||10);
 $("roomCode").textContent=code;$("roomInfo").classList.remove("hidden");$("quizControls").classList.remove("hidden");
 qNo=Number(r.currentQuestion||1)||1; if(qNo>Number($("qCount").value)) qNo=1;
 await loadAllQuestions(); await loadQ(qNo); subscribeRoom();
 $("controlMsg").textContent=`Quiz room ${code} loaded. Saved questions and results are available.`;
}
async function resumeRoom(){const code=$("existingRooms").value; if(!code)return alert("Please select a saved quiz room first."); await openRoom(code);}
async function loadAllQuestions(){
 const s=await get(ref(db,`rooms/${room}/questions`)); questionsCache=s.val()||{};
}
function subscribeRoom(){
 onValue(roomRef(),s=>{
   const r=s.val()||{}; $("roomState").innerHTML=`<span class="badge">${esc(r.state||"waiting")}</span>`;
   if(r.currentQuestion) $("liveQuestion").textContent=`Q${r.currentQuestion}: ${r.state}`;
   if(r.winnerName) $("winnerBox").innerHTML=`🏆 <b>${esc(r.winnerName)}</b> — ${esc(r.winnerTimeText||"")} — Prize ₹${Number(r.winnerPrize||0)}`;
 });
 onValue(ref(db,`rooms/${room}/participants`),s=>{participantsCache=s.val()||{};renderParticipants();});
 onValue(ref(db,`rooms/${room}/answers/q${qNo}`),s=>{answersCache=s.val()||{};allAnswersCache[`q${qNo}`]=answersCache;renderAnswers();});
}
async function showQuestion(){
 const q=(await get(qRef(qNo))).val(); if(!q)return alert("Save this question first.");
 await update(roomRef(),{state:"open",currentQuestion:qNo,openedAt:serverTimestamp(),closedAt:null,revealed:false,winnerKey:null,winnerName:null,winnerTimeText:null,winnerPrize:q.prize});
 $("controlMsg").textContent=`Question ${qNo} is now LIVE.`;
}
async function closeAnswers(){if(room)await update(roomRef(),{state:"closed",closedAt:serverTimestamp()});}
async function revealWinner(randomTie=false){
 if(!room)return;
 const r=(await get(roomRef())).val()||{}, n=r.currentQuestion||qNo;
 const s=(await get(ref(db,`rooms/${room}/answers/q${n}`))).val()||{};
 const list=Object.entries(s).map(([key,a])=>({...a,key})).filter(a=>a.correct && a.eligible!==false && !participantsCache[a.studentKey]?.blocked && !participantsCache[a.studentKey]?.disqualified);
 if(!list.length){await update(roomRef(),{state:"revealed",revealed:true,winnerKey:null,winnerName:null,winnerTimeText:"No eligible correct answer"});return;}
 list.sort((a,b)=>(a.serverReceivedAt??Infinity)-(b.serverReceivedAt??Infinity));
 const bestTime=list[0].serverReceivedAt, ties=list.filter(a=>a.serverReceivedAt===bestTime); let winner=ties[0];
 if(ties.length>1 || randomTie) winner=ties[Math.floor(Math.random()*ties.length)];
 const winnerKey=winner.studentKey;
 await update(ref(db,`rooms/${room}/participants/${winnerKey}`),{blocked:true,winner:true,winnerQuestion:n,winnerPrize:Number(r.winnerPrize||0),blockedAt:serverTimestamp()});
 await update(roomRef(),{state:"revealed",revealed:true,winnerKey,winnerName:winner.name,winnerTimeText:`${(winner.elapsedMs/1000).toFixed(3)} sec${ties.length>1?' (random tie-break)':''}`,winnerPrize:Number(r.winnerPrize||0),winnerTie:ties.length>1,winnerTieCount:ties.length,winnerSelectedAt:serverTimestamp()});
 $("controlMsg").textContent=ties.length>1?`Tie detected: randomly selected from ${ties.length} students.`:"Winner selected.";
}
async function nextQuestion(){
 const next=qNo+1;if(next>Number($("qCount").value||10)){alert("Quiz complete.");return;}
 await update(roomRef(),{state:"waiting",currentQuestion:0,openedAt:null,closedAt:null,revealed:false,winnerKey:null});
 qNo=next; await loadQ(next); onValue(ref(db,`rooms/${room}/answers/q${next}`),s=>{answersCache=s.val()||{};allAnswersCache[`q${next}`]=answersCache;renderAnswers();},{onlyOnce:false});
}
async function refreshAllAnswerLogs(){
 const s=await get(ref(db,`rooms/${room}/answers`)); allAnswersCache=s.val()||{};
}
async function exportExcel(){
 if(!room)return alert("Create or resume a quiz room first.");
 if(!window.XLSX){alert("Excel export library could not be loaded. Please refresh the Host Panel and try again.");return;}
 await loadAllQuestions(); await refreshAllAnswerLogs();
 const participants=Object.values(participantsCache), winners=[], allAnswers=[], blockedWinners=[], disqualified=[];
 participants.forEach(p=>{
   if(p.winner)winners.push({Question:p.winnerQuestion,Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,Prize:p.winnerPrize,Status:"PRIZE WON"});
   if(p.blocked&&p.winner&&!p.disqualified)blockedWinners.push({Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,"Winning Question":p.winnerQuestion||"",Prize:p.winnerPrize||0,Violations:p.violationCount||0,Status:"BLOCKED WINNER"});
   if(p.disqualified&&!p.winner)disqualified.push({Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,Violations:p.violationCount||0,Reason:p.disqualificationReason||"Anti-cheating violation",Status:"DISQUALIFIED"});
 });
 Object.entries(allAnswersCache).forEach(([qkey,answers])=>Object.values(answers||{}).forEach(a=>allAnswers.push({"Question":qkey.replace(/^q/,""),Name:a.name,Designation:a.designation,"Place of Posting":a.placeOfPosting,Mobile:a.phone,Answer:a.answer,Correct:a.correct?"Yes":"No","Time (sec)":a.elapsedMs==null?"":(a.elapsedMs/1000).toFixed(3),Eligible:a.eligible===false?"No":"Yes"})));
 const qres=Object.entries(questionsCache).sort((a,b)=>Number(a[0].replace(/^q/,""))-Number(b[0].replace(/^q/,""))).map(([k,q])=>({Question:k.replace(/^q/,""),QuestionText:q.text||"",Prize:q.prize||0,CorrectAnswer:q.correct||""}));
 const wb=XLSX.utils.book_new();
 function add(name,data){const ws=XLSX.utils.json_to_sheet(data.length?data:[{Info:"No data"}]);XLSX.utils.book_append_sheet(wb,ws,name);}
 add("Prize Winners",winners); add("All Participants",participants.map(p=>({Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,"Prize Won":p.winnerPrize||"",Violations:p.violationCount||0,Status:p.winner?"PRIZE WON":p.disqualified?"DISQUALIFIED":p.blocked?"BLOCKED":"ACTIVE"}))); add("Answer Log",allAnswers); add("Question Results",qres); add("Blocked Winners",blockedWinners); add("Disqualified Participants",disqualified);
 XLSX.writeFile(wb,`Quiz_Results_${room}.xlsx`);
}
$("signupBtn").onclick=async()=>{try{await createUserWithEmailAndPassword(auth,$("email").value,$("password").value);msg("Account created. You are signed in.");}catch(e){msg(e.message)}};
$("loginBtn").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("email").value,$("password").value);msg("Signed in.");}catch(e){msg(e.message)}};
$("logoutBtn").onclick=()=>signOut(auth);
$("createRoomBtn").onclick=createRoom;$("resumeRoomBtn").onclick=resumeRoom;$("saveQBtn").onclick=saveQuestion;$("showBtn").onclick=showQuestion;$("closeBtn").onclick=closeAnswers;$("revealBtn").onclick=()=>revealWinner(false);$("randomTieBtn").onclick=()=>revealWinner(true);$("nextBtn").onclick=nextQuestion;$("prevQBtn").onclick=()=>loadQ(qNo-1);$("nextEditBtn").onclick=()=>loadQ(qNo+1);$("exportBtn").onclick=exportExcel;
onAuthStateChanged(auth,async user=>{uid=user?.uid||null;$("authStatus").textContent=user?"Host signed in":"Not signed in";$("loginCard").classList.toggle("hidden",!!user);$("hostApp").classList.toggle("hidden",!user);if(user){await loadExistingRooms();const last=localStorage.getItem("liveQuizLastRoom");if(last) {const s=await get(ref(db,`rooms/${last}`));if(s.exists()&&s.val().hostUid===uid) await openRoom(last);}}});
