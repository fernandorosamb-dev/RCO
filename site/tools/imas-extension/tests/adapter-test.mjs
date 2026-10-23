// Run with RCO_QA_JSDOM pointing to a test-only jsdom module; not shipped in ZIP.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {JSDOM}=await import(process.env.RCO_QA_JSDOM || 'jsdom');
const source=readFileSync(new URL('../imas.js',import.meta.url),'utf8');
const select=(id,label,options)=>`<div><label for="${id}">${label}</label><select id="${id}">${options.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></div>`;
const input=(id,label,type='text',value='')=>`<div><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${value}"></div>`;
const fixed={type:'CORRETIVA',status:'1 - Aberta',unit:'ED. DEPÓSITO SOROCABA (SP) - Sorocaba - SP',client:'BB - DEPOSITO SÃO PAULO',creationJustification:'Abertura de OS',completionJustification:'Ajuste de data da execução',ans:'Normal',ansJustification:'OK'};
const report={imasSubject:'Instalação de painel',imasSystem:'Elétrico',imasOpenedAt:'2026-10-05T09:32',environment:'Galpão 01',floor:'Térreo',executionStartedAt:'2026-10-05T09:35',completedAt:'2026-10-05T10:30',observations:'Serviço executado.\nTeste OK.',photos:[{},{}]};
const job={phase:'criar',fixed,report,responsible:'FERNANDO DA ROSA - ELETROTÉCNICO',mode:'validation',saveAllowed:false,photoUploadAllowed:false,externalNumber:''};
function setup(number=''){
 const html=`<form>${input('code','Código','text',number)}${input('clientCode','Cod. cliente','text','91')}${select('type','Tipo O.S',[['c','CORRETIVA']])}${select('status','Status',[['a','1 - Aberta'],['c','3 - Concluída']])}${input('openedDate','Data de abertura','date')}${input('openedTime','Hora de abertura','time')}${input('startDate','Data início da execução','date')}${input('startTime','Hora início da execução','time')}${input('endDate','Data prevista / conclusão','date')}${input('endTime','Hora prevista / conclusão','time')}${input('creationJustification','Justificativa de alteração')}${input('subject','Assunto / serviço / solicitação')}${select('unit','Local / Unidade',[['s',fixed.unit],['a','AG. SANTO AMARO PAULISTA']])}${select('system','Sistema',[['e','Elétrico'],['h','Instalações hidráulicas']])}${input('environment','Ambiente')}${input('floor','Pavimento')}${select('ans','Classificação ANS',[['n','Normal']])}${input('ansJustification','Justificativa desacordo ANS')}${select('responsible','Colaborador',[['f',job.responsible]])}<div><label for="observation">Observações</label><textarea id="observation"></textarea></div><input id="photos" type="file" multiple/><button type="button" id="upload">Enviar arquivos</button><button type="submit" id="save">Salvar</button></form>`;
 const dom=new JSDOM(html,{url:`https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=${number||'0'}`,runScripts:'outside-only'}),w=dom.window;
 w.CSS={escape:s=>s};w.HTMLElement.prototype.getClientRects=function(){return [{}];};
 let saves=0,uploads=0,changes=0;
 w.document.getElementById('save').onclick=()=>saves++;
 w.document.getElementById('upload').onclick=()=>uploads++;
 const photoInput=w.document.getElementById('photos');let files=[];Object.defineProperty(photoInput,'files',{get:()=>files,set:v=>files=v});photoInput.onchange=()=>changes++;
 w.DataTransfer=class {constructor(){this.files=[];this.items={add:f=>this.files.push(f)};}};
 w.eval(source);
 return {w,api:w.RcoImas,counters:()=>({saves,uploads,changes})};
}
test('criação completa como Aberta, sem clicar em salvar e preservando a observação',async()=>{const {api,w,counters}=setup();await api.prepare(job);const result=await api.audit(job);assert.equal(result.ok,true,JSON.stringify(result.errors));assert.equal(w.document.getElementById('status').value,'a');assert.equal(w.document.getElementById('observation').value,report.observations);assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});});
test('CKEditor obs oculto abre sua seção, aguarda callback e sincroniza HTML sem tocar outros editores',async()=>{
 const {api,w,counters}=setup();const textarea=w.document.getElementById('observation');textarea.id='obs';w.document.querySelector('label[for="observation"]').htmlFor='obs';textarea.getClientRects=()=>[];
 const section=w.document.createElement('fieldset');section.style.display='none';textarea.parentElement.replaceWith(section);section.append(textarea);const container=w.document.createElement('div');container.id='cke_obs';container.className='cke';const frame=w.document.createElement('iframe');frame.className='cke_wysiwyg_frame';container.append(frame);section.append(container);const body=frame.contentDocument.body;body.contentEditable='true';body.setAttribute('contenteditable','true');
 for(const e of [container,frame])e.getClientRects=()=>section.style.display==='none'?[]:[{}];
 const other=w.document.createElement('fieldset');other.style.display='none';other.innerHTML='<div id="cke_edit_motivo">Outro editor</div>';w.document.body.append(other);
 let updated=0;w.CKEDITOR={instances:{obs:{element:{$:textarea},status:'ready',readOnly:false,setData(html,options){setTimeout(()=>{body.innerHTML=html;options.callback();},40);},getData:()=>body.innerHTML,updateElement(){textarea.value=body.innerHTML;updated++;},editable:()=>({$:body}),focus(){body.focus();}},edit_motivo:{setData(){throw Error('Editor errado');}}}};
 const background=readFileSync(new URL('../background.js',import.meta.url),'utf8');w.eval(background.slice(background.indexOf('function syncObservationEditor('),background.indexOf('async function engine(')));
 await api.prepare(job);assert.equal(body.textContent,'');const result=await w.syncObservationEditor(report.observations);assert.equal(result.confirmed,true);assert.equal(updated,1);assert.equal(section.style.display,'block');assert.equal(other.style.display,'none');assert.equal((await api.audit(job)).ok,true);body.textContent='';assert.equal((await api.audit(job)).ok,false);assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});
});
test('clica e foca o editor aberto antes de substituir o conteúdo com insertText',async()=>{
 const {api,w,counters}=setup();const editor=w.document.createElement('div');editor.contentEditable='true';editor.setAttribute('contenteditable','true');editor.textContent='Anterior';w.document.getElementById('observation').after(editor);let clicks=0,inserts=0;editor.addEventListener('click',()=>clicks++);w.document.execCommand=(command,ui,value)=>{assert.equal(command,'insertText');assert.equal(w.document.activeElement,editor);assert.equal(clicks,1);editor.textContent=value;inserts++;return true;};await api.prepare(job);assert.equal(inserts,1);assert.equal(editor.textContent,report.observations);assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});
});
test('editor com atributo contenteditable vazio recebe observação; campo oculto sozinho não aprova',async()=>{
 const {api,w}=setup();const textarea=w.document.getElementById('observation'),editor=w.document.createElement('div');editor.setAttribute('contenteditable','');editor.className='jqte_editor';textarea.after(editor);textarea.getClientRects=()=>[];
 await api.prepare(job);assert.equal(editor.textContent,report.observations);assert.equal((await api.audit(job)).ok,true);editor.remove();assert.equal((await api.audit(job)).ok,false);assert.equal(api.diagnostics().some(c=>String(c.label).includes(report.observations)),false);
});
test('aguarda a inicialização do editor após abrir seção e mantém texto no editor criado depois',async()=>{
 const {api,w}=setup();const textarea=w.document.getElementById('observation');textarea.getClientRects=()=>[];const section=w.document.createElement('button');section.type='button';section.textContent='Observações';w.document.body.append(section);section.onclick=()=>setTimeout(()=>{const editor=w.document.createElement('div');editor.setAttribute('contenteditable','');textarea.after(editor);},450);
 await api.prepare(job);assert.equal(w.document.querySelector('[contenteditable]').textContent,report.observations);assert.equal((await api.audit(job)).ok,true);
});
test('observação preenche editor em iframe e auditoria detecta editor vazio mesmo com textarea preenchida',async()=>{
 const {api,w,counters}=setup();const frame=w.document.createElement('iframe');w.document.getElementById('observation').parentElement.append(frame);const body=frame.contentDocument.body;body.setAttribute('contenteditable','true');let inputs=0;body.addEventListener('input',()=>inputs++);
 await api.prepare(job);assert.equal(body.textContent,report.observations);assert.equal(inputs,1);assert.equal((await api.audit(job)).ok,true);body.textContent='';assert.equal((await api.audit(job)).ok,false);assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});
});
test('SCEditor sem atributo contenteditable sincroniza pela API da página e verifica o texto visível',async()=>{
 const {api,w,counters}=setup();const textarea=w.document.getElementById('observation');textarea.id='obs';w.document.querySelector('label[for="observation"]').htmlFor='obs';
 const box=w.document.createElement('div');box.className='sceditor-container';const frame=w.document.createElement('iframe');box.append(frame);textarea.after(box);const body=frame.contentDocument.body;
 await api.prepare(job);assert.equal(body.textContent,report.observations);
 const background=readFileSync(new URL('../background.js',import.meta.url),'utf8');const helper=background.slice(background.indexOf('function syncObservationEditor('),background.indexOf('async function engine('));w.eval(helper);
 let calls=0;w.sceditor={instance:e=>e===textarea?{val(html,filter){assert.equal(filter,false);body.innerHTML=html;calls++;},getBody:()=>body}:null};
 const value='Teste <painel> & evidência\nSegunda linha';w.syncObservationEditor(value);assert.equal(calls,1);assert.equal(body.querySelector('painel'),null);assert.equal((await api.audit({...job,report:{...report,observations:value}})).ok,true);body.textContent='';assert.throws(()=>{w.sceditor.instance=()=>({val(){},getBody:()=>body});w.syncObservationEditor(value);},/não confirmado/);assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});
});
test('troca Santo Amaro por Sorocaba antes do status e resolve status repetido pelo código',async()=>{
 const {api,w,counters}=setup();const status=w.document.getElementById('status'),unit=w.document.getElementById('unit');
 unit.value='a';status.innerHTML='<option value="0">1 - Aberta</option><option value="1">1 - Aberta</option><option value="3">3 - Concluída</option>';
 let unitAtStatus='';status.addEventListener('change',()=>unitAtStatus=unit.value);
 await api.prepare(job);assert.equal(status.value,'1');assert.equal(unitAtStatus,'s');assert.equal((await api.audit(job)).ok,true);assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});
});
test('status repetido com mesmo valor é equivalente; códigos conflitantes continuam bloqueados',async()=>{
 const {api,w}=setup();const status=w.document.getElementById('status');status.innerHTML='<option value="a">1 - Aberta</option><option value="a">1 - Aberta</option>';await api.prepare(job);
 status.innerHTML='<option value="a">1 - Aberta</option><option value="b">1 - Aberta</option>';await assert.rejects(api.prepare(job),/não encontrada de forma única em status/);
});
test('encerramento seleciona todas as fotos sem disparar upload nem salvar',async()=>{const {api,w,counters}=setup('323999');const close={...job,phase:'encerrar',externalNumber:'323999'};await api.prepare(close);for(let i=0;i<2;i++)await api.addPhoto({dataUrl:'data:image/jpeg;base64,/9j/2Q==',name:`OS_323999_Foto_0${i+1}.jpg`,reset:i===0});const result=await api.audit(close);assert.equal(result.ok,true,JSON.stringify(result.errors));assert.equal(result.photos,2);assert.equal(w.document.getElementById('status').value,'c');assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});});
test('recusa criar sobre OS existente ou encerrar número diferente',async()=>{const {api}=setup('323999');await assert.rejects(api.prepare(job),/já tem número/);await assert.rejects(api.prepare({...job,phase:'encerrar',externalNumber:'323998'}),/não corresponde/);});
test('campo ambíguo interrompe antes de preencher',async()=>{const {api,w,counters}=setup();const other=w.document.createElement('input');other.type='text';other.setAttribute('aria-label','Ambiente');w.document.body.append(other);await assert.rejects(api.prepare(job),/ambíguo/);assert.equal(w.document.getElementById('startDate').value,'');assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});});
test('justificativa reconhece label fora do wrapper sem confundir ANS',async()=>{
 const {api,w,counters}=setup();const e=w.document.getElementById('creationJustification');
 const box=e.parentElement;box.querySelector('label').removeAttribute('for');const wrap=w.document.createElement('div');e.replaceWith(wrap);wrap.append(e);e.id='justificativa';e.name='justificativa';
 await api.prepare(job);assert.equal(e.value,'Abertura de OS');assert.equal(w.document.getElementById('ansJustification').value,'OK');assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});
});
test('justificativa simples aceita campo único e recusa duas justificativas comuns',async()=>{
 const {api,w}=setup();w.document.querySelector('label[for="creationJustification"]').textContent='Justificativa';
 await api.prepare(job);assert.equal(w.document.getElementById('creationJustification').value,'Abertura de OS');
 const other=w.document.createElement('input');other.setAttribute('aria-label','Justificativa');w.document.body.append(other);
 await assert.rejects(api.prepare(job),/Campo ambíguo: creationJustification/);
});
test('auditoria aponta o último campo tentado e exclui valores, senhas e fotos',async()=>{
 const {api,w,counters}=setup();const events=[];w.chrome={runtime:{async sendMessage(m){events.push(m);return {};}}};
 const secret=w.document.createElement('input');secret.type='password';secret.value='SEGREDO-NAO-REGISTRAR';w.document.body.append(secret);
 const e=w.document.getElementById('creationJustification');e.value='TEXTO-NAO-REGISTRAR';
 const info=api.diagnostics();assert.equal(JSON.stringify(info).includes('SEGREDO-NAO-REGISTRAR'),false);assert.equal(JSON.stringify(info).includes('TEXTO-NAO-REGISTRAR'),false);assert.equal(info.some(c=>c.type==='file'||c.type==='password'),false);
 e.parentElement.remove();await assert.rejects(api.prepare(job),/creationJustification/);assert.equal(events.at(-1).field,'creationJustification');assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});
});
test('identificadores reais do IMAS prevalecem sobre rótulos incorretos e seções recolhidas',async()=>{
 const {api,w,counters}=setup();const ids={code:'id_ordem_servico',type:'id_tipo_os',status:'id_ordem_servico_status',openedDate:'data_abertura',openedTime:'hora_abertura',startDate:'data_inicio',startTime:'hora_inicio',endDate:'data_conclusao',endTime:'hora_conclusao',creationJustification:'just_alt',subject:'assunto',unit:'id_local_unidade',system:'id_sistema',environment:'ambiente',floor:'pavimento',ans:'id_classificacao_ans',ansJustification:'justificativa_classificacao_ans',responsible:'id_colaborador',clientCode:'id_cliente',observation:'obs'};
 for(const [old,id]of Object.entries(ids)){const e=w.document.getElementById(old);const label=w.document.querySelector(`label[for="${old}"]`);if(label)label.setAttribute('for',id);e.id=id;e.name=id;}
 w.document.querySelector('label[for="data_inicio"]').remove();w.document.querySelector('label[for="data_conclusao"]').textContent='Data início da execução';
 w.document.getElementById('just_alt').getClientRects=()=>[];
 await api.prepare(job);const result=await api.audit(job);assert.equal(result.ok,true,JSON.stringify(result.errors));assert.equal(w.document.getElementById('just_alt').value,'Abertura de OS');assert.equal(w.document.getElementById('hora_inicio').value,'09:35');assert.equal(w.document.getElementById('hora_conclusao').value,'10:30');assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});
 const copy=w.document.getElementById('just_alt').cloneNode();w.document.body.append(copy);await assert.rejects(api.prepare(job),/Identificador duplicado/);
});
function navigation(html,path='/painel.php'){
 const dom=new JSDOM(html,{url:'https://admin.rcoengenharia.com'+path,runScripts:'outside-only'}),w=dom.window;
 w.HTMLElement.prototype.getClientRects=function(){return [{}];};w.eval(source);return {w,api:w.RcoImas};
}
test('navegação usa links reais do menu, ignora ícones e não aciona salvar',()=>{
 const {api}=navigation('<a href="/pendentes.php"><i>assignment</i>Ordem de serviços pendente</a><form><button>Salvar</button></form>');
 assert.equal(api.navigate(job).url,'https://admin.rcoengenharia.com/pendentes.php');
 const next=navigation('<a href="/ordem_servico_form.php"><i>add</i>Novo</a>');
 assert.equal(next.api.navigate(job).url,'https://admin.rcoengenharia.com/ordem_servico_form.php');
});
test('navegação expande manutenção e detecta login ou links ambíguos',()=>{
 const {api,w}=navigation('<button type="button">Manutenção</button>');let clicks=0;w.document.querySelector('button').onclick=()=>clicks++;assert.equal(api.navigate(job).expanded,'manutencao');assert.equal(clicks,1);
 assert.throws(()=>navigation('<input type="password">').api.navigate(job),/ambíguo/);
 assert.throws(()=>navigation('<a href="/ordem_servico_form.php">Novo</a><a href="/ordem_servico_form.php?id_ordem_servico=0">Novo</a>').api.navigate(job),/ambígua/);
 assert.throws(()=>navigation('<a href="https://outro.example/ordem_servico_form.php">Novo</a>').api.navigate(job),/Não encontrei/);
});
test('abre OS exata para encerramento e preserva outro formulário em edição',()=>{
 const close={...job,phase:'encerrar',externalNumber:'323999'};
 assert.equal(navigation('').api.navigate(close).url,'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323999');
 assert.equal(navigation('','/ordem_servico_form.php?id_ordem_servico=323999').api.navigate(close).ready,true);
 assert.throws(()=>navigation('','/ordem_servico_form.php?id_ordem_servico=323998').api.navigate(close),/outro formulário/);
 assert.equal(navigation('','/ordem_servico_form.php').api.navigate(job).ready,true);
});

