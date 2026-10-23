import { requireRole } from "../../../auth";
import { IMAS_CONTRACT } from "../../../imas-contract";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  if (await requireRole(["supervisor"]) !== "supervisor") {
    return Response.json({ error: "Entre como Supervisor para consultar o contrato IMAS." }, { status: 403, headers });
  }
  return Response.json(IMAS_CONTRACT, { headers });
}
