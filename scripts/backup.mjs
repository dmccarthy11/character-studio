import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync,readFileSync,openSync,writeFileSync,closeSync,unlinkSync} from 'node:fs';
import {cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
if(existsSync('.env'))process.loadEnvFile('.env');
const root=path.resolve(process.env.DATA_DIR||'data');mkdirSync(root,{recursive:true});const lock=path.join(root,'server.lock');
if(existsSync(lock)){let alive=false;try{process.kill(Number(readFileSync(lock,'utf8')),0);alive=true}catch{}if(alive)throw Error('Stop the server with Ctrl+C before creating a backup.');unlinkSync(lock);}
const fd=openSync(lock,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);
try{const dest=path.resolve('backups',new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(dest,{recursive:true});const file=path.join(root,'studio.sqlite');if(!existsSync(file))throw Error('Run the app once before backing it up.');const db=new DatabaseSync(file);await backup(db,path.join(dest,'studio.sqlite'));db.close();for(const folder of ['media','jobs'])if(existsSync(path.join(root,folder)))await cp(path.join(root,folder),path.join(dest,folder),{recursive:true});console.log(`Backup saved: ${dest}\nCopy this entire folder to another disk for protection from disk failure. API keys are not included.`);}finally{unlinkSync(lock);}
