"use client";
import type {ExportReport} from "./report-export";
import {needsPhotoApproval} from "./photo-policy";
export default function PhotoApproval({report}:{report:ExportReport;supervisor:boolean;onSaved:()=>Promise<void>}){
 return needsPhotoApproval(report)?<p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">Aguardando aprovação do supervisor · {report.photos.length} fotos</p>:null;
}
