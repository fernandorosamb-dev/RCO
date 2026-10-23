import {env} from "cloudflare:workers";
export const IMAS_RESPONSE_TIMEOUT=30*60*1000;
export const IMAS_TIMEOUT_REASON="execução sem resposta da extensão";
/** Expira só a aprovação abandonada. Não executa, não baixa e não libera upload. */
export async function recoverStalledApprovals(now=Date.now()){
 const cutoff=now-IMAS_RESPONSE_TIMEOUT;
 const stale=await env.DB.prepare("SELECT q.report_public_id,q.request_id FROM imas_automation_requests q JOIN service_reports r ON r.public_id=q.report_public_id WHERE q.state='processing' AND q.updated_at<=? AND r.downloaded_at IS NULL AND r.status<>'Excluída' AND NOT EXISTS(SELECT 1 FROM imas_automation_runs a WHERE a.report_public_id=q.report_public_id AND a.updated_at>?)").bind(cutoff,cutoff).all<{report_public_id:string;request_id:string}>();
 for(const row of stale.results){
  const trace=JSON.stringify([{at:new Date(now).toISOString(),step:"Erro do IMAS — execução sem resposta",status:"failed",message:IMAS_TIMEOUT_REASON}]);
  await env.DB.batch([
   env.DB.prepare("UPDATE imas_automation_requests SET state='failed',updated_at=? WHERE report_public_id=? AND request_id=? AND state='processing' AND updated_at<=? AND NOT EXISTS(SELECT 1 FROM imas_automation_runs WHERE report_public_id=? AND updated_at>?) AND EXISTS(SELECT 1 FROM service_reports WHERE public_id=? AND downloaded_at IS NULL AND status<>'Excluída')").bind(now,row.report_public_id,row.request_id,cutoff,row.report_public_id,cutoff,row.report_public_id),
   env.DB.prepare("INSERT OR IGNORE INTO imas_automation_runs (run_id,report_public_id,version,state,step,trace_json,diagnostics_json,updated_at) SELECT ?,?,'app','failed','Erro do IMAS — execução sem resposta',?,'[]',? WHERE EXISTS(SELECT 1 FROM imas_automation_requests WHERE report_public_id=? AND request_id=? AND state='failed' AND updated_at=?)").bind('timeout-'+row.request_id,row.report_public_id,trace,now,row.report_public_id,row.request_id,now),
  ]);
 }
}
