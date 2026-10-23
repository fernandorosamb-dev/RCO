import {requiresSupervisorReview} from "./supervisor-holds";
import {needsPhotoApproval} from "./photo-policy";
import type {ExportReport} from "./report-export";
export function isReviewReport(report:ExportReport,diagnostic=false){
 if(report.downloadedAt||["Aguardando criação","Aguardando execução"].includes(report.status))return false;
 if(report.supervisorReleased&&report.status!=="Devolvida")return false;
 const photos=needsPhotoApproval(report),held=requiresSupervisorReview(report);
 // A solicitação durável prevalece sobre alertas e fotos de uma consulta anterior.
 if(["queued","processing","completed"].includes(report.automationState||"")&&report.status!=="Devolvida")return false;
 return held||report.status==="Devolvida"||photos||diagnostic||["failed","review"].includes(report.automationState||"");
}
export function reviewReports(reports:ExportReport[],runs:{report_public_id:string;state:string;step:string}[]){
 return reports.flatMap(report=>{
  const diagnostic=runs.find(run=>run.report_public_id===report.publicId&&["failed","review"].includes(run.state));
  return isReviewReport(report,!!diagnostic)?[{report,photos:needsPhotoApproval(report),imas:!!diagnostic||report.automationState==="failed",step:diagnostic?.step||""}]:[];
 });
}
