import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {getDatabase,ref,get,set,update,remove} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app),ADMIN="ramkrishnadeinv.01@gmail.com", $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isAdmin=u=>String(u?.email||"").toLowerCase()===ADMIN;
let current=null,cache={};
function date(v){return v?new Date(v).toLocaleString("en-IN"):"—";}
async function load(){
 if(!isAdmin(current))return;
 const body=$("subscriptionRequestRows"),status=$("subscriptionRequestStatus");if(!body)return;
 body.innerHTML='<tr><td colspan="7">Loading…</td></tr>';
 try{
  const snap=await get(ref(db,"subscriptionRequests"));cache=snap.val()||{};
  const rows=Object.values(cache).filter(x=>x&&typeof x==="object").sort((a,b)=>(b.requestedAt||0)-(a.requestedAt||0));
  status.textContent=`${rows.length} subscription request(s)`;
  if(!rows.length){body.innerHTML='<tr><td colspan="7">No subscription requests yet.</td></tr>';return;}
  body.innerHTML=rows.map(r=>`<tr><td>${esc(r.accountType||"—")}</td><td>${esc(r.displayName||r.email||r.uid)}</td><td>${esc(r.planLabel||r.plan)}</td><td>${r.studentLimit==null?"—":esc(r.studentLimit)}</td><td>${date(r.requestedAt)}</td><td>${esc(r.status||"pending")}</td><td>${r.status==="pending"?`<button class="success" data-action="approve" data-uid="${esc(r.uid)}">Approve</button> <button class="secondary" data-action="reject" data-uid="${esc(r.uid)}">Reject</button>`:"—"}</td></tr>`).join("");
  body.querySelectorAll("button[data-action]").forEach(b=>b.onclick=()=>review(b.dataset.uid,b.dataset.action));
 }catch(e){status.textContent=`Could not load requests: ${e.message||e}`;}
}
async function review(uid,action){
 if(!isAdmin(current))return;
 const req=cache[uid];if(!req)return alert("Request not found. Refresh and try again.");
 if(!confirm(`${action==="approve"?"Approve":"Reject"} ${req.planLabel||req.plan} for ${req.email||uid}?`))return;
 try{
  if(action==="approve"){
   const snap=await get(ref(db,`subscriptions/${uid}`)),old=snap.val()||{};
   await set(ref(db,`subscriptions/${uid}`),{...old,uid,accountType:req.accountType,plan:req.plan,planLabel:req.planLabel,studentLimit:req.studentLimit??null,status:"active",startDate:old.startDate||new Date().toISOString().slice(0,10),endDate:old.endDate||"",updatedAt:Date.now(),updatedBy:current.uid,paymentEnabled:false,approvedRequestAt:Date.now()});
   await update(ref(db,`subscriptionRequests/${uid}`),{status:"approved",reviewedAt:Date.now(),reviewedBy:current.uid});
  }else await update(ref(db,`subscriptionRequests/${uid}`),{status:"rejected",reviewedAt:Date.now(),reviewedBy:current.uid});
  await load();alert(`Subscription request ${action==="approve"?"approved":"rejected"}.`);
 }catch(e){alert(`Action failed: ${e.message||e}`);}
}
onAuthStateChanged(auth,u=>{current=u||null;if(isAdmin(current))load();});
$("refreshSubscriptionRequestsBtn")?.addEventListener("click",load);
