import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, reload, getIdToken, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, get, set, runTransaction, update, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";


// Returning from an examination must not clear the participant session.
// Explicit logout is handled only by the Participant Sign Out control.
window.addEventListener("pageshow", () => {
  // Firebase restores the persisted participant account; keep cached profile
  // and room context available so the dashboard can reopen without another login.
});

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
let authUser=null, participantProfile=null;
// Do not call setPersistence() during page startup. Firebase Auth restores the
// previously persisted user asynchronously; changing persistence before that
// first restoration can race the initial auth state and make a refresh appear
// signed out. Configure browser-local persistence only immediately before an
// explicit participant sign-in or registration action.
let resolveAuthReady;
let authReadyResolved=false;
const authReady=new Promise(resolve=>{resolveAuthReady=resolve;});
async function persistAuth(){await setPersistence(auth,browserLocalPersistence);}
onAuthStateChanged(auth,async u=>{
 authUser=u||null;
 try{await handleParticipantAuth(u);}
 catch(e){console.error("Participant account restoration failed:",e);msg(`Account check failed: ${e.message||e}`);}
 finally{if(!authReadyResolved){authReadyResolved=true;resolveAuthReady(!!u);}}
});
const ADMIN_EMAIL="ramkrishnadeinv.01@gmail.com";
function setJoinMessage(t,cls="status"){const el=$("joinMsg");if(el){el.textContent=t;el.className=cls;}}
async function handleParticipantAuth(user){
 if(!user){authUser=null;participantProfile=null;showLogin();return;}
 if(user.isAnonymous){showLogin();setJoinMessage("Your participant account is not currently signed in. Please sign in to continue.","status blocked");return;}
 try{await reload(user);await getIdToken(user,true);}catch(e){console.warn("Unable to refresh participant auth state",e);}
 if(!user.emailVerified){showLogin();setJoinMessage("Please verify your email using the activation link sent to your inbox, then sign in.","status blocked");return;}
 const profileRef=ref(db,`participants/${user.uid}`);let snap=await get(profileRef);
 if(!snap.exists()){
   const draftSnap=await get(ref(db,`participantRegistrationDrafts/${user.uid}`));
   if(draftSnap.exists()){
     const draft=draftSnap.val()||{};const profile={...draft,email:user.email,status:"pending",emailVerified:true,requestedAt:serverTimestamp(),updatedAt:serverTimestamp()};
     await set(profileRef,profile);await update(ref(db,`participantRegistrationDrafts/${user.uid}`),{status:"submitted",submittedAt:serverTimestamp()});snap=await get(profileRef);
   }
 }
 participantProfile=snap.exists()?snap.val():null;
 if(!participantProfile){showLogin();setJoinMessage("No participant registration was found for this account. Please create your profile.","status blocked");return;}
 if(participantProfile.status!=="approved"){
   showLogin();const status=participantProfile.status||"pending";
   setJoinMessage(status==="rejected"?"Your participant request was not approved. Please contact the Administrator.":status==="revoked"?"Your participant access has been revoked. Please contact the Administrator.":"Your email is verified and your participant request has been submitted. Please wait for Administrator approval.","status blocked");
   return;
 }
 const participant={uid:user.uid,email:user.email,name:participantProfile.name,designation:participantProfile.designation,placeOfPosting:participantProfile.placeOfPosting,phone:participantProfile.phone};
 await update(ref(db,`participantDirectory/${user.uid}`),{uid:user.uid,email:user.email,name:participantProfile.name||"",className:participantProfile.className||"",status:participantProfile.status,updatedAt:Date.now()});
 sessionStorage.setItem("quizParticipant",JSON.stringify(participant));showDashboard(participant);$("connection").textContent="Approved · Signed in";try{await renderStudentAnalytics(user.uid);}catch(analyticsError){console.error("Student analytics failed to load:",analyticsError);const panel=$("studentAnalyticsContent");if(panel)panel.innerHTML=`<div class="status blocked">Unable to load your performance analysis: ${esc(analyticsError.message||analyticsError)}. Please press Refresh to try again.</div>`;}
}
async function loadMyAllottedTests(){
 const box=$("myAllottedTests"),uid=auth.currentUser?.uid;if(!box||!uid)return;
 box.innerHTML="<p>Loading your assigned examinations…</p>";
 try{
  const snap=await get(ref(db,`testAssignments/${uid}`));
  const items=Object.entries(snap.val()||{}).map(([id,a])=>({...a,id})).filter(a=>a&&a.status!=="ARCHIVED").sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0));
  if(!items.length){box.innerHTML='<div class="status">No examinations have been allotted to you yet.</div>';return;}
  const pending=[],completed=[],results=[];
  for(const a of items){
   const expired=a.dueAt&&Date.now()>a.dueAt;
   let latest=null;
   if(a.category==='olympiad'){
    const h=await get(ref(db,`academicOlympiadAttempts/${a.testId}/${uid}`));
    const v=h.val()||{};const attempts=v.status?[v]:Object.values(v).filter(x=>x&&typeof x==='object');
    latest=attempts.filter(x=>x.status==='SUBMITTED'&&(x.assignmentId===a.id||(!x.assignmentId&&Number(a.generation||1)===1))).sort((x,y)=>(y.submittedAt||0)-(x.submittedAt||0))[0]||null;
   } else if(a.category==='mcq'){
    const phone=String(participantProfile?.phone||'').replace(/\D/g,'');
    const h=await get(ref(db,`rooms/${a.testId}/mcqAnswers/${phone}`));latest=h.exists()&&h.val()?.status==='SUBMITTED'&&Number(h.val().submittedAt||0)>=Number(a.assignedAt||0)?h.val():null;
   } else if(a.category==='general'){
    const phone=String(participantProfile?.phone||'').replace(/\D/g,'');
    const h=await get(ref(db,`rooms/${a.testId}/generalAnswers/${phone}`));latest=h.exists()&&Number(h.val().submittedAt||0)>=Number(a.assignedAt||0)?h.val():null;
   }
   const isDone=!!latest||a.status==='SUBMITTED';
   const detail=`${String(a.category||'').toUpperCase()} · ${a.testTitle||'Examination'} · ${a.roomCode||a.testId||''}`;
   const due=a.dueAt?new Date(a.dueAt).toLocaleString('en-IN'):'No deadline';
   const action=isDone?`<button type="button" class="success allottedReattemptBtn" data-id="${esc(a.id)}">↻ Reattempt Test</button>`:(!expired?`<button type="button" class="success allottedStartBtn" data-id="${esc(a.id)}">Start Examination</button>`:'<span class="status blocked">Deadline passed</span>');
   const card=`<article class="card allotted-detail-card" style="margin:10px 0;padding:16px;border:1px solid #d9b65b;background:#102b50;color:#fff"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${esc(a.testTitle||'Assigned Examination')}</b><span>${isDone?'COMPLETED':expired?'OVERDUE':esc(a.status||'PENDING')}</span></div><p style="margin:7px 0;color:#d7e3f5">${esc(detail)}</p><p style="margin:4px 0;color:#d7e3f5">Assigned: ${a.assignedAt?new Date(a.assignedAt).toLocaleString('en-IN'):'—'} · Due: ${esc(due)}</p><p style="margin:4px 0;color:#d7e3f5">Attempts: ${a.category==='olympiad'?(latest?.attemptNo||1):isDone?'Completed':'Not attempted'} · Status: ${isDone?'Submitted':'Awaiting submission'}</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${action}${isDone?`<button type="button" class="secondary allottedDeleteBtn" data-id="${esc(a.id)}">Delete completed record</button>`:''}</div></article>`;
   (isDone?completed:pending).push({html:card,a,latest});
   if(isDone)results.push({html:`<article class="card" style="margin:8px 0;padding:14px;background:#0c2548;color:#fff;border:1px solid #d9b65b"><b>${esc(a.testTitle||'Assigned Examination')}</b><p>${esc(String(a.category||'').toUpperCase())} · ${latest?.submittedAt?new Date(latest.submittedAt).toLocaleString('en-IN'):'Submission recorded'}</p>${latest&&a.category==='olympiad'?`<p>Score: <b>${Number(latest.score||0).toFixed(2)}</b> · Correct: ${Number(latest.correct||0)} · Wrong: ${Number(latest.wrong||0)} · Unanswered: ${Number(latest.unanswered||0)}</p>`:latest&&a.category==='mcq'?`<p>Correct: ${Number(latest.correctCount||0)} · Wrong: ${Number(latest.wrongCount||0)} · Answered: ${Number(latest.answeredCount||0)}</p>`:'<p>Submission recorded. Detailed result is available in the examination result service.</p>'}</article>`});
  }
  box.innerHTML=`<section class="allotted-section"><h3>1. Pending Tasks (${pending.length})</h3>${pending.length?pending.map(x=>x.html).join(''):'<p class="status">No pending tasks.</p>'}</section><section class="allotted-section" style="margin-top:22px"><h3>2. Completed Tests (${completed.length})</h3>${completed.length?completed.map(x=>x.html).join(''):'<p class="status">No completed tests yet.</p>'}</section><section class="allotted-section" style="margin-top:22px"><h3>3. Results of Allotted Tests (${results.length})</h3>${results.length?results.map(x=>x.html).join(''):'<p class="status">Your submitted results will appear here.</p>'}</section>`;
  box.querySelectorAll('.allottedStartBtn,.allottedReattemptBtn').forEach(btn=>btn.onclick=()=>startAllottedTest(items.find(a=>a.id===btn.dataset.id)));
  box.querySelectorAll('.allottedDeleteBtn').forEach(btn=>btn.onclick=async()=>{const a=items.find(x=>x.id===btn.dataset.id);if(!a||!confirm(`Delete the completed assignment record for “${a.testTitle||'this examination'}”? Your submitted result history will remain saved.`))return;try{await update(ref(db,`testAssignments/${uid}/${a.id}`),{status:"ARCHIVED",archivedAt:Date.now(),archivedBy:uid,isLatest:false});await loadMyAllottedTests();}catch(e){alert(`Unable to archive completed record: ${e.message||e}`);}});
 }catch(e){console.error(e);box.innerHTML=`<div class="status blocked">Unable to load assigned examinations: ${esc(e.message||e)}</div>`;}
}
function startAllottedTest(a){if(!a)return;const category=a.category;if(category==="olympiad"){location.href=`academic-test.html?id=${encodeURIComponent(a.testId)}&assignment=${encodeURIComponent(a.id)}`;return;}if(category==="mcq"){location.href=`mcq.html?room=${encodeURIComponent(a.testId)}&assignment=${encodeURIComponent(a.id)}`;return;}if(category==="general"){location.href=`general.html?room=${encodeURIComponent(a.testId)}&assignment=${encodeURIComponent(a.id)}`;return;}alert("Unsupported examination category.");}

