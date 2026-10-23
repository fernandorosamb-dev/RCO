import {diagnosticError,completionWithoutDownload} from "../../../imas-evidence";
import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
import {roles,isOverviewRole} from "../../../access";
import {reportMonth} from "../../../report-month";
export async function GET(request:Request){
 const role=await requireRole(roles);if(!role)return Response.json({error:"Faça login."},{status:401});
 const competence=new URL(request.url).searchParams.get("competence")||"";
 if(competence&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence))return Response.json({error:"Mês inválido."},{status:400});
 try{
  const scoped=isOverviewRole(role)?"":" AND r.area=?";
  const statement=env.DB.prepare(`SELECT r.public_id,r.os_number,r.imas_os_number,r.status,r.origin,r.activity_type,r.area,r.collaborator,r.environment,r.floor,r.observations,r.equipment,r.execution_started_at,r.completed_at,r.downloaded_at,r.created_at,
   (SELECT a.updated_at FROM imas_automation_runs a WHERE a.report_public_id=r.public_id ORDER BY a.updated_at DESC LIMIT 1) AS last_attempt_at,
   (SELECT a.state FROM imas_automation_runs a WHERE a.report_public_id=r.public_id ORDER BY a.updated_at DESC LIMIT 1) AS last_run_state,
   (SELECT a.step FROM imas_automation_runs a WHERE a.report_public_id=r.public_id ORDER BY a.updated_at DESC LIMIT 1) AS last_step,
   (SELECT a.trace_json FROM imas_automation_runs a WHERE a.report_public_id=r.public_id AND a.state='failed' ORDER BY a.updated_at DESC LIMIT 1) AS last_error_trace,
   (SELECT COALESCE(json_group_array(json_object('publicId',p.public_id,'fileName',p.file_name,'url','/api/photos/'||p.public_id)),'[]') FROM report_photos p WHERE p.report_public_id=r.public_id) AS photos_json
   FROM service_reports r WHERE r.origin='app' AND r.status<>'Excluída'${scoped} ORDER BY r.created_at DESC,r.id DESC`);
  const rows=await (isOverviewRole(role)?statement:statement.bind(role)).all<Record<string,unknown>>();
  const reports=rows.results.map((row:Record<string,unknown>)=>({publicId:String(row.public_id),osNumber:String(row.os_number),imasOsNumber:String(row.imas_os_number||""),status:String(row.status),origin:String(row.origin),activityType:String(row.activity_type),area:String(row.area),collaborator:String(row.collaborator),environment:String(row.environment),floor:String(row.floor),observations:String(row.observations),equipment:String(row.equipment),executionStartedAt:String(row.execution_started_at),completedAt:String(row.completed_at),downloadedAt:row.downloaded_at==null?null:new Date(Number(row.downloaded_at)).toISOString(),createdAt:new Date(Number(row.created_at)).toISOString(),lastAttemptAt:row.last_attempt_at==null?null:Number(row.last_attempt_at),lastError:diagnosticError(row.last_error_trace),lastStep:String(row.last_step||""),imasCompletionPending:completionWithoutDownload(String(row.imas_os_number||""),row.downloaded_at,String(row.last_run_state||""),String(row.last_step||"")),photos:JSON.parse(String(row.photos_json))})).filter(report=>!competence||reportMonth(report)===competence);
  return Response.json({reports},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return Response.json({error:"Não foi possível carregar as corretivas. Tente novamente."},{status:503});}
}
