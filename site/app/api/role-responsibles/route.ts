import {env} from "cloudflare:workers";
import {requireRole} from "../../auth";
import {readRoleRoster} from "../../role-roster-server";
import {ROSTER_AREAS} from "../../role-roster";
export async function GET(){
 if(!await requireRole([...ROSTER_AREAS,"engenheiro"]))return Response.json({error:"Faça login."},{status:401});
 try{return Response.json({responsibles:await readRoleRoster()},{headers:{"Cache-Control":"private, no-store"}});}catch{return Response.json({error:"Não foi possível carregar os responsáveis."},{status:503});}
}
export async function PUT(request:Request){
 if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Somente o Supervisor pode alterar responsáveis."},{status:403});
 try{
  const body=await request.json(),area=String(body.area||""),name=String(body.name||"").trim(),imasName=String(body.imasName||"").trim(),revision=Number(body.revision);
  if(!ROSTER_AREAS.includes(area as typeof ROSTER_AREAS[number])||!name||name.length>160||imasName.length>300||/[\r\n]/.test(name+imasName)||!Number.isInteger(revision)||revision<0)return Response.json({error:"Confira cargo e nome do responsável."},{status:400});
  const now=Date.now(),changeId=crypto.randomUUID();
  const previous=(await readRoleRoster()).find(p=>p.area===area)!;
  if(previous.revision!==revision)return Response.json({error:"O cadastro mudou. Atualize antes de salvar."},{status:409});
  const operations=[
   env.DB.prepare("INSERT INTO role_responsibles(area,name,imas_name,revision,change_id,updated_at) VALUES (?,?,?,1,?,?) ON CONFLICT(area) DO UPDATE SET name=excluded.name,imas_name=excluded.imas_name,revision=role_responsibles.revision+1,change_id=excluded.change_id,updated_at=excluded.updated_at WHERE role_responsibles.revision=?").bind(area,name,imasName,changeId,now,revision),
   env.DB.prepare("INSERT INTO role_responsible_history(public_id,area,previous_name,previous_imas_name,name,imas_name,revision,changed_by_role,created_at) SELECT ?,?,?,?,?,?,revision,'supervisor',? FROM role_responsibles WHERE area=? AND change_id=?").bind(changeId,area,previous.name,previous.imasName,name,imasName,now,area,changeId),
  ];
  const results=await env.DB.batch(operations);
  if(!results[0].meta.changes||!results[1].meta.changes)return Response.json({error:"O cadastro mudou. Atualize antes de salvar."},{status:409});
  return Response.json({saved:true,responsibles:await readRoleRoster(),message:"Responsável do cargo atualizado. Relatórios executados e baixas foram preservados."});
 }catch{return Response.json({error:"Não foi possível salvar o responsável."},{status:500});}
}
