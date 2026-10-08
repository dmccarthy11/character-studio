import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {dataRoot} from './store';
export function mediaPath(key:string){if(!key||key.includes('\\')||key.includes('\0')||key.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Invalid media path');const base=path.join(dataRoot(),'media');const target=path.resolve(base,key);if(!target.startsWith(base+path.sep))throw Error('Invalid media path');return target;}
export interface StorageProvider{put(key:string,bytes:ArrayBuffer|Uint8Array,contentType:string):Promise<string>}
class LocalStorage implements StorageProvider{async put(key:string,bytes:ArrayBuffer|Uint8Array,contentType:string){const target=mediaPath(key);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,new Uint8Array(bytes instanceof ArrayBuffer?bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),{flag:'wx'});await writeFile(target+'.metadata.json',JSON.stringify({contentType}),{flag:'wx'});return `/api/files/${key}`;}}
export function storage():StorageProvider{return new LocalStorage();}
export async function readMedia(key:string){const file=mediaPath(key);const info=await stat(file);let contentType='application/octet-stream';try{contentType=JSON.parse(await readFile(file+'.metadata.json','utf8')).contentType;}catch{}return {file,size:info.size,contentType};}
