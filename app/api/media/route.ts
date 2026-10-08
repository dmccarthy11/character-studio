import {mkdir,writeFile,stat,rm,readFile,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {readState,saveState,dataRoot} from '@/lib/engine/store';
import {storage} from '@/lib/engine/storage';
import type {Scene} from '@/lib/engine/types';
// Shared with the standalone worker; validates the actual media rather than its extension.
import {validateVideo,inspectAudio,command,ffmpegPath} from '@/workers/media-tools.mjs';
export const runtime='nodejs';
export async function POST(request:Request){let temporary='',decoded='';try{
 const user=await getChatGPTUser();if(!user)return new Response('Unauthorized',{status:401});
 const form=await request.formData(),file=form.get('file');
 const soundKind=String(form.get('soundKind')||'');const sound=['music','ambience'].includes(soundKind);
 const frame=form.get('recoveryKind')==='frame';
 if(frame){
   if(!(file instanceof File)||file.size>10*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Upload a saved PNG, JPEG or WebP starting image under 10 MB.');
   const {state}=await readState(user.userId),jobId=String(form.get('jobId')||''),sceneId=String(form.get('sceneId')||'');
   const job=state.jobs.find(j=>j.id===jobId);if(!job||!['FAILED','CANCELLED'].includes(job.status)||!job.contentId||!/^[a-zA-Z0-9_-]+$/.test(job.id))throw Error('Import a starting image into a failed or cancelled video job.');
   const content=state.contents.find(c=>c.id===job.contentId);if(!content||content.status==='GENERATING')throw Error('Cancel the active job before importing a starting image.');
   const saved=JSON.parse(await readFile(path.join(dataRoot(),'jobs',job.id,'job.json'),'utf8'));
   const index=saved.content.scenes.findIndex((s:Scene)=>s.id===sceneId);if(index<0)throw Error('This shot is not part of the saved job.');
   const target=path.join(dataRoot(),'jobs',job.id,`frame-${index}.png`);
   let present=false;try{present=(await stat(target)).size>0;}catch{}if(present)throw Error('This job already has a saved starting image for that shot.');
   const bytes=Buffer.from(await file.arrayBuffer());
   const image=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP');
   if(!image)throw Error('The file is not a PNG, JPEG or WebP image.');
   const folder=path.join(dataRoot(),'imports');await mkdir(folder,{recursive:true});temporary=path.join(folder,crypto.randomUUID()+'.tmp');decoded=temporary+'.png';await writeFile(temporary,bytes);
   await command(ffmpegPath(),['-y','-i',temporary,'-frames:v','1',decoded]);await copyFile(decoded,target,constants.COPYFILE_EXCL);
   return Response.json({state,message:'Starting image imported. Resume the saved job to use it; completed clips are preserved.'});
 }
 if(!(file instanceof File)||file.size>100*1024*1024||!(sound?['audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/ogg']:['video/mp4','video/quicktime','video/webm']).includes(file.type))throw Error(sound?'Upload an MP3, WAV, M4A or Ogg under 100 MB.':'Upload an MP4, MOV or WebM under 100 MB.');
 const {state,revision}=await readState(user.userId);const jobId=String(form.get('jobId')||''),sceneId=String(form.get('sceneId')||'');
 const job=jobId?state.jobs.find(j=>j.id===jobId):undefined;
 const content=state.contents.find(c=>c.id===(job?.contentId||String(form.get('contentId')||'')));
 if(!content||content.status==='GENERATING')throw Error('Cancel the active job before importing footage.');
 const scene=content.scenes.find(s=>s.id===sceneId);if(!sound&&!scene)throw Error('Shot not found.');
 if(jobId&&(!job||!['FAILED','CANCELLED'].includes(job.status)))throw Error('Import recovery footage into a failed or cancelled job.');
 const bytes=new Uint8Array(await file.arrayBuffer()),folder=path.join(dataRoot(),'imports');await mkdir(folder,{recursive:true});temporary=path.join(folder,crypto.randomUUID()+'.tmp');await writeFile(temporary,bytes);const duration=sound?(await inspectAudio(temporary)).duration:await validateVideo(temporary);
 if(sound){if(jobId)throw Error('Sound tracks belong to the edit, not a recovery job.');if((content.soundtracks||[]).length>=4)throw Error('Use at most four sound tracks.');const url=await storage().put(`local/sound/${crypto.randomUUID()}`,bytes,file.type);content.soundtracks=[...(content.soundtracks||[]),{id:crypto.randomUUID(),kind:soundKind as 'music'|'ambience',url,volumeDb:soundKind==='music'?-28:-24,sourceIn:0}];if(content.audioApprovedVersion===content.scriptVersion)content.status='AUDIO_READY';await saveState(user.userId,state,revision);return Response.json({state,message:'Sound track uploaded. Rebuild the edit to apply the mix.'});}
 if(job){
   if(!/^[a-zA-Z0-9_-]+$/.test(job.id))throw Error('Invalid job ID.');
   const saved=JSON.parse(await readFile(path.join(dataRoot(),'jobs',job.id,'job.json'),'utf8'));
   const index=saved.content.scenes.findIndex((s:Scene)=>s.id===sceneId);if(index<0)throw Error('This shot is not part of the saved job.');
   const target=path.join(dataRoot(),'jobs',job.id,`raw-${index}.mp4`);
   let present=false;try{present=(await stat(target)).size>0;}catch{}if(present)throw Error('This job already has saved footage for that shot. Attach a new source clip in the editor instead.');
   await mkdir(path.dirname(target),{recursive:true});await copyFile(temporary,target,constants.COPYFILE_EXCL);
 }else{scene!.sourceUrl=await storage().put(`local/sources/${crypto.randomUUID()}`,bytes,file.type);scene!.sourceIn=0;content.scriptVersion++;content.approvedVersion=undefined;content.audioApprovedVersion=undefined;content.status='SCRIPT_PENDING';content.history.push({at:new Date().toISOString(),action:'source-upload',value:{sceneId,duration}});await saveState(user.userId,state,revision);}
 return Response.json({state,message:job?'Clip imported. Resume the saved job.':`Source uploaded (${duration.toFixed(1)} seconds). Review the shot trim before approving.`});
}catch(e){return Response.json({error:e instanceof Error?e.message:'Media import failed'},{status:400});}finally{if(temporary)await rm(temporary,{force:true});if(decoded)await rm(decoded,{force:true});}}
