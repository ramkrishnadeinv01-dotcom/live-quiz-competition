// Shared subscription entitlement checks for Host Portal modules.
// A currently valid Free/Trial period retains the full trial feature set.
// Once it expires (or is inactive/missing), only public Academic/Olympiad
// mock-test management remains available to an approved individual host.
export function subscriptionIsCurrentlyValid(sub){
  if(!sub || !['active','trial'].includes(String(sub.status||'').toLowerCase())) return false;
  const today=new Date(); today.setHours(0,0,0,0);
  const parseDate=value=>{
    if(!value)return null;
    if(typeof value==='number')return new Date(value);
    const raw=String(value).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return new Date(`${raw}T00:00:00`);
    const d=new Date(raw);return Number.isNaN(d.getTime())?null:d;
  };
  const start=parseDate(sub.startDate),end=parseDate(sub.endDate);
  if(start && start>today)return false;
  if(sub.endDate && (!end || end<today))return false;
  return true;
}
