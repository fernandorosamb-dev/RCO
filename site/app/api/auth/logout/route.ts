import { cookies } from "next/headers";
export async function POST(){(await cookies()).delete("os_session");return Response.json({ok:true});}
