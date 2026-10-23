export type DeadlineStatus = "overdue" | "near" | "onTime" | "done" | "noDate";
export const deadlineLabels: Record<DeadlineStatus, string> = { overdue: "Fora de prazo", near: "Execução", onTime: "Dentro do prazo", done: "Concluída", noDate: "Sem programação" };
export function planDate(value: string): string | null {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/.exec(value.trim());
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/.exec(value.trim());
  const date = br ? `${br[3]}-${br[2]}-${br[1]}` : iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}
export function saoPauloDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function formatPlanDate(value: string): string {
  const date = planDate(value);
  return date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : "Não informada";
}
export function deadlineStatus(order: { plannedExecutionAt?: string; status: string }, today = saoPauloDate()): { key: DeadlineStatus; days: number | null } {
  if (/conclu[ií]da/i.test(order.status)) return { key: "done", days: null };
  const start = planDate(order.plannedExecutionAt || "");
  if (!start) return { key: "noDate", days: null };
  const days = Math.round((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return { key: days < -2 ? "overdue" : days <= 0 ? "near" : "onTime", days };
}
