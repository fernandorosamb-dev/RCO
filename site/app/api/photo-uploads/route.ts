import {env} from "cloudflare:workers";
import {requireRole} from "../../auth";
export async function POST(request:Request){
 try{
  const role=await requireRole(["supervisor","eletrica","hidraulica","refrigeracao","civil"]);if(!role)return Response.json({error:"Faça login."},{status:401});
  const data=await request.formData(),file=data.get("photo");
  if(!(file instanceof File)||file.type!=="image/jpeg"||!file.size||file.size>15_000)return Response.json({error:"Atualize a página e tente novamente. O app compactará a foto automaticamente."},{status:400});
  const signature=new Uint8Array(await file.slice(0,3).arrayBuffer());if(signature[0]!==255||signature[1]!==216||signature[2]!==255)return Response.json({error:"Foto JPEG inválida."},{status:400});
  const token=crypto.randomUUID();await env.BUCKET.put(`photo-uploads/${role}/${token}.jpg`,file.stream(),{httpMetadata:{contentType:"image/jpeg"},customMetadata:{createdAt:String(Date.now())}});
  return Response.json({token},{status:201,headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Falha no envio da foto. Tente novamente."},{status:500});}
}