test('login usa somente Entrar do formulário preenchido, sem expor senha',async()=>{
 const {api,w}=navigation('<form><input type="password" value="teste-local"><button type="submit">Entrar</button></form><button>Salvar</button>');let clicks=0;w.document.querySelector('form button').onclick=e=>{e.preventDefault();clicks++;};const result=api.navigate(job);assert.equal(result.expanded,'entrar');assert.equal(JSON.stringify(result).includes('teste-local'),false);await new Promise(r=>setTimeout(r,150));assert.equal(clicks,1);
 assert.equal(navigation('<form><input type="password"><button>Entrar</button></form>').api.navigate(job).waitingLogin,true);
});
test('login.php aceita Entrar por JavaScript sem form nativo e aguarda sem repetir clique',async()=>{
 const {api,w}=navigation('<div><input id="login" value="usuario-local"><input id="senha" type="password" value="senha-local"><button type="button">Entrar</button><a>Esqueceu sua senha?</a></div><div><input id="email"></div>','/login.php');
 let clicks=0;w.document.querySelector('button').onclick=()=>clicks++;
 const result=api.navigate(job);assert.equal(result.expanded,'entrar');assert.equal(JSON.stringify(result).includes('senha-local'),false);
 await new Promise(r=>setTimeout(r,150));assert.equal(clicks,1);assert.equal(api.navigate({...job,loginAttempted:true}).waitingLogin,true);await new Promise(r=>setTimeout(r,150));assert.equal(clicks,1);assert.equal(w.document.getElementById('senha').value,'senha-local');
 const ambiguous=navigation('<input type="password" value="local"><button>Entrar</button><button>Entrar</button>','/login.php');assert.throws(()=>ambiguous.api.navigate(job),/Entrar não identificado/);
 assert.throws(()=>navigation('<input type="password"><input type="password"><button>Entrar</button>','/login.php').api.navigate(job),/mais de um campo/);
});

