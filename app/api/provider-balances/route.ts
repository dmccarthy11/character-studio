import {getChatGPTUser} from '@/app/chatgpt-auth';
import {providerBalances} from '@/lib/engine/provider-balances';
export const runtime='nodejs';
export async function GET(){
 if(!await getChatGPTUser())return new Response('Unauthorized',{status:401});
 return Response.json({checkedAt:new Date().toISOString(),providers:await providerBalances(process.env)},{headers:{'Cache-Control':'no-store'}});
}
