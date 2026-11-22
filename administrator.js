import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth,onAuthStateChanged,signInWithEmailAndPassword,sendPasswordResetEmail,signOut,setPersistence,browserLocalPersistence,indexedDBLocalPersistence } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase,ref,get,update,set,remove,serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app),$=id=>document.getElementById(id);
const ADMIN_EMAIL="ramkrishnadeinv.01@gmail.com";
let currentUser=null, selectedRoom="";
let hostCache=[], participantCache=[], roomCache=[], publicationCache=[], academicTestCache=[], subscriptionCache=[];
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const isAdmin=u=>String(u?.email||"").toLowerCase()===ADMIN_EMAIL;
async function persist(){try{return await setPersistence(auth,browserLocalPersistence)}catch(e){try{return await setPersistence(auth,indexedDBLocalPersistence)}catch(e2){}}}
function msg(t,cls=""){const x=$("loginMsg");if(x){x.textContent=t;x.className=cls;}}
function fmt(ts){return ts?new Date(Number(ts)).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"})+" IST":"—"}
function admin(){return isAdmin(currentUser)}

function statusBadge(v){const s=String(v||"pending").toLowerCase();const cls=["approved","pending","rejected","revoked","open","closed"].includes(s)?`status-${s}`:"";return `<span class="badge-status ${cls}">${esc(s.toUpperCase())}</span>`;}
function renderHosts(){
 const body=$("hostRequests"), status=$("status");
 const q=String($("hostSearch")?.value||"").toLowerCase().trim(), sf=String($("hostStatusFilter")?.value||"").toLowerCase();
 const arr=hostCache.filter(h=>{const hay=[h.email,h.hostName,h.designation,h.placeOfPosting,h.phone,h.purpose,h.purposeDetails,h.accountType,h.centreName,h.centreAddress].join(" ").toLowerCase();return (!q||hay.includes(q))&&(!sf||String(h.status||"pending").toLowerCase()===sf);});
 $("pendingCount").textContent=hostCache.filter(x=>x.status==="pending").length;
 $("approvedCount").textContent=hostCache.filter(x=>x.status==="approved").length;
 status.textContent=`${hostCache.length} Host account/request record(s) • ${arr.length} shown`;
 if(!arr.length){body.innerHTML='<tr><td colspan="9" class="empty">No Host records match the selected filters.</td></tr>';return;}
 body.innerHTML=arr.map(h=>{let opts='<option value="">Select action</option>';if(h.uid!==currentUser.uid){if(h.status==="pending")opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';else if(h.status==="approved")opts+='<option value="revoked">Revoke</option>';else opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';opts+='<option value="delete">Delete</option>';}const kind=h.accountType==="coaching_centre"?"Coaching Centre":"Individual Host";return `<tr><td>${esc(h.email)}</td><td><b>${esc(h.accountType==="coaching_centre"?(h.centreName||h.hostName):h.hostName)}</b><br><small>${esc(kind)}</small></td><td>${esc(h.designation)}</td><td>${esc(h.accountType==="coaching_centre"?(h.centreAddress||h.placeOfPosting):h.placeOfPosting)}</td><td>${esc(h.phone)}</td><td>${esc(h.purpose)}${h.purposeDetails?`<br><small>${esc(h.purposeDetails)}</small>`:""}</td><td>${statusBadge(h.status)}</td><td>${fmt(h.requestedAt)}</td><td>${h.uid===currentUser.uid?"—":`<select class="action-select" data-uid="${esc(h.uid)}">${opts}</select>`}</td></tr>`}).join("");
 document.querySelectorAll(".action-select").forEach(s=>s.onchange=async()=>{const action=s.value,uid=s.dataset.uid;s.value="";if(!action)return;if(!confirm(`Are you sure you want to ${action.toUpperCase()} this Host?`))return;try{if(action==="delete"){await remove(ref(db,`hosts/${uid}`));await remove(ref(db,`approvedHostsPublic/${uid}`));await remove(ref(db,`subscriptions/${uid}`));}else{await update(ref(db,`hosts/${uid}`),{status:action,reviewedAt:serverTimestamp(),reviewedBy:currentUser.uid});if(action==="approved"){const h=hostCache.find(x=>x.uid===uid)||{};await set(ref(db,`approvedHostsPublic/${uid}`),{hostName:h.hostName||"",email:h.email||"",designation:h.designation||"",placeOfPosting:h.placeOfPosting||"",status:"approved"});}else await remove(ref(db,`approvedHostsPublic/${uid}`));}await loadHosts();}catch(e){alert(e.message||String(e));}});
}
async function loadHosts(){
 if(!admin())return;
 try{const snap=await get(ref(db,"hosts"));const obj=snap.val()||{};hostCache=Object.entries(obj).map(([uid,h])=>({uid,...h})).sort((a,b)=>(Number(b.requestedAt)||0)-(Number(a.requestedAt)||0));for(const h of hostCache){if(h.status==="approved")await set(ref(db,`approvedHostsPublic/${h.uid}`),{hostName:h.hostName||"",email:h.email||"",designation:h.designation||"",placeOfPosting:h.placeOfPosting||"",status:"approved"});else await remove(ref(db,`approvedHostsPublic/${h.uid}`));}renderHosts();}
 catch(e){$("status").textContent=`Unable to load Host requests: ${e.message||e}`;$("hostRequests").innerHTML=`<tr><td colspan="9">Unable to load Host requests.</td></tr>`;}
 renderSubscriptions();
}

function renderParticipants(){
 const body=$("participantRequests"), status=$("participantStatus"); if(!body)return;
 const q=String($("participantSearch")?.value||"").toLowerCase().trim(), sf=String($("participantStatusFilter")?.value||"").toLowerCase();
 const arr=participantCache.filter(p=>{const hay=[p.email,p.name,p.participantName,p.designation,p.placeOfPosting,p.phone,p.mobile].join(" ").toLowerCase();return (!q||hay.includes(q))&&(!sf||String(p.status||"pending").toLowerCase()===sf);});
 const pending=participantCache.filter(p=>String(p.status||"pending").toLowerCase()==="pending").length;
 if(status)status.textContent=`${pending} pending participant request(s) • ${participantCache.length} participant profile(s) • ${arr.length} shown`;
 if(!arr.length){body.innerHTML='<tr><td colspan="8" class="empty">No participant requests match the selected filters.</td></tr>';return;}
 body.innerHTML=arr.map(p=>{const st=String(p.status||"pending").toLowerCase();let opts='<option value="">Select action</option>';if(p.uid!==currentUser.uid){if(st==="pending")opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';else if(st==="approved")opts+='<option value="revoked">Revoke</option>';else opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';opts+='<option value="eraseExamData">🧹 Erase ALL exam data (keep account)</option><option value="delete">Delete profile record</option>';}
 return `<tr><td>${esc(p.email||"")}</td><td><b>${esc(p.name||p.participantName||"")}</b></td><td>${esc(p.designation||"")}</td><td>${esc(p.placeOfPosting||"")}</td><td>${esc(p.phone||p.mobile||"")}</td><td>${statusBadge(st)}</td><td>${fmt(p.requestedAt||p.submittedAt||p.createdAt)}</td><td>${p.uid===currentUser.uid?"—":`<select class="participant-action-select" data-uid="${esc(p.uid)}">${opts}</select>`}</td></tr>`;}).join("");
 document.querySelectorAll(".participant-action-select").forEach(sel=>sel.onchange=async()=>{const action=sel.value,uid=sel.dataset.uid;sel.value="";if(!action)return;
 if(action==="eraseExamData"){const person=participantCache.find(x=>x.uid===uid)||{},phone=String(person.phone||person.mobile||person.mobileNumber||"").replace(/\D/g,"");const label=person.name||person.participantName||person.email||uid;if(!confirm(`PERMANENTLY ERASE EXAM DATA\n\nParticipant: ${label}\n\nThis removes submitted answers/results, Olympiad attempts and allotted-test records for this participant from examination rooms. Login account, password, participant profile and approval status will be preserved.\n\nContinue?`))return;const typed=prompt(`Type ERASE to confirm deletion of exam data for ${label}.`);if(typed!=="ERASE")return;try{await eraseParticipantExamData(uid,phone);alert("Exam data erased successfully. The participant login account, password and profile have been preserved.");await loadParticipants();}catch(e){alert(`Exam-data deletion failed: ${e.message||e}`);}return;}
 if(action==="delete"){if(!confirm("Delete this Participant profile record? The Firebase Authentication account will NOT be deleted."))return;try{await remove(ref(db,`participants/${uid}`));await loadParticipants();}catch(e){alert(`Delete failed: ${e.message||e}`);}return;}const verb=action==="approved"?"approve":action==="rejected"?"reject":"revoke";if(!confirm(`Are you sure you want to ${verb} this Participant?`))return;try{await update(ref(db,`participants/${uid}`),{status:action,reviewedAt:serverTimestamp(),reviewedBy:currentUser.uid});await loadParticipants();}catch(e){alert(`Participant access update failed: ${e.message||e}`);}});
}
async function loadParticipants(){
 if(!admin())return;const body=$("participantRequests"),status=$("participantStatus");if(!body)return;
 try{const snap=await get(ref(db,"participants"));const obj=snap.val()||{};participantCache=Object.entries(obj).map(([uid,p])=>({uid,...(p||{})})).filter(p=>p.emailVerified===true || ["pending","approved","rejected","revoked"].includes(String(p.status||"").toLowerCase())).sort((a,b)=>(Number(b.requestedAt||b.submittedAt||b.createdAt)||0)-(Number(a.requestedAt||a.submittedAt||a.createdAt)||0));renderParticipants();}
 catch(e){if(status)status.textContent=`Unable to load Participant requests: ${e.message||e}`;body.innerHTML=`<tr><td colspan="8">Unable to load Participant requests: ${esc(e.message||e)}</td></tr>`;}
}


// Permanently clear a participant's examination footprint while preserving
// Firebase Authentication credentials and the participants/{uid} profile.
async function eraseParticipantExamData(uid,phone){
 if(!admin())throw new Error("Administrator authorization required.");
 const norm=v=>String(v??"").replace(/\D/g,"");
 const matches=(key,v)=>{
  if(phone&&norm(key)===phone)return true;
  if(!v||typeof v!=="object")return false;
  const ids=[v.uid,v.authUid,v.userId,v.userUid,v.studentUid,v.participantUid,v.phone,v.mobile,v.mobileNumber,v.participantPhone,v.studentPhone];
  return ids.some(x=>String(x??"")===uid || (phone&&norm(x)===phone));
 };
 const snap=await get(ref(db,"rooms"));const rooms=snap.val()||{};
 for(const [roomId,room] of Object.entries(rooms)){
  for(const field of ["mcqAnswers","generalAnswers","participants","violations","mcqLive","answers","runs","archivedRuns","history"]){
   if(room?.[field]){const cleaned=await cleanObject(room[field],uid,phone);if(cleaned.changed)await update(ref(db,`rooms/${roomId}/${field}`),cleaned.value);}
  }
 }
 const attempts=await get(ref(db,"academicOlympiadAttempts"));const all=attempts.val()||{};
 for(const [testId,byUid] of Object.entries(all))if(byUid&&Object.prototype.hasOwnProperty.call(byUid,uid))await remove(ref(db,`academicOlympiadAttempts/${testId}/${uid}`));
 // Delete assignment records one child at a time. The live rules grant
 // administrator write permission at testAssignments/$uid/$assignmentId,
 // not necessarily at the parent testAssignments/$uid node.
 const assignmentSnap=await get(ref(db,`testAssignments/${uid}`));
 const assignmentRecords=assignmentSnap.val()||{};
 for(const assignmentId of Object.keys(assignmentRecords)){
  await remove(ref(db,`testAssignments/${uid}/${assignmentId}`));
 }
}
function cleanObject(node,uid,phone){
 const norm=v=>String(v??"").replace(/\D/g,"");let changed=false;
 const matches=(key,v)=>{if(phone&&norm(key)===phone)return true;if(!v||typeof v!=="object")return false;return [v.uid,v.authUid,v.userId,v.userUid,v.studentUid,v.participantUid,v.phone,v.mobile,v.mobileNumber,v.participantPhone,v.studentPhone].some(x=>String(x??"")===uid||(phone&&norm(x)===phone));};
 const walk=obj=>{if(!obj||typeof obj!=="object")return obj;const out=Array.isArray(obj)?[]:{};for(const [k,v] of Object.entries(obj)){if(matches(k,v)){changed=true;continue;}out[k]=v&&typeof v==="object"?walk(v):v;}return out;};
 const value=walk(node);return {value,changed};
}

function roomType(r){if(r?.examType==="general"||r?.generalQuestions)return "General Question";if(r?.mcqQuestions)return "MCQ";if(r?.questions)return "Live Quiz";return "Unknown";}
function roomTitle(r){return r?.title||r?.mcqTitle||r?.generalTitle||"Untitled Exam"}
function renderRooms(){
 const body=$("roomRows"), q=String($("roomSearch")?.value||"").toLowerCase().trim(), tf=String($("roomTypeFilter")?.value||""), sf=String($("roomStatusFilter")?.value||"").toLowerCase();
 const arr=roomCache.filter(x=>{const r=x.r, type=roomType(r), status=String(r.state||r.examStatus||"").toLowerCase(), hay=[x.code,roomTitle(r),x.host.hostName,x.host.email,r.hostUid,type,status].join(" ").toLowerCase();return (!q||hay.includes(q))&&(!tf||type===tf)&&(!sf||status===sf);});
 $("roomCount").textContent=roomCache.length;
 if(!arr.length){body.innerHTML='<tr><td colspan="8" class="empty">No examination rooms match the selected filters.</td></tr>';return;}
 body.innerHTML=arr.map(x=>{const r=x.r;const qn=Object.keys(r.questions||{}).length,mn=Object.keys(r.mcqQuestions||{}).length,gn=Object.keys(r.generalQuestions||{}).length;return `<tr><td><b>${esc(x.code)}</b></td><td>${esc(roomType(r))}</td><td>${esc(roomTitle(r))}</td><td>${esc(x.host.hostName||r.hostUid||"—")}<br><small>${esc(x.host.email||"")}</small></td><td>${statusBadge(String(r.state||r.examStatus||"—"))}</td><td>${qn+mn+gn}</td><td>${fmt(r.createdAt)}</td><td><button class="secondary roomManage" data-room="${esc(x.code)}">Manage</button> <button class="danger roomDelete" data-room="${esc(x.code)}">🗑 Delete Room</button></td></tr>`}).join("");
 $("roomSelect").innerHTML='<option value="">Select a room</option>'+roomCache.map(x=>`<option value="${esc(x.code)}">${esc(x.code)} — ${esc(roomTitle(x.r))} — ${esc(roomType(x.r))}</option>`).join("");
 document.querySelectorAll(".roomManage").forEach(b=>b.onclick=()=>{$("roomSelect").value=b.dataset.room;manageRoom();});
 document.querySelectorAll(".roomDelete").forEach(b=>b.onclick=()=>deleteRoom(b.dataset.room));
}
async function loadRooms(){
 if(!admin())return;const body=$("roomRows");
 try{const snap=await get(ref(db,"rooms"));const obj=snap.val()||{};const hostSnap=await get(ref(db,"hosts"));const hosts=hostSnap.val()||{};roomCache=Object.entries(obj).map(([code,r])=>({code,r:r||{},host:hosts[r?.hostUid]||{}})).sort((a,b)=>(Number(b.r?.createdAt)||0)-(Number(a.r?.createdAt)||0));renderRooms();}
 catch(e){body.innerHTML=`<tr><td colspan="8">Unable to load rooms: ${esc(e.message)}</td></tr>`;}
}

async function manageRoom(){
 const code=$("roomSelect")?.value;if(!code)return alert("Select an examination room first.");selectedRoom=code;
 const snap=await get(ref(db,`rooms/${code}`));if(!snap.exists())return alert("Room not found.");const r=snap.val()||{};
 $("selectedRoomTitle").textContent=`${code} — ${roomTitle(r)} (${roomType(r)})`;
 const hostSnap=await get(ref(db,`hosts/${r.hostUid||""}`));const h=hostSnap.val()||{};
 $("selectedRoomMeta").textContent=`Host: ${h.hostName||r.hostUid||"Unknown"} | Email: ${h.email||"—"} | Status: ${r.state||r.examStatus||"—"}`;
 const groups=[ ["Live Quiz Questions","questions",r.questions||{}],["MCQ Questions","mcqQuestions",r.mcqQuestions||{}],["General Questions","generalQuestions",r.generalQuestions||{}] ];
 let rows="";
 for(const [label,path,obj] of groups){for(const [key,q] of Object.entries(obj).sort((a,b)=>Number((a[0].match(/\d+/)||[0])[0])-Number((b[0].match(/\d+/)||[0])[0]))){const text=q?.text||q?.question||"";rows+=`<tr><td>${esc(label)}</td><td>${esc(key)}</td><td>${esc(text)}</td><td>${esc(q?.correct||"")}</td><td><button class="danger questionDelete" data-path="${esc(path)}" data-key="${esc(key)}">🗑 Delete</button></td></tr>`;}}
 $("questionRows").innerHTML=rows||'<tr><td colspan="5">No questions found in this room.</td></tr>';
 document.querySelectorAll(".questionDelete").forEach(b=>b.onclick=()=>deleteQuestion(code,b.dataset.path,b.dataset.key));
 await loadRoomHistory(r);
 $("roomManager").classList.remove("hidden");
}

async function loadRoomHistory(r){
 const box=$("historyRows");let rows="";
 for(const [label,path,obj] of [["Live Quiz Run","runs",r.runs||{}],["MCQ Run","mcqHistory",r.mcqHistory||{}]]){
  for(const [id,v] of Object.entries(obj)){rows+=`<tr><td>${esc(label)}</td><td>${esc(id)}</td><td>${fmt(v?.archivedAt||v?.startedAt)}</td><td><button class="danger historyDelete" data-path="${esc(path)}" data-id="${esc(id)}">🗑 Delete Result/History</button></td></tr>`;}
 }
 box.innerHTML=rows||'<tr><td colspan="4">No archived result/history records found.</td></tr>';
 document.querySelectorAll(".historyDelete").forEach(b=>b.onclick=()=>deleteHistory(selectedRoom,b.dataset.path,b.dataset.id));
}

async function deleteQuestion(code,path,key){
 if(!admin())return;const ok=confirm(`DELETE QUESTION\n\nRoom: ${code}\nQuestion: ${key}\nType: ${path}\n\nThis cannot be undone and may affect an exam that has already started. Continue?`);if(!ok)return;
 try{await remove(ref(db,`rooms/${code}/${path}/${key}`));alert(`Question ${key} deleted from room ${code}.`);await manageRoom();await loadRooms();}catch(e){alert(`Delete failed: ${e.message||e}`);}
}
async function deleteHistory(code,path,id){
 if(!admin())return;const ok=confirm(`DELETE ARCHIVED RESULT/HISTORY\n\nRoom: ${code}\nRecord: ${id}\n\nThis permanently removes this archived result/history record. Continue?`);if(!ok)return;
 try{await remove(ref(db,`rooms/${code}/${path}/${id}`));await manageRoom();}catch(e){alert(`Delete failed: ${e.message||e}`);}
}
async function deleteRoom(code){
 if(!admin())return;const s=await get(ref(db,`rooms/${code}`));if(!s.exists())return alert("Room not found.");const r=s.val()||{};const ok=confirm(`DELETE ENTIRE EXAM ROOM\n\nRoom: ${code}\nExam: ${roomTitle(r)}\nType: ${roomType(r)}\n\nThis will permanently delete the room, questions, participants, answers, violations, results and history stored under this room.\n\nTHIS CANNOT BE UNDONE. Continue?`);if(!ok)return;const ok2=confirm(`FINAL CONFIRMATION\n\nDelete room ${code} permanently?`);if(!ok2)return;try{await remove(ref(db,`rooms/${code}`));if(selectedRoom===code){selectedRoom="";$("roomManager").classList.add("hidden");}await loadRooms();alert(`Room ${code} was permanently deleted.`);}catch(e){alert(`Delete failed: ${e.message||e}`);}}

function renderPublications(){
 const body=$("publicationRows"), q=String($("publicationSearch")?.value||"").toLowerCase().trim();
 const arr=publicationCache.filter(x=>!q||[x.publicationId,x.examName,x.examDate].join(" ").toLowerCase().includes(q));
 $("publicationCount").textContent=publicationCache.length;
 if(!arr.length){body.innerHTML='<tr><td colspan="6" class="empty">No result publication matches the search.</td></tr>';return;}
 body.innerHTML=arr.map(x=>`<tr><td><b>${esc(x.publicationId)}</b></td><td>${esc(x.examName)}</td><td>${esc(x.examDate)}</td><td>${esc(x.recordCount||0)}</td><td>${fmt(x.publishedAt)}</td><td><button class="danger publicationDelete" data-id="${esc(x.publicationId)}">🗑 Delete Result Set</button></td></tr>`).join("");
 document.querySelectorAll(".publicationDelete").forEach(b=>b.onclick=()=>deletePublication(b.dataset.id));
}
async function loadOtherPublications(){
 if(!admin())return;try{const snap=await get(ref(db,"otherExamPublications"));const vals=snap.val()||{};publicationCache=Object.values(vals).sort((a,b)=>(Number(b.publishedAt)||0)-(Number(a.publishedAt)||0));renderPublications();}
 catch(e){$("publicationRows").innerHTML=`<tr><td colspan="6">Unable to load publications: ${esc(e.message)}</td></tr>`;}
}

async function deletePublication(pub){
 if(!admin())return;const snap=await get(ref(db,`otherExamPublications/${pub}`));if(!snap.exists())return alert("Publication not found.");const meta=snap.val()||{};const ok=confirm(`DELETE OTHER EXAM RESULT\n\nPublication: ${pub}\nExam: ${meta.examName||""}\nRecords: ${meta.recordCount||0}\n\nAll candidate results belonging to this publication will be deleted. This cannot be undone. Continue?`);if(!ok)return;
 try{for(const [rid,m] of Object.entries(meta.resultIndex||{})){if(m?.phoneHash)await remove(ref(db,`otherExamResults/${m.phoneHash}/${rid}`));}await remove(ref(db,`otherExamPublications/${pub}`));await loadOtherPublications();}catch(e){alert(`Delete failed: ${e.message||e}`);}}


function renderAcademicTests(){
 const body=$("academicTestRows");if(!body)return;
 const q=String($("academicTestSearch")?.value||"").toLowerCase().trim();
 const cat=String($("academicTestCategory")?.value||"");
 const st=String($("academicTestStatus")?.value||"");
 const arr=academicTestCache.filter(x=>(!cat||(x.examCategory||"olympiad")===cat)&&(!st||String(x.status||"DRAFT").toUpperCase()===st)&&(!q||[x.title,x.roomCode,x.className,x.subject,x.hostUid,x.createdBy].join(" ").toLowerCase().includes(q)));
 $("academicTestStatusText").textContent=`${academicTestCache.length} test(s) across all Hosts • ${arr.length} shown`;
 if(!arr.length){body.innerHTML='<tr><td colspan="9" class="empty">No Academic or Olympiad tests match these filters.</td></tr>';return;}
 body.innerHTML=arr.map(x=>{const cat=(x.examCategory||"olympiad"),mode=cat==="academic"?"academic":"olympiad",active=x.active!==false;return `<tr><td><b>${cat==="academic"?"Academic":"Olympiad"}</b></td><td><b>${esc(x.title||"Untitled test")}</b><br><small>${esc(x.roomCode||x.id)}</small></td><td>${esc(x.className||"—")}</td><td>${esc(x.subject||"—")}</td><td><small>${esc(x.hostUid||x.createdBy||"—")}</small></td><td>${Number(x.questionsCount||x.questions?.length||0)}</td><td>${esc(x.status||"DRAFT")}</td><td>${active?"Published / enabled":"Unpublished / disabled"}</td><td><div class="toolbar"><button class="secondary academicManage" data-id="${esc(x.id)}" data-mode="${mode}">Manage / Edit</button><button class="secondary academicToggle" data-id="${esc(x.id)}" data-active="${active?"1":"0"}">${active?"Unpublish":"Publish"}</button><button class="secondary academicClose" data-id="${esc(x.id)}">Close Test</button><button class="danger academicDelete" data-id="${esc(x.id)}">Delete</button></div></td></tr>`}).join("");
 document.querySelectorAll(".academicManage").forEach(b=>b.onclick=()=>location.href=`academic-host.html?id=${encodeURIComponent(b.dataset.id)}&mode=${b.dataset.mode}`);
 document.querySelectorAll(".academicToggle").forEach(b=>b.onclick=()=>toggleAcademicTest(b.dataset.id,b.dataset.active==="1"));
 document.querySelectorAll(".academicClose").forEach(b=>b.onclick=()=>closeAcademicTest(b.dataset.id));
 document.querySelectorAll(".academicDelete").forEach(b=>b.onclick=()=>deleteAcademicTest(b.dataset.id));
}
async function loadAcademicTests(){
 if(!admin())return;
 const body=$("academicTestRows");if(body)body.innerHTML='<tr><td colspan="9">Loading…</td></tr>';
 try{const snap=await get(ref(db,"academicOlympiadTests"));const data=snap.val()||{};academicTestCache=Object.entries(data).filter(([,x])=>x&&x.roomCode).map(([id,x])=>({id,...x})).sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0));renderAcademicTests();}
 catch(e){if(body)body.innerHTML=`<tr><td colspan="9">Unable to load tests: ${esc(e.message||e)}</td></tr>`;}
}
async function toggleAcademicTest(id,currentlyActive){
 if(!admin())return;const action=currentlyActive?"unpublish":"publish";
 if(!confirm(`${action.toUpperCase()} this test? ${currentlyActive?"It will no longer appear in the public catalogue.":"It will be enabled again if its access mode is public."}`))return;
 try{await update(ref(db,`academicOlympiadTests/${id}`),{active:!currentlyActive});await loadAcademicTests();}
 catch(e){alert(`Unable to ${action} test: ${e.message||e}`);}
}
async function closeAcademicTest(id){
 if(!admin())return;if(!confirm("Close this test now? Participants will not be able to start or continue it."))return;
 try{await update(ref(db,`academicOlympiadTests/${id}`),{status:"CLOSED",closedAt:Date.now()});await loadAcademicTests();}
 catch(e){alert(`Unable to close test: ${e.message||e}`);}
}
async function deleteAcademicTest(id){
 if(!admin())return;const x=academicTestCache.find(v=>v.id===id);if(!x)return;
 if(!confirm(`PERMANENTLY DELETE TEST\n\n${x.title||"Untitled"}\nRoom: ${x.roomCode||id}\nClass: ${x.className||"—"} • ${x.subject||"—"}\n\nThis also deletes every attempt/result stored for this test. This cannot be undone. Continue?`))return;
 if(!confirm("FINAL CONFIRMATION: permanently delete this test and all its attempts?"))return;
 try{await remove(ref(db,`academicOlympiadTests/${id}`));await remove(ref(db,`academicOlympiadAttempts/${id}`));await loadAcademicTests();alert("Test and its attempts were deleted.");}
 catch(e){alert(`Delete failed: ${e.message||e}`);}
}

