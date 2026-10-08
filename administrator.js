import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth,onAuthStateChanged,signInWithEmailAndPassword,sendPasswordResetEmail,signOut,setPersistence,browserLocalPersistence,indexedDBLocalPersistence } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase,ref,get,update,remove,serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app),$=id=>document.getElementById(id);
const ADMIN_EMAIL="ramkrishnadeinv.01@gmail.com";
let currentUser=null, selectedRoom="";
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const isAdmin=u=>String(u?.email||"").toLowerCase()===ADMIN_EMAIL;
async function persist(){try{return await setPersistence(auth,browserLocalPersistence)}catch(e){try{return await setPersistence(auth,indexedDBLocalPersistence)}catch(e2){}}}
function msg(t,cls=""){const x=$("loginMsg");if(x){x.textContent=t;x.className=cls;}}
function fmt(ts){return ts?new Date(Number(ts)).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"})+" IST":"—"}
function admin(){return isAdmin(currentUser)}

async function loadHosts(){
 if(!admin())return;const body=$("hostRequests"),status=$("status");
 try{const snap=await get(ref(db,"hosts"));const obj=snap.val()||{};const arr=Object.entries(obj).map(([uid,h])=>({uid,...h})).sort((a,b)=>(Number(b.requestedAt)||0)-(Number(a.requestedAt)||0));
  $("pendingCount").textContent=arr.filter(x=>x.status==="pending").length;
  status.textContent=`${arr.length} host request/account record(s) found.`;
  if(!arr.length){body.innerHTML='<tr><td colspan="9">No host requests.</td></tr>';return;}
  body.innerHTML=arr.map(h=>{let opts='<option value="">Select Action</option>';if(h.uid!==currentUser.uid){if(h.status==="pending")opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';else if(h.status==="approved")opts+='<option value="revoked">Revoke</option>';else opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';opts+='<option value="delete">Delete</option>';}return `<tr><td>${esc(h.email)}</td><td>${esc(h.hostName)}</td><td>${esc(h.designation)}</td><td>${esc(h.placeOfPosting)}</td><td>${esc(h.phone)}</td><td>${esc(h.purpose)}${h.purposeDetails?`<br><small>${esc(h.purposeDetails)}</small>`:""}</td><td>${esc(String(h.status||"pending").toUpperCase())}</td><td>${fmt(h.requestedAt)}</td><td>${h.uid===currentUser.uid?"—":`<select class="action-select" data-uid="${esc(h.uid)}">${opts}</select>`}</td></tr>`}).join("");
  document.querySelectorAll(".action-select").forEach(s=>s.onchange=async()=>{const action=s.value,uid=s.dataset.uid;s.value="";if(!action)return;if(!confirm(`Are you sure you want to ${action} this Host?`))return;try{if(action==="delete")await remove(ref(db,`hosts/${uid}`));else await update(ref(db,`hosts/${uid}`),{status:action,reviewedAt:serverTimestamp(),reviewedBy:currentUser.uid});await loadHosts();}catch(e){alert(e.message||String(e));}});
 }catch(e){status.textContent=`Unable to load host requests: ${e.message||e}`;}
}

function roomType(r){if(r?.examType==="general"||r?.generalQuestions)return "General Question";if(r?.mcqQuestions)return "MCQ";if(r?.questions)return "Live Quiz";return "Unknown";}
function roomTitle(r){return r?.title||r?.mcqTitle||r?.generalTitle||"Untitled Exam"}
async function loadRooms(){
 if(!admin())return;const body=$("roomRows");
 try{const snap=await get(ref(db,"rooms"));const obj=snap.val()||{};const hostSnap=await get(ref(db,"hosts"));const hosts=hostSnap.val()||{};
  const arr=Object.entries(obj).map(([code,r])=>({code,r:r||{},host:hosts[r?.hostUid]||{}})).sort((a,b)=>(Number(b.r?.createdAt)||0)-(Number(a.r?.createdAt)||0));
  if(!arr.length){body.innerHTML='<tr><td colspan="8">No examination rooms found.</td></tr>';$("roomSelect").innerHTML='<option value="">No rooms available</option>';return;}
  body.innerHTML=arr.map(x=>{const r=x.r;const qn=Object.keys(r.questions||{}).length,mn=Object.keys(r.mcqQuestions||{}).length,gn=Object.keys(r.generalQuestions||{}).length;return `<tr><td>${esc(x.code)}</td><td>${esc(roomType(r))}</td><td>${esc(roomTitle(r))}</td><td>${esc(x.host.hostName||r.hostUid||"—")}</td><td>${esc(String(r.state||r.examStatus||"—"))}</td><td>${qn+mn+gn}</td><td>${fmt(r.createdAt)}</td><td><button class="secondary roomManage" data-room="${esc(x.code)}">Manage</button> <button class="danger roomDelete" data-room="${esc(x.code)}">🗑 Delete Room</button></td></tr>`}).join("");
  $("roomSelect").innerHTML='<option value="">Select a room</option>'+arr.map(x=>`<option value="${esc(x.code)}">${esc(x.code)} — ${esc(roomTitle(x.r))} — ${esc(roomType(x.r))}</option>`).join("");
  document.querySelectorAll(".roomManage").forEach(b=>b.onclick=()=>{ $("roomSelect").value=b.dataset.room; manageRoom(); });
  document.querySelectorAll(".roomDelete").forEach(b=>b.onclick=()=>deleteRoom(b.dataset.room));
 }catch(e){body.innerHTML=`<tr><td colspan="8">Unable to load rooms: ${esc(e.message)}</td></tr>`;}
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

async function loadOtherPublications(){
 if(!admin())return;const body=$("publicationRows");try{const snap=await get(ref(db,"otherExamPublications"));const vals=snap.val()||{};const arr=Object.values(vals).sort((a,b)=>(Number(b.publishedAt)||0)-(Number(a.publishedAt)||0));
 if(!arr.length){body.innerHTML='<tr><td colspan="6">No Other Exam publications found.</td></tr>';return;}
 body.innerHTML=arr.map(x=>`<tr><td>${esc(x.publicationId)}</td><td>${esc(x.examName)}</td><td>${esc(x.examDate)}</td><td>${esc(x.recordCount||0)}</td><td>${fmt(x.publishedAt)}</td><td><button class="danger publicationDelete" data-id="${esc(x.publicationId)}">🗑 Delete Result Set</button></td></tr>`).join("");
 document.querySelectorAll(".publicationDelete").forEach(b=>b.onclick=()=>deletePublication(b.dataset.id));
 }catch(e){body.innerHTML=`<tr><td colspan="6">Unable to load publications: ${esc(e.message)}</td></tr>`;}
}
async function deletePublication(pub){
 if(!admin())return;const snap=await get(ref(db,`otherExamPublications/${pub}`));if(!snap.exists())return alert("Publication not found.");const meta=snap.val()||{};const ok=confirm(`DELETE OTHER EXAM RESULT\n\nPublication: ${pub}\nExam: ${meta.examName||""}\nRecords: ${meta.recordCount||0}\n\nAll candidate results belonging to this publication will be deleted. This cannot be undone. Continue?`);if(!ok)return;
 try{for(const [rid,m] of Object.entries(meta.resultIndex||{})){if(m?.phoneHash)await remove(ref(db,`otherExamResults/${m.phoneHash}/${rid}`));}await remove(ref(db,`otherExamPublications/${pub}`));await loadOtherPublications();}catch(e){alert(`Delete failed: ${e.message||e}`);}}

function render(u){currentUser=u||null;$("authStatus").textContent=u?(isAdmin(u)?"Administrator signed in":"Not authorized"):"Not signed in";$("adminLoginCard").classList.toggle("hidden",!!u&&isAdmin(u));$("adminApp").classList.toggle("hidden",!(u&&isAdmin(u)));if(u&&isAdmin(u)){loadHosts();loadRooms();loadOtherPublications();}}
$("loginBtn").onclick=async()=>{try{await persist();const email=$("email").value.trim().toLowerCase();if(email!==ADMIN_EMAIL){msg("This page is restricted to the Administrator account.");return;}if(auth.currentUser&&!isAdmin(auth.currentUser)){await signOut(auth);await new Promise(r=>setTimeout(r,200));}await signInWithEmailAndPassword(auth,email,$("password").value);}catch(e){msg(e.message||String(e));}};
$("forgotBtn").onclick=async()=>{try{const email=$("email").value.trim().toLowerCase();if(email!==ADMIN_EMAIL){msg("Enter the Administrator email address first.");return;}await sendPasswordResetEmail(auth,email);msg("Password reset link sent. Check Inbox and Spam/Junk folder.");}catch(e){msg(e.message||String(e));}};
$("refreshBtn").onclick=()=>{loadHosts();loadRooms();loadOtherPublications();};$("logoutBtn").onclick=()=>signOut(auth);$("backBtn").onclick=$("backBtn2").onclick=()=>location.href="host.html";$("manageRoomBtn").onclick=manageRoom;$("closeRoomManager").onclick=()=>$("roomManager").classList.add("hidden");
onAuthStateChanged(auth,u=>{if(u&&!isAdmin(u)){currentUser=null;$("authStatus").textContent="Not authorized";$("adminLoginCard").classList.remove("hidden");$("adminApp").classList.add("hidden");return;}render(u);});
