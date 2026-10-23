export type AttemptSummary={state:string;trace_json?:unknown;updated_at:number};
/** Uma falha anterior à aprovação não bloqueia a retomada explicitamente aprovada. */
export function failedAttemptSince(requestedAt:number,run?:AttemptSummary|null){
 if(!run||run.state!=="failed")return false;
 let started=run.updated_at;
 try{const events=JSON.parse(String(run.trace_json||"[]"));const times=Array.isArray(events)?events.map(e=>Date.parse(String(e.at||""))).filter(Number.isFinite):[];if(times.length)started=Math.min(...times);}catch{}
 return started>=requestedAt;
}
