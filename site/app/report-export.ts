import { toJpeg } from "./WorkOrderReturn";

import type { ImasFields } from "./imas-config";
export type ExportReport = ImasFields & {
  supervisorReleased?: boolean; returnReason?: string; automationState?: string; photoApprovalStatus?: string; photoApprovedAt?: string|null;
  publicId: string; osNumber: string; origin: string; activityType: string; collaborator: string;
  executionStartedAt: string; completedAt: string; environment: string; floor: string;
  observations: string; status: string; description: string; equipment: string; area: string;
  photos: { publicId: string; fileName: string; url: string }[];
  workOrder: { assignedArea?: string; unit?: string; description: string; equipment: string } | null;
};
export const IMAS_JUSTIFICATION = "Ajuste de data da execução";
export const sortedReports = (reports: ExportReport[]) => [...reports].sort((a,b) => a.osNumber.localeCompare(b.osNumber,"pt-BR",{numeric:true}) || a.publicId.localeCompare(b.publicId));
export const safePart = (value:string) => value.replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,100) || "sem_numero";
export function photoPlan(reports:ExportReport[]) {
  return sortedReports(reports).map(report => {
    const base=report.origin==="app"?safePart(report.osNumber):`OS_${safePart(report.osNumber)}`;
    const duplicate=reports.filter(item=>item.osNumber===report.osNumber).length>1;
    const folder=duplicate?`${base}_${safePart(report.publicId)}`:base;
    return {report,folder,photos:report.photos.map((photo,index)=>({photo,name:`${base}_Foto_${String(index+1).padStart(2,"0")}.jpg`}))};
  });
}
// Preserve the date/time entered at the site: no browser timezone conversion.
export function excelDateTime(value:string):[Date|null,number|null] {
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if(!match)return [null,null];
  const [,y,m,d,h,min]=match.map(Number);
  return [new Date(Date.UTC(y,m-1,d)),(h*60+min)/1440];
}
export async function makeResponseWorkbook(reports:ExportReport[]) {
  // Runtime export reuses the Excel engine already used by this application's monthly readings.
  const ExcelJS=await import("exceljs");
  const workbook=new ExcelJS.Workbook();workbook.creator="RCO Engenharia";
  const sheet=workbook.addWorksheet("Respostas para o sistema");
  const photos=workbook.addWorksheet("Fotos por OS");
  const headers=["OS do sistema","Referência interna APP","Status","Data da execução","Hora da execução","Data da conclusão","Hora da conclusão","Justificativa","Ambiente","Pavimento","Observação","Colaborador","Tipo de atividade","Equipamento / TAG","Problema / descrição do teste","Área","Pasta das fotos"];
  sheet.columns=[18,34,16,18,17,19,17,31,28,22,75,30,27,32,60,22,45].map(width=>({width}));
  sheet.mergeCells("B1:Q1");sheet.getCell("B1").value="RCO — PREENCHIMENTO DE OS NO IMAS";sheet.getRow(1).height=46;
  sheet.mergeCells("A2:Q2");sheet.getCell("A2").value="Campos na ordem de preenchimento do IMAS · Fotos separadas em pastas por OS";
  sheet.getRow(2).height=24;sheet.getRow(4).values=headers;
  const photoRows:(string|number)[][]=[];
  for(const {report,folder,photos:items} of photoPlan(reports)) {
    const [startDate,startTime]=excelDateTime(report.executionStartedAt),[endDate,endTime]=excelDateTime(report.completedAt);
    const row=sheet.addRow([report.origin==="app"?"":String(report.osNumber),report.origin==="app"?report.osNumber:"",report.status,startDate,startTime,endDate,endTime,IMAS_JUSTIFICATION,report.environment,report.floor,report.observations,report.collaborator,report.activityType||"",report.equipment||report.workOrder?.equipment||"",report.description||report.workOrder?.description||"",report.area||"",folder]);
    row.height=64;[4,6].forEach(col=>row.getCell(col).numFmt="dd/mm/yyyy");[5,7].forEach(col=>row.getCell(col).numFmt="hh:mm");
    items.forEach(({photo,name},index)=>photoRows.push([report.origin==="app"?"":report.osNumber,report.origin==="app"?report.osNumber:"",index+1,name,`${folder}/${name}`]));
  }
  photos.columns=[18,34,12,54,90].map(width=>({width}));
  photos.mergeCells("A1:E1");photos.getCell("A1").value="FOTOS JPEG — NOMES E PASTAS POR OS";photos.getRow(1).height=32;
  photos.mergeCells("A2:E2");photos.getCell("A2").value="No ZIP ou na pasta, mantenha o Excel junto das subpastas de fotos.";
  photos.getRow(4).values=["OS do sistema","Referência interna APP","Foto","Nome do arquivo","Caminho relativo"];
  photoRows.forEach(values=>{const row=photos.addRow(values);row.height=25;});
  for(const s of [sheet,photos]) {
    s.views=[{state:"frozen",ySplit:4,xSplit:2}];
    s.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,s.rowCount),column:s.columnCount}};
    s.eachRow((row,rowNo)=>row.eachCell({includeEmpty:true},cell=>{
      cell.font={name:"Calibri",size:11,color:{argb:"FF172033"}};
      cell.alignment={vertical:"top",wrapText:true};
      if(rowNo===1||rowNo===4){cell.font={name:"Calibri",size:rowNo===1?14:11,bold:true,color:{argb:"FFFFFFFF"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF173F67"}};}
      else if(rowNo>4&&rowNo%2===1)cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF1F5F9"}};
    }));
    s.getRow(4).height=34;
  }
  const response=await fetch("/rco-logo.png");
  if(!response.ok)throw new Error("Não foi possível carregar o logo para o Excel. Tente novamente.");
  const logo=workbook.addImage({buffer:await response.arrayBuffer(),extension:"png"});
  sheet.addImage(logo,{tl:{col:0,row:0},ext:{width:110,height:38}});
  return workbook;
}
export async function workbookBlob(reports:ExportReport[]) {
  const workbook=await makeResponseWorkbook(reports);
  return new Blob([await workbook.xlsx.writeBuffer() as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
export async function adjustedPhoto(url:string,name:string) {
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)throw new Error(`Não foi possível baixar ${name}. Confira o login e tente novamente.`);
  const blob=await response.blob();
  if(!blob.type.startsWith("image/"))throw new Error(`O arquivo ${name} não retornou uma imagem válida.`);
  const converted=await toJpeg(new File([blob],name,{type:blob.type}));
  return new Blob([converted],{type:"image/jpeg"});
}
export type ExportDirectory={
  name:string;
  getDirectoryHandle:(name:string,options:{create:boolean})=>Promise<ExportDirectory>;
  getFileHandle:(name:string,options:{create:boolean})=>Promise<{createWritable:()=>Promise<{write:(data:Blob)=>Promise<void>;close:()=>Promise<void>}>}>;
};
export async function writeBlob(directory:ExportDirectory,name:string,blob:Blob) {
  const handle=await directory.getFileHandle(name,{create:true});const stream=await handle.createWritable();
  await stream.write(blob);await stream.close();
}
export function exportFolderName(){return `Exportacao_OS_${new Date().toISOString().replace(/[:.]/g,"-")}_${crypto.randomUUID().slice(0,8)}`;}
export function downloadBlob(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export async function exportResponses(reports:ExportReport[],mode:"excel"|"zip"|"folder",progress:(text:string)=>void,directory?:ExportDirectory) {
  if(!reports.length)throw new Error("Nenhuma OS para exportar.");
  const run=exportFolderName();const excelName="Respostas_OS.xlsx";
  progress("Preparando Excel...");const excel=await workbookBlob(reports);
  if(mode==="excel"){downloadBlob(excel,`${run}.xlsx`);return "Excel gerado. Confira os downloads do navegador.";}
  const target=mode==="folder"&&directory?await directory.getDirectoryHandle(run,{create:true}):null;
  if(mode==="folder"&&!target)throw new Error("Selecione uma pasta para salvar.");
  const zip=mode==="zip"?new (await import("jszip")).default():null;
  let count=0;
  try {
    for(const {folder,photos} of photoPlan(reports)) {
      const sub=target?await target.getDirectoryHandle(folder,{create:true}):null;
      for(const {photo,name} of photos) {
        progress(`Preparando ${name}...`);const blob=await adjustedPhoto(photo.url,name);
        if(sub)await writeBlob(sub,name,blob);else zip!.file(`${folder}/${name}`,await blob.arrayBuffer());
        count++;
      }
    }
    if(target){await writeBlob(target,excelName,excel);return `Salvos ${reports.length} registros e ${count} fotos em ${directory!.name} / ${run}.`;}
    zip!.file(excelName,await excel.arrayBuffer());progress("Preparando ZIP...");
    downloadBlob(await zip!.generateAsync({type:"blob",compression:"STORE"}),`${run}.zip`);
    return `ZIP gerado com Excel e ${count} fotos. Extraia dentro de Backup das fotos.`;
  } catch(error) {
    const message=error instanceof Error?error.message:"Falha ao exportar.";
    throw new Error(target?`${message} A subpasta ${run} pode conter ${count} fotos já gravadas. A exportação não foi concluída.`:message);
  }
}
