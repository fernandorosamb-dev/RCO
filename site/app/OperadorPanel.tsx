"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import type {ExportReport} from "./report-export";
type Job={publicId:string;phase:string;ready:boolean;externalNumber:string;reference:string;errors:string[];approvalRequest?:{requestId?:string;state?:string}|null;report:ExportReport};
type Run={runId:string;publicId:string;version:string;state:string;step:string;updatedAt:number;events:{message?:string;status:string}[]};
// Regras aprendidas na operação (espelham agente/APRENDIZADOS.md).
const LESSONS=[
 "Toda OS corretiva precisa de Equipamento escolhido no RCO; o IMAS não conclui sem ele.",
 "Erro técnico do IMAS não derruba a aprovação: use Reabrir OS, não aprove de novo.",
 "Concluída no IMAS e sem baixa no RCO: use \"Já está OK no IMAS — encerrar no RCO\".",
 "Depois de recarregar a extensão, aperte F5 no RCO. Volte à lista de OS no IMAS antes de iniciar um lote.",
 "Fechamento manual no IMAS: conferir equipamento e fotos antes de concluir.",
];
// Para cada bloqueio, o que a pessoa precisa fazer (sempre um botão que já existe no RCO).
function action(error:string):string{
 if(/FALTA EQUIPAMENTO/i.test(error))return "Relatórios → Editar OS → escolher o equipamento.";
 if(/Erro do IMAS/i.test(error))return "Revisão da OS → Reabrir OS (ou Já está OK no IMAS, se já concluiu lá).";
 if(/Revisão de fotos/i.test(error))return "Revisão da OS → conferir as fotos e Aprovar.";
 if(/Revisão do supervisor/i.test(error))return "Revisão da OS → conferir e Aprovar.";
 if(/Aguardar execução/i.test(error))return "Aguardando o colaborador enviar execução e fotos.";
 if(/devolvida/i.test(error))return "Aguardando o colaborador corrigir e reenviar.";
 if(/protegida/i.test(error))return "OS protegida: só baixa (Já está OK no IMAS).";
 if(/fotográfica/i.test(error))return "Colaborador precisa anexar ao menos 1 foto.";
 if(/ambiente|pavimento/i.test(error))return "Editar OS → corrigir ambiente e pavimento.";
 if(/executor/i.test(error))return "Editar OS → escolher o executor do cadastro IMAS.";
 if(/aprovação executável|aprovação/i.test(error))return "Revisão da OS → Aprovar.";
 return "Conferir a OS em Relatórios.";
}
const label=(j:Job)=>`${j.externalNumber||j.reference} · ${j.report.area||"—"} · ${j.report.imasSubject||j.report.environment||""}`.slice(0,90);
export default function OperadorPanel(){
 const [jobs,setJobs]=useState<Job[]>([]),[runs,setRuns]=useState<Run[]>([]),[message,setMessage]=useState(""),[loading,setLoading]=useState(false),[showLessons,setShowLessons]=useState(false);
 const load=useCallback(async()=>{setLoading(true);try{const [q,d]=await Promise.all([fetch("/api/imas/queue",{cache:"no-store"}),fetch("/api/imas/diagnostics",{cache:"no-store"})]);if(!q.ok||!d.ok)throw Error("Não foi possível consultar a fila. Confira seu login de Supervisor.");setJobs((await q.json()).jobs||[]);setRuns((await d.json()).runs||[]);setMessage("");}catch(e){setMessage(e instanceof Error?e.message:"Falha ao atualizar.");}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();const refresh=()=>void load();window.addEventListener("rco-imas-updated",refresh);const t=window.setInterval(refresh,30000);return()=>{window.clearInterval(t);window.removeEventListener("rco-imas-updated",refresh);};},[load]);
 const g=useMemo(()=>{
  const free=(j:Job)=>j.approvalRequest?.state!=="processing";
  const toCreate=jobs.filter(j=>j.ready&&j.phase==="criar"&&free(j));
  const toClosePrev=jobs.filter(j=>j.ready&&j.phase==="encerrar"&&j.report.origin!=="app"&&free(j));
  const toCloseCorr=jobs.filter(j=>j.ready&&j.phase==="encerrar"&&j.report.origin==="app"&&free(j));
  const waiting=jobs.filter(j=>!j.ready&&j.errors.length&&j.errors.every(e=>/Aguardar execução|devolvida/i.test(e)));
  const blocked=jobs.filter(j=>!j.ready&&j.errors.length&&!waiting.includes(j));
  const running=jobs.filter(j=>j.approvalRequest?.state==="processing");
  return {toCreate,toClosePrev,toCloseCorr,waiting,blocked,running};
 },[jobs]);
 const failures=runs.filter(r=>r.state==="failed").slice(0,8);
 function confirmAndSend(title:string,rows:Job[],send:()=>void){
  if(!rows.length)return;
  const list=rows.slice(0,25).map(label).join("\n")+(rows.length>25?`\n… e mais ${rows.length-25}`:"");
  if(!window.confirm(`${title}\n\n${list}\n\nConfirma este lote? Só estas OS serão enviadas à extensão.`))return;
  send();
 }
 const createOne=()=>confirmAndSend("CRIAR no IMAS a próxima OS corretiva da lista:",g.toCreate.slice(0,1),()=>{document.dispatchEvent(new CustomEvent("rco-imas-create-save",{detail:{publicId:g.toCreate[0].publicId}}));setMessage("Criação enviada à extensão. Aguarde o número oficial voltar; o encerramento vem depois do colaborador.");});
 const closeRows=(title:string,rows:Job[])=>confirmAndSend(title,rows,()=>{document.dispatchEvent(new CustomEvent("rco-imas-batch",{detail:{publicIds:rows.map(j=>j.publicId)}}));setMessage("Lote enviado à extensão no computador. O início só é confirmado quando ela registrar o andamento.");});
 const card="rounded-xl border border-slate-600 bg-slate-950 p-4 text-slate-100";
 const count=(n:number,text:string)=><div className="rounded-lg border border-slate-600 p-3 text-center"><p className="text-2xl font-bold">{n}</p><p className="text-xs text-slate-300">{text}</p></div>;
 return <section className="mx-auto max-w-6xl px-4 py-6" aria-label="Operador IMAS">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><span className="eyebrow">Operador</span><h2 className="mt-2 text-2xl font-bold">Criar, auditar e encerrar OS</h2><p className="mt-1 text-sm">Confira a lista, confirme o lote e a extensão executa no IMAS. Nada é enviado sem a sua confirmação.</p></div><button type="button" className="report-button" disabled={loading} onClick={()=>void load()}>{loading?"Atualizando…":"Atualizar"}</button></div>
  {message&&<p role="status" className="mt-3 text-sm font-semibold">{message}</p>}
  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{count(g.toCreate.length,"para criar")}{count(g.toClosePrev.length+g.toCloseCorr.length,"para encerrar")}{count(g.running.length,"em andamento")}{count(g.waiting.length,"aguardando colaborador")}{count(g.blocked.length,"bloqueadas")}</div>
  <div className="mt-5 grid gap-4 lg:grid-cols-2">
   <div className={card}><h3 className="font-bold">1 · Criar corretivas ({g.toCreate.length})</h3><p className="mt-1 text-xs text-slate-300">Com equipamento, assunto, sistema e executor preenchidos.</p>
    <ul className="mt-3 space-y-1 text-sm">{g.toCreate.map(j=><li key={j.publicId}>{label(j)}</li>)}{!g.toCreate.length&&<li className="text-slate-400">Nenhuma pronta para criar.</li>}</ul>
    <button type="button" className="report-button mt-3" disabled={!g.toCreate.length} onClick={createOne}>Criar próxima no IMAS</button></div>
   <div className={card}><h3 className="font-bold">2 · Encerrar ({g.toClosePrev.length+g.toCloseCorr.length})</h3><p className="mt-1 text-xs text-slate-300">Aprovadas, com fotos e equipamento. Preventivas primeiro.</p>
    <p className="mt-3 text-sm font-semibold">Preventivas ({g.toClosePrev.length})</p><ul className="space-y-1 text-sm">{g.toClosePrev.map(j=><li key={j.publicId}>{label(j)}</li>)}{!g.toClosePrev.length&&<li className="text-slate-400">Nenhuma.</li>}</ul>
    <p className="mt-3 text-sm font-semibold">Corretivas e testes ({g.toCloseCorr.length})</p><ul className="space-y-1 text-sm">{g.toCloseCorr.map(j=><li key={j.publicId}>{label(j)}</li>)}{!g.toCloseCorr.length&&<li className="text-slate-400">Nenhuma.</li>}</ul>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="report-button" disabled={!g.toClosePrev.length} onClick={()=>closeRows("ENCERRAR preventivas no IMAS:",g.toClosePrev)}>Concluir preventivas</button><button type="button" className="report-button" disabled={!g.toCloseCorr.length} onClick={()=>closeRows("ENCERRAR corretivas no IMAS:",g.toCloseCorr)}>Concluir corretivas</button></div></div>
  </div>
  <div className={card+" mt-4"}><h3 className="font-bold">3 · Bloqueadas — o que fazer ({g.blocked.length})</h3>
   <ul className="mt-3 space-y-3 text-sm">{g.blocked.map(j=><li key={j.publicId} className="rounded border border-slate-700 p-3"><b>{label(j)}</b>{j.errors.slice(0,3).map(e=><p key={e} className="mt-1"><span className="text-orange-300">{e}</span><br/><span className="text-slate-300">→ {action(e)}</span></p>)}</li>)}{!g.blocked.length&&<li className="text-slate-400">Nenhuma OS bloqueada.</li>}</ul></div>
  {!!g.waiting.length&&<div className={card+" mt-4"}><h3 className="font-bold">Aguardando o colaborador ({g.waiting.length})</h3><ul className="mt-3 space-y-1 text-sm">{g.waiting.map(j=><li key={j.publicId}>{label(j)}</li>)}</ul></div>}
  <div className={card+" mt-4"}><h3 className="font-bold">Auditoria — falhas recentes</h3>
   <ul className="mt-3 space-y-2 text-sm">{failures.map(r=><li key={r.runId} className="rounded border border-slate-700 p-3"><b>OS {jobs.find(j=>j.publicId===r.publicId)?.externalNumber||r.publicId.slice(0,8)}</b> · {new Date(r.updatedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}<p>{r.step}</p><p className="text-slate-300">{[...r.events].reverse().find(e=>e.status==="failed"&&e.message)?.message}</p></li>)}{!failures.length&&<li className="text-slate-400">Nenhuma falha registrada.</li>}</ul></div>
  <div className={card+" mt-4"}><button type="button" className="font-bold" aria-expanded={showLessons} onClick={()=>setShowLessons(!showLessons)}>Regras aprendidas {showLessons?"▲":"▼"}</button>{showLessons&&<ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{LESSONS.map(l=><li key={l}>{l}</li>)}</ul>}</div>
 </section>;
}