test('menu da Home admite cabeçalho de texto e clique delegado sem duplicar rótulos',()=>{
 const {api,w}=navigation('<div id="menu" onclick=""><span>Manutenção</span></div>');let clicks=0;w.document.getElementById('menu').onclick=()=>clicks++;assert.equal(api.navigate(job).expanded,'manutencao');assert.equal(clicks,1);
 const nested=navigation('<div><a href="/manutencao.php"><span>Manutenção</span></a></div>');assert.equal(nested.api.navigate(job).url,'https://admin.rcoengenharia.com/manutencao.php');
 const plain=navigation('<li><span>Manutenção</span></li>');let bubbled=0;plain.w.document.querySelector('li').onclick=()=>bubbled++;assert.equal(plain.api.navigate(job).expanded,'manutencao');assert.equal(bubbled,1);
 assert.throws(()=>plain.api.navigate({...job,navigationVisited:['manutencao']}),/próxima opção/);
 assert.equal(navigation('<a href="/pendentes.php">Ordens de serviços pendente</a>').api.navigate(job).url,'https://admin.rcoengenharia.com/pendentes.php');
});
test('rotas confirmadas nos prints levam da Home à manutenção e à lista pendente',()=>{
 assert.equal(navigation('','/').api.navigate(job).url,'https://admin.rcoengenharia.com/manutencao_main.php');
 assert.equal(navigation('','/manutencao_main.php').api.navigate(job).url,'https://admin.rcoengenharia.com/ordem_servico_rel.php?id_ordem_servico_status=4');
 const page=navigation('<a href="/ordem_servico_rel.php?id_ordem_servico_status=4"><i>warning</i>(63) Ordem(s) de serviço pendente</a>');assert.equal(page.api.navigate(job).url,'https://admin.rcoengenharia.com/ordem_servico_rel.php?id_ordem_servico_status=4');
 assert.equal(navigation('<a href="/ordem_servico_form.php"><i>plus</i>Novo</a>','/ordem_servico_rel.php?id_ordem_servico_status=4').api.navigate(job).url,'https://admin.rcoengenharia.com/ordem_servico_form.php');
});
test('lista com Novo repetido abre formulário novo sem escolher botões nem alterar OS em lote',()=>{
 const {api,w}=navigation('<a href="/ordem_servico_form.php">Novo</a><form><select id="id_os_status"><option>Concluída</option></select><button>Salvar</button></form><a href="/ordem_servico_form.php?id_ordem_servico=0">Novo</a>','/ordem_servico_rel.php?id_ordem_servico_status=4');
 let clicks=0;w.document.querySelectorAll('a,button').forEach(e=>e.onclick=()=>clicks++);
 assert.equal(api.navigate(job).url,'https://admin.rcoengenharia.com/ordem_servico_form.php');assert.equal(clicks,0);
 assert.equal(api.navigate({...job,phase:'encerrar',externalNumber:'323999'}).url,'https://admin.rcoengenharia.com/ordem_servico_form.php?id_ordem_servico=323999');
});
test('busca cliente na seção correta com ícones e botões Localizar/Pesquisar repetidos, depois preenche todos os dados',async()=>{
 const {api,w,counters}=setup();const code=w.document.getElementById('clientCode');w.document.querySelector('label[for="clientCode"]').setAttribute('for','id_cliente');code.id='id_cliente';code.value='';
 const unit=w.document.getElementById('unit');w.document.querySelector('label[for="unit"]').setAttribute('for','id_local_unidade');unit.id='id_local_unidade';const unitOptions=unit.innerHTML;unit.replaceChildren();
 const section=w.document.createElement('fieldset');section.innerHTML='<legend>Cliente / Local / Unidade</legend><button type="button" id="locCliente"><i class="material-icons">search</i>Localizar</button>';w.document.querySelector('form').append(section);section.append(code.parentElement,unit.parentElement);
 const other=w.document.createElement('div');other.innerHTML='<button type="button">Localizar</button><button type="button">Pesquisar</button>';w.document.body.append(other);let wrong=0;other.querySelectorAll('button').forEach(e=>e.onclick=()=>wrong++);
 const modal=w.document.createElement('div');modal.className='modal';modal.hidden=true;modal.innerHTML='<input id="busca-cliente"><button type="button" id="pesqCliente"><i>search</i>Pesquisar</button><table><tbody></tbody></table>';w.document.body.append(modal);
 const search=modal.querySelector('input');search.getClientRects=()=>modal.hidden?[]:[{}];
 section.querySelector('button').onclick=()=>modal.hidden=false;
 modal.querySelector('button').onclick=()=>{assert.equal(search.value,'deposito');modal.querySelector('tbody').innerHTML='<tr><td>91</td><td><a id="clientDetails">BB - DEPOSITO SÃO PAULO</a></td><td><span><i class="fa fa-plus-square"></i></span></td></tr>';modal.querySelector('#clientDetails').onclick=()=>wrong++;modal.querySelector('tr i').onclick=()=>{code.value='91';modal.hidden=true;w.setTimeout(()=>unit.innerHTML=unitOptions,20);};};
 await api.prepare(job);assert.equal((await api.audit(job)).ok,true);assert.equal(code.value,'91');assert.equal(w.document.getElementById('subject').value,report.imasSubject);assert.equal(w.document.getElementById('observation').value,report.observations);assert.equal(wrong,0);assert.deepEqual(counters(),{saves:0,uploads:0,changes:0});
});

