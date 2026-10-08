import {mkdir,readFile,writeFile,rename,stat,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {speechRequest,requireVoiceCredentials} from './voice-provider.mjs';
import {readProviderJson} from './network-tools.mjs';
import {command,ffmpegPath,ffprobePath,hash,probe,inspectAudio,validateSpeech,validateVideo,download,speechInput,visualInput,planTimeline,captionsFor} from './media-tools.mjs';

const exists=async f=>{try{return (await stat(f)).size>0;}catch{return false;}};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function processEditJob(work,api,{fetchImpl=fetch,pause=delay}={}){
  const {job,content,settings,owner}=work;
  const lease={owner,jobId:job.id,leaseToken:job.leaseToken};
  const root=process.env.DATA_DIR,dir=path.join(root,'jobs',job.id);
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'job.json'),JSON.stringify(work,null,2));
  const manifest=path.join(dir,'checkpoint.json');let checkpoint={};
  try{checkpoint=JSON.parse(await readFile(manifest,'utf8'));}catch{}
  const save=async()=>{await writeFile(manifest+'.tmp',JSON.stringify(checkpoint,null,2));await rename(manifest+'.tmp',manifest);};
  const progress=(stage,value,extra={})=>api({...lease,action:'progress',stage,progress:value,...extra});
  const run=args=>command(ffmpegPath(),args);
  await command(ffmpegPath(),['-version']);await command(ffprobePath(),['-version']);
  const provider=async(url,key,body,extra={})=>{let r;try{r=await fetchImpl(url,{method:body?'POST':'GET',headers:{...(key?{Authorization:`Bearer ${key}`} : {}),...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...extra},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});}catch(e){throw Error(`Provider network failure (${e.cause?.code||'timeout or connection'}). Resume preserves submission checkpoints.`);}if(!r.ok)throw Object.assign(Error(`Provider HTTP ${r.status}. No automatic paid resubmission.`),{status:r.status});return r;};
  const reference=async url=>{if(!url?.startsWith('/api/files/local/'))throw Error('Upload approved local references before live generation.');const r=await api({...lease,action:'reference',url},true);return {bytes:Buffer.from(await r.arrayBuffer()),type:r.headers.get('content-type')||'application/octet-stream'};};
  const publish=async(file,name,type)=>{const key=`local/videos/${job.id}/${name}`,dest=path.join(root,'media',...key.split('/'));await mkdir(path.dirname(dest),{recursive:true});await copyFile(file,dest);await writeFile(dest+'.metadata.json',JSON.stringify({contentType:type}));return '/api/files/'+key;};
  const speech=structuredClone(content.speech||[]);
  if(job.kind==='AUDIO'){
    requireVoiceCredentials(content.snapshot);
    const costKey=content.snapshot.voice.provider==='elevenlabs'?'ELEVENLABS_TTS_COST_ESTIMATE':'TTS_COST_ESTIMATE';
    const unit=Number(process.env[costKey]);if(!(unit>0))throw Error(`Set ${costKey} to a conservative per-segment estimate.`);
    const pending=speech.filter(s=>!s.audioUrl).length,cost=pending*unit*2;
    if(cost>settings.maxJobCost)throw Error('Audio estimate (including one defective-response retry) exceeds the job budget.');
    await progress('Validating voice performances',5,{cost});
    for(let i=0;i<speech.length;i++){
      const segment=speech[i],file=path.join(dir,`voice-${i}.mp3`),input=speechInput(segment,content.snapshot,settings.ttsModel),inputHash=hash(input);
      const state=checkpoint[`voice-${segment.id}`]||={inputHash};
      if(state.inputHash!==inputHash)throw Error('Voice inputs changed during this job. Create a new voice attempt.');
      if(segment.audioUrl){if(segment.inputHash!==inputHash)throw Error('Cached voice belongs to different words or delivery. Regenerate this take.');if(!await exists(file)){await writeFile(file,(await reference(segment.audioUrl)).bytes);}}
      if(!segment.text.trim())throw Error('Empty speech segment. Use a silent shot instead.');
      if(!await exists(file)){
        if(state.submitting)throw Error('Speech submission outcome is unknown. Check provider history before a new voice attempt.');
        for(let attempt=state.attempts||0;attempt<2;attempt++){
          await progress(`Voice take ${i+1} of ${speech.length}`,10+Math.round(i/Math.max(1,speech.length)*75));
          state.submitting=true;state.attempts=attempt+1;await save();
          const request=speechRequest(segment,content.snapshot,settings.ttsModel);
          const r=await provider(request.url,request.key,request.body,request.headers);
          await writeFile(file+'.tmp',Buffer.from(await r.arrayBuffer()));await rename(file+'.tmp',file);
          state.submitting=false;await save();
          try{state.validation=await validateSpeech(file,segment.text);break;}catch(e){await rename(file,file+`.rejected-${attempt+1}.mp3`);state.validationError=e.message;await save();if(attempt===1)throw e;}
        }
        if(!await exists(file))throw Error('Voice attempts exhausted. Regenerate this take explicitly.');
      }
      state.validation=await validateSpeech(file,segment.text);segment.duration=state.validation.duration;segment.inputHash=inputHash;
      segment.audioUrl=await publish(file,`voice-${i}.mp3`,'audio/mpeg');await save();
      await progress(`Voice take ${i+1} validated`,15+Math.round((i+1)/Math.max(1,speech.length)*75),{speech:[segment]});
    }
    const plan=planTimeline(content,speech);await writeFile(path.join(dir,'timeline.json'),JSON.stringify(plan,null,2));
    await api({...lease,action:'audioComplete',speech,timeline:plan.clips,duration:plan.duration});return;
  }
  // Every speech file is rechecked even on resume. A nonempty cache is not sufficient.
  const audioFiles=new Map();
  for(let i=0;i<speech.length;i++){
    const segment=speech[i],file=path.join(dir,`voice-${i}.mp3`);
    if(!segment.audioUrl||segment.inputHash!==hash(speechInput(segment,content.snapshot,settings.ttsModel)))throw Error('Approve validated audio for the current script first.');
    if(!await exists(file))await writeFile(file,(await reference(segment.audioUrl)).bytes);
    segment.duration=(await validateSpeech(file,segment.text)).duration;audioFiles.set(segment.id,file);
  }
  const plan=planTimeline(content,speech);await writeFile(path.join(dir,'timeline.json'),JSON.stringify(plan,null,2));
  let sourceWork,sourceCheckpoint={};
  if(job.sourceJobId){if(!/^[a-zA-Z0-9_-]+$/.test(job.sourceJobId))throw Error('Invalid source job.');try{sourceWork=JSON.parse(await readFile(path.join(root,'jobs',job.sourceJobId,'job.json'),'utf8'));sourceCheckpoint=JSON.parse(await readFile(path.join(root,'jobs',job.sourceJobId,'checkpoint.json'),'utf8'));}catch{}}
  const rawFiles=new Map();let cost=0;
  const videoRate=Number(process.env.VIDEO_COST_PER_SECOND),imageRate=Number(process.env.IMAGE_COST_ESTIMATE),lipRate=Number(process.env.LIPSYNC_COST_PER_SECOND);
  for(let i=0;i<content.scenes.length;i++){
    const shot=content.scenes[i],clip=plan.clips[i];let raw=path.join(dir,`raw-${i}.mp4`);
    const oldIndex=sourceWork?.content?.scenes?.findIndex(s=>s.id===shot.id)??-1;
    const old=oldIndex>=0?sourceWork.content.scenes[oldIndex]:null;
    // Compare visual inputs; upgrading old dialogue-only shots to voiceover does not change saved footage.
    const comparable=s=>({location:s.location,wardrobe:s.wardrobe,action:s.action,camera:s.camera,lighting:s.lighting});
    if(!await exists(raw)&&shot.sourceUrl)await writeFile(raw,(await reference(shot.sourceUrl)).bytes);
    if(!await exists(raw)&&old&&!old.sourceUrl&&hash(comparable(old))===hash(comparable(shot))&&hash(sourceWork.content.snapshot.appearance)===hash(content.snapshot.appearance)){
      const source=path.join(root,'jobs',job.sourceJobId,`raw-${oldIndex}.mp4`);if(await exists(source)){await validateVideo(source);await copyFile(source,raw);}
    }
    if(await exists(raw)){await validateVideo(raw);rawFiles.set(shot.id,raw);}
    else{if(job.kind==='REBUILD')throw Error(`Saved footage for shot ${i+1} is unavailable or its visuals changed. Generate a new video to create footage.`);if(shot.kind==='screen')throw Error('Upload the app recording before generation.');if(clip.sourceIn+clip.duration>10.01)throw Error(`Shot ${i+1} exceeds 10 seconds after audio timing. Split it into shorter shots sharing the same speech segment.`);if(!(videoRate>0)||!(imageRate>0))throw Error('Set conservative VIDEO_COST_PER_SECOND and IMAGE_COST_ESTIMATE values.');cost+=(clip.sourceIn+clip.duration<=5?5:10)*videoRate+imageRate;}
    if(shot.kind==='speaking'){if(!process.env.LIPSYNC_API_KEY)throw Error('Speaking shots require LIPSYNC_API_KEY. Choose voiceover shots for a narration-only edit.');if(!(lipRate>0))throw Error('Set LIPSYNC_COST_PER_SECOND before paid lip sync.');cost+=clip.duration*lipRate;}
  }
  if(cost>settings.maxJobCost)throw Error('Estimated video and lip-sync cost exceeds the job budget.');await progress('Preparing audio-timed shots',5,{cost});
  const referenceCache=new Map();
  const runwayHeaders={'X-Runway-Version':'2024-11-06'};
  const statusRetry=label=>async({attempt,total,reason})=>progress(`${label}: retry ${attempt+1}/${total} (${reason})`,5);
  const runwayTask=task=>readProviderJson(`https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(task)}`,{Authorization:`Bearer ${process.env.VIDEO_API_KEY}`,...runwayHeaders},{fetchImpl,pause,label:'Runway task status',onRetry:statusRetry('Checking saved Runway task')});
  const syncTask=task=>readProviderJson(`https://api.sync.so/v2/generate/${encodeURIComponent(task)}`,{'x-api-key':process.env.LIPSYNC_API_KEY},{fetchImpl,pause,label:'Lip-sync task status',onRetry:statusRetry('Checking saved lip-sync task')});
  const downloadRetry=(label,value)=>async({attempt,total,reason,fallback})=>progress(`${label}: ${fallback?'trying system downloader':`retry ${attempt+1}/${total}`} (${reason})`,value);
  const normalized=[];
  for(let i=0;i<content.scenes.length;i++){
    const shot=content.scenes[i],clip=plan.clips[i],state=checkpoint[`shot-${shot.id}`]||={},raw=path.join(dir,`raw-${i}.mp4`);
    const visualHash=hash(visualInput(shot,content.snapshot,settings.videoModel));
    if(state.visualHash&&state.visualHash!==visualHash)throw Error('Shot inputs changed. Start a new attempt instead of reusing this checkpoint.');state.visualHash=visualHash;await save();
    if(!rawFiles.has(shot.id)){
      if(!process.env.VIDEO_API_KEY||!process.env.IMAGE_API_KEY)throw Error('VIDEO_API_KEY and IMAGE_API_KEY are required for new footage.');
      const frame=path.join(dir,`frame-${i}.png`);
      if(!await exists(frame)){
        await progress(`Starting frame ${i+1}`,10+i/content.scenes.length*60);
        if(state.frameSubmitting)throw Error(`Starting frame submission outcome is unknown for shot ${i+1}. Import a saved starting image or authorize its retry in the recovery panel. Existing paid outputs are preserved.`);
        const form=new FormData();form.set('model',settings.imageModel);form.set('size','1024x1536');
        form.set('prompt',`One candid vertical phone-camera frame. Preserve the fictional adult identity from approved references. Appearance: ${content.snapshot.appearance.description}. Wardrobe: ${shot.wardrobe}. Location: ${shot.location}. Lighting: ${shot.lighting}. Composition: ${shot.camera}. Beginning of action: ${shot.action}. Natural skin texture and ordinary surroundings. No lettering, readable screens, captions, logos or watermarks. Phone screen faces the character; plain back faces camera.`);
        if(!shot.references?.length)throw Error('Each generated shot needs an approved identity reference.');
        for(const url of shot.references){if(!referenceCache.has(url))referenceCache.set(url,await reference(url));const ref=referenceCache.get(url);form.append('image[]',new Blob([ref.bytes],{type:ref.type}),'reference.png');}
        await progress(`Starting frame ${i+1}`,10+i/content.scenes.length*60);state.frameSubmitting=true;await save();
        const data=await (await provider('https://api.openai.com/v1/images/edits',process.env.IMAGE_API_KEY,form)).json();
        await writeFile(frame+'.tmp',Buffer.from(data.data[0].b64_json,'base64'));await rename(frame+'.tmp',frame);state.frameSubmitting=false;await save();
      }
      if(!state.taskId){if(state.submitting)throw Error('Video submission outcome is unknown. Check provider history; do not repeat the paid request.');await progress(`Submitting shot ${i+1}`,10+i/content.scenes.length*60);state.submitting=true;await save();const data=await (await provider('https://api.dev.runwayml.com/v1/image_to_video',process.env.VIDEO_API_KEY,{model:settings.videoModel,promptImage:`data:image/png;base64,${(await readFile(frame)).toString('base64')}`,promptText:`Action: ${shot.action}. Camera: ${shot.camera}. Natural subtle movement, preserve identity, wardrobe and surroundings. One continuous candid phone video. ${shot.kind==='speaking'?'Face remains clearly visible, natural restrained expression.':'The person is not talking; relaxed closed mouth. No lip movements imitating speech.'}`.slice(0,1000),duration:clip.sourceIn+clip.duration<=5?5:10,ratio:'720:1280'},runwayHeaders)).json();state.taskId=data.id;state.submitting=false;await save();}
      for(let tries=0;!state.output&&tries<240;tries++){await progress(`Generating shot ${i+1}`,15+i/content.scenes.length*60);const result=await runwayTask(state.taskId);if(result.status==='SUCCEEDED'){state.output=result.output?.[0];await save();break;}if(['FAILED','CANCELLED','CANCELED'].includes(result.status)){await writeFile(path.join(dir,`runway-shot-${i}-failure.json`),JSON.stringify(result,null,2));throw Error(`Runway shot ${i+1} failed: ${result.failureCode||'unknown'} (${state.taskId}).`);}await delay(5000);}
      if(!state.output)throw Error('Video task is still pending. Resume to keep polling the saved task.');
      await progress(`Downloading saved shot ${i+1}`,20+i/content.scenes.length*60);
      await download(raw,state.output,{fetchImpl,pause,onRetry:downloadRetry(`Downloading saved shot ${i+1}`,20+i/content.scenes.length*60),refresh:async()=>{const data=await runwayTask(state.taskId);if(!data.output?.[0])throw Error('Task has no downloadable output.');state.output=data.output[0];await save();return state.output;}});rawFiles.set(shot.id,raw);
    }
    const available=await validateVideo(raw);if(available+.05<clip.sourceIn+clip.duration)throw Error(`Shot ${i+1} has ${available.toFixed(2)}s of saved footage but needs ${(clip.sourceIn+clip.duration).toFixed(2)}s. Shorten/split the shot; audio will not be truncated.`);
    const prepared=path.join(dir,`prepared-${i}.mp4`),editHash=hash({visualHash,sourceIn:clip.sourceIn,duration:clip.duration,rawSize:(await stat(raw)).size,sourceUrl:shot.sourceUrl});
    if(!await exists(prepared)||state.editHash!==editHash){await progress(`Editing shot ${i+1}`,25+i/content.scenes.length*60);await run(['-y','-ss',String(clip.sourceIn),'-i',raw,'-t',String(clip.duration),'-an','-vf','scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,setpts=PTS-STARTPTS','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p',prepared+'.tmp.mp4']);await rename(prepared+'.tmp.mp4',prepared);state.editHash=editHash;state.lipHash=undefined;await save();}
    let visual=prepared;
    if(shot.kind==='speaking'){
      const group=plan.groups.find(g=>g.speechId===shot.speechId),voiceSlice=path.join(dir,`lip-voice-${i}.wav`),synced=path.join(dir,`synced-${i}.mp4`);
      const lipHash=hash({editHash,speechHash:speech.find(s=>s.id===shot.speechId).inputHash,start:clip.start-group.start,model:process.env.LIPSYNC_MODEL||'lipsync-2-pro'});
      const oldLip=sourceCheckpoint[`shot-${shot.id}`];
      if(!state.lipHash&&oldLip?.lipHash===lipHash){const oldIndex=sourceWork.content.scenes.findIndex(s=>s.id===shot.id);const oldFile=path.join(root,'jobs',job.sourceJobId,`synced-${oldIndex}.mp4`);if(await exists(oldFile)){await copyFile(oldFile,synced);state.syncedHash=lipHash;}state.lipHash=lipHash;state.lipTask=oldLip.lipTask;state.lipOutput=oldLip.lipOutput;state.lipSubmitting=oldLip.lipSubmitting;await save();}
      if(state.lipHash!==lipHash){state.lipHash=lipHash;state.lipTask=undefined;state.lipOutput=undefined;state.lipSubmitting=false;await save();}
      if(!await exists(synced)||state.syncedHash!==lipHash){
        await run(['-y','-i',audioFiles.get(shot.speechId),'-af',`atrim=start=${clip.start-group.start}:duration=${clip.duration},asetpts=PTS-STARTPTS,apad`,'-t',String(clip.duration),'-ar','48000','-ac','2',voiceSlice]);
        if((await inspectAudio(voiceSlice)).maxDb<-45)throw Error(`Speaking shot ${i+1} occurs after its voice take ends. Move the cut or choose supporting footage.`);
        if(!state.lipTask){
          await progress(`Synchronizing speech in shot ${i+1}`,30+i/content.scenes.length*60);
          if(state.lipSubmitting)throw Error(`Lip-sync submission outcome is unknown for shot ${i+1}. Check the provider before another attempt.`);
          const form=new FormData();form.set('model',process.env.LIPSYNC_MODEL||'lipsync-2-pro');form.set('video',new Blob([await readFile(prepared)],{type:'video/mp4'}),'video.mp4');form.set('audio',new Blob([await readFile(voiceSlice)],{type:'audio/wav'}),'audio.wav');
          state.lipSubmitting=true;await save();
          let data;
          try{
            data=await (await provider('https://api.sync.so/v2/generate',null,form,{'x-api-key':process.env.LIPSYNC_API_KEY,'Idempotency-Key':`${job.id}-${i}-${lipHash.slice(0,16)}`})).json();
          }catch(error){
            // A billing rejection is definitive; a lost response remains ambiguous.
            if(error.status===402){
              state.lipSubmitting=false;state.lipRejection={status:402,at:new Date().toISOString()};await save();
              throw Error(`Sync rejected lip sync for shot ${i+1} (HTTP 402: billing or plan limits). Update Sync billing, then Resume saved job.`);
            }
            throw error;
          }
          if(typeof data?.id!=='string'||!data.id.trim())throw Error(`Lip-sync submission outcome is unknown for shot ${i+1}: provider returned no task ID. Check the provider before another attempt.`);
          state.lipTask=data.id;state.lipSubmitting=false;delete state.lipRejection;await save();
        }
        for(let tries=0;!state.lipOutput&&tries<240;tries++){await progress(`Waiting for lip sync ${i+1}`,35+i/content.scenes.length*60);const data=await syncTask(state.lipTask);if(data.status==='COMPLETED'){state.lipOutput=data.outputUrl;await save();break;}if(['FAILED','REJECTED'].includes(data.status))throw Error(`Lip sync failed (${data.errorCode||data.status}). Saved footage is preserved.`);await delay(5000);}
        if(!state.lipOutput)throw Error('Lip sync is still pending. Resume this job.');await download(synced,state.lipOutput,{fetchImpl,pause,onRetry:downloadRetry(`Downloading lip-sync shot ${i+1}`,40+i/content.scenes.length*60),refresh:async()=>{const data=await syncTask(state.lipTask);if(!data.outputUrl)throw Error('Saved lip-sync task has no downloadable output.');state.lipOutput=data.outputUrl;await save();return state.lipOutput;}});state.syncedHash=lipHash;await save();
      }visual=synced;
    }
    // All sources, including lip-sync outputs, have identical video timestamps and no competing audio.
    const normalizedFile=path.join(dir,`scene-${i}.mp4`);
    const normalizedHash=hash({editHash,lip:shot.kind==='speaking'?state.syncedHash:null});
    if(!await exists(normalizedFile)||state.normalizedHash!==normalizedHash){await run(['-y','-i',visual,'-t',String(clip.duration),'-an','-vf','scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,setpts=PTS-STARTPTS','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p',normalizedFile+'.tmp.mp4']);await rename(normalizedFile+'.tmp.mp4',normalizedFile);state.normalizedHash=normalizedHash;await save();}
    normalized.push(`scene-${i}.mp4`);
  }
  await progress('Mixing uninterrupted speech and rendering export',90);
  await writeFile(path.join(dir,'clips.txt'),normalized.map(f=>`file '${f}'`).join('\n'));
  const video=path.join(dir,'picture.mp4');await run(['-y','-f','concat','-safe','0','-i',path.join(dir,'clips.txt'),'-an','-c:v','copy',video]);
  const master=path.join(dir,'master.wav'),args=['-y','-f','lavfi','-i',`anullsrc=r=48000:cl=stereo:d=${plan.duration}`],filters=[],mix=['[0:a]'];let n=1;
  for(const group of plan.groups.filter(g=>g.speechId)){args.push('-i',audioFiles.get(group.speechId));filters.push(`[${n}:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,adelay=${Math.round(group.start*1000)}:all=1[a${n}]`);mix.push(`[a${n}]`);n++;}
  for(let i=0;i<(content.soundtracks||[]).length;i++){const track=content.soundtracks[i],file=path.join(dir,`sound-${i}.bin`);await writeFile(file,(await reference(track.url)).bytes);const stats=await inspectAudio(file);if(!(stats.duration>track.sourceIn))throw Error('Sound track trim starts after the audio ends.');args.push('-stream_loop','-1','-ss',String(track.sourceIn),'-i',file);filters.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,volume=${track.volumeDb}dB[a${n}]`);mix.push(`[a${n}]`);n++;}
  filters.push(`${mix.join('')}amix=inputs=${mix.length}:duration=first:normalize=0,alimiter=limit=0.95:latency=1[out]`);
  await run([...args,'-filter_complex',filters.join(';'),'-map','[out]','-t',String(plan.duration),master]);
  const final=path.join(dir,'final.mp4');await run(['-y','-i',video,'-i',master,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-ar','48000','-ac','2','-movflags','+faststart',final+'.tmp.mp4']);
  const info=await probe(final+'.tmp.mp4');if(!info.streams.some(s=>s.codec_type==='audio')||Math.abs(Number(info.format.duration)-plan.duration)>.15)throw Error('Final export failed duration/audio checks.');await rename(final+'.tmp.mp4',final);
  // Check each spoken interval in the actual exported audio, not just the original MP3.
  for(let i=0;i<plan.groups.length;i++){const group=plan.groups[i];if(!group.speechId)continue;const verify=path.join(dir,`verify-${i}.wav`);await run(['-y','-ss',String(group.start),'-i',final,'-t',String(group.audioDuration),'-vn',verify]);await validateSpeech(verify,speech.find(s=>s.id===group.speechId).text);}
  const captions=path.join(dir,'captions.vtt');await writeFile(captions,captionsFor(plan,speech));
  const videoUrl=await publish(final,'final.mp4','video/mp4'),captionUrl=await publish(captions,'captions.vtt','text/vtt');
  await api({...lease,action:'complete',videoUrl,captionUrl,timeline:plan.clips,duration:plan.duration});
}
