type Balance={provider:string;purpose:string;status:string;detail:string;dashboard:string};
export async function providerBalances(env:Record<string,string|undefined>,fetchImpl:typeof fetch=fetch):Promise<Balance[]>{
 const check=async(provider:string,purpose:string,key:string|undefined,url:string,headers:Record<string,string>,dashboard:string,format:(data:any)=>string):Promise<Balance>=>{
  const base={provider,purpose,dashboard};
  if(!key)return {...base,status:'Not configured',detail:'No API key is configured for this provider.'};
  try{
   const response=await fetchImpl(url,{headers,cache:'no-store',signal:AbortSignal.timeout(12000)});
   if(!response.ok){await response.body?.cancel();return {...base,status:'Balance unavailable',detail:`Balance lookup returned HTTP ${response.status}. This does not confirm an empty balance; the key may not have permission to read billing.`};}
   return {...base,status:'Checked',detail:format(await response.json())};
  }catch{return {...base,status:'Balance unavailable',detail:'The balance request could not be completed. Check the provider dashboard.'};}
 };
 const [runway,eleven]=await Promise.all([
  check('Runway','Video animation',env.VIDEO_API_KEY,'https://api.dev.runwayml.com/v1/organization',{Authorization:`Bearer ${env.VIDEO_API_KEY}`,'X-Runway-Version':'2024-11-06'},'https://dev.runwayml.com',d=>{
   if(typeof d.creditBalance!=='number'||!Number.isFinite(d.creditBalance))throw Error();
   return `${d.creditBalance.toLocaleString()} API credits remaining. Gen-4.5 uses 60 credits for a 5-second source or 120 for a 10-second source. Web app credits are separate.`;
  }),
  check('ElevenLabs','Uploaded character voices',env.ELEVENLABS_API_KEY,'https://api.elevenlabs.io/v1/user/subscription',{'xi-api-key':env.ELEVENLABS_API_KEY||''},'https://elevenlabs.io/app/subscription',d=>{
   if(!Number.isFinite(d.character_count)||!Number.isFinite(d.character_limit))throw Error();
   return `${d.character_count.toLocaleString()} of ${d.character_limit.toLocaleString()} subscription credits used; ${Math.max(0,d.character_limit-d.character_count).toLocaleString()} remaining in the reported allowance. Overage and key-specific limits may also apply.`;
  })
 ]);
 return [runway,eleven,{provider:'OpenAI',purpose:'Scripts, starting images and preset voices',status:env.LLM_API_KEY||env.IMAGE_API_KEY||env.TTS_API_KEY?'Check dashboard':'Not configured',detail:'Remaining balance is not available through the generation keys configured here. Organization usage reporting requires separate billing permissions. Check billing for the accounts behind each configured key.',dashboard:'https://platform.openai.com/settings/organization/billing/overview'},{provider:'Sync',purpose:'Lip sync for speaking shots',status:env.LIPSYNC_API_KEY?'Check dashboard':'Not configured',detail:'No balance lookup is configured. Check your Sync account dashboard. Voiceover shots do not need lip sync.',dashboard:'https://app.sync.so'}];
}
