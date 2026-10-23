import { getRole, type Role } from "../../../auth";
import { saveRolePassword, verifyRolePassword } from "../../../passwords";

const roles: Role[] = ["supervisor", "engenheiro", "eletrica", "hidraulica", "refrigeracao", "civil"];

export async function POST(request: Request) {
  try {
    const sessionRole = await getRole();
    if (sessionRole === "engenheiro") return Response.json({ error: "Este acesso é somente para consulta." }, { status: 403 });
    if (!sessionRole) return Response.json({ error: "Faça login novamente." }, { status: 401 });
    const body = await request.json() as { currentPassword?: string; newPassword?: string; targetRole?: string };
    const targetRole = roles.includes(body.targetRole as Role) ? body.targetRole as Role : sessionRole;
    if (sessionRole !== "supervisor" && targetRole !== sessionRole) return Response.json({ error: "Você só pode alterar a senha do seu acesso." }, { status: 403 });
    if (!body.currentPassword || !await verifyRolePassword(sessionRole, body.currentPassword)) return Response.json({ error: "A senha atual está incorreta." }, { status: 400 });
    if (!body.newPassword || body.newPassword.length < 8 || body.newPassword.length > 128) return Response.json({ error: "A nova senha deve ter entre 8 e 128 caracteres." }, { status: 400 });
    if (body.newPassword === body.currentPassword && targetRole === sessionRole) return Response.json({ error: "Escolha uma senha diferente da atual." }, { status: 400 });
    await saveRolePassword(targetRole, body.newPassword);
    return Response.json({ ok: true, targetRole });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível alterar a senha." }, { status: 500 });
  }
}
