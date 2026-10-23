import { and, asc, desc, eq, ne } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { serviceReports, workOrders } from "../../../db/schema";
import { classifyOrder, equipmentKey, importAreas, isSorocabaUnit, parseOrders, responsibleByArea, type AssignmentHistory } from "../../os-import";
import { effectiveExecutionDate } from "../../maintenance-plan";
import { requireRole } from "../../auth";

const areas = ["eletrica", "hidraulica", "refrigeracao", "civil"] as const;
type Area = (typeof areas)[number];

export async function GET(request: Request) {
  try {
    const role = await requireRole(["supervisor","engenheiro", ...areas]);
    if (!role) return Response.json({ error: "Faça login." }, { status: 401 });
    const db = getDb();
    const [latest] = await db.select({ competence: workOrders.competence }).from(workOrders).orderBy(desc(workOrders.competence)).limit(1);
    const requestedCompetence = new URL(request.url).searchParams.get("competence") || "";
    if(requestedCompetence && !/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedCompetence)) return Response.json({error:"Mês inválido."},{status:400});
    const latestCompetence = requestedCompetence || latest?.competence || "";
    const scope = (role === "supervisor" || role === "engenheiro") ? eq(workOrders.competence, latestCompetence) : and(eq(workOrders.competence, latestCompetence), eq(workOrders.assignedArea, role));
    const rows = await db.select({
      publicId: workOrders.publicId, importPublicId: workOrders.importPublicId, competence: workOrders.competence,
      osNumber: workOrders.osNumber, client: workOrders.client, unit: workOrders.unit,
      environment: workOrders.environment, floor: workOrders.floor, openedAt: workOrders.openedAt, dueAt: workOrders.dueAt,
      originalStatus: workOrders.originalStatus, description: workOrders.description, equipment: workOrders.equipment,
      assignedArea: workOrders.assignedArea, assignedResponsible: workOrders.assignedResponsible, status: workOrders.status,
    }).from(workOrders).where(scope).orderBy(asc(workOrders.osNumber));
    const returns = rows.length ? await db.select({ workOrderPublicId: serviceReports.workOrderPublicId, executionStartedAt: serviceReports.executionStartedAt, completedAt: serviceReports.completedAt }).from(serviceReports).innerJoin(workOrders, eq(serviceReports.workOrderPublicId, workOrders.publicId)).where(scope).orderBy(desc(serviceReports.createdAt)) : [];
    const executionByOrder = new Map<string, typeof returns[number]>();
    for (const report of returns) if (report.workOrderPublicId && !executionByOrder.has(report.workOrderPublicId)) executionByOrder.set(report.workOrderPublicId, report);
    return Response.json({ competence: latestCompetence, workOrders: rows.map(row => ({ ...row, plannedExecutionAt: effectiveExecutionDate(row.competence, row.osNumber, row.assignedArea, row.status), executionStartedAt: executionByOrder.get(row.publicId)?.executionStartedAt || "", completedAt: executionByOrder.get(row.publicId)?.completedAt || "" })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao carregar as OS." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!await requireRole(["supervisor"])) return Response.json({ error: "Acesso restrito." }, { status: 403 });
    const data = await request.formData();
    const competence = String(data.get("competence") || "").trim();
    const file = data.get("pdf");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) return Response.json({ error: "Informe o mês das OS." }, { status: 400 });
    if (!(file instanceof File) || file.size===0 || !/\.pdf$/i.test(file.name)) return Response.json({ error: "Selecione um PDF válido." }, { status: 400 });
    if (file.size>30_000_000) return Response.json({ error: "O PDF deve ter até 30 MB." }, { status: 400 });
    const text = String(data.get("text") || "");
    if (text.length>8_000_000) return Response.json({ error: "O PDF possui texto demais para um lote. Divida o arquivo." }, { status: 400 });
    let parsed: ReturnType<typeof parseOrders>;
    try { parsed=parseOrders(text); } catch(error) { return Response.json({error:error instanceof Error?error.message:"Não foi possível separar as OS."},{status:400}); }
    if (!parsed.orders.length) return Response.json({ error: "Nenhuma OS foi reconhecida. Envie o PDF completo do IMAS, com texto selecionável." }, { status: 400 });
    if (parsed.orders.length>500) return Response.json({ error: "O arquivo excede o limite de 500 OS." }, { status: 400 });
    const excluded=parsed.orders.filter(order=>order.unit && !isSorocabaUnit(order.unit)).map(order=>({osNumber:order.osNumber,unit:order.unit}));
    const orders=parsed.orders.filter(order=>!order.unit || isSorocabaUnit(order.unit));
    if (!orders.length) return Response.json({error:"Nenhuma OS do Depósito Sorocaba foi encontrada. Confira a unidade do arquivo."},{status:400});
    const bytes=await file.arrayBuffer();
    if (new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-") return Response.json({error:"O arquivo não é um PDF válido."},{status:400});
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),byte=>byte.toString(16).padStart(2,"0")).join("");
    const importPublicId=`import-${competence}-${hash}`;
    const objectKey=`os-imports/${competence}/${hash}.pdf`;
    const db=getDb();
    const [existing,previous]=await Promise.all([
      db.select({publicId:workOrders.publicId,osNumber:workOrders.osNumber,assignedArea:workOrders.assignedArea,assignedResponsible:workOrders.assignedResponsible,status:workOrders.status,environment:workOrders.environment,floor:workOrders.floor}).from(workOrders).where(eq(workOrders.competence,competence)),
      db.select({unit:workOrders.unit,equipment:workOrders.equipment,assignedArea:workOrders.assignedArea,assignedResponsible:workOrders.assignedResponsible}).from(workOrders).orderBy(desc(workOrders.updatedAt),desc(workOrders.id)),
    ]);
    const existingByNumber=new Map(existing.map(order=>[order.osNumber,order]));
    const history=new Map<string,AssignmentHistory>();
    for(const order of previous) { const key=equipmentKey(order.unit,order.equipment); if(key && importAreas.includes(order.assignedArea as Area) && !history.has(key))history.set(key,order); }
    const distributed:Record<string,number>={eletrica:0,hidraulica:0,refrigeracao:0,civil:0};
    const pending:{osNumber:string;reason:string}[]=[];
    const now=Date.now();let created=0,updated=0;
    const statements=[env.DB.prepare("INSERT INTO os_imports (public_id,competence,file_name,object_key,os_count,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(object_key) DO NOTHING").bind(importPublicId,competence,file.name.slice(0,180),objectKey,orders.length,now)];
    for(const order of orders) {
      const current=existingByNumber.get(order.osNumber);
      const inferred=classifyOrder(order,history);
      const assignedArea=current?.assignedArea || inferred.assignedArea;
      const assignedResponsible=current?.assignedResponsible || (current?.assignedArea?responsibleByArea[current.assignedArea]:inferred.assignedResponsible) || (assignedArea?responsibleByArea[assignedArea]:"");
      const status=current?.status==="Concluída"?"Concluída":current?.status && current.status!=="Atribuir"?current.status:/conclu[ií]da/i.test(order.originalStatus)?"Concluída":assignedArea?"Atribuída":"Atribuir";
      if(assignedArea)distributed[assignedArea]=(distributed[assignedArea]||0)+1;else pending.push({osNumber:order.osNumber,reason:inferred.reason});
      if(current)updated++;else created++;
      statements.push(env.DB.prepare(`INSERT INTO work_orders (public_id,import_public_id,competence,os_number,client,unit,environment,floor,opened_at,due_at,original_status,description,equipment,assigned_area,assigned_responsible,status,imported_text,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(competence,os_number) DO UPDATE SET
          import_public_id=excluded.import_public_id,client=excluded.client,unit=CASE WHEN excluded.unit<>'' THEN excluded.unit ELSE work_orders.unit END,
          environment=CASE WHEN work_orders.environment<>'' THEN work_orders.environment ELSE excluded.environment END,
          floor=CASE WHEN work_orders.floor<>'' THEN work_orders.floor ELSE excluded.floor END,
          opened_at=excluded.opened_at,due_at=excluded.due_at,original_status=excluded.original_status,description=CASE WHEN excluded.description<>'' THEN excluded.description ELSE work_orders.description END,equipment=CASE WHEN excluded.equipment<>'' THEN excluded.equipment ELSE work_orders.equipment END,
          assigned_area=CASE WHEN work_orders.assigned_area<>'' THEN work_orders.assigned_area ELSE excluded.assigned_area END,
          assigned_responsible=CASE WHEN work_orders.assigned_responsible<>'' THEN work_orders.assigned_responsible ELSE excluded.assigned_responsible END,
          status=CASE WHEN work_orders.status='Atribuir' THEN excluded.status ELSE work_orders.status END,
          imported_text=excluded.imported_text,updated_at=excluded.updated_at`).bind(current?.publicId||crypto.randomUUID(),importPublicId,competence,order.osNumber,order.client.slice(0,300),order.unit.slice(0,500),order.environment.slice(0,300),order.floor.slice(0,200),order.openedAt.slice(0,60),order.dueAt.slice(0,60),order.originalStatus.slice(0,80),order.description.slice(0,5000),order.equipment.slice(0,2000),assignedArea,assignedResponsible.slice(0,300),status,order.importedText.slice(0,30000),now,now));
    }
    await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:"application/pdf"}});
    await env.DB.batch(statements);
    return Response.json({imported:orders.length,created,updated,duplicateCount:parsed.duplicateCount,distributed,pending,excluded,importPublicId},{status:201});
  } catch(error) {
    console.error("Falha na importação automática de OS",error);
    return Response.json({error:"Não foi possível salvar o lote. Tente novamente; OS já recebidas não serão duplicadas."},{status:500});
  }
}

export async function PATCH(request: Request) {
  try {
    if (!await requireRole(["supervisor"])) return Response.json({ error: "Acesso restrito." }, { status: 403 });
    const body = await request.json() as { publicId?: string; assignedArea?: string; assignedResponsible?: string };
    if (!body.publicId || !areas.includes(body.assignedArea as Area)) return Response.json({ error: "Selecione uma área responsável." }, { status: 400 });
    const db = getDb();
    const [current] = await db.select().from(workOrders).where(eq(workOrders.publicId,body.publicId)).limit(1);
    if (!current) return Response.json({error:"OS não encontrada."},{status:404});
    if (current.status==="Concluída") return Response.json({error:"A OS já está concluída. A atribuição foi preservada."},{status:409});
    await db.update(workOrders).set({ assignedArea: body.assignedArea, assignedResponsible: String(body.assignedResponsible || responsibleByArea[body.assignedArea] || "").trim().slice(0, 300), status: "Atribuída", updatedAt: new Date() }).where(and(eq(workOrders.publicId, body.publicId),ne(workOrders.status,"Concluída")));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao atribuir a OS." }, { status: 500 });
  }
}
