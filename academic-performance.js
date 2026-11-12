import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
let participantProfile=null,authUser=null,allSubmittedRecords=null;
function showMessage(text){const el=$("performanceMessage");if(el)el.textContent=text;}
function setupPerformanceFilters(records){
 const cls=$('filterClass'),sub=$('filterSubject'),mon=$('filterMonth'),chap=$('filterChapter');if(!cls||!sub||!mon||!chap)return;
 const distinct=(arr)=>[...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const monthLabel=v=>{const [y,m]=v.split('-');return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'});};
 const fill=(el,items,allLabel,selected)=>{el.innerHTML=`<option value="">${allLabel}</option>`+items.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('');if(items.some(x=>x.value===selected))el.value=selected;};
 const current=()=>({c:cls.value,s:sub.value,m:mon.value,h:chap.value});
 const update=()=>{
  const v=current();
  const byClass=records.filter(a=>!v.c||String(a.className||a.test.className||'Unspecified')===v.c);
  const subjects=distinct(byClass.map(a=>String(a.subject||a.test.subject||'Unspecified')));
  fill(sub,subjects.map(x=>({value:x,label:x})),'All subjects',v.s);
  const bySubject=byClass.filter(a=>!sub.value||String(a.subject||a.test.subject||'Unspecified')===sub.value);
  const months=distinct(bySubject.map(a=>{if(!a.submittedAt)return '';const d=new Date(Number(a.submittedAt));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;})).sort().reverse();
  fill(mon,months.map(x=>({value:x,label:monthLabel(x)})),'All months',v.m);
  const byMonth=bySubject.filter(a=>{if(!mon.value)return true;if(!a.submittedAt)return false;const d=new Date(Number(a.submittedAt));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`===mon.value;});
  const chapters=distinct(byMonth.flatMap(a=>(Array.isArray(a.test.questions)?a.test.questions:[]).map(q=>String(q.chapter||q.chapterName||q.topic||q.unit||'').trim())));
  fill(chap,chapters.map(x=>({value:x,label:x})),'All chapters',v.h);
 };
 const classes=distinct(records.map(a=>String(a.className||a.test.className||'Unspecified')));
 fill(cls,classes.map(x=>({value:x,label:x})),'All classes',cls.value);
 update();
 [cls,sub,mon,chap].forEach(el=>el.addEventListener('change',()=>{update();renderStudentAnalytics(authUser.uid).catch(e=>console.error(e));}));
}
async function renderStudentAnalytics(uid){
 const target=$("studentAnalyticsContent");if(!target||!uid)return;
 target.innerHTML='<p style="color:#d7e3f5">Analysing your submitted examinations…</p>';
 // Read only this participant's attempts under each published test. Cache them
 // for filter changes; never read the protected attempts root.
 if(!allSubmittedRecords){
  const testSnap=await get(ref(db,'academicOlympiadTests'));
  const tests=testSnap.val()||{},loaded=[];
  for(const [testId,test] of Object.entries(tests)){
   const ownSnap=await get(ref(db,`academicOlympiadAttempts/${testId}/${uid}`));
   if(!ownSnap.exists())continue;
   const own=ownSnap.val();
   const list=own?.status?[own]:Object.values(own||{}).filter(x=>x&&typeof x==='object');
   for(const a of list)if(a.status==='SUBMITTED')loaded.push({...a,testId,test:test||{}});
  }
  loaded.sort((a,b)=>(Number(a.submittedAt)||0)-(Number(b.submittedAt)||0));
  allSubmittedRecords=loaded;
  setupPerformanceFilters(loaded);
 }
 const allRecords=allSubmittedRecords;
 if(!allRecords.length){target.innerHTML='<div style="padding:16px;border:1px dashed #d8b65b88;border-radius:12px;color:#d7e3f5"><b>No completed Olympiad examination yet.</b><p style="margin:6px 0 0">After you submit your first Olympiad examination, your overall, subject-wise and chapter-wise analysis will appear here.</p></div>';return;}
 const selectedClass=$('filterClass')?.value||'',selectedSubject=$('filterSubject')?.value||'',selectedMonth=$('filterMonth')?.value||'',selectedChapter=$('filterChapter')?.value||'';
 const records=allRecords.filter(a=>{
  const cls=String(a.className||a.test.className||'Unspecified');
  const subject=String(a.subject||a.test.subject||'Unspecified');
  const d=new Date(Number(a.submittedAt)||0),month=Number(a.submittedAt)?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:'';
  const hasChapter=(Array.isArray(a.test.questions)?a.test.questions:[]).some(q=>String(q.chapter||q.chapterName||q.topic||q.unit||'').trim()===selectedChapter);
  return (!selectedClass||cls===selectedClass)&&(!selectedSubject||subject===selectedSubject)&&(!selectedMonth||month===selectedMonth)&&(!selectedChapter||hasChapter);
 });
 if(!records.length){target.innerHTML='<div class="performance-empty"><b>No submitted examination matches these filters.</b><p>Try another class, subject, month or chapter, or select All.</p></div>';return;}
 let totalCorrect=0,totalAnswered=0,totalQuestions=0,totalScore=0;const subjects={},chapters={},trend=[];
 for(const a of records){const qs=Array.isArray(a.test.questions)?a.test.questions:[],answers=a.answers||{};const subject=String(a.subject||a.test.subject||'Unspecified');const sub=subjects[subject]||(subjects[subject]={correct:0,answered:0,questions:0,exams:0});sub.correct+=Number(a.correct||0);sub.answered+=Number(a.answered||0);sub.questions+=qs.length||Number(a.answered||0)+Number(a.unanswered||0);sub.exams++;totalCorrect+=Number(a.correct||0);totalAnswered+=Number(a.answered||0);totalQuestions+=qs.length||Number(a.answered||0)+Number(a.unanswered||0);totalScore+=Number(a.score||0);
  qs.forEach((q,i)=>{const chapter=String(q.chapter||q.chapterName||q.topic||q.unit||'').trim();if(!chapter||(selectedChapter&&chapter!==selectedChapter))return;const key=`${subject}|||${chapter}`;const c=chapters[key]||(chapters[key]={subject,chapter,correct:0,answered:0,questions:0});const chosen=String(answers[String(i)]||'').toUpperCase();if(chosen){c.answered++;if(chosen===String(q.correct||'').toUpperCase())c.correct++;}c.questions++;});
  trend.push({label:a.test.title||`Exam ${trend.length+1}`,score:Number(a.score||0),correct:Number(a.correct||0),answered:Number(a.answered||0),date:a.submittedAt?new Date(Number(a.submittedAt)).toLocaleDateString('en-IN'):'—'});
 }
 const pct=(n,d)=>d?Math.round(n/d*100):0,overall=pct(totalCorrect,totalAnswered);const subjectRows=Object.entries(subjects).map(([name,x])=>({name,...x,pct:pct(x.correct,x.answered)})).sort((a,b)=>a.pct-b.pct);const chapterRows=Object.values(chapters).filter(x=>x.answered>0).map(x=>({...x,pct:pct(x.correct,x.answered)})).sort((a,b)=>a.pct-b.pct);const monthlyMap={};for(const a of records){const ts=Number(a.submittedAt)||0;if(!ts)continue;const d=new Date(ts),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;const m=monthlyMap[key]||(monthlyMap[key]={key,label:d.toLocaleDateString('en-IN',{month:'short',year:'numeric'}),correct:0,answered:0,exams:0});m.correct+=Number(a.correct||0);m.answered+=Number(a.answered||0);m.exams++;}const monthRows=Object.values(monthlyMap).sort((a,b)=>a.key.localeCompare(b.key)).map(x=>({...x,pct:pct(x.correct,x.answered)}));const taggedQuestions=records.reduce((n,a)=>n+(Array.isArray(a.test.questions)?a.test.questions.filter(q=>{const c=String(q.chapter||q.chapterName||q.topic||q.unit||'').trim();return c&&(!selectedChapter||c===selectedChapter)}).length:0),0);const totalOlympiadQuestions=records.reduce((n,a)=>n+(Array.isArray(a.test.questions)?(selectedChapter?a.test.questions.filter(q=>String(q.chapter||q.chapterName||q.topic||q.unit||'').trim()===selectedChapter).length:a.test.questions.length):0),0);const weak=chapterRows.filter(x=>x.answered>=3&&x.pct<60).slice(0,6);const fmt=x=>`${x}%`;
 const metric=(n,l)=>`<div style="padding:12px;border:1px solid #d8b65b66;border-radius:12px;background:#0b2345"><b style="font-size:24px;color:#ffe2a0">${n}</b><div style="font-size:11px;color:#d7e3f5">${l}</div></div>`;
 const bar=(label,value,subtext)=>`<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;gap:8px;color:#fff;font-size:13px"><b>${esc(label)}</b><b>${fmt(value)}</b></div><div style="height:8px;background:#263f60;border-radius:20px;overflow:hidden;margin-top:5px"><div style="height:100%;width:${value}%;background:${value>=75?'#22c55e':value>=60?'#60a5fa':'#f59e0b'}"></div></div><small style="color:#b8c9df">${esc(subtext)}</small></div>`;
 const pie=(correct,answered)=>{const good=pct(correct,answered),bad=100-good;return `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:14px;background:#0b2345;border:1px solid #ffffff18;border-radius:14px"><div role="img" aria-label="${good}% correct and ${bad}% incorrect or unanswered" style="width:118px;height:118px;border-radius:50%;background:conic-gradient(#22c55e 0 ${good}%,#f59e0b ${good}% 100%);position:relative;flex:none"><div style="position:absolute;inset:19px;border-radius:50%;background:#0b2345;display:grid;place-items:center;color:#ffe2a0;font-size:20px;font-weight:900">${good}%</div></div><div style="color:#d7e3f5;font-size:13px"><div><b style="color:#22c55e">● Correct:</b> ${correct}</div><div><b style="color:#f59e0b">● Incorrect / unanswered:</b> ${Math.max(0,answered-correct)}</div><small style="color:#b8c9df">Accuracy is calculated from answered questions.</small></div></div>`;};
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
 <div style="margin-top:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px"><div><h3 style="color:#ffe2a0;margin:0 0 8px">Answer distribution</h3>${pie(totalCorrect,totalAnswered)}</div><div style="padding:14px;background:#0b2345;border:1px solid #ffffff18;border-radius:14px;color:#d7e3f5"><h3 style="color:#ffe2a0;margin:0 0 8px">Learning indicators</h3><div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #ffffff18"><span>Accuracy</span><b>${overall}%</b></div><div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #ffffff18"><span>Attempt rate</span><b>${pct(totalAnswered,totalQuestions)}%</b></div><div style="display:flex;justify-content:space-between;padding:7px 0"><span>Average correct per exam</span><b>${records.length?(totalCorrect/records.length).toFixed(1):'0'}</b></div></div></div>
 <div style="margin-top:18px"><h3 style="color:#ffe2a0;margin:0 0 8px">Performance trend</h3><div style="display:flex;align-items:end;gap:8px;height:130px;padding:10px;background:#0b2345;border-radius:12px">${latest.map((x,i)=>`<div title="${esc(x.label)}: ${x.score}" style="flex:1;min-width:0;text-align:center"><div style="height:${Math.max(5,Math.round((Math.max(0,x.score)/maxScore)*88))}px;background:#d8b65b;border-radius:6px 6px 0 0"></div><small style="display:block;color:#d7e3f5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i+1}</small></div>`).join('')}</div><small style="color:#b8c9df">Last ${latest.length} submitted examinations · bars show score magnitude</small></div>
 <div style="margin-top:18px"><h3 style="color:#ffe2a0;margin:0 0 8px">Subject-wise analysis</h3>${subjectRows.length?`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px;margin-bottom:12px">${subjectRows.map(x=>`<div><b style="color:#ffe2a0;font-size:12px">${esc(x.name)}</b>${pie(x.correct,x.answered)}</div>`).join('')}</div>`:''}${subjectRows.map(x=>bar(x.name,x.pct,`${x.correct}/${x.answered} correct · ${x.exams} exam(s)`)).join('')}</div>
 <div style="margin-top:18px"><h3 style="color:#ffe2a0;margin:0 0 8px">Month-wise progress</h3>${monthRows.length?monthRows.map(x=>bar(x.label,x.pct,`${x.correct}/${x.answered} correct · ${x.exams} exam(s)`)).join(''):'<p style="color:#d7e3f5">No dated submissions are available for monthly comparison.</p>'}</div>
 <div style="margin-top:18px"><h3 style="color:#ffe2a0;margin:0 0 8px">Chapter-wise analysis</h3>${chapterRows.length?`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px;margin-bottom:12px">${chapterRows.slice(0,4).map(x=>`<div><b style="color:#ffe2a0;font-size:12px">${esc(x.subject)} — ${esc(x.chapter)}</b>${pie(x.correct,x.answered)}</div>`).join('')}</div>`+chapterRows.map(x=>bar(`${x.subject} — ${x.chapter}`,x.pct,`${x.correct}/${x.answered} correct`)).join(''): `<p style="color:#d7e3f5">Chapter-wise analysis is not available yet because the questions in your submitted examinations do not have chapter/unit/topic tags. Your Host should add a chapter name to each question and publish future examinations with the updated question bank.</p>`}<small style="color:#b8c9df">${taggedQuestions} of ${totalOlympiadQuestions} questions across your submitted examinations have chapter tags. Older submitted examinations are not automatically reclassified.</small></div>
 <div style="margin-top:18px"><h3 style="color:#ffe2a0;margin:0 0 8px">Focus areas & recommendations</h3>${weak.length?weak.map(x=>`<div style="padding:10px;margin:7px 0;border-left:4px solid #f59e0b;background:#172e4d;border-radius:8px;color:#fff"><b>${esc(x.subject)} — ${esc(x.chapter)}</b><div style="color:#d7e3f5;font-size:12px">${x.pct}% accuracy across ${x.answered} answered questions. Revise this chapter and attempt a focused practice test.</div></div>`).join(''):'<p style="color:#d7e3f5">No repeated weak chapter has been identified yet. Keep attempting examinations to build a reliable analysis.</p>'}</div>
 ${plannerHtml}
 <div style="margin-top:18px"><h3 style="color:#ffe2a0;margin:0 0 8px">Examination history</h3><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;color:#fff;font-size:12px"><thead><tr><th style="text-align:left;padding:7px">Examination</th><th>Date</th><th>Score</th><th>Correct</th></tr></thead><tbody>${records.slice().reverse().map(a=>`<tr style="border-top:1px solid #ffffff22"><td style="padding:7px">${esc(a.test.title||a.testId)}</td><td>${a.submittedAt?new Date(Number(a.submittedAt)).toLocaleDateString('en-IN'):'—'}</td><td>${Number(a.score||0)}</td><td>${Number(a.correct||0)}/${Number(a.answered||0)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function attachPrintActions(){
 document.addEventListener("click",event=>{
  const button=event.target.closest("#downloadStudentProgressReport");if(!button)return;
  const panel=$("studentAnalyticsContent");if(!panel)return;
  const w=window.open("","_blank","width=1000,height=800");if(!w){alert("Please allow pop-ups to generate your PDF report.");return;}
  const p=participantProfile||{};
  w.document.write(`<!doctype html><html><head><title>Academic Progress Report</title><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;color:#172033;margin:28px}h1,h2,h3{color:#17365d}button{display:none}#studentAnalyticsContent *{color:#172033!important;background-color:transparent!important;border-color:#ccd4df!important;box-shadow:none!important}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccd4df;padding:7px;text-align:left}@media print{body{margin:14mm}}</style></head><body><h1>Academic Progress Report</h1><p><b>Participant:</b> ${esc(p.name||"")} &nbsp; <b>Designation:</b> ${esc(p.designation||"")}<br><b>Place of Posting:</b> ${esc(p.placeOfPosting||"")} &nbsp; <b>Email:</b> ${esc(authUser?.email||"")}<br><b>Generated:</b> ${new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} IST</p><div id="studentAnalyticsContent">${panel.innerHTML.replace(/<button[\s\S]*?<\/button>/g,"")}</div><script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`);w.document.close();
 });
 document.addEventListener("click",event=>{
  const button=event.target.closest("#printStudentStudyPlan");if(!button)return;
  const panel=button.closest("#studentAnalyticsContent");const planner=panel?.querySelector("#printStudentStudyPlan")?.parentElement?.parentElement;if(!planner)return;
  const w=window.open("","_blank","width=900,height=700");if(!w)return;
  w.document.write(`<!doctype html><html><head><title>7-Day Study Plan</title><meta charset="utf-8"><style>body{font:14px Arial,sans-serif;color:#172033;margin:24px}h3{color:#17365d}button{display:none}li{margin:5px 0}@media print{body{margin:12mm}}</style></head><body><h1>Personalised 7-Day Study Plan</h1>${planner.outerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script></body></html>`);w.document.close();
 });
}
onAuthStateChanged(auth,async user=>{
 authUser=user||null;
 if(!user||user.isAnonymous){showMessage("Please sign in to your approved participant account from the Participant Panel, then open Academic Performance again.");$("studentAnalyticsContent").innerHTML='<div class="performance-empty">Your participant session is not active. <a href="student.html">Return to Participant Panel</a> and sign in.</div>';return;}
 try{
  const snap=await get(ref(db,`participants/${user.uid}`));
  if(!snap.exists()||snap.val()?.status!=="approved"){showMessage("An approved participant account is required to view this page.");return;}
  participantProfile=snap.val();
  $("performanceParticipant").textContent=participantProfile.name||user.email||"Participant";
  showMessage("Your submitted Olympiad examinations are analysed automatically.");
  await renderStudentAnalytics(user.uid);
 }catch(e){console.error("Academic performance page failed:",e);$("studentAnalyticsContent").innerHTML=`<div class="performance-empty">Unable to load your performance analysis: ${esc(e.message||e)}. Please refresh this page.</div>`;}
});
$("refreshPerformance")?.addEventListener("click",async()=>{const u=auth.currentUser;if(!u||u.isAnonymous){showMessage("Please sign in again from the Participant Panel.");return;}const b=$("refreshPerformance");b.disabled=true;try{await renderStudentAnalytics(u.uid);}catch(e){$("studentAnalyticsContent").innerHTML=`<div class="performance-empty">Unable to load analysis: ${esc(e.message||e)}</div>`;}finally{b.disabled=false;}});
attachPrintActions();
