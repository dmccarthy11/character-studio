import {voiceModel} from './voice-provider.mjs';
import {spawn} from 'node:child_process';
import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import {curlDownload,retryableStatus,retryableNetwork,networkReason,retryDelay} from './network-tools.mjs';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const ffmpegPath=()=>process.env.FFMPEG_PATH||'ffmpeg';
export const ffprobePath=()=>process.env.FFPROBE_PATH||(process.env.FFMPEG_PATH&&process.env.FFMPEG_PATH!=='ffmpeg'?path.join(path.dirname(process.env.FFMPEG_PATH),'ffprobe'+(process.platform==='win32'?'.exe':'')):'ffprobe');
export async function command(cmd,args){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err=(err+b).slice(-12000));p.on('error',()=>reject(Error(`Cannot run ${path.basename(cmd)}. Check its installed path.`)));p.on('close',code=>code?reject(Error(`${path.basename(cmd)} failed: ${err.slice(-1600)}`)):resolve({out,err}));});}
export async function probe(file){const {out}=await command(ffprobePath(),['-v','error','-show_entries','stream=codec_type,duration,width,height:format=duration','-of','json',file]);return JSON.parse(out);}
export async function inspectAudio(file){const info=await probe(file);if(!info.streams.some(s=>s.codec_type==='audio'))throw Error('No audio stream.');const {err}=await command(ffmpegPath(),['-hide_banner','-i',file,'-map','0:a:0','-af','volumedetect,silencedetect=noise=-45dB:d=0.8','-vn','-f','null','-']);const number=name=>Number(err.match(new RegExp(`${name}: ([\\-\\d.]+)`))?.[1]??'-Infinity');return {duration:Number(info.format.duration),meanDb:number('mean_volume'),maxDb:number('max_volume'),silence:err.split('\n').filter(s=>s.includes('silence_duration')).map(s=>Number(s.match(/silence_duration: ([\d.]+)/)?.[1]||0))};}
export async function validateSpeech(file,text){const stats=await inspectAudio(file);const words=text.trim().split(/\s+/).filter(Boolean).length;if(!words)throw Error('Speech needs spoken words. Mark non-speaking shots silent instead.');if(!Number.isFinite(stats.duration)||stats.duration<Math.max(.35,words/7)||stats.maxDb<-45||stats.meanDb<-48)throw Error(`Speech validation failed: ${stats.duration.toFixed(2)}s, peak ${stats.maxDb} dB for ${words} words. Repair this voice take; saved footage is preserved.`);if(stats.silence.some(s=>s>Math.max(2,stats.duration*.6)))throw Error('Speech contains unexpectedly long silence. Review or regenerate this voice take.');return stats;}
export async function validateVideo(file){const info=await probe(file);if(!info.streams.some(s=>s.codec_type==='video')||!(Number(info.format.duration)>0))throw Error('Downloaded file is not a valid video. Import or retry this clip.');return Number(info.format.duration);}
export async function download(file,url,{refresh,fetchImpl=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),onRetry,attempts=5,curlImpl=fetchImpl===fetch?curlDownload:null}={}){
  let current=url,reason='network failure';const temporary=file+'.tmp';
  for(let attempt=0;attempt<attempts;attempt++){
    let retry=true,refreshUrl=false,transportFailed=false;
    try{
      const response=await fetchImpl(current,{signal:AbortSignal.timeout(120000)});
      if(!response.ok){reason=`HTTP ${response.status}`;refreshUrl=[401,403,404,410].includes(response.status)&&!!refresh;retry=refreshUrl||retryableStatus(response.status);await response.body?.cancel().catch(()=>{});}
      else{
        // arrayBuffer can throw ECONNRESET even when the initial request succeeded.
        const bytes=Buffer.from(await response.arrayBuffer());await writeFile(temporary,bytes);
        await validateVideo(temporary);await rename(temporary,file);return;
      }
    }catch(error){reason=networkReason(error);retry=retryableNetwork(error);transportFailed=retry;}
    if(transportFailed&&curlImpl){
      await onRetry?.({attempt:attempt+1,total:attempts,reason,fallback:true});
      try{await curlImpl(current,temporary);await validateVideo(temporary);await rename(temporary,file);return;}
      catch(error){if(error.status){reason=`HTTP ${error.status}`;refreshUrl=[401,403,404,410].includes(error.status)&&!!refresh;retry=refreshUrl||retryableStatus(error.status);}}
    }
    await rm(temporary,{force:true});
    if(!retry||attempt===attempts-1)break;
    if(refresh&&(refreshUrl||transportFailed)){
      // A failed refresh must not discard a still usable signed download URL.
      try{const updated=await refresh();if(updated)current=updated;}catch{}
    }
    await onRetry?.({attempt:attempt+1,total:attempts,reason,fallback:false});await pause(retryDelay(attempt));
  }
  throw Error(`Clip download failed (${reason}). Resume to download the same saved output, or import its downloaded MP4. No new video generation was submitted.`);
}
export function speechInput(segment,character,model){const voice=character.voice;return {text:segment.text.trim(),delivery:segment.delivery,voice:voice.provider==='elevenlabs'?{provider:'elevenlabs',customVoiceId:voice.customVoiceId,tone:voice.tone,rate:voice.rate}:{voiceId:voice.voiceId,tone:voice.tone,rate:voice.rate},model:voiceModel(character,model)};}
export function visualInput(scene,character,model){return {location:scene.location,wardrobe:scene.wardrobe,action:scene.action,camera:scene.camera,lighting:scene.lighting,kind:scene.kind,references:scene.references,appearance:character.appearance,model};}
// Contiguous shot groups share one uninterrupted voice performance.
export function planTimeline(content,speech=content.speech||[]){const clips=[],groups=[];let elapsed=0,idealElapsed=0;const seen=new Set();for(let i=0;i<content.scenes.length;){const first=content.scenes[i],sid=first.speechId||'';let end=i+1;while(sid&&end<content.scenes.length&&content.scenes[end].speechId===sid)end++;if(sid&&seen.has(sid))throw Error('Shots sharing a speech segment must be adjacent.');if(sid)seen.add(sid);const segment=speech.find(s=>s.id===sid);if(sid&&(!segment||!(segment.duration>0)))throw Error('Generate and validate audio before planning the edit.');const shots=content.scenes.slice(i,end);const planned=shots.reduce((n,s)=>n+s.duration,0);const needed=segment?segment.duration+.2:planned;const total=content.durationMode==='exact'?planned:Math.max(planned,needed);if(content.durationMode==='exact'&&needed>planned+.01)throw Error('Speech exceeds the exact edit duration. Shorten the words or increase the shot lengths.');groups.push({speechId:sid,start:elapsed,duration:total,audioDuration:segment?.duration||0});for(const shot of shots){idealElapsed+=shot.duration*total/planned;const stop=Math.round(idealElapsed*30)/30,duration=stop-elapsed;if(duration<1/30)throw Error('Every shot needs at least one video frame.');clips.push({sceneId:shot.id,speechId:sid||undefined,start:elapsed,duration,sourceIn:shot.sourceIn||0});elapsed=stop;}groups.at(-1).duration=elapsed-groups.at(-1).start;i=end;}
if(content.durationMode==='exact'&&Math.abs(elapsed-content.duration)>.05)throw Error('Exact duration requires shot lengths to add up to the target.');for(const segment of speech)if(!seen.has(segment.id))throw Error('Every speech segment must be assigned to a shot.');return {clips,groups,duration:elapsed};}
export const vttTime=s=>new Date(Math.round(s*1000)).toISOString().slice(11,23);
export function captionsFor(plan,speech){return 'WEBVTT\n\n'+plan.groups.filter(g=>g.speechId).map((g,i)=>`${i+1}\n${vttTime(g.start)} --> ${vttTime(g.start+g.audioDuration)}\n${speech.find(s=>s.id===g.speechId).text.replaceAll('-->','→')}\n`).join('\n');}
