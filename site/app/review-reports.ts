import {requiresSupervisorReview} from "./supervisor-holds";
import {needsPhotoApproval} from "./photo-policy";
import type {ExportReport} from "./report-export";
export function reviewReports(reports:ExportReport[],runs:{report_public_id:string;state:string;step:string}[]){
 return reports.flatMap(report=>{
  const diagnostic=runs.find(run=>run.report_public_id===report.publicId&&["failed","review"].includes(run.state));
  const photos=needsPhotoApproval(report);
  // OS já aprovada pelo supervisor (na fila ou em processamento) sai da revisão: falha antiga não a mantém na lista.
  if(["queued","processing"].includes(report.automationState||"")&&!photos&&!requiresSupervisorReview(report)&&report.status!=="Devolvida")return [];
  return requiresSupervisorReview(report)||report.status==="Devolvida"||photos||diagnostic||["failed","review"].includes(report.automationState||"")?[{report,photos,imas:!!diagnostic||report.automationState==="failed",step:diagnostic?.step||""}]:[];
 });
}
