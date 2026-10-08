import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getDatabase(app);
const $=id=>document.getElementById(id), ADMIN="ramkrishnadeinv.01@gmail.com";
let uid=null, room="", questions=[];
const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;"," ":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function msg(t,cls=""){ $("msg").textContent=t; $("msg").className="status "+cls; }
function isAdmin(u){return String(u?.email||"").toLowerCase()===ADMIN;}
async function access(u){if(!u)return false;if(isAdmin(u))return true;const s=await get(ref(db,`hosts/${u.uid}`));return s.exists()&&s.val()?.status==="approved";}
function code(){let x="";for(let i=0;i<6;i++)x+=chars[Math.floor(Math.random()*chars.length)];return x;}
function renderQuestions(){const n=Math.max(1,Math.min(100,Number($("count").value||10)));questions=Array.from({length:n},(_,i)=>questions[i]||{text:"",options:{A:"",B:"",C:"",D:""},correct:"A"});$("questions").innerHTML=questions.map((q,i)=>`<div class="qbox"><h3>Question ${i+1}</h3><div class="field"><label>Question *</label><textarea id="q_${i}" rows="3" style="width:100%;box-sizing:border-box">${esc(q.text)}</textarea></div><div class="qgrid"><div class="field"><label>A *</label><input id="a_${i}" value="${esc(q.options.A)}"></div><div class="field"><label>B *</label><input id="b_${i}" value="${esc(q.options.B)}"></div><div class="field"><label>C *</label><input id="c_${i}" value="${esc(q.options.C)}"></div><div class="field"><label>D *</label><input id="d_${i}" value="${esc(q.options.D)}"></div><div class="field"><label>Correct Answer *</label><select id="cans_${i}"><option>A</option><option>B</option><option>C</option><option>D</option></select></div></div></div>`).join("");questions.forEach((q,i)=>$("cans_"+i).value=q.correct||"A");}
function collect(){return questions.map((_,i)=>({text:$("q_"+i).value.trim(),options:{A:$("a_"+i).value.trim(),B:$("b_"+i).value.trim(),C:$("c_"+i).value.trim(),D:$("d_"+i).value.trim()},correct:$("cans_"+i).value}));}
function fmt(ts){if(!ts)return "—";return new Date(Number(ts)).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"})+" IST";}
function setModeUI(){const auto=$("autoMode").checked;$("scheduleBox").classList.toggle("hidden",!auto);$("manualStartBtn").classList.toggle("hidden",auto);$("scheduleBtn").classList.toggle("hidden",!auto);}
function statusText(r){return String(r?.examStatus||"NOT STARTED").toUpperCase();}
async function refreshRooms(){const snap=await get(ref(db,"rooms"));const sel=$("roomSelect");sel.innerHTML='<option value="">-- Select existing MCQ room --</option>';if(snap.exists()){const rooms=snap.val()||{};Object.entries(rooms).filter(([k,r])=>r&&r.examType==="mcq").sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0)).forEach(([k,r])=>{const o=document.createElement("option");o.value=k;o.textContent=`${k} — ${r.mcqTitle||r.title||"MCQ Exam"} — ${statusText(r)}`;sel.appendChild(o);});}msg("MCQ rooms refreshed.","live");}
async function loadRoom(){const c=$("roomSelect").value;if(!c){alert("Please select an MCQ room.");return;}const s=await get(ref(db,`rooms/${c}`));if(!s.exists()){alert("Room not found.");return;}const r=s.val();if(r.examType!=="mcq"){alert("This is not an MCQ room.");return;}room=c;$("roomCode").textContent=room;$("setup").classList.remove("hidden");$("title").value=r.mcqTitle||r.title||"MCQ Examination";$("minutes").value=Math.max(1,Math.round(Number(r.mcqTimeSeconds||1800)/60));const qs=r.mcqQuestions||{};questions=Object.keys(qs).sort((a,b)=>Number(a.slice(1))-Number(b.slice(1))).map(k=>qs[k]);$("count").value=questions.length||10;renderQuestions();renderControl(r);msg(`Loaded room ${room}.`,"live");}
function renderControl(r){$("statusValue").textContent=statusText(r);$("scheduleInfo").textContent=r.scheduledStartAt?`Scheduled: ${fmt(r.scheduledStartAt)} | Duration: ${Math.round(Number(r.durationSeconds||r.mcqTimeSeconds||0)/60)} min`:"No automatic schedule set.";$("manualStartBtn").disabled=["LIVE","CLOSED"].includes(statusText(r));$("scheduleBtn").disabled=["LIVE","CLOSED"].includes(statusText(r));$("cancelScheduleBtn").disabled=statusText(r)!=="SCHEDULED";$("closeExamBtn").disabled=statusText(r)!=="LIVE";}
async function create(){if(!uid||!(await access(auth.currentUser))){alert("Please sign in as an approved host first.");return;}try{const title=$("title").value.trim()||"MCQ Examination",minutes=Number($("minutes").value||30),count=Number($("count").value||10);let c;do{c=code();}while((await get(ref(db,`rooms/${c}`))).exists());room=c;await set(ref(db,`rooms/${room}`),{hostUid:uid,title,examType:"mcq",mcqTitle:title,mcqTimeSeconds:minutes*60,mcqQuestions:{},createdAt:Date.now(),runDate:new Date().toISOString().slice(0,10),examStatus:"NOT STARTED",startMode:"manual"});$("roomCode").textContent=room;$("setup").classList.remove("hidden");if(!questions.length){renderQuestions();}else{$("count").value=questions.length;renderQuestions();}renderControl({examStatus:"NOT STARTED",mcqTimeSeconds:minutes*60});await refreshRooms();msg(`Room ${room} created. Enter questions and save the exam.`,`live`);}catch(e){console.error(e);msg(`Room creation failed: ${e?.message||e}`,"blocked");alert("Unable to create the MCQ room.\n\n"+(e?.message||"Permission denied."));}}
async function save(){if(!room){alert("Create or load an MCQ room first.");return;}try{const qs=collect();for(let i=0;i<qs.length;i++)if(!qs[i].text||Object.values(qs[i].options).some(v=>!v)){alert(`Please complete Question ${i+1}.`);return;}const minutes=Number($("minutes").value||30);await update(ref(db,`rooms/${room}`),{mcqTitle:$("title").value.trim()||"MCQ Examination",mcqTimeSeconds:minutes*60,mcqQuestions:Object.fromEntries(qs.map((q,i)=>[`q${i+1}`,q])),examType:"mcq",updatedAt:Date.now()});msg(`MCQ Exam saved successfully. Room Code: ${room}`,"live");await refreshRooms();}catch(e){console.error(e);msg(`Save failed: ${e?.message||e}`,"blocked");alert("MCQ Exam could not be saved.\n\n"+(e?.message||"Permission denied."));}}
async function startManual(){if(!room)return;const s=await get(ref(db,`rooms/${room}`));if(!s.exists())return;const r=s.val();if(["LIVE","CLOSED"].includes(statusText(r))){alert("This exam cannot be started in its current status. Use RESTART EXAM for a fresh run.");return;}const now=Date.now();await remove(ref(db,`rooms/${room}/mcqAnswers`));await remove(ref(db,`rooms/${room}/mcqLive`));const runId=String(now);await update(ref(db,`rooms/${room}`),{examStatus:"LIVE",startMode:"manual",startedAt:now,runId,scheduledStartAt:null,scheduledEndAt:null,closedAt:null});renderControl({...r,examStatus:"LIVE",startedAt:now,runId});msg("MCQ exam is now LIVE. Participants can see questions now.","live");}
async function schedule(){if(!room)return alert("Select or create a room first.");const date=$("date").value,time=$("time").value,dur=Number($("duration").value||30);if(!date||!time||dur<1)return alert("Enter date, time and duration.");const start=new Date(`${date}T${time}:00+05:30`).getTime();if(start<=Date.now())return alert("Choose a future IST date and time.");const s=await get(ref(db,`rooms/${room}`));const r=s.val()||{};if(["SCHEDULED","LIVE","CLOSED"].includes(statusText(r))&&statusText(r)!=="SCHEDULED")return alert("This room cannot be scheduled in its current status.");const end=start+dur*60000;await update(ref(db,`rooms/${room}`),{examStatus:"SCHEDULED",startMode:"automatic",scheduledStartAt:start,scheduledEndAt:end,durationSeconds:dur*60});renderControl({...r,examStatus:"SCHEDULED",scheduledStartAt:start,durationSeconds:dur*60});msg(`Exam scheduled for ${fmt(start)}.`,"live");}
async function cancelSchedule(){if(!room)return;const s=await get(ref(db,`rooms/${room}`));if(!s.exists())return;await update(ref(db,`rooms/${room}`),{examStatus:"NOT STARTED",startMode:"manual",scheduledStartAt:null,scheduledEndAt:null,durationSeconds:null});renderControl({...s.val(),examStatus:"NOT STARTED"});msg("Automatic schedule cancelled.","live");}
async function closeExam(){if(!room)return;await update(ref(db,`rooms/${room}`),{examStatus:"CLOSED",closedAt:Date.now()});const s=await get(ref(db,`rooms/${room}`));renderControl(s.val());msg("MCQ exam closed. Results are now frozen.","live");}
async function restartExam(){if(!room)return;const s=await get(ref(db,`rooms/${room}`));if(!s.exists())return;const r=s.val();const ok1=confirm("RESTART EXAM? The current live answers/results will be cleared from the active run. The old run will be kept in room history. Continue?");if(!ok1)return;const ok2=confirm("FINAL CONFIRMATION: Start a completely fresh run now using the same room code?");if(!ok2)return;const oldRun=String(r.runId||r.startedAt||Date.now());const oldData={runId:oldRun,archivedAt:Date.now(),examStatus:r.examStatus||"",startedAt:r.startedAt||null,closedAt:r.closedAt||null,mcqAnswers:r.mcqAnswers||{},mcqLive:r.mcqLive||{}};await update(ref(db,`rooms/${room}/mcqHistory/${oldRun}`),oldData);await remove(ref(db,`rooms/${room}/mcqAnswers`));await remove(ref(db,`rooms/${room}/mcqLive`));const now=Date.now(),newRun=String(now);await update(ref(db,`rooms/${room}`),{examStatus:"LIVE",startMode:"manual",startedAt:now,runId:newRun,scheduledStartAt:null,scheduledEndAt:null,closedAt:null,restartedAt:now});renderControl({...r,examStatus:"LIVE",startedAt:now,runId:newRun});msg("MCQ exam RESTARTED. A fresh run is now LIVE.","live");if(typeof startMonitor==='function')startMonitor();}
async function poll(){if(!room)return;const s=await get(ref(db,`rooms/${room}`));if(!s.exists())return;const r=s.val(),now=Date.now();if(statusText(r)==="SCHEDULED"&&Number(r.scheduledStartAt)<=now){await update(ref(db,`rooms/${room}`),{examStatus:"LIVE",startedAt:Number(r.scheduledStartAt)});r.examStatus="LIVE";r.startedAt=Number(r.scheduledStartAt);}if(statusText(r)==="LIVE"&&r.scheduledEndAt&&Number(r.scheduledEndAt)<=now){await update(ref(db,`rooms/${room}`),{examStatus:"CLOSED",closedAt:Number(r.scheduledEndAt)});r.examStatus="CLOSED";}renderControl(r);}
$("createBtn").onclick=create;$("saveBtn").onclick=save;$("count").onchange=renderQuestions;$("refreshBtn").onclick=refreshRooms;$("loadBtn").onclick=loadRoom;$("backBtn").onclick=()=>location.href="host.html";$("manualStartBtn").onclick=startManual;$("scheduleBtn").onclick=schedule;$("cancelScheduleBtn").onclick=cancelSchedule;$("closeExamBtn").onclick=closeExam;$("manualMode").onchange=setModeUI;$("autoMode").onchange=setModeUI;setModeUI();setInterval(poll,5000);

