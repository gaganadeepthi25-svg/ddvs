// Shared helpers: API calls, toast, escaping, badges, tables (used by every page)
const $=s=>document.querySelector(s),m=$('#m');let me=null,svcs=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fd=s=>s?new Date(s.replace(' ','T')+'Z').toLocaleString():'';
const badge=s=>`<span class="badge ${s}">${esc(String(s).replace(/_/g,' '))}</span>`;
function toast(t){const e=$('#toast');e.textContent=t;e.style.display='block';setTimeout(()=>e.style.display='none',3500)}
async function api(p,method='GET',body){const r=await fetch('/api'+p,{method,headers:{'Content-Type':'application/json','X-Requested-With':'ddvs'},body:body?JSON.stringify(body):undefined});
 const j=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401&&me){me=null;boot()}throw new Error(j.error||'Error')}return j}
const act=f=>async(...a)=>{try{await f(...a)}catch(e){toast(e.message)}};
const staff=()=>me&&me.role!=='citizen';
function table(a){return`<div class="card tw"><table><tr><th>Application ID</th><th>Service</th>${staff()?'<th>Applicant</th><th>Officer</th>':''}<th>Status</th><th>Updated</th><th></th></tr>${a.map(x=>`<tr><td>${esc(x.ref)}</td><td>${esc(x.service)}</td>${staff()?`<td>${esc(x.applicant)}</td><td>${esc(x.officer||'')}</td>`:''}<td>${badge(x.status)}</td><td>${fd(x.updated)}</td><td><button onclick="detail(${x.id})">Open</button></td></tr>`).join('')||'<tr><td>No applications yet.</td></tr>'}</table></div>`}
