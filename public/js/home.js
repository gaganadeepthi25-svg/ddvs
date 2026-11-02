// Home page: hero, login, citizen registration, services list
function home(){m.innerHTML=`<div class="hero"><h1>Digital Document Verification System</h1><p>Apply for certificate services, submit documents securely and track your application progress.</p></div>
<div class="grid"><div class="card"><h3>Login</h3><input id="le" placeholder="Email"><input id="lp" type="password" placeholder="Password"><button onclick="login()">Login</button></div>
<div class="card"><h3>Register as citizen</h3><input id="rn" placeholder="Full name"><input id="re" placeholder="Email"><input id="rph" placeholder="Mobile"><input id="rp" type="password" placeholder="Password (8+ chars)"><button onclick="reg()">Register</button></div></div>
<div class="card"><h3>Services</h3>${svcs.map(s=>`<p><b>${esc(s.name)}</b> – ${esc(s.info)}<br><small>Required: ${s.docs.map(esc).join(', ')}</small></p>`).join('')}</div>`}
const login=act(async()=>{await api('/login','POST',{email:$('#le').value,password:$('#lp').value});boot()});
const reg=act(async()=>{await api('/register','POST',{name:$('#rn').value,email:$('#re').value,phone:$('#rph').value,password:$('#rp').value});toast('Registered. Please login.')});
