import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
export async function POST(request:Request) {
  if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Apenas o Supervisor pode vincular a OS do IMAS."},{status:403});
  try {
    const {publicId,osNumber}=await request.json() as {publicId:unknown;osNumber:unknown};
    if(typeof publicId!=="string"||typeof osNumber!=="string"||!/^\d{1,12}$/.test(osNumber))return Response.json({error:"Informe um número válido do IMAS."},{status:400});
    const row=await env.DB.prepare("SELECT origin, imas_os_number, downloaded_at, status FROM service_reports WHERE public_id=?").bind(publicId).first<{origin:string;imas_os_number:string;downloaded_at:number|null;status:string}>();
    if(!row||row.origin!=="app"||row.status==="Excluída")return Response.json({error:"Referência APP não encontrada."},{status:404});
    if(row.downloaded_at||(row.imas_os_number&&row.imas_os_number!==osNumber))return Response.json({error:"A OS já está vinculada ou baixada. Confira o número antes de prosseguir."},{status:409});
    const result=await env.DB.prepare(`UPDATE service_reports SET imas_os_number=? WHERE public_id=? AND status<>'Excluída' AND downloaded_at IS NULL AND (imas_os_number='' OR imas_os_number=?) AND NOT EXISTS (SELECT 1 FROM service_reports WHERE public_id<>? AND (imas_os_number=? OR (origin='sistema' AND os_number=?)))`).bind(osNumber,publicId,osNumber,publicId,osNumber,osNumber).run();
    if(!result.meta.changes)return Response.json({error:"Esse número já está vinculado a outro relatório. Não crie uma duplicata."},{status:409});
    // O número confirmado encerra só a criação. A execução será enviada pelo colaborador.
    if(row.status==="Aguardando criação"||row.status==="Aguardando execução"){
      await env.DB.batch([
        env.DB.prepare("UPDATE service_reports SET status='Aguardando execução' WHERE public_id=? AND status IN ('Aguardando criação','Aguardando execução') AND imas_os_number=? AND downloaded_at IS NULL").bind(publicId,osNumber),
        env.DB.prepare("UPDATE imas_automation_requests SET state='waiting_execution',updated_at=? WHERE report_public_id=? AND EXISTS(SELECT 1 FROM service_reports WHERE public_id=? AND status='Aguardando execução' AND imas_os_number=?)").bind(Date.now(),publicId,publicId,osNumber),
      ]);
      return Response.json({linked:true,osNumber,waitingExecution:true});
    }
    await env.DB.prepare("UPDATE imas_automation_requests SET state='changed',updated_at=? WHERE report_public_id=? AND state='queued'").bind(Date.now(),publicId).run();
    return Response.json({linked:true,osNumber});
  }catch(error){console.error("Vínculo IMAS",error);return Response.json({error:"Não foi possível registrar o vínculo."},{status:500});}
}
