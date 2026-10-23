import {env} from "cloudflare:workers";
import {approvalFingerprint} from "../../../imas-approval";
import {requireRole} from "../../../auth";
import {GET as reportsGet} from "../../reports/route";
import {imasJob} from "../../../imas-jobs";
import type {ExportReport} from "../../../report-export";
export async function GET() {
  if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Entre como Supervisor para consultar a fila IMAS."},{status:403});
  const response=await reportsGet();if(!response.ok)return response;
  const {reports}=await response.json() as {reports:ExportReport[]};
  const requests=await env.DB.prepare("SELECT report_public_id,request_id,fingerprint FROM imas_automation_requests WHERE state='queued'").all<{report_public_id:string;request_id:string;fingerprint:string}>();
  const jobs=await Promise.all(reports.map(async report=>{const job=imasJob(report),request=requests.results.find(r=>r.report_public_id===report.publicId);return {...job,approvalRequest:request&&job.ready&&request.fingerprint===await approvalFingerprint(report)?{requestId:request.request_id}:null};}));
  return Response.json({mode:"validation",saveAllowed:false,photoUploadAllowed:false,jobs}, {headers:{"Cache-Control":"no-store"}});
}
