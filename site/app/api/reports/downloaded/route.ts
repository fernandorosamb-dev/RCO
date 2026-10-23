import { env } from "cloudflare:workers";
import { requireRole } from "../../../auth";

export async function PATCH(request: Request) {
  try {
    const role = await requireRole(["supervisor"]);
    if (role !== "supervisor") return Response.json({ error: "Apenas o supervisor pode marcar a OS como baixada." }, { status: 403 });
    const { publicId, expectedNumber } = await request.json() as { publicId?: unknown; expectedNumber?: unknown };
    const id = typeof publicId === "string" ? publicId.trim() : "";
    if (!id) return Response.json({ error: "Informe a OS." }, { status: 400 });
    const existing = await env.DB.prepare("SELECT public_id, origin, imas_os_number, os_number, status, photo_approval_status, (SELECT COUNT(*) FROM report_photos WHERE report_public_id=service_reports.public_id) AS photo_count FROM service_reports WHERE public_id = ?").bind(id).first<{public_id:string;origin:string;imas_os_number:string;status:string;os_number:string;photo_approval_status:string;photo_count:number}>();
    if (!existing) return Response.json({ error: "OS não encontrada." }, { status: 404 });
    if (expectedNumber !== undefined && (typeof expectedNumber !== "string" || !/^[1-9]\d*$/.test(expectedNumber) || expectedNumber !== (existing.origin === "app" ? existing.imas_os_number : existing.os_number))) return Response.json({error:"Vínculo da OS mudou. Nenhuma baixa marcada."},{status:409});
    if(existing.photo_approval_status==="pending"||(existing.photo_count>5&&existing.photo_approval_status!=="approved"))return Response.json({error:"Aprovação do supervisor necessária para mais de 5 fotos."},{status:409});
    if (existing.status === "Excluída") return Response.json({error:"Esta OS foi excluída."},{status:409});
    if (existing.origin === "app" && !/^[1-9]\d*$/.test(existing.imas_os_number || "")) {
      return Response.json({error:"A OS ainda não tem número oficial do IMAS. Crie no IMAS e aguarde o número retornar à plataforma antes de marcar como baixada."},{status:409});
    }
    const result = await env.DB.prepare("UPDATE service_reports SET downloaded_at = ? WHERE public_id = ? AND status <> 'Excluída' AND (photo_approval_status='approved' OR (photo_approval_status<>'pending' AND (SELECT COUNT(*) FROM report_photos WHERE report_public_id=service_reports.public_id)<=5)) AND (origin <> 'app' OR imas_os_number = ?) AND (? IS NULL OR (origin = 'app' AND imas_os_number = ?) OR (origin <> 'app' AND os_number = ?))").bind(Date.now(), id, existing.imas_os_number || "", expectedNumber ?? null, expectedNumber ?? null, expectedNumber ?? null).run();
    if (!result.meta?.changes) return Response.json({error:"A OS mudou durante a confirmação. Atualize a lista e confira o vínculo com o IMAS."},{status:409});
    return Response.json({ downloaded: true });
  } catch (error) {
    console.error("Erro ao marcar OS como baixada", error);
    return Response.json({ error: "Não foi possível marcar a OS como baixada. Tente novamente." }, { status: 500 });
  }
}
