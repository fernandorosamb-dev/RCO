import {requireRole} from "../../../auth";
import {GET as reportsGet} from "../route";
import {GET as diagnosticsGet} from "../../imas/diagnostics/route";
import type {ExportReport} from "../../../report-export";
import {readAutomationFeedback} from "../../../automation-feedback-server";
import {reviewReports} from "../../../review-reports";
export async function GET(request:Request){
 if(!await requireRole(["supervisor","engenheiro"]))return Response.json({error:"Somente supervisor."},{status:403});
 try{
  const [reports,diagnostics]=await Promise.all([reportsGet(),diagnosticsGet(new Request(new URL("/api/imas/diagnostics?review=1",request.url)))]);
  if(!reports.ok||!diagnostics.ok)return Response.json({error:"Não foi possível carregar a revisão."},{status:503});
  const [data,runs]=await Promise.all([reports.json(),diagnostics.json()]);
  const statuses=await readAutomationFeedback();
  return Response.json({reviews:reviewReports(data.reports.map((report:ExportReport)=>({...report,automationState:statuses[report.publicId]?.state||report.automationState,automationFeedback:statuses[report.publicId]})),runs.reviews)},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Não foi possível carregar a revisão."},{status:500});}
}
