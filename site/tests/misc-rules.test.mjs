import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import ts from 'typescript';
const pure=(name,req=()=>({}))=>{const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../app/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,Date,Number,String,Math,Error,Map,JSON});return exports;};
const plan=pure('maintenance-plan'),docs=pure('service-documents'),holds=pure('supervisor-holds');
test('elétrica: nada antes de 16/10; outras áreas e OS concluídas não mudam',()=>{
  assert.equal(plan.effectiveExecutionDate('2026-10','323124','eletrica','Atribuída'),'2026-10-16');
  assert.equal(plan.effectiveExecutionDate('2026-10','999999','eletrica','Atribuída'),'2026-10-16');
  assert.equal(plan.effectiveExecutionDate('2026-10','323095','eletrica','Atribuída'),'2026-10-19');
  assert.equal(plan.effectiveExecutionDate('2026-10','323124','civil','Atribuída'),'2026-10-09');
  assert.equal(plan.effectiveExecutionDate('2026-10','323124','eletrica','Concluída'),'2026-10-09');
});
const terceiro={kind:'terceiro',person:'João Prestador',cpf:'123',job:'Técnico',company:'Empresa X',date:'2026-10-14',time:'08:00',endTime:'12:00',reason:'Manutenção do elevador',hasVehicle:true,vehicle:'Fiorino',plate:'abc1d23'};
test('entrada de terceiros exige empresa e saída; mantém veículo',()=>{
  const ok=docs.validateDocument(terceiro);assert.equal(ok.company,'Empresa X');assert.equal(ok.plate,'ABC1D23');assert.equal(ok.endTime,'12:00');assert.equal(docs.documentTitles.terceiro,'Entrada de terceiros');
  assert.throws(()=>docs.validateDocument({...terceiro,company:''}),/empresa/i);
  assert.throws(()=>docs.validateDocument({...terceiro,endTime:'07:00'}));
});
test('trava do Fabrício liberada',()=>{assert.equal(holds.requiresSupervisorReview({collaborator:'FABRICIO RODRIGO',supervisorReleased:false}),false);});
test('impressão de terceiro mostra empresa e título próprios',()=>{
  const {documentHtml}=pure('document-print');
  const html=documentHtml({reference:'PORT-1',approved_by:'SUP',data:{...docs.validateDocument(terceiro)}});
  assert.match(html,/ENTRADA DE TERCEIROS/);assert.match(html,/Empresa X/);assert.match(html,/Assinatura do terceiro/);assert.doesNotMatch(html,/RCO Engenharia<\/div>/);
});
