import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, set, update, get, onValue, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getDatabase(app);
const $=id=>document.getElementById(id);
let uid=null, room=null, qNo=1, answersCache={}, participantsCache={}, questionsCache={};
const letters=["A","B","C","D"];

function msg(t,cls=""){ $("loginMsg").textContent=t; $("loginMsg").className=cls; }
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function roomRef(){return ref(db,`rooms/${room}`);}
function qRef(n){return ref(db,`rooms/${room}/questions/q${n}`);}
function renderParticipants(){
 const arr=Object.values(participantsCache);
 $("participants").innerHTML=arr.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.designation)}</td><td>${esc(p.placeOfPosting)}</td><td>${esc(p.phone)}</td><td>${Number(p.violationCount||0)}</td><td>${p.blocked?'<span class="badge red">BLOCKED</span>':'<span class="badge green">ACTIVE</span>'}</td></tr>`).join("");
 const blocked=arr.filter(x=>x.blocked).length,winners=arr.filter(x=>x.winner).length;
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
 if(!room)return alert("Create a quiz room first.");
 const data={number:qNo,text:$("questionText").value.trim(),options:{A:$("optA").value.trim(),B:$("optB").value.trim(),C:$("optC").value.trim(),D:$("optD").value.trim()},correct:$("correct").value,prize:Number($("prize").value||0),updatedAt:serverTimestamp()};
 if(!data.text || Object.values(data.options).some(x=>!x)) return alert("Please fill the question and all four options.");
 await set(qRef(qNo),data); $("controlMsg").textContent=`Question ${qNo} saved.`;
}
async function createRoom(){
 const code=Math.random().toString(36).slice(2,8).toUpperCase();
 room=code;
 await set(roomRef(),{title:$("quizTitle").value.trim()||"Live Quiz",hostUid:uid,state:"waiting",currentQuestion:0,createdAt:serverTimestamp(),closedAt:null,revealed:false,winnerKey:null});
 $("roomCode").textContent=code;$("roomInfo").classList.remove("hidden");$("quizControls").classList.remove("hidden");await loadQ(1);subscribeRoom();
}
function subscribeRoom(){
 onValue(roomRef(),s=>{
   const r=s.val()||{}; $("roomState").innerHTML=`<span class="badge">${esc(r.state||"waiting")}</span>`;
   if(r.currentQuestion) $("liveQuestion").textContent=`Q${r.currentQuestion}: ${r.state}`;
   if(r.winnerName) $("winnerBox").innerHTML=`🏆 <b>${esc(r.winnerName)}</b> — ${esc(r.winnerTimeText||"")} — Prize ₹${Number(r.winnerPrize||0)}`;
 });
 onValue(ref(db,`rooms/${room}/participants`),s=>{participantsCache=s.val()||{};renderParticipants();});
 onValue(ref(db,`rooms/${room}/answers/q${qNo}`),s=>{answersCache=s.val()||{};renderAnswers();});
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
 const list=Object.entries(s).map(([key,a])=>({...a,key})).filter(a=>a.correct && a.eligible!==false && !participantsCache[a.studentKey]?.blocked);
 if(!list.length){await update(roomRef(),{state:"revealed",revealed:true,winnerKey:null,winnerName:null,winnerTimeText:"No eligible correct answer"});return;}
 list.sort((a,b)=>(a.serverReceivedAt??Infinity)-(b.serverReceivedAt??Infinity));
 const bestTime=list[0].serverReceivedAt;
 const ties=list.filter(a=>a.serverReceivedAt===bestTime);
 let winner=ties[0];
 if(ties.length>1 || randomTie) winner=ties[Math.floor(Math.random()*ties.length)];
 const winnerKey=winner.studentKey;
 await update(ref(db,`rooms/${room}/participants/${winnerKey}`),{blocked:true,winner:true,winnerQuestion:n,winnerPrize:Number(r.winnerPrize||0),blockedAt:serverTimestamp()});
 await update(roomRef(),{state:"revealed",revealed:true,winnerKey,winnerName:winner.name,winnerTimeText:`${(winner.elapsedMs/1000).toFixed(3)} sec${ties.length>1?' (random tie-break)':''}`,winnerPrize:Number(r.winnerPrize||0),winnerTie:ties.length>1, winnerTieCount:ties.length, winnerSelectedAt:serverTimestamp()});
 $("controlMsg").textContent=ties.length>1?`Tie detected: randomly selected from ${ties.length} students.`:"Winner selected.";
}
async function nextQuestion(){const next=qNo+1;if(next>Number($("qCount").value||10)){alert("Quiz complete.");return;}await update(roomRef(),{state:"waiting",currentQuestion:0,openedAt:null,closedAt:null,revealed:false,winnerKey:null});await loadQ(next);onValue(ref(db,`rooms/${room}/answers/q${next}`),s=>{answersCache=s.val()||{};renderAnswers();},{onlyOnce:false});}
function exportExcel(){
 if(!room)return alert("Create a room first.");
 const rows=[], winners=[], participants=Object.values(participantsCache);
 participants.forEach(p=>{if(p.winner)winners.push({Question:p.winnerQuestion,Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,Prize:p.winnerPrize,Status:"PRIZE WON"});});
 const allAnswers=[];
 Object.values(answersCache).forEach(a=>allAnswers.push({"Question":qNo,Name:a.name,Designation:a.designation,"Place of Posting":a.placeOfPosting,Mobile:a.phone,Answer:a.answer,Correct:a.correct?"Yes":"No","Time (sec)":a.elapsedMs==null?"":(a.elapsedMs/1000).toFixed(3),Eligible:a.eligible===false?"No":"Yes"}));
 const blocked=participants.filter(p=>p.blocked).map(p=>({Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,"Winning Question":p.winnerQuestion||"",Prize:p.winnerPrize||0,"Status":"BLOCKED"}));
 const qres=Object.keys(questionsCache).map(k=>({Question:k.replace("q",""),Prize:questionsCache[k].prize||0}));
 const wb=XLSX.utils.book_new();
 function add(name,data){const ws=XLSX.utils.json_to_sheet(data.length?data:[{Info:"No data"}]);XLSX.utils.book_append_sheet(wb,ws,name);}
 add("Prize Winners",winners);add("All Participants",participants.map(p=>({Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,"Prize Won":p.winnerPrize||"",Status:p.blocked?"BLOCKED":"ACTIVE"})));add("Answer Log",allAnswers);add("Question Results",qres);add("Blocked Participants",blocked);
 XLSX.writeFile(wb,`Quiz_Results_${room}.xlsx`);
}
$("signupBtn").onclick=async()=>{try{await createUserWithEmailAndPassword(auth,$("email").value,$("password").value);msg("Account created. You are signed in.");}catch(e){msg(e.message)}};
$("loginBtn").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("email").value,$("password").value);msg("Signed in.");}catch(e){msg(e.message)}};
$("logoutBtn").onclick=()=>signOut(auth);
$("createRoomBtn").onclick=createRoom;$("saveQBtn").onclick=saveQuestion;$("showBtn").onclick=showQuestion;$("closeBtn").onclick=closeAnswers;$("revealBtn").onclick=()=>revealWinner(false);$("randomTieBtn").onclick=()=>revealWinner(true);$("nextBtn").onclick=nextQuestion;$("prevQBtn").onclick=()=>loadQ(qNo-1);$("nextEditBtn").onclick=()=>loadQ(qNo+1);$("exportBtn").onclick=exportExcel;
onAuthStateChanged(auth,user=>{uid=user?.uid||null;$("authStatus").textContent=user?"Host signed in":"Not signed in";$("loginCard").classList.toggle("hidden",!!user);$("hostApp").classList.toggle("hidden",!user);});
