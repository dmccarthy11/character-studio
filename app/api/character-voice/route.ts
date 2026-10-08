import {mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {readState,saveState,dataRoot} from '@/lib/engine/store';
import {storage,readMedia} from '@/lib/engine/storage';
import {inspectAudio} from '@/workers/media-tools.mjs';
import {cloneVoice,checkVoice,VoiceProviderError} from '@/workers/voice-provider.mjs';

export const runtime='nodejs';
export async function POST(request:Request){let temporary='';try{
  const user=await getChatGPTUser();if(!user)return new Response('Unauthorized',{status:401});
  const {state,revision}=await readState(user.userId);
  if(request.headers.get('content-type')?.includes('multipart/form-data')){
    const form=await request.formData(),file=form.get('file');
    const character=state.characters.find(c=>c.id===String(form.get('characterId')||''));
    if(!character)throw Error('Character not found.');
    if(['submitting','unknown'].includes(character.voice.cloneAttempt?.status||''))throw Error('Resolve the previous voice creation in ElevenLabs before replacing its sample.');
    const type=file instanceof File?file.type.split(';')[0]:'';
    if(!(file instanceof File)||!file.size||file.size>25*1024*1024||!['audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/ogg','audio/webm','audio/flac','audio/x-flac'].includes(type))throw Error('Upload an MP3, WAV, M4A, Ogg, WebM or FLAC recording under 25 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const folder=path.join(dataRoot(),'imports');await mkdir(folder,{recursive:true});
    temporary=path.join(folder,crypto.randomUUID()+'.tmp');await writeFile(temporary,bytes);
    const audio=await inspectAudio(temporary);
    if(!Number.isFinite(audio.duration)||audio.duration<10||audio.duration>180||audio.maxDb<-45||audio.meanDb<-48)throw Error('Use an audible recording of one speaker, 10–180 seconds long. About 1–2 minutes of clean speech works best.');
    const url=await storage().put(`local/voices/${crypto.randomUUID()}`,bytes,type);
    character.voice.sample={url,name:file.name.slice(0,200),duration:audio.duration};character.version++;
    await saveState(user.userId,state,revision);
    return Response.json({state,message:'Voice sample saved. Create the reusable voice to use it for new speech.'});
  }
  const input=z.object({action:z.enum(['clone','connect']),characterId:z.string(),authorized:z.literal(true),voiceId:z.string().trim().min(1).max(100).optional()}).parse(await request.json());
  const character=state.characters.find(c=>c.id===input.characterId);if(!character)throw Error('Character not found.');
  if(state.settings.mode!=='live')throw Error('Switch to live mode to create or connect an ElevenLabs voice. Uploading samples works in mock mode.');
  const key=process.env.ELEVENLABS_API_KEY;if(!key)throw Error('Add ELEVENLABS_API_KEY to .env and restart the app. Voice cloning also requires access on your ElevenLabs plan.');
  if(input.action==='connect'){
    if(!input.voiceId)throw Error('Enter the voice ID from your ElevenLabs library.');
    await checkVoice(input.voiceId,key);
    const current=await readState(user.userId),target=current.state.characters.find(c=>c.id===character.id)!;
    target.voice={...target.voice,provider:'elevenlabs',customVoiceId:input.voiceId,rate:Math.min(1.2,Math.max(.7,target.voice.rate)),cloneAttempt:undefined};target.version++;
    await saveState(user.userId,current.state,current.revision);
    return Response.json({state:current.state,message:'Existing voice connected. New videos will reuse it.'});
  }
  const sample=character.voice.sample;if(!sample)throw Error('Upload a voice sample first.');
  if(character.voice.cloneAttempt?.sampleUrl===sample.url&&character.voice.cloneAttempt.status==='ready')throw Error('This sample already has a reusable voice.');
  if(['submitting','unknown'].includes(character.voice.cloneAttempt?.status||''))throw Error('Voice creation may already have succeeded. Check ElevenLabs and connect the existing voice ID to avoid creating another clone.');
  const media=await readMedia(sample.url.slice('/api/files/'.length)),bytes=new Uint8Array(await readFile(media.file));
  character.voice.cloneAttempt={sampleUrl:sample.url,status:'submitting'};
  await saveState(user.userId,state,revision); // Persist before submission to prevent duplicates on restart.
  try{
    const cloned=await cloneVoice(character.name,bytes,media.contentType,key);
    const current=await readState(user.userId),target=current.state.characters.find(c=>c.id===character.id)!;
    if(target.voice.cloneAttempt?.sampleUrl!==sample.url||target.voice.cloneAttempt.status!=='submitting')throw Error(`Character voice changed during creation. The created voice ID is ${cloned.voiceId}; connect it from your ElevenLabs library.`);
    target.voice={...target.voice,provider:'elevenlabs',customVoiceId:cloned.voiceId,rate:Math.min(1.2,Math.max(.7,target.voice.rate)),cloneAttempt:{sampleUrl:sample.url,status:'ready',voiceId:cloned.voiceId,requiresVerification:cloned.requiresVerification}};target.version++;
    await saveState(user.userId,current.state,current.revision);
    return Response.json({state:current.state,message:cloned.requiresVerification?'Voice saved. Complete verification in ElevenLabs before generating voice previews.':'Reusable voice created. New videos will use it automatically.'});
  }catch(error){
    const current=await readState(user.userId),target=current.state.characters.find(c=>c.id===character.id)!;
    if(target.voice.cloneAttempt?.sampleUrl===sample.url)target.voice.cloneAttempt.status=error instanceof VoiceProviderError&&!error.uncertain?'failed':'unknown';
    await saveState(user.userId,current.state,current.revision);throw error;
  }
}catch(error){return Response.json({error:error instanceof z.ZodError?'Confirm voice rights and check the selected character and voice ID.':error instanceof Error?error.message:'Could not save this voice.'},{status:400});}finally{if(temporary)await rm(temporary,{force:true});}}
