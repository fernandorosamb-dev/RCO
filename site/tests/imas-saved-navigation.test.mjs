import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const src=readFileSync(new URL('../tools/imas-extension/imas.js',import.meta.url),'utf8');
function setup({urlNumber='',code='323963',client='91',unit='Sorocaba'}={}){
 const fields={code:{value:code},clientCode:{value:client},unit:{value:unit}};
 const c={URL,document:{querySelectorAll:()=>[]},location:{origin:'https://admin.rcoengenharia.com',href:'https://admin.rcoengenharia.com/ordem_servico_form.php'+(urlNumber?'?id_ordem_servico='+urlNumber:'')},visible:()=>true,field:k=>fields[k],read:e=>e.value,matches:(a,b)=>a===b};vm.createContext(c);vm.runInContext(src.slice(src.indexOf('  function navigate('),src.indexOf('  function diagnostics(')),c);
 return ()=>vm.runInContext("navigate({phase:'encerrar',externalNumber:'323963',mode:'validation',saveAllowed:false,fixed:{unit:'Sorocaba'}})",c);
}
test('formulário recém-salvo sem ID na URL passa à edição do número oficial',()=>{assert.equal(setup()().url,'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323963');});
test('outra OS, outro cliente ou outra unidade não são descartados pela transição',()=>{for(const data of [{urlNumber:'323140'},{code:'323140'},{client:'1'},{unit:'Santo Amaro'}])assert.throws(setup(data),/outro formulário/);});
