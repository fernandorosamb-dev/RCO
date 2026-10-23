import {approvalFingerprint} from "../../imas-approval";
import {effectiveExecutionDate} from "../../maintenance-plan";
import {normalizePreventiveSchedule} from "../../preventive-schedule";
import {plannedDateForOrder} from "../../preventive-schedule-server";
import {readRoleRoster} from "../../role-roster-server";
import {rosterExecutor,verifiedExecutor} from "../../role-roster";
import {submitToImas} from "../../imas-intake";
import {photoSubmission} from "../../photo-policy";
import {uploadedPhotos,clearUploadedPhotos} from "../../uploaded-photos";
import { asc, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { reportPhotos, serviceReports, workOrders, imasAutomationRequests } from "../../../db/schema";
import { requireRole } from "../../auth";
import { imasExecutor, isImasDate } from "../../imas-config";
import { normalizeReportSchedule } from "../../imas-schedule";
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
    const roster=await readRoleRoster();
    const scheduleRows=sourceOrders.length?await env.DB.prepare("SELECT work_order_public_id,execution_date FROM work_order_schedule").all<{work_order_public_id:string;execution_date:string}>():{results:[]};
    const planById=new Map(scheduleRows.results.map(r=>[r.work_order_public_id,r.execution_date]));
    const requests=(role==="supervisor"||role==="engenheiro")?await db.select().from(imasAutomationRequests):[];
    const orderById=new Map(sourceOrders.map(order=>[order.publicId,{...order,plannedExecutionAt:planById.get(order.publicId)||effectiveExecutionDate(order.competence,order.osNumber,order.assignedArea,order.status)||order.dueAt}]));
    const visible=reports.filter(r=>r.status!=="Excluída").filter(r=>(role==="supervisor"||role==="engenheiro")?!r.downloadedAt:(r.origin==="app"?r.area:(r.createdByRole||sourceOrders.find(order=>order.publicId===r.workOrderPublicId)?.assignedArea))===role);
    const requestById=new Map(requests.map(q=>[q.reportPublicId,q]));
    const output=await Promise.all(visible.map(async r=>{
      const report={...r,downloadedAt:r.downloadedAt?.toISOString()||null,createdAt:r.createdAt.toISOString(),executorImasName:verifiedExecutor(r.collaborator,roster),workOrder:orderById.get(r.workOrderPublicId||"")||null,photos:photos.filter(p=>p.reportPublicId===r.publicId).map(p=>({publicId:p.publicId,fileName:p.fileName,url:`/api/photos/${p.publicId}`}))};
      const approval=requestById.get(r.publicId);
      const supervisorReleased=!!approval&&["queued","processing","completed","failed"].includes(approval.state)&&approval.fingerprint===await approvalFingerprint(report);
      return {...report,supervisorReleased,automationState:approval?.state||""};
    }));
    return Response.json({reports:output},{headers:{"Cache-Control":"private, no-store"}});
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
    if (required.some((key) => !values[key]&&!(["executionStartedAt","completedAt"] as string[]).includes(key))) return Response.json({ error: "Preencha todos os campos." }, { status: 400 });
    const executor=rosterExecutor(values.collaborator,await readRoleRoster());if(!executor)return Response.json({error:"Selecione um executor do cadastro IMAS."},{status:400});values.collaborator=executor;
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
    const plan=await plannedDateForOrder(workOrderPublicId);
    const schedule=plan?normalizePreventiveSchedule(values.executionStartedAt,values.completedAt,plan.planned,plan.competence):null;
    if(!schedule)return Response.json({error:"Confira o prazo programado da OS para preencher as datas."},{status:400});
    values.executionStartedAt=schedule.executionStartedAt;values.completedAt=schedule.completedAt;
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
