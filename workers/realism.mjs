// Shared by the API and worker. Rates are conservative estimates, not invoices.
export const VIDEO_MODELS = {
  'gen4.5': {label:'Gen-4.5 · quality',rate:.12},
  gen4_turbo: {label:'Gen-4 Turbo · draft',rate:.05},
};
export function videoSeconds(seconds){
  if(!Number.isFinite(seconds)||seconds<=0||seconds>10.01)throw Error('Generated shots must fit within 10 seconds, including source trim. Split the shot or upload footage.');
  return seconds<=5?5:10;
}
/** @param {string} model @param {Record<string,string|undefined>} env */
export function videoRate(model,env=process.env){
  if(!VIDEO_MODELS[model])throw Error('Choose a supported video model: gen4.5 or gen4_turbo.');
  return Math.max(VIDEO_MODELS[model].rate,Number(env.VIDEO_COST_PER_SECOND)||0);
}
export function frameInput(shot,character,model){return {model,appearance:character.appearance,identity:character.assets.filter(a=>a.status==='APPROVED'&&a.isCanonical).map(a=>a.url),location:shot.location,wardrobe:shot.wardrobe,action:shot.action,camera:shot.camera,lighting:shot.lighting,kind:shot.kind,version:1};}
export function framePrompt(character,shot){return [
  'An unretouched photograph from an ordinary phone video of a fictional adult. First reference is the exact identity anchor: preserve facial proportions, age, hairline, eye shape, nose, jaw and distinguishing marks.',
  `Appearance: ${character.appearance.description}. Wardrobe: ${shot.wardrobe}. Place: ${shot.location}. Available light: ${shot.lighting}. Framing: ${shot.camera}. First moment of one action: ${shot.action}.`,
  'Visible natural pores, fine facial hairs, subtle under-eye texture and uneven skin tones. Ordinary phone exposure, neutral white balance, moderate depth of field with a legible environment. Slightly imperfect candid framing; physically plausible hands and objects.',
  'No beauty retouching, waxy skin, illustration, 3D render, cinematic color grade, exaggerated bokeh, captions, logos or watermarks. Unbranded props. Use the reference for identity only; include only the objects required by the action.',
  /phone|scroll|screen/i.test(shot.action)?'A phone screen faces its user, with the plain back facing the camera.':'',
  shot.kind==='speaking'?'One adult, unobstructed face, chest-up at eye level. Hands below the mouth; no eating or drinking.':'A candid observed moment. The subject is occupied with the activity, with relaxed lips at rest.',
].join(' ');}
export function motionPrompt(shot){return `${shot.action}. ${shot.camera}. Real-time movement at ordinary speed, small irregular human gestures and natural blinks. A single continuous phone recording with stable exposure. ${shot.kind==='speaking'?'The subject faces the lens with an unobstructed face and restrained head movement.':'The subject quietly carries out the activity, lips resting together.'}`.slice(0,1000);}
export function imageOptions(model){return {quality:'high',...(['gpt-image-1','gpt-image-1.5'].includes(model)?{input_fidelity:'high'}:{})};}
export function motionInput(shot,model){return {frameUrl:shot.frameUrl,take:shot.take||0,action:shot.action,camera:shot.camera,kind:shot.kind,model};}
export function priorReservation(jobs,contentId){return jobs.filter(j=>j.contentId===contentId&&j.provider!=='Mock').reduce((n,j)=>n+(Number(j.estimatedCost)||0),0);}
/** @param {any} content @param {any} settings @param {Record<string,string|undefined>} env */
export function estimateProduction(content,settings,env=process.env){
  const rate=videoRate(settings.videoModel,env),image=Math.max(.3,Number(env.IMAGE_COST_ESTIMATE)||0);
  const voiceKey=content.snapshot.voice.provider==='elevenlabs'?'ELEVENLABS_TTS_COST_ESTIMATE':'TTS_COST_ESTIMATE';
  const voice=Math.max(.10,Number(env[voiceKey])||0),lip=Number(env.LIPSYNC_COST_PER_SECOND)||0;
  let frames=0,video=0,sync=0;
  for(const shot of content.scenes){const clip=content.timeline?.find(c=>c.sceneId===shot.id)||shot;
    if(!shot.sourceUrl){if(!shot.frameUrl)frames+=image;if(!shot.rawUrl||shot.rawKey!==JSON.stringify(motionInput(shot,settings.videoModel)))video+=videoSeconds((clip.sourceIn||0)+clip.duration)*rate;}
    if(shot.kind==='speaking'){if(!(lip>0))throw Error('Set LIPSYNC_COST_PER_SECOND before planning speaking shots.');sync+=clip.duration*lip;}
  }
  const audio=(content.speech||[]).filter(s=>!s.audioUrl).length*voice*2;
  return {frames,video,sync,audio,total:Math.round((frames+video+sync+audio)*100)/100};
}
