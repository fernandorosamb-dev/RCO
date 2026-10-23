import {env} from "cloudflare:workers";
import {requireRole} from "../../../../auth";
import {roles,isOverviewRole} from "../../../../access";
import {documentHtml} from "../../../../document-print";
import type {ServiceDocument} from "../../../../service-documents";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
 const role=await requireRole(roles);if(!role)return new Response("Faça login.",{status:401});
 try{
  const {id}=await context.params;const row=await env.DB.prepare("SELECT * FROM service_documents WHERE public_id=?").bind(id).first<Record<string,unknown>>();
  if(!row)return new Response("Documento não encontrado.",{status:404});
  if(!isOverviewRole(role)&&row.created_by_role!==role)return new Response("Acesso restrito.",{status:403});
  if(row.status!=="approved")return new Response("Aguarde a autorização do supervisor antes de imprimir.",{status:409});
  const doc={...row,data:JSON.parse(String(row.data_json))} as unknown as ServiceDocument;
  return new Response(documentHtml(doc),{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return new Response("Não foi possível gerar a impressão. Tente novamente.",{status:503});}
}
