'use client';
import {useState} from 'react';
import {Loader2,RefreshCw} from 'lucide-react';
type Result={checkedAt:string;providers:{provider:string;purpose:string;status:string;detail:string;dashboard:string}[]};
export function ProviderBalances(){
 const [result,setResult]=useState<Result>(),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const load=async()=>{setLoading(true);setError('');try{const r=await fetch('/api/provider-balances',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();setResult(await r.json());}catch{setError('Could not check balances. Try again.');}finally{setLoading(false);}};
 return <section className="panel"><h2>Provider balances & usage</h2><p>Check the accounts connected to this studio. These lookups do not generate media or spend generation credits.</p><button className="button secondary" disabled={loading} onClick={load}>{loading?<Loader2 size={16} className="spin"/>:<RefreshCw size={16}/>} {loading?'Checking provider balances...':'Check provider balances'}</button>{error&&<p role="alert">{error}</p>}{result&&<><p className="small muted">Last checked {new Date(result.checkedAt).toLocaleString()}. Account balances can change outside this studio; a balance does not guarantee a generation will succeed.</p><div aria-live="polite">{result.providers.map(p=><article className="balance-provider" key={p.provider}><div className="row between gap wrap"><strong>{p.provider}</strong><span className="tag">{p.status}</span></div><p className="small muted">{p.purpose}</p><p>{p.detail}</p><a className="text-button" href={p.dashboard} target="_blank" rel="noreferrer">Open {p.provider} billing dashboard →</a></article>)}</div></>}</section>;
}