function subscriptionDate(ts){if(!ts)return "—";const d=new Date(ts);return Number.isNaN(d.getTime())?String(ts):d.toLocaleDateString("en-IN");}
function renderSubscriptions(){
 const body=$("subscriptionRows");if(!body)return;
 const activeHosts=hostCache.filter(h=>h.status==="approved" && h.accountType!=="coaching_centre");
 const select=$("subscriptionAccountSelect");if(select){const old=select.value;select.innerHTML='<option value="">Select an approved Host / Coaching Centre</option>'+activeHosts.map(h=>`<option value="${esc(h.uid)}">${esc(h.accountType==="coaching_centre"?(h.centreName||h.hostName):h.hostName)} — ${esc(h.email)}</option>`).join("");if(activeHosts.some(h=>h.uid===old))select.value=old;}
 const rows=activeHosts.map(h=>({host:h,sub:subscriptionCache.find(x=>x.uid===h.uid)?.data||{}}));
 $("subscriptionStatusText").textContent=`${rows.length} approved account(s) • ${rows.filter(x=>x.sub.status==="active"||x.sub.status==="trial").length} active/trial subscription(s)`;
 if(!rows.length){body.innerHTML='<tr><td colspan="7" class="empty">No approved Host or Coaching Centre accounts yet.</td></tr>';return;}
 body.innerHTML=rows.map(({host,sub})=>`<tr><td><b>${esc(host.accountType==="coaching_centre"?(host.centreName||host.hostName):host.hostName)}</b><br><small>${esc(host.email)}</small></td><td>${host.accountType==="coaching_centre"?"Coaching Centre":"Individual Host"}</td><td>${esc(sub.plan||"Not assigned")}</td><td>${statusBadge(sub.status||"not_set")}</td><td>${subscriptionDate(sub.startDate)}</td><td>${subscriptionDate(sub.endDate)}</td><td><button class="secondary subscriptionEdit" data-uid="${esc(host.uid)}">Edit</button></td></tr>`).join("");
 document.querySelectorAll(".subscriptionEdit").forEach(b=>b.onclick=()=>{const h=hostCache.find(x=>x.uid===b.dataset.uid),sub=subscriptionCache.find(x=>x.uid===b.dataset.uid)?.data||{};$("subscriptionAccountSelect").value=b.dataset.uid;$("subscriptionPlan").value=sub.plan||((h?.accountType==="coaching_centre")?"coaching_basic":"free");$("subscriptionStatus").value=sub.status||"active";$("subscriptionStartDate").value=sub.startDate||"";$("subscriptionEndDate").value=sub.endDate||"";$("subscriptionAccountSelect").scrollIntoView({behavior:"smooth",block:"center"});});
}
async function loadSubscriptions(){if(!admin())return;try{const snap=await get(ref(db,"subscriptions"));const obj=snap.val()||{};subscriptionCache=Object.entries(obj).map(([uid,data])=>({uid,data:data||{}}));renderSubscriptions();renderCentreSubscriptions();}catch(e){$("subscriptionStatusText").textContent=`Unable to load subscription records: ${e.message||e}`;}}
async function saveSubscription(){if(!admin())return;const uid=$("subscriptionAccountSelect").value;if(!uid)return alert("Select an approved account first.");const host=hostCache.find(h=>h.uid===uid);if(!host||host.status!=="approved"||host.accountType==="coaching_centre")return alert("Select an approved Individual Host. Coaching Centre subscriptions are managed in the separate section.");const startDate=$("subscriptionStartDate").value,endDate=$("subscriptionEndDate").value;if(startDate&&endDate&&endDate<startDate)return alert("End date cannot be earlier than start date.");const plan=$("subscriptionPlan").value,status=$("subscriptionStatus").value;try{await set(ref(db,`subscriptions/${uid}`),{uid,accountType:host.accountType||"individual",plan,status,startDate,endDate,updatedAt:Date.now(),updatedBy:currentUser.uid,paymentEnabled:false});await loadSubscriptions();alert("Subscription record saved. No payment has been collected.");}catch(e){alert(`Unable to save subscription: ${e.message||e}`);}}


