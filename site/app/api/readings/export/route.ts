import { asc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { meterReadings } from "../../../../db/schema";
import { requireRole } from "../../../auth";

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
export async function GET(request: Request) {
  if(!await requireRole(["supervisor","engenheiro"]))return new Response("Acesso restrito.",{status:403});
  const month = new URL(request.url).searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const db = getDb(); const all = await db.select().from(meterReadings).orderBy(asc(meterReadings.readingDate));
  const rows = all.filter((row) => row.readingDate.startsWith(month));
  const header = ["Data","Relógio água rua","Consumo diário","Relógio água poço","Consumo diário","Relógio elétrico 1 - Geral","Consumo diário 1","Relógio elétrico 2 - Sistema de incêndio","Consumo diário 2","Ocorrência / conferência"];
  const lines = [header.map(csvCell).join(";")];
  for (const row of rows) {
    const previous = [...all].reverse().find((item) => item.readingDate < row.readingDate);
    lines.push([row.readingDate,row.waterStreet,previous ? row.waterStreet-previous.waterStreet : "",row.waterWell,previous ? row.waterWell-previous.waterWell : "",row.electric1,previous ? row.electric1-previous.electric1 : "",row.electric2,previous ? row.electric2-previous.electric2 : "",row.occurrence].map(csvCell).join(";"));
  }
  return new Response("\ufeff" + lines.join("\r\n"), { headers: { "Content-Type":"text/csv; charset=utf-8", "Content-Disposition":`attachment; filename="Coleta-Agua-Luz-${month}.csv"` } });
}
