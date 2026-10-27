import {initial,apply,view,day} from './demo-domain.js?v=20261025-art2';
const s=initial(),actor={name:'演示家长',role:'parent'};let i=0;
for(const c of ['older','younger'])for(let d=8;d>=1;d--)for(const t of s.tasks.slice(0,c==='older'?8:6))apply(s,'check',{child:c,task:t.id,requestId:'demo'+i++},actor,Date.now()-d*86400000);
for(const c of ['older','younger']){for(const t of s.tasks.slice(0,c==='older'?3:2))apply(s,'check',{child:c,task:t.id,requestId:'demo'+i++},actor);apply(s,'exchange',{child:c,kind:'video',requestId:'demo'+i++},actor)}
export async function demoAPI(path,p){if(path==='me')return {user:actor};if(path==='state')return view(s,actor);if(path==='export')return structuredClone(s);apply(s,path,p,actor);return view(s,actor)}
