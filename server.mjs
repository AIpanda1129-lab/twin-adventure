import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {readFileSync,mkdirSync,existsSync,copyFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initial,apply,view} from './domain.mjs';
const root=dirname(fileURLToPath(import.meta.url));const data=process.env.DATA_DIR||resolve(root,'data');mkdirSync(data,{recursive:true,mode:0o700});
const db=new DatabaseSync(resolve(data,'family.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, salt TEXT, hash TEXT, role TEXT, child TEXT); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, name TEXT, expires INTEGER);');
if(!db.prepare('SELECT id FROM state').get())db.prepare('INSERT INTO state VALUES (1,?)').run(JSON.stringify(initial()));
const secure=process.env.NODE_ENV==='production', host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||4173);
const setupToken=process.env.SETUP_TOKEN||randomBytes(24).toString('hex');
if(!db.prepare('SELECT name FROM users LIMIT 1').get())writeFileSync(resolve(data,'setup-token.txt'),setupToken,{mode:0o600});
const attempts=new Map();
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
async function body(req){let b='';for await(const chunk of req){b+=chunk;if(b.length>100000)throw new Error('请求过大')}return JSON.parse(b||'{}')}
function user(req){let token=(req.headers.cookie||'').match(/(?:^|; )session=([a-f0-9]+)/)?.[1];return token&&db.prepare('SELECT users.* FROM sessions JOIN users ON users.name=sessions.name WHERE token=? AND expires>?').get(token,Date.now())}
function createUser(name,password,role,child){if(typeof password!=='string'||password.length<8||password.length>128)throw new Error('每个密码需8—128个字符');let salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(name,salt,scryptSync(password,salt,32).toString('hex'),role,child)}
function publicUser(u){return {name:u.name,role:u.role,child:u.child}}
function backup(){const name='backup-'+new Date().toISOString().slice(0,10)+'.json';writeFileSync(resolve(data,name),db.prepare('SELECT json FROM state WHERE id=1').get().json,{mode:0o600})}
backup();setInterval(backup,3600000).unref();
http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'");
 const url=new URL(req.url,'http://localhost'), path=url.pathname;
 if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==`${secure?'https':'http'}://${req.headers.host}`)return json(res,403,{error:'来源不允许'});
 if(path==='/api/me'){const u=user(req);return json(res,200,{user:u?publicUser(u):null,needsSetup:!db.prepare('SELECT name FROM users LIMIT 1').get()})}
 if(path==='/api/setup'&&req.method==='POST'){
 if(db.prepare('SELECT name FROM users LIMIT 1').get())return json(res,409,{error:'家庭已初始化'});
 const p=await body(req);const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
 if((secure||!local)&&p.token!==setupToken)return json(res,403,{error:'需要服务器初始化口令'});
 db.exec('BEGIN IMMEDIATE');try{createUser('parent',p.parent,'parent',null);createUser('older',p.older,'child','older');createUser('younger',p.younger,'child','younger');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return json(res,200,{ok:true});
 }
 if(path==='/api/login'&&req.method==='POST'){
 const key=req.socket.remoteAddress,now=Date.now();let limit=attempts.get(key)||{n:0,until:now+600000};if(now>limit.until)limit={n:0,until:now+600000};if(limit.n>=10)return json(res,429,{error:'尝试过多，请10分钟后重试'});limit.n++;attempts.set(key,limit);
 const p=await body(req);if(typeof p.password!=='string'||p.password.length>128||typeof p.name!=='string')throw new Error('账号或密码错误');const u=db.prepare('SELECT * FROM users WHERE name=?').get(p.name);
 const hashed=scryptSync(p.password,u?.salt||'invalid',32);if(!u||!timingSafeEqual(hashed,Buffer.from(u.hash,'hex')))return json(res,401,{error:'账号或密码错误'});
 attempts.delete(key);db.prepare('DELETE FROM sessions WHERE expires<?').run(now);const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(token,u.name,now+7*86400000);res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure?'; Secure':''}`);return json(res,200,{user:publicUser(u)});
 }
 if(path.startsWith('/api/')){
 const u=user(req);if(!u)return json(res,401,{error:'请先登录'});
 if(path==='/api/logout'&&req.method==='POST'){const token=(req.headers.cookie||'').match(/session=([a-f0-9]+)/)?.[1];db.prepare('DELETE FROM sessions WHERE token=?').run(token||'');res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true})}
 if(path==='/api/state'&&req.method==='GET')return json(res,200,view(JSON.parse(db.prepare('SELECT json FROM state WHERE id=1').get().json),u));
 if(path==='/api/export'&&req.method==='GET'){if(u.role!=='parent')return json(res,403,{error:'只有家长可以导出'});return json(res,200,JSON.parse(db.prepare('SELECT json FROM state WHERE id=1').get().json))}
 if(req.method==='POST'){
 const p=await body(req);db.exec('BEGIN IMMEDIATE');try{let s=JSON.parse(db.prepare('SELECT json FROM state WHERE id=1').get().json);apply(s,path.slice(5),p,u);db.prepare('UPDATE state SET json=? WHERE id=1').run(JSON.stringify(s));db.exec('COMMIT');return json(res,200,view(s,u))}catch(e){db.exec('ROLLBACK');throw e}
 }
 return json(res,404,{error:'接口不存在'});
 }
 if(req.method!=='GET')return json(res,405,{error:'不支持的方法'});
 const file=resolve(root,'public','.'+decodeURIComponent(path==='/'?'/index.html':path));if(!file.startsWith(resolve(root,'public')+'/'))return json(res,403,{error:'不可访问'});
 if(!existsSync(file))return json(res,404,{error:'页面不存在'});
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 }catch(e){json(res,400,{error:e.message})}}).listen(port,host,()=>console.log(`双子冒险岛 http://${host}:${port}`));
