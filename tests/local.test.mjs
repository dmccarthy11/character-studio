// Integration test against a running local server. Uses a separate workspace ID? No:
// run with DATA_DIR set to a disposable test folder, as documented.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const base=process.env.TEST_URL||'http://127.0.0.1:3000';
let state;
async function action(action,data={},fail=false){const r=await fetch(base+'/api/engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});const d=await r.json();if(fail){assert.equal(r.status,400);return d;}assert.equal(r.status,200,JSON.stringify(d));state=d.state;return d;}
const init=await fetch(base+'/api/engine');assert.equal(init.status,200);state=(await init.json()).state;
assert.equal((await fetch(base+'/api/engine',{headers:{Origin:'https://untrusted.example'}})).status,401);
const hostStatus=await new Promise((resolve,reject)=>{const r=http.get(base+'/api/engine',{headers:{Host:'untrusted.example'}},res=>{res.resume();resolve(res.statusCode)});r.on('error',reject)});assert.equal(hostStatus,401);
assert.equal((await fetch(base+'/api/worker',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'claim'})})).status,401);
const seed=structuredClone(state.characters[0]);seed.id=undefined;seed.name='Local integration test';seed.assets=[];
const created=await action('saveCharacter',{character:seed});const cid=created.id;
await action('createIdea',{characterId:cid},true);
const form=new FormData();form.set('characterId',cid);form.set('file',new Blob([await readFile('public/alex.png')],{type:'image/png'}),'reference.png');
let upload=await fetch(base+'/api/upload',{method:'POST',body:form});assert.equal(upload.status,200);state=(await upload.json()).state;
const asset=state.characters.find(c=>c.id===cid).assets[0];assert(asset.url.startsWith('/api/files/local/'));
const range=await fetch(base+asset.url,{headers:{Range:'bytes=0-31'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);
assert.equal((await fetch(base+asset.url,{headers:{Range:'bytes=999999999-'}})).status,416);
assert.equal((await fetch(base+asset.url,{headers:{Origin:'https://untrusted.example'}})).status,403);
await action('reviewAsset',{characterId:cid,assetId:asset.id,status:'APPROVED',canonical:true});await action('approveCharacter',{characterId:cid});
const {id}=await action('createIdea',{characterId:cid,rough:'Testing persistent local storage',duration:15});
await action('generateVideo',{contentId:id},true);await action('generateScript',{contentId:id});await action('approveScript',{contentId:id});await action('saveScript',{contentId:id,scenes:state.contents.find(c=>c.id===id).scenes});await action('generateVideo',{contentId:id},true);await action('approveScript',{contentId:id});await action('generateVideo',{contentId:id},true);
const audio=await action('generateAudio',{contentId:id});for(let i=0;i<5;i++)await action('advanceJob',{jobId:audio.jobId});assert.equal(state.contents.find(c=>c.id===id).status,'AUDIO_READY');await action('approveAudio',{contentId:id});
const {jobId}=await action('generateVideo',{contentId:id});for(let i=0;i<5;i++)await action('advanceJob',{jobId});await action('saveVideo',{contentId:id});const memory=state.memories.find(m=>m.source===id);assert.equal(memory.status,'PENDING');await action('saveMemory',{memory:{...memory,status:'APPROVED'}});
const final=(await (await fetch(base+'/api/engine')).json()).state;assert.equal(final.contents.find(c=>c.id===id).status,'SAVED');assert(final.memories.some(m=>m.id===memory.id&&m.status==='APPROVED'));
console.log('PASS: local character CRUD, SQLite read-back, upload and byte ranges, origin/host isolation, worker authentication, script/audio approval gates, full mock pipeline and memory review.');
console.log(`Persistence check: saved content ${id}`);
