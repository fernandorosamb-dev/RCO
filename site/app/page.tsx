"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, FileText, Gauge, LayoutDashboard, Loader2, LogOut, Search, UsersRound } from "lucide-react";
import { isOverviewRole, type Role } from "./access";
import Documents from "./Documents";
import MedicalNotifications from "./MedicalNotifications";
import Readings from "./Readings";
import Login from "./Login";
import Assignments from "./Assignments";
import WorkOrderReturn from "./WorkOrderReturn";
import PasswordDialog from "./PasswordDialog";
import NewLocalOrder from "./NewLocalOrder";
import Dashboard from "./Dashboard";
import OperadorPanel from "./OperadorPanel";
import {requiresSupervisorReview} from "./supervisor-holds";
import ReportEditor from "./ReportEditor";
import ImasPanel from "./ImasPanel";
import ProposalsPanel from "./ProposalsPanel";
import PhotoApproval from "./PhotoApproval";
import ReviewPhotos from "./ReviewPhotos";
import {isReviewReport} from "./review-reports";
import {needsPhotoApproval} from "./photo-policy";
import { saoPauloDate } from "./order-deadlines";
import { reportMonth } from "./report-month";

type Photo = { publicId: string; fileName: string; url: string };
type ReportWorkOrder = { competence: string; client: string; unit: string; description: string; equipment: string; originalStatus: string; openedAt: string; dueAt: string };
type Report = import("./imas-config").ImasFields & { returnReason?:string; automationFeedback?:import("./automation-feedback").AutomationFeedback; supervisorReleased?:boolean; automationState?:string; photoApprovalStatus?:string; photoApprovedAt?:string|null; origin: string; activityType: string; description: string; equipment: string; area: string; createdByRole: string; downloadedAt: string | null; publicId: string; osNumber: string; collaborator: string; executionStartedAt: string; completedAt: string; environment: string; floor: string; observations: string; status: string; createdAt: string; photos: Photo[]; workOrder: ReportWorkOrder | null };
const monthLabel = (month: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
const areaLabel = (area:string) => ({eletrica:"Elétrica",hidraulica:"Hidráulica",refrigeracao:"Refrigeração",civil:"Civil"}[area] || area);

export default function Home() {
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [view, setView] = useState<"dashboard" | "send" | "readings" | "reports" | "assignments" | "new" | "documents" | "operador">("send");
  const [documentsCategory,setDocumentsCategory]=useState<"portaria"|"rh">("portaria");
  const [reviewOnly,setReviewOnly]=useState(false);
  const [queueOnly,setQueueOnly]=useState(false);
  const [technicalOnly,setTechnicalOnly]=useState(false);
  const reportsLoad=useRef(0);
  useEffect(()=>{const queued=(event:Event)=>{const id=(event as CustomEvent<{publicId:string}>).detail?.publicId;if(!id)return;reportsLoad.current++;setReviewIds(current=>current.filter(value=>value!==id));setReports(current=>current.map(report=>report.publicId===id?{...report,automationState:"queued",automationFeedback:undefined,photoApprovalStatus:"approved",status:"Concluída"}:report));};window.addEventListener("rco-report-queued",queued);return()=>window.removeEventListener("rco-report-queued",queued);},[]);
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

  async function loadReports() {
    const sequence=++reportsLoad.current;
    const [reviews,response,statusResponse]=await Promise.all([fetch("/api/imas/diagnostics?review=1",{cache:"no-store"}).catch(()=>null),fetch("/api/reports",{cache:"no-store"}),isOverviewRole(role)?fetch("/api/reports/automation-status",{cache:"no-store"}).catch(()=>null):Promise.resolve(null)]);
    const [reviewData,reportData,statusData]=await Promise.all([reviews?.ok?reviews.json():null,response.ok?response.json():null,statusResponse?.ok?statusResponse.json():null]);
    if(sequence!==reportsLoad.current)return;
    if(reviewData)setReviewIds(reviewData.reviews.map((r:{report_public_id:string})=>r.report_public_id));
    if(reportData)setReports(reportData.reports.map((report:Report)=>({...report,automationState:statusData?.statuses?.[report.publicId]?.state||report.automationState,automationFeedback:statusData?.statuses?.[report.publicId]})));
  }
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
    if(!window.confirm(`Executar todas as OS de ${monthLabel(sentMonth)}? O pedido depende da autorização do supervisor.`))return;
    setBatchBusy(true);setBatchMessage("");
    try{const response=await fetch("/api/imas/batch-request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({month:sentMonth})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Não foi possível enviar.");setBatchMessage(result.message||"Lote autorizado. Aguardando a extensão no computador do Supervisor.");}
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
  useEffect(()=>{const refresh=()=>void loadReports();window.addEventListener("rco-imas-updated",refresh);return ()=>window.removeEventListener("rco-imas-updated",refresh);},[role]);
  useEffect(()=>{if(view!=="reports"||!isOverviewRole(role))return;const timer=setInterval(()=>void loadReports(),15000);return()=>clearInterval(timer);},[view,role]);
  const sentMonths = useMemo(() => [...new Set([saoPauloDate().slice(0, 7), ...reports.map(report => reportMonth(report)).filter(Boolean)])].sort().reverse(), [reports]);
  const collaboratorNames=useMemo(()=>[...new Set(reports.map(r=>r.collaborator.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR")),[reports]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter(report => (!technicalOnly||(report.supervisorReleased&&["failed","completed","review"].includes(report.automationState||""))) && (!queueOnly||["queued","processing"].includes(report.automationState||"")) && (!reviewOnly||isReviewReport(report,reviewIds.includes(report.publicId))) && (!collaboratorFilter||report.collaborator.trim()===collaboratorFilter) && (!sentMonth || reportMonth(report) === sentMonth) && (!q || [report.osNumber, report.imasOsNumber||"", report.environment, report.floor, report.collaborator].some(value => value.toLowerCase().includes(q)))).sort((a,b)=>a.osNumber.localeCompare(b.osNumber,"pt-BR",{numeric:true}));
  }, [reports, query, sentMonth,collaboratorFilter,reviewOnly,reviewIds,queueOnly,technicalOnly]);

  if(role===undefined)return <main className="grid min-h-screen place-items-center bg-slate-100"><Loader2 className="animate-spin text-blue-900"/></main>;
  if(role===null)return <Login onSuccess={(newRole)=>{setRole(newRole);setView(isOverviewRole(newRole)?"dashboard":"send");}}/>;
  function openOrder(osNumber:string){setQueueOnly(false);setReviewOnly(false);setCollaboratorFilter("");setSentMonth("");setQuery(osNumber);setView("reports");}
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});setRole(null);setView("send");}
  return <main className="rco-app min-h-screen">
    {isOverviewRole(role)&&<MedicalNotifications role={role} onOpen={()=>{setDocumentsCategory("rh");setView("documents");}}/>}
    <header className="rco-header sticky top-0 z-20"><div className="mx-auto max-w-6xl px-4 py-3">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rco-brand-logo rco-logo"><img src="/rco-logo.png" alt="RCO Engenharia"/><img src="/rco-logo.png" alt="" aria-hidden="true"/></span><div className="rco-heading"><h1>Manutenção Predial<span className="rco-heading-subtitle">Preventivo e Corretivo</span></h1><p>Depósito BB · Sorocaba · SP</p>{role==="engenheiro"&&<span className="text-xs text-slate-500">Engenheiro</span>}</div></div><button className="nav-button logout-button shrink-0" onClick={logout} aria-label="Sair do login"><LogOut size={18}/> Sair</button></div>
      <nav className="rco-navigation">
        <button className={`nav-button ${view==="dashboard"?"active":""}`} onClick={()=>setView("dashboard")}><LayoutDashboard size={17}/> Acompanhamento</button>
        {role!=="engenheiro"&&<button className={`nav-button ${view==="send"?"active":""}`} onClick={()=>setView("send")}><ClipboardList size={17}/> OS</button>}
        {isOverviewRole(role)&&<button className={`nav-button ${view==="assignments"?"active":""}`} onClick={()=>setView("assignments")}><UsersRound size={17}/> {role==="engenheiro"?"Distribuição":"Distribuir"}</button>}
        {role!=="engenheiro"&&<button className={`nav-button ${view==="new"?"active":""}`} onClick={()=>setView("new")}><ClipboardList size={17}/> Nova OS</button>}
        <button className={`nav-button ${view==="readings"?"active":""}`} onClick={()=>setView("readings")}><Gauge size={17}/> {isOverviewRole(role)?"Planilha":"Coleta"}</button>
        <button className={`nav-button ${view==="reports"?"active":""}`} onClick={()=>setView("reports")}><FileText size={17}/> {isOverviewRole(role)?"Relatórios":"Enviadas"}</button>
        {role==="supervisor"&&<button className={`nav-button ${view==="operador"?"active":""}`} onClick={()=>setView("operador")}><CheckCircle2 size={17}/> Operador</button>}
        <button className={`nav-button ${view==="documents"?"active":""}`} onClick={()=>setView("documents")}><FileText size={17}/> Documentos</button>{role!=="engenheiro"&&<PasswordDialog role={role}/>}
      </nav>
    </div></header>
    {view === "operador" && role==="supervisor" ? <OperadorPanel/> : view === "documents" ? <Documents role={role} initialCategory={documentsCategory}/> : view === "dashboard" ? <Dashboard supervisor={isOverviewRole(role)} readOnly={role==="engenheiro"} onOpenOrder={openOrder}/> : view === "new" && role!=="engenheiro" ? <NewLocalOrder role={role}/> : view === "readings" ? <Readings role={role}/> : view === "assignments" ? <Assignments readOnly={role==="engenheiro"}/> : view === "send" && role!=="engenheiro" ? <WorkOrderReturn/> : <section className="mx-auto max-w-6xl px-4 py-6 sm:py-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><span className="eyebrow">Painel de consulta</span><h2 className="mt-2 text-2xl font-bold">Ordens recebidas</h2><p className="mt-1 text-sm text-slate-500">Filtradas pela competência da OS. Para OS criadas no app, usamos o mês da execução.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end"><label className="field w-full"><span>Mês da OS</span><select value={sentMonth} onChange={event=>setSentMonth(event.target.value)}><option value="">Todos os meses</option>{sentMonths.map(month=><option key={month} value={month}>{monthLabel(month)}</option>)}</select></label><label className="field w-full"><span>Colaborador</span><select value={collaboratorFilter} onChange={event=>setCollaboratorFilter(event.target.value)}><option value="">Todos os colaboradores</option>{collaboratorNames.map(name=><option key={name} value={name}>{name}</option>)}</select></label><label className="search"><Search size={18}/><input aria-label="Buscar ordens" placeholder="Buscar OS, ambiente ou colaborador" value={query} onChange={(e)=>setQuery(e.target.value)}/></label></div></div>
        {role==="supervisor"&&<ProposalsPanel onChanged={loadReports}/>}
        <p role="status" className="mt-4 text-sm font-semibold text-slate-600">{filtered.length} OS · {sentMonth ? monthLabel(sentMonth) : "Todos os meses"}</p>
        {role==="supervisor"&&pendingLegacy>0&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3"><div><p className="font-bold text-blue-950">{pendingLegacy} OS antigas com local recuperável</p><p className="text-sm text-blue-900">A correção usa somente dados identificados com segurança no arquivo original.</p></div><button type="button" disabled={fixingLegacy} className="report-button" onClick={()=>void fixLegacyLocations()}>{fixingLegacy?"Corrigindo...":"Corrigir locais"}</button></div>}
        <div className="mt-4">{isOverviewRole(role)&&<button className="report-button mr-2" onClick={()=>{setTechnicalOnly(false);setQueueOnly(false);setReviewOnly(!reviewOnly);if(!reviewOnly){setSentMonth("");setQuery("");}}}>{reviewOnly?"Mostrar todas":"Revisão"}{reports.filter(r=>isReviewReport(r,reviewIds.includes(r.publicId))).length?` (${reports.filter(r=>isReviewReport(r,reviewIds.includes(r.publicId))).length})`:""}</button>}{isOverviewRole(role)&&<button type="button" className="report-button mr-2" aria-pressed={queueOnly} onClick={()=>{setTechnicalOnly(false);setReviewOnly(false);setQueueOnly(!queueOnly);setQuery("");setSentMonth("");}}>{queueOnly?"Mostrar todas":"Fila"} ({reports.filter(r=>["queued","processing"].includes(r.automationState||"")).length})</button>}{isOverviewRole(role)&&<button type="button" className="report-button mr-2" aria-pressed={technicalOnly} onClick={()=>{setTechnicalOnly(!technicalOnly);setQueueOnly(false);setReviewOnly(false);setSentMonth("");setQuery("");}}>Erro do IMAS ({reports.filter(r=>r.supervisorReleased&&["failed","completed","review"].includes(r.automationState||"")).length})</button>}{batchMessage&&<span role="status" className="ml-2 text-sm font-semibold">{batchMessage}</span>}</div><div className="mt-5 grid gap-4">{filtered.length === 0 ? <div className="empty"><ClipboardList size={34}/><p>Nenhuma OS encontrada com os filtros selecionados.</p></div> : filtered.map((report)=><article key={report.publicId} className="report-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="status-dot"/><span className="text-sm font-bold text-emerald-700">{report.status==="Devolvida"?"Devolvida para correção":["Aguardando criação","Aguardando execução"].includes(report.status)?report.status:report.supervisorReleased&&["failed","completed","review"].includes(report.automationState||"")?"Erro do IMAS — aprovação mantida":isReviewReport(report,reviewIds.includes(report.publicId))?"Precisa de revisão":report.automationState==="processing"?"Executando no IMAS":report.automationState==="queued"?"Na fila automática":reviewIds.includes(report.publicId)?"Precisa de revisão":"Recebida — aguardando processamento"}</span></div><h3 className="mt-1 text-xl font-bold">OS {report.imasOsNumber||report.osNumber}</h3><p className="text-sm text-slate-500">{report.collaborator} · {report.environment} · {report.floor}</p>{report.origin==="app"&&<p className="mt-2 text-sm font-semibold text-blue-900">Criada no app · {report.activityType} · {areaLabel(report.area)}<br/>Referência interna: {report.osNumber}{!report.imasOsNumber&&<><br/>Aguardando criação e número oficial do IMAS</>}</p>}</div></div>{report.automationFeedback?.imasCompletionPending&&<p className="mt-3 rounded-lg border border-amber-300 p-3 text-sm font-bold">Concluída no IMAS, sem baixa no app · Use Conferir baixas na extensão.</p>}<p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-6">{report.observations}</p>{report.returnReason&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm"><b>Correção solicitada:</b> {report.returnReason}</p>}{!isOverviewRole(role)&&<PhotoApproval report={report} supervisor={false} onSaved={loadReports}/>}{!isOverviewRole(role)&&<ReportEditor report={report} onSaved={loadReports} supervisor={false} buttonLabel="Editar OS"/>}{role==="supervisor"&&<ImasPanel report={report} onSaved={loadReports}/>}{role==="engenheiro"&&<><ReviewPhotos report={report} supervisor={false} onSaved={loadReports}/><ImasPanel report={report} onSaved={loadReports} mode="engineer"/></>}{!isOverviewRole(role)&&<ReviewPhotos report={report} supervisor={false} onSaved={loadReports}/>}</article>)}</div>
      </section>}
  </main>;
}
