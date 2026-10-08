import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
assert(process.env.DATA_DIR,'Voice fixtures require the disposable runner.');
const base=process.env.TEST_URL;
let state=(await (await fetch(base+'/api/engine')).json()).state;
const character=state.characters.find(c=>c.voice.sample);
assert(character,'Sample upload integration fixture must run first.');
// Only the isolated database is edited to enable live-mode provider response fixtures.
const db=new DatabaseSync(path.join(process.env.DATA_DIR,'studio.sqlite'));
function fixtureName(name){const row=db.prepare("SELECT data FROM workspaces WHERE id='local'").get();const next=JSON.parse(row.data);next.settings.mode='live';next.characters.find(c=>c.id===character.id).name=name;db.prepare("UPDATE workspaces SET data=?,revision=revision+1 WHERE id='local'").run(JSON.stringify(next));}
async function voice(action,data={},expected=200){const r=await fetch(base+'/api/character-voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,characterId:character.id,authorized:true,...data})});const d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));if(d.state)state=d.state;return d;}
const count=async()=>{try{return (await readFile(path.join(process.env.DATA_DIR,'voice-requests.jsonl'),'utf8')).trim().split('\n').length;}catch{return 0;}};
fixtureName('uncertain-voice-fixture');await voice('clone',{},400);const submitted=await count();await voice('clone',{},400);assert.equal(await count(),submitted);
let latest=(await (await fetch(base+'/api/engine')).json()).state;assert.equal(latest.characters.find(c=>c.id===character.id).voice.cloneAttempt.status,'unknown');
await voice('connect',{voiceId:'missing-voice'},400);await voice('connect',{voiceId:'fixture-reusable-voice'});assert.equal(state.characters.find(c=>c.id===character.id).voice.provider,'elevenlabs');
fixtureName('verification-voice-fixture');await voice('clone');const saved=state.characters.find(c=>c.id===character.id).voice;
assert.equal(saved.customVoiceId,'fixture-reusable-voice');assert.equal(saved.cloneAttempt.status,'ready');assert.equal(saved.cloneAttempt.requiresVerification,true);
const created=await count();await voice('clone',{},400);assert.equal(await count(),created);
const action=async(action,data)=>{const response=await fetch(base+'/api/engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));state=body.state;};
const old=state.characters.find(c=>c.id===character.id);await action('saveCharacter',{character:{...old,name:'Edited profile',voice:{voiceId:old.voice.voiceId,tone:'Lively',rate:1.1,provider:'elevenlabs'}}});
assert.equal(state.characters.find(c=>c.id===character.id).voice.customVoiceId,'fixture-reusable-voice');assert.deepEqual(state.characters.find(c=>c.id===character.id).voice.sample,saved.sample);
// A fresh sample is necessary for an intentional second clone; HTTP rejection is retryable.
const current=db.prepare("SELECT data FROM workspaces WHERE id='local'").get();const next=JSON.parse(current.data);next.characters.find(c=>c.id===character.id).voice.cloneAttempt=undefined;db.prepare("UPDATE workspaces SET data=?,revision=revision+1 WHERE id='local'").run(JSON.stringify(next));
fixtureName('rejected-voice-fixture');await voice('clone',{},400);latest=(await (await fetch(base+'/api/engine')).json()).state;assert.equal(latest.characters.find(c=>c.id===character.id).voice.cloneAttempt.status,'failed');
fixtureName('successful-voice-fixture');await voice('clone');assert.equal(state.characters.find(c=>c.id===character.id).voice.cloneAttempt.requiresVerification,false);
await voice('clone',{authorized:false},400);db.close();
console.log('PASS: voice creation persistence, verification notices, duplicate/uncertain submission guards, existing-voice recovery, HTTP rejection retry and profile edits preserving the reusable ID. All provider responses are fixtures.');
