'use client';
import {useEffect,useState} from 'react';
import {Check,Clock,Loader2} from 'lucide-react';
import type {Content,Job} from '@/lib/engine/types';
import {Progress} from '@/components/ui/progress';

export function GenerationStatus({content,job,busy,onCancel,onRefresh}:{content:Content;job?:Job;busy:boolean;onCancel:()=>void;onRefresh:()=>void}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer);},[]);
 const running=job&&['QUEUED','RUNNING'].includes(job.status);
 const speech=content.speech||[],ready=speech.filter(s=>s.audioUrl).length;
 const shots=content.scenes.filter(s=>!s.sourceUrl),approved=shots.filter(s=>s.frameApproved).length;
 const framesReady=!content.realismVersion||shots.every(s=>s.frameApproved);
 const finished=['READY','SAVED'].includes(content.status);
 const scriptReady=content.approvedVersion===content.scriptVersion;
 const audioReady=scriptReady&&(content.mock?['AUDIO_READY','READY','SAVED'].includes(content.status)||content.audioApprovedVersion===content.scriptVersion:ready===speech.length);
 const step=finished?4:running?job.kind==='AUDIO'?1:job.kind==='FRAMES'?2:3:!scriptReady?0:!audioReady?1:!framesReady?2:3;
 const elapsed=Math.max(0,Math.floor((now-Date.parse(job?.createdAt||''))/1000));
 const age=job?.heartbeat?Math.max(0,Math.floor((now-job.heartbeat)/1000)):undefined;
 const quiet=running&&((age!==undefined&&age>150)||(age===undefined&&elapsed>60));
 let title='Review your script',detail='Check the shots and spoken words, then approve the script to continue.';
 if(content.status==='IDEA'){title='Create your script';detail='Generate a script from this idea to plan the shots and any narration.';}
 else if(finished){title='Your video is ready';detail='Play the finished export, then download it or save it to your library.';}
 else if(content.status==='FAILED'){title='Generation needs attention';detail=job?.error||'Review the failure details below before resuming the saved job.';}
 else if(job?.status==='CANCELLED'){title='Generation cancelled';detail='Your saved outputs are preserved. Review the script before continuing.';}
 else if(running){title=job.status==='QUEUED'?'Waiting for the media worker':job.kind==='AUDIO'?'Preparing voice previews':job.kind==='FRAMES'?'Preparing starting frames':'Rendering your video';detail=job.stage;}
 else if(audioReady&&scriptReady){
  if(!framesReady){title='Waiting for starting-frame review';detail=`${approved} of ${shots.length} generated shots have approved frames. Prepare missing frames, inspect them, then approve each before animation.`;}
  else {title=speech.length?'Voice previews ready for review':'Ready to generate video';detail=speech.length?'Listen to the voice takes below, then approve them to start animation.':'This script has no spoken words. Continue to animation when you are happy with the shots.';}
 }
 else if(scriptReady){title='Ready to prepare voice previews';detail='Use the script controls below to generate the audio you will review before animation.';}
 return <section className="panel generation-status" aria-label="Video generation status">
  <div className="row between gap wrap"><span className="eyebrow">CURRENT VIDEO · {content.snapshot.name}</span><span className={`tag ${running?'amber':finished?'green':''}`}>{running?'In progress':finished?'Ready':content.status==='FAILED'?'Needs attention':'Your turn'}</span></div>
  <p className="small muted">{content.concept.title}</p>
  <div role="status" aria-live="polite"><h2>{running?<Loader2 size={20} className="spin"/>:finished?<Check size={20}/>:<Clock size={20}/>} {title}</h2><p>{detail}</p></div>
  {!speech.length&&content.scenes.length>0&&<p className="generation-audio-note"><strong>No voice preview to wait for.</strong> This script has no narration or dialogue. Add a voice take in “Edit shots & words” if you want {content.snapshot.name}’s voice, or add music / ambience in the sound panel.</p>}
  {speech.length>0&&<p className="small muted">Voice previews: {ready} of {speech.length} available{content.mock?' · mock mode has no playable generated speech':''}.</p>}
  <ol className="generation-steps" aria-label="Production steps">{['Script','Voice','Frames','Animation','Preview'].map((label,i)=><li key={label} className={i===step?'active':i<step?'complete':''} aria-current={i===step?'step':undefined}><span>{i<step?<Check size={13}/>:i+1}</span>{label}{i===1&&!speech.length?' · no speech':''}{i===2&&!content.realismVersion?' · skipped':''}</li>)}</ol>
  {running&&<><Progress value={job.progress}/><p className="small muted">Stage progress {job.progress}% · queued {Math.floor(elapsed/60)}m {elapsed%60}s ago · {age===undefined?'Worker has not checked in yet':`Last worker update ${age}s ago`}. Progress reflects stages, not time remaining.</p>{quiet&&<div className="notice">No recent worker update. The provider may still be processing, or the worker may have stopped. Refresh status before taking recovery action; elapsed time alone does not confirm a stalled job.</div>}<div className="row gap wrap"><button className="button secondary" disabled={busy} onClick={onRefresh}>Refresh status</button><button className="text-button" disabled={busy} onClick={onCancel}>Cancel generation</button></div></>}
  {!running&&!finished&&content.status!=='FAILED'&&content.scenes.length>0&&<a className="text-button" href={audioReady&&scriptReady&&!framesReady?'#production-review':'#script-edit'}>{audioReady&&scriptReady&&!framesReady?'Go to starting frames':'Go to script & voice'} →</a>}
 </section>;
}
