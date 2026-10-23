import { getRole } from "../../../auth";
export async function GET(){const role=await getRole();return role?Response.json({role}):Response.json({error:"Não autenticado."},{status:401});}
