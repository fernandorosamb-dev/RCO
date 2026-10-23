"use client";
import ImasPanel from "./ImasPanel";
import type {ExportReport} from "./report-export";
export type ReviewItem={report:ExportReport;photos:boolean;imas:boolean;step:string};
export default function ReviewPanel({items,onSaved,readOnly=false}:{items:ReviewItem[];onSaved:()=>Promise<void>;readOnly?:boolean}){
 return <div className="mt-5 space-y-4">{!items.length?<div className="empty"><p>Nenhuma OS aguardando revisão.</p></div>:items.map(({report,photos,imas})=><article className="report-card" key={report.publicId}><h3 className="text-xl font-bold">OS {report.imasOsNumber||report.osNumber}</h3><p className="text-sm text-slate-600">{report.collaborator} · {report.environment} · {report.floor}</p><div className="mt-2 flex flex-wrap gap-2">{imas&&<span className="rounded-lg bg-amber-50 p-2 text-sm font-bold">Processamento pendente</span>}{photos&&<span className="rounded-lg bg-blue-50 p-2 text-sm font-bold">Aguardando liberação · {report.photos.length} fotos</span>}</div><p className="mt-3 whitespace-pre-line text-sm">{report.observations}</p><ImasPanel report={report} onSaved={onSaved} mode={readOnly?"engineer":"supervisor"}/></article>)}</div>;
}
