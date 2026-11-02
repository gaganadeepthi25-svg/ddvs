// Citizen dashboard: summary cards and own applications
async function dash(){const a=await api('/apps'),c=f=>a.filter(f).length;
 m.innerHTML=`<div class="grid">${[['Total',a.length],['Under review',c(x=>['SUBMITTED','OFFICER_ASSIGNED','UNDER_VERIFICATION','RESUBMITTED'].includes(x.status))],['Correction',c(x=>x.status==='CORRECTION_REQUIRED')],['Approved',c(x=>x.status==='APPROVED')],['Rejected',c(x=>x.status==='REJECTED')]].map(([k,v])=>`<div class="stat"><b>${v}</b>${k}</div>`).join('')}</div><br>${table(a)}`}
