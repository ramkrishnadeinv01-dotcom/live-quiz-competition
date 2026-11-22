import {initializeApp,getApps,getApp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {getDatabase,ref,get,set} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js";
const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const ADMIN="ramkrishnadeinv.01@gmail.com";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=v=>v?new Date(v).toLocaleDateString("en-IN"):"—";
const plans={
 individual_host:[["free","Free Access"],["host_premium","Individual Host Premium"]],
 individual_participant:[["free","Free Access"],["participant_premium","Participant Premium"]],
 coaching_centre:[["free","Free Access"],["premium_25","Premium – up to 25 students"],["premium_50","Premium – up to 50 students"],["premium_100","Premium – up to 100 students"],["premium_250","Premium – up to 250 students"],["premium_custom","Premium – custom student limit"]]
};
const css=`<style>
.sub-self-card{margin:18px 0;padding:20px;border:1px solid #c9dff7;border-radius:16px;background:linear-gradient(135deg,#fff,#f1f7ff);color:#17365f;box-shadow:0 8px 22px #164e8d12}
.sub-self-card h3{margin:0 0 7px;color:#123d78}.sub-self-grid{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:12px 0}
.sub-self-grid label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700}.sub-self-grid select,.sub-self-grid input{min-height:40px;padding:8px 10px;border:1px solid #b9cde5;border-radius:8px;background:#fff;color:#18365b}
.sub-self-card button{border:0;border-radius:9px;background:#145ee8;color:white;font-weight:800;padding:11px 16px;cursor:pointer}
.sub-self-note{font-size:12px;color:#526985;line-height:1.5}.sub-self-status{margin-top:10px;padding:10px 12px;background:#eaf3ff;border-radius:8px;font-size:13px}
</style>`;
function addPanel(host,kind){
 if(!document.getElementById("subscriptionClientStyles"))document.head.insertAdjacentHTML("beforeend",css.replace("<style>","<style id=\"subscriptionClientStyles\">"));
 if(!host||document.getElementById("mySubscriptionPanel"))return;
 host.insertAdjacentHTML("beforeend",`${css}<section class="sub-self-card" id="mySubscriptionPanel"><h3>💳 ${kind==="coaching_centre"?"Centre Subscription":"My Subscription"}</h3><div id="mySubscriptionCurrent">Loading current subscription…</div><div class="sub-self-grid"><label>Select a plan<select id="mySubscriptionPlan"></select></label><label id="customLimitWrap" style="display:none">Custom student limit<input id="mySubscriptionLimit" type="number" min="1" max="100000" placeholder="e.g. 75"></label><button id="requestSubscriptionBtn" type="button">Request Plan</button></div><div class="sub-self-note">Your request will be sent to the Administrator. The plan becomes active only after approval. No payment is collected through this request.</div><div class="sub-self-status" id="mySubscriptionMessage">Choose a plan to submit a request.</div></section>`);
 const select=document.getElementById("mySubscriptionPlan");
 plans[kind].forEach(([v,l])=>select.add(new Option(l,v)));
 select.addEventListener("change",()=>document.getElementById("customLimitWrap").style.display=select.value==="premium_custom"?"flex":"none");
}
async function init(user){
 if(!document.getElementById("subscriptionClientStyles"))document.head.insertAdjacentHTML("beforeend",css.replace("<style>","<style id=\"subscriptionClientStyles\">"));
 const panel=document.getElementById("mySubscriptionPanel");if(!panel)return;
 const kind=panel.dataset.accountType,uid=user.uid;
 const planSelect=document.getElementById("mySubscriptionPlan");
 if(planSelect && !planSelect.options.length){(plans[kind]||[]).forEach(([v,l])=>planSelect.add(new Option(l,v)));}
 const customWrap=document.getElementById("customLimitWrap");
 if(planSelect && customWrap)planSelect.addEventListener("change",()=>customWrap.style.display=planSelect.value==="premium_custom"?"flex":"none");
 try{
  const [subSnap,reqSnap]=await Promise.all([get(ref(db,`subscriptions/${uid}`)),get(ref(db,`subscriptionRequests/${uid}`))]);
  const sub=subSnap.val()||{},req=reqSnap.val()||{};
  document.getElementById("mySubscriptionCurrent").innerHTML=`<b>Current plan:</b> ${esc(sub.planLabel||sub.plan||"Free Access / Not assigned")} &nbsp; <b>Status:</b> ${esc(sub.status||"not assigned")}<br><b>Valid:</b> ${fmt(sub.startDate)} to ${fmt(sub.endDate)}${sub.studentLimit!==undefined&&sub.studentLimit!==null?`<br><b>Student capacity:</b> ${esc(sub.studentLimit)}`:""}`;
  const msg=document.getElementById("mySubscriptionMessage");
  if(req.status==="pending")msg.textContent=`Your request for ${req.planLabel||req.plan} is pending Administrator approval.`;
  else if(req.status==="approved")msg.textContent=`Your latest request was approved on ${fmt(req.reviewedAt)}.`;
  else if(req.status==="rejected")msg.textContent=`Your latest request was not approved. You may submit a new request.`;
  document.getElementById("requestSubscriptionBtn").onclick=async()=>{
   const plan=document.getElementById("mySubscriptionPlan").value;
   const limit=plan==="premium_custom"?Number(document.getElementById("mySubscriptionLimit").value):({premium_25:25,premium_50:50,premium_100:100,premium_250:250}[plan]??null);
   if(plan==="premium_custom"&&(!Number.isInteger(limit)||limit<1||limit>100000)){msg.textContent="Enter a valid custom student limit.";return;}
   if(req.status==="pending"&&!confirm("A request is already pending. Submit a new request and replace it?"))return;
   const labels=Object.fromEntries(plans[kind]);const planLabel=plan==="premium_custom"?`Premium – ${limit} students`:labels[plan]||plan;
   let displayName=user.email||"";
   try{const profilePath=kind==="individual_host"?`hosts/${uid}`:kind==="coaching_centre"?`coachingCentres/${uid}`:`participants/${uid}`;const ps=await get(ref(db,profilePath));const p=ps.val()||{};displayName=p.centreName||p.hostName||p.name||displayName;}catch(e){}
   const payload={uid,accountType:kind,email:user.email||"",displayName,plan,planLabel,studentLimit:limit,status:"pending",requestedAt:Date.now(),updatedAt:Date.now()};
   try{await set(ref(db,`subscriptionRequests/${uid}`),payload);msg.textContent="Subscription request submitted. Please wait for Administrator approval.";}
   catch(e){msg.textContent=`Request could not be submitted: ${e.message||e}`;}
  };
 }catch(e){document.getElementById("mySubscriptionCurrent").textContent=`Unable to load subscription: ${e.message||e}`;}
}
onAuthStateChanged(auth,user=>{if(user&&!user.isAnonymous)init(user);});
export function mountSubscriptionPanel(host,kind){addPanel(host,kind);if(auth.currentUser)init(auth.currentUser);}
