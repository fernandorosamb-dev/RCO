import { env } from "cloudflare:workers";
import { requireRole } from "../../../auth";
import { september2026Locations } from "../../../location-fields";

const competence = "2026-09";
const ivan = "IVAN RIVALDIR DE SOUZA SANTOS - AUXILIAR DE MANUTENÇÃO";
const transferredOrders = ["317143", "317144", "317145", "317146"];

type LocationRow = { os_number: string; environment: string; floor: string; unit: string };

function isInvalid(value: string, unit = "") {
  const normalized = value.trim();
  return !normalized || normalized === unit.trim() || /itens da ordem de servi[cç]o/i.test(normalized);
}

export async function GET() {
  try {
    const role = await requireRole(["supervisor"]);
    if (!role) return Response.json({ error: "Acesso exclusivo do supervisor." }, { status: 401 });
    const result = await env.DB.prepare(`SELECT os_number, environment, floor, unit
      FROM work_orders WHERE competence = ?`).bind(competence).all<LocationRow>();
    const pending = result.results.filter((row) => september2026Locations[row.os_number]
      && (isInvalid(row.environment, row.unit) || isInvalid(row.floor))).length;
    return Response.json({ pending, reviewedOrders: Object.keys(september2026Locations).length });
  } catch (error) {
    console.error("Erro ao contar locais pendentes", error);
    return Response.json({ error: "Não foi possível verificar os locais pendentes." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const role = await requireRole(["supervisor"]);
    if (!role) return Response.json({ error: "Acesso exclusivo do supervisor." }, { status: 401 });

    const workOrderStatements = Object.entries(september2026Locations).map(([osNumber, location]) =>
      env.DB.prepare(`UPDATE work_orders SET environment = ?, floor = ?, updated_at = ?
        WHERE competence = ? AND os_number = ?
          AND (TRIM(environment) = '' OR environment = unit OR LOWER(environment) LIKE '%itens da ordem de servi%'
            OR TRIM(floor) = '' OR LOWER(floor) LIKE '%itens da ordem de servi%')`)
        .bind(location.environment, location.floor, Date.now(), competence, osNumber));
    const reportStatements = Object.entries(september2026Locations).map(([osNumber, location]) =>
      env.DB.prepare(`UPDATE service_reports SET environment = ?, floor = ?
        WHERE os_number = ?
          AND (TRIM(environment) = '' OR environment = 'ED. DEPÓSITO SOROCABA (SP)'
            OR LOWER(environment) LIKE '%itens da ordem de servi%'
            OR TRIM(floor) = '' OR LOWER(floor) LIKE '%itens da ordem de servi%')`)
        .bind(location.environment, location.floor, osNumber));
    workOrderStatements.push(...transferredOrders.map((osNumber) => env.DB.prepare(`UPDATE work_orders
      SET assigned_area = 'civil', assigned_responsible = ?, status = 'Atribuída', updated_at = ?
      WHERE competence = ? AND os_number = ?`).bind(ivan, Date.now(), competence, osNumber)));

    const workOrderResults = await env.DB.batch(workOrderStatements);
    const reportResults = await env.DB.batch(reportStatements);
    const locationResultCount = Object.keys(september2026Locations).length;
    const correctedWorkOrders = workOrderResults.slice(0, locationResultCount)
      .reduce((total, result) => total + (result.meta.changes || 0), 0);
    const correctedReports = reportResults
      .reduce((total, result) => total + (result.meta.changes || 0), 0);
    const reassignedOrders = workOrderResults.slice(locationResultCount)
      .reduce((total, result) => total + (result.meta.changes || 0), 0);
    return Response.json({ correctedWorkOrders, correctedReports, reassignedOrders, reviewedOrders: Object.keys(september2026Locations).length });
  } catch (error) {
    console.error("Erro ao corrigir locais importados", error);
    return Response.json({ error: "Não foi possível corrigir os locais importados." }, { status: 500 });
  }
}
