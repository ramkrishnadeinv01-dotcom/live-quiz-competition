import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, setPersistence, browserLocalPersistence, indexedDBLocalPersistence } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, set, update, get, onValue, serverTimestamp, remove } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getDatabase(app);
async function ensureAuthPersistence(){
  try { await setPersistence(auth,browserLocalPersistence); return "local"; }
  catch(e) { try { await setPersistence(auth,indexedDBLocalPersistence); return "indexeddb"; } catch(e2) { console.warn("Auth persistence unavailable", e2); return "memory"; } }
}
// IMPORTANT: Do not call setPersistence() during page startup. Firebase must first restore
// the existing signed-in session created on the Host Home page. Calling setPersistence
// immediately on this page can race with that restoration. Persistence is configured only
// immediately before an explicit new sign-in/registration action.

const $=id=>document.getElementById(id);
const ADMIN_EMAIL="ramkrishnadeinv.01@gmail.com";
let uid=null, currentUser=null, hostProfile=null, room=null, qNo=1, answersCache={}, participantsCache={}, questionsCache={}, allAnswersCache={};
let hostTimerInterval=null, competitionFrozen=false;
let unsubRoom=null, unsubParticipants=null, unsubQuestions=null, answerListeners={};

function isAdmin(user=currentUser){return String(user?.email||"").toLowerCase()===ADMIN_EMAIL.toLowerCase();}
function isApproved(){return isAdmin() || hostProfile?.status==="approved";}
async function ensureHostProfile(user){
  if(!user)return null;
  const h=await get(ref(db,`hosts/${user.uid}`));
  return h.exists()?h.val():null;
}
function profileComplete(p){
  return !!(p && p.hostName && p.designation && p.placeOfPosting && p.phone && p.purpose && p.purposeDetails);
}
function fillHostProfileForm(p=hostProfile){
  if(!p)return;
  if($("updateHostName"))$("updateHostName").value=p.hostName||"";
  if($("updateHostDesignation"))$("updateHostDesignation").value=p.designation||"";
  if($("updateHostPlace"))$("updateHostPlace").value=p.placeOfPosting||"";
  if($("updateHostPhone"))$("updateHostPhone").value=p.phone||"";
  if($("updateHostPurpose"))$("updateHostPurpose").value=p.purpose||"";
  if($("updateHostPurposeDetails"))$("updateHostPurposeDetails").value=p.purposeDetails||"";
}
function renderAccess(){
  const launcher=$("adminLauncher"), access=$("hostAccessCard"), appBox=$("hostApp"), updateBox=$("hostProfileUpdate");
  if(launcher)launcher.classList.toggle("hidden",!isAdmin());
  if(!currentUser){
    if(appBox)appBox.classList.add("hidden");
    if(access)access.classList.add("hidden");
    closeAdminModal();
    return;
  }
  if(isAdmin()){
    if(appBox)appBox.classList.remove("hidden");
    if(access)access.classList.add("hidden");
    return;
  }
  const approved=isApproved();
  if(appBox)appBox.classList.toggle("hidden",!approved);
  if(access)access.classList.remove("hidden");
  if(access){
    const st=$("hostAccessStatus");
    if(!hostProfile) st.innerHTML="📝 <b>Host registration is incomplete.</b><br>Please complete your Host Registration details below. Your host request will be created only after you save the complete information.";
    else if(hostProfile?.status==="pending") st.innerHTML="⏳ <b>Host permission is pending.</b><br>Your complete registration has been submitted. The Administrator must approve it before you can create or conduct a competition.";
    else if(hostProfile?.status==="rejected"||hostProfile?.status==="revoked") st.innerHTML="🚫 <b>Host permission is not active.</b><br>Please contact the Administrator.";
    else st.textContent="Host permission is active.";
    fillHostProfileForm();
    if(updateBox)updateBox.classList.toggle("hidden",!!hostProfile?.status && profileComplete(hostProfile));
  }
}
function clearHostRegistrationFields(){
  ["hostName","hostDesignation","hostPlace","hostPhone","hostPurposeDetails","updateHostName","updateHostDesignation","updateHostPlace","updateHostPhone","updateHostPurposeDetails"].forEach(id=>{const el=$(id);if(el)el.value="";});
  ["hostPurpose","updateHostPurpose"].forEach(id=>{const el=$(id);if(el)el.value="";});
}

