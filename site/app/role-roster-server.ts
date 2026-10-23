import {env} from "cloudflare:workers";
import {mergeRoster} from "./role-roster";
export async function readRoleRoster(){
 const rows=await env.DB.prepare("SELECT area,name,imas_name,revision FROM role_responsibles").all<{area:string;name:string;imas_name:string;revision:number}>();
 return mergeRoster(rows.results);
}
