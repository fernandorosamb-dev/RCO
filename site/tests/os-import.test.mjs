import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const temporary=mkdtempSync(join(tmpdir(),'rco-import-'));
for(const name of ['os-import','location-fields']){
 const source=readFileSync(new URL(`../app/${name}.ts`,import.meta.url),'utf8').replace('"./location-fields"','"./location-fields.mjs"');
 writeFileSync(join(temporary,`${name}.mjs`),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
after(()=>rmSync(temporary,{recursive:true,force:true}));
const {parseOrders,classifyOrder,equipmentKey,isSorocabaUnit}=await import(pathToFileURL(join(temporary,'os-import.mjs')));
const fixture=(number,equipment,description='Verificar funcionamento',unit='ED. DEPÓSITO SOROCABA (SP)')=>`Ordem de serviço / Chamado técnico Nº.: ${number} /\nData: 01/10/2026 00:11:40\nStatus: Aberta\nData de conclusão: 20/10/2026 00:00:00\nBB - DEPOSITO SÃO PAULO\nCPF / CNPJ: 00.000.000/0001-91\nLocal / Unidade\n${unit}\nAmbiente: / Pavimento:\nITENS DA ORDEM DE SERVIÇO\n${description}\nEQUIPAMENTOS\nEquipamento TAG Prioridade\n${equipment}\nCOLABORADORES /TÉCNICOS\nOBSERVAÇÕES\nFOTOS`;
test('lê lotes e datas com quebras de linha de PDF e FormData',()=>{
 for(const separator of ['\n','\r\n']){const {orders}=parseOrders((fixture('100001','16317Quadro elétrico da bomba de hidrante')+'\n'+fixture('100002','16384Ar condicionado AR 06')).replaceAll('\n',separator));assert.equal(orders.length,2);assert.equal(orders[0].unit,'ED. DEPÓSITO SOROCABA (SP)');assert.equal(orders[0].openedAt,'01/10/2026 00:11:40');assert.equal(orders[0].environment,'Bomba de Hidrante');assert.equal(classifyOrder(orders[0]).assignedArea,'eletrica');assert.equal(classifyOrder(orders[1]).assignedArea,'refrigeracao');}
});
test('remove duplicatas de OS no mesmo arquivo',()=>{const text=fixture('100001','16369Bebedouro');const result=parseOrders(text+'\n'+text);assert.equal(result.orders.length,1);assert.equal(result.duplicateCount,1);});
test('interrompe duplicata contraditória para revisão',()=>assert.throws(()=>parseOrders(fixture('100001','16369Bebedouro')+'\n'+fixture('100001','16384Ar condicionado')),/equipamentos diferentes/));
test('preserva atribuição aprendida do equipamento apenas na mesma unidade',()=>{const order=parseOrders(fixture('100001','99999 Equipamento especial'))["orders"][0];const history=new Map([[equipmentKey(order.unit,order.equipment),{...order,assignedArea:'civil',assignedResponsible:'Ivan corrigido'}]]);assert.equal(classifyOrder(order,history).assignedResponsible,'Ivan corrigido');assert.equal(classifyOrder({...order,unit:'Outra unidade'},history).assignedArea,'');});
test('mantém equipamentos desconhecidos e serviços com mais de um cargo para revisão',()=>{const order=parseOrders(fixture('100001','Equipamento desconhecido')).orders[0];assert.equal(classifyOrder(order).assignedArea,'');assert.equal(classifyOrder({...order,equipment:'Portão e ar condicionado'}).assignedArea,'');assert.equal(classifyOrder({...order,unit:''}).assignedArea,'');});
test('não confunde câmera de pneu com câmera de segurança',()=>{const order=parseOrders(fixture('100001','','Troca dos pneus e camera do carrinho de carga')).orders[0];assert.equal(classifyOrder(order).assignedArea,'civil');assert.equal(classifyOrder({...order,equipment:'Câmera de Segurança',description:'Verificar imagens'}).assignedArea,'eletrica');});
test('mantém exceções operacionais já estabelecidas por equipamento',()=>{for(const [equipment,area] of [['16383Detector de fumaça','hidraulica'],['16518Ventiladores','civil'],['16369Bebedouro','civil']])assert.equal(classifyOrder(parseOrders(fixture('100001',equipment)).orders[0]).assignedArea,area);});
test('reconhece somente a unidade de trabalho autorizada',()=>{assert.ok(isSorocabaUnit('ED. DEPÓSITO SOROCABA (SP)'));assert.equal(isSorocabaUnit('ED. DEPÓSITO SÃO PAULO'),false);});