function openAdminModal(){
  if(!isAdmin())return;
  const m=$("adminModal");
  if(m){m.classList.remove("hidden");m.setAttribute("aria-hidden","false");}
  loadHostRequests();
}
function closeAdminModal(){
  const m=$("adminModal");
  if(m){m.classList.add("hidden");m.setAttribute("aria-hidden","true");}
}
async function loadHostRequests(){
  if(!isAdmin())return;
  const body=$("hostRequests"), status=$("adminStatus"); if(!body)return;
  try{
    const snap=await get(ref(db,"hosts")); const hosts=snap.val()||{}; const arr=Object.entries(hosts).map(([id,h])=>({uid:id,...h})).sort((a,b)=>(Number(b.requestedAt)||0)-(Number(a.requestedAt)||0));
    status.textContent=`${arr.filter(x=>x.status==="pending").length} pending request(s).`;
    if(!arr.length){body.innerHTML='<tr><td colspan="9">No host requests.</td></tr>';return;}
    body.innerHTML=arr.map(h=>{
      const st=String(h.status||"pending").toUpperCase();
      let action="";
      if(h.uid!==uid){
        const opts=[];
        if(h.status==="pending"){opts.push('<option value="approved">Approve</option>','<option value="rejected">Reject</option>');}
        else if(h.status==="approved"){opts.push('<option value="revoked">Revoke</option>');}
        else {opts.push('<option value="approved">Approve</option>','<option value="rejected">Reject</option>');}
        opts.push('<option value="__delete__">Delete</option>');
        action=`<select class="hostActionSelect" data-uid="${esc(h.uid)}"><option value="">Select Action</option>${opts.join("")}</select>`;
      }
      const when=h.requestedAt?new Date(Number(h.requestedAt)).toLocaleString():"";
      const purpose=h.purpose?`${esc(h.purpose)}${h.purposeDetails?`<br><small>${esc(h.purposeDetails)}</small>`:""}`:"";
      return `<tr><td>${esc(h.email||"")}</td><td>${esc(h.hostName||"")}</td><td>${esc(h.designation||"")}</td><td>${esc(h.placeOfPosting||"")}</td><td>${esc(h.phone||"")}</td><td>${purpose}</td><td><span class="badge ${h.status==="approved"?'green':h.status==="pending"?'yellow':'red'}">${esc(st)}</span></td><td>${esc(when)}</td><td>${action||"—"}</td></tr>`;
    }).join("");
    document.querySelectorAll('.hostActionSelect').forEach(sel=>sel.onchange=async()=>{
      const action=sel.value, hostUid=sel.dataset.uid;
      if(!action)return;
      sel.value="";
      if(action==="__delete__") await deleteHostRequest(hostUid);
      else await setHostStatus(hostUid,action);
    });
  }catch(e){console.error(e);status.textContent=`Unable to load host requests: ${e.message||e}`;}
}
async function setHostStatus(hostUid,status){
  if(!isAdmin()||!hostUid)return;
  const label=status==="approved"?"approve":status==="revoked"?"revoke":"reject";
  if(!confirm(`Are you sure you want to ${label} this host?`))return;
  await update(ref(db,`hosts/${hostUid}`),{status,reviewedAt:serverTimestamp(),reviewedBy:currentUser.uid});
  await loadHostRequests();
}
async function deleteHostRequest(hostUid){
  if(!isAdmin()||!hostUid||hostUid===uid)return;
  if(!confirm("Delete this host request record? This removes the request from the Administrator portal but does not delete the login account."))return;
  await remove(ref(db,`hosts/${hostUid}`));
  await loadHostRequests();
}
async function saveHostProfile(){
  if(!currentUser)return;
  const hostName=$("updateHostName").value.trim(), designation=$("updateHostDesignation").value.trim(), placeOfPosting=$("updateHostPlace").value.trim(), phone=$("updateHostPhone").value.trim(), purpose=$("updateHostPurpose").value, purposeDetails=$("updateHostPurposeDetails").value.trim();
  const out=$("hostProfileUpdateMsg");
  if(!hostName||!designation||!placeOfPosting||!phone||!purpose||!purposeDetails){if(out)out.textContent="Please fill in all required registration fields.";return;}
  if(!/^[0-9+()\- ]{7,15}$/.test(phone)){if(out)out.textContent="Please enter a valid phone number.";return;}
  try{
    const existing=hostProfile||{};
    const data={email:(currentUser.email||"").toLowerCase(),hostName,designation,placeOfPosting,phone,purpose,purposeDetails,status:existing.status||"pending",requestedAt:existing.requestedAt||Date.now(),updatedAt:serverTimestamp()};
    await update(ref(db,`hosts/${currentUser.uid}`),data);
    hostProfile={...existing,...data,updatedAt:Date.now(),requestedAt:existing.requestedAt||Date.now()};
    if(out)out.textContent="✓ Registration details saved. The Administrator can now review the complete information.";
    renderAccess();
    if(isAdmin())await loadHostRequests();
  }catch(e){if(out)out.textContent=e.message||String(e);}
}
function msg(t,cls=""){ $("loginMsg").textContent=t; $("loginMsg").className=cls; }
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function roomRef(){return ref(db,`rooms/${room}`);}
function qRef(n){return ref(db,`rooms/${room}/questions/q${n}`);}
function localRunDate(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function runLabel(run){
  const d=run?.runStartedAt || run?.closedAt || run?.createdAt || 0;
  const dt=d ? new Date(Number(d)) : null;
  const date=run?.runDate || (dt ? `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}` : "Unknown date");
  const time=dt && !Number.isNaN(dt.getTime()) ? ` — ${dt.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` : "";
  return `${date}${time}`;
}
async function archiveCurrentRun(r, force=false){
  if(!room || !r) return null;
  const runId=r.runId || `${r.runDate||localRunDate()}_${r.runStartedAt||Date.now()}`;
  if(r.runArchived && !force) return runId;
  const [ps,as,vs,qs]=await Promise.all([
    get(ref(db,`rooms/${room}/participants`)),
    get(ref(db,`rooms/${room}/answers`)),
    get(ref(db,`rooms/${room}/violations`)),
    get(ref(db,`rooms/${room}/questions`))
  ]);
  const archive={
    runId, runDate:r.runDate||localRunDate(), runStartedAt:r.runStartedAt||r.createdAt||Date.now(),
    closedAt:r.closedAt||Date.now(), title:r.title||"Live Quiz Competition", qCount:Number(r.qCount||10), timerSeconds:Number(r.timerSeconds||30),
    participants:ps.val()||{}, answers:as.val()||{}, violations:vs.val()||{}, questions:qs.val()||{}
  };
  await set(ref(db,`rooms/${room}/runs/${runId}`),archive);
  return runId;
}
async function populateRunSelector(){
  const sel=$("resultRunSelect"); if(!sel || !room)return;
  const snap=await get(ref(db,`rooms/${room}/runs`)); const runs=snap.val()||{};
  sel.innerHTML='<option value="">Select a completed competition</option>';
  Object.entries(runs).sort((a,b)=>(Number(b[1]?.closedAt)||0)-(Number(a[1]?.closedAt)||0)).forEach(([id,run])=>{
    const opt=document.createElement("option"); opt.value=id; opt.textContent=runLabel(run); sel.appendChild(opt);
  });
}
async function getSelectedRun(){
  const id=$("resultRunSelect")?.value;
  if(!room || !id)return null;
  const s=await get(ref(db,`rooms/${room}/runs/${id}`)); return s.exists()?s.val():null;
}
function renderSelectedRun(run){
  const box=$("selectedResultSummary"), tables=$("selectedResultTables");
  if(!run){ if(box)box.textContent="Select a completed competition to view its frozen result."; if(tables)tables.classList.add("hidden"); return; }
  const participants=Object.values(run.participants||{});
  const winners=participants.filter(p=>p.winner);
  const disq=participants.filter(p=>p.disqualified && !p.winner);
  if(box)box.innerHTML=`<b>${esc(runLabel(run))}</b> — ${winners.length} prize winner(s), ${participants.length} participant(s), ${disq.length} disqualified participant(s). This result is frozen.`;
  const wb=$("historyWinners"), db=$("historyDisqualified");
  if(wb)wb.innerHTML=winners.length?winners.map(p=>`<tr><td>Q${esc(p.winnerQuestion||"")}</td><td>${esc(p.name)}</td><td>${esc(p.designation)}</td><td>${esc(p.placeOfPosting)}</td><td>${esc(p.phone)}</td><td>₹${Number(p.winnerPrize||0)}</td></tr>`).join(""):'<tr><td colspan="6">No prize winners.</td></tr>';
  if(db)db.innerHTML=disq.length?disq.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.designation)}</td><td>${esc(p.placeOfPosting)}</td><td>${esc(p.phone)}</td><td>${Number(p.violationCount||0)}</td><td>DISQUALIFIED</td></tr>`).join(""):'<tr><td colspan="6">No disqualified participants.</td></tr>';
  if(tables)tables.classList.remove("hidden");
}
async function viewSelectedResult(){ renderSelectedRun(await getSelectedRun()); }
function clearSubscriptions(){
  // Firebase onValue unsubscribe functions are not stored by older SDK code here; page refresh is the normal lifecycle.
  answerListeners={};
}
async function unblockDisqualified(studentKey){
 if(!room || !uid || competitionFrozen) return;
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
 body.innerHTML=arr.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.designation)}</td><td>${esc(p.placeOfPosting)}</td><td>${esc(p.phone)}</td><td>${Number(p.violationCount||0)}</td><td><span class="badge red">BLOCKED / DISQUALIFIED</span> <button class="unblockBtn success" data-student-key="${esc(p.studentKey)}" ${competitionFrozen?"disabled":""}>UNBLOCK</button></td></tr>`).join("");
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
 if(!isApproved()) return alert("Host permission is pending or inactive. Please obtain Administrator approval first.");
 const code=Math.random().toString(36).slice(2,8).toUpperCase(); room=code;
 const title=$("quizTitle").value.trim()||"Live Quiz", count=Number($("qCount").value||10);
 const timerSeconds=Math.max(5,Math.min(3600,Number($("timerSeconds").value||30)));
 $("timerSeconds").value=timerSeconds;
 await set(roomRef(),{title,hostUid:uid,state:"waiting",currentQuestion:0,createdAt:serverTimestamp(),runStartedAt:Date.now(),runDate:localRunDate(),runId:`${localRunDate()}_${Date.now()}`,runArchived:false,closedAt:null,revealed:false,winnerKey:null,competitionClosed:false,qCount:count,timerSeconds});
 localStorage.setItem("liveQuizLastRoom",code);
 await openRoom(code);
}
async function loadExistingRooms(){
 const sel=$("existingRooms"); sel.innerHTML='<option value="">Select a saved quiz room</option>';
 try{
   const snap=await get(ref(db,"rooms")); const rooms=snap.val()||{}; let found=0;
   Object.entries(rooms).filter(([,r])=>r && (r.hostUid===uid || isAdmin())).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0)).forEach(([code,r])=>{
     found++; const opt=document.createElement("option"); opt.value=code; opt.textContent=`${code} — ${r.title||"Live Quiz"}`; sel.appendChild(opt);
   });
   const last=localStorage.getItem("liveQuizLastRoom"); if(last && rooms[last] && (rooms[last].hostUid===uid || isAdmin())) sel.value=last;
   if(!found) $("controlMsg").textContent="No saved quiz rooms found yet.";
 }catch(e){ console.error(e); }
}
async function openRoom(code){
 if(!isApproved()) return alert("Host permission is not active. Please obtain Administrator approval first.");
 const snap=await get(ref(db,`rooms/${code}`)); const r=snap.val();
 if(!r || r.hostUid!==uid) return alert("Saved quiz room not found or not owned by this host.");
 room=code; localStorage.setItem("liveQuizLastRoom",code);
 if(r.competitionClosed || r.state==="competition_closed"){ const rs=await get(ref(db,`rooms/${room}/runs`)); if(!rs.exists()) { await archiveCurrentRun(r,true); } await populateRunSelector(); }
 $("quizTitle").value=r.title||"Live Quiz Competition"; $("qCount").value=Number(r.qCount||10);
 const savedTimer=Math.max(5,Math.min(3600,Number(r.timerSeconds||30)));
 $("timerSeconds").value=savedTimer; $("roomTimerSeconds").value=savedTimer;
 $("roomCode").textContent=code;$("roomInfo").classList.remove("hidden");$("quizControls").classList.remove("hidden");
 updateHostCountdownDisplay(savedTimer,false);
 qNo=Number(r.currentQuestion||1)||1; if(qNo>Number($("qCount").value)) qNo=1;
 await loadAllQuestions(); await loadQ(qNo); subscribeRoom();
 $("controlMsg").textContent=`Quiz room ${code} loaded. Saved questions and results are available.`;
}
async function deleteQuizRoom(){
  if(!uid || !isApproved()) return alert("Host permission is not active.");
  const sel=$("existingRooms");
  const code=sel?.value || room;
  if(!code){
    return alert("Please select a quiz room from the Existing Quiz Room list first.");
  }
  const snap=await get(ref(db,`rooms/${code}`));
  const r=snap.val();
  if(!r) return alert(`Quiz room ${code} was not found. Please refresh the room list.`);
  if(!isAdmin() && r.hostUid!==uid) return alert("This quiz room is not owned by your host account.");
  const closed=!!r.competitionClosed || r.state==="competition_closed";
  if(!closed){
    alert(`Room ${code} is currently ACTIVE (${r.state||"waiting"}).\n\nFor safety, close the competition first. Then use Delete Quiz Room again.`);
    return;
  }
  const hasRuns=!!r.runs && Object.keys(r.runs).length>0;
  const warning=hasRuns
    ? `DELETE QUIZ ROOM ${code}?\n\nThis closed room contains frozen competition history.\n\nDeleting it will permanently remove the room, questions, participants, answers, violations and the frozen result history stored inside this room.\n\nPlease download the required Excel result BEFORE deleting.\n\nThis action cannot be undone.`
    : `DELETE QUIZ ROOM ${code}?\n\nThis will permanently remove the closed room and its stored quiz data.\n\nThis action cannot be undone.`;
  if(!confirm(warning)) return;
  if(!confirm(`FINAL CONFIRMATION\n\nPermanently delete Room ${code}?\n\nClick OK only if you are completely sure.`)) return;
  try{
    if(room===code){
      if(unsubRoom)try{unsubRoom();}catch(e){}
      if(unsubParticipants)try{unsubParticipants();}catch(e){}
      clearInterval(hostTimerInterval);
    }
    await remove(ref(db,`rooms/${code}`));
    if(room===code){
      room=null; competitionFrozen=false; localStorage.removeItem("liveQuizLastRoom");
      $("roomInfo")?.classList.add("hidden"); $("quizControls")?.classList.add("hidden");
    }
    await loadExistingRooms();
    $("controlMsg").textContent=`Quiz room ${code} was permanently deleted.`;
    alert(`Room ${code} has been deleted successfully.`);
  }catch(e){
    console.error(e);
    alert(`Unable to delete Room ${code}.\n\n${e.message||e}`);
  }
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
   if(r.competitionClosed || r.state==="competition_closed"){
     competitionFrozen=true;
     clearInterval(hostTimerInterval);
     $("hostCountdown").textContent="CLOSED";
     $("liveQuestion").textContent="Competition is CLOSED.";
     $("winnerBox").textContent="Competition closed.";
     $("controlMsg").textContent="Competition closed. New participants cannot join this room.";
     ["showBtn","closeBtn","revealBtn","randomTieBtn","nextBtn","saveQBtn","updateTimerBtn","importWordBtn","prevQBtn","nextEditBtn"].forEach(id=>{const el=$(id);if(el)el.disabled=true;});
     const cb=$("closeCompetitionBtn"); if(cb){cb.disabled=true;cb.textContent="🔒 COMPETITION CLOSED";}
     const rb=$("restartCompetitionBtn"); if(rb){rb.disabled=false;rb.textContent="🔄 RESTART COMPETITION";}
     populateRunSelector();
     return;
   }
   competitionFrozen=false;
   const rb=$("restartCompetitionBtn"); if(rb)rb.disabled=true;
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
async function closeCompetition(){
 if(!room)return;
 const r=(await get(roomRef())).val()||{};
 if(r.competitionClosed || r.state==="competition_closed")return;
 if(!confirm("Close this competition? Its complete result will be frozen and saved separately by date/time. No participant will be allowed to join this run again."))return;
 await archiveCurrentRun({...r,closedAt:Date.now()},true);
 await update(roomRef(),{state:"competition_closed",competitionClosed:true,runArchived:true,closedAt:serverTimestamp(),currentQuestion:0,openedAt:null,revealed:false,winnerKey:null,winnerName:null,winnerTimeText:null,winnerPrize:null});
 clearInterval(hostTimerInterval);
 $("hostCountdown").textContent="CLOSED";
 $("liveQuestion").textContent="Competition is CLOSED.";
 $("winnerBox").textContent="Competition closed. Result frozen.";
 $("controlMsg").textContent="Competition closed successfully. The result is frozen. Use RESTART COMPETITION to start another competition in the same room code.";
 ["showBtn","closeBtn","revealBtn","randomTieBtn","nextBtn","saveQBtn","updateTimerBtn","importWordBtn","prevQBtn","nextEditBtn"].forEach(id=>{const el=$(id);if(el)el.disabled=true;});
 const cb=$("closeCompetitionBtn"); if(cb){cb.disabled=true;cb.textContent="🔒 COMPETITION CLOSED";}
 const rb=$("restartCompetitionBtn"); if(rb){rb.disabled=false;rb.textContent="🔄 RESTART COMPETITION";}
 await populateRunSelector();
}
async function restartCompetition(){
 if(!room)return;
 competitionFrozen=false;
 const r=(await get(roomRef())).val()||{};
 if(!(r.competitionClosed || r.state==="competition_closed"))return alert("The current competition is still active. Close it first.");
 if(!confirm("Restart the competition using the SAME room code? The previous result will remain frozen and available by date/time. A new competition run will start with fresh participants."))return;
 const now=Date.now(), date=localRunDate(), runId=`${date}_${now}`;
 await update(roomRef(),{
   state:"waiting",competitionClosed:false,runArchived:false,runId,runDate:date,runStartedAt:now,
   currentQuestion:0,openedAt:null,closedAt:null,revealed:false,winnerKey:null,winnerName:null,winnerTimeText:null,winnerPrize:null,timerExpired:false
 });
 await set(ref(db,`rooms/${room}/participants`),null);
 await set(ref(db,`rooms/${room}/answers`),null);
 await set(ref(db,`rooms/${room}/violations`),null);
 participantsCache={};answersCache={};allAnswersCache={};
 qNo=1; await loadAllQuestions(); await loadQ(1); renderParticipants(); renderAnswers();
 $("controlMsg").textContent=`New competition started in the same room ${room}. Previous results remain frozen.`;
 const cb=$("closeCompetitionBtn"); if(cb){cb.disabled=false;cb.textContent="🔒 CLOSE COMPETITION";}
 const rb=$("restartCompetitionBtn"); if(rb)rb.disabled=true;
 ["showBtn","closeBtn","revealBtn","nextBtn","saveQBtn","updateTimerBtn","importWordBtn","prevQBtn","nextEditBtn"].forEach(id=>{const el=$(id);if(el)el.disabled=false;});
 await populateRunSelector();
 $("resultRunSelect").value=""; renderSelectedRun(null);
}
async function refreshAllAnswerLogs(){
 const s=await get(ref(db,`rooms/${room}/answers`)); allAnswersCache=s.val()||{};
}
async function exportExcel(){
 if(!room)return alert("Create or resume a quiz room first.");
 if(!window.XLSX){alert("Excel export library could not be loaded. Please refresh the Host Panel and try again.");return;}
 const run=await getSelectedRun();
 if(!run){alert("Please select the competition date/time whose frozen result you want to download.");return;}
 const participants=Object.values(run.participants||{}), winners=[], allAnswers=[], blockedWinners=[], disqualified=[];
 participants.forEach(p=>{
   if(p.winner) winners.push({Question:p.winnerQuestion,Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,Prize:p.winnerPrize,Status:"PRIZE WON"});
   if(p.blocked && p.winner && !p.disqualified) blockedWinners.push({Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,"Winning Question":p.winnerQuestion||"",Prize:p.winnerPrize||0,Violations:p.violationCount||0,Status:"BLOCKED WINNER"});
   if(p.disqualified && !p.winner) disqualified.push({Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,Violations:p.violationCount||0,"Last Violation":p.lastViolationType||"",Reason:p.disqualificationReason||"Anti-cheating violation",Status:"BLOCKED / DISQUALIFIED"});
 });
 Object.entries(run.answers||{}).forEach(([qkey,answers])=>Object.values(answers||{}).forEach(a=>allAnswers.push({"Question":qkey.replace(/^q/,""),Name:a.name,Designation:a.designation,"Place of Posting":a.placeOfPosting,Mobile:a.phone,Answer:a.answer,Correct:a.correct?"Yes":"No","Time (sec)":a.elapsedMs==null?"":(a.elapsedMs/1000).toFixed(3),Eligible:a.eligible===false?"No":"Yes"})));
 const qres=Object.entries(run.questions||{}).sort((a,b)=>Number(a[0].replace(/^q/,""))-Number(b[0].replace(/^q/,""))).map(([k,q])=>({Question:k.replace(/^q/,""),QuestionText:q.text||"",Prize:q.prize||0,CorrectAnswer:q.correct||""}));
 const wb=XLSX.utils.book_new();
 function add(name,data){const ws=XLSX.utils.json_to_sheet(data.length?data:[{Info:"No data"}]);XLSX.utils.book_append_sheet(wb,ws,name);}
 add("Prize Winners",winners); add("All Participants",participants.map(p=>({Name:p.name,Designation:p.designation,"Place of Posting":p.placeOfPosting,Mobile:p.phone,"Prize Won":p.winnerPrize||"",Violations:p.violationCount||0,Status:p.winner&&p.blocked&&!p.disqualified?"PRIZE WON":p.disqualified?"DISQUALIFIED":p.blocked?"BLOCKED":"ACTIVE"}))); add("Answer Log",allAnswers); add("Question Results",qres); add("Blocked Winners",blockedWinners); add("Disqualified Participants",disqualified);
 const safeDate=String(run.runDate||"result").replace(/[^0-9-]/g,"-");
 XLSX.writeFile(wb,`Quiz_Results_${room}_${safeDate}.xlsx`);
}
$("signupBtn").onclick=()=>{
  $("registrationBox").classList.remove("hidden");
  $("signupBtn").classList.add("hidden");
  $("registrationSubmitBtn").classList.remove("hidden");
  $("registrationBox").scrollIntoView({behavior:"smooth",block:"center"});
  msg("Please complete all Host Registration details first. Your host account and host request will be created only after you submit the completed form.");
};
$("registrationSubmitBtn").onclick=async()=>{try{
  const email=$("email").value.trim().toLowerCase(), password=$("password").value, hostName=$("hostName").value.trim(), designation=$("hostDesignation").value.trim(), placeOfPosting=$("hostPlace").value.trim(), phone=$("hostPhone").value.trim(), purpose=$("hostPurpose").value, purposeDetails=$("hostPurposeDetails").value.trim();
  if(!email||!password||!hostName||!designation||!placeOfPosting||!phone||!purpose||!purposeDetails){msg("Please fill in all required Host registration fields marked with *.");return;}
  if(password.length<6){msg("Password must be at least 6 characters.");return;}
  if(!/^[0-9+()\- ]{7,15}$/.test(phone)){msg("Please enter a valid phone number.");return;}
  $("registrationSubmitBtn").disabled=true;
  await ensureAuthPersistence();
  const cred=await createUserWithEmailAndPassword(auth,email,password);
  const profile={email,hostName,designation,placeOfPosting,phone,purpose,purposeDetails,status:isAdmin(cred.user)?"approved":"pending",requestedAt:serverTimestamp()};
  await set(ref(db,`hosts/${cred.user.uid}`),profile);
  hostProfile={...profile,requestedAt:Date.now()};
  msg(isAdmin(cred.user)?"Administrator account created and activated.":"Host registration submitted. Please wait for Administrator approval.");
}catch(e){msg(e.message||String(e));$("registrationSubmitBtn").disabled=false;}};
$("loginBtn").onclick=async()=>{try{await ensureAuthPersistence();await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);}catch(e){msg(e.message)}};
$("forgotPasswordBtn").onclick=async()=>{try{
  const email=$("email").value.trim().toLowerCase();
  if(!email){msg("Please enter your registered email address in the Email box first.");$("email").focus();return;}
  await sendPasswordResetEmail(auth,email);
  msg("✓ Password reset link has been sent to your registered email address. Please check your Inbox and Spam/Junk folder.","success");
}catch(e){
  const code=e?.code||"";
  if(code==="auth/user-not-found") msg("No Host account was found for this email address.");
  else if(code==="auth/invalid-email") msg("Please enter a valid email address.");
  else msg(e?.message||String(e));
}};
$("logoutBtn").onclick=async()=>{clearHostRegistrationFields();await signOut(auth);};
$("pendingLogoutBtn").onclick=async()=>{clearHostRegistrationFields();await signOut(auth);};
$("openAdminApprovalBtn").onclick=openAdminModal;
$("closeAdminApprovalBtn").onclick=closeAdminModal;
$("backToMainBtn").onclick=closeAdminModal;
$("saveHostProfileBtn").onclick=saveHostProfile;

