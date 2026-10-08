import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth,onAuthStateChanged,signInWithEmailAndPassword,sendPasswordResetEmail,signOut,setPersistence,browserLocalPersistence,indexedDBLocalPersistence } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase,ref,get,update,remove,serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app),$=id=>document.getElementById(id);
const ADMIN_EMAIL="ramkrishnadeinv.01@gmail.com";
let currentUser=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[m]));
const isAdmin=u=>String(u?.email||"").toLowerCase()===ADMIN_EMAIL;
async function persist(){try{return await setPersistence(auth,browserLocalPersistence)}catch(e){try{return await setPersistence(auth,indexedDBLocalPersistence)}catch(e2){}}}
function msg(t,cls=""){const x=$("loginMsg");if(x){x.textContent=t;x.className=cls;}}
function fmt(ts){return ts?new Date(Number(ts)).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"})+" IST":"—"}
async function load(){if(!isAdmin(currentUser))return;const body=$("hostRequests"),status=$("status");try{const snap=await get(ref(db,"hosts"));const obj=snap.val()||{};const arr=Object.entries(obj).map(([uid,h])=>({uid,...h})).sort((a,b)=>(Number(b.requestedAt)||0)-(Number(a.requestedAt)||0));$("pendingCount").textContent=arr.filter(x=>x.status==="pending").length;status.textContent=`${arr.length} host request/account record(s) found.`;if(!arr.length){body.innerHTML='<tr><td colspan="9">No host requests.</td></tr>';return;}body.innerHTML=arr.map(h=>{let opts='<option value="">Select Action</option>';if(h.uid!==currentUser.uid){if(h.status==="pending")opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';else if(h.status==="approved")opts+='<option value="revoked">Revoke</option>';else opts+='<option value="approved">Approve</option><option value="rejected">Reject</option>';opts+='<option value="delete">Delete</option>';}return `<tr><td>${esc(h.email)}</td><td>${esc(h.hostName)}</td><td>${esc(h.designation)}</td><td>${esc(h.placeOfPosting)}</td><td>${esc(h.phone)}</td><td>${esc(h.purpose)}${h.purposeDetails?`<br><small>${esc(h.purposeDetails)}</small>`:""}</td><td>${esc(String(h.status||"pending").toUpperCase())}</td><td>${fmt(h.requestedAt)}</td><td>${h.uid===currentUser.uid?"—":`<select class="action-select" data-uid="${esc(h.uid)}">${opts}</select>`}</td></tr>`}).join("");document.querySelectorAll(".action-select").forEach(s=>s.onchange=async()=>{const action=s.value,uid=s.dataset.uid;s.value="";if(!action)return;const label=action==="delete"?"delete":action; if(!confirm(`Are you sure you want to ${label} this Host?`))return;try{if(action==="delete")await remove(ref(db,`hosts/${uid}`));else await update(ref(db,`hosts/${uid}`),{status:action,reviewedAt:serverTimestamp(),reviewedBy:currentUser.uid});await load();}catch(e){alert(e.message||String(e));}});}catch(e){status.textContent=`Unable to load host requests: ${e.message||e}`;}}
function render(u){currentUser=u||null;$("authStatus").textContent=u?(isAdmin(u)?"Administrator signed in":"Not authorized"):"Not signed in";$("adminLoginCard").classList.toggle("hidden",!!u&&isAdmin(u));$("adminApp").classList.toggle("hidden",!(u&&isAdmin(u)));if(u&&isAdmin(u))load();}
$("loginBtn").onclick=async()=>{try{await persist();const email=$("email").value.trim().toLowerCase();if(email!==ADMIN_EMAIL){msg("This page is restricted to the Administrator account.");return;}if(auth.currentUser && !isAdmin(auth.currentUser)){ await signOut(auth); await new Promise(r=>setTimeout(r,150)); } await signInWithEmailAndPassword(auth,email,$("password").value);}catch(e){msg(e.message||String(e));}};
$("forgotBtn").onclick=async()=>{try{const email=$("email").value.trim().toLowerCase();if(email!==ADMIN_EMAIL){msg("Enter the Administrator email address first.");return;}await sendPasswordResetEmail(auth,email);msg("Password reset link sent. Check Inbox and Spam/Junk folder.");}catch(e){msg(e.message||String(e));}};
$("refreshBtn").onclick=load;$("logoutBtn").onclick=()=>signOut(auth);$("backBtn").onclick=$("backBtn2").onclick=()=>location.href="host.html";
onAuthStateChanged(auth,u=>{
  // Do not sign out a normal Host automatically. The Administrator login must be able to replace the current Host session safely.
  if(u&&!isAdmin(u)){
    currentUser=null;
    $("authStatus").textContent="Not authorized";
    $("adminLoginCard").classList.remove("hidden");
    $("adminApp").classList.add("hidden");
    return;
  }
  render(u);
});
