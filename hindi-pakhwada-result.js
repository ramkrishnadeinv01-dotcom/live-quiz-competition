import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=initializeApp(firebaseConfig),db=getDatabase(app);const $=id=>document.getElementById(id);let results=[];
function norm(v){let s=String(v??"").replace(/\D/g,"");if(s.length===10)return "+91"+s;if(s.length===12&&s.startsWith("91"))return "+"+s;return "";}
async function hash(s){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
async function search(){const phone=norm($("phone").value),msg=$("msg");if(!phone){msg.className="status blocked";msg.textContent="Please enter a valid 10-digit mobile number.";$("results").innerHTML="";$("allBox").classList.add("hidden");return;}msg.className="status";msg.textContent="Searching published results…";try{const ph=await hash(phone.replace(/\D/g,""));const snap=await get(ref(db,`otherExamResults/${ph}`));const data=snap.val()||{};results=Object.values(data).filter(r=>/hindi\s*pakhwada/i.test(String(r.examName||""))).sort((a,b)=>String(a.examDate||"").localeCompare(String(b.examDate||"")));if(!results.length){msg.className="status blocked";msg.textContent="No Hindi Pakhwada result was found for this mobile number. Please check that your result has been published under an exam name containing “Hindi Pakhwada”.";$("results").innerHTML="";$("allBox").classList.add("hidden");return;}msg.className="status live";msg.textContent=`✓ ${results.length} result(s) found.`;render();$("allBox").classList.remove("hidden");}catch(e){msg.className="status blocked";msg.textContent=`Unable to search result: ${e.message||e}`;}}
function render(){
 $("results").innerHTML=results.map((r,i)=>`<div class="card result-card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin-bottom:5px">${esc(r.examName||"Other Examination")}</h2><div class="muted2">Exam Date: <b>${esc(r.examDate||"—")}</b> &nbsp; | &nbsp; Roll No: <b>${esc(r.rollNo||"—")}</b></div></div><button class="success pdfBtn" data-i="${i}">📄 DOWNLOAD MARKSHEET</button></div><div class="grid" style="margin-top:14px"><div><b>Name</b><div>${esc(r.name||"—")}</div></div><div><b>Class / Designation</b><div>${esc(r.designation||"—")}</div></div><div><b>School / Place</b><div>${esc(r.placeOfPosting||"—")}</div></div></div><h3 style="margin:20px 0 8px">Subject-wise Performance</h3>${r.subjects?.length?`<div class="tablewrap"><table><thead><tr><th>Subject</th><th>Marks</th><th>Grade</th><th>Subject Rank</th></tr></thead><tbody>${r.subjects.map(x=>`<tr><td><b>${esc(x.subject)}</b></td><td>${esc(x.marks||"—")}</td><td>${esc(x.grade||"—")}</td><td>${esc(x.rank||"—")}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted2">No subject-wise details were supplied in this result.</p>`}<div class="grid" style="margin-top:14px"><div><b>Total Marks</b><div>${esc(r.totalMarks||"—")}</div></div><div><b>Obtained Marks</b><div>${esc(r.obtainedMarks||"—")}</div></div><div><b>Percentage</b><div>${esc(r.percentage||"—")}</div></div><div><b>Overall Grade</b><div>${esc(r.overallGrade||"—")}</div></div><div><b>Overall Rank</b><div>${esc(r.rank||"—")}</div></div><div><b>Result</b><div><span class="badge green">${esc(r.status||"—")}</span></div></div></div>${r.remarks?`<p style="margin-top:14px"><b>Remarks:</b> ${esc(r.remarks)}</p>`:""}</div>`).join(""); document.querySelectorAll('.pdfBtn').forEach(b=>b.onclick=()=>pdf(results[Number(b.dataset.i)]));
}
function ensureJspdf(){return new Promise((res,rej)=>{if(window.jspdf)return res();const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)});}
function drawMarksheet(d,r){const W=210,M=12;d.setFillColor(59,7,100);d.rect(0,0,W,34,'F');d.setTextColor(255,255,255);d.setFont('helvetica','bold');d.setFontSize(18);d.text('HINDI PAKHWADA 2026 RESULT',M,13);d.setFontSize(9);d.setFont('helvetica','normal');d.text('Hindi Pakhwada Examination / Marksheet',M,21);d.setFontSize(8);d.text(`Publication ID: ${r.publicationId||'—'}`,M,28);let y=45;d.setTextColor(30,41,59);d.setFont('helvetica','bold');d.setFontSize(16);d.text(String(r.examName||'Other Examination'),M,y);y+=9;d.setFont('helvetica','normal');d.setFontSize(9);d.text(`Exam Date: ${r.examDate||'—'}    Roll No: ${r.rollNo||'—'}`,M,y);y+=8;d.setFont('helvetica','bold');d.setFontSize(10);d.text(`Name: ${r.name||'—'}`,M,y);d.setFont('helvetica','normal');d.text(`Class / Designation: ${r.designation||'—'}`,105,y);y+=6;d.text(`School / Place: ${r.placeOfPosting||'—'}`,M,y);y+=10;
 if(r.subjects?.length){d.setFillColor(59,7,100);d.rect(M,y-5,W-2*M,8,'F');d.setTextColor(255,255,255);d.setFont('helvetica','bold');d.setFontSize(8);d.text('SUBJECT',M+3,y);d.text('MARKS',105,y);d.text('GRADE',137,y);d.text('SUBJECT RANK',163,y);y+=8; r.subjects.forEach((x,idx)=>{if(y>270){d.addPage();y=20;} if(idx%2===0){d.setFillColor(248,250,252);d.rect(M,y-5,W-2*M,8,'F');}d.setTextColor(30,41,59);d.setFont('helvetica','normal');d.text(String(x.subject||'—'),M+3,y);d.text(String(x.marks||'—'),105,y);d.text(String(x.grade||'—'),137,y);d.text(String(x.rank||'—'),163,y);y+=8;}); }
 y+=5;
 const boxH=30;
 d.setFillColor(238,242,255);d.roundedRect(M,y-5,W-2*M,boxH,2,2,'F');
 d.setTextColor(30,41,59);d.setFont('helvetica','bold');d.setFontSize(8.5);
 d.text(`TOTAL: ${r.obtainedMarks||'—'} / ${r.totalMarks||'—'}`,M+5,y+2);
 d.text(`PERCENTAGE: ${r.percentage||'—'}`,72,y+2);
 d.text(`OVERALL RANK: ${r.rank||'—'}`,140,y+2);
 d.setFontSize(9.5);
 if(r.overallGrade)d.text(`OVERALL GRADE: ${r.overallGrade}`,M+5,y+11);
 const resultText=`RESULT: ${r.status||'—'}`;
 d.setFontSize(9);
 const maxResultW=W-2*M-10;
 const resultLines=d.splitTextToSize(resultText,maxResultW);
 d.text(resultLines,M+5,y+20,{maxWidth:maxResultW});
 y += boxH + 7 + Math.max(0,resultLines.length-1)*4;
 if(r.remarks){d.setFont('helvetica','normal');d.setFontSize(8);const rem=d.splitTextToSize(`Remarks: ${String(r.remarks)}`,W-2*M);d.text(rem,M,y);y+=Math.max(8,rem.length*4);}
 d.setFontSize(7);d.setTextColor(100,116,139);d.text(`Downloaded on ${new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST`,M,289);}
function loadTemplateImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);resolve({data:c.toDataURL('image/png'),width:im.naturalWidth,height:im.naturalHeight});};im.onerror=()=>reject(new Error(`Could not load marksheet template image: ${src}`));im.src=src;});}
function fitText(d,text,x,y,maxWidth,fontSize=5.3){d.setFontSize(fontSize);const t=String(text??'').trim();if(!t)return;const lines=d.splitTextToSize(t,maxWidth);d.text(lines.slice(0,1),x,y);}
async function drawOfficialMarksheet(d,r){
 // Redesigned first page: draw every field directly into the PDF so text cannot drift away from the cells.
 const W=297,H=210,M=9;
 d.setFillColor(255,255,255);d.rect(0,0,W,H,'F');
 d.setDrawColor(180,120,25);d.setLineWidth(1.2);d.rect(4,4,W-8,H-8);d.setLineWidth(.35);d.rect(6,6,W-12,H-12);
 d.setFillColor(12,43,91);d.roundedRect(M,9,W-2*M,24,2,2,'F');
 d.setTextColor(255,220,130);d.setFont('helvetica','bold');d.setFontSize(17);d.text('HINDI PAKHWADA EXAMINATION - 2026',W/2,18,{align:'center'});
 d.setTextColor(255,255,255);d.setFontSize(8.5);d.setFont('helvetica','normal');d.text('Regional Office, F.O.D., Burdwan  |  Marks Statement',W/2,26,{align:'center'});
 d.setTextColor(20,35,65);d.setFont('helvetica','bold');d.setFontSize(12);d.text('PARTICIPANT MARKSHEET',W/2,40,{align:'center'});
 const boxY=44,boxH=20; d.setDrawColor(160,170,185);d.setFillColor(247,249,252);d.roundedRect(M,boxY,W-2*M,boxH,2,2,'FD');
 d.setTextColor(25,35,55);d.setFontSize(8);d.setFont('helvetica','bold');
 d.text('Officer Name:',M+4,boxY+6);d.text('Designation:',M+4,boxY+14);d.text('Roll No.:',154,boxY+6);d.text('Office / Department:',154,boxY+14);
 d.setFont('helvetica','normal');
 const safe=(v)=>String(v??'—').trim()||'—';
 const put=(v,x,y,w,size=8)=>{d.setFontSize(size);let t=d.splitTextToSize(safe(v),w);d.text(t.slice(0,1),x,y);};
 put(r.name,M+30,boxY+6,105,8);put(r.designation,M+30,boxY+14,105,8);put(r.rollNo,174,boxY+6,48,8);put(r.placeOfPosting,190,boxY+14,88,7.5);
 d.setFont('helvetica','bold');d.setFontSize(8);d.text('Exam Date:',M+4,boxY+18);d.setFont('helvetica','normal');put(r.examDate,M+22,boxY+18,45,7);
 const top=69, headH=19, rowH=19; const xs=[M, M+43, M+59, M+100, M+132, M+164, M+196, M+228, W-M];
 // Columns: subject, own marks, Rank 1 name/marks, Rank 2 name/marks, Rank 3 name/marks
 const widths=[43,16,41,32,32,32,32,32,32];
 d.setFillColor(218,231,248);d.setDrawColor(120,140,165);d.rect(M,top,W-2*M,headH,'FD');
 const headers=[['SUBJECT',M+2,top+7],['MARKS\n/50',M+51,top+6],['RANK 1 OFFICER',M+61,top+7],['MARKS',M+133,top+7],['RANK 2 OFFICER',M+143,top+7],['MARKS',M+197,top+7],['RANK 3 OFFICER',M+207,top+7],['MARKS',M+261,top+7]];
 d.setTextColor(15,35,70);d.setFont('helvetica','bold');d.setFontSize(7);headers.forEach(h=>d.text(h[0],h[1],h[2]));
 const subjects=Array.isArray(r.subjectRanks)?r.subjectRanks:[];
 const labels=['Hindi Typing','Hindi Translation','Hindi Noting & Drafting','Hindi Essay Writing','Hindi Proofreading'];
 for(let i=0;i<5;i++){
  const y=top+headH+i*rowH; if(i%2===0){d.setFillColor(250,251,253);d.rect(M,y,W-2*M,rowH,'F');}
  d.setDrawColor(170,180,195);d.rect(M,y,W-2*M,rowH);
  // grid boundaries aligned to each actual field
  [M+43,M+59,M+100,M+116,M+148,M+164,M+196,M+212,M+244,M+260].forEach(x=>d.line(x,y,x,y+rowH));
  const sr=subjects[i]||{};d.setTextColor(20,30,50);d.setFont('helvetica','bold');d.setFontSize(7.1);d.text(labels[i],M+2,y+11);
  d.setFont('helvetica','normal');d.setFontSize(8);if(sr.marks!==''&&sr.marks!==undefined&&sr.marks!==null)d.text(String(sr.marks),M+51,y+11,{align:'center'});
  const ranks=Array.isArray(sr.ranks)?sr.ranks:[];const fields=[{nx:M+61,mx:M+108},{nx:M+143,mx:M+160},{nx:M+207,mx:M+256}];
  ranks.forEach((rr,j)=>{const f=fields[j];if(!f)return;let nm=safe(rr.name);if(nm==='—')return;d.setFontSize(6.3);const lines=d.splitTextToSize(nm, j===0?39:39);d.text(lines.slice(0,2),f.nx,y+(lines.length>1?7:11));if(rr.marks!==''&&rr.marks!==undefined&&rr.marks!==null){d.setFont('helvetica','bold');d.setFontSize(7);d.text(String(rr.marks),f.mx,y+11,{align:'center'});d.setFont('helvetica','normal');}});
 }
 const sumY=top+headH+5*rowH+5;d.setFillColor(230,241,251);d.setDrawColor(120,140,165);d.roundedRect(M,sumY,W-2*M,13,1.5,1.5,'FD');d.setTextColor(15,35,70);d.setFont('helvetica','bold');d.setFontSize(9);d.text(`TOTAL MARKS: ${safe(r.obtainedMarks)} / 250`,M+4,sumY+8);d.setFontSize(8);d.text(`PERCENTAGE: ${safe(r.percentage)}`,105,sumY+8);d.text(`PUBLICATION ID: ${safe(r.publicationId)}`,190,sumY+8);
 const noteY=sumY+18;d.setFont('helvetica','bold');d.setFontSize(8);d.text('REMARKS:',M+2,noteY);d.setFont('helvetica','normal');d.setFontSize(7.5);const rem=safe(r.remarks);d.text(d.splitTextToSize(rem,W-2*M-25).slice(0,2),M+24,noteY);
 d.setDrawColor(180,120,25);d.line(M,noteY+8,W-M,noteY+8);d.setFont('helvetica','italic');d.setFontSize(7);d.setTextColor(90,100,115);d.text('This marksheet is issued for Hindi Pakhwada Examination 2026. Subject-wise prize ranks are shown separately for each subject.',W/2,202,{align:'center'});
 // Page 2 remains exactly the supplied appreciation page.
 const p2=await loadTemplateImage('hindi-pakhwada-page2.png');d.addPage('a4','landscape');d.addImage(p2.data,'PNG',0,0,W,H);
}
async function pdf(r){try{await ensureJspdf();const {jsPDF}=window.jspdf;const d=new jsPDF({unit:'mm',format:'a4',orientation:'landscape'});await drawOfficialMarksheet(d,r);const safe=String(r.name||'Result').replace(/[^a-z0-9]+/gi,'_');d.save(`Hindi_Pakhwada_2026_Marksheet_${safe}.pdf`);}catch(e){alert(`PDF generation failed: ${e.message||e}`);}}
async function allPdf(){if(!results.length)return;for(const r of results){await pdf(r);}}
$("searchBtn").onclick=search;$("phone").onkeydown=e=>{if(e.key==='Enter')search();};$("allBtn").onclick=allPdf;$("backBtn").onclick=()=>location.href='student.html';
