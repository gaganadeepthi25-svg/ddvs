// DDVS - zero-dependency Node 22 server (node:sqlite). Run: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(path.join(__dirname,'ddvs.db'));
const UP=path.join(__dirname,'uploads');fs.mkdirSync(UP,{recursive:true});
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT,email TEXT UNIQUE,phone TEXT,hash TEXT,role TEXT,active INTEGER DEFAULT 1,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER,exp INTEGER);
CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY,name TEXT,info TEXT,docs TEXT);
CREATE TABLE IF NOT EXISTS apps(id INTEGER PRIMARY KEY,ref TEXT UNIQUE,user_id INTEGER,service_id INTEGER,data TEXT,status TEXT,officer_id INTEGER,created TEXT DEFAULT CURRENT_TIMESTAMP,updated TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS docs(id INTEGER PRIMARY KEY,app_id INTEGER,label TEXT,name TEXT,file TEXT,ver INTEGER,result TEXT DEFAULT 'PENDING',remark TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,app_id INTEGER,from_s TEXT,to_s TEXT,by_id INTEGER,remark TEXT,ts TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifs(id INTEGER PRIMARY KEY,user_id INTEGER,msg TEXT,app_id INTEGER,read INTEGER DEFAULT 0,ts TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT,detail TEXT,ts TEXT DEFAULT CURRENT_TIMESTAMP);`);
const q=(s,...a)=>db.prepare(s).all(...a), one=(s,...a)=>db.prepare(s).get(...a), run=(s,...a)=>db.prepare(s).run(...a);
const hash=p=>{const s=crypto.randomBytes(16).toString('hex');return s+':'+crypto.scryptSync(p,s,32).toString('hex')};
const check=(p,h)=>{const [s,k]=h.split(':');return crypto.timingSafeEqual(Buffer.from(k,'hex'),crypto.scryptSync(p,s,32))};
const audit=(u,a,d)=>run('INSERT INTO audit(user_id,action,detail) VALUES(?,?,?)',u||null,a,d||'');
// ---- seed (LOCAL DEMO ONLY) ----
if(!one('SELECT 1 x FROM users')){
 // Only the Super Admin is created by default; all other staff accounts are created from the admin dashboard.
 run('INSERT INTO users(name,email,hash,role) VALUES(?,?,?,?)','Super Admin','admin@ddvs.test',hash('Admin@123'),'admin');
 const S=[['Income Certificate','Proof of annual income.',['Aadhaar-independent ID proof','Salary/income proof']],['Residence Certificate','Proof of residence.',['ID proof','Address proof']],['Caste Certificate','Community certificate.',['ID proof','Parent certificate']],['EWS Certificate','Economically Weaker Section.',['ID proof','Income proof']],['Agricultural Land Records','Land record extract.',['ID proof','Land document']],['Disability Certificate','Disability status.',['ID proof','Medical report']],['Senior Citizen Certificate','Age-based certificate.',['Age proof','Address proof']],['Ration Card Services','Ration card application.',['ID proof','Family details']]];
 for(const s of S)run('INSERT INTO services(name,info,docs) VALUES(?,?,?)',s[0],s[1],JSON.stringify(s[2]));
}
// ---- workflow ----
const T={SUBMITTED:['OFFICER_ASSIGNED'],OFFICER_ASSIGNED:['UNDER_VERIFICATION','CORRECTION_REQUIRED','REJECTED'],RESUBMITTED:['UNDER_VERIFICATION'],UNDER_VERIFICATION:['CORRECTION_REQUIRED','APPROVED','REJECTED'],CORRECTION_REQUIRED:['RESUBMITTED']};
function move(a,to,by,remark){if(!(T[a.status]||[]).includes(to))throw new E(409,`Invalid transition ${a.status} -> ${to}`);
 run("UPDATE apps SET status=?,updated=CURRENT_TIMESTAMP WHERE id=?",to,a.id);
 run('INSERT INTO history(app_id,from_s,to_s,by_id,remark) VALUES(?,?,?,?,?)',a.id,a.status,to,by,remark||'');
 notify(a.user_id,`Application ${a.ref} is now ${to.replace(/_/g,' ')}`,a.id);audit(by,'STATUS',a.ref+' '+a.status+'->'+to);a.status=to}
const notify=(u,m,a)=>run('INSERT INTO notifs(user_id,msg,app_id) VALUES(?,?,?)',u,m,a);
class E extends Error{constructor(c,m){super(m);this.c=c}}
const STAFF=['officer','dept_admin','admin'],MGR=['dept_admin','admin'];
const canView=(u,a)=>u.role==='citizen'?a.user_id===u.id:u.role==='officer'?a.officer_id===u.id:true;
function getApp(u,id){const a=one('SELECT * FROM apps WHERE id=?',+id);if(!a||!canView(u,a))throw new E(404,'Not found');return a}
function saveDocs(a,list,u){ // validates real file type by magic bytes
 const MAGIC={pdf:b=>b.slice(0,4).toString()==='%PDF',png:b=>b[0]===0x89&&b.slice(1,4).toString()==='PNG',jpg:b=>b[0]===0xFF&&b[1]===0xD8};
 for(const d of list||[]){const b=Buffer.from(String(d.b64||''),'base64');
  if(!b.length||b.length>2*1024*1024)throw new E(400,`${d.label}: file empty or over 2 MB`);
  const ext=Object.keys(MAGIC).find(k=>MAGIC[k](b));if(!ext)throw new E(400,`${d.label}: only PDF/JPG/PNG allowed`);
  const f=crypto.randomBytes(16).toString('hex')+'.'+ext,prev=one('SELECT MAX(ver) v FROM docs WHERE app_id=? AND label=?',a.id,d.label);
  fs.writeFileSync(path.join(UP,f),b);
  run('INSERT INTO docs(app_id,label,name,file,ver) VALUES(?,?,?,?,?)',a.id,String(d.label).slice(0,80),String(d.name||'file').slice(0,120),f,(prev.v||0)+1)}}
const currentDocs=id=>q('SELECT * FROM docs d WHERE app_id=? AND ver=(SELECT MAX(ver) FROM docs WHERE app_id=d.app_id AND label=d.label) ORDER BY id',id);
// When an officer is deactivated: end their login sessions and take back every application
// that is not finished yet, so the officer name becomes blank and an admin can assign someone else.
function releaseOfficer(officer,admin){
 run('DELETE FROM sessions WHERE user_id=?',officer.id);
 if(officer.role!=='officer')return;
 for(const a of q("SELECT * FROM apps WHERE officer_id=? AND status NOT IN('APPROVED','REJECTED')",officer.id)){
  const newStatus=a.status==='OFFICER_ASSIGNED'?'SUBMITTED':a.status; // not yet started -> back to the unassigned stage
  run('UPDATE apps SET officer_id=NULL,status=?,updated=CURRENT_TIMESTAMP WHERE id=?',newStatus,a.id);
  run('INSERT INTO history(app_id,from_s,to_s,by_id,remark) VALUES(?,?,?,?,?)',a.id,a.status,newStatus,admin.id,'Officer account deactivated - application is unassigned');
 }
}
// ---- routes ----
const routes=[];const R=(m,p,f)=>routes.push([m,new RegExp('^'+p.replace(/:id/g,'(\\d+)')+'$'),f]);
const fails={};
R('POST','/api/register',(b)=>{const{name,email,phone,password}=b;if(!name||!/^\S+@\S+\.\S+$/.test(email||'')||(password||'').length<8)throw new E(400,'Name, valid email and password (8+ chars) required');
 if(one('SELECT 1 x FROM users WHERE email=?',email.toLowerCase()))throw new E(409,'Email already registered');
 run('INSERT INTO users(name,email,phone,hash,role) VALUES(?,?,?,?,?)',name.slice(0,100),email.toLowerCase(),phone||'',hash(password),'citizen');audit(null,'REGISTER',email);return{ok:1}});
R('POST','/api/login',(b,u,req,res)=>{const k=req.socket.remoteAddress+(b.email||'');if((fails[k]||0)>=5)throw new E(429,'Too many attempts; restart server or wait');
 const x=one('SELECT * FROM users WHERE email=?',String(b.email||'').toLowerCase());
 if(!x||!x.active||!check(String(b.password||''),x.hash)){fails[k]=(fails[k]||0)+1;setTimeout(()=>delete fails[k],6e5);throw new E(401,'Invalid credentials')}
 const t=crypto.randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',t,x.id,Date.now()+36e5*8);
 res.setHeader('Set-Cookie',`sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);audit(x.id,'LOGIN','');return{id:x.id,name:x.name,role:x.role}});
