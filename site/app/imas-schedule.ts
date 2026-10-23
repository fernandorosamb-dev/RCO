// Janela de execução do IMAS: o horário NUNCA bloqueia o envio; o app ajusta os valores.
// Regras: início e fim entre 08:30 e 16:00, duração mínima de 3 h, abertura nunca depois do início.
export const SCHEDULE = {startMin: 8 * 60 + 30, endMax: 16 * 60, minDuration: 180, defaultOpening: 8 * 60};
const FORMAT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
const parse = (value: string) => { const m = FORMAT.exec(value || ""); return m && Number.isFinite(Date.parse(value)) ? {date: m[1], min: Number(m[2]) * 60 + Number(m[3])} : null; };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Retorna null apenas quando início/conclusão não são datas válidas (formato AAAA-MM-DDTHH:MM). */
export function normalizeSchedule(executionStartedAt: string, completedAt: string, openedAt = "") {
  const s = parse(executionStartedAt), e = parse(completedAt);
  if (!s || !e) return null;
  const startMin = clamp(s.min, SCHEDULE.startMin, SCHEDULE.endMax - SCHEDULE.minDuration);
  let endDate = e.date, endMin: number;
  if (e.date > s.date) endMin = clamp(e.min, SCHEDULE.startMin, SCHEDULE.endMax);
  else { endDate = s.date; endMin = clamp(Math.max(e.min, startMin + SCHEDULE.minDuration), startMin + SCHEDULE.minDuration, SCHEDULE.endMax); }
  const start = `${s.date}T${hhmm(startMin)}`;
  const o = parse(openedAt);
  const opening = o && `${o.date}T${hhmm(o.min)}` <= start ? openedAt : `${s.date}T${hhmm(SCHEDULE.defaultOpening)}`;
  return {executionStartedAt: start, completedAt: `${endDate}T${hhmm(endMin)}`, imasOpenedAt: opening};
}
