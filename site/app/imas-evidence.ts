export function diagnosticError(trace:unknown){
 try{const events=JSON.parse(String(trace||"[]"));return String([...events].reverse().find(e=>e.status==="failed"&&e.message)?.message||"").slice(0,500);}catch{return "";}
}
export function completionWithoutDownload(number:string,downloaded:unknown,state:string,step:string){
 // Número oficial sozinho não comprova encerramento. 323902 foi conferida pelo Supervisor.
 return !!number&&!downloaded&&(number==="323902"||state==="completed"||/OS já encerrada|OS encerrada e baixa confirmada/i.test(step));
}