R('POST','/api/logout',(b,u,req,res)=>{run('DELETE FROM sessions WHERE user_id=?',u.id);res.setHeader('Set-Cookie','sid=; Max-Age=0; Path=/');return{ok:1}});
R('GET','/api/me',(b,u)=>({id:u.id,name:u.name,role:u.role}));
R('GET','/api/services',()=>q('SELECT * FROM services').map(s=>({...s,docs:JSON.parse(s.docs)})));
R('POST','/api/apps',(b,u)=>{if(u.role!=='citizen')throw new E(403,'Citizens only');const s=one('SELECT * FROM services WHERE id=?',+b.service_id);if(!s)throw new E(400,'Unknown service');
 const need=JSON.parse(s.docs),got=(b.docs||[]).map(d=>d.label);if(need.some(n=>!got.includes(n)))throw new E(400,'All required documents must be uploaded');
 const ref='DDVS-'+new Date().getFullYear()+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
 db.exec('BEGIN');try{const r=run('INSERT INTO apps(ref,user_id,service_id,data,status) VALUES(?,?,?,?,?)',ref,u.id,s.id,JSON.stringify(b.data||{}),'SUBMITTED');
  const a=one('SELECT * FROM apps WHERE id=?',r.lastInsertRowid);saveDocs(a,b.docs,u);
  run('INSERT INTO history(app_id,from_s,to_s,by_id,remark) VALUES(?,?,?,?,?)',a.id,null,'SUBMITTED',u.id,'Application submitted');
  notify(u.id,`Application ${ref} submitted successfully`,a.id);db.exec('COMMIT');audit(u.id,'SUBMIT',ref);return{id:a.id,ref}}catch(e){db.exec('ROLLBACK');throw e}});
