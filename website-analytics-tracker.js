import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, set, update, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=getApps().length?getApps()[0]:initializeApp(firebaseConfig);
const auth=getAuth(app), db=getDatabase(app);
let activeRef=null, heartbeat=null;
onAuthStateChanged(auth, async user=>{
  if(heartbeat){clearInterval(heartbeat);heartbeat=null;}
  if(!user){activeRef=null;return;}
  const uid=user.uid;
  activeRef=ref(db,`websiteUserActivity/${uid}`);
  const page=(location.pathname.split('/').pop()||'index.html').slice(0,100);
  const payload={uid, email:user.email||'', page, online:true, lastSeenAt:Date.now(), lastSeenServer:serverTimestamp(), userAgentClass:/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop'};
  try{
    await set(activeRef,{...payload,firstSeenAt:Date.now()});
    await onDisconnect(activeRef).update({online:false,lastSeenAt:serverTimestamp()});
    heartbeat=setInterval(()=>{if(activeRef)update(activeRef,{online:true,page,lastSeenAt:Date.now(),lastSeenServer:serverTimestamp()}).catch(()=>{});},60000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&activeRef)update(activeRef,{online:true,page,lastSeenAt:Date.now(),lastSeenServer:serverTimestamp()}).catch(()=>{});});
  }catch(err){console.warn('Website activity tracking unavailable:',err?.message||err);}
});
