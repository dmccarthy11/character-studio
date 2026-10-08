import {processEditJob} from './edit-worker.mjs';
import {readProviderJson} from './network-tools.mjs';
import {validateSpeech,validateVideo,download} from './media-tools.mjs';
import {readFile,writeFile,mkdir,rename,stat,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
const origin=process.env.SITE_URL;const token=process.env.WORKER_TOKEN;
if(!origin||!token)throw Error('Use npm run dev or npm start to launch the worker.');
const headers={'Content-Type':'application/json','X-Worker-Token':token};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const exists=async file=>{try{return (await stat(file)).size>0}catch{return false}};
async function api(body,raw=false){const r=await fetch(origin+'/api/worker',{method:'POST',headers,body:JSON.stringify(body)});if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||`Worker API HTTP ${r.status}`);}return raw?r:r.json();}
async function provider(url,key,body,extra={}){const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...extra},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(`Provider returned HTTP ${r.status}. Check account access, limits, and model support.`);return r;}
async function run(cmd,args){return new Promise((resolve,reject)=>{const child=spawn(cmd,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});let error='';child.stderr.on('data',b=>error=(error+b).slice(-1500));child.on('error',reject);child.on('close',code=>code?reject(Error(`FFmpeg failed: ${error}`)):resolve());});}
const stamp=s=>new Date(Math.round(s*1000)).toISOString().slice(11,23);
function startingFramePrompt(character, scene) {
  return [
    'Create one photorealistic starting frame for a vertical video.',
    'Preserve the person’s identity from the reference image.',
    `Appearance: ${character.appearance.description}`,
    `Wardrobe: ${scene.wardrobe}`,
    `Location: ${scene.location}`,
    `Lighting: ${scene.lighting}`,
    `Visual action: ${scene.action}`,
    `Composition: ${scene.camera}`,
    'Show a single moment at the beginning of the action.',
    'Reference images guide identity, objects, and setting only.',
    'Do not copy lettering, logos, watermarks, or graphic overlays.',
    'Do not render subtitles, captions, dialogue, or readable text.',
    'If the person is reading a phone, its screen faces the person.',
    'Show the plain back of the phone to the camera.',
    'Use unbranded props. App interfaces and branding are added later.'
  ].join('\n');
}

