import {requireRole} from "../../../auth";
import {rejectReport} from "../../../report-actions";
export async function POST(request:Request){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Somente o supervisor pode rejeitar OS."},{status:403});
 try{
  const {publicId}=await request.json();
  if(typeof publicId!=="string"||!/^[-a-zA-Z0-9]{1,80}$/.test(publicId))return Response.json({error:"OS inválida."},{status:400});
  const result=await rejectReport(publicId);
  return result.ok?Response.json({rejected:true,message:result.message}):Response.json({error:result.error},{status:result.status});
 }catch{return Response.json({error:"Não foi possível rejeitar a OS."},{status:500});}
}
