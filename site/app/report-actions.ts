import {readRoleRoster} from "./role-roster-server";
import {rosterExecutor} from "./role-roster";
import {plannedDateForOrder} from "./preventive-schedule-server";
import {normalizePreventiveSchedule} from "./preventive-schedule";
import {env} from "cloudflare:workers";
import {IMAS_SYSTEMS,imasExecutor,isImasDate} from "./imas-config";
import {normalizeSchedule} from "./imas-schedule";
import {hasValidLocation} from "./location-fields";

export type ActionResult={ok:true;message?:string}|{ok:false;status:number;error:string};
type Row={origin:string;status:string;downloaded_at:number|null;imas_os_number:string;work_order_public_id:string|null;collaborator:string;execution_started_at:string;completed_at:string;environment:string;floor:string;observations:string;activity_type:string;description:string;equipment:string;area:string;imas_system:string;imas_subject:string;imas_opened_at:string;os_number:string};

// Campos que o engenheiro pode propor. Fotos não entram: só o supervisor mexe nelas.
export const PROPOSAL_FIELDS=["collaborator","executionStartedAt","completedAt","environment","floor","observations"] as const;
export const PROPOSAL_APP_FIELDS=["activityType","description","equipment","imasSystem","imasSubject"] as const;
const COLUMNS:Record<string,keyof Row>={collaborator:"collaborator",executionStartedAt:"execution_started_at",completedAt:"completed_at",environment:"environment",floor:"floor",observations:"observations",activityType:"activity_type",description:"description",equipment:"equipment",imasSystem:"imas_system",imasSubject:"imas_subject"};

const load=(id:string)=>env.DB.prepare("SELECT * FROM service_reports WHERE public_id=?").bind(id).first<Row>();
export function currentValues(row:Row){return Object.fromEntries(Object.entries(COLUMNS).map(([key,column])=>[key,String(row[column]??"")])) as Record<string,string>;}

async function busyReason(id:string){
  const request=await env.DB.prepare("SELECT state FROM imas_automation_requests WHERE report_public_id=?").bind(id).first<{state:string}>();
  if(request?.state==="processing")return "A OS está em processamento. Aguarde o resultado.";
  const run=await env.DB.prepare("SELECT state,updated_at FROM imas_automation_runs WHERE report_public_id=? ORDER BY updated_at DESC LIMIT 1").bind(id).first<{state:string;updated_at:number}>();
  if(run?.state==="running"&&Date.now()-run.updated_at<180000)return "A OS está em execução. Aguarde o resultado.";
  return "";
}

/** Rejeitar: OS nova do app é excluída e nunca criada; OS do IMAS tem os dados zerados e volta à fila do colaborador. */
export async function rejectReport(id:string):Promise<ActionResult>{
  const row=await load(id);
  if(!row)return {ok:false,status:404,error:"OS não encontrada."};
  if(row.downloaded_at||row.status==="Excluída")return {ok:false,status:409,error:"A OS já foi baixada ou excluída."};
  const busy=await busyReason(id);if(busy)return {ok:false,status:409,error:busy};
  const request=await env.DB.prepare("SELECT state FROM imas_automation_requests WHERE report_public_id=?").bind(id).first<{state:string}>();
  if(request?.state==="completed")return {ok:false,status:409,error:"A OS já foi concluída no IMAS e não pode ser rejeitada."};
  if(row.origin==="app"&&row.imas_os_number)return {ok:false,status:409,error:"Esta OS já foi criada no IMAS (nº "+row.imas_os_number+"). Não é possível excluí-la aqui."};
  const now=Date.now(),token=crypto.randomUUID();
  const guard="EXISTS(SELECT 1 FROM imas_automation_requests WHERE report_public_id=? AND request_id=? AND state='rejected')";
  const operations=[
    env.DB.prepare("INSERT INTO imas_automation_requests (report_public_id,request_id,fingerprint,state,requested_at,updated_at) VALUES (?,?,'','rejected',?,?) ON CONFLICT(report_public_id) DO UPDATE SET request_id=excluded.request_id,fingerprint='',state='rejected',updated_at=excluded.updated_at WHERE imas_automation_requests.state NOT IN ('processing','completed')").bind(id,token,now,now),
    env.DB.prepare(`UPDATE service_reports SET status='Excluída',return_reason='' WHERE public_id=? AND downloaded_at IS NULL AND status<>'Excluída' AND (origin<>'app' OR imas_os_number='') AND ${guard}`).bind(id,id,token),
  ];
  if(row.origin!=="app")operations.push(env.DB.prepare(`UPDATE work_orders SET status='Atribuída',updated_at=? WHERE public_id=? AND status<>'Atribuir' AND ${guard} AND EXISTS(SELECT 1 FROM service_reports WHERE public_id=? AND status='Excluída')`).bind(now,row.work_order_public_id||"",id,token,id));
  const results=await env.DB.batch(operations);
  if(!results[1].meta?.changes)return {ok:false,status:409,error:"A OS mudou ou começou a ser processada. Atualize antes de rejeitar."};
  return {ok:true,message:row.origin==="app"?"OS rejeitada: excluída e não será criada no IMAS.":"OS rejeitada: dados enviados retirados da fila; a OS voltou ao colaborador. O relatório anterior foi preservado no histórico."};
}

