// A bounded, isolated visual benchmark. Run with --env-file=.env; never changes the workspace DB.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {processFrameJob} from '../workers/frame-worker.mjs';
import {processEditJob} from '../workers/edit-worker.mjs';
import {authorizeFrameRetry} from '../workers/job-recovery.mjs';
const [stage,sourceJob,retryFlag]=process.argv.slice(2);
if(!['frame','video'].includes(stage))throw Error('Usage: node --env-file=.env scripts/quality-pilot.mjs frame <existing-job-id> | video');
const originalRoot=path.resolve(process.env.DATA_DIR||'data'),pilotRoot=path.resolve('.review/quality-pilot');
await mkdir(pilotRoot,{recursive:true});const workFile=path.join(pilotRoot,'work.json');let work;
if(stage==='frame'){
 if(!/^[a-zA-Z0-9_-]+$/.test(sourceJob||''))throw Error('Provide an existing source job ID.');
 const source=JSON.parse(await readFile(path.join(originalRoot,'jobs',sourceJob,'job.json'),'utf8'));
 const shot={id:'pilot-shot',order:1,duration:5,kind:'silent',sourceIn:0,location:'An ordinary lived-in apartment kitchen beside a window',wardrobe:'A plain charcoal cotton T-shirt',action:'The person stands by the counter, glances out of the window, then looks back with a small relaxed smile',camera:'Eye-level chest-up phone recording held by a friend, almost still',lighting:'Neutral overcast window daylight with ordinary room shadows',dialogue:''};
 work={owner:'local',job:{id:'pilot-frames',kind:'FRAMES',leaseToken:'isolated-pilot',priorCost:0},settings:{...source.settings,imageModel:'gpt-image-2',videoModel:'gen4.5',maxJobCost:2},content:{id:'isolated-quality-pilot',realismVersion:1,pipelineVersion:2,scriptVersion:1,snapshot:source.content.snapshot,scenes:[shot],speech:[],duration:5,durationMode:'natural'}};
 // Do not replace a previous benchmark's inputs or checkpoints.
 try{await writeFile(workFile,JSON.stringify(work,null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;work=JSON.parse(await readFile(workFile,'utf8'));}
}else{work=JSON.parse(await readFile(workFile,'utf8'));if(!work.content.scenes[0].frameUrl)throw Error('Generate and visually review the pilot frame first.');work.content.scenes[0].frameApproved=true;work.job={id:'pilot-video',kind:'VIDEO',leaseToken:'isolated-pilot',priorCost:Math.max(.3,Number(process.env.IMAGE_COST_ESTIMATE)||0)};}
process.env.DATA_DIR=pilotRoot;
const api=async b=>{
 if(b.action==='reference'){
   if(!b.url.startsWith('/api/files/local/'))throw Error('Pilot requires a local canonical reference.');
   const key=b.url.slice('/api/files/'.length),root=key.startsWith('local/videos/pilot-')?pilotRoot:originalRoot;
   const file=path.resolve(root,'media',key);if(!file.startsWith(path.join(root,'media')+path.sep))throw Error('Invalid media path');
   return new Response(await readFile(file),{headers:{'content-type':key.endsWith('.mp4')?'video/mp4':'image/png'}});
 }
 if(b.stage)console.log(b.stage);
 if(b.frames)for(const frame of b.frames)Object.assign(work.content.scenes.find(s=>s.id===frame.id),frame);
 if(b.rawShot)Object.assign(work.content.scenes.find(s=>s.id===b.rawShot.id),b.rawShot);
 if(b.action==='complete')console.log('Pilot export: '+path.join(pilotRoot,'jobs','pilot-video','final.mp4'));
 await writeFile(workFile,JSON.stringify(work,null,2));return {};
};
if(stage==='frame'){if(retryFlag==='--retry-frame')await authorizeFrameRetry(pilotRoot,'pilot-frames','pilot-shot');await processFrameJob(work,api);console.log('Review frame: '+path.join(pilotRoot,'jobs','pilot-frames','frame-0.png'));}
else await processEditJob(work,api);
