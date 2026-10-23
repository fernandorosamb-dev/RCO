import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { reportPhotos,serviceReports,workOrders } from "../../../../db/schema";
import { requireRole } from "../../../auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const role=await requireRole(["supervisor","engenheiro","eletrica","hidraulica","refrigeracao","civil"]);
  if(!role)return new Response("Faça login.",{status:401});
  const { id } = await context.params; const db = getDb();
  const [photo] = await db.select().from(reportPhotos).where(eq(reportPhotos.publicId, id)).limit(1);
  if (!photo) return new Response("Foto não encontrada.", { status: 404 });
  if((role!=="supervisor"&&role!=="engenheiro")){
    const [report]=await db.select().from(serviceReports).where(eq(serviceReports.publicId,photo.reportPublicId)).limit(1);
    if(!report)return new Response("Acesso restrito.",{status:403});
    const [source]=report.workOrderPublicId?await db.select().from(workOrders).where(eq(workOrders.publicId,report.workOrderPublicId)).limit(1):[];
    if((report.origin==="app"?report.area:(report.createdByRole||source?.assignedArea))!==role)return new Response("Acesso restrito.",{status:403});
  }
  const object = await env.BUCKET.get(photo.objectKey); if (!object) return new Response("Arquivo não encontrado.", { status: 404 });
  const download = new URL(request.url).searchParams.has("download");
  return new Response(object.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", ...(download ? { "Content-Disposition": `attachment; filename="${photo.fileName}"` } : {}) } });
}
