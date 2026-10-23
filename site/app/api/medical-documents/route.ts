import {env} from "cloudflare:workers";
import {requireRole} from "../../auth";
import {roles,isOverviewRole} from "../../access";
import {documentStaff} from "../../document-staff";
import {validateMedicalData,medicalAttachmentType,medicalEmail} from "../../medical-documents";
import {gmailConfigured,deliverMedicalEmail} from "../../medical-mail";
const headers={"Cache-Control":"private, no-store"};
function publicRecord(row:Record<string,unknown>){const data=JSON.parse(String(row.data_json));return {public_id:row.public_id,reference:row.reference,data,email_status:row.email_status,email_error:row.email_error,created_at:row.created_at,email_sent_at:row.email_sent_at,email:medicalEmail(String(row.reference),data)};}
export async function GET(){
 const role=await requireRole(roles);if(!role)return Response.json({error:"Faça login."},{status:401});
 const rows=await (isOverviewRole(role)?env.DB.prepare("SELECT * FROM medical_documents ORDER BY created_at DESC LIMIT 200"):env.DB.prepare("SELECT * FROM medical_documents WHERE created_by_role=? ORDER BY created_at DESC LIMIT 200").bind(role)).all<Record<string,unknown>>();
 return Response.json({documents:rows.results.map(publicRecord),staff:documentStaff.filter(person=>isOverviewRole(role)||person.area===role).map(({name,job})=>({name,job})),mailConfigured:Boolean(gmailConfigured())},{headers});
}
export async function POST(request:Request){
 const role=await requireRole(["supervisor","eletrica","hidraulica","refrigeracao","civil"]);if(!role)return Response.json({error:"Você não pode enviar documentos neste perfil."},{status:403});
 let objectKey="",inserted=false;
 try{
  if(Number(request.headers.get("Content-Length")||0)>11*1024*1024)throw Error("Anexo muito grande. Limite: 10 MB.");
  const form=await request.formData(),token=String(form.get("submissionToken")||"");if(!/^[a-f0-9-]{36}$/i.test(token))throw Error("Atualize o formulário antes de enviar.");
  const existing=await env.DB.prepare("SELECT * FROM medical_documents WHERE submission_token=?").bind(token).first<Record<string,unknown>>();
  if(existing){if(existing.created_by_role!==role)return Response.json({error:"Solicitação inválida."},{status:403});return Response.json({document:publicRecord(existing),duplicate:true},{headers});}
  const data=validateMedicalData(JSON.parse(String(form.get("data")||"{}")));
  const staff=documentStaff.filter(person=>person.area===role);if(role!=="supervisor"&&staff.length&&!staff.some(person=>person.name===data.person&&person.job===data.job))throw Error("Selecione o colaborador e a função cadastrados para seu perfil.");
  const file=form.get("attachment");if(!(file instanceof File)||!file.size||file.size>10*1024*1024)throw Error("Anexe a foto ou PDF legível do documento, com até 10 MB.");
  const type=medicalAttachmentType(new Uint8Array(await file.slice(0,12).arrayBuffer()));if(!type||type!==file.type)throw Error("Use uma foto JPEG, PNG, WebP ou um PDF válido.");
  const id=crypto.randomUUID(),now=Date.now(),reference=`RH-${new Date(now).toISOString().slice(0,10).replaceAll("-","")}-${id.slice(0,8).toUpperCase()}`;
  const extension={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"}[type];const fileName=`${reference}.${extension}`;objectKey=`medical-documents/${id}/${fileName}`;
  await env.BUCKET.put(objectKey,file.stream(),{httpMetadata:{contentType:type}});
  const result=await env.DB.prepare("INSERT OR IGNORE INTO medical_documents (public_id,reference,submission_token,created_by_role,data_json,object_key,content_type,file_name,file_size,email_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'pending_supervisor',?,?)").bind(id,reference,token,role,JSON.stringify(data),objectKey,type,fileName,file.size,now,now).run();
  if(!result.meta.changes){await env.BUCKET.delete(objectKey);objectKey="";const duplicate=await env.DB.prepare("SELECT * FROM medical_documents WHERE submission_token=? AND created_by_role=?").bind(token,role).first<Record<string,unknown>>();if(!duplicate)throw Error("Não foi possível confirmar o recebimento. Tente novamente.");return Response.json({document:publicRecord(duplicate),duplicate:true},{headers});}
  inserted=true;
  try{await deliverMedicalEmail(id);}catch{/* Documento recebido; confirmação do e-mail permanece pendente. */}
  const row=await env.DB.prepare("SELECT * FROM medical_documents WHERE public_id=?").bind(id).first<Record<string,unknown>>();return Response.json({document:publicRecord(row!)},{status:201,headers});
 }catch(error){if(objectKey&&!inserted)await env.BUCKET.delete(objectKey);return Response.json({error:error instanceof Error?error.message:"Falha no envio. Seus dados foram mantidos."},{status:400,headers});}
}
export async function PATCH(request:Request){
 if(!await requireRole(["supervisor"]))return Response.json({error:"Somente o supervisor pode encaminhar e-mails pendentes."},{status:403});
 const {publicId}=await request.json();if(typeof publicId!=="string"||!/^[a-f0-9-]{36}$/i.test(publicId))return Response.json({error:"Documento inválido."},{status:400});
 if(!gmailConfigured())return Response.json({error:"Conecte a caixa Gmail do supervisor para habilitar o envio automático."},{status:409});
 await deliverMedicalEmail(publicId);const row=await env.DB.prepare("SELECT * FROM medical_documents WHERE public_id=?").bind(publicId).first<Record<string,unknown>>();if(!row)return Response.json({error:"Documento não encontrado."},{status:404});return Response.json({document:publicRecord(row)},{headers});
}
