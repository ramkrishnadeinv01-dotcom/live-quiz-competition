import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, remove } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
const app=getApps().length?getApps()[0]:initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const ADMIN="ramkrishnadeinv.01@gmail.com", $=id=>document.getElementById(id), esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isAdmin=u=>String(u?.email||"").toLowerCase()===ADMIN;
function panel(id,title,html){let x=$(id);if(!x){const target=id==='adminHostTransferPanel'?$('#admin-page-host-transfers'):null;if(!target)return null;x=document.createElement('section');x.id=id;x.className='card';x.style.cssText='margin:18px 0;padding:20px;border:1px solid #d9b65b;border-radius:16px;background:#0b2448;color:#fff';target.appendChild(x);}x.innerHTML=`<h2 style="color:#ffe2a0">${title}</h2>${html}`;return x;}
async function participantUI(u){
 const box=panel('participantHostMappingPanel','👥 Choose Your Host',`<p>Host selection is optional. Without a host, your account remains managed by the Administrator.</p><p>Loading your host options…</p>`);
 box.style.display='block';
 try{
  const ps=await get(ref(db,`participants/${u.uid}`));
  const p=ps.val()||{};
  if(p.status!=='approved'){
   box.innerHTML='<h2 style="color:#ffe2a0">👥 Choose Your Host</h2><p>Your host options will appear here after your participant account is approved by the Administrator.</p>';
   return;
  }
  let mapping=null, mappingReadError=null, hosts={}, hostsReadError=null;
  try{mapping=(await get(ref(db,`participantHostMapping/${u.uid}`))).val()||null;}catch(e){mappingReadError=e;}
  try{hosts=(await get(ref(db,'approvedHostsPublic'))).val()||{};}catch(e){hostsReadError=e;}
  const isMapped=mapping?.status==='approved';
  const selectId=isMapped?'transferHost':'chooseHost';
  const title=isMapped?'👥 Your Assigned Host':'👥 Choose Your Host';
  const intro=isMapped?`<p>Your current host: <b>${esc(mapping.hostName||mapping.hostUid)}</b>. To change hosts, send a transfer request. Administrator approval is required.</p>`:`<p>You are currently managed by the Administrator. Host selection is optional. Choose an approved host and send a request if you want host support.</p>`;
  const action=isMapped?'Send Transfer Request':'Send Host Request';
  const options=Object.entries(hosts).filter(([id,h])=>h&&h.status==='approved'&&(!isMapped||id!==mapping.hostUid)).map(([id,h])=>`<option value="${esc(id)}">${esc(h.hostName||h.email||id)}${h.placeOfPosting?' — '+esc(h.placeOfPosting):''}</option>`).join('');
  let warning='';
  if(mappingReadError)warning='<p class="host-map-status">Could not read your current host mapping. Please ensure the V83 database rules are published before using this feature.</p>';
  if(hostsReadError)warning+=`<p class="host-map-status">Unable to load the approved-host list: ${esc(hostsReadError.message||hostsReadError)}. Please check the V83 database rules.</p>`;
  box.innerHTML=`<h2 style="color:#ffe2a0">${title}</h2>${intro}${warning}<label for="${selectId}">${isMapped?'Select another approved host':'Select an approved host'}</label><select id="${selectId}" ${hostsReadError?'disabled':''}><option value="">${options?'— Select host —':'No approved hosts listed'}</option>${options}</select><button id="${isMapped?'sendTransfer':'sendHostRequest'}" type="button" ${!options||hostsReadError?'disabled':''}>${action}</button><p id="mapMsg" class="host-map-status" role="status" aria-live="polite">${options?'Select a host, then press the button to send your request.':(hostsReadError?'Host list could not be loaded.':'No approved hosts are currently available. Your account remains managed by the Administrator.')}</p>`;
  const showError=e=>{const m=$('mapMsg');if(m)m.textContent=`Request failed: ${e?.message||e}. Please verify that the V83 database rules have been published.`;};
  if(!isMapped){
   $('sendHostRequest')?.addEventListener('click',async()=>{
    const hid=$(selectId)?.value;
    if(!hid){$('mapMsg').textContent='Please select a host first.';return;}
    const btn=$('sendHostRequest');btn.disabled=true;
    try{
     // Re-read the mapping immediately before writing; the page may have been open
     // while the host approved an earlier request in another tab.
     const fresh=(await get(ref(db,`participantHostMapping/${u.uid}`))).val()||null;
     if(fresh?.status==='approved' && fresh.hostUid===hid){
      alert('You are already mapped to this host. Your account is currently managed by this host. No new request is required.');
      $('mapMsg').textContent='You are already mapped to this host. No new request has been created.';
      await participantUI(u);return;
     }
     if(fresh?.status==='approved' && fresh.hostUid!==hid){
      alert('You are already mapped to another host. Please use the Host Transfer Request option. Administrator approval is required.');
      await participantUI(u);return;
     }
     const existing=(await get(ref(db,`hostMappingRequests/${hid}/${u.uid}`))).val()||null;
     if(existing?.status==='pending'){
      alert('You have already sent a request to this host. Your request is still pending.');
      $('mapMsg').textContent='Your request to this host is already pending.';return;
     }
     await set(ref(db,`hostMappingRequests/${hid}/${u.uid}`),{hostUid:hid,participantUid:u.uid,participantName:p.name||'',participantEmail:u.email||'',status:'pending',requestedAt:Date.now()});
     $('mapMsg').textContent='Request sent successfully. The selected host must approve it.';
    }catch(e){showError(e);}finally{if($('sendHostRequest'))$('sendHostRequest').disabled=false;}
   });
  }else{
   $('sendTransfer')?.addEventListener('click',async()=>{const hid=$(selectId)?.value;if(!hid){$('mapMsg').textContent='Please select another host first.';return;}const btn=$('sendTransfer');btn.disabled=true;try{await set(ref(db,`hostTransferRequests/${u.uid}`),{participantUid:u.uid,currentHostUid:mapping.hostUid,requestedHostUid:hid,status:'pending',requestedAt:Date.now()});$('mapMsg').textContent='Transfer request sent to the Administrator for approval.';}catch(e){showError(e);}finally{btn.disabled=false;}});
  }
 }catch(e){
  console.error('Participant host-selection panel failed:',e);
  box.innerHTML=`<h2 style="color:#ffe2a0">👥 Choose Your Host</h2><p>Your host-selection panel could not load.</p><p class="host-map-status">${esc(e?.message||e)}. Please check that the V83 database rules are deployed and try refreshing this page.</p>`;
 }
}
async function hostUI(u){const h=(await get(ref(db,`hosts/${u.uid}`))).val();if(h?.status!=='approved')return;const box=panel('hostMappingInbox','🔔 Participant Host Requests','<p>Loading requests…</p>');const req=(await get(ref(db,`hostMappingRequests/${u.uid}`))).val()||{};const rows=Object.entries(req).filter(([id,x])=>x?.status==='pending');box.innerHTML=`<h2 style="color:#ffe2a0">🔔 Participant Host Requests</h2>${rows.length?rows.map(([id,x])=>`<div style="padding:12px;margin:8px 0;background:#17365f;border-radius:10px"><b>${esc(x.participantName||x.participantEmail||id)}</b><p>${esc(x.participantEmail||'')}</p><button data-map="approve" data-uid="${esc(id)}">Approve</button> <button data-map="reject" data-uid="${esc(id)}">Reject</button></div>`).join(''):'<p>No pending host requests.</p>'}`;
 box.querySelectorAll('[data-map]').forEach(b=>b.onclick=async()=>{const pid=b.dataset.uid,action=b.dataset.map;if(!confirm(`${action==='approve'?'Approve':'Reject'} this participant request?`))return;try{const requestRecord=req[pid]||{};if(action==='approve'){
  const existing=(await get(ref(db,`participantHostMapping/${pid}`))).val()||null;
  if(existing?.status==='approved' && existing.hostUid===u.uid){
   // Recover safely if an earlier approval wrote the authoritative mapping
   // but failed before writing the host-side participant index.
   await set(ref(db,`hostParticipantMappings/${u.uid}/${pid}`),{participantUid:pid,name:requestRecord.participantName||'',email:requestRecord.participantEmail||'',status:'approved',mappedAt:existing.mappedAt||Date.now()});
   await update(ref(db,`hostMappingRequests/${u.uid}/${pid}`),{status:'approved',reviewedAt:Date.now(),reviewedBy:u.uid});
   alert('This participant is already mapped to your host account. The host participant list has been checked and the request is now closed.');
   await hostUI(u);return;
  }
  if(existing?.status==='approved' && existing.hostUid!==u.uid){
   await update(ref(db,`hostMappingRequests/${u.uid}/${pid}`),{status:'rejected',reviewedAt:Date.now(),reviewedBy:u.uid});
   alert('This participant is already mapped to another host. A host transfer must be approved by the Administrator.');
   await hostUI(u);return;
  }
  await set(ref(db,`participantHostMapping/${pid}`),{hostUid:u.uid,hostName:h.hostName||u.email,status:'approved',mappedAt:Date.now()});
  await set(ref(db,`hostParticipantMappings/${u.uid}/${pid}`),{participantUid:pid,name:requestRecord.participantName||'',email:requestRecord.participantEmail||'',status:'approved',mappedAt:Date.now()});
 }await update(ref(db,`hostMappingRequests/${u.uid}/${pid}`),{status:action==='approve'?'approved':'rejected',reviewedAt:Date.now(),reviewedBy:u.uid});await hostUI(u);}catch(e){alert('Unable to process request: '+e.message);}});
}
async function adminUI(u){
 if(!isAdmin(u))return;
 const box=panel('adminHostTransferPanel','🔁 Host Transfer Approval','<p>Loading transfer requests…</p>');
 if(!box){console.error('Host Transfer page container is missing from administrator.html');return;}
 const req=(await get(ref(db,'hostTransferRequests'))).val()||{};
 const rows=Object.entries(req).filter(([id,x])=>x?.status==='pending');
 // Resolve UIDs using the existing participant and host profile records.
 const participantIds=[...new Set(rows.map(([pid])=>pid))];
 const hostIds=[...new Set(rows.flatMap(([pid,x])=>[x?.currentHostUid,x?.requestedHostUid]).filter(Boolean))];
 const [participantSnaps,hostSnaps]=await Promise.all([
  Promise.all(participantIds.map(id=>get(ref(db,`participants/${id}`)))),
  Promise.all(hostIds.map(id=>get(ref(db,`hosts/${id}`))))
 ]);
 const participantNames={},hostNames={},hostRecords={};
 participantIds.forEach((id,i)=>{const p=participantSnaps[i].val()||{};participantNames[id]=p.name||p.participantName||p.fullName||p.displayName||p.email||id;});
 hostIds.forEach((id,i)=>{const h=hostSnaps[i].val()||{};hostRecords[id]=h;hostNames[id]=h.hostName||h.name||h.fullName||h.displayName||h.email||id;});
 const personLabel=(name,id)=>`${esc(name||id)} <small style="opacity:.78;font-weight:400">(${esc(id)})</small>`;
 box.innerHTML=`<h2 style="color:#ffe2a0">🔁 Host Transfer Approval</h2>${rows.length?rows.map(([pid,x])=>`<div style="padding:12px;margin:8px 0;background:#17365f;border-radius:10px"><b>Participant: ${personLabel(participantNames[pid],pid)}</b><p>Current host: ${personLabel(hostNames[x.currentHostUid],x.currentHostUid)} → Requested host: ${personLabel(hostNames[x.requestedHostUid],x.requestedHostUid)}</p><button data-transfer="approve" data-uid="${esc(pid)}">Approve transfer</button> <button data-transfer="reject" data-uid="${esc(pid)}">Reject</button></div>`).join(''):'<p>No pending transfer requests.</p>'}`;
 box.querySelectorAll('[data-transfer]').forEach(b=>b.onclick=async()=>{
  const pid=b.dataset.uid,action=b.dataset.transfer,x=req[pid];
  if(!confirm(`${action==='approve'?'Approve':'Reject'} this transfer for ${participantNames[pid]||pid}?`))return;
  try{
   if(action==='approve'){
    const next=x.requestedHostUid;
    const hs=(await get(ref(db,`approvedHostsPublic/${next}`))).val()||hostRecords[next]||{};
    await set(ref(db,`participantHostMapping/${pid}`),{hostUid:next,hostName:hs.hostName||hs.name||hs.email||next,status:'approved',mappedAt:Date.now(),transferredBy:u.uid});
    await remove(ref(db,`hostParticipantMappings/${x.currentHostUid}/${pid}`));
    await set(ref(db,`hostParticipantMappings/${next}/${pid}`),{participantUid:pid,name:participantNames[pid]||'',status:'approved',mappedAt:Date.now()});
   }
   await update(ref(db,`hostTransferRequests/${pid}`),{status:action==='approve'?'approved':'rejected',reviewedAt:Date.now(),reviewedBy:u.uid});
   await adminUI(u);
  }catch(e){alert('Transfer update failed: '+e.message);}
 });
}
onAuthStateChanged(auth,async u=>{if(!u||u.isAnonymous)return;try{const page=location.pathname.split('/').pop().toLowerCase();if(page==='student.html'||page==='')await participantUI(u);else if(page==='host.html')await hostUI(u);else if(page==='administrator.html')await adminUI(u);}catch(e){console.error('Host mapping UI could not load',e);}});
