import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const src=readFileSync(new URL('../tools/imas-extension/background.js',import.meta.url),'utf8'),code=src.slice(src.indexOf('function confirmCreationSuccess('),src.indexOf('async function createAndSave('));
function setup(text='× Sucesso Registro gravado! OK',copies=1){let clicks=0;const panel={tagName:'DIV',innerText:text,dataset:{},parentElement:null},buttons=Array.from({length:copies},()=>({tagName:'INPUT',value:'OK',offsetWidth:20,offsetHeight:20,getClientRects:()=>[],parentElement:panel,scrollIntoView(){},focus(){},click(){clicks++;}}));const c={URL,location:{origin:'https://admin.rcoengenharia.com',pathname:'/ordem_servico_form.php',href:'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323140'},document:{querySelectorAll:()=>buttons}};vm.createContext(c);vm.runInContext(code,c);return {c,get clicks(){return clicks},run:n=>vm.runInContext(`confirmCreationSuccess('${n||'323140'}')`,c)};}
test('OK de sucesso funciona em janela com classe desconhecida, botão INPUT e ícone fechar',()=>{const s=setup();assert.equal(s.run().clicked,true);assert.equal(s.run().clicked,false);assert.equal(s.clicks,1);});
test('não clica em confirmação de outro tipo, outra OS ou dois OK visíveis',()=>{for(const text of ['Sucesso Foto enviada! OK','Erro Registro gravado! OK']){const s=setup(text);assert.equal(s.run().clicked,false);assert.equal(s.clicks,0);}const s=setup();assert.equal(s.run('323902').clicked,false);assert.equal(s.clicks,0);assert.throws(()=>setup(undefined,2).run(),/dois OK/);});
test('prepara Enter sem depender do clique anterior e reconhece textos concatenados',()=>{const s=setup('SucessoRegistro gravado!OK');const result=vm.runInContext("confirmCreationSuccess('323140','enter')",s.c);assert.equal(result.enterRequired,true);assert.equal(s.clicks,0);});


test('Salvar aceita a confirmação somente durante o clique autorizado e restaura o navegador',()=>{
 const fn=src.slice(src.indexOf('function clickCreationSave('),src.indexOf('function confirmCreationSuccess('));let accepted=false,clicks=0;const original=()=>false;
 const ctx={URL,location:{origin:'https://admin.rcoengenharia.com',pathname:'/ordem_servico_form.php',href:'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323140'},window:{confirm:original},document:{querySelectorAll:()=>[button]}};
 const button={offsetWidth:20,offsetHeight:20,getClientRects:()=>[],scrollIntoView(){},focus(){},click(){clicks++;accepted=ctx.window.confirm('Confirma alteração do status?');}};vm.createContext(ctx);vm.runInContext(fn,ctx);
 assert.equal(vm.runInContext("clickCreationSave('[data-rco-close=x]','323140','save')",ctx).clicked,true);assert.equal(accepted,true);assert.equal(clicks,1);assert.equal(ctx.window.confirm,original);
 assert.equal(vm.runInContext("clickCreationSave('[data-rco-close=x]','323902','save')",ctx).noClick,true);assert.equal(clicks,1);
});

test('sucesso sem título e texto completo fora de innerText ainda identifica OK',()=>{const a=setup('Registro gravado!');assert.equal(a.run().clicked,true);const b=setup('OK');b.c.document.querySelectorAll()[0].parentElement.textContent='Sucesso Registro gravado!';assert.equal(b.run().clicked,true);});
