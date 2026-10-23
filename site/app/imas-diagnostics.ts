// Explicit projection: browser credentials, field values and photos are never persisted.
const short=(v:unknown,n=160)=>typeof v==="string"?v.slice(0,n):"";
export function cleanDiagnostic(input:unknown) {
  const r=input as Record<string,unknown>;
  if(!r||typeof r!=="object"||!/^[-a-zA-Z0-9]{1,80}$/.test(String(r.runId))||!/^[-a-zA-Z0-9]{1,80}$/.test(String(r.publicId))||!/^\d+\.\d+\.\d+$/.test(String(r.version))||!["running","failed","review","completed"].includes(String(r.state)))throw Error("Diagnóstico inválido.");
  const events=Array.isArray(r.events)?r.events.slice(-200).map(e=>({at:short(e.at,40),step:short(e.step,80),status:short(e.status,20),field:short(e.field,60),path:short(e.path,120),message:short(e.message,300)})):[];
  const controls=Array.isArray(r.controls)?r.controls.slice(0,80).filter(c=>c.type!=="password"&&c.type!=="hidden"&&c.type!=="file").map(c=>({id:short(c.id),name:short(c.name),type:short(c.type,30),label:short(c.label),selector:short(c.selector)})):[];
  const requestId=typeof r.requestId==="string"&&/^[-a-zA-Z0-9]{1,80}$/.test(r.requestId)?r.requestId:undefined;
  return {requestId,runId:String(r.runId),publicId:String(r.publicId),version:String(r.version),state:String(r.state),step:short(r.step,80),events,controls};
}
