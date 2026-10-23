export function nextSlot(now=new Date()) {
  // Fixed São Paulo wall clock: first run today, then Monday-Friday at 07:00.
  const first=new Date('2026-10-08T15:45:00-03:00');
  if(now<first)return first.getTime();
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const base=new Date(`${date}T00:00:00Z`);
  for(let offset=0;offset<8;offset++){
    const day=new Date(base.getTime()+offset*86400000),weekday=day.getUTCDay();
    if(weekday===0||weekday===6)continue;
    const slot=new Date(`${day.toISOString().slice(0,10)}T07:00:00-03:00`);
    if(slot>now&&slot>first)return slot.getTime();
  }
  throw Error('Não foi possível definir a próxima execução.');
}
export function safeJob(job) {
  if(job?.externalNumber==='323902'||job?.publicId==='4e9bd0d3-5e4f-4f25-8301-2942d04dc0d1')throw Error('OS 323902 protegida pelo supervisor.');
  if(!job||!job.ready||job.errors?.length)throw Error('Corrija os campos pendentes da OS no app.');
  if(job.saveAllowed!==false||job.photoUploadAllowed!==false||job.mode!=='validation')throw Error('Este pacote aceita apenas modo de validação.');
  if(!['criar','encerrar'].includes(job.phase))throw Error('Etapa inválida.');
  if(job.phase==='criar'&&job.externalNumber)throw Error('OS já vinculada. Não criar novamente.');
  if(job.phase==='encerrar'&&!/^\d+$/.test(job.externalNumber||''))throw Error('Vincule o número do IMAS antes de encerrar.');
  return job;
}