/** Calcula só o que mudou (antes/depois), já com o horário padronizado. */
export async function diffProposal(id:string,incoming:Record<string,unknown>):Promise<{ok:false;status:number;error:string}|{ok:true;before:Record<string,string>;after:Record<string,string>}>{
  const row=await load(id);
  if(!row)return {ok:false,status:404,error:"OS não encontrada."};
  if(row.downloaded_at||row.status==="Excluída")return {ok:false,status:409,error:"A OS já foi baixada ou excluída."};
  const allowed:string[]=[...PROPOSAL_FIELDS,...(row.origin==="app"?PROPOSAL_APP_FIELDS:[])];
  const now=currentValues(row);const next={...now};
  for(const key of allowed){if(typeof incoming[key]==="string")next[key]=(incoming[key] as string).trim();}
  if(allowed.includes("collaborator")&&next.collaborator!==now.collaborator){const executor=rosterExecutor(next.collaborator,await readRoleRoster());if(!executor)return {ok:false,status:400,error:"Selecione um executor do cadastro IMAS."};next.collaborator=executor;}
  if(next.executionStartedAt!==now.executionStartedAt||next.completedAt!==now.completedAt){
    if(row.origin==="app"&&(!isImasDate(next.executionStartedAt)||!isImasDate(next.completedAt)))return {ok:false,status:400,error:"Informe início e conclusão com data e hora válidas."};
    const plan=row.work_order_public_id?await plannedDateForOrder(row.work_order_public_id):null;
    const schedule=row.origin!=="app"&&plan?normalizePreventiveSchedule(next.executionStartedAt,next.completedAt,plan.planned,plan.competence,row.imas_opened_at||""):normalizeSchedule(next.executionStartedAt,next.completedAt,row.imas_opened_at||"");
    if(!schedule)return {ok:false,status:400,error:"Informe início e conclusão com data e hora válidas."};
    next.executionStartedAt=schedule.executionStartedAt;next.completedAt=schedule.completedAt;
  }
  const before:Record<string,string>={},after:Record<string,string>={};
  for(const key of allowed)if(next[key]!==now[key]){before[key]=now[key];after[key]=next[key];}
  if(Object.entries(next).some(([key,value])=>value.length>(["description","observations"].includes(key)?10000:500)))return {ok:false,status:400,error:"Reduza o tamanho dos textos informados."};
  if(!Object.keys(after).length)return {ok:false,status:400,error:"Nenhuma alteração em relação ao que está salvo."};
  return {ok:true,before,after};
}

