import {initializeApp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,setPersistence,browserLocalPersistence} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {getDatabase,ref,set,get,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app),$=id=>document.getElementById(id);
const ADMIN="ramkrishnadeinv.01@gmail.com";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function message(t){$("authMsg").textContent=t;}
function makeCode(uid){return "WOE-"+uid.slice(0,7).toUpperCase();}
async function loadCentre(user){
 const snap=await get(ref(db,`coachingCentres/${user.uid}`));
 if(!snap.exists()){$("authCard").classList.remove("hidden");$("profileCard").classList.add("hidden");message("No Coaching Centre profile found for this account. Please register.");return;}
 const p=snap.val();$("authCard").classList.add("hidden");$("profileCard").classList.remove("hidden");
 $("profileDetails").innerHTML=`<b>${esc(p.centreName)}</b><br>Owner: ${esc(p.ownerName)}<br>Email: ${esc(p.email)}<br>Mobile: ${esc(p.phone)}<br>Address: ${esc(p.address)}`;
 $("centreCode").textContent=p.centreCode||"Will be issued after approval";
 $("centreStatus").textContent=`Application status: ${String(p.status||"pending").toUpperCase()}${p.status==="approved"?" — Centre account approved.": " — Your centre is not yet approved. Please wait for Administrator review."}`;
}
$("registerBtn").onclick=async()=>{
 const centreName=$("centreName").value.trim(),ownerName=$("ownerName").value.trim(),email=$("email").value.trim().toLowerCase(),phone=$("phone").value.trim(),address=$("address").value.trim(),password=$("password").value;
 if(!centreName||!ownerName||!email||!phone||!address||!password)return message("Please complete all required fields.");
 if(password.length<6)return message("Password must contain at least 6 characters.");
 try{await setPersistence(auth,browserLocalPersistence);const cred=await createUserWithEmailAndPassword(auth,email,password);const code=makeCode(cred.user.uid);const profile={centreName,ownerName,email,phone,address,centreCode:code,status:email===ADMIN?"approved":"pending",createdAt:Date.now(),requestedAt:serverTimestamp(),accountType:"coaching_centre"};await set(ref(db,`coachingCentres/${cred.user.uid}`),profile);message("Registration submitted successfully. Your application is pending Administrator approval.");await loadCentre(cred.user);}catch(e){message(e.message||String(e));}
};
$("loginBtn").onclick=async()=>{const email=$("email").value.trim(),password=$("password").value;if(!email||!password)return message("Enter your email and password.");try{await setPersistence(auth,browserLocalPersistence);await signInWithEmailAndPassword(auth,email,password);}catch(e){message(e.message||String(e));}};
$("logoutBtn").onclick=()=>signOut(auth);
onAuthStateChanged(auth,user=>{if(user)loadCentre(user).catch(e=>message(e.message||String(e)));else{$("authCard").classList.remove("hidden");$("profileCard").classList.add("hidden");}});
