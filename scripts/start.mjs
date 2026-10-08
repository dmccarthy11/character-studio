import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
if(Number(process.versions.node.split('.')[0])<24)throw Error('Install Node.js 24 or newer, then try again.');
if(!existsSync('node_modules/next/dist/bin/next'))throw Error('Dependencies are missing. Run npm install first.');
if(!existsSync('.env'))writeFileSync('.env',readFileSync('.env.example'));
process.loadEnvFile('.env');
const port=Number(process.env.PORT||3000);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT must be between 1024 and 65535.');
await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error(`Port ${port} is already in use. Stop the other server or change PORT in .env.`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
const data=path.resolve(process.env.DATA_DIR||'data');mkdirSync(data,{recursive:true});mkdirSync(path.join(data,'media'),{recursive:true});
const lock=path.join(data,'server.lock');
if(existsSync(lock)){const pid=Number(readFileSync(lock,'utf8'));let alive=false;try{process.kill(pid,0);alive=true;}catch{}if(alive)throw Error('This data folder is already in use by a server or backup.');unlinkSync(lock);}
const fd=openSync(lock,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);
const secretFile=path.join(data,'.worker-token');if(!existsSync(secretFile))writeFileSync(secretFile,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
const env={...process.env,DATA_DIR:data,PORT:String(port),WORKER_TOKEN:readFileSync(secretFile,'utf8').trim(),SITE_URL:`http://127.0.0.1:${port}`,NEXT_TELEMETRY_DISABLED:'1'};
const mode=process.argv[2]==='start'?'start':'dev';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next',mode,...(mode==='dev'?['--webpack']:[]),'--hostname','127.0.0.1','--port',String(port)],{cwd:root,env,stdio:'inherit'});
let worker;let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;worker?.kill();server.kill();try{unlinkSync(lock);}catch{}setTimeout(()=>process.exit(code),500).unref();}
server.on('exit',code=>stop(code||0));server.on('error',e=>{console.error(e.message);stop(1)});process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());process.on('exit',()=>{try{unlinkSync(lock)}catch{}});
for(let i=0;i<120&&!stopping;i++){try{const r=await fetch(env.SITE_URL+'/api/engine');if(r.ok){worker=spawn(process.execPath,['workers/media-worker.mjs'],{cwd:root,env,stdio:'inherit'});worker.on('exit',code=>{if(!stopping)console.error(`Media worker stopped (${code}). Restart the app before live generation.`)});console.log(`\nCharacter Studio Local: http://localhost:${port}\nDatabase and files: ${data}\nPress Ctrl+C to stop.\n`);break;}}catch{}await new Promise(r=>setTimeout(r,1000));if(i===119){console.error('Server startup timed out.');stop(1);}}
