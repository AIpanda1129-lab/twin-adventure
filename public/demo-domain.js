export const levels=[0,150,300,500,800,1200,1800,2600];
export const equipment=['旅行装','木制盾牌','森林披风','探索手杖','星光背包','守护者徽章','极光之弓','苍穹羽翼'];
export const day=(time=Date.now())=>new Date(time+8*3600000).toISOString().slice(0,10);
export const week=(date)=>{let t=new Date(date+'T00:00:00Z'); t.setUTCDate(t.getUTCDate()-(t.getUTCDay()+6)%7);return t.toISOString().slice(0,10)};
export function initial(){return {version:1,children:[{id:'older',name:'哥哥',age:10},{id:'younger',name:'弟弟',age:8}],settings:{rate:30,blockMinutes:15,weekday:30,weekend:60,weekly:180},tasks:[['准时起床','早晨','在约定时间起床，穿好衣服',5,'☀'],['早间洗漱','早晨','刷牙洗脸，收好自己的用品',5,'◈'],['按时吃饭','生活','按时入座，收好自己的餐具',5,'♧'],['完成学习任务','学习','完成今日学习清单，遇到困难主动求助',10,'✎'],['每日阅读','学习','完成约定的阅读计划',5,'▤'],['整理房间','生活','书本和玩具归位，桌面整洁',5,'⌂'],['准备明天用品','夜晚','检查并整理明天的书包',5,'▣'],['晚间洗漱与休息','夜晚','完成洗漱，按约定时间上床',5,'☾']].map((a,i)=>({id:'t'+i,name:a[0],group:a[1],description:a[2],coins:a[3],icon:a[4],active:true})),ledger:[],checks:[],sessions:[],requests:[]}}
const fail=m=>{throw new Error(m)};
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export function balance(s,id){let entries=s.ledger.filter(e=>e.child===id);return {coins:entries.reduce((a,e)=>a+e.coins,0),xp:entries.reduce((a,e)=>a+e.xp,0),video:entries.reduce((a,e)=>a+(e.video||0),0),game:entries.reduce((a,e)=>a+(e.game||0),0)}}
export function settle(s,now=Date.now()){for(const x of s.sessions){if(x.status==='running'&&now>=x.end){x.status='ended';x.finished=x.end}}}
export function used(s,id,date){return s.sessions.filter(x=>x.child===id).reduce((a,x)=>{let start=Date.parse(date+'T00:00:00+08:00'),end=start+86400000;return a+Math.max(0,Math.min(x.finished??x.end,end)-Math.max(x.start,start))/1000},0)}
export function apply(s,action,p,actor,now=Date.now()){
 settle(s,now);if(actor.role!=='parent')fail('此操作需要家长账户');
 if(!p.requestId||typeof p.requestId!=='string'||p.requestId.length>100)fail('请求编号无效');
 if(s.requests.includes(p.requestId))return;
 const id=p.child, date=day(now), child=s.children.find(c=>c.id===id);
 const entry=(label,coins=0,xp=0,video=0,game=0)=>s.ledger.push({id:p.requestId,child:id,label,coins,xp,video,game,at:now,actor:actor.name});
 if(['check','exchange','start','stop','record','undo-check'].includes(action)&&!child)fail('儿童账户不存在');
 if(action==='check'){
 const t=s.tasks.find(t=>t.id===p.task&&t.active&&(!t.target||t.target==='all'||t.target===id));if(!t)fail('任务不存在或已停用');
 if(s.checks.some(c=>c.child===id&&c.date===date&&c.task===t.id&&!c.voided))fail('今天已经记录过这个任务');
 s.checks.push({child:id,date,task:t.id,name:t.name,coins:t.coins,at:now});entry('完成 · '+t.name,t.coins,t.coins);
 }else if(action==='undo-check'){
 const check=s.checks.find(c=>c.child===id&&c.date===date&&c.task===p.task&&!c.voided);if(!check)fail('没有可撤销的今日打卡');
 if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>100)fail('请填写更正原因');
 if(balance(s,id).coins<check.coins)fail('奖励已消费，当前余额不足以撤销，请联系管理员处理');
 check.voided=true;check.voidReason=p.reason;check.voidAt=now;entry('撤销打卡 · '+check.name+' · '+p.reason,-check.coins,-check.coins);
 }else if(action==='exchange'){
 if(!['video','game'].includes(p.kind))fail('请选择视频或游戏');
 const b=balance(s,id),cost=s.settings.rate,secs=s.settings.blockMinutes*60;
 if(b.coins<cost)fail('冒险币不足');
 entry(`兑换${p.kind==='video'?'视频':'游戏'} ${s.settings.blockMinutes}分钟`,-cost,0,p.kind==='video'?secs:0,p.kind==='game'?secs:0);
 }else if(action==='start'){
 if(!['video','game'].includes(p.kind)||!integer(p.minutes,1,120))fail('请输入1—120分钟');
 if(s.sessions.some(x=>x.child===id&&x.status==='running'))fail('已有计时进行中');
 const secs=p.minutes*60,b=balance(s,id);if(b[p.kind]<secs)fail('可用时长不足');
 const weekday=new Date(date+'T00:00:00Z').getUTCDay(),cap=weekday===0||weekday===6?s.settings.weekend:s.settings.weekday;
 if(used(s,id,date)+secs>cap*60)fail('超过今日电子产品时长上限');
 let total=0;const monday=week(date);for(let i=0;i<7;i++)total+=used(s,id,new Date(Date.parse(monday+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
 if(total+secs>s.settings.weekly*60)fail('超过本周电子产品时长上限');
 if(day(now+secs*1000)!==date)fail('本次使用将跨越午夜，请缩短时长');
 s.sessions.push({id:p.requestId,child:id,kind:p.kind,start:now,end:now+secs*1000,status:'running'});
 entry('开始使用 · '+(p.kind==='video'?'视频':'游戏'),0,0,p.kind==='video'?-secs:0,p.kind==='game'?-secs:0);
 }else if(action==='stop'){
 const x=s.sessions.find(x=>x.child===id&&x.status==='running');if(!x)fail('没有进行中的计时');
 const refund=Math.max(0,Math.floor((x.end-now)/1000));x.status='ended';x.finished=now;
 entry('提前结束 · 退回未用时长',0,0,x.kind==='video'?refund:0,x.kind==='game'?refund:0);
 }else if(action==='record'){
 if(!['video','game'].includes(p.kind)||!integer(p.minutes,1,120))fail('请输入1—120分钟');
 if(s.sessions.some(x=>x.child===id&&x.status==='running'))fail('请先结束当前计时');
 const secs=p.minutes*60;if(balance(s,id)[p.kind]<secs)fail('可用时长不足');
 const start=now-secs*1000;if(day(start)!==date)fail('请在当天记录实际用时');
 s.sessions.push({id:p.requestId,child:id,kind:p.kind,start,end:now,finished:now,status:'ended',manual:true});
 entry('补记已使用 · '+(p.kind==='video'?'视频':'游戏'),0,0,p.kind==='video'?-secs:0,p.kind==='game'?-secs:0);
 }else if(action==='task-edit'){
 if(!p.task||typeof p.task.name!=='string'||!p.task.name.trim()||p.task.name.length>30||typeof p.task.description!=='string'||p.task.description.length>200||!integer(p.task.coins,0,1000)||!['all','older','younger'].includes(p.task.target))fail('请检查任务名称、说明、奖励与适用孩子');
 let t=s.tasks.find(t=>t.id===p.task.id);if(!t){if(s.tasks.length>=40)fail('最多设置40个任务');t={id:p.requestId,icon:'✧',group:'自定义',active:true};s.tasks.push(t)}
 Object.assign(t,{name:p.task.name.trim(),description:p.task.description,coins:p.task.coins,target:p.task.target});entry('家长编辑任务 · '+t.name);
 }else if(action==='settings'){
 const v=p.settings;if(!v||!integer(v.rate,1,10000)||!integer(v.blockMinutes,1,120)||!integer(v.weekday,0,240)||!integer(v.weekend,0,240)||!integer(v.weekly,0,1680))fail('设置超出允许范围');
 s.settings={rate:v.rate,blockMinutes:v.blockMinutes,weekday:v.weekday,weekend:v.weekend,weekly:v.weekly};entry('家长更新兑换与使用规则');
 }else if(action==='tasks'){
 if(!Array.isArray(p.tasks)||p.tasks.length!==s.tasks.length)fail('任务设置无效');
 for(const t of s.tasks){const v=p.tasks.find(x=>x.id===t.id);if(!v||!integer(v.coins,0,1000)||typeof v.active!=='boolean')fail('任务奖励须为0—1000整数');t.coins=v.coins;t.active=v.active}entry('家长更新任务奖励');
 }else fail('不支持的操作');
 s.requests.push(p.requestId);
}
export function view(s,user,now=Date.now()){settle(s,now);let out=structuredClone(s);delete out.requests;if(user.role==='child'){out.children=out.children.filter(c=>c.id===user.child);for(const k of ['ledger','checks','sessions'])out[k]=out[k].filter(x=>x.child===user.child)}out.teamProgress=s.children.map(c=>{const plan=s.tasks.filter(t=>t.active&&(!t.target||t.target==='all'||t.target===c.id));return {id:c.id,name:c.name,total:plan.length,completed:s.checks.filter(x=>x.child===c.id&&x.date===day(now)&&!x.voided&&plan.some(t=>t.id===x.task)).length}});out.balances=Object.fromEntries(out.children.map(c=>[c.id,balance(s,c.id)]));out.today=day(now);out.serverTime=now;return out}
