export const elevenModel=()=>process.env.ELEVENLABS_TTS_MODEL||'eleven_multilingual_v2';

// Keep the original OpenAI input hash shape for existing paid audio/checkpoints.
export function voiceModel(character,openaiModel){return character.voice.provider==='elevenlabs'?elevenModel():openaiModel;}
export function speechRequest(segment,character,openaiModel){
  const voice=character.voice;
  if(voice.provider==='elevenlabs'){
    if(!voice.customVoiceId)throw Error('Create or connect a character voice first.');
    if(!(voice.rate>=.7&&voice.rate<=1.2))throw Error('Uploaded voices support speaking speeds from 0.7 to 1.2.');
    return {url:`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.customVoiceId)}?output_format=mp3_44100_128`,key:null,headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY},body:{text:segment.text.trim(),model_id:elevenModel(),voice_settings:{stability:.5,similarity_boost:.75,use_speaker_boost:true,speed:voice.rate}}};
  }
  return {url:'https://api.openai.com/v1/audio/speech',key:process.env.TTS_API_KEY,headers:{},body:{model:openaiModel,input:segment.text.trim(),voice:voice.voiceId,speed:voice.rate,response_format:'mp3',...(openaiModel.includes('mini-tts')?{instructions:`Conversational UGC delivery. Character voice: ${voice.tone}. Take delivery: ${segment.delivery||voice.tone}. Natural pauses; spoken words only.`}:{})}};
}

export function requireVoiceCredentials(character){
  if(character.voice.provider==='elevenlabs'){
    if(!process.env.ELEVENLABS_API_KEY)throw Error('Configure ELEVENLABS_API_KEY for this character voice.');
    if(!character.voice.customVoiceId)throw Error('Create or connect a character voice first.');
    if(!(character.voice.rate>=.7&&character.voice.rate<=1.2))throw Error('Uploaded voices support speaking speeds from 0.7 to 1.2.');
  }else if(!process.env.TTS_API_KEY)throw Error('TTS_API_KEY is missing.');
}

export class VoiceProviderError extends Error {constructor(message,uncertain=false){super(message);this.uncertain=uncertain;}}
async function voiceResponse(url,options,fetchImpl){
  let response;
  try{response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(120000)});}catch{throw new VoiceProviderError('Voice creation outcome is unknown. Check your ElevenLabs voice library and connect the existing voice ID before trying again.',true);}
  if(!response.ok)throw new VoiceProviderError(`ElevenLabs returned HTTP ${response.status}. Check your API key, voice-cloning access and account limits.`,response.status>=500||response.status===408);
  try{return await response.json();}catch{throw new VoiceProviderError('Voice creation response was incomplete. Check your ElevenLabs library and connect the existing voice ID.',true);}
}
export async function cloneVoice(name,bytes,type,key,{fetchImpl=fetch}={}){
  const form=new FormData();form.set('name',name);form.append('files',new Blob([bytes],{type}),'character-voice');
  const data=await voiceResponse('https://api.elevenlabs.io/v1/voices/add',{method:'POST',headers:{'xi-api-key':key},body:form},fetchImpl);
  if(typeof data.voice_id!=='string'||!data.voice_id)throw new VoiceProviderError('Voice ID missing from the response. Check your ElevenLabs library and connect the existing voice ID.',true);
  return {voiceId:data.voice_id,requiresVerification:data.requires_verification===true};
}
export async function checkVoice(voiceId,key,{fetchImpl=fetch}={}){
  const data=await voiceResponse(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,{headers:{'xi-api-key':key}},fetchImpl);
  if(data.voice_id!==voiceId)throw new VoiceProviderError('That voice was not found in your ElevenLabs account.');
  return voiceId;
}
