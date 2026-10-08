import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,copyFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {command,ffmpegPath,validateSpeech,inspectAudio,planTimeline,hash,speechInput,download,captionsFor} from '../workers/media-tools.mjs';
import {processEditJob} from '../workers/edit-worker.mjs';
import {readProviderJson} from '../workers/network-tools.mjs';
import {authorizeFrameRetry} from '../workers/job-recovery.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'character-edit-test-'));process.env.DATA_DIR=root;
const ffmpeg=ffmpegPath();const run=args=>command(ffmpeg,args);
const voice=path.join(root,'voice.mp3'),silent=path.join(root,'silent.mp3'),raw=path.join(root,'raw.mp4');
await run(['-y','-f','lavfi','-i','sine=frequency=440:duration=2.4','-c:a','libmp3lame',voice]);
await run(['-y','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','0.36',silent]);
await run(['-y','-f','lavfi','-i','color=c=blue:s=180x320:r=30:d=5','-an','-c:v','libx264','-pix_fmt','yuv420p',raw]);
await assert.rejects(()=>validateSpeech(silent,'This sentence should clearly have audible spoken words.'),/validation failed/);
await validateSpeech(voice,'A short complete thought.');
const character={appearance:{description:'Fictional adult'},voice:{voiceId:'alloy',rate:1,tone:'Casual'}};
const segment={id:'speech',text:'A short complete thought.',delivery:'Casual',duration:2.4,audioUrl:'/api/files/local/voice.mp3'};
segment.inputHash=hash(speechInput(segment,character,'mock-tts'));
const baseShot={duration:1,location:'Kitchen',wardrobe:'T-shirt',action:'Look around',dialogue:'',camera:'Phone',lighting:'Daylight',kind:'voiceover',speechId:'speech',sourceUrl:'/api/files/local/raw.mp4'};
const content={id:'content',pipelineVersion:2,scriptVersion:1,snapshot:character,duration:2,durationMode:'natural',speech:[segment],scenes:[{...baseShot,id:'one',order:1},{...baseShot,id:'two',order:2}]};
const plan=planTimeline(content);assert.equal(plan.clips.length,2);assert(Math.abs(plan.duration-2.6)<.001);assert.equal(plan.groups.length,1);
assert(captionsFor(plan,[segment]).includes('00:00:02.400'));
assert.throws(()=>planTimeline({...content,durationMode:'exact'}),/exceeds/);
const fractional=planTimeline({...content,speech:[],scenes:Array.from({length:20},(_,i)=>({...baseShot,id:'fraction-'+i,speechId:undefined,kind:'silent',duration:1.015})),durationMode:'exact',duration:20.3},[]);assert(Math.abs(fractional.duration-20.3)<.02);assert(fractional.clips.every(c=>Math.abs(c.duration*30-Math.round(c.duration*30))<.0001));
assert.throws(()=>planTimeline({...content,scenes:[content.scenes[0],{...baseShot,id:'silent',speechId:undefined,kind:'silent'},content.scenes[1]]}),/adjacent/);
const videoBytes=await readFile(raw);let gets=0,refreshes=0;
await download(path.join(root,'download.mp4'),'https://example.test/expired',{fetchImpl:async()=>++gets===1?new Response('',{status:403}):new Response(videoBytes),refresh:async()=>{refreshes++;return 'https://example.test/fresh';},pause:async()=>{}});
assert.equal(gets,2);assert.equal(refreshes,1);
// Retry task polling and body reads, not paid submissions.
const reset=()=>Object.assign(Error('signed-url-must-not-leak'),{cause:{code:'ECONNRESET'}});
let statusReads=0,statusRetries=0;
assert.deepEqual(await readProviderJson('https://fixtures.test/task',{Authorization:'fixture-only'},{pause:async()=>{},onRetry:async()=>statusRetries++,fetchImpl:async()=>{
  statusReads++;if(statusReads===1)throw reset();if(statusReads===2)return {ok:true,json:async()=>{throw reset();}};if(statusReads===3)return new Response('',{status:503});return Response.json({status:'SUCCEEDED'});
}}),{status:'SUCCEEDED'});assert.equal(statusReads,4);assert.equal(statusRetries,3);
let forbiddenReads=0;await assert.rejects(()=>readProviderJson('https://fixtures.test/private-token',{}, {pause:async()=>{},fetchImpl:async()=>{forbiddenReads++;return new Response('',{status:401});}}),e=>/HTTP 401/.test(e.message)&&!e.message.includes('private-token'));assert.equal(forbiddenReads,1);
let bodyDownloads=0,downloadRefresh=0;
await download(path.join(root,'body-reset.mp4'),'https://fixtures.test/old',{pause:async()=>{},refresh:async()=>{downloadRefresh++;throw reset();},fetchImpl:async()=>{
  bodyDownloads++;return bodyDownloads===1?{ok:true,arrayBuffer:async()=>{throw reset();}}:new Response(videoBytes);
}});assert.equal(bodyDownloads,2);assert.equal(downloadRefresh,1);assert.deepEqual(await readFile(path.join(root,'body-reset.mp4')),videoBytes);
let fallbackCalls=0;
await download(path.join(root,'system-fallback.mp4'),'https://fixtures.test/signed',{pause:async()=>{},fetchImpl:async()=>{throw reset();},curlImpl:async(url,target)=>{fallbackCalls++;assert.equal(url,'https://fixtures.test/signed');await writeFile(target,videoBytes);}});assert.equal(fallbackCalls,1);
let resetDownloads=0;const failedDownload=path.join(root,'reset-exhausted.mp4');
await assert.rejects(()=>download(failedDownload,'https://fixtures.test/private-token',{pause:async()=>{},fetchImpl:async()=>{resetDownloads++;throw reset();}}),e=>/ECONNRESET/.test(e.message)&&!e.message.includes('private-token'));assert.equal(resetDownloads,5);await assert.rejects(()=>stat(failedDownload+'.tmp'),/ENOENT/);
let tlsDownloads=0;await assert.rejects(()=>download(path.join(root,'tls.mp4'),'https://fixtures.test/private-token',{pause:async()=>{},fetchImpl:async()=>{tlsDownloads++;throw Object.assign(Error('certificate'),{cause:{code:'CERT_HAS_EXPIRED'}});},curlImpl:async()=>{throw Error('Must not bypass a TLS error');}}),/CERT_HAS_EXPIRED/);assert.equal(tlsDownloads,1);
console.log('PASS: status GET and interrupted-body retries, HTTP access failure handling, system-download fallback, retry bounds, temporary-file cleanup, TLS checks and signed URL redaction.');
await assert.rejects(()=>download(path.join(root,'bad.mp4'),'https://example.test/private-signed-token',{fetchImpl:async()=>{throw Error('secret-url');},pause:async()=>{}}),e=>!e.message.includes('private-signed-token')&&!e.message.includes('secret-url'));
let completed;let paid=0;
const api=async(body,rawResponse=false)=>{if(body.action==='reference'){const bytes=body.url.includes('voice')?await readFile(voice):videoBytes;return new Response(bytes,{headers:{'content-type':body.url.includes('voice')?'audio/mpeg':'video/mp4'}});}if(body.action==='complete')completed=body;return {ok:true};};
const work={owner:'local',job:{id:'export-test',kind:'VIDEO',leaseToken:'test'},content,settings:{videoModel:'gen4_turbo',imageModel:'mock-image',ttsModel:'mock-tts',maxJobCost:10}};
await processEditJob(work,api,{fetchImpl:async()=>{paid++;throw Error('No network call expected');}});
assert.equal(paid,0);assert(completed);assert(completed.duration>2.4);
const exported=path.join(root,'jobs','export-test','final.mp4');assert((await stat(exported)).size>0);
const levels=await inspectAudio(exported);assert(levels.maxDb>-45);
// Resume performs no paid call and preserves validated audio coverage.
await processEditJob(work,api,{fetchImpl:async()=>{paid++;throw Error('Unexpected paid call');}});assert.equal(paid,0);
// Source-only rebuild must fail instead of creating paid video when footage is unavailable.
await assert.rejects(()=>processEditJob({...work,job:{id:'missing-rebuild',kind:'REBUILD',leaseToken:'test'},content:{...content,scenes:content.scenes.map(s=>({...s,sourceUrl:undefined}))}},api,{fetchImpl:async()=>{paid++;throw Error('Unexpected paid call');}}),/unavailable/);assert.equal(paid,0);
// Cached defective audio is rejected even though the file is nonempty.
await writeFile(path.join(root,'jobs','export-test','voice-0.mp3'),await readFile(silent));
await assert.rejects(()=>processEditJob(work,api,{fetchImpl:async()=>{paid++;throw Error('Unexpected paid call');}}),/validation failed/);
console.log('PASS: silent audio rejection, natural/exact timing, continuous narration across cuts, caption timing, signed URL refresh, redacted network errors, FFmpeg export, cached audio validation, rebuild and resume without paid calls.');
console.log('Disposable media test artifacts: '+root);
// Exercise every paid-provider boundary with local fixtures and fake responses.
process.env.TTS_API_KEY='fake-test-only';process.env.IMAGE_API_KEY='fake-test-only';process.env.VIDEO_API_KEY='fake-test-only';process.env.LIPSYNC_API_KEY='fake-test-only';
process.env.TTS_COST_ESTIMATE='0.05';process.env.IMAGE_COST_ESTIMATE='0.1';process.env.VIDEO_COST_PER_SECOND='0.05';process.env.LIPSYNC_COST_PER_SECOND='0.05';
let speechCalls=0,audioComplete;
const audioWork={...work,job:{id:'audio-retry',kind:'AUDIO',leaseToken:'test'},content:{...content,speech:[{id:'speech',text:segment.text,delivery:segment.delivery}]}};
await processEditJob(audioWork,async(body,rawResponse)=>{if(body.action==='audioComplete')audioComplete=body;return api(body,rawResponse);},{fetchImpl:async(url,options)=>{assert(url.endsWith('/audio/speech'));speechCalls++;return new Response(await readFile(speechCalls===1?silent:voice));}});
assert.equal(speechCalls,2);assert(audioComplete.speech[0].duration>=2.39);
// A cloned voice is reused by ID for new takes, with speed and its own cost estimate.
process.env.ELEVENLABS_API_KEY='fixture-only';process.env.ELEVENLABS_TTS_COST_ESTIMATE='0.08';process.env.ELEVENLABS_TTS_MODEL='eleven_multilingual_v2';
const cloneCharacter={...character,voice:{...character.voice,provider:'elevenlabs',customVoiceId:'saved-character-voice',rate:1.1}};
let customCalls=0,customComplete;
for(const jobId of ['custom-preview-one','custom-preview-two']){
  await processEditJob({...audioWork,job:{...audioWork.job,id:jobId},content:{...audioWork.content,snapshot:cloneCharacter}},async(body,rawResponse)=>{if(body.action==='audioComplete')customComplete=body;return api(body,rawResponse);},{fetchImpl:async(url,options)=>{
    customCalls++;assert(url.includes('/text-to-speech/saved-character-voice?'));assert.equal(options.headers['xi-api-key'],'fixture-only');assert(!options.headers.Authorization);
    const body=JSON.parse(options.body);assert.equal(body.text,segment.text);assert.equal(body.model_id,'eleven_multilingual_v2');assert.equal(body.voice_settings.speed,1.1);
    return new Response(await readFile(voice));
  }});
}
assert.equal(customCalls,2);assert(customComplete.speech[0].inputHash);assert(customComplete.speech[0].duration>=2.39);
await assert.rejects(()=>processEditJob({...audioWork,job:{...audioWork.job,id:'custom-budget'},settings:{...audioWork.settings,maxJobCost:.1},content:{...audioWork.content,snapshot:cloneCharacter}},api,{fetchImpl:async()=>{throw Error('Must not spend over budget');}}),/exceeds the job budget/);
console.log('PASS: reused cloned voice IDs across previews, ElevenLabs speed requests, custom voice input hashes and cost gates.');
let uncertainCalls=0;
const uncertain={...audioWork,job:{id:'unknown-voice',kind:'AUDIO',leaseToken:'test'}};
await assert.rejects(()=>processEditJob(uncertain,api,{fetchImpl:async()=>{uncertainCalls++;throw Error('network dropped');}}),/network/);
await assert.rejects(()=>processEditJob(uncertain,api,{fetchImpl:async()=>{uncertainCalls++;throw Error('must not resubmit');}}),/unknown/);assert.equal(uncertainCalls,1);
const submissions={image:0,video:0,lip:0};
let syncDownloads=0,runwayReads=0,syncReads=0,rawDownloads=0;
const generated={...work,job:{id:'generated-speaking',kind:'VIDEO',leaseToken:'test'},content:{...content,scenes:content.scenes.map((s,i)=>({...s,sourceUrl:undefined,references:['/api/files/local/reference.png'],kind:i?'voiceover':'speaking'}))}};
const fakeFetch=async(url,options={})=>{
 if(url.endsWith('/images/edits')){submissions.image++;assert(options.body instanceof FormData);return Response.json({data:[{b64_json:Buffer.from('fake-starting-frame').toString('base64')}]});}
 if(url.endsWith('/image_to_video')){submissions.video++;const body=JSON.parse(options.body);assert.equal(body.duration,5);assert(!body.promptText.includes(segment.text));return Response.json({id:`runway-${submissions.video}`});}
 if(url.includes('/tasks/')){if(runwayReads++===0)throw reset();return Response.json({status:'SUCCEEDED',output:['https://fixtures.test/video']});}
 if(url==='https://api.sync.so/v2/generate'){submissions.lip++;assert(options.body instanceof FormData);assert(options.body.get('video') instanceof Blob);assert(options.body.get('audio') instanceof Blob);assert(options.headers['Idempotency-Key']);return Response.json({id:'sync-one'});}
 if(url.includes('api.sync.so/v2/generate/')){if(syncReads++===0)return {ok:true,json:async()=>{throw reset();}};return Response.json({status:'COMPLETED',outputUrl:'https://fixtures.test/synced'});}
 if(url==='https://fixtures.test/video'&&rawDownloads++===0)return {ok:true,arrayBuffer:async()=>{throw reset();}};
 if(url==='https://fixtures.test/synced'&&syncDownloads++===0)return new Response('',{status:403});
 if(url.startsWith('https://fixtures.test/'))return new Response(videoBytes);
 throw Error('Unexpected fixture endpoint');
};
await processEditJob(generated,api,{fetchImpl:fakeFetch,pause:async()=>{}});assert.deepEqual(submissions,{image:2,video:2,lip:1});assert.equal(syncDownloads,2);assert(runwayReads>=3);assert(syncReads>=3);
await processEditJob(generated,api,{fetchImpl:fakeFetch});assert.deepEqual(submissions,{image:2,video:2,lip:1});
await processEditJob({...generated,job:{id:'reused-speaking',kind:'REBUILD',sourceJobId:'generated-speaking',leaseToken:'test'},content:{...generated.content,soundtracks:[{id:'room',kind:'ambience',url:'/api/files/local/voice.mp3',volumeDb:-28,sourceIn:0.2}]}},api,{fetchImpl:fakeFetch});assert.deepEqual(submissions,{image:2,video:2,lip:1});
console.log('PASS: mocked frame/video/lip-sync lifecycle, bounded defective TTS retry, ambiguous speech protection, and paid-output reuse across resume and rebuild.');
const imageRecovery={...generated,job:{id:'starting-image-recovery',kind:'VIDEO',leaseToken:'test'},content:{...generated.content,scenes:[{...generated.content.scenes[0],kind:'voiceover'}]}};
const imageRecoveryFolder=path.join(root,'jobs',imageRecovery.job.id);await mkdir(imageRecoveryFolder,{recursive:true});await writeFile(path.join(imageRecoveryFolder,'checkpoint.json'),JSON.stringify({'shot-one':{frameSubmitting:true}}));
let recoveryImages=0,recoveryVideos=0;
const recoveryFetch=async(url,options)=>{if(url.endsWith('/images/edits'))recoveryImages++;if(url.endsWith('/image_to_video'))recoveryVideos++;return fakeFetch(url,options);};
await assert.rejects(()=>processEditJob(imageRecovery,api,{fetchImpl:recoveryFetch,pause:async()=>{}}),/Starting frame submission outcome is unknown/);assert.equal(recoveryImages,0);assert.equal(recoveryVideos,0);
await writeFile(path.join(imageRecoveryFolder,'frame-0.png'),Buffer.from('saved-image-fixture'));
await processEditJob(imageRecovery,api,{fetchImpl:recoveryFetch,pause:async()=>{}});assert.equal(recoveryImages,0);assert.equal(recoveryVideos,1);
console.log('PASS: unknown starting-image submissions remain blocked; importing a saved starting image resumes without repeating the image charge.');
// Explicit authorization repeats only the blocked image; prior footage/lip sync stays intact.
const explicitWork={...generated,job:{id:'explicit-image-retry',kind:'VIDEO',leaseToken:'test'}};
const explicitFolder=path.join(root,'jobs',explicitWork.job.id),previousFolder=path.join(root,'jobs',generated.job.id);await mkdir(explicitFolder,{recursive:true});
const previousCheckpoint=JSON.parse(await readFile(path.join(previousFolder,'checkpoint.json'),'utf8'));
await writeFile(path.join(explicitFolder,'job.json'),JSON.stringify(explicitWork));
await writeFile(path.join(explicitFolder,'checkpoint.json'),JSON.stringify({'shot-one':previousCheckpoint['shot-one'],'shot-two':{frameSubmitting:true,visualHash:previousCheckpoint['shot-two'].visualHash}}));
for(const file of ['frame-0.png','raw-0.mp4','prepared-0.mp4','synced-0.mp4','scene-0.mp4'])await copyFile(path.join(previousFolder,file),path.join(explicitFolder,file));
const preservedRaw=await readFile(path.join(explicitFolder,'raw-0.mp4')),preservedLip=await readFile(path.join(explicitFolder,'synced-0.mp4'));const before={...submissions};
await assert.rejects(()=>processEditJob(explicitWork,api,{fetchImpl:fakeFetch,pause:async()=>{}}),/Starting frame submission outcome is unknown for shot 2/);assert.deepEqual(submissions,before);
await authorizeFrameRetry(root,explicitWork.job.id,'two');await processEditJob(explicitWork,api,{fetchImpl:fakeFetch,pause:async()=>{}});
assert.deepEqual(submissions,{image:before.image+1,video:before.video+1,lip:before.lip});assert.deepEqual(await readFile(path.join(explicitFolder,'raw-0.mp4')),preservedRaw);assert.deepEqual(await readFile(path.join(explicitFolder,'synced-0.mp4')),preservedLip);
console.log('PASS: authorized selected-shot image retry resumes the same job while preserving existing video and lip-sync outputs.');
// A definitive Sync billing rejection can resume; a lost submission response cannot.
const billingWork={...work,job:{id:'sync-billing-recovery',kind:'VIDEO',leaseToken:'test'},content:{...content,scenes:[{...content.scenes[0],kind:'speaking',duration:3}]}};
const billingManifest=path.join(root,'jobs',billingWork.job.id,'checkpoint.json');
let billingCalls=0;const billingKeys=[];
await assert.rejects(()=>processEditJob(billingWork,api,{fetchImpl:async(url,options)=>{assert.equal(url,'https://api.sync.so/v2/generate');billingCalls++;billingKeys.push(options.headers['Idempotency-Key']);return new Response('',{status:402});}}),/shot 1.*402.*billing/);
let billingCheckpoint=JSON.parse(await readFile(billingManifest));assert.equal(billingCheckpoint['shot-one'].lipSubmitting,false);assert.equal(billingCheckpoint['shot-one'].lipRejection.status,402);
const savedBillingRaw=await readFile(path.join(root,'jobs',billingWork.job.id,'raw-0.mp4'));
await processEditJob(billingWork,api,{fetchImpl:async(url,options)=>{
  if(url==='https://api.sync.so/v2/generate'){billingCalls++;billingKeys.push(options.headers['Idempotency-Key']);return Response.json({id:'sync-after-upgrade'});}
  if(url.endsWith('/sync-after-upgrade'))return Response.json({status:'COMPLETED',outputUrl:'https://fixtures.test/billing-synced'});
  if(url==='https://fixtures.test/billing-synced')return new Response(videoBytes);
  throw Error('Unexpected paid request');
},pause:async()=>{}});
assert.equal(billingCalls,2);assert.equal(billingKeys[0],billingKeys[1]);assert.deepEqual(await readFile(path.join(root,'jobs',billingWork.job.id,'raw-0.mp4')),savedBillingRaw);
billingCheckpoint=JSON.parse(await readFile(billingManifest));assert.equal(billingCheckpoint['shot-one'].lipSubmitting,false);assert.equal(billingCheckpoint['shot-one'].lipRejection,undefined);
for(const malformed of [false,true]){
  const unknownLipWork={...billingWork,job:{...billingWork.job,id:'unknown-lip-'+malformed}};let calls=0;
  await assert.rejects(()=>processEditJob(unknownLipWork,api,{fetchImpl:async()=>{calls++;if(malformed)return Response.json({});throw reset();}}),/unknown|network/);
  await assert.rejects(()=>processEditJob(unknownLipWork,api,{fetchImpl:async()=>{calls++;throw Error('Must not duplicate an ambiguous submission');}}),/unknown for shot 1/);
  assert.equal(calls,1);
}
console.log('PASS: Sync HTTP 402 resumes with the same idempotency key and saved footage; lost responses and missing task IDs remain protected.');
