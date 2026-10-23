import { cookies } from "next/headers";
import { createSession } from "../../../auth";
import { loginRole } from "../../../access";
import { verifyRolePassword } from "../../../passwords";
export async function POST(request:Request){
 const {username,password}=await request.json() as {username?:string,password?:string};
 const role=loginRole(username);
 if(!role||!password||!await verifyRolePassword(role,password))return Response.json({error:"Usuário ou senha inválidos."},{status:401});
 (await cookies()).set("os_session",await createSession(role),{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:60*60*12});
 return Response.json({role});
}
