import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import ts from 'typescript';
const compile=f=>ts.transpileModule(readFileSync(new URL('../app/'+f+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const policy={};vm.runInNewContext(compile('photo-policy'),{exports:policy});const holds={};vm.runInNewContext(compile('supervisor-holds'),{exports:holds,Date});const exports={};vm.runInNewContext(compile('review-reports'),{exports,require:n=>n.includes('supervisor-holds')?holds:policy});
test('revisão une falha IMAS e fotos pendentes sem duplicar OS nem incluir OS normais',()=>{const reports=[{publicId:'both',photos:Array(6).fill({})},{publicId:'imas',photos:[{}]},{publicId:'reduced',photos:[{}],photoApprovalStatus:'pending'},{publicId:'normal',photos:[{}]},{publicId:'done',photos:Array(6).fill({}),photoApprovalStatus:'approved'}];const rows=exports.reviewReports(reports,[{report_public_id:'both',state:'failed',step:'Salvar'},{report_public_id:'imas',state:'review',step:'Conferir'},{report_public_id:'normal',state:'running',step:'Executar'},{report_public_id:'done',state:'completed',step:'Pronto'}]);assert.deepEqual(Array.from(rows,r=>r.report.publicId),['both','imas','reduced']);assert.equal(rows[0].photos,true);assert.equal(rows[0].imas,true);});

test('OS aprovada (na fila ou processando) sai da revisão mesmo com falha antiga; devolvida e fotos pendentes continuam',()=>{
  const reports=[{publicId:'ok',photos:[{}],automationState:'queued',collaborator:'X'},{publicId:'proc',photos:[{}],automationState:'processing',collaborator:'X'},{publicId:'dev',photos:[{}],automationState:'queued',status:'Devolvida',collaborator:'X'},{publicId:'fotos',photos:Array(6).fill({}),automationState:'changed',collaborator:'X'},{publicId:'falhou',photos:[{}],automationState:'failed',collaborator:'X'}];
  const runs=reports.map(r=>({report_public_id:r.publicId,state:'failed',step:'Salvar'}));
  assert.deepEqual(Array.from(exports.reviewReports(reports,runs),r=>r.report.publicId),['dev','fotos','falhou']);
});

test('fila e processamento prevalecem sobre evidência antiga; conclusão não volta à revisão',()=>{
 for(const automationState of ['queued','processing','completed']){
  const r={publicId:automationState,photos:Array(6).fill({}),photoApprovalStatus:'pending',automationState,collaborator:'X'};
  assert.equal(exports.isReviewReport(r,true),false);
  assert.equal(exports.reviewReports([r],[{report_public_id:r.publicId,state:'failed',step:'Antigo'}]).length,0);
 }
 assert.equal(exports.isReviewReport({photos:[{}],automationState:'failed'},true),true);
});

test('aprovação mantida separa erro técnico e timeout da revisão de conteúdo; baixada nunca retorna',()=>{
 for(const state of ['failed','completed','review'])assert.equal(exports.isReviewReport({status:'Concluída',automationState:state,supervisorReleased:true,photos:[{}]},true),false);
 assert.equal(exports.isReviewReport({status:'Concluída',automationState:'failed',supervisorReleased:false,photos:[{}]},true),true);
 assert.equal(exports.isReviewReport({status:'Concluída',downloadedAt:'2026-10-21',photos:Array(6).fill({})},true),false);
 for(const status of ['Aguardando criação','Aguardando execução'])assert.equal(exports.isReviewReport({status,photos:[]},true),false);
});