$("importWordBtn").onclick=importWordQuestions;
$("wordFileInput").addEventListener("change",()=>{const f=$("wordFileInput").files?.[0]; $("wordImportMsg").textContent=f?`Selected: ${f.name}`:"";});
$("deleteRoomBtn").onclick=deleteQuizRoom;$("closeCompetitionBtn").onclick=closeCompetition;$("restartCompetitionBtn").onclick=restartCompetition;$("viewResultBtn").onclick=viewSelectedResult;$("resultRunSelect").onchange=viewSelectedResult;$("createRoomBtn").onclick=createRoom;$("resumeRoomBtn").onclick=resumeRoom;$("updateTimerBtn").onclick=updateQuizTimer;$("saveQBtn").onclick=saveQuestion;$("showBtn").onclick=showQuestion;$("closeBtn").onclick=closeAnswers;$("revealBtn").onclick=()=>revealWinner(false);$("randomTieBtn").onclick=()=>revealWinner(true);$("nextBtn").onclick=nextQuestion;$("prevQBtn").onclick=()=>loadQ(qNo-1);$("nextEditBtn").onclick=()=>loadQ(qNo+1);$("exportBtn").onclick=exportExcel;


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

let authResolvedOnce=false;
onAuthStateChanged(auth,async user=>{
  // Let Firebase restore the persisted session naturally. Never change persistence here.
  // Give the SDK a short grace period before showing the login card on a fresh navigation.
  if(!user && !authResolvedOnce){
    for(let i=0;i<20 && !auth.currentUser;i++){ await new Promise(r=>setTimeout(r,250)); }
    user=auth.currentUser||null;
  }
  authResolvedOnce=true;
  currentUser=user||null; uid=user?.uid||null;
  $("authStatus").textContent=user?(isAdmin(user)?"Administrator signed in":"Signed in"):"Not signed in";
  $("loginCard").classList.toggle("hidden",!!user);
  if(!user){clearHostRegistrationFields();msg("");$("registrationBox").classList.add("hidden");$("signupBtn").classList.remove("hidden");$("registrationSubmitBtn").classList.remove("hidden");$("registrationSubmitBtn").disabled=false;$("hostApp").classList.add("hidden");$("adminLauncher").classList.add("hidden");closeAdminModal();$("hostAccessCard").classList.add("hidden");return;}
  try{
    hostProfile=await ensureHostProfile(user);
    renderAccess();
    if(isAdmin(user)){await loadHostRequests();}
    if(isApproved()){
      await loadExistingRooms();
      const last=localStorage.getItem("liveQuizLastRoom");
      if(last){const s=await get(ref(db,`rooms/${last}`));if(s.exists()&&s.val().hostUid===uid) await openRoom(last);}
    }
  }catch(e){console.error(e);msg(`Access check failed: ${e.message||e}`);}
});
