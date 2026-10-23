import {submitToImas} from "../../imas-intake";
import {FABRICIO_REVIEW_AFTER} from "../../supervisor-holds";
import {photoSubmission} from "../../photo-policy";
import {uploadedPhotos,clearUploadedPhotos} from "../../uploaded-photos";
import { asc, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { reportPhotos, serviceReports, workOrders, imasAutomationRequests } from "../../../db/schema";
import { requireRole } from "../../auth";
import { imasExecutor, isImasDate } from "../../imas-config";
import { normalizeSchedule } from "../../imas-schedule";
import { hasValidLocation } from "../../location-fields";

export async function GET() {
  try {
    const role=await requireRole(["supervisor","engenheiro","eletrica","hidraulica","refrigeracao","civil"]);
    if(!role)return Response.json({error:"Faça login."},{status:401});
    const db = getDb();
    const reports = await db.select().from(serviceReports).orderBy(desc(serviceReports.createdAt));
    const ids = reports.map((r) => r.publicId);
    const photos = ids.length ? await db.select().from(reportPhotos).orderBy(asc(reportPhotos.createdAt),asc(reportPhotos.id)) : [];
    const workOrderIds = reports.map((r) => r.workOrderPublicId).filter((id): id is string => Boolean(id));
    const sourceOrders = workOrderIds.length ? await db.select().from(workOrders) : [];
    const requests=(role==="supervisor"||role==="engenheiro")?await db.select().from(imasAutomationRequests):[];
    const visible=reports.filter(r=>r.status!=="Excluída").filter(r=>(role==="supervisor"||role==="engenheiro")?!r.downloadedAt:(r.origin==="app"?r.area:(r.createdByRole||sourceOrders.find(order=>order.publicId===r.workOrderPublicId)?.assignedArea))===role);
    return Response.json({ reports: visible.map((r) => ({ ...r, supervisorReleased:requests.some(q=>q.reportPublicId===r.publicId&&["queued","processing","completed"].includes(q.state)&&q.requestedAt>FABRICIO_REVIEW_AFTER), automationState:requests.find(q=>q.reportPublicId===r.publicId)?.state||"", createdAt: r.createdAt.toISOString(), workOrder: sourceOrders.find((order) => order.publicId === r.workOrderPublicId) || null, photos: photos.filter((p) => p.reportPublicId === r.publicId).map((p) => ({ publicId: p.publicId, fileName: p.fileName, url: `/api/photos/${p.publicId}` })) })) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erro ao carregar relatórios." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const role=await requireRole(["supervisor","eletrica","hidraulica","refrigeracao","civil"]);
    if(!role)return Response.json({error:"Faça login."},{status:401});
    const data = await request.formData();
    const workOrderPublicId=String(data.get("workOrderPublicId")||"").trim();
    const required = ["osNumber", "collaborator", "executionStartedAt", "completedAt", "environment", "floor", "observations"] as const;
    const values = Object.fromEntries(required.map((key) => [key, String(data.get(key) || "").trim()])) as Record<(typeof required)[number], string>;
    if (required.some((key) => !values[key])) return Response.json({ error: "Preencha todos os campos." }, { status: 400 });
    const schedule=isImasDate(values.executionStartedAt)&&isImasDate(values.completedAt)?normalizeSchedule(values.executionStartedAt,values.completedAt):null;
    if(!schedule)return Response.json({error:"Informe início e conclusão com data e hora válidas."},{status:400});
    values.executionStartedAt=schedule.executionStartedAt;values.completedAt=schedule.completedAt;
    const executor=imasExecutor(values.collaborator);if(!executor)return Response.json({error:"Selecione um executor do cadastro IMAS."},{status:400});values.collaborator=executor;
    const files = await uploadedPhotos(data,role);
    if (files.length < 1) return Response.json({ error: "Envie pelo menos 1 foto." }, { status: 400 });
    if (files.some((file) => file.type !== "image/jpeg" || file.size > 15_000)) return Response.json({ error: "Atualize a página para o app compactar as fotos automaticamente." }, { status: 400 });
    const db = getDb();
    if(!workOrderPublicId)return Response.json({error:"Selecione uma OS atribuída."},{status:400});
    const [workOrder]=await db.select().from(workOrders).where(eq(workOrders.publicId,workOrderPublicId)).limit(1);
    if(!workOrder||workOrder.osNumber!==values.osNumber)return Response.json({error:"OS atribuída não encontrada."},{status:404});
    if(!hasValidLocation(values.environment,workOrder.unit)||!hasValidLocation(values.floor,workOrder.unit))return Response.json({error:"Informe manualmente o Ambiente e o Pavimento corretos desta OS."},{status:400});
    if(role!=="supervisor"&&workOrder.assignedArea!==role)return Response.json({error:"Esta OS não pertence à sua área."},{status:403});
    if(workOrder.status==="Concluída"||workOrder.status==="Aguardando aprovação")return Response.json({error:"Esta OS já foi concluída."},{status:409});
    const reportPublicId = crypto.randomUUID(); const now = new Date();
    const policy=photoSubmission(files.length);
    const photoRows:(typeof reportPhotos.$inferInsert)[]=[];
    for (const [index, file] of files.entries()) {
      const photoPublicId = crypto.randomUUID(); const objectKey = `reports/${reportPublicId}/${String(index + 1).padStart(2, "0")}-${photoPublicId}.jpg`;
      await env.BUCKET.put(objectKey, await file.stream(), { httpMetadata: { contentType: "image/jpeg" } });
      photoRows.push({ publicId: photoPublicId, reportPublicId, objectKey, fileName: `OS-${values.osNumber}-foto-${index + 1}.jpg`, contentType: "image/jpeg", createdAt: now });
    }
    await db.batch([db.insert(serviceReports).values({publicId:reportPublicId,...values,...policy,workOrderPublicId,createdByRole:role,createdAt:now}),db.insert(reportPhotos).values(photoRows),db.update(workOrders).set({status:policy.status,updatedAt:now}).where(eq(workOrders.publicId,workOrderPublicId))]);
    const [saved] = await db.select().from(serviceReports).where(eq(serviceReports.publicId, reportPublicId)).limit(1);
    await clearUploadedPhotos(data,role);
    const automation=await submitToImas(reportPublicId);
    return Response.json({ report: saved,automation }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erro ao salvar a OS." }, { status: 500 }); }
}
