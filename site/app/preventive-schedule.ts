const datePart=(value:string)=>{
 const raw=String(value||""),iso=/^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(raw),br=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
 const day=iso?.[1]||(br?`${br[3]}-${br[2]}-${br[1]}`:"");if(!day)return "";
 const d=new Date(day+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day?day:"";
};
export function preventiveDefaults(planned:string,competence=""){
 const day=datePart(planned);if(!day)return null;
 const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)?competence:day.slice(0,7),ceiling=month+"-20";
 const start=day>ceiling?ceiling:day;
 const d=new Date(start+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+2);
 const end=d.toISOString().slice(0,10)>ceiling?ceiling:d.toISOString().slice(0,10);
 return {executionStartedAt:start+"T09:00",completedAt:end+"T16:00",imasOpenedAt:start+"T08:00"};
}
export function normalizePreventiveSchedule(startValue:string,endValue:string,planned:string,competence="",opened=""){
 const base=preventiveDefaults(planned,competence)||preventiveDefaults(startValue,competence);if(!base)return null;
 const limit=base.executionStartedAt.slice(0,7)+"-20";
 let start=datePart(startValue)||base.executionStartedAt.slice(0,10);if(start>limit)start=limit;
 const span=preventiveDefaults(start,start.slice(0,7))!;
 let end=datePart(endValue)||span.completedAt.slice(0,10);
 if(end>limit)end=limit;if(end<start)end=start;
 // Prazo + dois dias é o padrão; uma conclusão anterior informada permanece válida.
 const maxEnd=span.completedAt.slice(0,10);if(end>maxEnd)end=maxEnd;
 const time=(value:string,fallback:string)=>{const m=/T(\d{2}):(\d{2})$/.exec(value);if(!m||+m[1]>23||+m[2]>59)return fallback;const minutes=+m[1]*60+(+m[2]);const bounded=Math.max(540,Math.min(960,minutes));return String(Math.floor(bounded/60)).padStart(2,"0")+":"+String(bounded%60).padStart(2,"0");};
 let a=time(startValue,"09:00"),b=time(endValue,"16:00");if(start===end&&b<a)b="16:00";
 const executionStartedAt=start+"T"+a,completedAt=end+"T"+b;
 return {executionStartedAt,completedAt,imasOpenedAt:datePart(opened)&&opened<=executionStartedAt?opened:start+"T08:00"};
}
