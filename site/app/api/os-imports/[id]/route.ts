import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { osImports } from "../../../../db/schema";
import { requireRole } from "../../../auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireRole(["supervisor","engenheiro"])) return Response.json({ error: "Acesso restrito." }, { status: 403 });
  const { id } = await context.params;
  const [item] = await getDb().select().from(osImports).where(eq(osImports.publicId, id)).limit(1);
  if (!item) return new Response("Arquivo não encontrado.", { status: 404 });
  const object = await env.BUCKET.get(item.objectKey);
  if (!object) return new Response("Arquivo não encontrado.", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename=\"${item.fileName.replace(/[\"\\]/g, "")}\"` } });
}
