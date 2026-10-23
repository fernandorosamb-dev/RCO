import { cookies } from "next/headers";
import { env } from "cloudflare:workers";

import { roles, type Role } from "./access";
export type { Role } from "./access";
const encoder = new TextEncoder();
const b64 = (bytes:Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
async function signature(payload:string){
  const secret=String((env as unknown as Record<string,unknown>).SESSION_SECRET||"");
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(payload))));
}
export async function createSession(role:Role){const payload=b64(encoder.encode(JSON.stringify({role,exp:Date.now()+1000*60*60*12})));return `${payload}.${await signature(payload)}`;}
export async function getRole():Promise<Role|null>{
  const token=(await cookies()).get("os_session")?.value;if(!token)return null;
  const [payload,sig]=token.split(".");if(!payload||!sig||await signature(payload)!==sig)return null;
  try{const json=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0))));return json.exp>Date.now()&&roles.includes(json.role)?json.role:null;}catch{return null;}
}
export async function requireRole(allowed:Role[]){const role=await getRole();return role&&allowed.includes(role)?role:null;}
