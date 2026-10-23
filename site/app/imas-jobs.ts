import { IMAS_FIXED, IMAS_SYSTEMS, imasExecutor, isImasDate } from "./imas-config";
import {normalizeSchedule} from "./imas-schedule";
import {requiresSupervisorReview} from "./supervisor-holds";
import {needsPhotoApproval} from "./photo-policy";
import type { ExportReport } from "./report-export";
export function imasJob(original:ExportReport) {
  // Horário não é impeditivo: valores fora da janela 08:30–16:00 / 3 h / abertura ≤ início são ajustados aqui,
  // inclusive para OS antigas já gravadas (sem alterar o banco).
  const schedule=isImasDate(original.executionStartedAt)&&isImasDate(original.completedAt)?normalizeSchedule(original.executionStartedAt,original.completedAt,original.imasOpenedAt||""):null;
  const report=schedule?{...original,executionStartedAt:schedule.executionStartedAt,completedAt:schedule.completedAt,imasOpenedAt:schedule.imasOpenedAt}:original;
  const externalNumber=report.origin==="sistema"?report.osNumber:report.imasOsNumber || "";
  const phase=externalNumber?"encerrar":"criar";
  const errors:string[]=[];
  if(requiresSupervisorReview(report))errors.push("Revisão do supervisor: conferir OS do Fabrício antes de liberar");
  if(report.status==="Devolvida")errors.push("OS devolvida: aguardar correção e reenvio do colaborador");
  if(needsPhotoApproval(report))errors.push("Revisão de fotos: aguardar aprovação do supervisor");
  if(externalNumber==="323902"||report.publicId==="4e9bd0d3-5e4f-4f25-8301-2942d04dc0d1")errors.push("OS protegida: não executar novamente");
  if(!report.environment||!report.floor||report.environment===report.workOrder?.unit||/não informado|itens da ordem de servi/i.test(report.floor))errors.push("Corrigir ambiente/pavimento");
  if(!report.observations)errors.push("Informar o serviço realizado");
  if(!isImasDate(report.executionStartedAt)||!isImasDate(report.completedAt)||report.completedAt<report.executionStartedAt)errors.push("Conferir início e conclusão");
  if(!report.photos.length)errors.push("Anexar evidência fotográfica");
  if(externalNumber&&!/^\d+$/.test(externalNumber))errors.push("Número do IMAS inválido");
  if(!imasExecutor(report.collaborator))errors.push("Selecionar executor cadastrado no IMAS");
  if(phase==="criar") {
    if(!report.imasSubject)errors.push("Informar assunto");
    if(!(IMAS_SYSTEMS as readonly string[]).includes(report.imasSystem || ""))errors.push("Selecionar sistema");
    if(!isImasDate(report.imasOpenedAt || ""))errors.push("Informar abertura");
  }
  return {publicId:report.publicId,reference:report.osNumber,externalNumber,phase,errors,ready:!errors.length,mode:"validation",saveAllowed:false,photoUploadAllowed:false,report,fixed:IMAS_FIXED,responsible:imasExecutor(report.collaborator)};
}
