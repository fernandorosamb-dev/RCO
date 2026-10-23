export const medicalTitles={atestado:"Atestado médico",declaracao:"Declaração de horas"} as const;
export type MedicalData={kind:keyof typeof medicalTitles;person:string;job:string;startDate:string;endDate:string;startTime:string;endTime:string;notes:string};
export type MedicalRecord={public_id:string;reference:string;data:MedicalData;email_status:string;email_error:string;created_at:number;email_sent_at:number|null};
export const medicalMailTo="bianca@rcoengenharia.com",medicalMailCc="luis.gimenes@rcoengenharia.com";
export function validateMedicalData(input:unknown):MedicalData{
 if(!input||typeof input!=="object")throw Error("Preencha os dados do documento.");
 const value=input as Record<string,unknown>;
 const field=(name:string,max=200)=>{const text=String(value[name]||"").trim();if(text.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw Error("Dados inválidos no documento.");return text;};
 const kind=field("kind");if(kind!=="atestado"&&kind!=="declaracao")throw Error("Selecione atestado ou declaração de horas.");
 const person=field("person"),job=field("job");if(person.length<3||!job)throw Error("Informe o colaborador e a função.");
 const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 const startDate=field("startDate"),endDate=field("endDate");if(!validDate(startDate)||!validDate(endDate)||endDate<startDate)throw Error("Confira as datas de início e fim.");
 let startTime=field("startTime"),endTime=field("endTime");
 if(kind==="declaracao"){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)||endDate!==startDate||endTime<=startTime)throw Error("Informe a data e o período de horas da declaração.");}else{startTime="";endTime="";}
 return {kind,person,job,startDate,endDate,startTime,endTime,notes:field("notes",600)};
}
export function medicalEmail(reference:string,data:MedicalData){
 const date=(value:string)=>value.split("-").reverse().join("/");
 const period=data.kind==="declaracao"?`${date(data.startDate)}, das ${data.startTime} às ${data.endTime}`:`${date(data.startDate)} a ${date(data.endDate)}`;
 const body=`Olá, Bianca.\n\nEncaminho em anexo ${data.kind==="atestado"?"o atestado médico":"a declaração de horas"} apresentado pelo colaborador abaixo, para registro e providências do RH.\n\nColaborador: ${data.person}\nFunção: ${data.job}\nLocal de trabalho: Depósito BB · Sorocaba · SP\nDocumento: ${medicalTitles[data.kind]}\nPeríodo informado: ${period}\nProtocolo: ${reference}${data.notes?`\nObservação do colaborador: ${data.notes}`:""}\n\nSolicito, por gentileza, a confirmação do recebimento.\n\nAtenciosamente,\nFernando da Rosa\nSupervisor de Manutenção\nRCO Engenharia`;
 return {to:medicalMailTo,cc:medicalMailCc,subject:`RCO | ${medicalTitles[data.kind]} | ${data.person.replace(/[\r\n]/g," ")} | ${date(data.startDate)} | ${reference}`,body};
}
export function medicalAttachmentType(bytes:Uint8Array):string|null{
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
 if([137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return "image/png";
 if(new TextDecoder().decode(bytes.slice(0,4))==="RIFF"&&new TextDecoder().decode(bytes.slice(8,12))==="WEBP")return "image/webp";
 if(new TextDecoder().decode(bytes.slice(0,5))==="%PDF-")return "application/pdf";
 return null;
}
export const medicalEmailStatus=(status:string)=>({sent:"E-mail enviado pelo Gmail",pending_configuration:"Pendente do Supervisor — envio ao RH aguardando liberação",pending_supervisor:"Pendente do Supervisor — envio ao RH aguardando liberação",sending:"Encaminhamento em andamento",failed:"E-mail não enviado: verificar conexão",review:"Conferir envio na caixa do supervisor"}[status]||"E-mail pendente");
