import type {ExportReport} from "./report-export";
export const FABRICIO_REVIEW_AFTER=Date.parse("2026-10-08T19:13:32Z");
// Liberado em 2026-10-09 pelo supervisor: as OS do Fabrício seguem o fluxo normal (sem trava de revisão prévia).
export const FABRICIO_HOLD_ACTIVE=false;
export function requiresSupervisorReview(report:ExportReport){return FABRICIO_HOLD_ACTIVE&&/fabricio|fabrício/i.test(report.collaborator)&&!report.supervisorReleased;}
