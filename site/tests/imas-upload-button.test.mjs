import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
function button(text,{visible=true,tag='BUTTON',type='button',aria=null}={}){return {tagName:tag,type,value:tag==='INPUT'?text:'',disabled:false,offsetWidth:visible?100:0,offsetHeight:0,textContent:text,contains:()=>false,closest:()=>null,getClientRects:()=>[],getAttribute:k=>k==='aria-label'?aria:null,querySelectorAll:()=>[],cloneNode:()=>({textContent:text,querySelectorAll:()=>[]})};}
function setup(local,global=[]){const section={querySelectorAll:()=>local,contains:e=>local.includes(e)};local.forEach(e=>e.closest=()=>section);const ctx={setTimeout:f=>setTimeout(f,0),document:{getElementById:()=>({closest:()=>section}),querySelectorAll:()=>[...local,...global]},getComputedStyle:()=>({display:'block',visibility:'visible'}),location:{pathname:'/ordem_servico_form.php'}};vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../tools/imas-extension/imas.js',import.meta.url),'utf8'),ctx);return ctx.RcoImas;}
test('localiza ação com glifo file_upload antes de Enviar arquivos',()=>{const upload=button('file_upload Enviar arquivos');assert.equal(setup([upload]).photoUploadButton(),upload)});
test('usa legenda de INPUT e ignora controle invisível',()=>{const upload=button('Enviar arquivos',{tag:'INPUT'}),hidden=button('Enviar arquivos',{visible:false});assert.equal(setup([hidden,upload]).photoUploadButton(),upload)});
test('ação adjacente à seção é encontrada quando única e visível',()=>{const upload=button('Enviar arquivos');assert.equal(setup([], [upload]).photoUploadButton(),upload)});
test('não escolhe entre dois envios nem botão de outra seção de anexos',()=>{assert.throws(()=>setup([button('Enviar arquivos'),button('Enviar arquivos')]).photoUploadButton(),/2 botões/);const budget=button('Enviar arquivos');budget.closest=()=>({});assert.throws(()=>setup([],[budget]).photoUploadButton(),/0 botões/)});
test('controle ausente lista legendas reais para diagnóstico sem clicar',()=>{assert.throws(()=>setup([button('Selecionar fotos')]).photoUploadButton(),/selecionar fotos/)});

test('espera o botão de envio aparecer e ficar habilitado sem clicar',async()=>{
 const local=[],adapter=setup(local),upload=button('Enviar arquivos (4)');upload.disabled=true;let clicks=0;upload.click=()=>clicks++;
 setTimeout(()=>{local.push(upload);setTimeout(()=>{upload.disabled=false},2)},2);
 assert.equal(await adapter.waitPhotoUploadButton(),upload);assert.equal(clicks,0);
});
test('ambiguidade interrompe a espera e controle ausente termina com diagnóstico',async()=>{
 await assert.rejects(setup([button('Enviar arquivos'),button('Enviar arquivos')]).waitPhotoUploadButton(),/2 botões/);
 await assert.rejects(setup([button('Selecionar fotos')]).waitPhotoUploadButton(),/12 segundos.*selecionar fotos/);
});

test('abre Fotos pela seta real do IMAS sem alternar uma seção já aberta',async()=>{
 const send=button('Enviar arquivos',{visible:false}),arrow=button('');arrow.tagName='I';arrow.className='fas fa-chevron-right hand';let clicks=0;
 arrow.click=()=>{clicks++;send.offsetWidth=100;arrow.className='fas fa-chevron-down hand';};
 const adapter=setup([send,arrow]);await adapter.ensurePhotoSection();assert.equal(clicks,1);await adapter.ensurePhotoSection();assert.equal(clicks,1);assert.equal(adapter.photoUploadButton(),send);
});


test('galeria confirma somente miniaturas carregadas no servidor e deduplica URLs',()=>{
 const make=(src,extra={})=>({...button(''),currentSrc:src,complete:true,naturalWidth:100,...extra});
 const images=[make('/fotos/1.jpg'),make('/fotos/1.jpg'),make('/fotos/2.jpg'),make('blob:https://admin.rcoengenharia.com/abc'),make('data:image/jpeg;base64,abc'),make('/fotos/3.jpg',{complete:false}),make('/fotos/4.jpg',{naturalWidth:0}),make('https://outro.site/foto.jpg'),make('')];
 const ctx={URL,document:{},location:{origin:'https://admin.rcoengenharia.com',href:'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323140'}};vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../tools/imas-extension/imas.js',import.meta.url),'utf8'),ctx);
 assert.equal(ctx.RcoImas.photoGallery({querySelectorAll:()=>images}),2);
});