function showLogin(){const j=$("joinCard"),d=$("dashboardCard"),q=$("quizCard");if(j)j.classList.remove("hidden");if(d)d.classList.add("hidden");if(q)q.classList.add("hidden");$("connection").textContent="Sign in required";}
async function registerParticipant(){
 const name=$("studentName").value.trim(),designation=$("designation").value.trim(),placeOfPosting=$("placeOfPosting").value.trim(),phone=$("phoneNumber").value.trim(),email=$("participantEmail").value.trim().toLowerCase(),password=$("participantPassword").value;
 if(!name||!designation||!placeOfPosting||!phone||!email||!password)return setJoinMessage("Please complete all registration fields.","status blocked");
 if(password.length<6)return setJoinMessage("Password must contain at least 6 characters.","status blocked");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return setJoinMessage("Please enter a valid email address.","status blocked");
 if(phone.replace(/\D/g,"").length<10)return setJoinMessage("Please enter a valid mobile number.","status blocked");
 const btn=$("participantRegisterBtn");btn.disabled=true;
 try{
   await persistAuth();
   if(auth.currentUser) await signOut(auth);
   let user=null, createdNew=false;
   try{const cred=await createUserWithEmailAndPassword(auth,email,password);user=cred.user;createdNew=true;}
   catch(createErr){
     if(createErr?.code!=="auth/email-already-in-use" && createErr?.code!=="auth/email-already-exists") throw createErr;
     // A Host account and a Participant profile can share one Firebase identity.
     // Sign in to the existing identity; never create a duplicate Auth user.
     const existing=await signInWithEmailAndPassword(auth,email,password);user=existing.user;
   }
   const draft={email,name,designation,placeOfPosting,phone,status:"email_verification_pending",createdAt:serverTimestamp(),accountType:createdNew?"new-participant":"existing-account-add-participant-role"};
   await set(ref(db,`participantRegistrationDrafts/${user.uid}`),draft);
   if(!user.emailVerified){
     const actionCodeSettings={url:`${location.origin}${location.pathname}?participantVerification=complete`,handleCodeInApp:false};
     await sendEmailVerification(user,actionCodeSettings);
     setJoinMessage(createdNew?"An activation link has been sent. Verify your email; your participant request will then be submitted to the Administrator.":"This email already belongs to an existing account (for example, a Host account). We have linked the participant request to that same account. An activation link has been sent; verify the email to submit the participant request.","status success");
   }else{
     const profile={...draft,status:"pending",emailVerified:true,requestedAt:serverTimestamp(),updatedAt:serverTimestamp()};
     await set(ref(db,`participants/${user.uid}`),profile);
     await update(ref(db,`participantRegistrationDrafts/${user.uid}`),{status:"submitted",submittedAt:serverTimestamp()});
     setJoinMessage("Your email is already verified. Your Participant profile request has been submitted to the Administrator for approval. You may continue using this same email account for your Host role.","status success");
     await signOut(auth);
   }
 }catch(e){
   const code=e?.code||"";
   if(code==="auth/wrong-password"||code==="auth/invalid-credential") setJoinMessage("This email is already registered. To add the Participant role, enter the password of that existing account. The same email account can have both Host and Participant profiles.","status blocked");
   else setJoinMessage(e.message||String(e),"status blocked");
 }finally{btn.disabled=false;}
}
async function loginParticipant(){const email=$("participantLoginEmail").value.trim().toLowerCase(),password=$("participantLoginPassword").value;if(!email||!password)return setJoinMessage("Enter your registered email and password.","status blocked");const btn=$("participantLoginBtn");btn.disabled=true;try{await persistAuth();if(auth.currentUser)await signOut(auth);await signInWithEmailAndPassword(auth,email,password);await reload(auth.currentUser);if(!auth.currentUser.emailVerified){setJoinMessage("Your email is not verified yet. Please open the activation email and click its link.","status blocked");await signOut(auth);}}catch(e){setJoinMessage(e.message||String(e),"status blocked");}finally{btn.disabled=false;}}

