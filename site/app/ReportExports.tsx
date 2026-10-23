"use client";
import {useState} from "react";
import {Download,FolderOpen,Sheet} from "lucide-react";
import {exportResponses,type ExportReport,type ExportDirectory} from "./report-export";

export default function ReportExports({reports,compact=false}:{reports:ExportReport[];compact?:boolean}) {
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  async function run(mode:"excel"|"zip"|"folder") {
    if(busy)return;
    setBusy(true);setMessage("");
    try {
      let directory:ExportDirectory|undefined;
      if(mode==="folder") {
        const picker=(window as unknown as {showDirectoryPicker?:(options:{mode:string;id:string})=>Promise<ExportDirectory>}).showDirectoryPicker;
        if(!picker)throw new Error("Este navegador não permite escolher uma pasta. Use Baixar ZIP e extraia em Backup das fotos.");
        // Invoke while the click still has user activation, before imports or network calls.
        directory=await picker.call(window,{mode:"readwrite",id:"rco-backup-fotos"});
      }
      setMessage(await exportResponses(reports,mode,setMessage,directory));
    } catch(error) {
      if(error instanceof Error&&error.name==="AbortError")setMessage("Seleção cancelada. Nenhum arquivo foi gravado.");
      else if(error instanceof Error&&(error.name==="NotAllowedError"||error.name==="SecurityError"))setMessage("O navegador não autorizou a pasta. Use Baixar ZIP e extraia os arquivos manualmente no destino.");
      else setMessage(error instanceof Error?error.message:"Não foi possível exportar.");
    } finally {setBusy(false);}
  }
  return <div className={compact?"mt-3":"mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4"}>
    {!compact&&<><h3 className="font-bold">Excel e backup das fotos</h3><p className="mt-1 text-sm text-slate-700">Exporta as {reports.length} OS exibidas, da menor para a maior. O Excel contém as respostas em células separadas.</p><p className="mt-2 break-all text-sm text-slate-700">Destino: C:\Users\Everton\Desktop\Backup das fotos</p><p className="mt-1 text-sm text-slate-600">Em Salvar na pasta, selecione esse destino e autorize. Será criada uma nova subpasta, sem sobrescrever backups. Se indisponível, baixe e extraia o ZIP.</p></>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="report-button" disabled={busy||!reports.length} onClick={()=>run("excel")}><Sheet size={18}/> Excel para IMAS</button>
      <button type="button" className="report-button" disabled={busy||!reports.length} onClick={()=>run("zip")}><Download size={18}/> {compact?"Pacote IMAS desta OS":"Pacote IMAS (Excel + fotos)"}</button>
      {!compact&&<button type="button" className="report-button" disabled={busy||!reports.length} onClick={()=>run("folder")}><FolderOpen size={18}/> Salvar na pasta</button>}
    </div>
    {message&&<p role="status" className="mt-3 break-words text-sm font-semibold text-blue-950">{message}</p>}
  </div>;
}
