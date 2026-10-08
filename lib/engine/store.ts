import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {seed} from './seed';
import type {State} from './types';
export const dataRoot=()=>path.resolve(process.env.DATA_DIR||path.join(process.cwd(),'data'));
let connection:DatabaseSync|undefined;
function db(){if(!connection){mkdirSync(dataRoot(),{recursive:true});connection=new DatabaseSync(path.join(dataRoot(),'studio.sqlite'));connection.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1); PRAGMA user_version=1;');}return connection;}
export async function readState(owner:string):Promise<{state:State;revision:number}>{const row=db().prepare('SELECT data,revision FROM workspaces WHERE id=?').get(owner) as {data:string;revision:number}|undefined;if(row)return {state:JSON.parse(row.data),revision:row.revision};db().prepare('INSERT OR IGNORE INTO workspaces(id,data,revision) VALUES(?,?,1)').run(owner,JSON.stringify(seed()));return readState(owner);}
export async function saveState(owner:string,state:State,revision:number){const result=db().prepare('UPDATE workspaces SET data=?,revision=revision+1 WHERE id=? AND revision=?').run(JSON.stringify(state),owner,revision);if(!result.changes)throw Error('Your workspace changed in another tab. Refresh and try again.');}
export async function listWorkspaces(){return db().prepare('SELECT id,data,revision FROM workspaces').all() as unknown as {id:string;data:string;revision:number}[];}
