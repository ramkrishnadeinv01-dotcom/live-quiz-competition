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
function fitText(d,text,x,y,maxWidth,fontSize=7.4,fontStyle='bold'){const t=String(text??'').trim();if(!t)return;let size=fontSize;d.setFont('helvetica',fontStyle);while(size>6.0){d.setFontSize(size);if(d.getTextWidth(t)<=maxWidth)break;size-=0.3;}d.setFont('helvetica',fontStyle);d.setFontSize(size);d.text(t,x,y,{maxWidth});}
async function drawOfficialMarksheet(d,r){
 const [p1,p2]=await Promise.all([loadTemplateImage('hindi-pakhwada-page1.png'),loadTemplateImage('hindi-pakhwada-page2.png')]);
 const W=297,H=210;
 // Coordinates below are based on the original 1024x768 marksheet layout.
 // The high-resolution template image is 1404x993, so scale overlay coordinates
 // against the original layout rather than the template image dimensions.
 const px=(v)=>v*(W/1024), py=(v)=>v*(H/768);
 d.addImage(p1.data,'PNG',0,0,W,H);
 d.setTextColor(20,30,60);d.setFont('helvetica','bold');
 // Participant particulars, positioned over the blank lines in the supplied original page 1.
 fitText(d,r.name,px(220),py(220),px(285),12.8,'bold');
 fitText(d,r.designation,px(220),py(253),px(285),10.8,'bold');
 fitText(d,r.rollNo,px(760),py(220),px(225),11.8,'bold');
 fitText(d,r.placeOfPosting,px(760),py(253),px(225),10.5,'bold');
 const rowY=[371,397,422,447,473];
 const subjectRanks=Array.isArray(r.subjectRanks)?r.subjectRanks:[];
 for(let i=0;i<5;i++){
  const sr=subjectRanks[i]||{}; const y=py(rowY[i]);
  d.setFont('helvetica','bold');d.setFontSize(12.0);
  const own=sr.marks!==undefined&&sr.marks!==''?String(sr.marks):'';
  if(own) d.text(own,px(303),y,{align:'center'});
  const ranks=Array.isArray(sr.ranks)?sr.ranks:[];
  const col=[{nameX:380,markX:547},{nameX:594,markX:755},{nameX:806,markX:968}];
  ranks.forEach((rr,j)=>{const c=col[j];if(!c)return;d.setFont('helvetica','bold');fitText(d,rr.name,px(c.nameX),y,px(145),9.6,'bold');if(rr.marks!==''&&rr.marks!==undefined&&rr.marks!==null){d.setFont('helvetica','bold');d.setFontSize(10.5);d.text(String(rr.marks),px(c.markX),y,{align:'center'});}});
 }
 d.setFont('helvetica','bold');d.setFontSize(12.5);d.text(String(r.obtainedMarks??''),px(265),py(519));
 if(r.remarks){d.setFont('helvetica','normal');fitText(d,r.remarks,px(600),py(519),px(370),9.2,'bold');}
 // Keep the supplied appreciation page exactly as provided, without overlays.
 d.addPage('a4','landscape');d.addImage(p2.data,'PNG',0,0,W,H);
}
async function pdf(r){try{await ensureJspdf();const {jsPDF}=window.jspdf;const d=new jsPDF({unit:'mm',format:'a4',orientation:'landscape'});await drawOfficialMarksheet(d,r);const safe=String(r.name||'Result').replace(/[^a-z0-9]+/gi,'_');d.save(`Hindi_Pakhwada_2026_Marksheet_${safe}.pdf`);}catch(e){alert(`PDF generation failed: ${e.message||e}`);}}
async function allPdf(){if(!results.length)return;for(const r of results){await pdf(r);}}
$("searchBtn").onclick=search;$("phone").onkeydown=e=>{if(e.key==='Enter')search();};$("allBtn").onclick=allPdf;$("backBtn").onclick=()=>location.href='student.html';
