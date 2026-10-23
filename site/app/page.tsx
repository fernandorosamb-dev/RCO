"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, FileText, Gauge, LayoutDashboard, Loader2, LogOut, Search, UsersRound } from "lucide-react";
import { isOverviewRole, type Role } from "./access";
import Documents from "./Documents";
import Readings from "./Readings";
import Login from "./Login";
import Assignments from "./Assignments";
import WorkOrderReturn from "./WorkOrderReturn";
import PasswordDialog from "./PasswordDialog";
import NewLocalOrder from "./NewLocalOrder";
import Dashboard from "./Dashboard";
import {requiresSupervisorReview} from "./supervisor-holds";
import ReportEditor from "./ReportEditor";
import ImasPanel from "./ImasPanel";
import ProposalsPanel from "./ProposalsPanel";
import BatchRelay from "./BatchRelay";
import AutomacaoPanel from "./AutomacaoPanel";
import PhotoApproval from "./PhotoApproval";
import ReviewPhotos from "./ReviewPhotos";
import {needsPhotoApproval} from "./photo-policy";
import { saoPauloDate } from "./order-deadlines";
import { reportMonth } from "./report-month";

type Photo = { publicId: string; fileName: string; url: string };
type ReportWorkOrder = { competence: string; client: string; unit: string; description: string; equipment: string; originalStatus: string; openedAt: string; dueAt: string };
type Report = import("./imas-config").ImasFields & { returnReason?:string; supervisorReleased?:boolean; automationState?:string; photoApprovalStatus?:string; photoApprovedAt?:string|null; origin: string; activityType: string; description: string; equipment: string; area: string; createdByRole: string; downloadedAt: string | null; publicId: string; osNumber: string; collaborator: string; executionStartedAt: string; completedAt: string; environment: string; floor: string; observations: string; status: string; createdAt: string; photos: Photo[]; workOrder: ReportWorkOrder | null };
const monthLabel = (month: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
const areaLabel = (area:string) => ({eletrica:"Elétrica",hidraulica:"Hidráulica",refrigeracao:"Refrigeração",civil:"Civil"}[area] || area);

export default function Home() {
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [view, setView] = useState<"dashboard" | "send" | "readings" | "reports" | "assignments" | "new" | "documents">("send");
  const [reviewOnly,setReviewOnly]=useState(false);
  const [reviewIds,setReviewIds]=useState<string[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [query, setQuery] = useState("");
  const [collaboratorFilter,setCollaboratorFilter]=useState("");
  const [sentMonth, setSentMonth] = useState(() => saoPauloDate().slice(0, 7));
  const [markingDownloaded, setMarkingDownloaded] = useState<string | null>(null);
  const [pendingLegacy, setPendingLegacy] = useState(0);
  const [batchBusy,setBatchBusy]=useState(false);
  const [batchMessage,setBatchMessage]=useState("");
  const [fixingLegacy, setFixingLegacy] = useState(false);

  async function loadReports() { const reviews=await fetch("/api/imas/diagnostics?review=1",{cache:"no-store"});if(reviews.ok)setReviewIds((await reviews.json()).reviews.map((r:{report_public_id:string})=>r.report_public_id)); const response = await fetch("/api/reports", { cache: "no-store" }); if (response.ok) setReports((await response.json()).reports); }
  async function markDownloaded(report: Report) {
    if(report.origin==="app"&&!/^[1-9]\d*$/.test(report.imasOsNumber||"")){window.alert("Aguarde a criação no IMAS e o retorno do número oficial antes de marcar como baixada.");return;}
    if (!window.confirm(`Confirmar que a OS ${report.imasOsNumber||report.osNumber} já foi baixada no portal da empresa? Ela sairá desta lista.`)) return;
    setMarkingDownloaded(report.publicId);
    try {
      const response=await fetch("/api/reports/downloaded",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicId:report.publicId})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Não foi possível marcar a OS como baixada.");
      setReports(current=>current.filter(item=>item.publicId!==report.publicId));
    } catch(error) { window.alert(error instanceof Error?error.message:"Não foi possível marcar a OS como baixada."); }
    finally { setMarkingDownloaded(null); }
  }
  async function requestBatch() {
    if(!sentMonth)return;
    if(!window.confirm(`Executar todas as OS de ${monthLabel(sentMonth)}? O comando roda no computador do supervisor.`))return;
    setBatchBusy(true);setBatchMessage("");
    try{const response=await fetch("/api/imas/batch-request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({month:sentMonth})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Não foi possível enviar.");setBatchMessage("Enviado.");}
    catch(error){setBatchMessage(error instanceof Error?error.message:"Não foi possível enviar.");}
    finally{setBatchBusy(false);}
  }
  async function loadPendingLegacy() {
    const response=await fetch("/api/reports/fix-legacy-locations",{cache:"no-store"});
    if(response.ok)setPendingLegacy(Number((await response.json()).pending||0));
  }
  async function fixLegacyLocations() {
    if(!window.confirm(`Corrigir Ambiente e Pavimento das ${pendingLegacy} OS identificadas com segurança no arquivo original?`))return;
    setFixingLegacy(true);
    try{
      const response=await fetch("/api/reports/fix-legacy-locations",{method:"POST"});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"Não foi possível corrigir as OS antigas.");
      await Promise.all([loadPendingLegacy(),loadReports()]);
      window.alert(`${result.correctedReports} OS corrigidas. As demais continuam disponíveis para revisão manual.`);
    }catch(error){window.alert(error instanceof Error?error.message:"Não foi possível corrigir as OS antigas.");}
    finally{setFixingLegacy(false);}
  }
  useEffect(() => { fetch("/api/auth/me").then(async r=>{const currentRole=r.ok?(await r.json()).role:null;setRole(currentRole);setView(isOverviewRole(currentRole)?"dashboard":"send");}); }, []);
  useEffect(() => { if (view === "reports" && role) { void loadReports(); if(role==="supervisor")void loadPendingLegacy(); } }, [view, role]);
  useEffect(()=>{const refresh=()=>void loadReports();window.addEventListener("rco-imas-updated",refresh);return ()=>window.removeEventListener("rco-imas-updated",refresh);},[]);
  const sentMonths = useMemo(() => [...new Set([saoPauloDate().slice(0, 7), ...reports.map(report => reportMonth(report)).filter(Boolean)])].sort().reverse(), [reports]);
  const collaboratorNames=useMemo(()=>[...new Set(reports.map(r=>r.collaborator.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR")),[reports]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter(report => (!reviewOnly||requiresSupervisorReview(report)||report.status==="Devolvida"||report.automationState==="review"||reviewIds.includes(report.publicId)||needsPhotoApproval(report)) && (!collaboratorFilter||report.collaborator.trim()===collaboratorFilter) && (!sentMonth || reportMonth(report) === sentMonth) && (!q || [report.osNumber, report.imasOsNumber||"", report.environment, report.floor, report.collaborator].some(value => value.toLowerCase().includes(q)))).sort((a,b)=>a.osNumber.localeCompare(b.osNumber,"pt-BR",{numeric:true}));
  }, [reports, query, sentMonth,collaboratorFilter,reviewOnly,reviewIds]);

  if(role===undefined)return <main className="grid min-h-screen place-items-center bg-slate-100"><Loader2 className="animate-spin text-blue-900"/></main>;
  if(role===null)return <Login onSuccess={(newRole)=>{setRole(newRole);setView(isOverviewRole(newRole)?"dashboard":"send");}}/>;
  function openOrder(osNumber:string){setReviewOnly(false);setCollaboratorFilter("");setSentMonth("");setQuery(osNumber);setView("reports");}
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});setRole(null);setView("send");}
  return <main className="rco-app min-h-screen">
    {role==="supervisor"&&<BatchRelay/>}
    <header className="rco-header sticky top-0 z-20"><div className="mx-auto max-w-6xl px-4 py-3">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rco-brand-logo rco-logo"><img src="/rco-logo.png" alt="RCO Engenharia"/><img src="/rco-logo.png" alt="" aria-hidden="true"/></span><div className="rco-heading"><h1>Manutenção Predial<span className="rco-heading-subtitle">Preventivo e Corretivo</span></h1><p>Depósito BB · Sorocaba · SP</p>{role==="engenheiro"&&<span className="text-xs text-slate-500">Engenheiro</span>}</div></div><button className="nav-button logout-button shrink-0" onClick={logout} aria-label="Sair do login"><LogOut size={18}/> Sair</button></div>
      <nav className="rco-navigation">
        <button className={`nav-button ${view==="dashboard"?"active":""}`} onClick={()=>setView("dashboard")}><LayoutDashboard size={17}/> Acompanhamento</button>
        {!isOverviewRole(role)&&<button className={`nav-button ${view==="send"?"active":""}`} onClick={()=>setView("send")}><ClipboardList size={17}/> OS</button>}
        {isOverviewRole(role)&&<button className={`nav-button ${view==="assignments"?"active":""}`} onClick={()=>setView("assignments")}><UsersRound size={17}/> {role==="engenheiro"?"Distribuição":"Distribuir"}</button>}
        {role!=="engenheiro"&&<button className={`nav-button ${view==="new"?"active":""}`} onClick={()=>setView("new")}><ClipboardList size={17}/> Nova OS</button>}
        <button className={`nav-button ${view==="readings"?"active":""}`} onClick={()=>setView("readings")}><Gauge size={17}/> {isOverviewRole(role)?"Planilha":"Coleta"}</button>
        <button className={`nav-button ${view==="reports"?"active":""}`} onClick={()=>setView("reports")}><FileText size={17}/> {isOverviewRole(role)?"Relatórios":"Enviadas"}</button>
        <button className={`nav-button ${view==="documents"?"active":""}`} onClick={()=>setView("documents")}><FileText size={17}/> Documentos</button>{role!=="engenheiro"&&<PasswordDialog role={role}/>}
      </nav>
    </div></header>
    {role==="supervisor"&&view==="dashboard"&&<div className="mx-auto max-w-6xl px-4"><AutomacaoPanel/></div>}
    {view === "documents" ? <Documents role={role}/> : view === "dashboard" ? <Dashboard supervisor={isOverviewRole(role)} readOnly={role==="engenheiro"} onOpenOrder={openOrder}/> : view === "new" && role!=="engenheiro" ? <NewLocalOrder role={role}/> : view === "readings" ? <Readings role={role}/> : view === "assignments" ? <Assignments readOnly={role==="engenheiro"}/> : view === "send" && role!=="engenheiro" ? <WorkOrderReturn/> : <section className="mx-auto max-w-6xl px-4 py-6 sm:py-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><span className="eyebrow">Painel de consulta</span><h2 className="mt-2 text-2xl font-bold">Ordens recebidas</h2><p className="mt-1 text-sm text-slate-500">Filtradas pela competência da OS. Para OS criadas no app, usamos o mês da execução.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end"><label className="field w-full"><span>Mês da OS</span><select value={sentMonth} onChange={event=>setSentMonth(event.target.value)}><option value="">Todos os meses</option>{sentMonths.map(month=><option key={month} value={month}>{monthLabel(month)}</option>)}</select></label><label className="field w-full"><span>Colaborador</span><select value={collaboratorFilter} onChange={event=>setCollaboratorFilter(event.target.value)}><option value="">Todos os colaboradores</option>{collaboratorNames.map(name=><option key={name} value={name}>{name}</option>)}</select></label><label className="search"><Search size={18}/><input aria-label="Buscar ordens" placeholder="Buscar OS, ambiente ou colaborador" value={query} onChange={(e)=>setQuery(e.target.value)}/></label></div></div>
        {role==="supervisor"&&<ProposalsPanel onChanged={loadReports}/>}
        <p role="status" className="mt-4 text-sm font-semibold text-slate-600">{filtered.length} OS · {sentMonth ? monthLabel(sentMonth) : "Todos os meses"}</p>
        {role==="supervisor"&&pendingLegacy>0&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3"><div><p className="font-bold text-blue-950">{pendingLegacy} OS antigas com local recuperável</p><p className="text-sm text-blue-900">A correção usa somente dados identificados com segurança no arquivo original.</p></div><button type="button" disabled={fixingLegacy} className="report-button" onClick={()=>void fixLegacyLocations()}>{fixingLegacy?"Corrigindo...":"Corrigir locais"}</button></div>}
        <div className="mt-4">{isOverviewRole(role)&&<button className="report-button mr-2" onClick={()=>{setReviewOnly(!reviewOnly);if(!reviewOnly){setSentMonth("");setQuery("");}}}>{reviewOnly?"Mostrar todas":"Revisão"}{reports.filter(r=>requiresSupervisorReview(r)||r.status==="Devolvida"||r.automationState==="review"||reviewIds.includes(r.publicId)||needsPhotoApproval(r)).length?` (${reports.filter(r=>requiresSupervisorReview(r)||r.status==="Devolvida"||r.automationState==="review"||reviewIds.includes(r.publicId)||needsPhotoApproval(r)).length})`:""}</button>}{role==="supervisor"&&<button className="report-button" disabled={!filtered.length} onClick={()=>document.dispatchEvent(new CustomEvent("rco-imas-batch",{detail:{publicIds:filtered.map(r=>r.publicId)}}))}>Executar todas as OS do mês</button>}{role==="engenheiro"&&<button className="report-button" disabled={!sentMonth||batchBusy} onClick={()=>void requestBatch()}>{batchBusy?"Enviando…":"Executar todas as OS do mês"}</button>}{batchMessage&&<span role="status" className="ml-2 text-sm font-semibold">{batchMessage}</span>}</div><div className="mt-5 grid gap-4">{filtered.length === 0 ? <div className="empty"><ClipboardList size={34}/><p>Nenhuma OS encontrada com os filtros selecionados.</p></div> : filtered.map((report)=><article key={report.publicId} className="report-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="status-dot"/><span className="text-sm font-bold text-emerald-700">{report.status==="Devolvida"?"Devolvida para correção":requiresSupervisorReview(report)||needsPhotoApproval(report)||["review","failed"].includes(report.automationState||"")?"Precisa de revisão":report.automationState==="processing"?"Executando no IMAS":report.automationState==="queued"?"Na fila automática":reviewIds.includes(report.publicId)?"Precisa de revisão":"Recebida — aguardando processamento"}</span></div><h3 className="mt-1 text-xl font-bold">OS {report.imasOsNumber||report.osNumber}</h3><p className="text-sm text-slate-500">{report.collaborator} · {report.environment} · {report.floor}</p>{report.origin==="app"&&<p className="mt-2 text-sm font-semibold text-blue-900">Criada no app · {report.activityType} · {areaLabel(report.area)}<br/>Referência interna: {report.osNumber}{!report.imasOsNumber&&<><br/>Aguardando criação e número oficial do IMAS</>}</p>}</div></div><p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-6">{report.observations}</p>{report.returnReason&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm"><b>Correção solicitada:</b> {report.returnReason}</p>}{!isOverviewRole(role)&&<PhotoApproval report={report} supervisor={false} onSaved={loadReports}/>}{!isOverviewRole(role)&&<ReportEditor report={report} onSaved={loadReports} supervisor={role==="supervisor"} buttonLabel={role==="supervisor"?"Ajustar OS":"Editar OS"}/>}{role==="supervisor"&&<ImasPanel report={report} onSaved={loadReports}/>}{role==="engenheiro"&&<><ReviewPhotos report={report} supervisor={false} onSaved={loadReports}/><ImasPanel report={report} onSaved={loadReports} mode="engineer"/></>}{!isOverviewRole(role)&&<ReviewPhotos report={report} supervisor={role==="supervisor"} onSaved={loadReports}/>}</article>)}</div>
      </section>}
  </main>;
}
