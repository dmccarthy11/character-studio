import {spawn} from 'node:child_process';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const permanentTls=new Set(['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID']);
export function networkReason(error){const code=error?.cause?.code||error?.code;return typeof code==='string'&&/^[A-Z0-9_]+$/.test(code)?code:'connection or response interrupted';}
export const retryableStatus=status=>status===408||status===425||status===429||status>=500;
export const retryableNetwork=error=>!permanentTls.has(error?.cause?.code||error?.code);
export const retryDelay=attempt=>Math.min(1000*2**attempt,8000);

// Only read-only GET requests are retried. Consume JSON inside the retry boundary
// because a connection can reset after headers arrive, while reading the body.
export async function readProviderJson(url,headers,{fetchImpl=fetch,pause=sleep,onRetry,label='Provider status',attempts=5}={}){
  let reason='connection interrupted';
  for(let attempt=0;attempt<attempts;attempt++){
    let retry=true;
    try{
      const response=await fetchImpl(url,{method:'GET',headers,signal:AbortSignal.timeout(120000)});
      if(response.ok)return await response.json();
      reason=`HTTP ${response.status}`;retry=retryableStatus(response.status);
      await response.body?.cancel().catch(()=>{});
    }catch(error){reason=networkReason(error);retry=retryableNetwork(error);}
    if(!retry||attempt===attempts-1)break;
    await onRetry?.({attempt:attempt+1,total:attempts,reason});await pause(retryDelay(attempt));
  }
  throw Error(`${label} check failed (${reason}). Resume to check the same saved task; no new generation was submitted.`);
}

// Windows curl uses the system TLS/proxy stack, which can work when Node fetch
// is reset by a proxy/CDN. Arguments are passed directly, without a shell.
export async function curlDownload(url,file){
  return new Promise((resolve,reject)=>{
    const executable=process.env.DOWNLOAD_CURL_PATH||(process.platform==='win32'?'curl.exe':'curl');
    const child=spawn(executable,['--silent','--show-error','--fail','--location','--max-redirs','5','--proto','=https','--proto-redir','=https','--http1.1','--connect-timeout','20','--max-time','120','--output',file,'--write-out','%{http_code}',url],{windowsHide:true,stdio:['ignore','pipe','ignore']});
    let output='';child.stdout.on('data',bytes=>output=(output+bytes).slice(-100));
    child.on('error',()=>reject(Error('System download tool unavailable.')));
    child.on('close',code=>{const status=Number(output);if(code===0&&status>=200&&status<300)resolve();else{const error=Error(status>=400?`HTTP ${status}`:`System download failed (exit ${code}).`);error.status=status>=400?status:undefined;reject(error);}});
  });
}
