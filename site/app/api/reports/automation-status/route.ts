import {requireRole} from "../../../auth";
import {readAutomationFeedback} from "../../../automation-feedback-server";
export async function GET(){
 if(!await requireRole(["supervisor","engenheiro"]))return Response.json({error:"Acesso restrito."},{status:403});
 try{return Response.json({statuses:await readAutomationFeedback()},{headers:{"Cache-Control":"private, no-store"}});}catch{return Response.json({error:"Não foi possível consultar o andamento da automação."},{status:503});}
}
