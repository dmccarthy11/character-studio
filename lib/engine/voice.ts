import {z} from 'zod';
import type {Character,Content} from './types';
import {upgradeEdit} from './edit';

export const voiceSettingsSchema=z.object({voiceId:z.string().trim().min(1).max(100),tone:z.string().trim().max(10000),rate:z.number().min(.25).max(4),provider:z.enum(['openai','elevenlabs']).optional()});
export function updateVoiceSettings(character:Character,input:unknown){
  const values=voiceSettingsSchema.parse(input);
  if((values.provider||character.voice.provider)==='elevenlabs'){
    if(!character.voice.customVoiceId)throw Error('Upload and create a character voice first.');
    if(values.rate<.7||values.rate>1.2)throw Error('Uploaded voices support speaking speeds from 0.7 to 1.2.');
  }
  character.voice={...character.voice,...values};character.version++;
}
export function applyCharacterVoice(content:Content,character:Character){
  if(content.status==='GENERATING')throw Error('Cancel the active job before changing its voice.');
  if(JSON.stringify(content.snapshot.voice)===JSON.stringify(character.voice))return;
  upgradeEdit(content);content.snapshot.voice=structuredClone(character.voice);
  content.speech=(content.speech||[]).map(segment=>({id:segment.id,text:segment.text,delivery:segment.delivery}));
  content.audioApprovedVersion=undefined;content.timeline=undefined;
  if(content.scenes.length)content.status=content.approvedVersion===content.scriptVersion?'SCRIPT_APPROVED':'SCRIPT_PENDING';
  content.history.push({at:new Date().toISOString(),action:'character-voice',value:structuredClone(character.voice)});
}