R('GET','/api/apps',(b,u)=>{const w=u.role==='citizen'?'a.user_id='+u.id:u.role==='officer'?'a.officer_id='+u.id:'1=1';
 return q(`SELECT a.id,a.ref,a.status,a.created,a.updated,s.name service,p.name applicant,o.name officer FROM apps a JOIN services s ON s.id=a.service_id JOIN users p ON p.id=a.user_id LEFT JOIN users o ON o.id=a.officer_id WHERE ${w} ORDER BY a.updated DESC LIMIT 200`)});
R('GET','/api/apps/:id',(b,u,req,res,m)=>{const a=getApp(u,m[1]);const s=one('SELECT * FROM services WHERE id=?',a.service_id);
 return{...a,data:JSON.parse(a.data),service:s.name,required:JSON.parse(s.docs),docs:currentDocs(a.id).map(({file,...d})=>d),
  history:q('SELECT h.*,u.name by_name FROM history h LEFT JOIN users u ON u.id=h.by_id WHERE app_id=? ORDER BY h.id',a.id),
  applicant:u.role==='citizen'?undefined:one('SELECT name,email,phone FROM users WHERE id=?',a.user_id),
  officer:(one('SELECT name FROM users WHERE id=?',a.officer_id)||{}).name}});
R('POST','/api/apps/:id/resubmit',(b,u,req,res,m)=>{const a=getApp(u,m[1]);if(a.user_id!==u.id||a.status!=='CORRECTION_REQUIRED')throw new E(409,'Not awaiting correction');
 saveDocs(a,b.docs,u);run("UPDATE docs SET result='PENDING' WHERE app_id=? AND result!='VALID' AND ver=(SELECT MAX(ver) FROM docs d2 WHERE d2.app_id=docs.app_id AND d2.label=docs.label)",a.id);
 move(a,'RESUBMITTED',u.id,'Corrected documents uploaded');if(a.officer_id)notify(a.officer_id,`${a.ref} resubmitted`,a.id);return{ok:1}});
