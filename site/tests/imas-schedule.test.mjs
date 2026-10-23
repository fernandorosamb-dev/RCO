import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/imas-schedule.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,Number,String,Math});
const {normalizeSchedule:n}=exports;
test('horário válido e longo o bastante não muda; abertura padrão 08:00',()=>{
  assert.deepEqual({...n('2026-10-08T09:00','2026-10-08T13:00')},{executionStartedAt:'2026-10-08T09:00',completedAt:'2026-10-08T13:00',imasOpenedAt:'2026-10-08T08:00'});
});
test('início antes de 08:30 sobe para 08:30 e duração mínima de 3 h',()=>{
  const r=n('2026-10-08T07:10','2026-10-08T07:50');assert.equal(r.executionStartedAt,'2026-10-08T08:30');assert.equal(r.completedAt,'2026-10-08T11:30');
});
test('fim nunca passa de 16:00 e início tardio recua para caber 3 h',()=>{
  const r=n('2026-10-08T15:00','2026-10-08T19:00');assert.equal(r.executionStartedAt,'2026-10-08T13:00');assert.equal(r.completedAt,'2026-10-08T16:00');
});
test('conclusão anterior ao início é corrigida, nunca rejeitada',()=>{
  const r=n('2026-10-08T10:00','2026-10-07T09:00');assert.equal(r.executionStartedAt,'2026-10-08T10:00');assert.equal(r.completedAt,'2026-10-08T13:00');
});
test('abertura posterior ao início é trocada por 08:00 do dia; anterior é mantida',()=>{
  assert.equal(n('2026-10-08T10:00','2026-10-08T14:00','2026-10-08T17:42').imasOpenedAt,'2026-10-08T08:00');
  assert.equal(n('2026-10-08T10:00','2026-10-08T14:00','2026-10-07T16:20').imasOpenedAt,'2026-10-07T16:20');
});
test('várias combinações respeitam sempre as três regras',()=>{
  for(let a=0;a<1440;a+=37)for(let b=0;b<1440;b+=53){const t=m=>`2026-10-08T${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    const r=n(t(a),t(b),t(a+1<1440?a+1:a));const m=x=>Number(x.slice(11,13))*60+Number(x.slice(14));
    assert.ok(m(r.executionStartedAt)>=510&&m(r.completedAt)<=960&&m(r.completedAt)-m(r.executionStartedAt)>=180);assert.ok(r.imasOpenedAt<=r.executionStartedAt);}
});
test('formato inválido é a única recusa',()=>{assert.equal(n('x','2026-10-08T10:00'),null);assert.equal(n('2026-10-08T10:00',''),null);});
test('datas impossíveis e horas inválidas não viram execução válida',()=>{
  for(const invalid of ['2026-02-30T09:00','2026-10-08T24:00','2026-10-08T09:60']){
    assert.equal(n(invalid,'2026-10-08T13:00'),null);
    assert.equal(n('2026-10-08T09:00',invalid),null);
  }
});
test('execução em dias diferentes usa o dia do início e respeita a janela',()=>{
  const r=n('2026-10-08T19:00','2026-10-09T07:00');
  assert.equal(r.executionStartedAt,'2026-10-08T13:00');
  assert.equal(r.completedAt,'2026-10-08T16:00');
});
test('conclusão futura usa o dia do envio original mesmo quando automação roda depois',()=>{const receipt='2026-10-13T12:45:00Z';const r=exports.normalizeReportSchedule('2026-10-15T13:00','2026-10-15T16:00','',receipt,new Date('2026-10-20T15:00:00Z'));assert.equal(r.completedAt,'2026-10-13T12:45');assert.ok(r.executionStartedAt<=r.completedAt);assert.ok(r.imasOpenedAt<=r.executionStartedAt);});
test('datas ausentes/impossíveis recebem data do envio e conclusão passada válida é mantida',()=>{for(const end of ['','2026-02-30T10:00']){const r=exports.normalizeReportSchedule('',end,'','2026-10-14T15:00:00Z');assert.equal(r.completedAt.slice(0,10),'2026-10-14');assert.ok(r.executionStartedAt<=r.completedAt);}const past=exports.normalizeReportSchedule('2026-10-10T09:00','2026-10-10T13:00','','2026-10-14T15:00:00Z');assert.equal(past.completedAt,'2026-10-10T13:00');});
test('nova regra mantém mínimo de 3 h no mesmo dia; madrugada usa dia de São Paulo',()=>{const r=exports.normalizeReportSchedule('2026-10-14T08:30','2026-10-14T09:00','','2026-10-14T12:15:00Z');assert.equal(r.completedAt,'2026-10-14T11:30');assert.equal(exports.normalizeReportSchedule('','','','2026-10-15T01:00:00Z').completedAt.slice(0,10),'2026-10-14');});

test('caso FBE4542E e aviso não bloqueante usam o dia 14/10',()=>{const result=n('2026-10-14T08:58','2026-10-16T09:11');assert.equal(result.executionStartedAt,'2026-10-14T08:58');assert.equal(result.completedAt,'2026-10-14T11:58');assert.match(exports.scheduleWarning('2026-10-14T08:58','2026-10-16T09:11'),/14\/10\/2026/);});
