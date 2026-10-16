import assert from 'node:assert/strict';
import {providerBalances} from '../lib/engine/provider-balances.ts';

const env={VIDEO_API_KEY:'private-video-key',ELEVENLABS_API_KEY:'private-voice-key',IMAGE_API_KEY:'private-image-key'};
let requests=0;
const results=await providerBalances(env,async(url,options)=>{
 requests++;
 assert.equal(options.method,undefined); // Fetch defaults to GET: never submit a generation.
 assert.equal(options.body,undefined);
 if(url.includes('runwayml'))return Response.json({creditBalance:5,privateField:'must-not-reach-browser'});
 return Response.json({character_count:1200,character_limit:10000});
});
assert.equal(requests,2);
assert.match(results[0].detail,/5 API credits remaining/);
assert.match(results[1].detail,/8,800 remaining/);
assert.equal(results[2].status,'Check dashboard');
assert(!JSON.stringify(results).includes('private-'));
assert(!JSON.stringify(results).includes('must-not-reach-browser'));
const denied=await providerBalances(env,async()=>Response.json({message:'private-video-key'},{status:401}));
assert.match(denied[0].detail,/HTTP 401/);
assert.match(denied[0].detail,/does not confirm an empty balance/);
assert(!JSON.stringify(denied).includes('private-video-key'));
await providerBalances({},async()=>assert.fail('Unconfigured keys must not make requests'));
const invalid=await providerBalances(env,async()=>Response.json({creditBalance:'not-a-number'}));
assert.equal(invalid[0].status,'Balance unavailable');
assert.equal(invalid[1].status,'Balance unavailable');
const offline=await providerBalances(env,async()=>{throw Error('network failure private-video-key');});
assert.equal(offline[0].status,'Balance unavailable');
assert(!JSON.stringify(offline).includes('private-video-key'));
console.log('Provider balance fixtures passed: read-only requests, allowance math, permission failures, malformed data and secret redaction.');
