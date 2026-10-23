import {diagnosticError,completionWithoutDownload} from "./imas-evidence";
import {recoverStalledApprovals} from "./imas-timeout";
import {env} from "cloudflare:workers";
import {automationFeedback,runStartedAt,type AutomationRequest,type AutomationRun} from "./automation-feedback";
export async function readAutomationFeedback(){
 await recoverStalledApprovals();
 const [requests,runs,ids]=await Promise.all([
  env.DB.prepare("SELECT report_public_id,request_id,state,requested_at,updated_at FROM imas_automation_requests").all<AutomationRequest&{report_public_id:string}>(),
  env.DB.prepare("SELECT report_public_id,state,step,trace_json,updated_at FROM imas_automation_runs ORDER BY updated_at DESC,run_id DESC").all<AutomationRun&{report_public_id:string}>(),
  env.DB.prepare("SELECT public_id,os_number,origin,imas_os_number FROM service_reports WHERE downloaded_at IS NULL AND status<>'Excluída'").all<{public_id:string;os_number:string;origin:string;imas_os_number:string}>(),
 ]);
 const requestById=new Map(requests.results.map(row=>[row.report_public_id,row]));
 const runById=new Map<string,AutomationRun>();
 for(const run of runs.results){const request=requestById.get(run.report_public_id);if(!runById.has(run.report_public_id)&&(!request||runStartedAt(run)>=request.requested_at))runById.set(run.report_public_id,run);}
 return Object.fromEntries(ids.results.map(row=>{
  const ownRuns=runs.results.filter(run=>run.report_public_id===row.public_id),last=ownRuns.find(run=>!/^(Revisão|Erro do IMAS) — execução sem resposta/.test(run.step))||ownRuns[0];
  const errorRun=ownRuns.find(run=>diagnosticError(run.trace_json));
  return [row.public_id,{...automationFeedback(requestById.get(row.public_id)||null,runById.get(row.public_id)||null),osNumber:row.origin==="app"?row.imas_os_number:row.os_number,lastAttemptAt:last?.updated_at||null,lastError:errorRun?diagnosticError(errorRun.trace_json):"",imasCompletionPending:completionWithoutDownload(row.origin==="app"?row.imas_os_number:row.os_number,null,last?.state||"",last?.step||"")}];
 }));
}