const $=id=>document.getElementById(id);
let room="",studentKey="",selected="",questionNo=0,openedAt=0,answered=false,timer,violationCount=0,lastViolationAt=0;
let questionTimerSeconds=30;
const opts=["A","B","C","D"];
const IST_TIME_ZONE="Asia/Kolkata";
function formatIST(timestamp){if(!timestamp)return "";const d=new Date(Number(timestamp));if(Number.isNaN(d.getTime()))return "";return d.toLocaleString("en-IN",{timeZone:IST_TIME_ZONE,dateStyle:"medium",timeStyle:"short",hour12:true})+" IST";}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function msg(t,cls=""){$("joinMsg").textContent=t;$("joinMsg").className=cls;}
function normalizePhone(v){v=v.trim().replace(/[\s()-]/g,"");if(/^\+91\d{10}$/.test(v))return v;if(/^91\d{10}$/.test(v))return "+"+v;if(/^\d{10}$/.test(v))return "+91"+v;return "";}
function phoneKey(phone){return phone.replace(/\D/g,"");}
function showDashboard(p){
 $("joinCard").classList.add("hidden");$("dashboardCard").classList.remove("hidden");$("quizCard").classList.add("hidden");
 $("participantWelcome").textContent=`Welcome, ${p.name} • ${p.designation} • ${p.placeOfPosting}`;
 const profileFields={p2ProfileName:p.name,p2ProfileDesignation:p.designation,p2ProfilePlace:p.placeOfPosting,p2ProfilePhone:p.phone};
 Object.entries(profileFields).forEach(([id,value])=>{const el=$(id);if(el)el.textContent=value||"—";});
 $("connection").textContent="Ready";
}
async function renderStudentAnalytics(uid){
 const target=$("studentAnalyticsContent");if(!target||!uid)return;
 target.innerHTML='<p style="color:#d7e3f5">Analysing your submitted examinations…</p>';
 // Read the published test index, then read only this participant's attempt node
 // under each test. Reading the entire attempts root is denied by the project's
 // per-user Firebase rules and caused the dashboard to remain stuck on loading.
 const testSnap=await get(ref(db,'academicOlympiadTests'));
 const tests=testSnap.val()||{},records=[];
 for(const [testId,test] of Object.entries(tests)){
  const ownSnap=await get(ref(db,`academicOlympiadAttempts/${testId}/${uid}`));
  if(!ownSnap.exists())continue;
  const own=ownSnap.val();
  const list=own?.status?[own]:Object.values(own||{}).filter(x=>x&&typeof x==='object');
  for(const a of list)if(a.status==='SUBMITTED')records.push({...a,testId,test:test||{}});
 }
 records.sort((a,b)=>(Number(a.submittedAt)||0)-(Number(b.submittedAt)||0));
 if(!records.length){target.innerHTML='<div style="padding:16px;border:1px dashed #d8b65b88;border-radius:12px;color:#d7e3f5"><b>No completed Olympiad examination yet.</b><p style="margin:6px 0 0">After you submit your first Olympiad examination, your overall, subject-wise and chapter-wise analysis will appear here.</p></div>';return;}
 let totalCorrect=0,totalAnswered=0,totalQuestions=0,totalScore=0;const subjects={},chapters={},trend=[];
 for(const a of records){const qs=Array.isArray(a.test.questions)?a.test.questions:[],answers=a.answers||{};const subject=String(a.subject||a.test.subject||'Unspecified');const sub=subjects[subject]||(subjects[subject]={correct:0,answered:0,questions:0,exams:0});sub.correct+=Number(a.correct||0);sub.answered+=Number(a.answered||0);sub.questions+=qs.length||Number(a.answered||0)+Number(a.unanswered||0);sub.exams++;totalCorrect+=Number(a.correct||0);totalAnswered+=Number(a.answered||0);totalQuestions+=qs.length||Number(a.answered||0)+Number(a.unanswered||0);totalScore+=Number(a.score||0);
  qs.forEach((q,i)=>{const chapter=String(q.chapter||q.chapterName||q.topic||q.unit||'Chapter not tagged');const key=`${subject}|||${chapter}`;const c=chapters[key]||(chapters[key]={subject,chapter,correct:0,answered:0,questions:0});const chosen=String(answers[String(i)]||'').toUpperCase();if(chosen){c.answered++;if(chosen===String(q.correct||'').toUpperCase())c.correct++;}c.questions++;});
  trend.push({label:a.test.title||`Exam ${trend.length+1}`,score:Number(a.score||0),correct:Number(a.correct||0),answered:Number(a.answered||0),date:a.submittedAt?new Date(Number(a.submittedAt)).toLocaleDateString('en-IN'):'—'});
 }
 const pct=(n,d)=>d?Math.round(n/d*100):0,overall=pct(totalCorrect,totalAnswered);const subjectRows=Object.entries(subjects).map(([name,x])=>({name,...x,pct:pct(x.correct,x.answered)})).sort((a,b)=>a.pct-b.pct);const chapterRows=Object.values(chapters).filter(x=>x.answered>0).map(x=>({...x,pct:pct(x.correct,x.answered)})).sort((a,b)=>a.pct-b.pct);const weak=chapterRows.filter(x=>x.answered>=3&&x.pct<60).slice(0,6);const fmt=x=>`${x}%`;
 const metric=(n,l)=>`<div style="padding:12px;border:1px solid #d8b65b66;border-radius:12px;background:#0b2345"><b style="font-size:24px;color:#ffe2a0">${n}</b><div style="font-size:11px;color:#d7e3f5">${l}</div></div>`;
 const bar=(label,value,subtext)=>`<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;gap:8px;color:#fff;font-size:13px"><b>${esc(label)}</b><b>${fmt(value)}</b></div><div style="height:8px;background:#263f60;border-radius:20px;overflow:hidden;margin-top:5px"><div style="height:100%;width:${value}%;background:${value>=75?'#22c55e':value>=60?'#60a5fa':'#f59e0b'}"></div></div><small style="color:#b8c9df">${esc(subtext)}</small></div>`;
 const latest=trend.slice(-6);const maxScore=Math.max(1,...latest.map(x=>x.score));
 // Build a practical seven-day revision plan from the participant's measured weak areas.
 const plannerTopics = weak.length
   ? weak.map(x=>({subject:x.subject,chapter:x.chapter,pct:x.pct,reason:`${x.pct}% accuracy · ${x.answered} answered`}))
   : subjectRows.filter(x=>x.answered>0).slice(0,4).map(x=>({subject:x.name,chapter:"Mixed practice",pct:x.pct,reason:`${x.pct}% subject accuracy`}));
 const planTasks = Array.from({length:7},(_,i)=>{
   const topic=plannerTopics.length?plannerTopics[i%plannerTopics.length]:null;
   const day=new Date();day.setDate(day.getDate()+i);const label=day.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
   const steps = !topic ? ["Review notes from a recently completed examination","Attempt a short mixed practice set","Record questions that need clarification"]
     : i%3===0 ? [`Revise ${topic.chapter} (${topic.subject})`,`Read the relevant notes and write key points`,`Solve 10 focused questions and review every error`]
     : i%3===1 ? [`Practise ${topic.chapter} (${topic.subject})`,`Attempt a timed 15-question practice set`,`Recheck incorrect and unanswered questions`]
     : [`Consolidate ${topic.chapter} (${topic.subject})`,`Explain the key concepts without looking at notes`,`Retake a short quiz and compare accuracy`];
   return {label,topic,steps};
 });
 const plannerHtml=`<div style="margin-top:20px;padding:14px;background:#102b4d;border:1px solid #d8b65b66;border-radius:14px;color:#fff"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><h3 style="color:#ffe2a0;margin:0 0 4px">Your 7-Day Study Planner</h3><p style="margin:0;color:#d7e3f5;font-size:12px">A revision schedule generated from your examination performance.</p></div><button id="printStudentStudyPlan" class="secondary" type="button">Print Study Plan</button></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px;margin-top:12px">${planTasks.map((d,i)=>`<div style="padding:11px;border-radius:10px;background:#0b2345;border:1px solid #ffffff20"><div style="display:flex;justify-content:space-between;gap:6px"><b style="color:#ffe2a0">Day ${i+1}</b><small style="color:#b8c9df">${d.label}</small></div><div style="font-weight:700;margin:7px 0 5px">${d.topic?`${esc(d.topic.subject)} — ${esc(d.topic.chapter)}`:'General revision'}</div><ul style="padding-left:18px;margin:0;color:#d7e3f5;font-size:12px">${d.steps.map(step=>`<li style="margin:4px 0">${esc(step)}</li>`).join('')}</ul>${d.topic?`<small style="display:block;margin-top:7px;color:#f5c66a">Current accuracy: ${d.topic.pct}%</small>`:''}</div>`).join('')}</div><p style="font-size:11px;color:#b8c9df;margin:10px 0 0">Suggested schedule: about 30–45 minutes daily. Adjust the pace to your schoolwork and available time. This plan is guidance based on recorded results, not a formal assessment.</p></div>`;

 const half=Math.max(1,Math.floor(trend.length/2));const earlierAvg=trend.slice(0,half).reduce((n,x)=>n+x.score,0)/Math.max(1,trend.slice(0,half).length);const recent=trend.slice(half);const recentAvg=recent.reduce((n,x)=>n+x.score,0)/Math.max(1,recent.length);const scoreDelta=Math.round(recentAvg-earlierAvg);const progressText=trend.length<2?'Attempt more examinations to establish a progress comparison.':scoreDelta>0?`Average score is up by ${scoreDelta} points in the more recent examinations.`:scoreDelta<0?`Average score is down by ${Math.abs(scoreDelta)} points in the more recent examinations; review the focus areas below.`:'Average score is stable across the two examination periods.';
 target.innerHTML=`<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button id="downloadStudentProgressReport" type="button" class="secondary">⬇ Download Progress Report (PDF)</button></div><div style="padding:12px 14px;margin-bottom:12px;background:#172e4d;border-left:4px solid #d8b65b;border-radius:8px;color:#fff"><b style="color:#ffe2a0">Progress comparison</b><div style="font-size:13px;margin-top:4px">${esc(progressText)}</div></div><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">${metric(records.length,'Exams completed')}${metric(fmt(overall),'Overall accuracy')}${metric(totalCorrect,'Correct answers')}${metric(totalQuestions,'Questions reviewed')}</div>
 <div style="margin-top:18px"><h3 style="color:#ffe2a0;margin:0 0 8px">Performance trend</h3><div style="display:flex;align-items:end;gap:8px;height:130px;padding:10px;background:#0b2345;border-radius:12px">${latest.map((x,i)=>`<div title="${esc(x.label)}: ${x.score}" style="flex:1;min-width:0;text-align:center"><div style="height:${Math.max(5,Math.round((Math.max(0,x.score)/maxScore)*88))}px;background:#d8b65b;border-radius:6px 6px 0 0"></div><small style="display:block;color:#d7e3f5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i+1}</small></div>`).join('')}</div><small style="color:#b8c9df">Last ${latest.length} submitted examinations · bars show score magnitude</small></div>
 <div style="margin-top:18px"><h3 style="color:#ffe2a0;margin:0 0 8px">Subject-wise analysis</h3>${subjectRows.map(x=>bar(x.name,x.pct,`${x.correct}/${x.answered} correct · ${x.exams} exam(s)`)).join('')}</div>
 <div style="margin-top:18px"><h3 style="color:#ffe2a0;margin:0 0 8px">Chapter-wise analysis</h3>${chapterRows.length?chapterRows.map(x=>bar(`${x.subject} — ${x.chapter}`,x.pct,`${x.correct}/${x.answered} correct`)).join(''):'<p style="color:#d7e3f5">Chapter-level details will appear when questions are tagged with chapter names.</p>'}</div>
 <div style="margin-top:18px"><h3 style="color:#ffe2a0;margin:0 0 8px">Focus areas & recommendations</h3>${weak.length?weak.map(x=>`<div style="padding:10px;margin:7px 0;border-left:4px solid #f59e0b;background:#172e4d;border-radius:8px;color:#fff"><b>${esc(x.subject)} — ${esc(x.chapter)}</b><div style="color:#d7e3f5;font-size:12px">${x.pct}% accuracy across ${x.answered} answered questions. Revise this chapter and attempt a focused practice test.</div></div>`).join(''):'<p style="color:#d7e3f5">No repeated weak chapter has been identified yet. Keep attempting examinations to build a reliable analysis.</p>'}</div>
 ${plannerHtml}
 <div style="margin-top:18px"><h3 style="color:#ffe2a0;margin:0 0 8px">Examination history</h3><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;color:#fff;font-size:12px"><thead><tr><th style="text-align:left;padding:7px">Examination</th><th>Date</th><th>Score</th><th>Correct</th></tr></thead><tbody>${records.slice().reverse().map(a=>`<tr style="border-top:1px solid #ffffff22"><td style="padding:7px">${esc(a.test.title||a.testId)}</td><td>${a.submittedAt?new Date(Number(a.submittedAt)).toLocaleDateString('en-IN'):'—'}</td><td>${Number(a.score||0)}</td><td>${Number(a.correct||0)}/${Number(a.answered||0)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function openRoomModal(type){
 $("roomModal").classList.remove("hidden");
 $("assignmentRoomCode").value="";$("roomModalMsg").textContent="";
 const title=type==="quiz"?"Join Quiz":type==="mcq"?"Exam — MCQ Based":"General Question Based Exam";
 $("roomModalTitle").textContent=title;$("roomModalText").textContent=`Please insert the room code for ${title.toLowerCase()}.`;
 $("roomContinueBtn").dataset.type=type;$("assignmentRoomCode").focus();
}
function closeRoomModal(){$("roomModal").classList.add("hidden");}
async function enterAssignment(type){
 const signedIn=await authReady;
 if(!signedIn||!authUser||!participantProfile||participantProfile.status!=="approved"){$("roomModalMsg").className="status blocked";$("roomModalMsg").textContent="Only an approved participant can join an assignment. Please sign in with your approved account.";return;}
 const code=$("assignmentRoomCode").value.trim().toUpperCase();
 if(!/^[A-Z0-9]{6}$/.test(code)){ $("roomModalMsg").className="status blocked";$("roomModalMsg").textContent="Enter a valid 6-character room code.";return; }
 const rs=await get(ref(db,`rooms/${code}`));
 if(!rs.exists()){ $("roomModalMsg").className="status blocked";$("roomModalMsg").textContent="Room not found.";return; }
 const r=rs.val()||{};
 if(r.competitionClosed||r.state==="competition_closed"){
   if(type==="quiz"){ $("roomModalMsg").className="status blocked";$("roomModalMsg").textContent="This quiz competition is closed.";return; }
 }
 const p=JSON.parse(sessionStorage.getItem("quizParticipant")||"null");
 if(!p){closeRoomModal();return;}
 if(type==="mcq"){sessionStorage.setItem("mcqRoom",code);window.location.href=`mcq.html?room=${encodeURIComponent(code)}`;return;}
 if(type==="general"){sessionStorage.setItem("generalRoom",code);window.location.href=`general.html?room=${encodeURIComponent(code)}`;return;}
 closeRoomModal(); await joinExistingQuiz(code,p);
}
async function joinExistingQuiz(code,p){
 const signedIn=await authReady;
 if(!signedIn||!authUser||!participantProfile||participantProfile.status!=="approved"){alert("Only an approved participant can join an assignment.");return;}
 room=code; const phone=p.phone;
 studentKey=phoneKey(phone);
 const rs=await get(ref(db,`rooms/${room}`)); if(!rs.exists())return alert("Room not found."); const r=rs.val()||{};
 if(r.competitionClosed||r.state==="competition_closed")return alert("This competition is closed. You cannot join this room now.");
 const pRef=ref(db,`rooms/${room}/participants/${studentKey}`);
 const result=await runTransaction(pRef,current=>{
   if(current===null)return {studentKey,phone,name:p.name,designation:p.designation,placeOfPosting:p.placeOfPosting,blocked:false,winner:false,disqualified:false,violationCount:0,joinedAt:{".sv":"timestamp"}};
   if(current.canRejoin===true&&!current.blocked&&!current.disqualified&&!current.winner)return {...current,studentKey,phone:current.phone||phone,name:current.name||p.name,designation:current.designation||p.designation,placeOfPosting:current.placeOfPosting||p.placeOfPosting,canRejoin:false,lastRejoinedAt:{".sv":"timestamp"}};
   return;
 });
 if(!result.committed){alert("This mobile number has already participated in this quiz. You cannot join again.");return;}
 $("dashboardCard").classList.add("hidden");$("quizCard").classList.remove("hidden");
 $("title").textContent=r.title||"Live Quiz";$("room").textContent=room;$("connection").textContent="Connected";startAntiCheat();requestFullScreen();listen();
}
function requestFullScreen(){const el=document.documentElement;const fn=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen;if(fn)Promise.resolve(fn.call(el)).catch(()=>{});}
async function recordViolation(type){
 const now=Date.now();if(now-lastViolationAt<1200||!room||!studentKey)return;
 // Once the host closes the competition, the entire competition is frozen.
 // Leaving the page, changing tabs, losing focus or exiting fullscreen after closure
 // must NOT create a new violation or change any participant record.
 const roomSnap=await get(ref(db,`rooms/${room}`));
 const roomData=roomSnap.val()||{};
 if(roomData.competitionClosed || roomData.state==="competition_closed")return;
 lastViolationAt=now;violationCount++;
 const p=await get(ref(db,`rooms/${room}/participants/${studentKey}`));if(!p.exists())return;
 // Re-check closure immediately before writing, so a close occurring while the
 // participant is leaving cannot create a late disqualification.
 const latestRoom=await get(ref(db,`rooms/${room}`));
 const latest=latestRoom.val()||{};
 if(latest.competitionClosed || latest.state==="competition_closed")return;
 const audit={violationCount,lastViolationType:type,lastViolationAt:serverTimestamp()};
 // A legitimate prize winner remains a BLOCKED WINNER, not DISQUALIFIED. Keep the violation in the audit log.
 if(!(p.val()?.blocked && p.val()?.winner)) Object.assign(audit,{blocked:true,disqualified:true,disqualificationReason:"Anti-cheating violation"});
 await update(ref(db,`rooms/${room}/participants/${studentKey}`),audit);
 await update(ref(db,`rooms/${room}/violations/${studentKey}/${Date.now()}`),{type,at:serverTimestamp(),question:questionNo});
 $("violationStatus").classList.remove("hidden");$("violationStatus").textContent=`⚠️ Violation recorded: ${type}. Total: ${violationCount}`;
}
function startAntiCheat(){
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState!=="visible")recordViolation("TAB/WINDOW SWITCH OR MINIMIZE");});
 window.addEventListener("blur",()=>recordViolation("WINDOW LOST FOCUS"));
 document.addEventListener("fullscreenchange",()=>{if(document.fullscreenElement!==document.documentElement)recordViolation("EXITED FULL SCREEN");});
 document.addEventListener("contextmenu",e=>e.preventDefault());document.addEventListener("copy",e=>e.preventDefault());document.addEventListener("cut",e=>e.preventDefault());document.addEventListener("selectstart",e=>e.preventDefault());
 document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&["c","u","s","p","a"].includes(e.key.toLowerCase()))e.preventDefault();if(e.key==="F12")e.preventDefault();});
}
function listen(){
 onValue(ref(db,`rooms/${room}`),async s=>{const r=s.val()||{};
  if(r.competitionClosed || r.state==="competition_closed"){
   clearInterval(timer); answered=true; questionNo=0;
   $("studentStatus").className="status blocked";
   $("studentStatus").textContent="🔒 Competition Closed — This competition has been closed by the host. No further participation is allowed.";
   $("qNo").textContent=""; $("prize").textContent=""; $("question").textContent="Competition Closed";
   $("options").innerHTML=""; $("result").textContent=""; $("timer").textContent="00:00";
   $("submitBtn").disabled=true;
   return;
  }
  const p=(await get(ref(db,`rooms/${room}/participants/${studentKey}`))).val()||{};
  violationCount=p.violationCount||0;
  if(p.disqualified){$("studentStatus").className="status blocked";$("studentStatus").textContent="⛔ Disqualified and blocked from the competition. Please contact the host if you need to be unblocked.";disable();return;}
  if(p.blocked&&p.winner){$("studentStatus").className="status blocked";$("studentStatus").textContent="🏆 You have won a prize and are blocked from the remaining questions.";disable();return;}
  if(p.blocked){$("studentStatus").className="status blocked";$("studentStatus").textContent="⛔ You are currently blocked from the competition.";disable();return;}$("studentStatus").className="status "+(r.state==="open"?"live":"");
  $("studentStatus").textContent=r.state==="open"?"Question is LIVE — answer now!":r.state==="closed"?"Answers are closed.":r.state==="revealed"?(r.winnerName?`Winner: ${r.winnerName}`:"No eligible winner"):"Waiting for the host to show the next question.";
  if(r.state==="open"&&r.currentQuestion){questionTimerSeconds=Math.max(5,Number(r.timerSeconds||30));loadQuestion(r.currentQuestion);startCountdown(r.openedAt,questionTimerSeconds);}
  if(r.state==="revealed"&&r.currentQuestion===questionNo){$("result").innerHTML=r.winnerKey===studentKey?'<div class="successbox">🏆 Congratulations! You are the winner.</div>':`Winner: <b>${esc(r.winnerName||"None")}</b>`;}
  if(r.state!=="open"){$("submitBtn").disabled=true;if(r.state!=="revealed")$("options").innerHTML="";}
 });
}
async function loadQuestion(n){
 if(n===questionNo&&$("question").textContent!=="Waiting for the host to show the next question.")return;questionNo=n;answered=false;selected="";$("result").textContent="";
 const s=await get(ref(db,`rooms/${room}/questions/q${n}`));const q=s.val()||{};$("qNo").textContent=`Question ${n}`;$("prize").textContent=`₹${Number(q.prize||0)}`;$("question").textContent=q.text||"";
 $("options").innerHTML=opts.map(x=>`<button class="option" data-o="${x}"><b>${x}.</b> ${esc(q.options?.[x]||"")}</button>`).join("");
 document.querySelectorAll(".option").forEach(b=>b.onclick=()=>{if(answered)return;selected=b.dataset.o;document.querySelectorAll(".option").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");});$("submitBtn").disabled=false;
}
function startCountdown(serverOpen,seconds){
 if(!serverOpen)return;
 openedAt=Number(serverOpen);
 clearInterval(timer);
 const duration=Math.max(5,Number(seconds||30))*1000;
 const tick=()=>{
   const remaining=Math.max(0,duration-(Date.now()-openedAt));
   const total=Math.ceil(remaining/1000);
   const mm=String(Math.floor(total/60)).padStart(2,"0");
   const ss=String(total%60).padStart(2,"0");
   $("timer").textContent=`${mm}:${ss}`;
   if(remaining<=0){
     clearInterval(timer);
     answered=true;
     $("submitBtn").disabled=true;
     document.querySelectorAll(".option").forEach(b=>b.disabled=true);
     $("result").textContent="⏰ Time is over. Answers are closed.";
   }
 };
 tick();
 timer=setInterval(tick,100);
}
function disable(){answered=true;$("submitBtn").disabled=true;document.querySelectorAll(".option").forEach(b=>b.disabled=true);}
document.addEventListener("DOMContentLoaded",()=>{
 $("participantRegisterBtn")?.addEventListener("click",registerParticipant);
 $("showRegisterBtn")?.addEventListener("click",()=>{$("participantLoginFields")?.classList.add("hidden");$("participantRegisterFields")?.classList.remove("hidden");$("backToLoginBtn")?.classList.remove("hidden");setJoinMessage("Create your participant profile. If your email is already registered as a Host, use the same account password to add the Participant role.");});
 $("backToLoginBtn")?.addEventListener("click",()=>{$("participantRegisterFields")?.classList.add("hidden");$("participantLoginFields")?.classList.remove("hidden");$("backToLoginBtn")?.classList.add("hidden");setJoinMessage("");});
 $("participantLoginBtn")?.addEventListener("click",loginParticipant);
 $("participantForgotBtn")?.addEventListener("click",async()=>{const email=$("participantLoginEmail").value.trim().toLowerCase();if(!email)return setJoinMessage("Enter your email address first.","status blocked");try{await sendPasswordResetEmail(auth,email);setJoinMessage("Password reset email sent. Please check Inbox and Spam/Junk.","status success");}catch(e){setJoinMessage(e.message||String(e),"status blocked");}});
});
$("quizAssignment").onclick=()=>openRoomModal("quiz");
$("mcqAssignment").onclick=()=>openRoomModal("mcq");
$("generalAssignment").onclick=()=>openRoomModal("general");
$("roomCancelBtn").onclick=closeRoomModal;
$("roomContinueBtn").onclick=()=>enterAssignment($("roomContinueBtn").dataset.type);
function activateParticipantTab(which){
 const ids={assignment:["assignmentTab","assignmentPanel"],allotted:["allottedTab","allottedPanel"],result:["resultTab","resultPanel"],academic:["academicTab","academicPanel"]};
 Object.entries(ids).forEach(([key,[tab,panel]])=>{const t=$(tab),p=$(panel);if(t)t.classList.toggle("active",key===which);if(p)p.classList.toggle("hidden",key!==which);});
}
$("assignmentTab").onclick=()=>activateParticipantTab("assignment");
$("allottedTab")?.addEventListener("click",()=>{location.href="allotted-tests.html";});
$("refreshAllottedTests")?.addEventListener("click",loadMyAllottedTests);
$("resultTab").onclick=()=>activateParticipantTab("result");
if($("academicTab"))$("academicTab").onclick=()=>activateParticipantTab("academic");
$("participantSignOut").onclick=async()=>{if(!confirm("Log out of your participant account? Your saved profile and approval status will remain unchanged."))return;sessionStorage.removeItem("quizParticipant");sessionStorage.removeItem("mcqRoom");sessionStorage.removeItem("generalRoom");await signOut(auth);showLogin();setJoinMessage("You have been logged out. Your participant profile remains saved.","status success");};
$("viewResultBtn").onclick=async()=>{
 const code=$("resultRoomCode").value.trim().toUpperCase();
 const resultPhone=$("resultPhoneNumber").value.trim();
 const p=JSON.parse(sessionStorage.getItem("quizParticipant")||"null");
 if(!/^[A-Z0-9]{6}$/.test(code)){ $("resultSummary").textContent="Enter a valid 6-character room code.";return; }
 const key=phoneKey(resultPhone);
 if(key.length<10){ $("resultSummary").textContent="Enter the 10-digit phone number used during the examination.";return; }
 const snap=await get(ref(db,`rooms/${code}`));
 if(!snap.exists()){ $("resultSummary").textContent="Room not found.";return; }
 const roomData=snap.val()||{};
 if(roomData.mcqQuestions && roomData.mcqAnswers){
   // Find the participant result in the active run first. If the Host used
   // RESTART EXAM, the previous run is preserved under mcqHistory, so search
   // the archived runs as well. This prevents a valid submitted result from
   // disappearing after a restart.
   let mcqAnswers=roomData.mcqAnswers||{};
   let rec=mcqAnswers[key]||null;
   if(!rec){for(const v of Object.values(mcqAnswers)){if(v && phoneKey(String(v.phone||""))===key){rec=v;break;}}}
   let resultRunLabel="Current Run";
   if(!rec){
     const history=roomData.mcqHistory||{};
     const historyEntries=Object.entries(history).sort((a,b)=>{
       const ta=Number(a[1]?.closedAt||a[1]?.archivedAt||a[1]?.startedAt||a[0]||0);
       const tb=Number(b[1]?.closedAt||b[1]?.archivedAt||b[1]?.startedAt||b[0]||0);
       return tb-ta;
     });
     for(const [runId,run] of historyEntries){
       const aa=run?.mcqAnswers||{};
       let candidate=aa[key]||null;
       if(!candidate){for(const v of Object.values(aa)){if(v && phoneKey(String(v.phone||""))===key){candidate=v;break;}}}
       if(candidate){rec=candidate;mcqAnswers=aa;resultRunLabel=`Archived Run ${runId}`;break;}
     }
   }
   if(!rec){$("resultSummary").className="status";$("resultSummary").textContent="No MCQ result found for this participant in this room.";return;}
   const qObj=roomData.mcqQuestions||{};
   const qs=Object.keys(qObj).sort((a,b)=>Number((a.match(/\d+/)||[0])[0])-Number((b.match(/\d+/)||[0])[0])).map(k=>({id:k,...qObj[k]}));
   let correct=0,wrong=0,unanswered=0;
   const details=qs.map((q,i)=>{const a=String((rec.answers||{})[q.id]||"").toUpperCase();let r="Unanswered";if(a){if(a===String(q.correct||"").toUpperCase()){correct++;r="Correct"}else{wrong++;r="Wrong"}}else unanswered++;return {no:i+1,q,answer:a,result:r};});
   const pct=qs.length?correct*100/qs.length:0;
   const safe=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
   const ansText=(q,o)=>o?`${o}. ${q.options?.[o]||""}`:"Not answered";
   // Build participant rank from all submitted MCQ records in this room.
   const allMcqRecords=Object.values(mcqAnswers||{}).filter(v=>v&&typeof v==="object");
   const ranked=allMcqRecords.map(v=>{
     const aa=v.answers||{}; let c=0;
     qs.forEach(q=>{if(String(aa[q.id]||"").toUpperCase()===String(q.correct||"").toUpperCase())c++;});
     return {v,correct:c,submittedAt:Number(v.submittedAt||Number.MAX_SAFE_INTEGER)};
   }).sort((a,b)=>b.correct-a.correct || a.submittedAt-b.submittedAt);
   let rank=ranked.findIndex(x=>phoneKey(String(x.v.phone||""))===key);
   rank=rank>=0?rank+1:"—";

   window.downloadParticipantMcqPdf=async()=>{
     const src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
     if(!window.jspdf)await new Promise((res,rej)=>{const z=document.createElement("script");z.src=src;z.onload=res;z.onerror=rej;document.head.appendChild(z)});
     const {jsPDF}=window.jspdf;
     const doc=new jsPDF({unit:"mm",format:"a4"});
     const W=210,M=14,RIGHT=W-M;
     let y=15;
     const navy=[22,53,92],blue=[37,99,235],green=[22,163,74],red=[220,38,38],gold=[245,158,11],light=[241,245,249],dark=[30,41,59],muted=[71,85,105];
     const safeText=v=>String(v??"");
     const pageHeader=()=>{
       doc.setFillColor(...navy);doc.rect(0,0,W,30,"F");
       doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(18);
       doc.text("MCQ EXAMINATION",M,12);
       doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text("PARTICIPANT RESULT",M,19);
       doc.setFontSize(8);doc.text(`Room: ${code}`,RIGHT,12,{align:"right"});
       doc.text("Official Result",RIGHT,19,{align:"right"});
       y=38;doc.setTextColor(...dark);
     };
     const ensure=need=>{if(y+need>281){doc.addPage();pageHeader();}};
     const text=(t,size=9,bold=false,color=dark,max=180)=>{
       doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);doc.setTextColor(...color);
       const lines=doc.splitTextToSize(safeText(t),max);
       ensure(lines.length*(size*0.42+2.2)+2);
       doc.text(lines,M,y);y+=lines.length*(size*0.42+2.2);
     };
     const card=(x,yy,w,h,label,value,color)=>{
       doc.setFillColor(248,250,252);doc.roundedRect(x,yy,w,h,3,3,"F");
       doc.setFillColor(...color);doc.roundedRect(x,yy,3,h,1.5,1.5,"F");
       doc.setTextColor(...muted);doc.setFont("helvetica","bold");doc.setFontSize(7);doc.text(label,x+7,yy+7);
       doc.setTextColor(...dark);doc.setFont("helvetica","bold");doc.setFontSize(14);doc.text(String(value),x+7,yy+15);
     };
     const resultBadge=(x,yy,label,color)=>{
       doc.setFillColor(...color);doc.roundedRect(x,yy,31,7,3.5,3.5,"F");
       doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(7);doc.text(label,x+15.5,yy+4.7,{align:"center"});
     };
     pageHeader();
     doc.setTextColor(...dark);doc.setFont("helvetica","bold");doc.setFontSize(14);doc.text(roomData.mcqTitle||"MCQ Examination",M,y);y+=7;
     const examName=rec.examName||rec.name||"Participant";
     const examDesignation=rec.examDesignation||rec.designation||"";
     const examPlace=rec.examPlaceOfPosting||rec.placeOfPosting||"";
     const examRoll=rec.rollNo||rec.phone||resultPhone;
     text(`Participant Name: ${examName}`,10,true,navy); 
     text(`${examDesignation||""}  •  ${examPlace||""}`,8,false,muted);
     text(`Roll No.: ${examRoll||""}  •  Submitted: ${rec.submittedAt?new Date(Number(rec.submittedAt)).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",hour12:true}):"—"} IST`,8,false,muted);
     y+=4;
     const gap=4,cw=(W-2*M-3*gap)/4;
     card(M,y,cw,21,"CORRECT",correct,green);card(M+cw+gap,y,cw,21,"WRONG",wrong,red);card(M+2*(cw+gap),y,cw,21,"UNANSWERED",unanswered,blue);card(M+3*(cw+gap),y,cw,21,"PERCENTAGE",pct.toFixed(1)+"%",gold);
     y+=27;
     doc.setFillColor(...navy);doc.roundedRect(M,y,W-2*M,27,4,4,"F");
     doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text("FINAL RANK",M+8,y+9);
     doc.setFontSize(21);doc.text(`#${rank}`,M+8,y+20);
     doc.setFontSize(9);doc.text(`SCORE  ${correct}/${qs.length}`,RIGHT-8,y+10,{align:"right"});
     doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text(`Percentage  ${pct.toFixed(2)}%`,RIGHT-8,y+18,{align:"right"});
     y+=34;
     text("QUESTION-WISE PERFORMANCE",11,true,navy);y+=2;
     details.forEach(d=>{
       const qLines=doc.splitTextToSize(`Q${d.no}. ${d.q.text}`,170);
       const a1=ansText(d.q,d.answer),a2=ansText(d.q,d.q.correct);
       const boxH=Math.max(28,qLines.length*4.2+20);
       ensure(boxH+4);
       const boxY=y;doc.setFillColor(...light);doc.roundedRect(M,boxY,W-2*M,boxH,3,3,"F");
       doc.setFillColor(...(d.result==="Correct"?green:d.result==="Wrong"?red:blue));doc.roundedRect(M,boxY,3,boxH,1.5,1.5,"F");
       doc.setTextColor(...dark);doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text(qLines,M+7,boxY+7);
       let yy=boxY+7+qLines.length*4.2;
       doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(...muted);
       doc.text(`Your Answer: ${a1}`,M+7,yy);yy+=5;
       doc.text(`Correct Answer: ${a2}`,M+7,yy);
       resultBadge(RIGHT-38,boxY+6,d.result,d.result==="Correct"?green:d.result==="Wrong"?red:blue);
       y=boxY+boxH+4;
     });
     doc.setDrawColor(203,213,225);doc.line(M,286,RIGHT,286);
     doc.setTextColor(...muted);doc.setFont("helvetica","normal");doc.setFontSize(7);
     doc.text("Generated electronically • National/Institutional Examination Result",M,291);
     doc.text(`Page ${doc.internal.getNumberOfPages()}`,RIGHT,291,{align:"right"});
     const totalPages=doc.internal.getNumberOfPages();
     for(let i=1;i<=totalPages;i++){doc.setPage(i);doc.setTextColor(...muted);doc.setFontSize(7);doc.text(`Page ${i} of ${totalPages}`,RIGHT,291,{align:"right"});}
     doc.save(`MCQ_${code}_Result.pdf`);
   };
   $("resultSummary").className="status";
   $("resultSummary").innerHTML=`<div style="font-size:22px;font-weight:800;color:#16355c;margin-bottom:8px">🏆 FINAL RANK: #${rank}</div><b>${safe(rec.name||p.name)}</b><br>Exam: <b>${safe(roomData.mcqTitle||"MCQ Examination")}</b><br>Room: <b>${code}</b><br>Run: <b>${safe(resultRunLabel)}</b><br>Correct: <b>${correct}</b> &nbsp; Wrong: <b>${wrong}</b> &nbsp; Unanswered: <b>${unanswered}</b><br>Total Marks: <b>${correct}/${qs.length}</b> &nbsp; Percentage: <b>${pct.toFixed(2)}%</b><br><button class="success" type="button" style="margin-top:10px" onclick="downloadParticipantMcqPdf()">📄 DOWNLOAD MY RESULT – PDF</button>`;
   return;
 }
 function findParticipant(obj){
   if(!obj)return null;
   if(obj[key])return obj[key];
   for(const [k,v] of Object.entries(obj)){
     if(v && phoneKey(String(v.phone||""))===key)return v;
   }
   return null;
 }
 function makeSummary(ps,answers,label){
   let correct=0,total=0;
   Object.keys(answers||{}).forEach(q=>{const a=answers[q]?.[key] || Object.values(answers[q]||{}).find(x=>x && phoneKey(String(x.phone||""))===key);if(a){total++;if(a.correct)correct++;}});
   // Use the participant identity stored when the exam was taken. A later Result-login name is ignored.
   const examName=ps.name||"Participant";
   const examPhone=ps.phone||resultPhone||"";
   const status=ps.disqualified?"Disqualified":ps.winner?`CONGRATULATION ! YOU HAVE WON THE PRIZE FOR QUESTION NUMBER ${esc(ps.winnerQuestion||"")}.`:ps.blocked?"Blocked":"Participant";
   return `<b>${esc(examName)}</b><br>Roll No.: <b>${esc(examPhone)}</b><br>Room: <b>${esc(code)}</b><br>${label?`Competition: <b>${esc(label)}</b><br>`:""}Answered: <b>${total}</b><br>Correct: <b>${correct}</b><br>Status: <b>${esc(status)}</b>${ps.winner?`<br>Winning Question: <b>Q${esc(ps.winnerQuestion||"")}</b>`:""}`;
 }
 const current=findParticipant(roomData.participants);
 if(current){ $("resultSummary").className="status"; $("resultSummary").innerHTML=makeSummary(current,roomData.answers||{},"Current competition"); return; }
 const runs=roomData.runs||{};
 const matches=[];
 for(const [runId,run] of Object.entries(runs)){
   const rp=findParticipant(run?.participants);
   if(rp)matches.push({runId,run,rp});
 }
 matches.sort((a,b)=>(Number(b.run?.closedAt)||0)-(Number(a.run?.closedAt)||0));
 if(matches.length){
   const m=matches[0];
   $("resultSummary").className="status";
   $("resultSummary").innerHTML=makeSummary(m.rp,m.run?.answers||{},`${m.run?.runDate||""}${m.run?.runStartedAt?` — ${new Date(Number(m.run.runStartedAt)).toLocaleTimeString("en-IN", {timeZone:"Asia/Kolkata", hour:"2-digit", minute:"2-digit", hour12:true})} IST`:""}`);
   return;
 }
 $("resultSummary").className="status";
 $("resultSummary").textContent="No result found for this participant in this room.";
};
// Printable academic report: browser print dialog can save directly as PDF.
document.addEventListener("click",event=>{
 const button=event.target.closest("#downloadStudentProgressReport");if(!button)return;
 const panel=$("studentAnalyticsContent");if(!panel)return;
 const reportWindow=window.open("","_blank","width=1000,height=800");
 if(!reportWindow){alert("Please allow pop-ups for this site to generate your PDF report.");return;}
 const profile=participantProfile||{};
 reportWindow.document.write(`<!doctype html><html><head><title>Academic Progress Report</title><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;color:#172033;margin:28px}h1,h2,h3{color:#17365d}button{display:none}#studentAnalyticsContent{display:block!important}#studentAnalyticsContent *{color:#172033!important;background-color:transparent!important;border-color:#ccd4df!important;box-shadow:none!important}#studentAnalyticsContent>div{break-inside:avoid;margin-bottom:14px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccd4df;padding:7px;text-align:left}small{color:#475569!important}@media print{body{margin:14mm}}</style></head><body><h1>Academic Progress Report</h1><p><b>Participant:</b> ${esc(profile.name||"")} &nbsp; <b>Designation:</b> ${esc(profile.designation||"")}<br><b>Place of Posting:</b> ${esc(profile.placeOfPosting||"")} &nbsp; <b>Email:</b> ${esc(authUser?.email||"")}<br><b>Generated:</b> ${new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</p><div id="studentAnalyticsContent">${panel.innerHTML.replace(/<button[\s\S]*?<\/button>/g,"")}</div><script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);
 reportWindow.document.close();
});
document.addEventListener("click",event=>{
 const button=event.target.closest("#printStudentStudyPlan");if(!button)return;
 const panel=button.closest("#studentAnalyticsContent");if(!panel)return;
 const planner=panel.querySelector("#printStudentStudyPlan")?.parentElement?.parentElement;
 if(!planner)return;
 const w=window.open("","_blank","width=900,height=700");if(!w)return;
 w.document.write(`<!doctype html><html><head><title>7-Day Study Plan</title><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;color:#172033;margin:24px}h3{color:#17365d}div[style*="grid-template-columns"]{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}div[style*="border-radius:10px"]{border:1px solid #ccd4df;padding:10px;margin:6px 0;break-inside:avoid}button{display:none}li{margin:5px 0}@media print{body{margin:12mm}}</style></head><body><h1>Personalised 7-Day Study Plan</h1>${planner.outerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script></body></html>`);w.document.close();
});
const analyticsRefreshButton=$("refreshStudentAnalytics");
if(analyticsRefreshButton){
 analyticsRefreshButton.addEventListener("click",async()=>{
  const user=auth.currentUser;
  const target=$("studentAnalyticsContent");
  if(!user||user.isAnonymous||!participantProfile||participantProfile.status!=="approved"){
   if(target)target.innerHTML='<p class="status blocked">Please sign in with your approved participant account to view your performance.</p>';
   return;
  }
  analyticsRefreshButton.disabled=true;
  try{await renderStudentAnalytics(user.uid);}
  catch(e){console.error("Manual student analytics refresh failed:",e);if(target)target.innerHTML=`<div class="status blocked">Unable to load your performance analysis: ${esc(e.message||e)}</div>`;}
  finally{analyticsRefreshButton.disabled=false;}
 });
}
const saved=JSON.parse(sessionStorage.getItem("quizParticipant")||"null"); if(saved)showDashboard(saved);
const autoResultParams=new URLSearchParams(location.search);
const autoResultRoom=String(autoResultParams.get("resultRoom")||"").trim().toUpperCase();
const autoResultPhone=String(autoResultParams.get("resultPhone")||"").trim();
if(autoResultRoom&&autoResultPhone){
  if(!saved){
    const temp={name:"Participant",designation:"",placeOfPosting:"",phone:autoResultPhone};
    sessionStorage.setItem("quizParticipant",JSON.stringify(temp));
    showDashboard(temp);
  }
  setTimeout(()=>{
    $("resultTab").click();
    $("resultRoomCode").value=autoResultRoom;
    $("resultPhoneNumber").value=autoResultPhone;
    $("viewResultBtn").click();
  },150);
}
$("submitBtn").onclick=async()=>{
 if(answered||!selected)return alert("Select an answer first.");answered=true;$("submitBtn").disabled=true;
 const r=(await get(ref(db,`rooms/${room}`))).val()||{};if(r.competitionClosed||r.state==="competition_closed")return $("result").textContent="🔒 Competition Closed.";if(r.state!=="open"||r.currentQuestion!==questionNo)return $("result").textContent="Answers are closed.";
 const p=(await get(ref(db,`rooms/${room}/participants/${studentKey}`))).val()||{};if(p.blocked||p.disqualified)return disable();
 const q=(await get(ref(db,`rooms/${room}/questions/q${questionNo}`))).val()||{};
 const elapsed=Math.max(0,Date.now()-Number(r.openedAt||Date.now()));
 const limitMs=Math.max(5,Number(r.timerSeconds||30))*1000;
 if(elapsed>limitMs){$("result").textContent="⏰ Time is over. Answers are closed.";return;}
 await update(ref(db,`rooms/${room}/answers/q${questionNo}/${studentKey}`),{studentKey,name:p.name,designation:p.designation,placeOfPosting:p.placeOfPosting,phone:p.phone,answer:selected,correct:selected===q.correct,elapsedMs:elapsed,serverReceivedAt:serverTimestamp(),eligible:!p.disqualified});$("result").textContent="Answer submitted. Waiting for host.";
};
$("connection").textContent="Ready to join";

// ---------------- Other Exam Result (externally conducted exams) ----------------
async function sha256Student(s){const b=new TextEncoder().encode(String(s));const h=await crypto.subtle.digest("SHA-256",b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function otherNormalizePhone(v){let s=String(v??"").trim().replace(/\D/g,"");if(s.length===10)return "+91"+s;if(s.length===12&&s.startsWith("91"))return "+"+s;return "";}
function otherSafe(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
let otherExamResults=[];
async function searchOtherExamResults(){const input=$("otherResultPhone"),msgEl=$("otherResultMsg"),cards=$("otherResultCards");const phone=otherNormalizePhone(input.value);if(!phone){msgEl.className="status blocked";msgEl.textContent="Please enter a valid 10-digit mobile number.";cards.innerHTML="";$("otherResultDownloadAll").classList.add("hidden");return;}try{msgEl.className="status";msgEl.textContent="Searching published results…";cards.innerHTML="";const hash=await sha256Student(phone.replace(/\D/g,""));const snap=await get(ref(db,`otherExamResults/${hash}`));const data=snap.val()||{};otherExamResults=Object.values(data).sort((a,b)=>String(a.examDate||"").localeCompare(String(b.examDate||"")));if(!otherExamResults.length){msgEl.className="status blocked";msgEl.textContent="No published Other Exam Result was found for this mobile number.";$("otherResultDownloadAll").classList.add("hidden");return;}msgEl.className="status live";msgEl.textContent=`✓ ${otherExamResults.length} result(s) found.`;cards.innerHTML=otherExamResults.map((r,i)=>`<div class="card" style="border-left:5px solid #7c3aed"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 style="margin-bottom:5px">${otherSafe(r.examName||"Other Examination")}</h3><div class="muted">Exam Date: <b>${otherSafe(r.examDate||"—")}</b> &nbsp; | &nbsp; Roll No: <b>${otherSafe(r.rollNo||"—")}</b></div></div><button class="success otherPdfBtn" data-index="${i}">📄 DOWNLOAD RESULT</button></div><div class="grid" style="margin-top:14px"><div><b>Name</b><div>${otherSafe(r.name||"—")}</div></div><div><b>Designation</b><div>${otherSafe(r.designation||"—")}</div></div><div><b>Place of Posting</b><div>${otherSafe(r.placeOfPosting||"—")}</div></div><div><b>Marks</b><div>${otherSafe(r.obtainedMarks||"—")} / ${otherSafe(r.totalMarks||"—")}</div></div><div><b>Percentage</b><div>${otherSafe(r.percentage||"—")}</div></div><div><b>Rank</b><div>${otherSafe(r.rank||"—")}</div></div><div><b>Result / Status</b><div><span class="badge green">${otherSafe(r.status||"—")}</span></div></div><div><b>Remarks</b><div>${otherSafe(r.remarks||"—")}</div></div></div></div>`).join("");document.querySelectorAll(".otherPdfBtn").forEach(b=>b.onclick=()=>downloadOtherResultPdf(otherExamResults[Number(b.dataset.index)]));$("otherResultDownloadAll").classList.toggle("hidden",otherExamResults.length<1);$("downloadOtherAllBtn").onclick=()=>downloadOtherAllPdf();}catch(e){console.error(e);msgEl.className="status blocked";msgEl.textContent=`Unable to search result: ${e.message||e}`;}}
async function loadJsPdf(){if(window.jspdf)return;await new Promise((res,rej)=>{const z=document.createElement("script");z.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";z.onload=res;z.onerror=rej;document.head.appendChild(z)});}
function pdfText(doc,text,x,y,max=180,size=9,bold=false){doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);const lines=doc.splitTextToSize(String(text??""),max);doc.text(lines,x,y);return y+lines.length*(size*0.42+2.2);}
async function downloadOtherResultPdf(r){try{await loadJsPdf();const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a4"});const W=210,M=14;doc.setFillColor(59,7,100);doc.rect(0,0,W,32,"F");doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(18);doc.text("OTHER EXAMINATION RESULT",M,13);doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text("Published Result — Separate from Portal Examinations",M,21);let y=43;doc.setTextColor(30,41,59);doc.setFont("helvetica","bold");doc.setFontSize(15);doc.text(String(r.examName||"Other Examination"),M,y);y+=9;const rows=[["Exam Date",r.examDate||"—"],["Publication ID",r.publicationId||"—"],["Roll No",r.rollNo||"—"],["Name",r.name||"—"],["Designation",r.designation||"—"],["Place of Posting",r.placeOfPosting||"—"],["Total Marks",r.totalMarks||"—"],["Obtained Marks",r.obtainedMarks||"—"],["Percentage",r.percentage||"—"],["Rank",r.rank||"—"],["Result / Status",r.status||"—"],["Remarks",r.remarks||"—"]];for(const [lab,val] of rows){doc.setFillColor(248,250,252);doc.roundedRect(M,y-5,W-2*M,11,2,2,"F");doc.setTextColor(71,85,105);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text(lab,M+5,y+1);doc.setTextColor(30,41,59);doc.setFont("helvetica",lab==="Result / Status"?"bold":"normal");doc.setFontSize(10);doc.text(String(val),M+55,y+1);y+=14;if(y>275){doc.addPage();y=20;}}doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(100,116,139);doc.text(`Downloaded on ${new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST`,M,289);const safe=String(r.name||"Result").replace(/[^a-z0-9]+/gi,"_");doc.save(`Other_Exam_Result_${safe}_${r.publicationId||""}.pdf`);}catch(e){alert(`PDF generation failed: ${e.message||e}`);}}
async function downloadOtherAllPdf(){if(!otherExamResults.length)return;try{await loadJsPdf();const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a4"});otherExamResults.forEach((r,idx)=>{if(idx)doc.addPage();const W=210,M=14;doc.setFillColor(59,7,100);doc.rect(0,0,W,32,"F");doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(18);doc.text("OTHER EXAMINATION RESULT",M,13);doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text("Published Result",M,21);let y=43;doc.setTextColor(30,41,59);doc.setFont("helvetica","bold");doc.setFontSize(15);doc.text(String(r.examName||"Other Examination"),M,y);y+=9;const rows=[["Exam Date",r.examDate||"—"],["Publication ID",r.publicationId||"—"],["Roll No",r.rollNo||"—"],["Name",r.name||"—"],["Designation",r.designation||"—"],["Place of Posting",r.placeOfPosting||"—"],["Total Marks",r.totalMarks||"—"],["Obtained Marks",r.obtainedMarks||"—"],["Percentage",r.percentage||"—"],["Rank",r.rank||"—"],["Result / Status",r.status||"—"],["Remarks",r.remarks||"—"]];for(const [lab,val] of rows){doc.setFillColor(248,250,252);doc.roundedRect(M,y-5,W-2*M,11,2,2,"F");doc.setTextColor(71,85,105);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text(lab,M+5,y+1);doc.setTextColor(30,41,59);doc.setFont("helvetica",lab==="Result / Status"?"bold":"normal");doc.setFontSize(10);doc.text(String(val),M+55,y+1);y+=14;}});doc.save("Other_Exam_Results.pdf");}catch(e){alert(`PDF generation failed: ${e.message||e}`);}}
function showOtherResultPanel(){$("portalResultLookup").classList.add("hidden");$("otherResultLookup").classList.remove("hidden");$("otherResultPhone").focus();}
function showPortalResultPanel(){$("otherResultLookup").classList.add("hidden");$("portalResultLookup").classList.remove("hidden");}
$("otherResultAssignment")?.addEventListener("click",()=>{showDashboard(JSON.parse(sessionStorage.getItem("quizParticipant")||"{}"));$("resultTab").click();showOtherResultPanel();});
$("otherResultCard")?.addEventListener("click",showOtherResultPanel);
$("portalResultCard")?.addEventListener("click",showPortalResultPanel);
$("searchOtherResultBtn")?.addEventListener("click",searchOtherExamResults);
$("otherResultPhone")?.addEventListener("keydown",e=>{if(e.key==="Enter")searchOtherExamResults();});
