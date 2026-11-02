// Notifications (Alerts) page
const notifs=act(async()=>{const n=await api('/notifs');await api('/notifs/read','POST');m.innerHTML=`<div class="card"><h3>Notifications</h3>${n.map(x=>`<p>${x.read?'':'🔵 '}<a href="#" onclick="detail(${x.app_id});return false">${esc(x.msg)}</a><br><small>${fd(x.ts)}</small></p>`).join('')||'No notifications.'}</div>`});
