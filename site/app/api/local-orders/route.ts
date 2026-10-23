import {readRoleRoster} from "../../role-roster-server";
import {rosterExecutor,verifiedExecutor} from "../../role-roster";
import {submitToImas} from "../../imas-intake";
import {photoSubmission} from "../../photo-policy";
import {uploadedPhotos,clearUploadedPhotos} from "../../uploaded-photos";
import { env } from "cloudflare:workers";
import { requireRole } from "../../auth";

import { IMAS_SYSTEMS, IMAS_RESPONSIBLE, imasExecutor, isImasDate } from "../../imas-config";
import { normalizeReportSchedule } from "../../imas-schedule";
import { isImasEquipmentCode, imasEquipmentName } from "../../imas-equipments";

const areas = ["eletrica", "hidraulica", "refrigeracao", "civil"];

export async function POST(request: Request) {
  const objectKeys: string[] = [];
  try {
    const role = await requireRole(["supervisor", "eletrica", "hidraulica", "refrigeracao", "civil"]);
    if (!role) return Response.json({ error: "Faça login para criar uma OS." }, { status: 401 });
    const data = await request.formData();
    const read = (key: string) => String(data.get(key) || "").trim();
    const activityType = read("activityType");
    const creationOnly=read("workflow")==="creation";
    const area = role === "supervisor" ? read("area") : role;
    const collaborator = rosterExecutor(read("collaborator"),await readRoleRoster()) || IMAS_RESPONSIBLE[area] || "", environment = read("environment"), floor = read("floor");
    if(read("collaborator")&&!rosterExecutor(read("collaborator"),await readRoleRoster()))return Response.json({error:"Selecione um executor do cadastro IMAS."},{status:400});
    const description = read("description"), equipment = read("equipment"), observations = read("observations");
    const imasEquipmentCode=read("imasEquipmentCode");
    if(!isImasEquipmentCode(imasEquipmentCode))return Response.json({error:"Escolha o equipamento na lista do IMAS."},{status:400});
    const imasEquipmentLabel=imasEquipmentName(imasEquipmentCode);
    const imasSystem=read("imasSystem"), imasSubject=read("imasSubject"), imasOpenedInput=read("imasOpenedAt"), imasActivation=read("imasActivation"), imasClientReference=read("imasClientReference");
    if (!(IMAS_SYSTEMS as readonly string[]).includes(imasSystem) || !imasSubject || imasSubject.length > 500 || imasActivation.length > 500 || imasClientReference.length > 100) return Response.json({error:"Confira o assunto, sistema e data/hora de abertura do IMAS."},{status:400});
    const rawStart = read("executionStartedAt"), rawEnd = read("completedAt");
    if (!["Corretiva", "Teste de equipamento"].includes(activityType) || !areas.includes(area)) {
      return Response.json({ error: "Selecione o tipo de atividade e a área." }, { status: 400 });
    }
    if (![collaborator, environment, floor, description, observations].every(Boolean)) {
      return Response.json({ error: "Preencha os campos obrigatórios." }, { status: 400 });
    }
    if (activityType === "Teste de equipamento" && !equipment) return Response.json({ error: "Identifique o equipamento testado." }, { status: 400 });
    const schedule = normalizeReportSchedule(rawStart,rawEnd,isImasDate(imasOpenedInput)?imasOpenedInput:"");
    if (!schedule) return Response.json({ error: "Informe início e conclusão com data e hora válidas." }, { status: 400 });
    const { executionStartedAt, completedAt, imasOpenedAt } = schedule;
    if ([description, observations].some(value => value.length > 10000) || [collaborator, environment, floor, equipment].some(value => value.length > 500)) {
      return Response.json({ error: "Reduza o tamanho dos textos informados." }, { status: 400 });
    }
    // Proteção contra duplicidade (reenvio em conexão ruim): mesma OS idêntica nos últimos 10 minutos.
    const duplicate = await env.DB.prepare("SELECT os_number FROM service_reports WHERE origin='app' AND status<>'Excluída' AND created_by_role=? AND area=? AND collaborator=? AND activity_type=? AND description=? AND equipment=? AND observations=? AND imas_system=? AND imas_subject=? AND environment=? AND floor=? AND execution_started_at=? AND completed_at=? AND imas_opened_at=? AND imas_activation=? AND imas_client_reference=? AND created_at>? LIMIT 1").bind(role,area,collaborator,activityType,description,equipment,observations,imasSystem,imasSubject,environment,floor,executionStartedAt,completedAt,imasOpenedAt,imasActivation,imasClientReference,Date.now()-10*60*1000).first<{os_number:string}>();
    if (duplicate) return Response.json({ error: `Esta OS já foi registrada há instantes (${duplicate.os_number}). Não foi criada outra.` }, { status: 409 });
    const files = await uploadedPhotos(data,role);
    if (files.length < 1 && !creationOnly) return Response.json({ error: "Anexe pelo menos 1 foto." }, { status: 400 });
    if (files.some(file => file.type !== "image/jpeg" || file.size > 15_000)) return Response.json({ error: "As fotos precisam ser comprimidas em JPEG antes do envio." }, { status: 400 });

    const policy=creationOnly?{status:"Aguardando criação",photoApprovalStatus:"not_required"}:photoSubmission(files.length);
    const publicId = crypto.randomUUID();
    const now = Date.now();
    // Prefix distinguishes this internal reference from an OS issued by the external system.
    const osNumber = `APP-${new Date(now).toISOString().slice(0,10).replace(/-/g, "")}-${publicId.slice(0,8).toUpperCase()}`;
    const statements = [env.DB.prepare(`INSERT INTO service_reports
      (public_id, os_number, collaborator, execution_started_at, completed_at, environment, floor,
       observations, status, work_order_public_id, origin, activity_type, description, equipment, area, created_by_role, created_at, imas_system, imas_subject, imas_opened_at, imas_activation, imas_client_reference, photo_approval_status, imas_equipment_code, imas_equipment_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'app', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        publicId, osNumber, collaborator, executionStartedAt, completedAt, environment, floor,
        observations, policy.status, activityType, description, equipment, area, role, now, imasSystem, imasSubject, imasOpenedAt, imasActivation, imasClientReference,policy.photoApprovalStatus,imasEquipmentCode,imasEquipmentLabel)];
    for (const [index, file] of files.entries()) {
      const photoId = crypto.randomUUID();
      const objectKey = `reports/${publicId}/${index + 1}-${photoId}.jpg`;
      objectKeys.push(objectKey);
      await env.BUCKET.put(objectKey, await file.stream(), { httpMetadata: { contentType: "image/jpeg" } });
      statements.push(env.DB.prepare(`INSERT INTO report_photos
        (public_id, report_public_id, object_key, file_name, content_type, created_at)
        VALUES (?, ?, ?, ?, 'image/jpeg', ?)`).bind(photoId, publicId, objectKey, `${osNumber}-foto-${index + 1}.jpg`, now));
    }
    // The report and all photo metadata become visible together, only after every upload succeeds.
    await env.DB.batch(statements);
    await clearUploadedPhotos(data,role);
    const automation=await submitToImas(publicId);
    return Response.json({ automation, publicId, osNumber, status:policy.status,photoApprovalStatus:policy.photoApprovalStatus }, { status: 201 });
  } catch (error) {
    await Promise.allSettled(objectKeys.map(key => env.BUCKET.delete(key)));
    console.error("Falha ao criar OS avulsa", error);
    return Response.json({ error: "Não foi possível salvar a OS. Seus campos e fotos continuam na tela para tentar novamente." }, { status: 500 });
  }
}
