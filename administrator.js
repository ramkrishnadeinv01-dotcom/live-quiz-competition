import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth,onAuthStateChanged,signInWithEmailAndPassword,sendPasswordResetEmail,signOut,setPersistence,browserLocalPersistence,indexedDBLocalPersistence } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase,ref,get,update,remove,serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app),$=id=>document.getElementById(id);
const ADMIN_EMAIL="ramkrishnadeinv.01@gmail.com";
let currentUser=null, selectedRoom="";
let hostCache=[], participantCache=[], roomCache=[], publicationCache=[];
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
 const arr=hostCache.filter(h=>{const hay=[h.email,h.hostName,h.designation,h.placeOfPosting,h.phone,h.purpose,h.purposeDetails].join(" ").toLowerCase();return (!q||hay.includes(q))&&(!sf||String(h.status||"pending").toLowerCase()===sf);});
 $("pendingCount").textContent=hostCache.filter(x=>x.status==="pending").length;
 $("approvedCount").textContent=hostCache.filter(x=>x.status==="approved").length;
 status.textContent=`${hostCache.length} Host account/request record(s) • ${arr.length} shown`;
 if(!arr.length){body.innerHTML='<tr><td colspan="9" class="empty">No Host records match the selected filters.</td></tr>';return;}
 body.innerHTML=arr.map(h=>{let opts='<option value="">Select action</option>';if(h.uid!==currentUser.uid){if(h.status==="pending")opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';else if(h.status==="approved")opts+='<option value="revoked">Revoke</option>';else opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';opts+='<option value="delete">Delete</option>';}return `<tr><td>${esc(h.email)}</td><td><b>${esc(h.hostName)}</b></td><td>${esc(h.designation)}</td><td>${esc(h.placeOfPosting)}</td><td>${esc(h.phone)}</td><td>${esc(h.purpose)}${h.purposeDetails?`<br><small>${esc(h.purposeDetails)}</small>`:""}</td><td>${statusBadge(h.status)}</td><td>${fmt(h.requestedAt)}</td><td>${h.uid===currentUser.uid?"—":`<select class="action-select" data-uid="${esc(h.uid)}">${opts}</select>`}</td></tr>`}).join("");
 document.querySelectorAll(".action-select").forEach(s=>s.onchange=async()=>{const action=s.value,uid=s.dataset.uid;s.value="";if(!action)return;if(!confirm(`Are you sure you want to ${action.toUpperCase()} this Host?`))return;try{if(action==="delete")await remove(ref(db,`hosts/${uid}`));else await update(ref(db,`hosts/${uid}`),{status:action,reviewedAt:serverTimestamp(),reviewedBy:currentUser.uid});await loadHosts();}catch(e){alert(e.message||String(e));}});
}
async function loadHosts(){
 if(!admin())return;
 try{const snap=await get(ref(db,"hosts"));const obj=snap.val()||{};hostCache=Object.entries(obj).map(([uid,h])=>({uid,...h})).sort((a,b)=>(Number(b.requestedAt)||0)-(Number(a.requestedAt)||0));renderHosts();}
 catch(e){$("status").textContent=`Unable to load Host requests: ${e.message||e}`;$("hostRequests").innerHTML=`<tr><td colspan="9">Unable to load Host requests.</td></tr>`;}
}

