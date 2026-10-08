import {readFile,writeFile,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const exists=async file=>{try{return (await stat(file)).size>0;}catch{return false;}};
export async function inspectRecovery(root,jobId){
  if(!/^[a-zA-Z0-9_-]+$/.test(jobId))throw Error('Invalid job ID.');
  const directory=path.join(root,'jobs',jobId),saved=JSON.parse(await readFile(path.join(directory,'job.json'),'utf8'));
  let checkpoint={};try{checkpoint=JSON.parse(await readFile(path.join(directory,'checkpoint.json'),'utf8'));}catch{}
  const shots=await Promise.all(saved.content.scenes.map(async(shot,index)=>{
    const frameSaved=await exists(path.join(directory,`frame-${index}.png`)),videoSaved=await exists(path.join(directory,`raw-${index}.mp4`));
    const entry=checkpoint[`shot-${shot.id}`]||{};
    return {sceneId:shot.id,number:index+1,location:shot.location,frameSaved,videoSaved,blockedFrame:!!entry.frameSubmitting&&!entry.taskId&&!frameSaved&&!videoSaved};
  }));
  return {shots};
}

// Called only after an explicit per-shot authorization. Original checkpoint
// bytes are kept before clearing just the ambiguous starting-image marker.
export async function authorizeFrameRetry(root,jobId,sceneId){
  const recovery=await inspectRecovery(root,jobId);
  const shot=recovery.shots.find(shot=>shot.sceneId===sceneId);
  if(!shot?.blockedFrame)throw Error('This shot does not have an unresolved starting-image request. Resume normally or import the missing media.');
  const manifest=path.join(root,'jobs',jobId,'checkpoint.json'),original=await readFile(manifest),checkpoint=JSON.parse(original.toString());
  const entry=checkpoint[`shot-${sceneId}`];
  const retryId=randomUUID(),at=new Date().toISOString();
  await writeFile(path.join(root,'jobs',jobId,`checkpoint-before-frame-retry-${retryId}.json`),original,{flag:'wx'});
  entry.frameRetries=[...(entry.frameRetries||[]),{at,authorization:'User accepted a possible additional image charge',retryId}];
  entry.frameSubmitting=false;
  await writeFile(manifest+'.tmp',JSON.stringify(checkpoint,null,2));await rename(manifest+'.tmp',manifest);
  return shot;
}
