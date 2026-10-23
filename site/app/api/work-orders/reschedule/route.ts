import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
import {roles,isOverviewRole} from "../../../access";
import {planDate} from "../../../order-deadlines";
import {effectiveExecutionDate} from "../../../maintenance-plan";
type Order={public_id:string;competence:string;os_number:string;assigned_area:string;status:string};
async function orderById(id:string){return env.DB.prepare("SELECT public_id,competence,os_number,assigned_area,status FROM work_orders WHERE public_id=?").bind(id).first<Order>();}
export async function GET(request:Request){
 const role=await requireRole(roles);if(!role)return Response.json({error:"Faça login."},{status:401});
 const id=new URL(request.url).searchParams.get("publicId")||"",order=await orderById(id);if(!order||!isOverviewRole(role)&&order.assigned_area!==role)return Response.json({error:"OS não encontrada para seu perfil."},{status:404});
 const rows=await env.DB.prepare("SELECT previous_date,execution_date,reason,changed_by_role,revision,created_at FROM work_order_schedule_history WHERE work_order_public_id=? ORDER BY revision DESC LIMIT 50").bind(id).all();return Response.json({history:rows.results},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request){
 const role=await requireRole(["supervisor","eletrica","hidraulica","refrigeracao","civil"]);if(!role)return Response.json({error:"Seu perfil permite somente consulta."},{status:403});
 try{
  const body=await request.json(),id=String(body.publicId||""),date=String(body.executionDate||""),reason=String(body.reason||"").trim();
  if(planDate(date)!==date||reason.length>600)return Response.json({error:"Informe uma data válida e um motivo com até 600 caracteres."},{status:400});
  if(date.slice(8,10)>"20")return Response.json({error:"Preventivas devem ser programadas até o dia 20 do mês."},{status:400});
  const order=await orderById(id);if(!order)return Response.json({error:"OS não encontrada."},{status:404});if(role!=="supervisor"&&order.assigned_area!==role)return Response.json({error:"Você só pode reprogramar OS da sua área."},{status:403});
  if(["Concluída","Aguardando aprovação"].includes(order.status))return Response.json({error:"Esta OS já recebeu retorno de execução. Corrija as datas em Revisar → Editar."},{status:409});
  const current=await env.DB.prepare("SELECT * FROM work_order_schedule WHERE work_order_public_id=?").bind(id).first<{original_date:string;execution_date:string;revision:number}>();
  const previous=current?.execution_date||effectiveExecutionDate(order.competence,order.os_number,order.assigned_area,order.status),revision=current?.revision||0;
  if(Number(body.revision)!==revision||String(body.previousDate||"")!==previous)return Response.json({error:"A programação mudou. Atualize a OS antes de salvar."},{status:409});
  if(date===previous)return Response.json({error:"A OS já está programada para esta data."},{status:409});
  const changeId=crypto.randomUUID(),now=Date.now();
  const guard="EXISTS(SELECT 1 FROM work_orders w WHERE w.public_id=? AND w.status NOT IN ('Concluída','Aguardando aprovação') AND (?='supervisor' OR w.assigned_area=?)) AND NOT EXISTS(SELECT 1 FROM service_reports r WHERE r.work_order_public_id=? AND r.status<>'Excluída')";
  const results=await env.DB.batch([
   env.DB.prepare(`INSERT INTO work_order_schedule (work_order_public_id,original_date,execution_date,reason,changed_by_role,change_id,revision,updated_at) SELECT ?,?,?,?,?,?,1,? WHERE ${guard} ON CONFLICT(work_order_public_id) DO UPDATE SET execution_date=excluded.execution_date,reason=excluded.reason,changed_by_role=excluded.changed_by_role,change_id=excluded.change_id,revision=work_order_schedule.revision+1,updated_at=excluded.updated_at WHERE work_order_schedule.revision=? AND ${guard}`).bind(id,current?.original_date||previous,date,reason,role,changeId,now,id,role,role,id,revision,id,role,role,id),
   env.DB.prepare("INSERT INTO work_order_schedule_history (public_id,work_order_public_id,previous_date,execution_date,reason,changed_by_role,revision,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_order_schedule WHERE work_order_public_id=? AND change_id=?)").bind(changeId,id,previous,date,reason,role,revision+1,now,id,changeId),
  ]);
  if(!results[0].meta.changes||!results[1].meta.changes)return Response.json({error:"A OS mudou ou recebeu retorno de execução. Atualize antes de salvar."},{status:409});
  return Response.json({saved:true,executionDate:date,message:"Data de execução alterada. A agenda e o acompanhamento foram atualizados."});
 }catch{return Response.json({error:"Não foi possível mudar a data. Tente novamente."},{status:500});}
}
