import {failedAttemptSince,type AttemptSummary} from "../../../imas-queue-admission";
import {recoverStalledApprovals} from "../../../imas-timeout";
import {env} from "cloudflare:workers";
import {approvalFingerprint} from "../../../imas-approval";
import {requireRole} from "../../../auth";
import {GET as reportsGet} from "../../reports/route";
import {imasJob} from "../../../imas-jobs";
import type {ExportReport} from "../../../report-export";
export async function GET() {
  if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Entre como Supervisor para consultar a fila IMAS."},{status:403});
  await recoverStalledApprovals();
  const response=await reportsGet();if(!response.ok)return response;
  const {reports}=await response.json() as {reports:ExportReport[]};
  const requests=await env.DB.prepare("SELECT report_public_id,request_id,fingerprint,requested_at,state FROM imas_automation_requests WHERE state IN ('queued','processing','failed','completed')").all<{report_public_id:string;request_id:string;fingerprint:string;requested_at:number;state:string}>();
  const runs=await env.DB.prepare("SELECT a.report_public_id,a.state,a.trace_json,a.updated_at FROM imas_automation_runs a WHERE NOT EXISTS(SELECT 1 FROM imas_automation_runs n WHERE n.report_public_id=a.report_public_id AND (n.updated_at>a.updated_at OR (n.updated_at=a.updated_at AND n.run_id>a.run_id)))").all<AttemptSummary&{report_public_id:string}>();
  const jobs=await Promise.all(reports.map(async report=>{
   const job=imasJob(report),request=requests.results.find(r=>r.report_public_id===report.publicId);
   const failed=request&&failedAttemptSince(request.requested_at,runs.results.find(r=>r.report_public_id===report.publicId));
   const contentApproved=!!request&&request.fingerprint===await approvalFingerprint(report);
   const technicalError=contentApproved&&(failed||["failed","completed"].includes(request!.state));
   const approved=contentApproved&&!technicalError;
   const errors=[...job.errors];
   if(!approved)errors.push(technicalError?"Erro do IMAS — reprocessar (Tentativa anterior falhou ou baixa não confirmada)":report.status==="Aguardando execução"?"Aguardar execução e envio do colaborador":"OS sem aprovação executável: aguardar revisão do Supervisor");
   // A extensão relê a OS depois da claim. Processing mantém o mesmo Job
   // autorizado; POST claim continua atômico e recusa uma segunda tomada.
   return {...job,errors,ready:job.ready&&approved,approvalRequest:contentApproved&&job.ready?{requestId:request!.request_id,state:request!.state}:null};
  }));
  return Response.json({mode:"validation",saveAllowed:false,photoUploadAllowed:false,jobs}, {headers:{"Cache-Control":"no-store"}});
}