test('salvar criação exige confirmação, audita e clica uma vez; número só é reconhecido com identidade conferida',async()=>{const {api,w,counters}=setup();await api.prepare(job);await assert.rejects(api.saveCreation(job),/explícito/);assert.equal(counters().saves,0);w.document.getElementById('save').type='button';await api.saveCreation({...job,explicitSave:true});assert.equal(counters().saves,1);w.document.getElementById('code').value='123456';assert.equal(await api.savedNumber(job),'123456');w.document.getElementById('subject').value='Outra OS';assert.equal(await api.savedNumber(job),null);await assert.rejects(api.saveCreation({...job,explicitSave:true}),/possui número/);assert.equal(counters().saves,1);});
test('URL de OS existente impede criação mesmo com campo código vazio',async()=>{const {api,w,counters}=setup();await api.prepare(job);w.history.replaceState(null,'','?id_ordem_servico=999');await assert.rejects(api.saveCreation({...job,explicitSave:true}),/URL/);assert.equal(counters().saves,0);});

test('localização do Salvar audita sem clicar e fornece alvo único para MAIN',async()=>{const {api,w,counters}=setup();await api.prepare(job);const target=await api.saveCreation({...job,explicitSave:true,locateOnly:true,saveToken:'token-test'});assert.equal(w.document.querySelector(target.selector).id,'save');assert.equal(counters().saves,0);});

