import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env=process.env.TCB_ENV;
const allowed=process.env.ALLOWED_ORIGIN;
const endpoint=process.env.API_BASE;
if(!env||env==='YOUR_CLOUDBASE_ENV_ID'||!allowed||!endpoint){
 throw new Error('Copy .env.example to .env and configure your own TCB_ENV, ALLOWED_ORIGIN and API_BASE.');
}
const origin=new URL(allowed);
const api=new URL(endpoint);
if(origin.protocol!=='https:'||origin.origin!==allowed||api.protocol!=='https:'){
 throw new Error('ALLOWED_ORIGIN must be an HTTPS origin without a trailing slash or path; API_BASE must use HTTPS.');
}
const bootstrapPath=resolve(root,'cloud/twin-adventure-api/bootstrap.json');
const tokenPath=resolve(root,'cloud-setup-token.txt');
if(existsSync(bootstrapPath)!==existsSync(tokenPath)){
 throw new Error('Only one bootstrap credential file exists. Resolve the incomplete setup manually; existing credentials will not be replaced.');
}
if(!existsSync(bootstrapPath)){
 const token=randomBytes(24).toString('base64url');
 writeFileSync(tokenPath,token+'\n',{mode:0o600,flag:'wx'});
 writeFileSync(bootstrapPath,JSON.stringify({hash:createHash('sha256').update(token).digest('hex')},null,2)+'\n',{mode:0o600,flag:'wx'});
}
const config=JSON.parse(readFileSync(resolve(root,'cloudbaserc.example.json'),'utf8'));
config.envId=env;
config.functions[0].envVariables={TCB_ENV:env,ALLOWED_ORIGIN:allowed,DB_COLLECTION:process.env.DB_COLLECTION||'twin_adventure_private'};
writeFileSync(resolve(root,'cloudbaserc.json'),JSON.stringify(config,null,2)+'\n');
const base=api.href.endsWith('/')?api.href:api.href+'/';
writeFileSync(resolve(root,'public/config.js'),`// Generated for your own deployment. Review before committing.\nexport const API_BASE=location.hostname==='127.0.0.1'||location.hostname==='localhost'?'/api/':${JSON.stringify(base)};\n`);
console.log('Prepared cloudbaserc.json, public/config.js and private bootstrap credentials.');
console.log('Read cloud-setup-token.txt locally for first-time setup. Do not commit or publish it.');
