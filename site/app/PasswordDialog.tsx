"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Role } from "./auth";

const labels: Record<Role, string> = { supervisor: "Supervisor", engenheiro: "Engenheiro", eletrica: "Elétrica", hidraulica: "Hidráulica", refrigeracao: "Refrigeração", civil: "Civil" };

export default function PasswordDialog({ role }: { role: Role }) {
  const [open, setOpen] = useState(false); const [targetRole, setTargetRole] = useState<Role>(role);
  const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [success, setSuccess] = useState(false);
  function reset() { setTargetRole(role); setCurrentPassword(""); setNewPassword(""); setConfirmation(""); setMessage(""); setSuccess(false); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSuccess(false);
    if (newPassword !== confirmation) { setMessage("A confirmação não corresponde à nova senha."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetRole, currentPassword, newPassword }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Não foi possível alterar a senha.");
      setSuccess(true); setMessage(`Senha de ${labels[targetRole]} alterada com sucesso.`); setCurrentPassword(""); setNewPassword(""); setConfirmation("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível alterar a senha."); } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={(value)=>{setOpen(value);if(!value)reset()}}>
    <DialogTrigger asChild><button className="nav-button" aria-label="Alterar senha"><KeyRound size={17}/><span className="hidden sm:inline">Senha</span></button></DialogTrigger>
    <DialogContent className="rco-dialog"><DialogHeader><DialogTitle>Alterar senha</DialogTitle><DialogDescription>Use a senha atual para confirmar a alteração.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">{role==="supervisor"&&<label className="field"><span>Acesso que será alterado</span><select value={targetRole} onChange={(event)=>setTargetRole(event.target.value as Role)}>{(Object.keys(labels) as Role[]).map((value)=><option value={value} key={value}>{labels[value]}</option>)}</select></label>}
        <label className="field"><span>Senha atual de {labels[role]}</span><input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event)=>setCurrentPassword(event.target.value)}/></label>
        <label className="field"><span>Nova senha</span><input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)}/></label>
        <label className="field"><span>Confirmar nova senha</span><input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={confirmation} onChange={(event)=>setConfirmation(event.target.value)}/></label>
        <button disabled={busy} className="submit-button" type="submit">{busy?<><Loader2 className="animate-spin"/>Alterando...</>:<><KeyRound/>Salvar nova senha</>}</button>
        {message&&<p role="status" className={`text-center text-sm font-bold ${success?"text-emerald-700":"text-red-700"}`}>{message}</p>}
      </form>
    </DialogContent>
  </Dialog>;
}