test('Salvar por label visual dispara submit oculto uma vez e ignora o ícone',async()=>{const {api,w}=setup();await api.prepare(job);const button=w.document.getElementById('save');button.replaceWith(w.document.createElement('div'));const input=w.document.createElement('input');input.id='save-hidden';input.type='submit';input.value='Salvar';input.getClientRects=()=>[];const label=w.document.createElement('label');label.htmlFor=input.id;label.className='btn';label.innerHTML='<i class="material-icons">save</i><span>Salvar</span>';w.document.querySelector('form').append(input,label);let clicked=0;input.onclick=e=>{e.preventDefault();clicked++};const target=await api.saveCreation({...job,explicitSave:true,locateOnly:true,saveToken:'label-save'});const chosen=w.document.querySelector(target.selector);assert.equal(chosen,label);assert.equal(clicked,0);chosen.click();assert.equal(clicked,1);});
test('Salvar em span ou div clicável é localizado e controles duplicados permanecem bloqueados',async()=>{const {api,w,counters}=setup();await api.prepare(job);w.document.getElementById('save').remove();const wrapper=w.document.createElement('span');wrapper.className='btn';wrapper.innerHTML='<i>save</i><span class="btn">Salvar</span>';w.document.querySelector('form').append(wrapper);let clicked=0;wrapper.onclick=()=>clicked++;const target=await api.saveCreation({...job,explicitSave:true,locateOnly:true,saveToken:'span-save'});assert.equal(w.document.querySelector(target.selector),wrapper);wrapper.click();assert.equal(clicked,1);const duplicate=w.document.createElement('div');duplicate.textContent='Salvar';duplicate.setAttribute('onclick','');w.document.querySelector('form').append(duplicate);await assert.rejects(api.saveCreation({...job,explicitSave:true,locateOnly:true,saveToken:'duplicate'}),/2 encontrados/);assert.equal(clicked,1);});
test('Salvar em input mantém value como texto, mesmo com title e aria descritivos',async()=>{const {api,w}=setup();await api.prepare(job);const old=w.document.getElementById('save');const button=w.document.createElement('input');button.type='submit';button.value='Salvar';button.title='Salvar ordem de serviço';button.setAttribute('aria-label','Gravar os dados da ordem');old.replaceWith(button);const target=await api.saveCreation({...job,explicitSave:true,locateOnly:true,saveToken:'input-save'});assert.equal(w.document.querySelector(target.selector),button);});
test('Salvar preserva texto em itálico e ignora ícone Material Symbols',async()=>{const {api,w}=setup();await api.prepare(job);const button=w.document.getElementById('save');button.innerHTML='<span class="material-symbols-outlined">save</span><i>Salvar</i>';const target=await api.saveCreation({...job,explicitSave:true,locateOnly:true,saveToken:'icon-save'});assert.equal(w.document.querySelector(target.selector),button);});
test('diagnóstico registra ações não reconhecidas sem copiar conteúdo da observação',async()=>{const {api,w}=setup();await api.prepare(job);const button=w.document.getElementById('save');button.textContent='Gravar registro';button.className='custom-action';const controls=api.diagnostics();assert.ok(controls.some(c=>c.type==='button'&&c.label.includes('Gravar registro')&&c.label.includes('custom-action')));assert.equal(JSON.stringify(controls).includes(report.observations),false);});
function successModal(html){const dom=new JSDOM(html,{url:'https://admin.rcoengenharia.com/ordem_servico_form.php',runScripts:'outside-only'}),w=dom.window;w.HTMLElement.prototype.getClientRects=function(){return [{}];};const bg=readFileSync(new URL('../background.js',import.meta.url),'utf8');w.eval(bg.slice(bg.indexOf('function confirmCreationSuccess('),bg.indexOf('async function createAndSave(')));return {w,confirm:()=>w.confirmCreationSuccess()};}
test('OK reconhece a janela real Sucesso/Registro gravado e clica uma vez só nela',()=>{const {w,confirm}=successModal('<button id="outside">OK</button><div class="modal"><div class="modal-dialog"><h4>Sucesso</h4><div>Registro gravado!</div><button id="ok">OK</button></div></div>');let clicked=0,outside=0;w.document.getElementById('ok').onclick=()=>clicked++;w.document.getElementById('outside').onclick=()=>outside++;assert.equal(confirm().clicked,true);assert.equal(confirm().clicked,false);assert.equal(clicked,1);assert.equal(outside,0);});
test('OK não confirma erros, exclusões ou janela de sucesso ambígua',()=>{for(const text of ['Erro Campo obrigatório','Sucesso Registro excluído!','Sucesso Registro gravado! Confirme excluir']){const {w,confirm}=successModal(`<div class="modal">${text}<button>OK</button></div>`);let clicks=0;w.document.querySelector('button').onclick=()=>clicks++;assert.equal(confirm().clicked,false);assert.equal(clicks,0);}const {confirm}=successModal('<div class="modal">Sucesso Registro gravado! <button>OK</button><button>OK</button></div>');assert.throws(confirm,/forma única/);});
