import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, set, update, get, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getDatabase(app);
const $=id=>document.getElementById(id);
let uid=null, room=null, qNo=1, answersCache={}, participantsCache={}, questionsCache={}, allAnswersCache={};
let hostTimerInterval=null;
let unsubRoom=null, unsubParticipants=null, unsubQuestions=null, answerListeners={};

function msg(t,cls=""){ $("loginMsg").textContent=t; $("loginMsg").className=cls; }
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function roomRef(){return ref(db,`rooms/${room}`);}
function qRef(n){return ref(db,`rooms/${room}/questions/q${n}`);}
function clearSubscriptions(){
  // Firebase onValue unsubscribe functions are not stored by older SDK code here; page refresh is the normal lifecycle.
  answerListeners={};
}
async function unblockDisqualified(studentKey){
 if(!room || !uid) return;
 const p=participantsCache[studentKey];
 if(!p || !p.disqualified) return;
 if(!confirm(`Unblock ${p.name || "this participant"}? They will be allowed to participate again. Previous violation history will be retained.`)) return;
 await update(ref(db,`rooms/${room}/participants/${studentKey}`),{
   blocked:false,
   disqualified:false,
   disqualificationReason:null,
   unblockedBy:uid,
   unblockedAt:serverTimestamp(),
   canRejoin:true
 });
}
function renderDisqualifiedParticipants(){
 const arr=Object.values(participantsCache).filter(p=>p && p.disqualified && !p.winner);
 const body=$("disqualifiedParticipants");
 if(!body)return;
 if(!arr.length){body.innerHTML='<tr><td colspan="6">No disqualified participants.</td></tr>';return;}
 body.innerHTML=arr.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.designation)}</td><td>${esc(p.placeOfPosting)}</td><td>${esc(p.phone)}</td><td>${Number(p.violationCount||0)}</td><td><span class="badge red">BLOCKED / DISQUALIFIED</span> <button class="unblockBtn success" data-student-key="${esc(p.studentKey)}">UNBLOCK</button></td></tr>`).join("");
 document.querySelectorAll('.unblockBtn').forEach(btn=>btn.onclick=()=>unblockDisqualified(btn.dataset.studentKey));
}
function renderBlockedWinners(){
 const arr=Object.values(participantsCache).filter(p=>p && p.blocked && p.winner && !p.disqualified);
 const body=$("blockedWinners");
 if(!body)return;
 if(!arr.length){body.innerHTML='<tr><td colspan="6">No blocked winners yet.</td></tr>';return;}
 body.innerHTML=arr.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.designation)}</td><td>${esc(p.placeOfPosting)}</td><td>${esc(p.phone)}</td><td>Q${esc(p.winnerQuestion||"")} — ₹${Number(p.winnerPrize||0)}</td><td><span class="badge red">BLOCKED WINNER</span></td></tr>`).join("");
}
function renderParticipants(){
 const arr=Object.values(participantsCache);
 renderBlockedWinners(); renderDisqualifiedParticipants();
 $("participants").innerHTML=arr.map(p=>{
   const status=p.winner&&p.blocked&&!p.disqualified?'<span class="badge red">BLOCKED WINNER</span>':p.disqualified?'<span class="badge red">BLOCKED / DISQUALIFIED</span>':p.blocked?'<span class="badge red">BLOCKED</span>':'<span class="badge green">ACTIVE</span>';
   return `<tr><td>${esc(p.name)}</td><td>${esc(p.designation)}</td><td>${esc(p.placeOfPosting)}</td><td>${esc(p.phone)}</td><td>${Number(p.violationCount||0)}</td><td>${status}</td></tr>`;
 }).join("");
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
 const timerSeconds=Math.max(5,Math.min(3600,Number($("timerSeconds").value||30)));
 $("timerSeconds").value=timerSeconds;
 await set(roomRef(),{title,hostUid:uid,state:"waiting",currentQuestion:0,createdAt:serverTimestamp(),closedAt:null,revealed:false,winnerKey:null,qCount:count,timerSeconds});
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
 const savedTimer=Math.max(5,Math.min(3600,Number(r.timerSeconds||30)));
 $("timerSeconds").value=savedTimer; $("roomTimerSeconds").value=savedTimer;
 $("roomCode").textContent=code;$("roomInfo").classList.remove("hidden");$("quizControls").classList.remove("hidden");
 updateHostCountdownDisplay(savedTimer,false);
 qNo=Number(r.currentQuestion||1)||1; if(qNo>Number($("qCount").value)) qNo=1;
 await loadAllQuestions(); await loadQ(qNo); subscribeRoom();
 $("controlMsg").textContent=`Quiz room ${code} loaded. Saved questions and results are available.`;
}
async function resumeRoom(){const code=$("existingRooms").value; if(!code)return alert("Please select a saved quiz room first."); await openRoom(code);}
async function loadAllQuestions(){
 const s=await get(ref(db,`rooms/${room}/questions`)); questionsCache=s.val()||{};
}
function updateHostCountdownDisplay(seconds, live=false){
  const el=$("hostCountdown");
  if(!el)return;
  const total=Math.max(0,Math.ceil(Number(seconds)||0));
  const mm=String(Math.floor(total/60)).padStart(2,"0");
  const ss=String(total%60).padStart(2,"0");
  el.textContent=`${mm}:${ss}`;
  el.title=live?"Time remaining for the current question":"Configured time per question";
}
function subscribeRoom(){
 onValue(roomRef(),s=>{
   const r=s.val()||{}; $("roomState").innerHTML=`<span class="badge">${esc(r.state||"waiting")}</span>`;
   if(r.currentQuestion) $("liveQuestion").textContent=`Q${r.currentQuestion}: ${r.state}`;
   $("timerSettingMsg").textContent=`${Number(r.timerSeconds||30)} seconds per question.`;
   if(r.winnerName) $("winnerBox").innerHTML=`🏆 <b>${esc(r.winnerName)}</b> — ${esc(r.winnerTimeText||"")} — Prize ₹${Number(r.winnerPrize||0)}`;
   clearInterval(hostTimerInterval);
   if(r.state!=="open"){
     updateHostCountdownDisplay(Number(r.timerSeconds||30),false);
   }
   if(r.state==="open" && r.openedAt){
     const duration=Math.max(5,Number(r.timerSeconds||30))*1000;
     const tick=async()=>{
       const remaining=Math.max(0,duration-(Date.now()-Number(r.openedAt)));
       $("liveQuestion").textContent=`Q${r.currentQuestion}: LIVE — ${Math.ceil(remaining/1000)} sec remaining`;
       updateHostCountdownDisplay(Math.ceil(remaining/1000),true);
       if(remaining<=0){
         clearInterval(hostTimerInterval);
         const latest=(await get(roomRef())).val()||{};
         if(latest.state==="open" && latest.currentQuestion===r.currentQuestion){
           updateHostCountdownDisplay(0,true);
           await update(roomRef(),{state:"closed",closedAt:serverTimestamp(),timerExpired:true});
           $("controlMsg").textContent=`Time is over. Answers for Question ${r.currentQuestion} are closed automatically.`;
         }
       }
     };
     tick();
     hostTimerInterval=setInterval(tick,250);
   }
 });
 onValue(ref(db,`rooms/${room}/participants`),s=>{participantsCache=s.val()||{};renderParticipants();});
 onValue(ref(db,`rooms/${room}/answers/q${qNo}`),s=>{answersCache=s.val()||{};allAnswersCache[`q${qNo}`]=answersCache;renderAnswers();});
}
async function updateQuizTimer(){
 if(!room)return;
 const r=(await get(roomRef())).val()||{};
 if(r.currentQuestion && r.state!=="waiting"){
   $("timerSettingMsg").textContent="Timer can only be changed before the first question is shown.";
   return;
 }
 const seconds=Math.max(5,Math.min(3600,Number($("roomTimerSeconds").value||30)));
 await update(roomRef(),{timerSeconds:seconds});
 $("timerSeconds").value=seconds;
 $("roomTimerSeconds").value=seconds;
 updateHostCountdownDisplay(seconds,false);
 $("timerSettingMsg").textContent=`Timer set to ${seconds} seconds per question.`;
}
async function showQuestion(){
 const q=(await get(qRef(qNo))).val(); if(!q)return alert("Save this question first.");
 const roomData=(await get(roomRef())).val()||{};
 const timerSeconds=Math.max(5,Number(roomData.timerSeconds||30));
 await update(roomRef(),{state:"open",currentQuestion:qNo,openedAt:serverTimestamp(),timerSeconds,closedAt:null,revealed:false,winnerKey:null,winnerName:null,winnerTimeText:null,winnerPrize:q.prize});
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
   if(p.winner) winners.push({Question:p.winnerQuestion,Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,Prize:p.winnerPrize,Status:"PRIZE WON"});
   if(p.blocked && p.winner && !p.disqualified) blockedWinners.push({Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,"Winning Question":p.winnerQuestion||"",Prize:p.winnerPrize||0,Violations:p.violationCount||0,Status:"BLOCKED WINNER"});
   if(p.disqualified && !p.winner) disqualified.push({Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,Violations:p.violationCount||0,"Last Violation":p.lastViolationType||"",Reason:p.disqualificationReason||"Anti-cheating violation",Status:"BLOCKED / DISQUALIFIED"});
 });
 Object.entries(allAnswersCache).forEach(([qkey,answers])=>Object.values(answers||{}).forEach(a=>allAnswers.push({"Question":qkey.replace(/^q/,""),Name:a.name,Designation:a.designation,"Place of Posting":a.placeOfPosting,Mobile:a.phone,Answer:a.answer,Correct:a.correct?"Yes":"No","Time (sec)":a.elapsedMs==null?"":(a.elapsedMs/1000).toFixed(3),Eligible:a.eligible===false?"No":"Yes"})));
 const qres=Object.entries(questionsCache).sort((a,b)=>Number(a[0].replace(/^q/,""))-Number(b[0].replace(/^q/,""))).map(([k,q])=>({Question:k.replace(/^q/,""),QuestionText:q.text||"",Prize:q.prize||0,CorrectAnswer:q.correct||""}));
 const wb=XLSX.utils.book_new();
 function add(name,data){const ws=XLSX.utils.json_to_sheet(data.length?data:[{Info:"No data"}]);XLSX.utils.book_append_sheet(wb,ws,name);}
 add("Prize Winners",winners); add("All Participants",participants.map(p=>({Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,"Prize Won":p.winnerPrize||"",Violations:p.violationCount||0,Status:p.winner&&p.blocked&&!p.disqualified?"PRIZE WON":p.disqualified?"DISQUALIFIED":p.blocked?"BLOCKED":"ACTIVE"}))); add("Answer Log",allAnswers); add("Question Results",qres); add("Blocked Winners",blockedWinners); add("Disqualified Participants",disqualified);
 XLSX.writeFile(wb,`Quiz_Results_${room}.xlsx`);
}
$("signupBtn").onclick=async()=>{try{await createUserWithEmailAndPassword(auth,$("email").value,$("password").value);msg("Account created. You are signed in.");}catch(e){msg(e.message)}};
$("loginBtn").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("email").value,$("password").value);msg("Signed in.");}catch(e){msg(e.message)}};
$("logoutBtn").onclick=()=>signOut(auth);
$("importWordBtn").onclick=importWordQuestions;
$("wordFileInput").addEventListener("change",()=>{const f=$("wordFileInput").files?.[0]; $("wordImportMsg").textContent=f?`Selected: ${f.name}`:"";});
$("createRoomBtn").onclick=createRoom;$("resumeRoomBtn").onclick=resumeRoom;$("updateTimerBtn").onclick=updateQuizTimer;$("saveQBtn").onclick=saveQuestion;$("showBtn").onclick=showQuestion;$("closeBtn").onclick=closeAnswers;$("revealBtn").onclick=()=>revealWinner(false);$("randomTieBtn").onclick=()=>revealWinner(true);$("nextBtn").onclick=nextQuestion;$("prevQBtn").onclick=()=>loadQ(qNo-1);$("nextEditBtn").onclick=()=>loadQ(qNo+1);$("exportBtn").onclick=exportExcel;


