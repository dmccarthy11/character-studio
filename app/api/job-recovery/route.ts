import {priorReservation} from '@/workers/realism.mjs';
import {z} from 'zod';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {readState,saveState,dataRoot} from '@/lib/engine/store';
import {inspectRecovery,authorizeFrameRetry} from '@/workers/job-recovery.mjs';

export const runtime='nodejs';
export async function GET(request:Request){try{
  const user=await getChatGPTUser();if(!user)return new Response('Unauthorized',{status:401});
  const jobId=new URL(request.url).searchParams.get('jobId')||'',{state}=await readState(user.userId);
  const job=state.jobs.find(job=>job.id===jobId);if(!job||!job.contentId||job.kind==='AUDIO'||job.kind==='ASSET_PACK')throw Error('Video job not found.');
  return Response.json(await inspectRecovery(dataRoot(),job.id));
}catch(error){return Response.json({error:error instanceof Error?error.message:'Could not inspect saved media.'},{status:400});}}

export async function POST(request:Request){try{
  const user=await getChatGPTUser();if(!user)return new Response('Unauthorized',{status:401});
  const input=z.object({jobId:z.string(),sceneId:z.string(),acceptPossibleCharge:z.literal(true)}).parse(await request.json());
  const {state,revision}=await readState(user.userId),job=state.jobs.find(job=>job.id===input.jobId);
  if(!job||job.provider==='Mock'||!['VIDEO','FRAMES'].includes(job.kind||'')||!['FAILED','CANCELLED'].includes(job.status))throw Error('Retry a starting image only in a failed or cancelled live video job.');
  const content=state.contents.find(content=>content.id===job.contentId);if(!content||content.pipelineVersion!==2)throw Error('This recovery is available for audio-first video jobs.');
  if(state.jobs.some(other=>other.contentId===content.id&&['QUEUED','RUNNING'].includes(other.status)))throw Error('Cancel the active job before retrying a starting image.');
  if(content.approvedVersion!==content.scriptVersion||content.audioApprovedVersion!==content.scriptVersion)throw Error('Approve the current script and voice previews before resuming video generation.');
  if(!content.scenes.some(shot=>shot.id===input.sceneId))throw Error('Shot not found in this edit.');
  const estimate=content.realismVersion?Math.max(.3,Number(process.env.IMAGE_COST_ESTIMATE)||0):Number(process.env.IMAGE_COST_ESTIMATE);if(content.realismVersion&&priorReservation(state.jobs,content.id)+estimate>Math.min(10,state.settings.maxJobCost))throw Error('Another image request would exceed the remaining video budget.');
  if(!process.env.IMAGE_API_KEY||!process.env.VIDEO_API_KEY||!process.env.WORKER_TOKEN)throw Error('Configure image/video credentials and the media worker before retrying.');
  if(!(estimate>0)||estimate>state.settings.maxJobCost)throw Error('Set IMAGE_COST_ESTIMATE within your job budget before retrying.');
  const shot=await authorizeFrameRetry(dataRoot(),job.id,input.sceneId);
  if(content.realismVersion)job.estimatedCost=(job.estimatedCost||0)+estimate;job.status='QUEUED';job.error=undefined;job.leaseToken=undefined;job.stage=`Starting image retry authorized for shot ${shot.number}`;
  content.status='GENERATING';content.history.push({at:new Date().toISOString(),action:'authorize-frame-retry',value:{jobId:job.id,sceneId:input.sceneId,estimatedImageCost:estimate}});
  await saveState(user.userId,state,revision);
  return Response.json({state,message:`Shot ${shot.number} starting image will be retried. The saved job will continue using completed clips; another image charge is possible.`});
}catch(error){return Response.json({error:error instanceof z.ZodError?'Accept the possible additional image charge before retrying.':error instanceof Error?error.message:'Could not resume this job.'},{status:400});}}