let coachingCentreCache=[];
async function loadCoachingCentres(){
 if(!admin())return;
 const body=$("coachingCentreRows"),status=$("coachingCentreStatus");if(!body)return;
 try{
  const snap=await get(ref(db,"coachingCentres"));const obj=snap.val()||{};
  coachingCentreCache=Object.entries(obj).map(([uid,p])=>({uid,...(p||{})})).sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0));
  status.textContent=`${coachingCentreCache.length} separate Coaching Centre application(s)`;renderCentreSubscriptions();
  if(!coachingCentreCache.length){body.innerHTML='<tr><td colspan="9">No Coaching Centre applications yet.</td></tr>';return;}
  body.innerHTML=coachingCentreCache.map(c=>{const st=String(c.status||"pending").toLowerCase();let opts='<option value="">Select action</option>';if(st==="pending")opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';else if(st==="approved")opts+='<option value="revoked">Revoke</option>';else opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';opts+='<option value="delete">Delete profile</option>';return `<tr><td><b>${esc(c.centreName)}</b></td><td>${esc(c.ownerName)}</td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td><td>${esc(c.address)}</td><td>${esc(c.centreCode)}</td><td>${statusBadge(st)}</td><td>${fmt(c.requestedAt||c.createdAt)}</td><td><select class="centre-action" data-uid="${esc(c.uid)}">${opts}</select></td></tr>`;}).join("");
  document.querySelectorAll(".centre-action").forEach(sel=>sel.onchange=async()=>{const action=sel.value,uid=sel.dataset.uid;sel.value="";if(!action)return;if(!confirm(`${action.toUpperCase()} this Coaching Centre application?`))return;try{if(action==="delete")await remove(ref(db,`coachingCentres/${uid}`));else await update(ref(db,`coachingCentres/${uid}`),{status:action,reviewedAt:Date.now(),reviewedBy:currentUser.uid});await loadCoachingCentres();}catch(e){alert(e.message||String(e));}});
 }catch(e){status.textContent=`Unable to load Coaching Centre applications: ${e.message||e}`;body.innerHTML=`<tr><td colspan="9">Unable to load applications.</td></tr>`;}
}