// ---------------- Word (.docx) MCQ importer ----------------
function wordNorm(s){return String(s??"").replace(/\u00a0/g," ").replace(/[ \t]+/g," ").trim();}
async function readDocxParagraphs(buffer){
  if(!window.JSZip) throw new Error("Word reader is not loaded. Please refresh the Host Panel and try again.");
  const zip=await window.JSZip.loadAsync(buffer);
  const entry=zip.file("word/document.xml");
  if(!entry) throw new Error("This is not a valid .docx file.");
  const xml=await entry.async("string");
  const doc=new DOMParser().parseFromString(xml,"application/xml");
  if(doc.getElementsByTagName("parsererror").length) throw new Error("The Word document could not be read.");
  const paras=[...doc.getElementsByTagName("w:p")];
  return paras.map(p=>[...p.getElementsByTagName("w:t")].map(t=>t.textContent||"").join("")).map(wordNorm).filter(Boolean);
}
function parseWordMCQ(lines){
  const questions=new Map(), answers={}; let current=null, inKey=false;
  for(let i=0;i<lines.length;i++){
    const line=wordNorm(lines[i]);
    if(!line) continue;
    if(/^उत्तरमाला(?:\s*\(.*\))?$/i.test(line) || /^answer\s*key$/i.test(line)){inKey=true; current=null; continue;}
    if(inKey) continue;
    let m=line.match(/^(\d+)\s*[.)]\s*(.+)$/);
    if(m){current={number:Number(m[1]),text:wordNorm(m[2]),options:{A:"",B:"",C:"",D:""}}; questions.set(current.number,current); continue;}
    m=line.match(/^([ABCD])\s*[.)]\s*(.+)$/i);
    if(m && current){current.options[m[1].toUpperCase()]=wordNorm(m[2]);}
  }
  // The supplied document stores the answer key as alternating paragraphs: 1, A, 16, C, 2, A, ...
  const keyStart=lines.findIndex(x=>/^उत्तरमाला(?:\s*\(.*\))?$/i.test(wordNorm(x)) || /^answer\s*key$/i.test(wordNorm(x)));
  if(keyStart>=0){
    const vals=lines.slice(keyStart+1).map(wordNorm).filter(Boolean);
    for(let i=0;i<vals.length;){
      if(/^प्रश्न$/i.test(vals[i]) || /^उत्तर$/i.test(vals[i])){i++;continue;}
      const n=vals[i].match(/^(\d+)$/); const a=vals[i+1]?.match(/^([ABCD])$/i);
      if(n && a){answers[Number(n[1])]=a[1].toUpperCase(); i+=2; continue;}
      const pair=vals[i].match(/^(\d+)\s*[.:\-]?\s*([ABCD])$/i);
      if(pair){answers[Number(pair[1])]=pair[2].toUpperCase(); i++; continue;}
      // Also accept compact cells/paragraphs such as "1 A 16 C".
      const all=[...vals[i].matchAll(/(\d+)\s*([ABCD])\b/gi)];
      if(all.length){all.forEach(x=>answers[Number(x[1])]=x[2].toUpperCase());}
      i++;
    }
  }
  const result=[...questions.values()].sort((a,b)=>a.number-b.number).filter(q=>q.text && q.options.A && q.options.B && q.options.C && q.options.D);
  result.forEach(q=>q.correct=answers[q.number]||"");
  return result;
}
async function importWordQuestions(){
  const status=$("wordImportMsg");
  try{
    if(!room){status.textContent="Please create or resume a quiz room first."; return;}
    const input=$("wordFileInput"), file=input?.files?.[0];
    if(!file){status.textContent="Please choose a .docx Word file first."; return;}
    if(!/\.docx$/i.test(file.name)){status.textContent="Please select a .docx Word file."; return;}
    status.textContent=`Reading ${file.name}…`;
    const parsed=parseWordMCQ(await readDocxParagraphs(await file.arrayBuffer()));
    if(!parsed.length) throw new Error("No complete MCQs were found.");
    const missing=parsed.filter(q=>!q.correct);
    if(missing.length) throw new Error(`Answer key missing for question(s): ${missing.map(q=>q.number).join(", ")}`);
    const invalid=parsed.filter(q=>!['A','B','C','D'].includes(q.correct));
    if(invalid.length) throw new Error(`Invalid answer key for question(s): ${invalid.map(q=>q.number).join(", ")}`);
    const ok=window.confirm(`Found ${parsed.length} questions in ${file.name}.\n\nImport them into room ${room}?`);
    if(!ok){status.textContent="Import cancelled."; return;}
    const defaultPrize=Number($("prize")?.value||0), updates={};
    parsed.forEach((q,i)=>updates[`rooms/${room}/questions/q${i+1}`]={number:i+1,text:q.text,options:q.options,correct:q.correct,prize:defaultPrize,importedFrom:file.name,updatedAt:serverTimestamp()});
    updates[`rooms/${room}/qCount`]=parsed.length;
    await update(ref(db),updates);
    $("qCount").value=parsed.length; qNo=1; await loadAllQuestions(); await loadQ(1);
    status.textContent=`✓ Imported ${parsed.length} questions successfully. You can set each Prize (₹) separately.`;
    $("controlMsg").textContent=`${parsed.length} questions imported from ${file.name}.`;
  }catch(err){console.error(err); status.textContent=`Import failed: ${err?.message||err}`;}
}

onAuthStateChanged(auth,async user=>{uid=user?.uid||null;$("authStatus").textContent=user?"Host signed in":"Not signed in";$("loginCard").classList.toggle("hidden",!!user);$("hostApp").classList.toggle("hidden",!user);if(user){await loadExistingRooms();const last=localStorage.getItem("liveQuizLastRoom");if(last) {const s=await get(ref(db,`rooms/${last}`));if(s.exists()&&s.val().hostUid===uid) await openRoom(last);}}});
