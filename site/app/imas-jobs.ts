import {normalizePreventiveSchedule} from "./preventive-schedule";
import { IMAS_FIXED, IMAS_SYSTEMS, imasExecutor, isImasDate } from "./imas-config";
import {normalizeReportSchedule} from "./imas-schedule";
import {requiresSupervisorReview} from "./supervisor-holds";
import {needsPhotoApproval} from "./photo-policy";
import type { ExportReport } from "./report-export";
export function imasJob(original:ExportReport) {
  // Programa e execução são separados. Corrigir datas futuras/inválidas pelo recebimento,
  // inclusive em retornos antigos, sem trocar pelo dia da automação.
  const schedule=original.origin==="sistema"?normalizePreventiveSchedule(original.executionStartedAt,original.completedAt,original.workOrder?.plannedExecutionAt||original.workOrder?.dueAt||original.executionStartedAt,original.workOrder?.competence||"",original.imasOpenedAt||""):normalizeReportSchedule(original.executionStartedAt,original.completedAt,original.imasOpenedAt||"",original.createdAt);
  const report={...original,...(schedule||{})};
  const responsible=original.executorImasName===undefined?imasExecutor(report.collaborator):original.executorImasName;
  if(responsible)report.collaborator=responsible;
  const externalNumber=report.origin==="sistema"?report.osNumber:report.imasOsNumber || "";
  const phase=externalNumber?"encerrar":"criar";
  const errors:string[]=[];
  if(requiresSupervisorReview(report))errors.push("Revisão do supervisor: conferir OS do Fabrício antes de liberar");
  if(report.status==="Devolvida")errors.push("OS devolvida: aguardar correção e reenvio do colaborador");
  if(needsPhotoApproval(report))errors.push("Revisão de fotos: aguardar aprovação do supervisor");
  if(["323902","324279"].includes(externalNumber)||["4e9bd0d3-5e4f-4f25-8301-2942d04dc0d1","4d2fcf45-fbce-4c0c-9a02-688f1fe24000"].includes(report.publicId))errors.push("OS protegida: não executar novamente");
  if(!report.environment||!report.floor||report.environment===report.workOrder?.unit||/não informado|itens da ordem de servi/i.test(report.floor))errors.push("Corrigir ambiente/pavimento");
  if(!report.observations)errors.push("Informar o serviço realizado");
  if(!isImasDate(report.executionStartedAt)||!isImasDate(report.completedAt)||report.completedAt<report.executionStartedAt)errors.push("Conferir início e conclusão");
  if(!report.photos.length&&!(phase==="criar"&&report.status==="Aguardando criação"))errors.push("Anexar evidência fotográfica");
  if(report.status==="Aguardando execução")errors.push("Aguardar execução e envio do colaborador");
  if(report.origin==="app"&&!report.imasEquipmentCode)errors.push("FALTA EQUIPAMENTO — o colaborador deve escolher o equipamento no RCO (Abrir e encerrar OS)");
  if(externalNumber&&!/^\d+$/.test(externalNumber))errors.push("Número do IMAS inválido");
  if(!responsible)errors.push("Selecionar executor cadastrado no IMAS");
  if(phase==="criar") {
    if(!report.imasSubject)errors.push("Informar assunto");
    if(!(IMAS_SYSTEMS as readonly string[]).includes(report.imasSystem || ""))errors.push("Selecionar sistema");
    if(!isImasDate(report.imasOpenedAt || ""))errors.push("Informar abertura");
  }
  return {creationOnly:report.status==="Aguardando criação",publicId:report.publicId,reference:report.osNumber,externalNumber,phase,errors,ready:!errors.length,mode:"validation",saveAllowed:false,photoUploadAllowed:false,report,fixed:IMAS_FIXED,responsible};
}
