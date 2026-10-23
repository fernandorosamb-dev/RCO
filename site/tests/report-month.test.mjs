import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path,imports={}){const exports={};const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(code,{exports,require:name=>imports[name],Date,Intl});return exports;}
const dates=load('../app/order-deadlines.ts');
const {reportMonth}=load('../app/report-month.ts',{'./order-deadlines':dates});
test('OS de setembro enviada e executada em outubro permanece em setembro',()=>{
 const report={workOrder:{competence:'2026-09'},executionStartedAt:'2026-10-05T09:00',completedAt:'2026-10-05T10:00',createdAt:'2026-10-05T14:00:00Z'};
 assert.equal(reportMonth(report),'2026-09');assert.equal([report].filter(r=>reportMonth(r)==='2026-10').length,0);
});
test('competência de outubro prevalece mesmo quando envio acontece depois',()=>assert.equal(reportMonth({workOrder:{competence:'2026-10'},executionStartedAt:'2026-11-02T09:00',createdAt:'2026-11-02T14:00:00Z'}),'2026-10'));
test('OS criada no app usa execução, sem deslocar meia-noite local',()=>assert.equal(reportMonth({workOrder:null,executionStartedAt:'2026-09-30T23:50',completedAt:'2026-10-01T00:10',createdAt:'2026-10-05T14:00:00Z'}),'2026-09'));
test('legados usam conclusão ou envio em São Paulo quando não há competência válida',()=>{
 assert.equal(reportMonth({workOrder:{competence:'2026-13'},completedAt:'2026-09-30T11:00'}),'2026-09');
 assert.equal(reportMonth({createdAt:'2026-10-01T01:30:00Z'}),'2026-09');assert.equal(reportMonth({createdAt:'inválido'}),'');
});