function renderParticipants(){
 const body=$("participantRequests"), status=$("participantStatus"); if(!body)return;
 const q=String($("participantSearch")?.value||"").toLowerCase().trim(), sf=String($("participantStatusFilter")?.value||"").toLowerCase();
 const arr=participantCache.filter(p=>{const hay=[p.email,p.name,p.participantName,p.designation,p.placeOfPosting,p.phone,p.mobile].join(" ").toLowerCase();return (!q||hay.includes(q))&&(!sf||String(p.status||"pending").toLowerCase()===sf);});
 const pending=participantCache.filter(p=>String(p.status||"pending").toLowerCase()==="pending").length;
 if(status)status.textContent=`${pending} pending participant request(s) • ${participantCache.length} participant profile(s) • ${arr.length} shown`;
 if(!arr.length){body.innerHTML='<tr><td colspan="8" class="empty">No participant requests match the selected filters.</td></tr>';return;}
 body.innerHTML=arr.map(p=>{const st=String(p.status||"pending").toLowerCase();let opts='<option value="">Select action</option>';if(p.uid!==currentUser.uid){if(st==="pending")opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';else if(st==="approved")opts+='<option value="revoked">Revoke</option>';else opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';opts+='<option value="delete">Delete profile record</option>';}
 return `<tr><td>${esc(p.email||"")}</td><td><b>${esc(p.name||p.participantName||"")}</b></td><td>${esc(p.designation||"")}</td><td>${esc(p.placeOfPosting||"")}</td><td>${esc(p.phone||p.mobile||"")}</td><td>${statusBadge(st)}</td><td>${fmt(p.requestedAt||p.submittedAt||p.createdAt)}</td><td>${p.uid===currentUser.uid?"—":`<select class="participant-action-select" data-uid="${esc(p.uid)}">${opts}</select>`}</td></tr>`;}).join("");
 document.querySelectorAll(".participant-action-select").forEach(sel=>sel.onchange=async()=>{const action=sel.value,uid=sel.dataset.uid;sel.value="";if(!action)return;if(action==="delete"){if(!confirm("Delete this Participant profile record? The Firebase Authentication account will NOT be deleted."))return;try{await remove(ref(db,`participants/${uid}`));await loadParticipants();}catch(e){alert(`Delete failed: ${e.message||e}`);}return;}const verb=action==="approved"?"approve":action==="rejected"?"reject":"revoke";if(!confirm(`Are you sure you want to ${verb} this Participant?`))return;try{await update(ref(db,`participants/${uid}`),{status:action,reviewedAt:serverTimestamp(),reviewedBy:currentUser.uid});await loadParticipants();}catch(e){alert(`Participant access update failed: ${e.message||e}`);}});
}
async function loadParticipants(){
 if(!admin())return;const body=$("participantRequests"),status=$("participantStatus");if(!body)return;
 try{const snap=await get(ref(db,"participants"));const obj=snap.val()||{};participantCache=Object.entries(obj).map(([uid,p])=>({uid,...(p||{})})).filter(p=>p.emailVerified===true || ["pending","approved","rejected","revoked"].includes(String(p.status||"").toLowerCase())).sort((a,b)=>(Number(b.requestedAt||b.submittedAt||b.createdAt)||0)-(Number(a.requestedAt||a.submittedAt||a.createdAt)||0));renderParticipants();}
 catch(e){if(status)status.textContent=`Unable to load Participant requests: ${e.message||e}`;body.innerHTML=`<tr><td colspan="8">Unable to load Participant requests: ${esc(e.message||e)}</td></tr>`;}
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

function render(u){currentUser=u||null;$("authStatus").textContent=u?(isAdmin(u)?"Administrator signed in":"Not authorized"):"Not signed in";$("adminLoginCard").classList.toggle("hidden",!!u&&isAdmin(u));$("adminApp").classList.toggle("hidden",!(u&&isAdmin(u)));if(u&&isAdmin(u)){loadHosts();loadParticipants();loadRooms();loadOtherPublications();}}
$("loginBtn").onclick=async()=>{try{await persist();const email=$("email").value.trim().toLowerCase();if(email!==ADMIN_EMAIL){msg("This page is restricted to the Administrator account.");return;}if(auth.currentUser&&!isAdmin(auth.currentUser)){await signOut(auth);await new Promise(r=>setTimeout(r,200));}await signInWithEmailAndPassword(auth,email,$("password").value);}catch(e){msg(e.message||String(e));}};
$("forgotBtn").onclick=async()=>{try{const email=$("email").value.trim().toLowerCase();if(email!==ADMIN_EMAIL){msg("Enter the Administrator email address first.");return;}await sendPasswordResetEmail(auth,email);msg("Password reset link sent. Check Inbox and Spam/Junk folder.");}catch(e){msg(e.message||String(e));}};
$("refreshBtn").onclick=()=>{loadHosts();loadParticipants();loadRooms();loadOtherPublications();};$("logoutBtn").onclick=()=>signOut(auth);$("backBtn").onclick=$("backBtn2").onclick=()=>location.href="host.html";$("manageRoomBtn").onclick=manageRoom;$("closeRoomManager").onclick=()=>$("roomManager").classList.add("hidden");
["hostSearch","hostStatusFilter"].forEach(id=>$(id)?.addEventListener("input",renderHosts));
["roomSearch","roomTypeFilter","roomStatusFilter"].forEach(id=>$(id)?.addEventListener("input",renderRooms));
$("publicationSearch")?.addEventListener("input",renderPublications);
$("refreshHostsBtn")?.addEventListener("click",loadHosts);$("refreshParticipantsBtn")?.addEventListener("click",loadParticipants);
["participantSearch","participantStatusFilter"].forEach(id=>$(id)?.addEventListener("input",renderParticipants));
$("deleteAllResultsHint")?.addEventListener("click",()=>alert("Permanent deletion is performed publication-by-publication using the Delete Result Set button."));
onAuthStateChanged(auth,u=>{if(u&&!isAdmin(u)){currentUser=null;$("authStatus").textContent="Not authorized";$("adminLoginCard").classList.remove("hidden");$("adminApp").classList.add("hidden");return;}render(u);});
