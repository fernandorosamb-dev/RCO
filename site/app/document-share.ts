import {documentTitles,type ServiceDocument} from "./service-documents";
const W=1240,H=1754,M=90;
function wrap(ctx:CanvasRenderingContext2D,text:string,width:number){const lines:string[]=[];for(const part of text.split("\n")){let line="";for(const word of part.split(" ")){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>width&&line){lines.push(line);line=word;}else line=test;}lines.push(line);}return lines;}
async function logo(){return new Promise<HTMLImageElement|null>(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src="/rco-logo.png";});}
export async function documentImage(doc:ServiceDocument):Promise<Blob>{
 const d=doc.data,date=d.date.split("-").reverse().join("/"),third=d.kind==="terceiro";
 const canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;const ctx=canvas.getContext("2d")!;
 ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);ctx.fillStyle="#202328";ctx.textBaseline="top";
 const img=await logo();if(img)ctx.drawImage(img,M,70,260,90);
 ctx.font="22px Arial";ctx.textAlign="right";ctx.fillStyle="#555";ctx.fillText("CONTROLE DE ACESSO - PORTARIA",W-M,80);ctx.fillText(doc.reference,W-M,110);ctx.fillText("Uso interno",W-M,140);
 ctx.fillStyle="#ee792d";ctx.fillRect(M,175,W-2*M,5);
 ctx.textAlign="center";ctx.fillStyle="#202328";ctx.font="bold 36px Arial";let y=215;
 for(const line of wrap(ctx,documentTitles[d.kind].toUpperCase(),W-2*M)){ctx.fillText(line,W/2,y);y+=46;}
 ctx.font="bold 26px Arial";ctx.fillText("DEPÓSITO DO BANCO DO BRASIL - SOROCABA/SP",W/2,y+10);y+=70;
 ctx.textAlign="left";ctx.font="28px Arial";
 const rows:[string,string][]=[[third?"Terceiro":"Colaborador",d.person],["CPF",d.cpf],["Função",d.job],["Empresa",third?(d.company||""):"RCO Engenharia"],["Data",date],["Horário",d.time+((d.kind==="entrada"||third)&&d.endTime?` às ${d.endTime}`:"")]];
 if(d.kind==="saida")rows.push(["Retorno",d.returns?`Retornará às ${d.returnTime}`:"Não retornará neste dia"]);
 if(d.kind==="entrada"||third)rows.push(["Veículo",d.hasVehicle?`${d.vehicle} · placa ${d.plate}`:"Sem veículo"]);
 rows.push([d.kind==="entrada"||third?"Finalidade":"Motivo",d.reason]);
 for(const [label,value] of rows){ctx.fillStyle="#555";ctx.font="bold 22px Arial";ctx.fillText(label.toUpperCase(),M,y);y+=30;ctx.fillStyle="#202328";ctx.font="28px Arial";for(const line of wrap(ctx,value||"-",W-2*M)){ctx.fillText(line,M,y);y+=36;}y+=14;ctx.fillStyle="#ccc";ctx.fillRect(M,y,W-2*M,2);y+=16;}
 ctx.fillStyle="#555";ctx.font="22px Arial";for(const line of wrap(ctx,"O acesso deverá observar as normas internas de segurança e identificação do local. Esta autorização não substitui o registro de ponto.",W-2*M)){ctx.fillText(line,M,y);y+=30;}
 const sy=Math.max(y+80,H-420),stamp=new Date(Number(doc.updated_at)||Date.now()).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"});
 ctx.textAlign="center";ctx.fillStyle="#1a3a7a";ctx.font="italic 44px Georgia";ctx.fillText("Fernando da Rosa",W/2,sy);
 ctx.font="22px Arial";ctx.fillText(`Assinado eletronicamente em ${stamp}`,W/2,sy+60);ctx.fillText(doc.reference,W/2,sy+90);
 ctx.fillStyle="#333";ctx.fillRect(W/2-250,sy+130,500,2);ctx.font="24px Arial";ctx.fillText("Fernando da Rosa · Supervisor de Manutenção",W/2,sy+142);
 ctx.fillStyle="#666";ctx.font="20px Arial";ctx.fillText(`Autorização registrada por ${doc.approved_by}.`,W/2,H-70);
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Não foi possível gerar a imagem.")),"image/png"));
}
export async function sendToGate(doc:ServiceDocument):Promise<"shared"|"downloaded"|"cancelled">{
 const blob=await documentImage(doc),name=`${doc.reference}.png`,file=new File([blob],name,{type:"image/png"});
 const text=`${documentTitles[doc.kind]} - ${doc.data.person} - ${doc.data.date.split("-").reverse().join("/")} ${doc.data.time}`;
 if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],text,title:doc.reference});return "shared";}catch(e){if((e as Error).name==="AbortError")return "cancelled";}}
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);return "downloaded";
}
