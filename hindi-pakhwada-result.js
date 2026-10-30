import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=initializeApp(firebaseConfig),db=getDatabase(app);const $=id=>document.getElementById(id);let results=[];
function norm(v){let s=String(v??"").replace(/\D/g,"");if(s.length===10)return "+91"+s;if(s.length===12&&s.startsWith("91"))return "+"+s;return "";}
async function hash(s){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
async function search(){const phone=norm($("phone").value),msg=$("msg");if(!phone){msg.className="status blocked";msg.textContent="Please enter a valid 10-digit mobile number.";$("results").innerHTML="";$("allBox").classList.add("hidden");return;}msg.className="status";msg.textContent="Searching published results…";try{const ph=await hash(phone.replace(/\D/g,""));const snap=await get(ref(db,`hindiPakhwadaResults/${ph}`));const data=snap.val()||{};results=Object.values(data).sort((a,b)=>String(a.examDate||"").localeCompare(String(b.examDate||"")));if(!results.length){msg.className="status blocked";msg.textContent="No Hindi Pakhwada 2026 result was found for this mobile number.";$("results").innerHTML="";$("allBox").classList.add("hidden");return;}msg.className="status live";msg.textContent=`✓ ${results.length} result(s) found.`;render();$("allBox").classList.remove("hidden");}catch(e){msg.className="status blocked";msg.textContent=`Unable to search result: ${e.message||e}`;}}
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
  // Page 2 keeps the existing appreciation artwork. Page 1 is newly composed
  // as a clean, responsive table so long names and marks never collide.
  const p2=await loadTemplateImage('hindi-pakhwada-page2.png?v=20261017-corrected-template');
  const canvas=document.createElement('canvas');
  canvas.width=1600; canvas.height=1131;
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;

  const C={
    navy:'#102b55', navy2:'#173d72', gold:'#d4a33b', pale:'#fffaf0',
    ink:'#172b4d', muted:'#53647d', line:'#c9d5e5', white:'#ffffff',
    bluePale:'#edf4ff', goldPale:'#fff2cf', red:'#a92835'
  };

  function rounded(x,y,w,h,rad,fill,stroke,lineWidth=2){
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(x,y,w,h,rad);
    else ctx.rect(x,y,w,h);
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.lineWidth=lineWidth;ctx.strokeStyle=stroke;ctx.stroke();}
  }
  function font(size,bold=true){
    return `${bold?'700':'400'} ${size}px Arial, "Noto Sans Devanagari", "Mangal", sans-serif`;
  }
  function fitOne(text,cx,cy,maxW,size,min=13,bold=true,color=C.ink){
    const t=String(text??'').trim(); if(!t)return;
    ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;
    let s=size;ctx.font=font(s,bold);
    while(s>min && ctx.measureText(t).width>maxW){s-=1;ctx.font=font(s,bold);}
    ctx.beginPath();ctx.rect(cx-maxW/2,cy-32,maxW,64);ctx.clip();
    ctx.fillText(t,cx,cy);ctx.restore();
  }
  function wrapWords(text,maxW,size,bold=true,maxLines=2){
    const words=String(text??'').trim().split(/\s+/).filter(Boolean);
    if(!words.length)return [];
    ctx.font=font(size,bold);
    const out=[];let line='';
    for(const word of words){
      const test=line?line+' '+word:word;
      if(ctx.measureText(test).width<=maxW || !line){line=test;}
      else{out.push(line);line=word;}
    }
    if(line)out.push(line);
    if(out.length>maxLines){
      const kept=out.slice(0,maxLines);
      let last=kept[maxLines-1];
      while(last.length>3 && ctx.measureText(last+'…').width>maxW)last=last.slice(0,-1);
      kept[maxLines-1]=last+'…';
      return kept;
    }
    return out;
  }
  function wrappedCell(text,cx,cy,maxW,size=19,min=15,bold=true,color=C.ink,maxLines=2){
    const t=String(text??'').trim();if(!t)return;
    ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;
    let s=size,lines=[];
    while(s>=min){
      lines=wrapWords(t,maxW,s,bold,maxLines);
      if(lines.every(line=>ctx.measureText(line).width<=maxW))break;
      s-=1;ctx.font=font(s,bold);
    }
    ctx.font=font(s,bold);
    const lineH=s*1.18, start=cy-((lines.length-1)*lineH)/2;
    ctx.beginPath();ctx.rect(cx-maxW/2,cy-31,maxW,62);ctx.clip();
    lines.forEach((line,i)=>ctx.fillText(line,cx,start+i*lineH));
    ctx.restore();
  }
  function labelValue(label,value,x,y,w){
    ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.font=font(19,true);ctx.fillStyle=C.navy;ctx.fillText(label,x,y);
    const lw=ctx.measureText(label).width+15;
    ctx.font=font(20,true);ctx.fillStyle=C.ink;
    const t=String(value??'—').trim()||'—';
    let size=20;while(size>14&&ctx.measureText(t).width>w-lw){size--;ctx.font=font(size,true);}
    ctx.save();ctx.beginPath();ctx.rect(x+lw,y-20,w-lw,40);ctx.clip();ctx.fillText(t,x+lw,y);ctx.restore();
  }

  // Clean paper background and decorative frame.
  ctx.fillStyle='#fffefa';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=C.gold;ctx.lineWidth=8;ctx.strokeRect(15,15,W-30,H-30);
  ctx.strokeStyle=C.navy;ctx.lineWidth=2;ctx.strokeRect(28,28,W-56,H-56);

  // Light, repeated diagonal watermark behind all information.
  ctx.save();ctx.globalAlpha=0.065;ctx.translate(W/2,H/2);ctx.rotate(-Math.PI/7);
  ctx.fillStyle=C.red;ctx.font=font(52,true);ctx.textAlign='center';ctx.textBaseline='middle';
  for(let yy=-900;yy<=900;yy+=190){
    for(let xx=-1500;xx<=1500;xx+=650)ctx.fillText('हिंदी पखवाड़ा 2026',xx,yy);
  }
  ctx.restore();

  // Header.
  rounded(55,48,1490,160,24,C.navy,C.gold,5);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=C.white;
  ctx.font=font(57,true);ctx.fillText('हिंदी पखवाड़ा परीक्षा – 2026',800,98);
  ctx.font=font(25,true);ctx.fillText('आयोजक : क्षेत्रीय कार्यालय, एफ.ओ.डी., बर्धमान',800,145);
  ctx.font=font(20,false);ctx.fillText('राष्ट्रीय सांख्यिकी कार्यालय, सांख्यिकी एवं कार्यक्रम कार्यान्वयन मंत्रालय',800,177);
  ctx.font=font(17,true);ctx.fillText('भारत सरकार',800,198);
  ctx.textAlign='right';ctx.font=font(23,true);ctx.fillStyle='#ffe5a1';
  ctx.fillText('हिंदी पखवाड़ा 2026',1510,72);
  ctx.font=font(14,true);ctx.fillStyle='#ffffff';ctx.fillText('हिंदी : हमारी पहचान, हमारी शक्ति',1510,93);

  // Marksheet title ribbon.
  rounded(485,222,630,52,16,C.goldPale,C.gold,3);
  ctx.textAlign='center';ctx.fillStyle=C.navy;ctx.font=font(31,true);
  ctx.fillText('अंकों का विवरण (मार्कशीट)',800,249);

  // Participant information card: same fields as the original marksheet.
  rounded(55,290,1490,83,12,C.white,C.line,2);
  labelValue('अधिकारी का नाम :',r.name,78,318,710);
  labelValue('अनुक्रमांक :',r.rollNo,835,318,680);
  labelValue('पदनाम :',r.designation,78,350,710);
  labelValue('कार्यालय / विभाग :',r.placeOfPosting,835,350,680);

  // Table layout: fixed-width name and marks columns prevent overlap.
  const x0=55, tableY=391;
  const widths=[58,222,128,359,359,359];
  const xs=[x0];
  widths.forEach(w=>xs.push(xs[xs.length-1]+w));
  const groupH=43, subH=55, rowH=69;
  const tableW=widths.reduce((a,b)=>a+b,0);
  const dataY=tableY+groupH+subH;
  const tableBottom=dataY+5*rowH;

  // Header backgrounds.
  ctx.fillStyle=C.navy;ctx.fillRect(x0,tableY,tableW,groupH+subH);
  ctx.fillStyle='#e5efff';
  ctx.fillRect(xs[0],tableY,widths[0],groupH+subH);
  ctx.fillRect(xs[1],tableY,widths[1],groupH+subH);
  ctx.fillRect(xs[2],tableY,widths[2],groupH+subH);

  ctx.fillStyle=C.navy2;
  for(let g=3;g<6;g++)ctx.fillRect(xs[g],tableY,widths[g],groupH);
  ctx.fillStyle='#edf3ff';
  for(let g=3;g<6;g++)ctx.fillRect(xs[g],tableY+groupH,widths[g],subH);

  // Header labels.
  fitOne('क्र. सं.',xs[0]+widths[0]/2,tableY+groupH+subH/2,widths[0]-8,19,15,true,C.navy);
  fitOne('विषय',xs[1]+widths[1]/2,tableY+groupH+subH/2,widths[1]-10,23,18,true,C.navy);
  wrappedCell('प्राप्तांक (50 में से)\n(अधिकारी द्वारा)',xs[2]+widths[2]/2,tableY+groupH+subH/2,widths[2]-12,19,15,true,C.navy,2);
  fitOne('सर्वाधिक अंक प्राप्त करने वाले शीर्ष 3 अधिकारी',xs[3]+(tableW-widths[0]-widths[1]-widths[2])/2,tableY+groupH/2,tableW-widths[0]-widths[1]-widths[2]-12,23,17,true,C.white);

  const rankLabels=['प्रथम','द्वितीय','तृतीय'];
  for(let j=0;j<3;j++){
    const gx=xs[3+j],gw=widths[3+j],nameW=260,marksW=gw-nameW;
    fitOne(rankLabels[j],gx+gw/2,tableY+groupH/2,gw-10,23,18,true,C.white);
    fitOne('अधिकारी का नाम',gx+nameW/2,tableY+groupH+subH/2,nameW-8,19,15,true,C.navy);
    wrappedCell('अंक\n(50 में से)',gx+nameW+marksW/2,tableY+groupH+subH/2,marksW-8,18,14,true,C.navy,2);
  }

  const subjectHindi={
    'hindi typing':'हिंदी टाइपिंग',
    'hindi translation':'हिंदी अनुवाद',
    'hindi noting & drafting':'हिंदी नोटिंग एवं प्रारूप लेखन',
    'hindi noting and drafting':'हिंदी नोटिंग एवं प्रारूप लेखन',
    'hindi essay writing':'हिंदी निबंध लेखन',
    'hindi proofreading':'हिंदी शुद्धलेखन',
    'hindi proof reading':'हिंदी शुद्धलेखन',
    'hindi typing test':'हिंदी टाइपिंग'
  };
  const clean=v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase();
  const subjectRanks=Array.isArray(r.subjectRanks)?r.subjectRanks:[];
  const subjectResults=Array.isArray(r.subjects)?r.subjects:[];
  const subjectRows=[
    'Hindi Typing','Hindi Translation','Hindi Noting & Drafting',
    'Hindi Essay Writing','Hindi Proofreading'
  ];

  // Body rows with consistent vertical alignment and wrapped official names.
  for(let i=0;i<5;i++){
    const y=dataY+i*rowH;
    ctx.fillStyle=i%2===0?'#fffdf7':'#f1f6ff';
    ctx.fillRect(x0,y,tableW,rowH);
    const sr=subjectRanks[i]||subjectResults[i]||{};
    const subjectName=sr.subject||subjectRows[i];
    const ownMarks=sr.marks!==undefined?sr.marks:(subjectResults[i]?.marks??'');
    fitOne(i+1,xs[0]+widths[0]/2,y+rowH/2,widths[0]-8,22,17,true,C.navy);
    wrappedCell(subjectHindi[clean(subjectName)]||subjectName,xs[1]+widths[1]/2,y+rowH/2,widths[1]-16,21,15,true,C.ink,2);
    fitOne(ownMarks===0?'0':(ownMarks??''),xs[2]+widths[2]/2,y+rowH/2,widths[2]-12,22,15,true,C.navy);
    const ranks=Array.isArray(sr.ranks)?sr.ranks:[];
    for(let j=0;j<3;j++){
      const gx=xs[3+j],nameW=260,marksW=widths[3+j]-nameW;
      const rr=ranks[j]||{};
      wrappedCell(rr.name||'',gx+nameW/2,y+rowH/2,nameW-16,20,14,true,C.ink,2);
      const mv=rr.marks;
      fitOne(mv===0?'0':(mv??''),gx+nameW+marksW/2,y+rowH/2,marksW-12,21,15,true,C.navy);
    }
  }

  // Table grid.
  ctx.strokeStyle=C.line;ctx.lineWidth=1.6;
  for(let x of xs){ctx.beginPath();ctx.moveTo(x,tableY);ctx.lineTo(x,tableBottom);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(x0,tableY);ctx.lineTo(x0+tableW,tableY);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x0,tableY+groupH);ctx.lineTo(x0+tableW,tableY+groupH);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x0, dataY);ctx.lineTo(x0+tableW,dataY);ctx.stroke();
  for(let i=1;i<=5;i++){const y=dataY+i*rowH;ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x0+tableW,y);ctx.stroke();}
  // Name/marks separators inside each rank group.
  for(let j=0;j<3;j++){const gx=xs[3+j]+260;ctx.beginPath();ctx.moveTo(gx,tableY+groupH);ctx.lineTo(gx,tableBottom);ctx.stroke();}
  ctx.strokeStyle=C.navy;ctx.lineWidth=2.5;ctx.strokeRect(x0,tableY,tableW,tableBottom-tableY);

  // Total and remarks band.
  const totalY=tableBottom+13;
  rounded(55,totalY,1490,54,10,'#e8f2ff',C.line,2);
  ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=C.navy;ctx.font=font(23,true);
  ctx.fillText('कुल प्राप्तांक :',80,totalY+27);
  let total=r.obtainedMarks;
  if(total===undefined||total===null||total===''){
    const vals=subjectRanks.map(x=>x?.marks).filter(v=>typeof v==='number'&&Number.isFinite(v));
    if(vals.length)total=vals.reduce((a,b)=>a+b,0);
  }
  ctx.fillStyle=C.ink;ctx.font=font(24,true);
  ctx.fillText(`${total===undefined||total===null?'':total} / 250`,275,totalY+27);
  ctx.fillStyle=C.navy;ctx.font=font(22,true);ctx.fillText('टिप्पणी :',650,totalY+27);
  ctx.fillStyle=C.ink;ctx.font=font(19,false);
  const remarks=String(r.remarks??'').trim();
  if(remarks)ctx.fillText(remarks.slice(0,62),770,totalY+27);

  // Subject-wise prize panels: same rank 1/2/3 information as the former sheet.
  const wins={1:[],2:[],3:[]};
  subjectRanks.forEach(sr=>{
    const subject=String(sr.subject||sr.subjectName||'').trim();
    (Array.isArray(sr.ranks)?sr.ranks:[]).forEach((rr,idx)=>{
      if(clean(rr.name)===clean(r.name)){
        const rank=Number(rr.rank)||idx+1;
        if(rank>=1&&rank<=3)wins[rank].push(subjectHindi[clean(subject)]||subject);
      }
    });
  });
  const prizeY=totalY+70, prizeH=112, prizeGap=18, prizeW=(1490-2*prizeGap)/3;
  const prizeColors=[['#fff0cf','#b7791f'],['#edf1f8','#64748b'],['#fce8df','#a64b27']];
  const rankHindi={1:'प्रथम',2:'द्वितीय',3:'तृतीय'};
  for(let rank=1;rank<=3;rank++){
    const x=55+(rank-1)*(prizeW+prizeGap);
    const [bg,accent]=prizeColors[rank-1];
    rounded(x,prizeY,prizeW,prizeH,12,bg,accent,2.5);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=accent;
    ctx.font=font(25,true);ctx.fillText(`${rankHindi[rank]} पुरस्कार विजेता`,x+prizeW/2,prizeY+27);
    ctx.fillStyle=C.red;ctx.font=font(24,true);ctx.fillText('बधाई हो!',x+prizeW/2,prizeY+57);
    const subjects=[...new Set(wins[rank])];
    const sentence=subjects.length?`आपने ${subjects.join(' / ')} में ${rankHindi[rank]} पुरस्कार प्राप्त किया है।`:`आपने ${rankHindi[rank]} पुरस्कार श्रेणी में स्थान प्राप्त किया है।`;
    wrappedCell(sentence,x+prizeW/2,prizeY+88,prizeW-26,18,14,true,C.ink,2);
  }

  // Original disclaimer retained at the foot of page 1.
  const footY=prizeY+123;
  rounded(55,footY,1490,40,8,'#fff4f2','#e6a5a5',1.5);
  ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=C.red;ctx.font=font(16,true);
  ctx.fillText('महत्वपूर्ण सूचना :',72,footY+20);
  ctx.fillStyle=C.ink;ctx.font=font(14,false);
  ctx.fillText('यह अंक-विवरण केवल सूचना एवं आंतरिक संदर्भ हेतु है। इसे किसी भी प्रकार का आधिकारिक प्रमाण पत्र या प्रमाण न माना जाए।',235,footY+14);
  ctx.fillText('इस अंक-विवरण के आधार पर कोई अधिकारी दावा नहीं कर सकता।',235,footY+30);

  const page1=canvas.toDataURL('image/png');
  d.addImage(page1,'PNG',0,0,297,210);
  d.addPage('a4','landscape');
  d.addImage(p2.data,'PNG',0,0,297,210);
}
async function pdf(r){try{await ensureJspdf();const {jsPDF}=window.jspdf;const d=new jsPDF({unit:'mm',format:'a4',orientation:'landscape'});await drawOfficialMarksheet(d,r);const safe=String(r.name||'Result').replace(/[^a-z0-9]+/gi,'_');d.save(`Hindi_Pakhwada_2026_Marksheet_${safe}.pdf`);}catch(e){alert(`PDF generation failed: ${e.message||e}`);}}
async function allPdf(){if(!results.length)return;for(const r of results){await pdf(r);}}
$("searchBtn").onclick=search;$("phone").onkeydown=e=>{if(e.key==='Enter')search();};$("allBtn").onclick=allPdf;$("backBtn").onclick=()=>location.href='student.html';
