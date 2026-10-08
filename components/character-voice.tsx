'use client';
import {useEffect,useState} from 'react';
import {toast} from 'sonner';
import type {Character,State} from '@/lib/engine/types';

type Act=(action:string,data?:Record<string,unknown>)=>Promise<any>;
export function CharacterVoicePanel({character,configured,live,busy,act,onState,refresh}:{character:Character;configured:boolean;live:boolean;busy:boolean;act:Act;onState:(state:State)=>void;refresh:()=>Promise<void>}){
  const [working,setWorking]=useState(false),[authorized,setAuthorized]=useState(false),[existingId,setExistingId]=useState('');
  const [provider,setProvider]=useState(character.voice.provider||'openai'),[rate,setRate]=useState(character.voice.rate),[tone,setTone]=useState(character.voice.tone),[preset,setPreset]=useState(character.voice.voiceId);
  useEffect(()=>{setProvider(character.voice.provider||'openai');setRate(character.voice.rate);setTone(character.voice.tone);setPreset(character.voice.voiceId);},[character.id,character.voice]);
  useEffect(()=>{setAuthorized(false);setExistingId('');},[character.id]);
  const locked=working||busy,voice=character.voice;
  const unresolved=['submitting','unknown'].includes(voice.cloneAttempt?.status||'');
  const clonedSample=voice.sample?.url===voice.cloneAttempt?.sampleUrl&&voice.cloneAttempt?.status==='ready';
  const connectionBlocker=!configured?'Add ELEVENLABS_API_KEY to .env and restart the app.':!live?'Switch Generation mode to Live in Settings.':!existingId.trim()?'Paste the voice ID from your ElevenLabs library.':!authorized?'Check the voice permission box above to connect this voice.':'';
  const cloneBlocker=!configured?'Add ELEVENLABS_API_KEY to .env and restart the app.':!live?'Switch Generation mode to Live in Settings.':unresolved?'Resolve the previous creation by connecting its existing voice ID above.':clonedSample?'This recording already has a reusable voice.':!voice.sample?'Upload a recording first. If you already have a voice ID, use Connect voice above.':!authorized?'Check the voice permission box above to create this voice.':'';
  const submit=async(body:FormData|Record<string,unknown>)=>{
    setWorking(true);
    try{
      const response=await fetch('/api/character-voice',{method:'POST',...(body instanceof FormData?{body}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
      const data=await response.json();if(!response.ok)throw Error(data.error);
      onState(data.state);toast.success(data.message);
    }catch(error){toast.error((error as Error).message);await refresh();}finally{setWorking(false);}
  };
  return <section className="panel"><div className="panel-title"><h2>Character voice</h2><span className="tag">{voice.provider==='elevenlabs'?'Reusable voice · ElevenLabs':'Preset voice · OpenAI'}</span></div>
    <p>Save one voice for this character and reuse it in every new video. Listen to script voice previews before generating footage.</p>
    <h3 className="form-subtitle">Connect a voice you already made</h3>
    <p>For a voice created with ElevenLabs Voice Design, paste its saved voice ID here and click Connect voice. You can also connect a voice already in your account.</p>
    <label className="row gap"><input type="checkbox" disabled={locked} checked={authorized} onChange={e=>setAuthorized(e.target.checked)}/>I have permission to create and use this voice.</label>
    <label className="field"><span>ElevenLabs voice ID</span><input disabled={locked} value={existingId} onChange={e=>setExistingId(e.target.value)} placeholder="Paste your saved ElevenLabs voice ID"/></label>
    <button className="button" disabled={locked||!!connectionBlocker} aria-describedby="voice-connect-help" onClick={()=>submit({action:'connect',characterId:character.id,voiceId:existingId.trim(),authorized})}>{working?'Connecting…':'Connect voice'}</button>
    <p id="voice-connect-help" className="muted small">{connectionBlocker||'Connecting saves this voice to the character and selects it for new videos.'}</p>
    {voice.customVoiceId&&<p className="muted small">Saved ElevenLabs voice ID: {voice.customVoiceId}</p>}
    <h3 className="form-subtitle">Voice settings</h3>
    <div className="form-grid">
      <label className="field"><span>Voice to use</span><select disabled={locked} value={provider} onChange={e=>{setProvider(e.target.value as typeof provider);if(e.target.value==='elevenlabs')setRate(Math.min(1.2,Math.max(.7,rate)));}}><option value="openai">OpenAI preset voice</option>{voice.customVoiceId&&<option value="elevenlabs">My reusable ElevenLabs voice</option>}</select></label>
      {provider==='openai'&&<label className="field"><span>Preset voice ID</span><input disabled={locked} value={preset} onChange={e=>setPreset(e.target.value)}/><small>Examples: alloy, coral, nova, onyx. Your model must support the selected voice.</small></label>}
    </div>
    <label className="field"><span>Speaking speed · {rate.toFixed(2)}×</span><input disabled={locked} aria-label="Speaking speed" type="range" min="0.7" max="1.2" step="0.05" value={Math.min(1.2,Math.max(.7,rate))} onChange={e=>setRate(Number(e.target.value))}/><small>1.0 is normal. Try 1.10 for a quicker delivery. Changes apply when new audio is generated.</small></label>
    <label className="field"><span>Tone & character delivery</span><textarea disabled={locked} value={tone} onChange={e=>setTone(e.target.value)}/><small>OpenAI uses this as delivery guidance. An uploaded voice gets its accent and tone from your recording.</small></label>
    <button className="button" disabled={locked||!preset.trim()} onClick={()=>act('saveVoice',{characterId:character.id,voice:{voiceId:preset,tone,rate,provider}})}>Save voice settings</button>
    <h3 className="form-subtitle">Create a voice from a recording</h3>
    <p className="muted">Use a clean recording of one speaker in the accent, energy and tone you want. About 1–2 minutes works best; supported length is 10–180 seconds, up to 25 MB.</p>
    <label className="button secondary">{working?'Saving voice…':voice.sample?'Replace voice sample':'Upload voice sample'}<input hidden disabled={locked||unresolved} type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/webm,audio/flac,audio/x-flac" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file){const body=new FormData();body.set('characterId',character.id);body.set('file',file);void submit(body);}}}/></label>
    {voice.sample&&<div className="environment"><strong>{voice.sample.name}</strong><p>{voice.sample.duration.toFixed(1)} seconds · saved locally</p><audio aria-label="Uploaded voice sample" controls preload="none" src={voice.sample.url}/></div>}
    {!configured&&<p className="notice">To create and use an uploaded voice, add ELEVENLABS_API_KEY to .env and restart the app. Your ElevenLabs plan needs voice-cloning access.</p>}
    {configured&&!live&&<p className="notice">Your sample can be saved in mock mode. Switch to live mode in Settings to create the voice in ElevenLabs.</p>}
    <p className="muted small">Creating a voice sends this recording to ElevenLabs. The voice stays in your ElevenLabs account and is reused for new spoken words.</p>
    <button className="button" disabled={locked||!!cloneBlocker} aria-describedby="voice-clone-help" onClick={()=>submit({action:'clone',characterId:character.id,authorized})}>{clonedSample?'Reusable voice created':'Create voice from recording'}</button>
    <p id="voice-clone-help" className="muted small">{cloneBlocker||'Creates a reusable ElevenLabs voice from your uploaded recording.'}</p>
    {voice.cloneAttempt?.requiresVerification&&<p className="notice">ElevenLabs requires verification of this voice. Complete it in your ElevenLabs account before generating previews.</p>}
    {unresolved&&<p className="notice">Voice creation may have succeeded. Check your ElevenLabs voice library and connect the existing voice ID above before creating another clone.</p>}
  </section>;
}
