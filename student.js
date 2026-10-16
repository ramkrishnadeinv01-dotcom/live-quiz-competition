import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, get, runTransaction, update, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig),db=getDatabase(app);
const $=id=>document.getElementById(id);
let room="",studentKey="",selected="",questionNo=0,openedAt=0,answered=false,timer,violationCount=0,lastViolationAt=0;
let questionTimerSeconds=30;
const opts=["A","B","C","D"];
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function msg(t,cls=""){$("joinMsg").textContent=t;$("joinMsg").className=cls;}
function normalizePhone(v){v=v.trim().replace(/[\s()-]/g,"");if(/^\+91\d{10}$/.test(v))return v;if(/^91\d{10}$/.test(v))return "+"+v;if(/^\d{10}$/.test(v))return "+91"+v;return "";}
function phoneKey(phone){return phone.replace(/\D/g,"");}
async function join(){
 room=$("roomCodeInput").value.trim().toUpperCase();
 const phone=normalizePhone($("phoneNumber").value);
 const name=$("studentName").value.trim();
 const designation=$("designation").value.trim();
 const placeOfPosting=$("placeOfPosting").value.trim();
 if(!room||!/^[A-Z0-9]{6}$/.test(room))return msg("Enter the 6-character room code.");
 if(!phone)return msg("Enter a valid 10-digit Indian mobile number.");
 if(!name||!designation||!placeOfPosting)return msg("Please fill Name, Designation and Place of Posting.");
 const rs=await get(ref(db,`rooms/${room}`));
 if(!rs.exists())return msg("Room not found.");
 const r=rs.val();
 if(r.state==="finished")return msg("This quiz has already finished.");
 studentKey=phoneKey(phone);
 const pRef=ref(db,`rooms/${room}/participants/${studentKey}`);
 const result=await runTransaction(pRef,current=>{
   if(current===null){
     return {studentKey,phone,name,designation,placeOfPosting,blocked:false,winner:false,disqualified:false,violationCount:0,joinedAt:{".sv":"timestamp"}};
   }
   // A host-unblocked disqualified participant may return to the same quiz.
   // Ordinary repeat participation remains blocked by the one-mobile-number rule.
   if(current.canRejoin===true && !current.blocked && !current.disqualified && !current.winner){
     const next={...current,studentKey,phone,name,designation,placeOfPosting,canRejoin:false,lastRejoinedAt:{".sv":"timestamp"}};
     return next;
   }
   return;
 });
 if(!result.committed)return msg("This mobile number has already participated in this quiz. You cannot join again.");
 $("joinCard").classList.add("hidden");$("quizCard").classList.remove("hidden");
 $("title").textContent=r.title||"Live Quiz";$("room").textContent=room;
 $("connection").textContent="Connected";startAntiCheat();requestFullScreen();listen();
}
function requestFullScreen(){const el=document.documentElement;const fn=el.requestFullscreen||el.webkitRequestFullscreen||el.msRequestFullscreen;if(fn)Promise.resolve(fn.call(el)).catch(()=>{});}
async function recordViolation(type){
 const now=Date.now();if(now-lastViolationAt<1200||!room||!studentKey)return;lastViolationAt=now;violationCount++;
 const p=await get(ref(db,`rooms/${room}/participants/${studentKey}`));if(!p.exists())return;
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
 onValue(ref(db,`rooms/${room}`),async s=>{const r=s.val()||{};const p=(await get(ref(db,`rooms/${room}/participants/${studentKey}`))).val()||{};
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
$("joinBtn").onclick=join;
$("submitBtn").onclick=async()=>{
 if(answered||!selected)return alert("Select an answer first.");answered=true;$("submitBtn").disabled=true;
 const r=(await get(ref(db,`rooms/${room}`))).val()||{};if(r.state!=="open"||r.currentQuestion!==questionNo)return $("result").textContent="Answers are closed.";
 const p=(await get(ref(db,`rooms/${room}/participants/${studentKey}`))).val()||{};if(p.blocked||p.disqualified)return disable();
 const q=(await get(ref(db,`rooms/${room}/questions/q${questionNo}`))).val()||{};
 const elapsed=Math.max(0,Date.now()-Number(r.openedAt||Date.now()));
 const limitMs=Math.max(5,Number(r.timerSeconds||30))*1000;
 if(elapsed>limitMs){$("result").textContent="⏰ Time is over. Answers are closed.";return;}
 await update(ref(db,`rooms/${room}/answers/q${questionNo}/${studentKey}`),{studentKey,name:p.name,designation:p.designation,placeOfPosting:p.placeOfPosting,phone:p.phone,answer:selected,correct:selected===q.correct,elapsedMs:elapsed,serverReceivedAt:serverTimestamp(),eligible:!p.disqualified});$("result").textContent="Answer submitted. Waiting for host.";
};
$("connection").textContent="Ready to join";

// Hindi Pakhwada personalised marksheet lookup and two-page PDF generation
let currentHindiResult=null;
const resultPhoneKey=v=>{let d=String(v??'').replace(/\D/g,'');if(d.length===12&&d.startsWith('91'))d=d.slice(2);return d.length===10?d:'';};
const resultEscape=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function resultText(r,keys){for(const k of keys){if(r[k]!==undefined&&r[k]!==null&&String(r[k]).trim()!=='')return String(r[k]);}return '';}
function showHindiResult(r){currentHindiResult=r;$('hindiResultDetails').classList.remove('hidden');const total=resultText(r,['total'])||['typing','translation','noting','essay','proofreading'].reduce((n,k)=>n+(Number(r[k])||0),0);$('hindiResultSummary').innerHTML=`<b>${resultEscape(r.name||'Participant')}</b><br>Roll No.: ${resultEscape(r.rollNumber||'—')}<br>Total Marks: <b>${resultEscape(total)} / 250</b><br>Remarks: ${resultEscape(r.remarks||'—')}`;$('hindiResultMsg').textContent='Result found. You can now download your marksheet.';}
$('findHindiResultBtn')?.addEventListener('click',async()=>{const phone=resultPhoneKey($('hindiResultPhone').value);$('hindiResultDetails').classList.add('hidden');currentHindiResult=null;if(!phone){$('hindiResultMsg').textContent='Please enter a valid 10-digit Indian mobile number.';return;}$('hindiResultMsg').textContent='Searching…';try{const snap=await get(ref(db,`hindiPakhwadaResults/${phone}`));if(!snap.exists()){$('hindiResultMsg').textContent='No result found for this mobile number. Please check the number or contact the organiser.';return;}showHindiResult(snap.val());}catch(e){$('hindiResultMsg').textContent='Unable to retrieve the result. The organiser may need to update Firebase Database Rules.';}});
function fieldStyle(left,top,width,font=15,align='left'){return `position:absolute;left:${left}%;top:${top}%;width:${width}%;font-size:${font}px;line-height:1.1;text-align:${align};color:#172b54;font-weight:600;overflow:hidden;white-space:nowrap;`}
function makeHindiPage(r){const div=document.createElement('div');div.style.cssText='position:relative;width:1024px;height:768px;background:#fff;overflow:hidden;font-family:Arial,"Noto Sans Devanagari",sans-serif;';div.innerHTML=`<img src="assets/marksheet-1.png" style="position:absolute;inset:0;width:1024px;height:768px">`;
const put=(text,left,top,width,font=15,align='left')=>{const e=document.createElement('div');e.style.cssText=fieldStyle(left,top,width,font,align);e.textContent=text||'';div.appendChild(e);};
put(r.name,21.5,28.2,28,13);put(r.rollNumber,73,28.2,23,13);put(r.designation,21.5,32.3,28,13);put(r.office,73,32.3,23,13);
put(r.typing,31.5,47.2,7,15,'center');put(r.translation,31.5,50.7,7,15,'center');put(r.noting,31.5,54.2,7,15,'center');put(r.essay,31.5,57.6,7,15,'center');put(r.proofreading,31.5,61.2,7,15,'center');
const total=resultText(r,['total'])||['typing','translation','noting','essay','proofreading'].reduce((n,k)=>n+(Number(r[k])||0),0);put(total,20,67.2,16,19,'center');put(r.remarks,58,67.2,38,14);
const rank=String(r.rank||'').toLowerCase();if(rank.includes('1')||rank.includes('first')||rank.includes('प्रथम'))put(r.name,13,77.3,18,10,'center');if(rank.includes('2')||rank.includes('second')||rank.includes('द्वितीय'))put(r.name,42,77.3,18,10,'center');if(rank.includes('3')||rank.includes('third')||rank.includes('तृतीय'))put(r.name,72,77.3,18,10,'center');return div;}
$('downloadHindiMarksheetBtn')?.addEventListener('click',async()=>{if(!currentHindiResult)return;const btn=$('downloadHindiMarksheetBtn');btn.disabled=true;btn.textContent='Preparing PDF…';try{const root=$('hindiPdfRender');root.innerHTML='';const p1=makeHindiPage(currentHindiResult);root.appendChild(p1);const p2=document.createElement('div');p2.style.cssText='position:relative;width:1024px;height:768px;background:#fff;overflow:hidden;';p2.innerHTML='<img src="assets/marksheet-2.png" style="position:absolute;inset:0;width:1024px;height:768px">';root.appendChild(p2);await Promise.all([...root.querySelectorAll('img')].map(im=>im.decode()));const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'landscape',unit:'px',format:[1024,768],compress:true});for(let i=0;i<2;i++){if(i)pdf.addPage([1024,768],'landscape');const canvas=await html2canvas(root.children[i],{scale:1.5,useCORS:true,backgroundColor:'#ffffff'});pdf.addImage(canvas.toDataURL('image/jpeg',0.95),'JPEG',0,0,1024,768);}const safe=(currentHindiResult.name||'Participant').replace(/[^a-z0-9_-]/gi,'_');pdf.save(`Hindi_Pakhwada_2026_Marksheet_${safe}.pdf`); }catch(e){$('hindiResultMsg').textContent='Could not generate PDF. Please try again or contact the organiser.';}finally{btn.disabled=false;btn.textContent='⬇ Download Hindi Pakhwada Marksheet (PDF)';}});
