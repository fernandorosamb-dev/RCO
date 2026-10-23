import {env} from "cloudflare:workers";
import {requireRole} from "../../../auth";
import {cleanDiagnostic} from "../../../imas-diagnostics";
export async function POST(request:Request) {
  if(await requireRole(["supervisor"])!=="supervisor")return Response.json({error:"Apenas Supervisor."},{status:403});
  if(Number(request.headers.get("content-length")||0)>100000)return Response.json({error:"Diagnóstico muito grande."},{status:413});
  try {
    const raw=await request.text();if(raw.length>100000)return Response.json({error:"Diagnóstico muito grande."},{status:413});
    const run=cleanDiagnostic(JSON.parse(raw));
    const exists=await env.DB.prepare("SELECT public_id FROM service_reports WHERE public_id=?").bind(run.publicId).first();
    if(!exists)return Response.json({error:"OS não encontrada."},{status:404});
    await env.DB.prepare("INSERT INTO imas_automation_runs (run_id,report_public_id,version,state,step,trace_json,diagnostics_json,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET state=excluded.state,step=excluded.step,trace_json=excluded.trace_json,diagnostics_json=excluded.diagnostics_json,updated_at=excluded.updated_at WHERE imas_automation_runs.report_public_id=excluded.report_public_id").bind(run.runId,run.publicId,run.version,run.state,run.step,JSON.stringify(run.events),JSON.stringify(run.controls),Date.now()).run();
    if(run.state==="completed"||run.state==="failed")await env.DB.prepare("UPDATE imas_automation_requests SET state=?,updated_at=? WHERE report_public_id=? AND state='processing'").bind(run.state,Date.now(),run.publicId).run();
    await env.DB.prepare("DELETE FROM imas_automation_runs WHERE run_id IN (SELECT run_id FROM imas_automation_runs ORDER BY updated_at DESC LIMIT -1 OFFSET 100)").run();
    return Response.json({received:true});
  }catch{return Response.json({error:"Não foi possível registrar o diagnóstico."},{status:400});}
}
export async function GET(request:Request) {
  if(!await requireRole(["supervisor","engenheiro"]))return Response.json({error:"Apenas Supervisor."},{status:403});
  const url=new URL(request.url);const id=url.searchParams.get("publicId");
  if(url.searchParams.get("review")==="1"){
    const rows=await env.DB.prepare("SELECT a.report_public_id, a.state, a.step FROM imas_automation_runs a JOIN service_reports r ON r.public_id=a.report_public_id WHERE r.downloaded_at IS NULL AND r.status<>'Excluída' AND a.state<>'completed' AND NOT EXISTS (SELECT 1 FROM imas_automation_runs newer WHERE newer.report_public_id=a.report_public_id AND (newer.updated_at>a.updated_at OR (newer.updated_at=a.updated_at AND newer.run_id>a.run_id)))").all();
    return Response.json({reviews:rows.results},{headers:{"Cache-Control":"no-store"}});
  }
  const query=id?"SELECT * FROM imas_automation_runs WHERE report_public_id=? ORDER BY updated_at DESC LIMIT 5":"SELECT * FROM imas_automation_runs ORDER BY updated_at DESC LIMIT 10";
  const statement=env.DB.prepare(query);const result=await(id?statement.bind(id):statement).all<Record<string,unknown>>();
  return Response.json({runs:result.results.map(r=>({runId:r.run_id,publicId:r.report_public_id,version:r.version,state:r.state,step:r.step,updatedAt:r.updated_at,events:JSON.parse(String(r.trace_json)),controls:JSON.parse(String(r.diagnostics_json))}))},{headers:{"Cache-Control":"no-store"}});
}
