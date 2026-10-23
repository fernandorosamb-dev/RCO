import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { meterReadings } from "../../../db/schema";
import { requireRole } from "../../auth";

export async function GET(request: Request) {
  try {
    const role=await requireRole(["supervisor","engenheiro","eletrica","hidraulica","refrigeracao","civil"]);
    if(!role)return Response.json({error:"Faça login."},{status:401});
    const month = new URL(request.url).searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const db = getDb();
    const rows = await db.select().from(meterReadings).orderBy(asc(meterReadings.readingDate));
    const relevant = rows.filter((row) => row.readingDate.startsWith(month) && ((role==="supervisor"||role==="engenheiro") || row.submittedByRole===role));
    return Response.json({ readings: relevant.map((row) => {
      const previous = [...rows].reverse().find((item) => item.readingDate < row.readingDate);
      return { ...row, createdAt: row.createdAt.toISOString(), consumption: {
        waterStreet: previous ? row.waterStreet - previous.waterStreet : null,
        waterWell: previous ? row.waterWell - previous.waterWell : null,
        electric1: previous ? row.electric1 - previous.electric1 : null,
        electric2: previous ? row.electric2 - previous.electric2 : null,
      }};
    })});
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erro ao carregar leituras." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const role=await requireRole(["supervisor","eletrica","hidraulica","refrigeracao","civil"]);
    if(!role)return Response.json({error:"Faça login."},{status:401});
    const payload = await request.json() as Record<string, string | number>;
    const readingDate = String(payload.readingDate || ""); const collaborator = String(payload.collaborator || "").trim();
    if (!readingDate || !collaborator) return Response.json({ error: "Informe a data e o colaborador." }, { status: 400 });
    const numeric = ["waterStreet", "waterWell", "electric1", "electric2"] as const;
    if (numeric.some((key) => !Number.isFinite(Number(payload[key])) || Number(payload[key]) < 0)) return Response.json({ error: "Preencha todas as leituras com valores válidos." }, { status: 400 });
    const db = getDb();
    const existing = await db.select().from(meterReadings).where(eq(meterReadings.readingDate, readingDate)).limit(1);
    if (existing.length) return Response.json({ error: "Já existe uma coleta nesta data." }, { status: 409 });
    const [saved] = await db.insert(meterReadings).values({ publicId: crypto.randomUUID(), readingDate, collaborator, submittedByRole: role, waterStreet: Number(payload.waterStreet), waterWell: Number(payload.waterWell), electric1: Number(payload.electric1), electric2: Number(payload.electric2), occurrence: String(payload.occurrence || "").trim(), createdAt: new Date() }).returning();
    return Response.json({ reading: saved }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erro ao salvar a coleta." }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try {
    const role=await requireRole(["supervisor","eletrica","hidraulica","refrigeracao","civil"]);
    if(!role)return Response.json({error:"Faça login."},{status:401});
    const payload = await request.json() as Record<string, string | number>;
    const publicId=String(payload.publicId||"");const readingDate=String(payload.readingDate||"");const collaborator=String(payload.collaborator||"").trim();
    if(!publicId||!readingDate||!collaborator)return Response.json({error:"Dados incompletos para corrigir a leitura."},{status:400});
    const numeric=["waterStreet","waterWell","electric1","electric2"] as const;
    if(numeric.some((key)=>!Number.isFinite(Number(payload[key]))||Number(payload[key])<0))return Response.json({error:"Preencha todas as leituras com valores válidos."},{status:400});
    const db=getDb();const [existing]=await db.select().from(meterReadings).where(eq(meterReadings.publicId,publicId)).limit(1);
    if(!existing)return Response.json({error:"Leitura não encontrada."},{status:404});
    if(role!=="supervisor"&&existing.submittedByRole!==role)return Response.json({error:"Você só pode corrigir leituras lançadas pela sua equipe."},{status:403});
    const [saved]=await db.update(meterReadings).set({readingDate,collaborator,waterStreet:Number(payload.waterStreet),waterWell:Number(payload.waterWell),electric1:Number(payload.electric1),electric2:Number(payload.electric2),occurrence:String(payload.occurrence||"").trim()}).where(eq(meterReadings.publicId,publicId)).returning();
    return Response.json({reading:saved});
  } catch(error){return Response.json({error:error instanceof Error?error.message:"Erro ao corrigir a coleta."},{status:500});}
}

export async function DELETE(request: Request) {
  try {
    if(!await requireRole(["supervisor"]))return Response.json({error:"Acesso restrito."},{status:403});
    if(new URL(request.url).searchParams.get("confirm")!=="all")return Response.json({error:"Confirmação obrigatória."},{status:400});
    await getDb().delete(meterReadings);
    return Response.json({deleted:true});
  } catch(error){return Response.json({error:error instanceof Error?error.message:"Erro ao limpar as leituras."},{status:500});}
}
