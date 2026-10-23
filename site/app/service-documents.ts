export type DocumentKind = "saida" | "entrada" | "atraso" | "terceiro";
export type DocumentData = { kind:DocumentKind; person:string; cpf:string; job:string; date:string; time:string; endTime:string; returns:boolean; returnTime:string; reason:string; hasVehicle:boolean; vehicle:string; plate:string; company?:string };
export type StaffMember = {name:string;cpf:string;job:string;area:string;entry:string;exit:string};
export type ServiceDocument = {public_id:string;reference:string;created_by_role:string;kind:DocumentKind;data:DocumentData;status:string;approved_by:string;created_at:number;updated_at:number};
export const documentTitles:Record<DocumentKind,string> = {saida:"Saída durante o expediente",entrada:"Entrada para trabalho",atraso:"Chegada mais tarde",terceiro:"Entrada de terceiros"};
export function validateDocument(raw:unknown):DocumentData {
 if(!raw||typeof raw!=="object")throw Error("Preencha os dados do documento.");
 const value=raw as Record<string,unknown>;
 const text=(key:string,max=300)=>String(value[key]??"").trim().slice(0,max);
 const kind=text("kind") as DocumentKind;
 if(!["saida","entrada","atraso","terceiro"].includes(kind))throw Error("Selecione o tipo do documento.");
 const data:DocumentData={kind,person:text("person"),cpf:text("cpf",25),job:text("job"),date:text("date",10),time:text("time",5),endTime:text("endTime",5),returns:value.returns===true,returnTime:text("returnTime",5),reason:text("reason",600),hasVehicle:value.hasVehicle===true,vehicle:text("vehicle",120),plate:text("plate",12).toUpperCase()};
 if(kind==="terceiro")data.company=text("company");
 const validTime=(time:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(time);
 if(!data.person||!data.cpf||!data.job||!data.reason)throw Error("Informe colaborador, CPF, função e motivo/finalidade.");
 if(kind==="terceiro"&&!data.company)throw Error("Informe a empresa do terceiro.");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||new Date(data.date+"T12:00:00Z").toISOString().slice(0,10)!==data.date)throw Error("Informe uma data válida.");
 if(!validTime(data.time))throw Error("Informe o horário previsto.");
 if(kind==="saida"&&data.returns&&(!validTime(data.returnTime)||data.returnTime<=data.time))throw Error("O retorno deve ser depois da saída, no mesmo dia.");
 if((kind==="entrada"||kind==="terceiro")&&(!validTime(data.endTime)||data.endTime<=data.time))throw Error("Informe a saída prevista após a entrada, no mesmo dia.");
 if((kind==="entrada"||kind==="terceiro")&&data.hasVehicle&&(!data.vehicle||!data.plate))throw Error("Informe o veículo e a placa.");
 if((kind!=="entrada"&&kind!=="terceiro")||!data.hasVehicle){data.hasVehicle=false;data.vehicle="";data.plate="";}
 if(kind!=="saida"||!data.returns){data.returns=false;data.returnTime="";}
 if(kind!=="entrada"&&kind!=="terceiro")data.endTime="";
 return data;
}
