import assert from 'node:assert/strict';
import {cloneVoice,checkVoice,VoiceProviderError,speechRequest,voiceModel,requireVoiceCredentials} from '../workers/voice-provider.mjs';
import {speechInput,hash} from '../workers/media-tools.mjs';
process.env.ELEVENLABS_API_KEY='fixture-only';process.env.ELEVENLABS_TTS_MODEL='eleven_multilingual_v2';process.env.TTS_API_KEY='fixture-openai';
let cloneCalls=0;
const created=await cloneVoice('A fictional character',new Uint8Array([1,2,3]),'audio/mpeg','fixture-only',{fetchImpl:async(url,options)=>{
  cloneCalls++;assert.equal(url,'https://api.elevenlabs.io/v1/voices/add');assert.equal(options.headers['xi-api-key'],'fixture-only');
  assert(options.body instanceof FormData);assert.equal(options.body.get('name'),'A fictional character');assert(options.body.get('files') instanceof Blob);
  assert.deepEqual(new Uint8Array(await options.body.get('files').arrayBuffer()),new Uint8Array([1,2,3]));
  return Response.json({voice_id:'saved-clone',requires_verification:false});
}});
assert.deepEqual(created,{voiceId:'saved-clone',requiresVerification:false});assert.equal(cloneCalls,1);
for(const fixture of [async()=>{throw Error('secret');},async()=>Response.json({}, {status:503}),async()=>Response.json({})]){
  await assert.rejects(()=>cloneVoice('Name',new Uint8Array([1]),'audio/mpeg','key',{fetchImpl:fixture}),e=>e instanceof VoiceProviderError&&e.uncertain);
}
await assert.rejects(()=>cloneVoice('Name',new Uint8Array([1]),'audio/mpeg','key',{fetchImpl:async()=>Response.json({}, {status:403})}),e=>e instanceof VoiceProviderError&&!e.uncertain);
assert.equal((await cloneVoice('Name',new Uint8Array([1]),'audio/mpeg','key',{fetchImpl:async()=>Response.json({voice_id:'verify',requires_verification:true})})).requiresVerification,true);
await checkVoice('saved-clone','key',{fetchImpl:async(url)=>{assert(url.endsWith('/saved-clone'));return Response.json({voice_id:'saved-clone'});}});
const character={voice:{provider:'elevenlabs',customVoiceId:'saved-clone',voiceId:'alloy',tone:'Warm',rate:1.1,sample:{url:'/api/files/local/sample'}}},segment={text:'Fresh spoken words.',delivery:'Conversational'};
const request=speechRequest(segment,character,'openai-model');assert(request.url.includes('/text-to-speech/saved-clone?'));assert.equal(request.headers['xi-api-key'],'fixture-only');assert.equal(request.body.voice_settings.speed,1.1);assert.equal(request.body.text,segment.text);assert.equal(request.body.model_id,'eleven_multilingual_v2');assert.equal(voiceModel(character,'openai-model'),'eleven_multilingual_v2');
const input=speechInput(segment,character,'openai-model');assert.notEqual(hash(input),hash(speechInput(segment,{voice:{...character.voice,rate:1}},'openai-model')));
assert.equal(hash(input),hash(speechInput(segment,{voice:{...character.voice,sample:{url:'replacement'}}},'openai-model')));
const preset={voice:{voiceId:'alloy',tone:'Warm',rate:1.1}};const originalShape={text:segment.text,delivery:segment.delivery,voice:preset.voice,model:'gpt-4o-mini-tts'};
assert.deepEqual(speechInput(segment,preset,'gpt-4o-mini-tts'),originalShape);
const openai=speechRequest(segment,preset,'gpt-4o-mini-tts');assert.equal(openai.body.speed,1.1);assert(openai.body.instructions.includes('Warm'));
requireVoiceCredentials(character);delete process.env.TTS_API_KEY;requireVoiceCredentials(character);delete process.env.ELEVENLABS_API_KEY;assert.throws(()=>requireVoiceCredentials(character),/ELEVENLABS_API_KEY/);
assert.throws(()=>speechRequest(segment,{voice:{...character.voice,rate:1.5}},'model'),/speaking speeds/);
console.log('PASS: clone upload contract, reusable voice IDs, verification handling, uncertain outcomes, provider selection, speaking speed, cache invalidation and unchanged legacy voice hashes. No live provider calls.');