function downloadMCQTemplate(){
  const a=document.createElement("a");
  a.href="./MCQ_Questions_Upload_Template.xlsx";
  a.download="MCQ_Questions_Upload_Template.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function clearQuestions(){
  if(!confirm("Clear the MCQ questions currently loaded in the editor?"))return;
  questions=[];
  $("count").value=10;
  renderQuestions();
  if($("uploadStatus"))$("uploadStatus").textContent="Question editor cleared. You can upload a new Excel file.";
  msg("Question editor cleared.","live");
}
function parseUploadedMCQRows(rows){
  const norm=s=>String(s??"").trim().toLowerCase().replace(/[\\s_]+/g," ");
  const find=(row,names)=>{
    const keys=Object.keys(row),target=names.map(norm);
    const k=keys.find(x=>target.includes(norm(x)));
    return k===undefined?"":row[k];
  };
  const out=[];
  for(let idx=0;idx<rows.length;idx++){
    const r=rows[idx]||{};
    const text=String(find(r,["Question","Question Text","MCQ Question"])).trim();
    const A=String(find(r,["Option A","A"])).trim();
    const B=String(find(r,["Option B","B"])).trim();
    const C=String(find(r,["Option C","C"])).trim();
    const D=String(find(r,["Option D","D"])).trim();
    const correct=String(find(r,["Correct Answer","Answer","Correct"])).trim().toUpperCase();
    if(!text&&!A&&!B&&!C&&!D&&!correct)continue;
    if(!text||!A||!B||!C||!D||!["A","B","C","D"].includes(correct)){
      throw new Error(`Invalid data in Excel row ${idx+2}. Each row must contain Question, Options A-D and Correct Answer (A/B/C/D).`);
    }
    out.push({text,options:{A,B,C,D},correct});
  }
  return out;
}
async function handleMCQUpload(file){
  if(!file)return;
  if(typeof XLSX==="undefined"){
    alert("Excel upload library could not be loaded. Please refresh the page and try again.");
    return;
  }
  try{
    if($("uploadStatus"))$("uploadStatus").textContent="Reading Excel file…";
    const data=await file.arrayBuffer();
    const wb=XLSX.read(data,{type:"array"});
    const sheetName=wb.SheetNames.find(n=>/mcq|question/i.test(n))||wb.SheetNames[0];
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:""});
    if(!rows.length)throw new Error("The selected Excel sheet contains no question rows.");
    const imported=parseUploadedMCQRows(rows);
    if(!imported.length)throw new Error("No valid MCQ questions were found.");
    if(imported.length>100)throw new Error("Maximum 100 questions can be uploaded at one time.");
    if(!confirm(`Found ${imported.length} MCQ question(s). Load these questions into the editor?`))return;
    questions=imported;
    $("count").value=imported.length;
    renderQuestions();
    if($("uploadStatus"))$("uploadStatus").textContent=`${imported.length} MCQ question(s) loaded successfully. Create/select an exam room and click Save MCQ Exam.`;
    msg(`${imported.length} MCQ question(s) loaded from Excel.`,"live");
  }catch(e){
    console.error(e);
    if($("uploadStatus"))$("uploadStatus").textContent="Upload failed. Please use the official MCQ template.";
    alert("MCQ Excel upload failed.\n\n"+(e?.message||"Please use the official template and try again."));
  }finally{
    $("mcqFile").value="";
  }
}

