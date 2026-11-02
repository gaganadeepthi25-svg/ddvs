// App start-up: login check, top navigation, logout (loaded last)
async function boot(){try{me=await api('/me')}catch{me=null}svcs=await api('/services');nav();me?(staff()?queue():dash()):home()}
function nav(){document.body.classList.toggle('home-page',!me); // new look applies only to the logged-out home page
 $('#nav').innerHTML=me?`<span>${esc(me.name)} (${me.role.replace('_',' ')})</span><button onclick="notifs()">🔔 Alerts</button><button onclick="boot()">Dashboard</button>${me.role==='citizen'?'<button onclick="apply()">Apply</button>':''}<button onclick="logout()">Logout</button>`:''}
const logout=act(async()=>{await api('/logout','POST');boot()});
boot();
