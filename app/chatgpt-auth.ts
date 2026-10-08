// Single-user loopback-only edition. No ChatGPT account or hosted identity required.
import {headers} from 'next/headers';
export async function getChatGPTUser(){const h=await headers();const host=h.get('host')||'';if(!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))return null;const origin=h.get('origin');if(origin){try{if(new URL(origin).host!==host)return null;}catch{return null;}}if(h.get('sec-fetch-site')==='cross-site')return null;return {userId:'local',displayName:'Local workspace',email:'local@localhost',fullName:'Local user'};}