onAuthStateChanged(auth,async u=>{uid=u?.uid||null;$("authStatus").textContent=u?`Signed in: ${u.email}`:"Not signed in";if(!u||!(await access(u))){msg("Host approval is required before managing MCQ exams.","blocked");$("createBtn").disabled=true;$("refreshBtn").disabled=true;$("loadBtn").disabled=true;}else{await refreshRooms();msg("Approved host. Select an existing room or create a new MCQ exam.","live");}});


// v70 — Direct room opening for athlete-wise live MCQ monitoring
async function openRoomFromQuery(){
  const params=new URLSearchParams(location.search);
  const qRoom=(params.get("room")||"").toUpperCase();
  if(!qRoom)return;
  const sel=$("roomSelect");
  if(sel){
    let option=[...sel.options].find(o=>o.value===qRoom);
    if(!option){await refreshRooms(); option=[...sel.options].find(o=>o.value===qRoom);}
    if(option){sel.value=qRoom; await loadRoom();}
    else msg(`MCQ room ${qRoom} was not found or you do not have access to it.`,"blocked");
  }
}

// v33 — Live race-style MCQ monitoring + Excel export
let monitorUnsub=null, monitorRows=[], monitorFrozen=false, lastRoomSnapshot=null;
const esc2=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function first(o,keys,d=""){for(const k of keys){if(o&&o[k]!==undefined&&o[k]!==null&&o[k]!=="")return o[k];}return d;}
function looksParticipant(o){if(!o||typeof o!=="object"||Array.isArray(o))return false;return !!first(o,["name","participantName","fullName","studentName","mobile","mobileNumber","phone"]);}
function walkParticipantObjects(node,path=[],out=[]){if(!node||typeof node!=="object")return out;if(Array.isArray(node)){node.forEach((v,i)=>walkParticipantObjects(v,path.concat(i),out));return out;}if(looksParticipant(node))out.push({o:node,path});for(const [k,v] of Object.entries(node)){if(k!=="mcqQuestions"&&k!=="questions")walkParticipantObjects(v,path.concat(k),out);}return out;}
function collectAnswerObjects(node,path=[],out=[]){if(!node||typeof node!=="object")return out;if(Array.isArray(node)){node.forEach((v,i)=>collectAnswerObjects(v,path.concat(i),out));return out;}const keys=Object.keys(node);const answerish=keys.some(k=>["answer","selectedAnswer","selected","choice","option","submittedAt","timeTaken","isCorrect","correct"].includes(k));if(answerish)out.push({o:node,path});for(const [k,v] of Object.entries(node))collectAnswerObjects(v,path.concat(k),out);return out;}
function normStatus(p){if(p.disqualified||p.isDisqualified||String(p.status||"").toLowerCase().includes("disqual"))return "DISQUALIFIED";if(p.blocked||p.isBlocked||String(p.status||"").toLowerCase().includes("block"))return "BLOCKED";if(p.submitted||p.isSubmitted)return "SUBMITTED";if(p.online===false||p.isOnline===false)return "IDLE";return "LIVE";}
function participantId(p,path){return String(first(p,["participantId","studentId","id","uid","mobile","mobileNumber","phone"],path.join("/")||"participant"));}
function buildMonitorRows(roomData){
 const qmap=roomData?.mcqQuestions||{};
 const sources=[];
 for(const k of ["mcqLive","mcqAnswers"]){const root=roomData?.[k];if(root&&typeof root==="object")for(const [id,v] of Object.entries(root))if(v&&typeof v==="object")sources.push({id,v,source:k});}
 const byId=new Map();
 for(const x of sources){const prev=byId.get(x.id);if(!prev||x.source==="mcqLive")byId.set(x.id,x);}
 const rows=[];
 for(const [id,x] of byId){const p=x.v||{},ans=p.answers||{};let correct=0,wrong=0,answered=0,totalTime=Number(p.timeTakenSeconds||p.timeTaken||0);let current=Number(p.currentQuestion||0);
  for(const [qid,a0] of Object.entries(ans)){const a=String(a0||"").toUpperCase();if(!a)continue;answered++;const q=qmap[qid]||{};if(a===String(q.correct||"").toUpperCase())correct++;else wrong++;}
  if(!answered&&Number(p.answeredCount||0)>0)answered=Number(p.answeredCount);
  if(!correct&&Number.isFinite(Number(p.correctCount)))correct=Number(p.correctCount);
  if(!wrong&&Number.isFinite(Number(p.wrongCount)))wrong=Number(p.wrongCount);
  const status=String(p.status||"").toUpperCase()==="SUBMITTED"?"SUBMITTED":(String(p.status||"").toUpperCase()==="DISQUALIFIED"?"DISQUALIFIED":(String(p.status||"").toUpperCase()==="BLOCKED"?"BLOCKED":"LIVE"));
  const name=String(first(p,["name","participantName","fullName","studentName"],id));
  rows.push({id,name,answered,corr:correct,wrong,accuracy:answered?Math.round(correct/answered*10000)/100:0,time:totalTime,current:current?String(current):"—",status});
 }
 rows.sort((a,b)=>b.corr-a.corr || a.time-b.time || a.name.localeCompare(b.name));rows.forEach((r,i)=>r.rank=i+1);return rows;
}
function renderMonitor(rows,roomData){monitorRows=rows; const body=$("monitorBody"); if(!body)return; body.innerHTML=rows.map(r=>`<tr class="${r.rank===1?"rank1":""}"><td><b>${r.rank}</b></td><td>${esc2(r.name)}</td><td>${r.answered}</td><td>${r.corr}</td><td>${r.wrong}</td><td>${r.accuracy.toFixed(2)}%</td><td>${r.time? r.time.toFixed(3)+" sec":"—"}</td><td>${esc2(r.current)}</td><td>${r.status}</td></tr>`).join("")||'<tr><td colspan="9">No participant data detected yet.</td></tr>';$('monParticipants').textContent=rows.length;$('monAnswered').textContent=rows.reduce((s,r)=>s+r.answered,0);$('monQuestion').textContent=first(roomData,["currentQuestion","currentQuestionNo","currentQ"],"—");$('monStatus').textContent=statusText(roomData);}
function exportMonitor(final=false){if(!monitorRows.length){alert("There is no participant result data to export yet.");return;}if(typeof XLSX==="undefined"){alert("Excel export library could not be loaded. Please check your internet connection and try again.");return;}const data=monitorRows.map(r=>({Rank:r.rank,Participant:r.name,Answered:r.answered,Correct:r.corr,Wrong:r.wrong,Accuracy:r.accuracy+"%","Time Taken":r.time? r.time.toFixed(3)+" sec":"—","Current Question":r.current,Status:r.status}));const ws=XLSX.utils.json_to_sheet(data);ws["!cols"]=[{wch:8},{wch:28},{wch:12},{wch:10},{wch:9},{wch:12},{wch:16},{wch:18},{wch:18}];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,final?"Final Result":"Live Result");XLSX.writeFile(wb,`MCQ_${room}_${final?"Final":"Live"}_Result.xlsx`);}
function startMonitor(){if(!room)return;if(monitorUnsub)monitorUnsub();monitorFrozen=false;$("monitor").classList.remove("hidden");monitorUnsub=onValue(ref(db,`rooms/${room}`),snap=>{const r=snap.val();if(!r)return;lastRoomSnapshot=r;const st=statusText(r);if(st==="LIVE"&&monitorFrozen)monitorFrozen=false;if(monitorFrozen)return;renderMonitor(buildMonitorRows(r),r);if(st==="CLOSED"){monitorFrozen=true;renderMonitor(monitorRows,r);$("monitorNote").textContent="Exam closed — final monitoring board frozen.";}else if(st==="NOT STARTED"||st==="SCHEDULED"){$("monitorNote").textContent="Waiting for Host to start the exam. Participant questions are locked.";}else $("monitorNote").textContent="Live updates are active. No page refresh is required.";});}
$("liveExportBtn").onclick=()=>exportMonitor(false);$("finalExportBtn").onclick=()=>exportMonitor(true);$("restartExamBtn").onclick=restartExam;
const _oldLoad=loadRoom; loadRoom=async function(){await _oldLoad();startMonitor();};
const _oldCreate=create; create=async function(){await _oldCreate();startMonitor();};
// Rebind buttons after wrapping the handlers so the new monitoring hook is used.
$("loadBtn").onclick=loadRoom; $("createBtn").onclick=create;

// v67 — Bulk MCQ Excel upload and downloadable template
$("downloadTemplateBtn").onclick=downloadMCQTemplate;$("uploadBtn").onclick=()=>$("mcqFile").click();$("mcqFile").addEventListener("change",e=>handleMCQUpload(e.target.files?.[0]));$("clearQuestionsBtn").onclick=clearQuestions;

setTimeout(()=>openRoomFromQuery().catch(e=>console.error(e)),400);
