import { env } from "cloudflare:workers";
import { requireRole } from "../../../auth";

export async function PATCH(request: Request) {
  const role = await requireRole(["supervisor"]);
  if (role !== "supervisor") return Response.json({ error: "Apenas o Supervisor pode recuperar uma OS." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { osNumber?: string };
  const osNumber = String(body.osNumber || "").trim();
  if (!/^\d+$/.test(osNumber)) return Response.json({ error: "Informe um número de OS válido." }, { status: 400 });
  const report = await env.DB.prepare("SELECT public_id FROM service_reports WHERE os_number = ? AND downloaded_at IS NOT NULL ORDER BY downloaded_at DESC LIMIT 1").bind(osNumber).first<{ public_id: string }>();
  if (!report) return Response.json({ error: `A OS ${osNumber} não foi encontrada entre as baixadas.` }, { status: 404 });
  await env.DB.prepare("UPDATE service_reports SET downloaded_at = NULL WHERE public_id = ?").bind(report.public_id).run();
  return Response.json({ restored: true, osNumber });
}
