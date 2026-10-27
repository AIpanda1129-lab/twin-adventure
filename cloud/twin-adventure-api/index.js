const http=require('node:http');
const {randomBytes,scryptSync,timingSafeEqual,createHash}=require('node:crypto');
const {deflateRawSync,inflateRawSync}=require('node:zlib');
const tcb=require('@cloudbase/node-sdk');
const bootstrap=require('./bootstrap.json');
const environment=process.env.TCB_ENV;
const originAllowed=process.env.ALLOWED_ORIGIN;
if(!environment||!originAllowed)throw new Error('Set TCB_ENV and ALLOWED_ORIGIN for your own deployment');
const db=tcb.init({env:environment}).database();
const collection=process.env.DB_COLLECTION||'twin_adventure_private';
const sha=s=>createHash('sha256').update(s).digest('hex');
const get=async(tx,id)=>{const r=await tx.collection(collection).doc(id).get();if(r.code)throw new Error('存储暂时不可用');return Array.isArray(r.data)?r.data[0]:r.data};
const put=async(tx,id,v)=>{const r=await tx.collection(collection).doc(id).set(v);if(r.code)throw new Error('存储写入失败')};
async function readState(tx,prefix='state'){const m=await get(tx,prefix);if(!m)return null;const chunks=[];for(let i=0;i<m.parts;i++)chunks.push((await get(tx,prefix+'-'+i)).chunk);return JSON.parse(inflateRawSync(Buffer.from(chunks.join(''),'base64')).toString())}
async function writeState(tx,s,prefix='state'){const encoded=deflateRawSync(Buffer.from(JSON.stringify(s))).toString('base64');const n=Math.ceil(encoded.length/200000);if(n>40)throw new Error('记录容量接近上限，请联系管理员扩容并导出备份');for(let i=0;i<n;i++)await put(tx,prefix+'-'+i,{chunk:encoded.slice(i*200000,(i+1)*200000)});await put(tx,prefix,{parts:n,at:Date.now()})}
function makeUser(name,password,role,child){if(typeof password!=='string'||password.length<8||password.length>128)throw new Error('每个密码需8—128个字符');const salt=randomBytes(16).toString('hex');return {name,salt,hash:scryptSync(password,salt,32).toString('hex'),role,child}}
function publicUser(u){return {name:u.name,role:u.role,child:u.child}}
async function handle(action,p,token,method,ip){const {initial,apply,view,day}=await import('./domain.mjs');const now=Date.now();
 if(action==='health'){await db.runTransaction(async tx=>{await get(tx,'accounts')});return {ok:true,storage:'ready'}}
 if(action==='self-test'&&method==='POST'){
 if(typeof p.token!=='string'||sha(p.token)!==bootstrap.hash)throw new Error('无权执行检测');
 if(await get(db,'accounts'))throw new Error('家庭初始化后关闭此检测');
 const prefix='qa-'+randomBytes(6).toString('hex');let passed=false;
 try{await db.runTransaction(async tx=>{const s=initial();const a={name:'qa',role:'parent'};for(const t of s.tasks)apply(s,'check',{child:'older',task:t.id,requestId:t.id},a);apply(s,'exchange',{child:'older',kind:'video',requestId:'exchange'},a);await writeState(tx,s,prefix);const loaded=await readState(tx,prefix);const v=view(loaded,a);if(v.balances.older.coins!==15||v.balances.older.video!==900||v.balances.younger.coins!==0)throw new Error('存储核对失败');passed=true;throw new Error('QA_ROLLBACK')})}catch(e){if(e.message!=='QA_ROLLBACK')throw e}
 if(!passed||await get(db,prefix))throw new Error('事务回滚验证失败');return {ok:true,checks:['transaction-write-read','balance-and-time','child-isolation','rollback-no-test-data']};
 }
 if(action==='me'){const accounts=await get(db,'accounts');let session=token?await get(db,'session-'+sha(token)):null;let user=session?.expires>now&&accounts?.users.find(u=>u.name===session.name);return {user:user?publicUser(user):null,needsSetup:!accounts}}
 if(action==='setup'&&method==='POST'){
 if(typeof p.token!=='string'||sha(p.token)!==bootstrap.hash)throw new Error('初始化口令不正确，请查看本地交付文件');
 const users=[makeUser('parent',p.parent,'parent',null),makeUser('older',p.older,'child','older'),makeUser('younger',p.younger,'child','younger')];
 return db.runTransaction(async tx=>{if(await get(tx,'accounts'))throw new Error('家庭已经初始化');await put(tx,'accounts',{users});await writeState(tx,initial());return {ok:true}});
 }
 if(action==='login'&&method==='POST'){
 if(!['parent','older','younger'].includes(p.name)||typeof p.password!=='string'||p.password.length>128)throw new Error('账号或密码错误');
 const accounts=await get(db,'accounts');if(!accounts)throw new Error('请先建立家庭营地');
 const rateId='rate-'+p.name;const allowed=await db.runTransaction(async tx=>{let r=await get(tx,rateId);if(!r||now>=r.until)r={n:0,until:now+600000};if(r.n>=12)return false;r.n++;await put(tx,rateId,{n:r.n,until:r.until});return true});if(!allowed)throw new Error('尝试过多，请10分钟后重试');
 const user=accounts.users.find(u=>u.name===p.name),h=scryptSync(p.password,user.salt,32);if(!timingSafeEqual(h,Buffer.from(user.hash,'hex')))throw new Error('账号或密码错误');
 const sessionToken=randomBytes(32).toString('hex');await put(db,'session-'+sha(sessionToken),{name:user.name,expires:now+7*86400000});await put(db,rateId,{n:0,until:now+600000});return {user:publicUser(user),token:sessionToken};
 }
 const session=token?await get(db,'session-'+sha(token)):null,accounts=await get(db,'accounts'),user=session?.expires>now&&accounts?.users.find(u=>u.name===session.name);
 if(!user){const e=new Error('请先登录');e.status=401;throw e}
 if(action==='logout'&&method==='POST'){await put(db,'session-'+sha(token),{name:user.name,expires:0});return {ok:true}}
 if(action==='state'&&method==='GET')return db.runTransaction(async tx=>view(await readState(tx),user));
 if(action==='export'&&method==='GET'){if(user.role!=='parent')throw new Error('只有家长可以导出');return db.runTransaction(tx=>readState(tx))}
 if(method!=='POST')throw new Error('请求方式无效');
 return db.runTransaction(async tx=>{const s=await readState(tx);const before=structuredClone(s);apply(s,action,p,user,now);await writeState(tx,s);
 const slot='backup-'+Math.floor((now+28800000)/86400000)%30;const old=await get(tx,slot);if(!old||day(old.at)!==day(now))await writeState(tx,before,slot);
 return view(s,user,now)});
}
http.createServer(async(req,res)=>{const origin=req.headers.origin;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(origin){if(origin!==originAllowed){res.writeHead(403);return res.end(JSON.stringify({error:'来源不允许'}))}res.setHeader('Vary','Origin')}
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
 try{let body='';for await(const c of req){body+=c;if(body.length>100000)throw new Error('请求过大')}const url=new URL(req.url,'http://localhost'),action=url.pathname.split('/').filter(Boolean).pop();const token=(req.headers.authorization||'').replace(/^Bearer /,'');const value=await handle(action,JSON.parse(body||'{}'),token,req.method,req.socket.remoteAddress);res.writeHead(200);res.end(JSON.stringify(value))}catch(e){console.error('request failed:',e.code||e.status||'validation');res.writeHead(e.status||400);res.end(JSON.stringify({error:e.message||'操作失败，请稍后重试'}))}
}).listen(9000,'0.0.0.0');