R('GET','/api/docs/:id/file',(b,u,req,res,m)=>{const d=one('SELECT * FROM docs WHERE id=?',+m[1]);if(!d)throw new E(404,'Not found');getApp(u,d.app_id);audit(u.id,'VIEW_DOC',String(d.id));
 const ext=d.file.split('.').pop();res.writeHead(200,{'Content-Type':{pdf:'application/pdf',png:'image/png',jpg:'image/jpeg'}[ext],'Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});res.end(fs.readFileSync(path.join(UP,d.file)));return null});
R('GET','/api/officers',(b,u)=>{if(!MGR.includes(u.role))throw new E(403,'Forbidden');return q("SELECT u.id,u.name,(SELECT COUNT(*) FROM apps WHERE officer_id=u.id AND status NOT IN('APPROVED','REJECTED')) load FROM users u WHERE role='officer' AND active=1")});
R('POST','/api/apps/:id/assign',(b,u,req,res,m)=>{if(!MGR.includes(u.role))throw new E(403,'Forbidden');const a=getApp(u,m[1]);const o=one("SELECT * FROM users WHERE id=? AND role='officer' AND active=1",+b.officer_id);if(!o)throw new E(400,'Invalid officer');
 if(['APPROVED','REJECTED'].includes(a.status))throw new E(409,'Application is closed');run('UPDATE apps SET officer_id=? WHERE id=?',o.id,a.id);
 if(a.status==='SUBMITTED')move(a,'OFFICER_ASSIGNED',u.id,'Assigned to '+o.name);else run('INSERT INTO history(app_id,from_s,to_s,by_id,remark) VALUES(?,?,?,?,?)',a.id,a.status,a.status,u.id,'Reassigned to '+o.name);
 notify(o.id,`Application ${a.ref} assigned to you`,a.id);audit(u.id,'ASSIGN',a.ref);return{ok:1}});
R('POST','/api/docs/:id/verify',(b,u,req,res,m)=>{if(u.role!=='officer')throw new E(403,'Officers only');const d=one('SELECT * FROM docs WHERE id=?',+m[1]);if(!d)throw new E(404,'Not found');const a=getApp(u,d.app_id);
 if(!['VALID','INVALID','CLARIFY'].includes(b.result))throw new E(400,'Bad result');if(['OFFICER_ASSIGNED','RESUBMITTED'].includes(a.status))move(a,'UNDER_VERIFICATION',u.id,'Verification started');
 if(a.status!=='UNDER_VERIFICATION')throw new E(409,'Not under verification');run('UPDATE docs SET result=?,remark=? WHERE id=?',b.result,String(b.remark||'').slice(0,500),d.id);audit(u.id,'VERIFY_DOC',d.id+':'+b.result);return{ok:1}});
R('POST','/api/apps/:id/decision',(b,u,req,res,m)=>{if(u.role!=='officer')throw new E(403,'Officers only');const a=getApp(u,m[1]);const remark=String(b.remark||'').slice(0,500);
 if(['OFFICER_ASSIGNED','RESUBMITTED'].includes(a.status))move(a,'UNDER_VERIFICATION',u.id,'Verification started');
 if(b.action==='approve'){if(currentDocs(a.id).some(d=>d.result!=='VALID'))throw new E(409,'All documents must be marked VALID before approval');move(a,'APPROVED',u.id,remark||'Approved')}
 else if(b.action==='reject'){if(!remark)throw new E(400,'Reason required');move(a,'REJECTED',u.id,remark)}
 else if(b.action==='correction'){if(!remark)throw new E(400,'Reason required');move(a,'CORRECTION_REQUIRED',u.id,remark)}else throw new E(400,'Bad action');return{status:a.status}});
R('GET','/api/stats',(b,u)=>{if(!MGR.includes(u.role))throw new E(403,'Forbidden');
 return{citizens:one("SELECT COUNT(*) n FROM users WHERE role='citizen'").n,officers:one("SELECT COUNT(*) n FROM users WHERE role='officer'").n,byStatus:q('SELECT status k,COUNT(*) n FROM apps GROUP BY status'),byService:q('SELECT s.name k,COUNT(*) n FROM apps a JOIN services s ON s.id=a.service_id GROUP BY s.name'),audit:u.role==='admin'?q('SELECT a.*,u.name who FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 15'):[]}});
R('GET','/api/notifs',(b,u)=>q('SELECT * FROM notifs WHERE user_id=? ORDER BY id DESC LIMIT 30',u.id));
R('POST','/api/notifs/read',(b,u)=>{run('UPDATE notifs SET read=1 WHERE user_id=?',u.id);return{ok:1}});
R('GET','/api/admin/users',(b,u)=>{if(!MGR.includes(u.role))throw new E(403,'Forbidden');return q("SELECT id,name,email,role,active FROM users WHERE role!='citizen' ORDER BY id")});
R('POST','/api/admin/users',(b,u)=>{if(!MGR.includes(u.role))throw new E(403,'Forbidden');const role=b.role;
 if(!['officer','dept_admin','admin'].includes(role)||(u.role==='dept_admin'&&role!=='officer'))throw new E(403,'You cannot create this role');
 if(!b.name||!/^\S+@\S+\.\S+$/.test(b.email||'')||(b.password||'').length<8)throw new E(400,'Name, valid email and password (8+ chars) required');
 if(one('SELECT 1 x FROM users WHERE email=?',b.email.toLowerCase()))throw new E(409,'Email already registered');
 run('INSERT INTO users(name,email,hash,role) VALUES(?,?,?,?)',b.name.slice(0,100),b.email.toLowerCase(),hash(b.password),role);audit(u.id,'CREATE_USER',b.email+' as '+role);return{ok:1}});
R('POST','/api/admin/users/:id/toggle',(b,u,req,res,m)=>{if(u.role!=='admin')throw new E(403,'Super admin only');const x=one('SELECT * FROM users WHERE id=?',+m[1]);if(!x||x.id===u.id)throw new E(400,'Cannot change this user');
 run('UPDATE users SET active=? WHERE id=?',x.active?0:1,x.id);if(x.active)releaseOfficer(x,u);audit(u.id,'TOGGLE_USER',x.email);return{ok:1}});
// ---- server ----
const PUB=['/api/login','/api/register','/api/services'];
http.createServer((req,res)=>{const url=req.url.split('?')[0];
 const H={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'"};Object.entries(H).forEach(([k,v])=>res.setHeader(k,v));
 if(!url.startsWith('/api/')){ // static files: the page itself plus its .css and .js files
  const types={'.css':'text/css','.js':'application/javascript'},ext=path.extname(url),PUBLIC=path.join(__dirname,'public');
  if(types[ext]){const f=path.join(PUBLIC,path.normalize(url));
   if(!f.startsWith(PUBLIC+path.sep)||!fs.existsSync(f)){res.statusCode=404;return res.end('Not found')}
   res.setHeader('Content-Type',types[ext]+'; charset=utf-8');return res.end(fs.readFileSync(f))}
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fs.readFileSync(path.join(PUBLIC,'index.html')))}
 let body='';req.on('data',c=>{body+=c;if(body.length>8e6)req.destroy()});
 req.on('end',()=>{try{let u=null;const sid=(req.headers.cookie||'').match(/sid=([a-f0-9]+)/);
  if(sid){u=one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.exp>? AND u.active=1',sid[1],Date.now())}
  if(!u&&!PUB.includes(url))throw new E(401,'Login required');
  if(req.method!=='GET'&&req.headers['x-requested-with']!=='ddvs')throw new E(403,'CSRF check failed'); // custom header blocks cross-site forms
  for(const [m,re,f] of routes){const mm=url.match(re);if(m===req.method&&mm){const out=f(body?JSON.parse(body):{},u,req,res,mm);if(out===null)return;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(out))}}
  throw new E(404,'No such endpoint')}catch(e){res.statusCode=e.c||500;res.setHeader('Content-Type','application/json');if(!e.c)console.error(e);res.end(JSON.stringify({error:e.c?e.message:'Server error'}))}})
}).listen(process.env.PORT||3000,()=>console.log('DDVS running on http://localhost:'+(process.env.PORT||3000)));
