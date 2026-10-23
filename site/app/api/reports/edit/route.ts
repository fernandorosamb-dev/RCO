import {submitToImas} from "../../../imas-intake";
import {photoSubmission} from "../../../photo-policy";
import {uploadedPhotos,clearUploadedPhotos} from "../../../uploaded-photos";
import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
import {IMAS_SYSTEMS,imasExecutor,isImasDate} from "../../../imas-config";
import {normalizeSchedule} from "../../../imas-schedule";
import {hasValidLocation} from "../../../location-fields";

export async function PATCH(request:Request) {
  const addedKeys:string[]=[];
  try {
    const role=await requireRole(["supervisor","eletrica","hidraulica","refrigeracao","civil"]);
    if(!role)return Response.json({error:"Faça login para corrigir OS enviadas."},{status:401});
    const data=await request.formData();const text=(key:string)=>String(data.get(key)||"").trim();const id=text("publicId");
    const report=await env.DB.prepare("SELECT * FROM service_reports WHERE public_id = ?").bind(id).first<{origin:string;os_number:string;area:string;created_by_role:string;work_order_public_id:string|null;status:string;downloaded_at:number|null;imas_os_number:string;imas_opened_at:string;imas_activation:string;imas_client_reference:string}>();
    if(!report)return Response.json({error:"OS não encontrada."},{status:404});
    if((await env.DB.prepare("SELECT state FROM imas_automation_requests WHERE report_public_id=?").bind(id).first<{state:string}>())?.state==="processing")return Response.json({error:"A OS está em processamento. Aguarde antes de editar."},{status:409});
    if(report.downloaded_at)return Response.json({error:"A OS já foi baixada. Restaure-a antes de corrigir."},{status:409});
    const source=report.work_order_public_id?await env.DB.prepare("SELECT assigned_area, unit FROM work_orders WHERE public_id = ?").bind(report.work_order_public_id).first<{assigned_area:string;unit:string}>():null;
    if(role!=="supervisor"){
      const ownerArea=report.origin==="app"?report.area:(report.created_by_role||source?.assigned_area);
      if(ownerArea!==role)return Response.json({error:"Você só pode editar OS da sua equipe."},{status:403});
    }
    const executor=imasExecutor(text("collaborator"));if(!executor)return Response.json({error:"Selecione um executor do cadastro IMAS."},{status:400});
        const keys=["collaborator","executionStartedAt","completedAt","environment","floor","observations"];
    if(keys.some(key=>!text(key)))return Response.json({error:"Preencha os campos obrigatórios."},{status:400});
    if(!hasValidLocation(text("environment"),source?.unit||"")||!hasValidLocation(text("floor"),source?.unit||""))return Response.json({error:"Informe manualmente o Ambiente e o Pavimento corretos desta OS."},{status:400});
    const schedule=isImasDate(text("executionStartedAt"))&&isImasDate(text("completedAt"))?normalizeSchedule(text("executionStartedAt"),text("completedAt"),report.imas_opened_at||""):null;
    if(!schedule)return Response.json({error:"Informe início e conclusão com data e hora válidas."},{status:400});
    const opening=schedule.imasOpenedAt;
    if(text("observations").length>10000)return Response.json({error:"As observações ultrapassam 10 mil caracteres."},{status:400});
    let keep:string[];
    try{const parsed=JSON.parse(text("keepPhotos"));if(!Array.isArray(parsed)||parsed.some(v=>typeof v!=="string"))throw Error();keep=[...new Set(parsed)] as string[];}catch{return Response.json({error:"Lista de fotos inválida."},{status:400});}
    const previous=await env.DB.prepare("SELECT public_id FROM report_photos WHERE report_public_id = ?").bind(id).all<{public_id:string}>();
    if(keep.some(photoId=>!previous.results.some(p=>p.public_id===photoId)))return Response.json({error:"Uma das fotos não pertence a esta OS."},{status:400});
    const files = await uploadedPhotos(data,role);
    if(keep.length+files.length<1)return Response.json({error:"Mantenha pelo menos 1 foto."},{status:400});
    if(files.some(file=>file.type!=="image/jpeg"||file.size>15_000))return Response.json({error:"As novas fotos devem estar comprimidas em JPEG."},{status:400});
    if(report.origin==="app"&&(!["Corretiva","Teste de equipamento"].includes(text("activityType"))||!text("description")||!["eletrica","hidraulica","refrigeracao","civil"].includes(text("area"))||(text("activityType")==="Teste de equipamento"&&!text("equipment"))))return Response.json({error:"Confira o tipo, área, descrição e equipamento."},{status:400});
    if(report.origin==="app"&&(!(IMAS_SYSTEMS as readonly string[]).includes(text("imasSystem"))||!text("imasSubject")||text("imasSubject").length>500||!isImasDate(opening)||text("imasActivation").length>500||text("imasClientReference").length>100))return Response.json({error:"Confira os campos de criação no IMAS."},{status:400});
    const operations=[env.DB.prepare(`UPDATE service_reports SET collaborator=?, execution_started_at=?, completed_at=?, environment=?, floor=?, observations=? WHERE public_id=?`).bind(...keys.map(key=>key==="collaborator"?executor:key==="executionStartedAt"?schedule.executionStartedAt:key==="completedAt"?schedule.completedAt:text(key)),id)];
    if(report.origin==="app"){
      const area=role==="supervisor"?text("area"):report.area;
      operations.push(env.DB.prepare("UPDATE service_reports SET activity_type=?, description=?, equipment=?, area=?, collaborator=?, imas_system=?, imas_subject=?, imas_opened_at=?, imas_activation=?, imas_client_reference=? WHERE public_id=?").bind(text("activityType"),text("description"),text("equipment"),area,executor,text("imasSystem"),text("imasSubject"),opening,report.imas_activation||"",report.imas_client_reference||"",id));
    }
    for(const photo of previous.results)if(!keep.includes(photo.public_id))operations.push(env.DB.prepare("DELETE FROM report_photos WHERE public_id=? AND report_public_id=?").bind(photo.public_id,id));
    for(const file of files){const photoId=crypto.randomUUID();const key=`reports/${id}/${photoId}.jpg`;addedKeys.push(key);await env.BUCKET.put(key,await file.stream(),{httpMetadata:{contentType:"image/jpeg"}});operations.push(env.DB.prepare("INSERT INTO report_photos (public_id,report_public_id,object_key,file_name,content_type,created_at) VALUES (?,?,?,?,'image/jpeg',?)").bind(photoId,id,key,`OS-${report.os_number}-${photoId}.jpg`,Date.now()));}
    const policy=report.status==="Devolvida"?{status:"Aguardando aprovação",photoApprovalStatus:"pending"}:photoSubmission(keep.length+files.length);
    operations.push(env.DB.prepare("UPDATE service_reports SET status=?,return_reason='',photo_approval_status=?,photo_approved_at=NULL WHERE public_id=?").bind(policy.status,policy.photoApprovalStatus,id));
    if(report.work_order_public_id)operations.push(env.DB.prepare("UPDATE work_orders SET status=?,updated_at=? WHERE public_id=?").bind(policy.status,Date.now(),report.work_order_public_id));
    operations.push(env.DB.prepare("UPDATE imas_automation_requests SET state='changed',updated_at=? WHERE report_public_id=? AND state='queued'").bind(Date.now(),id));
    await env.DB.batch(operations);
    await clearUploadedPhotos(data,role);
    const automation=await submitToImas(id);
    return Response.json({automation,updated:true,status:policy.status,photoApprovalStatus:policy.photoApprovalStatus});
  }catch(error){await Promise.allSettled(addedKeys.map(key=>env.BUCKET.delete(key)));console.error("Erro na correção da OS",error);return Response.json({error:"Não foi possível salvar a correção. Os dados anteriores foram preservados."},{status:500});}
}
