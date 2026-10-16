import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
assert(process.env.DATA_DIR,'Use disposable test runner');
const base=process.env.TEST_URL;let state;
const db=new DatabaseSync(path.join(process.env.DATA_DIR,'studio.sqlite'));
const mutate=fn=>{const row=db.prepare("SELECT data FROM workspaces WHERE id='local'").get();const s=JSON.parse(row.data);fn(s);db.prepare("UPDATE workspaces SET data=?,revision=revision+1 WHERE id='local'").run(JSON.stringify(s));};
mutate(s=>{s.settings.mode='mock';});
async function action(action,data={},status=200){const r=await fetch(base+'/api/engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});const b=await r.json();assert.equal(r.status,status,JSON.stringify(b));if(b.state)state=b.state;return b;}
state=(await(await fetch(base+'/api/engine')).json()).state;const char=state.characters.find(c=>c.status==='READY');
const {id}=await action('createIdea',{characterId:char.id,format:'quiet_moment',duration:10});const input={contentId:id};await action('generateScript',input);let c=state.contents.find(c=>c.id===id);assert.equal(c.realismVersion,1);assert.equal(c.speech.length,0);assert(c.scenes.every(s=>s.kind==='silent'));
await action('approveScript',input);const audio=await action('generateAudio',input);for(let i=0;i<5;i++)await action('advanceJob',{jobId:audio.jobId});await action('approveAudio',input);
const frames=await action('generateFrames',input);for(let i=0;i<5;i++)await action('advanceJob',{jobId:frames.jobId});c=state.contents.find(c=>c.id===id);const sceneId=c.scenes[0].id;
await action('reviewFrame',{...input,sceneId});assert(state.contents.find(c=>c.id===id).scenes[0].frameApproved);
await action('saveScript',{...input,scenes:c.scenes.map((s,i)=>i?s:{...s,action:'A different action'}),speech:[]});c=state.contents.find(c=>c.id===id);assert(!c.scenes[0].frameUrl,'changed visual must invalidate frame');assert(!c.scenes[0].frameApproved);
const quoted=await action('productionQuote',input);assert(quoted.quote.total>0);
// Server-side guards, independent of disabled UI controls; no worker is launched.
mutate(s=>{const c=s.contents.find(c=>c.id===id);c.mock=false;c.status='AUDIO_READY';c.approvedVersion=c.scriptVersion;c.audioApprovedVersion=c.scriptVersion;});
assert.match((await action('generateVideo',input,400)).error,/approve every starting frame/);
mutate(s=>s.jobs.push({id:'spent',contentId:id,provider:'fixture',estimatedCost:9.95,status:'COMPLETED'}));
assert.match((await action('generateFrames',input,400)).error,/budget/);
db.close();console.log('PASS: quiet-moment format, mock frame lifecycle, per-frame approval, visual edit invalidation, quote and server-side frame/cumulative-budget gates.');
