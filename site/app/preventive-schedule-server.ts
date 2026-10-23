import {env} from "cloudflare:workers";
import {effectiveExecutionDate} from "./maintenance-plan";
export async function plannedDateForOrder(id:string){
 const row=await env.DB.prepare("SELECT w.competence,w.os_number,w.assigned_area,w.status,w.due_at,s.execution_date FROM work_orders w LEFT JOIN work_order_schedule s ON s.work_order_public_id=w.public_id WHERE w.public_id=?").bind(id).first<{competence:string;os_number:string;assigned_area:string;status:string;due_at:string;execution_date:string|null}>();
 return row?{planned:row.execution_date||effectiveExecutionDate(row.competence,row.os_number,row.assigned_area,row.status)||row.due_at,competence:row.competence}:null;
}