function videoMotionPrompt(scene) {
  return [
    `Action: ${scene.action}`,
    `Camera: ${scene.camera}`,
    'Natural, subtle movement. One continuous shot.',
    'Maintain the person, clothing, objects, and setting from the image.'
  ].join('\n').slice(0, 1000);
}
async function processJob(work){if(work.content?.pipelineVersion===2 && work.job.kind!=='ASSET_PACK')return processEditJob(work,api);const {owner,job,settings,content,character}=work;const lease={owner,jobId:job.id,leaseToken:job.leaseToken};const dir=path.join(process.env.DATA_DIR,'jobs',job.id);await mkdir(dir,{recursive:true});const manifestPath=path.join(dir,'checkpoint.json');let checkpoint={};try{checkpoint=JSON.parse(await readFile(manifestPath,'utf8'));}catch{}const save=async()=>{await writeFile(manifestPath+'.tmp',JSON.stringify(checkpoint,null,2));await rename(manifestPath+'.tmp',manifestPath);};
await writeFile(path.join(dir,'job.json'),JSON.stringify(work,null,2)); // Contains prompts/configuration, never API keys.
const progress=(stage,value,extra={})=>api({...lease,action:'progress',stage,progress:value,...extra});
const reference=async url=>{if(!url?.startsWith('/api/files/local/'))throw Error('Live jobs need uploaded or live-generated references. Sample portraits cannot be used.');const r=await api({...lease,action:'reference',url},true);return {bytes:Buffer.from(await r.arrayBuffer()),type:r.headers.get('content-type')||'image/png'};};
// Each paid submission is marked before the request. Ambiguous requests stop instead of charging again.
async function image(prompt,refs,file,label){if(await exists(file))return readFile(file);if(checkpoint[label]==='submitting')throw Error(`An earlier ${label} request has an unknown outcome. Check the provider before starting a new paid attempt. Existing files are preserved.`);await progress(`Generating ${label}`,5);checkpoint[label]='submitting';await save();let body;if(refs.length){body=new FormData();body.set('model',settings.imageModel);body.set('prompt',prompt);body.set('size','1024x1536');refs.forEach(r=>body.append('image[]',new Blob([r.bytes],{type:r.type}),'reference.png'));}else body={model:settings.imageModel,prompt,size:'1024x1536'};const response=await (await provider(`https://api.openai.com/v1/images/${refs.length?'edits':'generations'}`,process.env.IMAGE_API_KEY,body)).json();const bytes=Buffer.from(response.data[0].b64_json,'base64');await writeFile(file+'.tmp',bytes);await rename(file+'.tmp',file);checkpoint[label]='saved';await save();return bytes;}
if(job.kind==='ASSET_PACK'){if(!process.env.IMAGE_API_KEY)throw Error('IMAGE_API_KEY is missing.');const unit=Number(process.env.IMAGE_COST_ESTIMATE);if(!(unit>0))throw Error('Set IMAGE_COST_ESTIMATE in .env before live generation.');const cost=unit*job.assetTypes.length;if(cost>settings.maxJobCost)throw Error('Estimated cost exceeds the job budget.');await progress('Preparing asset pack',5,{cost});const canonical=character.assets.find(a=>a.isCanonical&&a.status==='APPROVED'&&!a.mock);let ref=canonical?await reference(canonical.url):null;for(let i=0;i<job.assetTypes.length;i++){const type=job.assetTypes[i];const prompt=`Fictional adult ${character.name}. ${character.appearance.description}. ${type} reference. Preserve the same person from the reference. Natural light. No text.`;const bytes=await image(prompt,ref?[ref]:[],path.join(dir,`asset-${i}.png`),`asset-${i}`);await api({...lease,action:'asset',assetId:`${job.id}-${i}`,type,prompt,base64:bytes.toString('base64')});if(!ref)ref={bytes,type:'image/png'};await progress(`Reference ${i+1} saved`,Math.round(90*(i+1)/job.assetTypes.length));}await api({...lease,action:'complete'});return;}
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg';if(spawnSync(ffmpeg,['-version'],{windowsHide:true,stdio:'ignore'}).status!==0)throw Error('FFmpeg is not installed or FFMPEG_PATH is incorrect. No new video calls were made.');
if(!process.env.VIDEO_API_KEY||!process.env.TTS_API_KEY)throw Error('Set VIDEO_API_KEY and TTS_API_KEY in .env.');
const rate=Number(process.env.VIDEO_COST_PER_SECOND),voice=Number(process.env.TTS_COST_ESTIMATE),imageRate=Number(process.env.IMAGE_COST_ESTIMATE);const composite=content.scenes.filter(s=>s.references.length>1).length;
if(!(rate>0)||!process.env.TTS_COST_ESTIMATE||!(voice>=0)||composite&&!(imageRate>0))throw Error('Set conservative cost estimates in .env before paid calls.');
if(content.scenes.some(s=>s.duration>10||!s.references.length))throw Error('Every scene needs a reference and must be 10 seconds or shorter.');
const cost=content.scenes.reduce((sum,s)=>sum+(s.duration<=5?5:10)*rate,0)+voice+composite*(imageRate||0);if(cost>settings.maxJobCost)throw Error('Estimated job cost exceeds the budget.');await progress('Preparing saved scene checkpoints',5,{cost});let captions='WEBVTT\n\n',elapsed=0;const normalized=[];
for(let i=0;i<content.scenes.length;i++){const scene=content.scenes[i];const raw=path.join(dir,`raw-${i}.mp4`),audio=path.join(dir,`voice-${i}.mp3`),clip=path.join(dir,`scene-${i}.mp4`);const status=checkpoint[`scene-${i}`]||{};checkpoint[`scene-${i}`]=status;
if(!await exists(raw)){let task=status.taskId||scene.externalJobId;if(!task){if(status.submitting)throw Error(`Scene ${i+1} submission outcome is unknown. Check provider history before a new attempt.`);let ref=await reference(scene.references[0]);if(scene.references.length>1){if(!process.env.IMAGE_API_KEY)throw Error('IMAGE_API_KEY is required for combined references.');const refs=[];for(const url of scene.references)refs.push(await reference(url));ref={bytes:await image(startingFramePrompt(content.snapshot, scene),refs,path.join(dir,`frame-${i}.png`),`frame-${i}`),type:'image/png'};}
await progress(`Submitting scene ${i+1}`,10+Math.round(i/content.scenes.length*65));status.submitting=true;await save();const data=await (await provider('https://api.dev.runwayml.com/v1/image_to_video',process.env.VIDEO_API_KEY,{model:settings.videoModel,promptImage:`data:${ref.type};base64,${ref.bytes.toString('base64')}`,promptText:videoMotionPrompt(scene),duration:scene.duration<=5?5:10,ratio:'720:1280'},{'X-Runway-Version':'2024-11-06'})).json();task=data.id;status.taskId=task;status.submitting=false;await save();await progress(`Generating scene ${i+1}`,10+Math.round(i/content.scenes.length*65),{sceneId:scene.id,externalJobId:task});}
let output=status.output;for(let tries=0;!output&&tries<240;tries++){await progress(`Waiting for scene ${i+1}`,10+Math.round(i/content.scenes.length*65));const result=await readProviderJson(`https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(task)}`,{Authorization:`Bearer ${process.env.VIDEO_API_KEY}`,'X-Runway-Version':'2024-11-06'},{label:'Runway task status',onRetry:async({attempt,total,reason})=>progress(`Checking scene ${i+1}: retry ${attempt+1}/${total} (${reason})`,10+Math.round(i/content.scenes.length*65))});if(result.status==='SUCCEEDED'){output=result.output[0];break;}if (['FAILED', 'CANCELED', 'CANCELLED'].includes(result.status)) {
  await writeFile(
    path.join(dir, `runway-scene-${i}-failure.json`),
    JSON.stringify(result, null, 2)
  );

  const detail = [
    result.failureCode,
    result.failure
  ].filter(Boolean).join(': ');

  throw Error(
    `Runway scene ${i + 1} ${result.status}: ` +
    `${detail || 'No additional details returned.'} ` +
    `Task: ${task}`
  );
};await delay(5000);}if(!output)throw Error('Provider timed out. Resume this job to keep polling its saved task.');status.output=output;await save();await download(raw,output,{onRetry:async({attempt,total,reason,fallback})=>progress(`Downloading scene ${i+1}: ${fallback?'trying system downloader':`retry ${attempt+1}/${total}`} (${reason})`,10+Math.round(i/content.scenes.length*65)),refresh:async()=>{const data=await readProviderJson(`https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(task)}`,{Authorization:`Bearer ${process.env.VIDEO_API_KEY}`,'X-Runway-Version':'2024-11-06'},{label:'Runway task status',onRetry:async({attempt,total,reason})=>progress(`Checking scene ${i+1}: retry ${attempt+1}/${total} (${reason})`,10+Math.round(i/content.scenes.length*65))});if(!data.output?.[0])throw Error('Saved task has no output.');status.output=data.output[0];await save();return status.output;}});}
await validateVideo(raw);if(!scene.dialogue.trim())throw Error('Legacy scene has no dialogue. Upgrade it to an explicit silent shot.');if(!await exists(audio)){await progress(`Voice for scene ${i+1}`,15+Math.round(i/content.scenes.length*65));if(status.voiceSubmitting)throw Error('A speech request has an unknown outcome. Saved video clips are safe; inspect provider history before a new attempt.');status.voiceSubmitting=true;await save();const speech=await provider('https://api.openai.com/v1/audio/speech',process.env.TTS_API_KEY,{model:settings.ttsModel,input:scene.dialogue||' ',voice:content.snapshot.voice.voiceId,response_format:'mp3',speed:content.snapshot.voice.rate});await writeFile(audio+'.tmp',Buffer.from(await speech.arrayBuffer()));await rename(audio+'.tmp',audio);status.voiceSubmitting=false;await save();}
const speechCheck=await validateSpeech(audio,scene.dialogue);if(speechCheck.duration>scene.duration+.05)throw Error(`Scene ${i+1} speech is longer than its shot. Use Repair audio & edit to rebuild without truncation.`);if(!await exists(clip)){await progress(`Assembling scene ${i+1}`,20+Math.round(i/content.scenes.length*65));await run(ffmpeg,['-y','-i',raw,'-i',audio,'-map','0:v:0','-map','1:a:0','-vf','scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30','-af','apad','-t',String(scene.duration),'-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2',clip+'.tmp.mp4']);await rename(clip+'.tmp.mp4',clip);}normalized.push(`scene-${i}.mp4`);captions+=`${i+1}\n${stamp(elapsed)} --> ${stamp(elapsed+scene.duration)}\n${scene.dialogue.replaceAll('-->','→')}\n\n`;elapsed+=scene.duration;}
await progress('Saving final video',90);const final=path.join(dir,'final.mp4');if(!await exists(final)){// Relative filenames avoid Windows drive letters and apostrophes in user folder names.
await writeFile(path.join(dir,'clips.txt'),normalized.map(f=>`file '${f}'`).join('\n'));await run(ffmpeg,['-y','-f','concat','-safe','0','-i',path.join(dir,'clips.txt'),'-c','copy','-movflags','+faststart',final+'.tmp.mp4']);await rename(final+'.tmp.mp4',final);}
await writeFile(path.join(dir,'captions.vtt'),captions);
// Copy locally without a base64 HTTP upload or arbitrary video-size limit.
if(!checkpoint.videoUrl){const key=`local/videos/${job.id}/final.mp4`;const dest=path.join(process.env.DATA_DIR,'media',...key.split('/'));await mkdir(path.dirname(dest),{recursive:true});await copyFile(final,dest);await writeFile(dest+'.metadata.json',JSON.stringify({contentType:'video/mp4'}));checkpoint.videoUrl='/api/files/'+key;const cap=dest.replace(/final\.mp4$/,'captions.vtt');await writeFile(cap,captions);await writeFile(cap+'.metadata.json',JSON.stringify({contentType:'text/vtt'}));checkpoint.captionUrl=checkpoint.videoUrl.replace(/final\.mp4$/,'captions.vtt');await save();}
await api({...lease,action:'complete',videoUrl:checkpoint.videoUrl,captionUrl:checkpoint.captionUrl});
}
console.log('Local media worker ready. Mock mode makes no provider calls.');
for(;;){try{const work=await api({action:'claim'});if(work.job){try{await processJob(work);}catch(e){console.error(e.message);await api({action:'failed',owner:work.owner,jobId:work.job.id,leaseToken:work.job.leaseToken,error:e.message}).catch(()=>{});}}else await delay(2000);}catch(e){console.error(e.message);await delay(5000);}}