function centrePlanLimit(plan){
 const limits={free:null,premium_25:25,premium_50:50,premium_100:100,premium_250:250};
 return Object.prototype.hasOwnProperty.call(limits,plan)?limits[plan]:undefined;
}
function renderCentreSubscriptions(){
 const select=$("centreSubscriptionSelect"),body=$("centreSubscriptionRows");if(!body)return;
 const approved=coachingCentreCache.filter(c=>String(c.status||"").toLowerCase()==="approved");
 if(select){const old=select.value;select.innerHTML='<option value="">Select an approved Coaching Centre</option>'+approved.map(c=>`<option value="${esc(c.uid)}">${esc(c.centreName||"Coaching Centre")} — ${esc(c.email||"")}</option>`).join("");if(approved.some(c=>c.uid===old))select.value=old;}
 const rows=approved.map(centre=>({centre,sub:subscriptionCache.find(x=>x.uid===centre.uid)?.data||{}}));
 $("centreSubscriptionStatusText").textContent=`${approved.length} approved Coaching Centre(s) • ${rows.filter(x=>["active","trial"].includes(String(x.sub.status||"").toLowerCase())).length} active/trial centre subscription(s)`;
 if(!rows.length){body.innerHTML='<tr><td colspan="7" class="empty">No approved Coaching Centres available for subscription assignment.</td></tr>';return;}
 body.innerHTML=rows.map(({centre,sub})=>`<tr><td><b>${esc(centre.centreName||"Coaching Centre")}</b><br><small>${esc(centre.email||"")}</small></td><td>${esc(sub.planLabel||sub.plan||"Not assigned")}</td><td>${sub.studentLimit===null?"No student limit":(sub.studentLimit!==undefined?esc(sub.studentLimit):"—")}</td><td>${statusBadge(sub.status||"not_set")}</td><td>${subscriptionDate(sub.startDate)}</td><td>${subscriptionDate(sub.endDate)}</td><td><button class="secondary centreSubscriptionEdit" data-uid="${esc(centre.uid)}">Edit</button></td></tr>`).join("");
 document.querySelectorAll(".centreSubscriptionEdit").forEach(btn=>btn.onclick=()=>{
  const sub=subscriptionCache.find(x=>x.uid===btn.dataset.uid)?.data||{};
  $("centreSubscriptionSelect").value=btn.dataset.uid;$("centreSubscriptionPlan").value=sub.plan||"free";
  $("centreStudentLimit").value=sub.studentLimit==null?"":sub.studentLimit;$("centreSubscriptionStatus").value=sub.status||"active";
  $("centreSubscriptionStartDate").value=sub.startDate||"";$("centreSubscriptionEndDate").value=sub.endDate||"";
  $("centreSubscriptionSelect").scrollIntoView({behavior:"smooth",block:"center"});
 });
}
async function saveCentreSubscription(){
 if(!admin())return;const uid=$("centreSubscriptionSelect").value;if(!uid)return alert("Select an approved Coaching Centre first.");
 const centre=coachingCentreCache.find(c=>c.uid===uid);if(!centre||String(centre.status||"").toLowerCase()!=="approved")return alert("Only approved Coaching Centres can receive a subscription.");
 const plan=$("centreSubscriptionPlan").value,entered=String($("centreStudentLimit").value||"").trim();let studentLimit=centrePlanLimit(plan);
 if(plan==="premium_custom"){studentLimit=Number(entered);if(!Number.isInteger(studentLimit)||studentLimit<1||studentLimit>100000)return alert("Enter a custom student limit between 1 and 100000.");}
 else if(studentLimit===undefined)return alert("Select a valid Coaching Centre plan.");
 else if(plan==="free"&&entered){studentLimit=Number(entered);if(!Number.isInteger(studentLimit)||studentLimit<1||studentLimit>100000)return alert("Enter a valid positive student limit, or leave it blank for no limit.");}
 const startDate=$("centreSubscriptionStartDate").value,endDate=$("centreSubscriptionEndDate").value;if(startDate&&endDate&&endDate<startDate)return alert("End date cannot be earlier than start date.");
 const status=$("centreSubscriptionStatus").value,labels={free:"Free Access",premium_25:"Premium – up to 25 students",premium_50:"Premium – up to 50 students",premium_100:"Premium – up to 100 students",premium_250:"Premium – up to 250 students",premium_custom:`Premium – ${studentLimit} students`};
 try{await set(ref(db,`subscriptions/${uid}`),{uid,accountType:"coaching_centre",centreName:centre.centreName||"",centreCode:centre.centreCode||"",plan,planLabel:labels[plan]||plan,studentLimit,status,startDate,endDate,updatedAt:Date.now(),updatedBy:currentUser.uid,paymentEnabled:false});await loadSubscriptions();renderCentreSubscriptions();alert("Coaching Centre subscription saved. No payment has been collected.");}
 catch(e){alert(`Unable to save Coaching Centre subscription: ${e.message||e}`);}
}

