// Janela de execução do IMAS: o horário NUNCA bloqueia o envio; o app ajusta os valores.
// Regras: início e fim entre 08:30 e 16:00, duração mínima de 3 h, abertura nunca depois do início.
export const SCHEDULE = {startMin: 8 * 60 + 30, endMax: 16 * 60, minDuration: 180, defaultOpening: 8 * 60};
const FORMAT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;
const parse = (value: string) => {
  const m = FORMAT.exec(value || "");
  if (!m || Number(m[2]) > 23 || Number(m[3]) > 59) return null;
  const date = new Date(`${m[1]}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== m[1]) return null;
  return {date: m[1], min: Number(m[2]) * 60 + Number(m[3])};
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Retorna null apenas quando início/conclusão não são datas válidas (formato AAAA-MM-DDTHH:MM). */
export function normalizeSchedule(executionStartedAt: string, completedAt: string, openedAt = "") {
  const s = parse(executionStartedAt), e = parse(completedAt);
  if (!s || !e) return null;
  const startMin = clamp(s.min, SCHEDULE.startMin, SCHEDULE.endMax - SCHEDULE.minDuration);
  const endDate = s.date;
  const endMin = clamp(Math.max(e.min, startMin + SCHEDULE.minDuration), startMin + SCHEDULE.minDuration, SCHEDULE.endMax);
  const start = `${s.date}T${hhmm(startMin)}`;
  const o = parse(openedAt);
  const opening = o && `${o.date}T${hhmm(o.min)}` <= start ? openedAt : `${s.date}T${hhmm(SCHEDULE.defaultOpening)}`;
  return {executionStartedAt: start, completedAt: `${endDate}T${hhmm(endMin)}`, imasOpenedAt: opening};
}

/** Conclusão futura/inválida usa o dia do ENVIO do retorno; datas anteriores válidas permanecem. */
export function normalizeReportSchedule(startValue:string,endValue:string,openedValue="",submittedAt?:string|Date,now=new Date()){
 const supplied=new Date(submittedAt||now),receipt=Number.isFinite(supplied.getTime())?supplied:now;
 const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(receipt);
 const part=(name:string)=>parts.find(value=>value.type===name)?.value||"00";
 const receiptDay=`${part("year")}-${part("month")}-${part("day")}`,receiptTime=`${part("hour")}:${part("minute")}`,limit=`${receiptDay}T${receiptTime}`;
 const start=parse(startValue),end=parse(endValue);
 let started=start?startValue:`${receiptDay}T${receiptTime}`,completed=end?endValue:limit;
 const invalidOrFuture=!end||completed>limit;
 if(invalidOrFuture){
  completed=limit;
  if(!start||started>completed){
   const preferred=start?hhmm(start.min):receiptTime;
   started=`${receiptDay}T${preferred<=receiptTime?preferred:receiptTime}`;
  }
 }
 if(started>completed)started=completed;
 return normalizeSchedule(started,completed,openedValue);
}

/** Aviso não bloqueante: o dia de execução prevalece na normalização. */
export function scheduleWarning(start:string,end:string){
 const s=parse(start),e=parse(end);if(!s||!e)return "";
 return s.date!==e.date?`Início e conclusão devem ser no mesmo dia. Sugestão: concluir em ${s.date.split("-").reverse().join("/")}. Ao enviar ao IMAS, o app ajusta para esse dia, entre 08:30 e 16:00, com mínimo de 3 horas.`:"";
}
