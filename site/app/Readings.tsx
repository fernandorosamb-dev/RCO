"use client";

import { isOverviewRole, type Role } from "./access";
import { useEffect, useMemo, useState } from "react";
import { Droplets, Download, Gauge, Loader2, Pencil, Save, X } from "lucide-react";

type Reading = {
  publicId: string; readingDate: string; collaborator: string;
  submittedByRole: string;
  waterStreet: number; waterWell: number; electric1: number; electric2: number; occurrence: string;
  consumption: { waterStreet: number | null; waterWell: number | null; electric1: number | null; electric2: number | null };
};

const today = new Date().toISOString().slice(0,10);
const initial = { readingDate: today, collaborator: "", waterStreet: "", waterWell: "", electric1: "", electric2: "", occurrence: "" };

export default function Readings({role}:{role:Role}) {
  const [form, setForm] = useState(initial);
  const [month, setMonth] = useState(today.slice(0,7));
  const [rows, setRows] = useState<Reading[]>([]);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [message, setMessage] = useState("");
  async function load() { const res = await fetch(`/api/readings?month=${month}`, {cache:"no-store"}); if(res.ok) setRows((await res.json()).readings); }
  useEffect(()=>{ void load(); },[month,role]);
  const isWeekend = useMemo(()=>{ const d=new Date(`${form.readingDate}T12:00:00`); return d.getDay()===0||d.getDay()===6; },[form.readingDate]);
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const res=await fetch("/api/readings",{method:editId?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,publicId:editId})});const data=await res.json();if(!res.ok)throw new Error(data.error||"Falha ao salvar.");setEditId(null);setForm({...initial,readingDate:form.readingDate});setMessage(editId?"Leitura corrigida. Os consumos foram recalculados.":"Coleta salva. O consumo foi calculado automaticamente.");await load();}catch(error){setMessage(error instanceof Error?error.message:"Falha ao salvar.");}finally{setBusy(false)}}
  function edit(row:Reading){setEditId(row.publicId);setForm({readingDate:row.readingDate,collaborator:row.collaborator,waterStreet:String(row.waterStreet),waterWell:String(row.waterWell),electric1:String(row.electric1),electric2:String(row.electric2),occurrence:row.occurrence});setMessage("");window.scrollTo({top:0,behavior:"smooth"});}
  function cancelEdit(){setEditId(null);setForm({...initial,readingDate:form.readingDate});setMessage("");}
  const format=(v:number|null)=>v===null?"—":v.toLocaleString("pt-BR");
  async function exportExcel(){
    const ExcelJS=await import("exceljs");
    const workbook=new ExcelJS.Workbook();
    const [year,monthNumber]=month.split("-").map(Number);
    const monthNames=["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
    const sheet=workbook.addWorksheet(`${String(monthNumber).padStart(2,"0")}-${String(year).slice(-2)}`,{pageSetup:{paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:1,margins:{left:.25,right:.25,top:.35,bottom:.35,header:.1,footer:.1}}});
    sheet.columns=[{width:13},{width:16},{width:13},{width:16},{width:13},{width:19},{width:13},{width:23},{width:13},{width:28}];
    const logoBytes=await fetch("/rco-logo.png").then(r=>r.arrayBuffer());
    const logoId=workbook.addImage({buffer:logoBytes as ArrayBuffer,extension:"png"});
    sheet.addImage(logoId,{tl:{col:0,row:0},ext:{width:150,height:48}});
    sheet.mergeCells("C1:J1");sheet.getCell("C1").value="COLETA DE DADOS DE CONSUMO DE ÁGUA E LUZ";
    sheet.getCell("C1").font={bold:true,size:16,color:{argb:"FFFFFFFF"}};sheet.getCell("C1").alignment={horizontal:"center",vertical:"middle"};sheet.getCell("C1").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF245782"}};sheet.getRow(1).height=42;
    sheet.mergeCells("A2:J2");sheet.getCell("A2").value="DEPENDÊNCIA: DEPÓSITO SOROCABA";
    sheet.mergeCells("A3:J3");sheet.getCell("A3").value=`PREFIXO: ${monthNames[monthNumber-1]}/${year}`;
    sheet.mergeCells("A4:J4");sheet.getCell("A4").value="SAAE Sorocaba – Matrícula 21762-86 | CPFL – Códigos 202752765 (Bombeiro) e 202752757";
    for(let r=2;r<=4;r++){const cell=sheet.getCell(r,1);cell.font={bold:true,size:10,color:{argb:"FF1F2937"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFDCEAF5"}};cell.alignment={vertical:"middle"};sheet.getRow(r).height=20;}
    const headers=["Data","Relógio água rua","Consumo diário","Relógio água poço","Consumo diário","Relógio elétrico 1 - Geral","Consumo diário 1","Relógio elétrico 2 - Sistema de incêndio","Consumo diário 2","Ocorrência / conferência"];
    const headerRow=sheet.getRow(6);headerRow.values=headers;headerRow.height=34;
    headerRow.eachCell(cell=>{cell.font={bold:true,color:{argb:"FFFFFFFF"},size:9};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF4778C8"}};cell.alignment={horizontal:"center",vertical:"middle",wrapText:true};cell.border={top:{style:"thin"},left:{style:"thin"},bottom:{style:"thin"},right:{style:"thin"}};});
    const days=new Date(year,monthNumber,0).getDate();
    for(let day=1;day<=days;day++){
      const dateKey=`${year}-${String(monthNumber).padStart(2,"0")}-${String(day).padStart(2,"0")}`;const record=rows.find(r=>r.readingDate===dateKey);const date=new Date(year,monthNumber-1,day,12);const weekend=date.getDay()===0||date.getDay()===6;
      const row=sheet.getRow(6+day);row.values=[date,record?.waterStreet??null,record?.consumption.waterStreet??null,record?.waterWell??null,record?.consumption.waterWell??null,record?.electric1??null,record?.consumption.electric1??null,record?.electric2??null,record?.consumption.electric2??null,weekend?"Sem lançamento":record?.occurrence||""];row.height=20;
      row.eachCell({includeEmpty:true},cell=>{cell.alignment={horizontal:cell.col===10?"left":"center",vertical:"middle"};cell.border={top:{style:"thin",color:{argb:"FF333333"}},left:{style:"thin",color:{argb:"FF333333"}},bottom:{style:"thin",color:{argb:"FF333333"}},right:{style:"thin",color:{argb:"FF333333"}}};if(weekend){cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF4CCCC"}};cell.font={color:{argb:"FF9C2D2D"}};}});row.getCell(1).numFmt="dd/mm/yyyy";
    }
    sheet.views=[{state:"frozen",ySplit:6}];sheet.pageSetup.printArea=`A1:J${6+days}`;
    const buffer=await workbook.xlsx.writeBuffer();const blob=new Blob([buffer as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`Coleta_Agua_Luz_${month}.xlsx`;a.click();URL.revokeObjectURL(url);
  }
  return <section className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
    <div className={`grid gap-5 ${isOverviewRole(role)?"":"lg:grid-cols-[24rem_1fr]"}`}>
      {!isOverviewRole(role)&&<div><span className="eyebrow">Coleta diária</span><h2 className="mt-2 text-2xl font-bold">Água e energia</h2><p className="mt-1 text-slate-600">Digite apenas as leituras atuais. O consumo diário é automático.</p>
        <form onSubmit={submit} className="mt-5 space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label className="field"><span>Data</span><input required type="date" value={form.readingDate} onChange={e=>setForm({...form,readingDate:e.target.value})}/></label>
          {isWeekend && <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">Sábado ou domingo: sem lançamento previsto.</div>}
          <label className="field"><span>Colaborador</span><input required placeholder="Nome de quem fez a leitura" value={form.collaborator} onChange={e=>setForm({...form,collaborator:e.target.value})}/></label>
          <div className="meter-group"><div className="meter-title"><Droplets size={18}/> Água</div><label className="field"><span>Relógio água da rua</span><input required inputMode="decimal" type="number" min="0" step="1" value={form.waterStreet} onChange={e=>setForm({...form,waterStreet:e.target.value})}/></label><label className="field"><span>Relógio água do poço</span><input required inputMode="decimal" type="number" min="0" step="1" value={form.waterWell} onChange={e=>setForm({...form,waterWell:e.target.value})}/></label></div>
          <div className="meter-group"><div className="meter-title"><Gauge size={18}/> Energia</div><label className="field"><span>Relógio elétrico 1 — Geral</span><input required inputMode="decimal" type="number" min="0" step="1" value={form.electric1} onChange={e=>setForm({...form,electric1:e.target.value})}/></label><label className="field"><span>Relógio elétrico 2 — Sistema de incêndio</span><input required inputMode="decimal" type="number" min="0" step="1" value={form.electric2} onChange={e=>setForm({...form,electric2:e.target.value})}/></label></div>
          <label className="field"><span>Ocorrência / conferência</span><textarea rows={3} placeholder="Opcional" value={form.occurrence} onChange={e=>setForm({...form,occurrence:e.target.value})}/></label>
          <button className="submit-button" disabled={busy||isWeekend}>{busy?<><Loader2 className="animate-spin"/> Salvando...</>:<><Save/> {editId?"Salvar correção":"Salvar coleta"}</>}</button>{editId&&<button type="button" className="nav-button w-full justify-center" onClick={cancelEdit}><X size={18}/> Cancelar edição</button>}{message&&<p className="text-center text-sm font-bold text-blue-900">{message}</p>}
        </form>
        <div className="mt-5 space-y-3"><h3 className="font-bold">Leituras lançadas pela sua equipe</h3>{rows.length?rows.map(row=><article key={row.publicId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><strong>{new Date(`${row.readingDate}T12:00:00`).toLocaleDateString("pt-BR")}</strong><p className="text-sm text-slate-500">{row.collaborator}</p></div><button type="button" className="report-button" onClick={()=>edit(row)}><Pencil size={17}/> Editar</button></div></article>):<p className="rounded-xl bg-white p-4 text-sm text-slate-500">Nenhuma leitura lançada por esta equipe.</p>}</div>
      </div>}
      {isOverviewRole(role)&&<div className="min-w-0"><div className="flex flex-wrap items-end justify-between gap-3"><div><span className="eyebrow">Planilha mensal</span><h2 className="mt-2 text-2xl font-bold">Consumo calculado</h2></div><div className="flex gap-2"><input className="month-input" type="month" value={month} onChange={e=>setMonth(e.target.value)}/><button className="report-button" onClick={exportExcel}><Download size={18}/> Exportar Excel</button></div></div>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="reading-table"><thead><tr><th>Data</th><th>Água rua</th><th>Consumo</th><th>Água poço</th><th>Consumo</th><th>Elétrico 1 — Geral</th><th>Consumo</th><th>Elétrico 2 — Incêndio</th><th>Consumo</th><th>Ocorrência</th></tr></thead><tbody>{rows.length?rows.map(r=><tr key={r.publicId}><td>{new Date(`${r.readingDate}T12:00:00`).toLocaleDateString("pt-BR")}</td><td>{format(r.waterStreet)}</td><td className="consumption">{format(r.consumption.waterStreet)}</td><td>{format(r.waterWell)}</td><td className="consumption">{format(r.consumption.waterWell)}</td><td>{format(r.electric1)}</td><td className="consumption">{format(r.consumption.electric1)}</td><td>{format(r.electric2)}</td><td className="consumption">{format(r.consumption.electric2)}</td><td>{r.occurrence||"—"}</td></tr>):<tr><td colSpan={10} className="py-12 text-center text-slate-500">Nenhuma leitura neste mês.</td></tr>}</tbody></table></div>
      </div>}
    </div>
  </section>;
}
