import {env} from "cloudflare:workers";
import {medicalEmail,type MedicalData} from "./medical-documents";
const settings=()=>env as unknown as Record<string,unknown>;
export function gmailConfigured(){const config=settings();return config.RCO_MEDICAL_EMAIL_ENABLED==="true"&&config.RCO_MEDICAL_EMAIL_MODE==="api"&&["RCO_GMAIL_CLIENT_ID","RCO_GMAIL_CLIENT_SECRET","RCO_GMAIL_REFRESH_TOKEN","RCO_GMAIL_FROM"].every(key=>typeof config[key]==="string"&&String(config[key]).trim());}
function base64(bytes:Uint8Array){let value="";for(let offset=0;offset<bytes.length;offset+=8192)value+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(value);}
export function gmailMime(reference:string,data:MedicalData,from:string,attachment:Uint8Array,contentType:string,fileName:string){
 if(!/^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/.test(from))throw Error("Remetente Gmail inválido.");
 const mail=medicalEmail(reference,data),boundary=`rco-${reference}`;
 const encoded=(value:string)=>base64(new TextEncoder().encode(value));
 const wrap=(value:string)=>value.match(/.{1,76}/g)?.join("\r\n")||"";
 const mime=[`From: ${from}`,`To: ${mail.to}`,`Cc: ${mail.cc}`,`Subject: =?UTF-8?B?${encoded(mail.subject)}?=`,`Message-ID: <${reference.toLowerCase()}@rco-manutencao.fernandorosa-mb.chatgpt.site>`,"MIME-Version: 1.0",`Content-Type: multipart/mixed; boundary="${boundary}"`,"",`--${boundary}`,"Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",wrap(encoded(mail.body)),`--${boundary}`,`Content-Type: ${contentType}`,`Content-Disposition: attachment; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g,"_")}"`,"Content-Transfer-Encoding: base64","",wrap(base64(attachment)),`--${boundary}--`,""].join("\r\n");
 return encoded(mime).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export async function deliverMedicalEmail(publicId:string){
 if(!gmailConfigured())return;
 const claimed=await env.DB.prepare("UPDATE medical_documents SET email_status='sending',email_error='',updated_at=? WHERE public_id=? AND email_status IN ('pending_configuration','pending_supervisor','failed')").bind(Date.now(),publicId).run();
 if(!claimed.meta.changes)return;
 let sendStarted=false;
 try{
  const row=await env.DB.prepare("SELECT * FROM medical_documents WHERE public_id=?").bind(publicId).first<Record<string,unknown>>();if(!row)throw Error("Documento não localizado.");
  const config=settings();
  const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:String(config.RCO_GMAIL_CLIENT_ID),client_secret:String(config.RCO_GMAIL_CLIENT_SECRET),refresh_token:String(config.RCO_GMAIL_REFRESH_TOKEN),grant_type:"refresh_token"}),signal:AbortSignal.timeout(15000)});
  const token=await tokenResponse.json() as {access_token?:string};if(!tokenResponse.ok||!token.access_token)throw Error("Conecte novamente o Gmail do supervisor.");
  const attachment=await env.BUCKET.get(String(row.object_key));if(!attachment)throw Error("Anexo indisponível. Verifique o documento.");
  const raw=gmailMime(String(row.reference),JSON.parse(String(row.data_json)),String(config.RCO_GMAIL_FROM),new Uint8Array(await attachment.arrayBuffer()),String(row.content_type),String(row.file_name));
  sendStarted=true;
  const response=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{Authorization:`Bearer ${token.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({raw}),signal:AbortSignal.timeout(25000)});
  if(!response.ok){if([400,401,403,404].includes(response.status))sendStarted=false;throw Error("Não foi possível confirmar o envio pelo Gmail.");}
  const result=await response.json() as {id?:string};if(!result.id)throw Error("Gmail não confirmou o identificador do envio.");
  await env.DB.prepare("UPDATE medical_documents SET email_status='sent',gmail_message_id=?,email_sent_at=?,email_error='',updated_at=? WHERE public_id=? AND email_status='sending'").bind(result.id,Date.now(),Date.now(),publicId).run();
 }catch{
  // Depois de iniciar o envio, a dúvida exige conferência, nunca reenvio automático.
  await env.DB.prepare("UPDATE medical_documents SET email_status=?,email_error=?,updated_at=? WHERE public_id=? AND email_status='sending'").bind(sendStarted?"review":"failed",sendStarted?"Confira em Enviados no Gmail antes de qualquer reenvio.":"Não enviado. Verifique a conexão Gmail ou o anexo.",Date.now(),publicId).run();
 }
}
