import {mkdir,readFile,writeFile,rename,stat,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {hash,probe} from './media-tools.mjs';
import {frameInput,framePrompt,imageOptions} from './realism.mjs';
import {networkReason} from './network-tools.mjs';
const exists=async f=>{try{return (await stat(f)).size>0;}catch{return false;}};
export async function processFrameJob(work,api,{fetchImpl=fetch}={}){
  const {job,content,settings,owner}=work,dir=path.join(process.env.DATA_DIR,'jobs',job.id);
  const lease={owner,jobId:job.id,leaseToken:job.leaseToken};
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'job.json'),JSON.stringify(work,null,2));
  const manifest=path.join(dir,'checkpoint.json');let checkpoint={};
  try{checkpoint=JSON.parse(await readFile(manifest,'utf8'));}catch{}
  const save=async()=>{await writeFile(manifest+'.tmp',JSON.stringify(checkpoint,null,2));await rename(manifest+'.tmp',manifest);};
  const missing=content.scenes.filter(s=>!s.sourceUrl&&!s.frameUrl);
  const cost=missing.length*Math.max(.3,Number(process.env.IMAGE_COST_ESTIMATE)||0);
  if(cost+(job.priorCost||0)>Math.min(10,settings.maxJobCost))throw Error('Starting images exceed the remaining video budget.');
  if(!process.env.IMAGE_API_KEY)throw Error('IMAGE_API_KEY is required.');
  await api({...lease,action:'progress',stage:'Preparing reviewable starting frames',progress:5,cost});
  const frames=[];
  for(let i=0;i<content.scenes.length;i++){
    const shot=content.scenes[i];if(shot.sourceUrl||shot.frameUrl)continue;
    const state=checkpoint[`shot-${shot.id}`]||={},file=path.join(dir,`frame-${i}.png`);
    const inputHash=hash(frameInput(shot,content.snapshot,settings.imageModel));
    if(state.inputHash&&state.inputHash!==inputHash)throw Error('Frame inputs changed; start a new frame attempt.');
    state.inputHash=inputHash;
    if(!await exists(file)){
      if(state.frameSubmitting)throw Error(`Starting frame submission outcome is unknown for shot ${i+1}. Resume only after importing its saved image through recovery.`);
      const form=new FormData();form.set('model',settings.imageModel);form.set('size','1024x1536');form.set('prompt',framePrompt(content.snapshot,shot));
      for(const [key,value] of Object.entries(imageOptions(settings.imageModel)))form.set(key,value);
      const refs=content.snapshot.assets.filter(a=>a.status==='APPROVED'&&a.isCanonical&&!a.mock);
      if(!refs.length)throw Error('Approve a local canonical identity photograph first.');
      for(const asset of refs){const r=await api({...lease,action:'reference',url:asset.url},true);form.append('image[]',new Blob([await r.arrayBuffer()],{type:r.headers.get('content-type')||'image/png'}),'identity.png');}
      await api({...lease,action:'progress',stage:`Starting frame ${i+1} for review`,progress:10+i/content.scenes.length*80});
      state.frameSubmitting=true;await save();
      let response;
      try{response=await fetchImpl('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.IMAGE_API_KEY}`},body:form,signal:AbortSignal.timeout(180000)});}catch(error){throw Error(`Image submission connection failed (${networkReason(error)}). Its outcome is unknown; saved images are preserved.`);}
      if(!response.ok)throw Error(`Image provider HTTP ${response.status}. Check provider history before retrying.`);
      const data=await response.json();if(!data.data?.[0]?.b64_json)throw Error('Image response had no saved image. Check provider history before retrying.');
      await writeFile(file+'.tmp',Buffer.from(data.data[0].b64_json,'base64'));await rename(file+'.tmp',file);
      state.frameSubmitting=false;await save();
    }
    const info=await probe(file);if(!info.streams.some(s=>s.width>=512&&s.height>=512))throw Error(`Frame ${i+1} is invalid or too small. Import a full-resolution image.`);
    const key=`local/videos/${job.id}/frame-${i}.png`,dest=path.join(process.env.DATA_DIR,'media',...key.split('/'));
    await mkdir(path.dirname(dest),{recursive:true});await copyFile(file,dest);await writeFile(dest+'.metadata.json',JSON.stringify({contentType:'image/png'}));
    const frame={id:shot.id,frameUrl:'/api/files/'+key,frameHash:inputHash,frameApproved:false};frames.push(frame);
    await api({...lease,action:'progress',stage:`Frame ${i+1} saved for review`,progress:10+(i+1)/content.scenes.length*80,frames:[frame]});
  }
  await api({...lease,action:'framesComplete',frames});
}
