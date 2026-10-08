// Loaded only by the disposable API test runner; never sends provider requests.
import {appendFileSync} from 'node:fs';
import path from 'node:path';
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(!url.startsWith('https://api.elevenlabs.io/'))return originalFetch(input,options);
  if(!process.env.DATA_DIR||process.env.ELEVENLABS_API_KEY!=='fixture-only')throw Error('Voice fixture requires isolated test credentials.');
  appendFileSync(path.join(process.env.DATA_DIR,'voice-requests.jsonl'),JSON.stringify({url})+'\n');
  if(url.endsWith('/voices/add')){
    const name=options.body.get('name');
    if(name==='uncertain-voice-fixture')throw Error('Connection lost after submission');
    if(name==='rejected-voice-fixture')return Response.json({detail:'Access denied'},{status:403});
    return Response.json({voice_id:'fixture-reusable-voice',requires_verification:name==='verification-voice-fixture'});
  }
  if(url.endsWith('/voices/fixture-reusable-voice'))return Response.json({voice_id:'fixture-reusable-voice'});
  return Response.json({detail:'Not found'},{status:404});
};
