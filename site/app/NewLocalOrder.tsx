"use client";

import { useState } from "react";
import { Camera, Images, Loader2, Send } from "lucide-react";
import { PhotoPreview } from "./WorkOrderReturn";
import type { Role } from "./auth";
import { IMAS_SYSTEMS, IMAS_EXECUTORS } from "./imas-config";

import {appendUploadedPhotos} from "./photo-upload";

const areas = [["eletrica", "Elétrica"], ["hidraulica", "Hidráulica"], ["refrigeracao", "Refrigeração"], ["civil", "Civil"]];
const emptyForm = { activityType: "Corretiva", area: "", collaborator: "", environment: "", floor: "", equipment: "", description: "", executionStartedAt: "", completedAt: "", observations: "", imasSystem: "", imasSubject: "", imasOpenedAt: "", imasActivation: "", imasClientReference: "" };

export default function NewLocalOrder({ role }: { role: Role }) {
  const [form, setForm] = useState({...emptyForm, collaborator: ""});
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const change = (key: keyof typeof emptyForm, value: string) => setForm(current => ({ ...current, [key]: value }));
  function addFiles(list: FileList | null) {
    const incoming = Array.from(list || []).filter(file => file.type.startsWith("image/"));
    if (!incoming.length) return;
    setMessage("");
    setFiles(current => [...current, ...incoming]);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSuccess(false);
    if (files.length < 1) { setMessage("Anexe pelo menos 1 foto da atividade."); return; }
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries({ ...form, description: form.description.trim() || form.imasSubject.trim(), imasOpenedAt: "" }).forEach(([key, value]) => body.append(key, value));
      await appendUploadedPhotos(body,files,setMessage);
      setMessage("Enviando a nova OS...");
      const response = await fetch("/api/local-orders", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 413 ? "Não foi possível enviar as fotos compactadas. Tente novamente; o app fará a redução automaticamente." : payload.error || "Não foi possível enviar. Tente novamente.");
      setForm({...emptyForm, collaborator:""}); setFiles([]); setSuccess(true);
      setMessage(payload.automation?.message||`OS registrada: ${payload.osNumber}. ${payload.photoApprovalStatus==="pending"?"Mais de 5 fotos: conclusão aguardando aprovação do supervisor.":"Fotos compactadas. Enviada para a fila IMAS."}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha no envio. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
    <span className="eyebrow">Atividade fora das OS do sistema</span>
    <h2 className="mt-2 text-2xl font-bold">Nova OS</h2>
    <p className="mt-1 text-slate-600">Informe o serviço executado e anexe as fotos.</p>
    <form onSubmit={submit} className="mt-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
        <label className="field"><span>Tipo de atividade</span><select value={form.activityType} onChange={e => change("activityType", e.target.value)}><option>Corretiva</option><option>Teste de equipamento</option></select></label>
        {role==="supervisor"&&<label className="field"><span>Área do serviço</span><select required value={form.area} onChange={e=>change("area",e.target.value)}><option value="">Selecione a área</option>{areas.map(([area,label])=><option key={area} value={area}>{label}</option>)}</select></label>}
        <label className="field"><span>Executor — cadastro IMAS</span><select required value={form.collaborator} onChange={e=>change("collaborator",e.target.value)}><option value="">Selecione o executor</option>{IMAS_EXECUTORS.map(name=><option key={name}>{name}</option>)}</select></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="field"><span>Local / ambiente</span><input required maxLength={500} value={form.environment} onChange={e => change("environment", e.target.value)}/></label><label className="field"><span>Pavimento / área</span><input required maxLength={500} value={form.floor} onChange={e => change("floor", e.target.value)}/></label></div>
        <label className="field"><span>Assunto / serviço</span><input required maxLength={500} value={form.imasSubject} onChange={e => change("imasSubject", e.target.value)}/></label>
        <label className="field"><span>Sistema</span><select required value={form.imasSystem} onChange={e => change("imasSystem", e.target.value)}><option value="">Selecione o sistema do serviço</option>{IMAS_SYSTEMS.map(system => <option key={system}>{system}</option>)}</select></label>
        {form.activityType === "Teste de equipamento" && <label className="field"><span>Equipamento / TAG</span><input required maxLength={500} value={form.equipment} onChange={e => change("equipment", e.target.value)}/></label>}
        <div className="grid gap-4 sm:grid-cols-2"><label className="field"><span>Início da execução</span><input required type="datetime-local" value={form.executionStartedAt} onChange={e => change("executionStartedAt", e.target.value)}/></label><label className="field"><span>Conclusão da atividade</span><input required type="datetime-local" value={form.completedAt} onChange={e => change("completedAt", e.target.value)}/></label></div>
        <p className="text-sm text-slate-500">O horário é ajustado automaticamente para o padrão do IMAS (08:30 às 16:00, mínimo de 3 horas). Informe apenas o dia correto.</p>
        <label className="field"><span>Observação / serviço realizado</span><textarea required maxLength={10000} rows={4} value={form.observations} onChange={e => change("observations", e.target.value)}/></label>
        <div className="rounded-xl border border-slate-200 p-3"><p className="mb-3 font-bold">Fotos da atividade — mínimo de 1, sem limite máximo</p><div className="grid grid-cols-2 gap-3"><label className="photo-picker cursor-pointer"><Camera/><span>Câmera</span><input aria-label="Tirar foto da nova OS" type="file" className="sr-only" accept="image/*" capture="environment" onChange={e => { addFiles(e.currentTarget.files); e.currentTarget.value = ""; }}/></label><label className="photo-picker cursor-pointer"><Images/><span>Galeria</span><input aria-label="Selecionar fotos da nova OS" type="file" className="sr-only" accept="image/*" multiple onChange={e => { addFiles(e.currentTarget.files); e.currentTarget.value = ""; }}/></label></div><div className="mt-3 grid grid-cols-2 gap-3">{files.map((file, index) => <PhotoPreview key={`${file.name}-${file.lastModified}-${index}`} file={file} index={index} onRemove={() => setFiles(current => current.filter((_, i) => i !== index))}/>)}</div><p className="mt-3 text-sm font-semibold">{files.length} foto(s) anexada(s)</p></div>
        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Informações complementares (opcional)</summary>
          <div className="mt-4 space-y-4">
        {form.activityType === "Corretiva" && <label className="field"><span>Equipamento / TAG (se aplicável)</span><input maxLength={500} value={form.equipment} onChange={e => change("equipment", e.target.value)}/></label>}
        <label className="field"><span>Detalhes do problema ou teste (opcional)</span><textarea maxLength={10000} rows={3} value={form.description} onChange={e => change("description", e.target.value)}/></label>
          </div>
        </details>
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{files.length>5?"Mais de 5 fotos: a conclusão aguardará aprovação do supervisor.":"Até 5 fotos: envio para a automação IMAS. As fotos serão compactadas automaticamente."}</p>
        <button type="submit" className="submit-button" disabled={busy}>{busy ? <><Loader2 className="animate-spin"/> Enviando...</> : <><Send/> Enviar OS</>}</button>
      </fieldset>
      {message && <p role="status" className={`mt-4 text-sm font-semibold ${success ? "text-emerald-800" : "text-blue-950"}`}>{message}</p>}
    </form>
  </section>;
}