function render(u){currentUser=u||null;$("authStatus").textContent=u?(isAdmin(u)?"Administrator signed in":"Not authorized"):"Not signed in";$("adminLoginCard").classList.toggle("hidden",!!u&&isAdmin(u));$("adminApp").classList.toggle("hidden",!(u&&isAdmin(u)));if(u&&isAdmin(u)){loadHosts();loadParticipants();loadRooms();loadOtherPublications();loadAcademicTests();loadSubscriptions();loadCoachingCentres();}}
$("loginBtn").onclick=async()=>{try{await persist();const email=$("email").value.trim().toLowerCase();if(email!==ADMIN_EMAIL){msg("This page is restricted to the Administrator account.");return;}if(auth.currentUser&&!isAdmin(auth.currentUser)){await signOut(auth);await new Promise(r=>setTimeout(r,200));}await signInWithEmailAndPassword(auth,email,$("password").value);}catch(e){msg(e.message||String(e));}};
$("forgotBtn").onclick=async()=>{try{const email=$("email").value.trim().toLowerCase();if(email!==ADMIN_EMAIL){msg("Enter the Administrator email address first.");return;}await sendPasswordResetEmail(auth,email);msg("Password reset link sent. Check Inbox and Spam/Junk folder.");}catch(e){msg(e.message||String(e));}};
$("refreshBtn").onclick=()=>{loadHosts();loadParticipants();loadRooms();loadOtherPublications();loadAcademicTests();loadSubscriptions();loadCoachingCentres();};$("openWebsiteAnalyticsAdminBtn")?.addEventListener("click",()=>location.href="website-analytics.html");$("logoutBtn").onclick=()=>signOut(auth);$("backBtn").onclick=$("backBtn2").onclick=()=>location.href="host.html";$("manageRoomBtn").onclick=manageRoom;$("closeRoomManager").onclick=()=>$("roomManager").classList.add("hidden");
["hostSearch","hostStatusFilter"].forEach(id=>$(id)?.addEventListener("input",renderHosts));
["roomSearch","roomTypeFilter","roomStatusFilter"].forEach(id=>$(id)?.addEventListener("input",renderRooms));
$("publicationSearch")?.addEventListener("input",renderPublications);
$("refreshHostsBtn")?.addEventListener("click",loadHosts);$("refreshParticipantsBtn")?.addEventListener("click",loadParticipants);
["participantSearch","participantStatusFilter"].forEach(id=>$(id)?.addEventListener("input",renderParticipants));
$("deleteAllResultsHint")?.addEventListener("click",()=>alert("Permanent deletion is performed publication-by-publication using the Delete Result Set button."));
onAuthStateChanged(auth,u=>{if(u&&!isAdmin(u)){currentUser=null;$("authStatus").textContent="Not authorized";$("adminLoginCard").classList.remove("hidden");$("adminApp").classList.add("hidden");return;}render(u);});

$("refreshAcademicTestsBtn")?.addEventListener("click",loadAcademicTests);["academicTestSearch","academicTestCategory","academicTestStatus"].forEach(id=>$(id)?.addEventListener("input",renderAcademicTests));

$("refreshCoachingCentresBtn")?.addEventListener("click",loadCoachingCentres);$("refreshSubscriptionsBtn")?.addEventListener("click",()=>{loadHosts().then(loadSubscriptions);});$("saveSubscriptionBtn")?.addEventListener("click",saveSubscription);
$("refreshCentreSubscriptionsBtn")?.addEventListener("click",()=>{loadCoachingCentres().then(loadSubscriptions);});$("saveCentreSubscriptionBtn")?.addEventListener("click",saveCentreSubscription);$("centreSubscriptionPlan")?.addEventListener("change",()=>{const p=$("centreSubscriptionPlan").value,limit=centrePlanLimit(p);$("centreStudentLimit").value=limit===undefined||limit===null?"":limit;});
