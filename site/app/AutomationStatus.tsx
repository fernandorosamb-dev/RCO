import type {AutomationFeedback} from "./automation-feedback";
export default function AutomationStatus({feedback}:{feedback?:AutomationFeedback}){
 if(!feedback)return null;
 return <div className="mt-3 rounded-xl border border-slate-600 bg-slate-900 p-3 text-sm text-slate-100" role="status"><p className="font-bold text-orange-300">{feedback.title}</p><p className="mt-2"><b>Motivo / andamento:</b> {feedback.reason}</p><p className="mt-2"><b>O que fazer:</b> {feedback.action}</p>{feedback.step&&<p className="mt-2 text-xs text-slate-300">Etapa: {feedback.step}</p>}{feedback.updatedAt&&<p className="mt-1 text-xs text-slate-300">Última informação: {new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}).format(new Date(feedback.updatedAt))}</p>}</div>;
}
