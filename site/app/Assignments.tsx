"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, FileUp, Loader2, MapPin, RefreshCw, Search } from "lucide-react";
import {useRoleRoster} from "./useRoleRoster";
import RoleResponsibles from "./RoleResponsibles";
import { saoPauloDate, formatPlanDate } from "./order-deadlines";

export type WorkOrder = {
  publicId: string; importPublicId: string | null; competence: string; osNumber: string; client: string; unit: string;
  environment: string; floor: string; openedAt: string; dueAt: string; originalStatus: string; description: string;
  originalPlannedExecutionAt?:string; scheduleRevision?:number; rescheduled?:{reason:string;changedByRole:string;updatedAt:number}; plannedExecutionAt?: string; executionStartedAt?: string; completedAt?: string; equipment: string; assignedArea: string; assignedResponsible: string; status: string;
};

const areaOptions = [["eletrica", "Elétrica"], ["hidraulica", "Hidráulica"], ["refrigeracao", "Refrigeração"], ["civil", "Civil"]] as const;
type ImportResult = { imported: number; created: number; updated: number; duplicateCount: number; distributed: Record<string,number>; pending: { osNumber: string; reason: string }[]; excluded: { osNumber: string; unit: string }[] };

export default function Assignments({readOnly=false}:{readOnly?:boolean}) {
  const {names}=useRoleRoster();
  const [orders, setOrders] = useState<WorkOrder[]>([]); const [result, setResult] = useState<ImportResult|null>(null);
  const [file, setFile] = useState<File | null>(null); const [competence, setCompetence] = useState(() => saoPauloDate().slice(0, 7));
  const [query, setQuery] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const fileInput=useRef<HTMLInputElement>(null);
  const [locationFixPending, setLocationFixPending] = useState(0);
  async function load(signal?: AbortSignal) {
    const response = await fetch(`/api/work-orders?competence=${encodeURIComponent(competence)}`, { cache: "no-store", signal });
    if (response.ok && !signal?.aborted) setOrders((await response.json()).workOrders);
    if(readOnly)return;
    const fixResponse = await fetch("/api/reports/fix-legacy-locations", { cache: "no-store", signal });
    if (fixResponse.ok && !signal?.aborted) setLocationFixPending(Number((await fixResponse.json()).pending || 0));
  }
  useEffect(()=>{const refresh=()=>void load();window.addEventListener("rco-roster-updated",refresh);return()=>window.removeEventListener("rco-roster-updated",refresh);},[competence,readOnly]);
  useEffect(() => { const controller=new AbortController(); void load(controller.signal).catch(()=>{}); return()=>controller.abort(); }, [competence]);

  async function importOrders() {
    if (!file || busy) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) { setMessage("Selecione o mês das OS."); return; }
    if (file.size > 30_000_000) { setMessage("O PDF deve ter até 30 MB."); return; }
    setBusy(true); setResult(null); setMessage("Lendo o PDF...");
    let document: { destroy: () => Promise<void> } | undefined;
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      document = pdf;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        setMessage(`Lendo página ${pageNumber} de ${pdf.numPages}...`);
        const content = await (await pdf.getPage(pageNumber)).getTextContent();
        let pageText = "", lastY: number | null = null;
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const y = item.transform?.[5] ?? null;
          pageText += lastY !== null && y !== null && Math.abs(y - lastY) > 3 ? `\n${item.str}` : `${pageText.endsWith("\n") || !pageText ? "" : " "}${item.str}`;
          if (item.hasEOL) pageText += "\n";
          lastY = y;
        }
        pages.push(pageText);
      }
      const text = pages.join("\n");
      if (!text.trim()) throw new Error("O PDF contém apenas imagens. Exporte no IMAS um PDF com texto selecionável.");
      setMessage("Identificando os cargos e distribuindo as OS...");
      const body = new FormData(); body.append("competence", competence); body.append("pdf", file); body.append("text", text);
      const response = await fetch("/api/work-orders", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível importar.");
      setResult(payload); setFile(null); if(fileInput.current)fileInput.current.value=""; setMessage(`${payload.imported} OS recebidas. ${payload.pending.length ? `${payload.pending.length} precisam de revisão; as demais já estão disponíveis por cargo.` : "Distribuição concluída. As OS já estão disponíveis para os usuários."}`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na importação. O arquivo permanece selecionado para tentar novamente."); }
    finally { if(document) await document.destroy().catch(()=>{}); setBusy(false); }
  }
  async function assign(order: WorkOrder, assignedArea: string, assignedResponsible: string) {
    setMessage("Salvando atribuição...");
    const response = await fetch("/api/work-orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicId: order.publicId, assignedArea, assignedResponsible }) });
    const payload = await response.json(); setMessage(response.ok ? `OS ${order.osNumber} atribuída.` : payload.error || "Falha ao atribuir."); if (response.ok) { setResult(current=>current && current.pending.some(item=>item.osNumber===order.osNumber)?{...current,pending:current.pending.filter(item=>item.osNumber!==order.osNumber),distributed:{...current.distributed,[assignedArea]:(current.distributed[assignedArea]||0)+1}}:current); await load(); }
  }
  async function fixImportedLocations() {
    setBusy(true); setMessage("Atualizando os locais pelo campo Equipamentos...");
    try {
      const response = await fetch("/api/reports/fix-legacy-locations", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar os locais.");
      setMessage(`${payload.correctedWorkOrders} OS atualizada(s). Locais conferidos pelo campo Equipamentos.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar os locais."); }
    finally { setBusy(false); }
  }
  const visible = useMemo(() => orders.filter((order) => !query || [order.osNumber, order.assignedResponsible, order.description].some((value) => value.toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>a.osNumber.localeCompare(b.osNumber,"pt-BR",{numeric:true})), [orders, query]);

  return <section className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
    {!readOnly&&<RoleResponsibles/>}<div className="mb-5"><span className="eyebrow">{readOnly?"Somente leitura":"Supervisor"}</span><h2 className="mt-2 text-2xl font-bold">{readOnly?"Distribuição das OS":"Importar e distribuir OS"}</h2>{!readOnly&&<p className="mt-1 text-slate-600">Selecione o mês e envie o PDF completo. O aplicativo lê, separa por cargo e disponibiliza as OS automaticamente.</p>}</div>
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]"><label className="field"><span>Competência</span><input disabled={busy} type="month" value={competence} onChange={(e)=>{setCompetence(e.target.value);setResult(null);setMessage("")}}/></label>{!readOnly&&<label className="field"><span>PDF completo das OS</span><input ref={fileInput} disabled={busy} type="file" accept="application/pdf" onChange={event=>{setFile(event.target.files?.[0]||null);setResult(null);setMessage("")}}/></label>}</div>
      {!readOnly&&locationFixPending > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3"><p className="text-sm font-bold text-amber-950">{locationFixPending} OS com local pendente ou incorreto.</p><button disabled={busy} className="report-button" onClick={fixImportedLocations}><MapPin size={18}/>Corrigir locais pelo equipamento</button></div>}
      {busy && <p className="mt-4 flex items-center gap-2 font-bold text-blue-900"><Loader2 className="animate-spin" size={18}/>Processando...</p>}{message && <p role="status" className="mt-4 text-sm font-bold text-blue-900">{message}</p>}
      {!readOnly&&<button type="button" disabled={busy||!file} className="report-button mt-4 disabled:opacity-50" onClick={()=>void importOrders()}><FileUp size={18}/>{busy ? "Processando..." : "Enviar e distribuir OS"}</button>}
      {result && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="font-bold">Resultado do envio · {competence.slice(5)}/{competence.slice(0,4)}</h3><p className="mt-2 text-sm">{result.created} novas · {result.updated} já existentes · {result.duplicateCount} repetições no arquivo removidas.</p><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{areaOptions.map(([area,label])=><p className="rounded-lg bg-white p-3 text-sm" key={area}><b>{label}</b><span className="block text-2xl font-bold">{result.distributed[area] || 0}</span></p>)}</div>{result.pending.length>0&&<div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><b>Revisar {result.pending.length} OS</b>{result.pending.map(order=><p className="mt-2" key={order.osNumber}>OS {order.osNumber}: {order.reason}</p>)}<p className="mt-2">Escolha a área e salve na lista abaixo para disponibilizar essas OS.</p></div>}{result.excluded.length>0&&<div className="mt-3 text-sm"><b>{result.excluded.length} OS de outras unidades não foram importadas.</b>{result.excluded.map(order=><p key={order.osNumber}>OS {order.osNumber} · {order.unit}</p>)}</div>}<p className="mt-3 text-sm">OS concluídas e atribuições já corrigidas foram preservadas.</p></div>}

    </div>
    <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-black">OS cadastradas</h3><p className="text-sm text-slate-500">Da menor para a maior.</p></div><label className="search"><Search size={18}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar número ou responsável"/></label></div>
    <div className="mt-4 space-y-3">{visible.length===0?<div className="empty"><RefreshCw/><p>Nenhuma OS importada.</p></div>:visible.map((order)=><AssignmentRow key={order.publicId} order={order} onSave={assign} readOnly={readOnly} responsibleByArea={names}/>)}</div>
  </section>;
}

function AssignmentRow({order,onSave,readOnly=false,responsibleByArea}:{responsibleByArea:Record<string,string>;order:WorkOrder;onSave:(order:WorkOrder,area:string,responsible:string)=>void;readOnly?:boolean}) {
  const [area,setArea]=useState(order.assignedArea); const [responsible,setResponsible]=useState(order.assignedResponsible);
  useEffect(()=>{setArea(order.assignedArea);setResponsible(order.assignedResponsible)},[order]);
  return <article className="assignment-card"><div><div className="flex flex-wrap items-center gap-2"><b>OS {order.osNumber}</b><span className={`order-status ${order.status === "Concluída" ? "done" : ""}`}>{order.status}</span>{order.importPublicId&&<a className="inline-flex items-center gap-1 text-xs font-bold text-blue-800" href={`/api/os-imports/${order.importPublicId}`}><ExternalLink size={13}/>PDF original</a>}</div><p>{order.description || order.equipment || "Dados completos disponíveis no PDF"}</p>{!order.assignedArea&&<p className="font-bold text-amber-900">Cargo não identificado — escolha a área para disponibilizar.</p>}<small>{order.environment} · {order.floor}</small><p className="font-semibold text-blue-950">Execução programada: {formatPlanDate(order.plannedExecutionAt || "")}</p></div>{readOnly?<div><p>{areaOptions.find(([value])=>value===order.assignedArea)?.[1]||"Sem área"}</p><p>{order.assignedResponsible||"Responsável não atribuído"}</p></div>:<><select value={area} onChange={(e)=>{setArea(e.target.value);setResponsible(responsibleByArea[e.target.value]||"")}}><option value="">Escolher área</option>{areaOptions.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><input readOnly aria-label={`Responsável do cargo da OS ${order.osNumber}`} value={responsibleByArea[area]||responsible} placeholder="Cadastre o responsável acima"/><button disabled={!area||order.status==="Concluída"} onClick={()=>onSave(order,area,responsibleByArea[area]||responsible)} className="icon-save" aria-label={`Salvar atribuição da OS ${order.osNumber}`}><Check/></button></>}</article>;
}