/** Aplica uma alteração já decidida pelo supervisor. Confere se a OS ainda está como na proposta. */
export async function applyChange(id:string,before:Record<string,string>,after:Record<string,string>):Promise<ActionResult>{
  const row=await load(id);
  if(!row)return {ok:false,status:404,error:"OS não encontrada."};
  if(row.downloaded_at||row.status==="Excluída")return {ok:false,status:409,error:"A OS já foi baixada ou excluída."};
  const busy=await busyReason(id);if(busy)return {ok:false,status:409,error:busy};
  const now=currentValues(row);
  const keys=Object.keys(after);
  const allowed:string[]=[...PROPOSAL_FIELDS,...(row.origin==="app"?PROPOSAL_APP_FIELDS:[])];
  if(!keys.length||keys.some(key=>!allowed.includes(key)))return {ok:false,status:400,error:"Alteração inválida."};
  if(keys.some(key=>now[key]!==before[key]))return {ok:false,status:409,error:"A OS mudou depois do pedido do engenheiro. Recuse e peça uma nova alteração."};
  const merged={...now,...after};
  if(!rosterExecutor(merged.collaborator,await readRoleRoster()))return {ok:false,status:400,error:"Executor fora do cadastro IMAS."};
  const source=row.work_order_public_id?await env.DB.prepare("SELECT unit FROM work_orders WHERE public_id=?").bind(row.work_order_public_id).first<{unit:string}>():null;
  if(!merged.observations||!merged.environment||!merged.floor)return {ok:false,status:400,error:"Preencha os campos obrigatórios."};
  if(!hasValidLocation(merged.environment,source?.unit||"")||!hasValidLocation(merged.floor,source?.unit||""))return {ok:false,status:400,error:"Ambiente/Pavimento inválidos para esta OS."};
  const plan=row.work_order_public_id?await plannedDateForOrder(row.work_order_public_id):null;
  const schedule=row.origin!=="app"&&plan?normalizePreventiveSchedule(merged.executionStartedAt,merged.completedAt,plan.planned,plan.competence,row.imas_opened_at||""):normalizeSchedule(merged.executionStartedAt,merged.completedAt,row.imas_opened_at||"");
  if(!schedule)return {ok:false,status:400,error:"Datas inválidas."};
  merged.executionStartedAt=schedule.executionStartedAt;merged.completedAt=schedule.completedAt;
  if(row.origin==="app"){
    if(!["Corretiva","Teste de equipamento"].includes(merged.activityType)||!merged.description||(merged.activityType==="Teste de equipamento"&&!merged.equipment))return {ok:false,status:400,error:"Confira tipo, descrição e equipamento."};
    if(!(IMAS_SYSTEMS as readonly string[]).includes(merged.imasSystem)||!merged.imasSubject||merged.imasSubject.length>500)return {ok:false,status:400,error:"Confira sistema e assunto do IMAS."};
  }
  const sets=["collaborator=?","execution_started_at=?","completed_at=?","environment=?","floor=?","observations=?"];
  const values:unknown[]=[merged.collaborator,merged.executionStartedAt,merged.completedAt,merged.environment,merged.floor,merged.observations];
  if(row.origin==="app"){sets.push("activity_type=?","description=?","equipment=?","imas_system=?","imas_subject=?","imas_opened_at=?");values.push(merged.activityType,merged.description,merged.equipment,merged.imasSystem,merged.imasSubject,schedule.imasOpenedAt);}
  const stamp=Date.now(),token=crypto.randomUUID();
  const results=await env.DB.batch([
    env.DB.prepare("INSERT INTO imas_automation_requests (report_public_id,request_id,fingerprint,state,requested_at,updated_at) VALUES (?,?,'','changed',?,?) ON CONFLICT(report_public_id) DO UPDATE SET request_id=excluded.request_id,fingerprint='',state='changed',updated_at=excluded.updated_at WHERE imas_automation_requests.state NOT IN ('processing','completed')").bind(id,token,stamp,stamp),
    env.DB.prepare(`UPDATE service_reports SET ${sets.join(", ")} WHERE public_id=? AND downloaded_at IS NULL AND status<>'Excluída' AND ${keys.map(key=>COLUMNS[key]+"=?").join(" AND ")} AND EXISTS(SELECT 1 FROM imas_automation_requests WHERE report_public_id=? AND request_id=? AND state='changed')`).bind(...values,id,...keys.map(key=>before[key]),id,token),
  ]);
  if(!results[1].meta?.changes)return {ok:false,status:409,error:"A OS mudou ou começou a ser processada. Recuse e peça uma nova alteração."};
  return {ok:true,message:"Alteração aplicada."};
}
