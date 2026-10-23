import { planDate, saoPauloDate } from "./order-deadlines";

export function reportMonth(report: {
  workOrder?: { competence?: string } | null;
  executionStartedAt?: string;
  completedAt?: string;
  createdAt?: string;
}): string {
  const competence = report.workOrder?.competence || "";
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) return competence;
  // Execution inputs represent local São Paulo time, so preserve their date.
  for (const value of [report.executionStartedAt, report.completedAt]) {
    const date = planDate(value || "");
    if (date) return date.slice(0, 7);
  }
  // Legacy records without a plan or execution date remain accessible.
  const created = new Date(report.createdAt || "");
  return Number.isFinite(created.getTime()) ? saoPauloDate(created).slice(0, 7) : "";
}
