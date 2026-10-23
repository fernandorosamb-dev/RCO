// Isolated, opt-in recorder. It observes final buttons only; never changes a form.
(() => {
 if(globalThis.__rcoFinalRecorder)return;
 globalThis.__rcoFinalRecorder=true;
 let session=null,manualOk=null,closed=false;
 const visible=e=>!!(e?.offsetWidth||e?.offsetHeight||e?.getClientRects?.().length);
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
 const number=()=>new URL(location.href).searchParams.get('id_ordem_servico')||document.getElementById('id_ordem_servico')?.value||null;
 function success(e){for(let p=e?.parentElement,i=0;p&&i<12&&!['BODY','HTML'].includes(p.tagName);p=p.parentElement,i++){const texts=[norm(p.innerText),norm(p.textContent)];if(texts.some(t=>t.length<500&&/registro\s*gravado/.test(t)&&!/(?:^|\s)(?:erro|falha)(?:\s|:|$)/.test(t)))return p;}return null;}
 function classify(e){const b=e?.closest?.('button,a,input[type="button"],input[type="submit"],[role="button"],.btn,[onclick]');if(!b||!visible(b)||b.disabled)return null;const t=norm(b.tagName==='INPUT'?b.value:b.innerText||b.textContent);if(t==='ok'&&success(b))return {b,kind:'ok'};if(t==='salvar')return {b,kind:'salvar'};return null;}
 function selector(e){if(e.id&&document.querySelectorAll('#'+CSS.escape(e.id)).length===1)return '#'+CSS.escape(e.id);let parts=[];for(let n=e;n&&n!==document.body&&parts.length<6;n=n.parentElement){let part=n.tagName.toLowerCase();if(n.id){parts.unshift('#'+CSS.escape(n.id));break;}const siblings=[...n.parentElement.children].filter(x=>x.tagName===n.tagName);parts.unshift(part+':nth-of-type('+(siblings.indexOf(n)+1)+')');}return parts.join(' > ').slice(0,160);}
 function emit(kind,b,event){if(!session?.active||location.pathname!=='/ordem_servico_form.php')return;const r=b?.getBoundingClientRect();const payload={kind,osNumber:number(),trusted:event?event.isTrusted===true:true,selector:b?selector(b):'',tag:b?.tagName||'',key:event?.type==='keydown'?'Enter':'',point:r?{x:Math.round(event?.clientX??(r.x+r.width/2)),y:Math.round(event?.clientY??(r.y+r.height/2)),cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),w:Math.round(r.width),h:Math.round(r.height)}:null,viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio,sx:scrollX,sy:scrollY}};chrome.runtime.sendMessage({action:'record-final-event',runId:session.runId,event:payload}).catch(()=>{});}
 document.addEventListener('click',e=>{const c=classify(e.target);if(!c)return;emit(c.kind,c.b,e);if(c.kind==='ok'&&e.isTrusted){manualOk=c.b;closed=false;}},true);
 document.addEventListener('keydown',e=>{if(e.key!=='Enter'||!e.isTrusted||e.repeat)return;let c=classify(document.activeElement);if(c?.kind!=='ok'){const matches=[...document.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"],.btn,[onclick]')].map(classify).filter(x=>x?.kind==='ok');if(matches.length===1)c=matches[0];}if(c?.kind==='ok'){emit('enter-ok',c.b,e);manualOk=c.b;closed=false;}},true);
 const observer=new MutationObserver(()=>{if(manualOk&&!closed&&(!manualOk.isConnected||!visible(manualOk)||!visible(success(manualOk)))){closed=true;emit('ok-fechado',null);manualOk=null;}});
 observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','hidden','aria-hidden']});
 const update=value=>{session=value||null;manualOk=null;closed=false;};
 chrome.storage.local.get('finalRecording').then(s=>update(s.finalRecording));
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.finalRecording){const next=changes.finalRecording.newValue;if(next?.runId!==session?.runId||next?.active!==session?.active)update(next);else session=next;}});
})();

// DOM adapter: validates creation before the separately authorized Save action.
(() => {
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
  async function progress(step,field=''){
    if(globalThis.chrome?.runtime?.sendMessage)await chrome.runtime.sendMessage({action:'trace-step',step,field,path:location.pathname}).catch(()=>{});
  }
  const definitions={
    code:[['codigo'],['id_ordem_servico']],type:[['tipo','o.s'],['tipo','os'],['tipo_os']],status:[['status']],
    openedDate:[['data','abertura']],openedTime:[['hora','abertura'],['data','abertura']],
    startDate:[['data','inicio','execucao']],startTime:[['hora','inicio'],['data','inicio','execucao']],
    endDate:[['data','prevista'],['data','conclusao']],endTime:[['hora','prevista'],['hora','conclusao'],['data','prevista']],
    creationJustification:[['justificativa','alteracao'],['justificativa']],subject:[['assunto'],['solicitacao']],
    unit:[['local','unidade']],system:[['sistema']],environment:[['ambiente']],floor:[['pavimento']],
    ans:[['classificacao','ans']],ansJustification:[['justificativa','ans']],responsible:[['colaborador']],
    activation:[['acionamento']],clientReference:[['sistema','cliente']],clientCode:[['cod.','cliente'],['cod_cliente']],
    observation:[['observacao'],['observacoes']]
  };
  const kinds={code:['text','number'],type:['select'],status:['select'],openedDate:['date','text'],openedTime:['time'],startDate:['date','text'],startTime:['time'],endDate:['date','text'],endTime:['time'],creationJustification:['text','textarea'],subject:['text','textarea'],unit:['select'],system:['select'],environment:['text','textarea'],floor:['text','textarea'],ans:['select'],ansJustification:['text','textarea'],responsible:['select'],activation:['select','text','textarea'],clientReference:['text','number'],clientCode:['text','number'],observation:['textarea']};
  // Identifiers confirmed by the real IMAS audit. Labels can point at another
  // date, and a field may be inside a collapsed section when first opened.
  const imasIds={code:'id_ordem_servico',type:'id_tipo_os',status:'id_ordem_servico_status',openedDate:'data_abertura',openedTime:'hora_abertura',startDate:'data_inicio',startTime:'hora_inicio',endDate:'data_conclusao',endTime:'hora_conclusao',creationJustification:'just_alt',subject:'assunto',unit:'id_local_unidade',system:'id_sistema',environment:'ambiente',floor:'pavimento',ans:'id_classificacao_ans',ansJustification:'justificativa_classificacao_ans',responsible:'id_colaborador',activation:'acionamento',clientReference:'numero_sistema_cliente',clientCode:'id_cliente',observation:'obs'};
  kinds.activation.push('number');
  function labels(e){
    const linked=e.id?document.querySelector(`label[for="${CSS.escape(e.id)}"]`):null;
    const aria=(e.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent).filter(Boolean);
    // Materialize fields may wrap the input separately from their label.
    // Only climb through containers belonging to this one native control.
    let container=e.parentElement;
    for(let depth=0;container&&depth<3;depth++){
      const controls=[...container.querySelectorAll('input,select,textarea')].filter(n=>!['hidden','submit','button','checkbox'].includes(n.type)&&!n.classList.contains('select-dropdown'));
      if(controls.length!==1||controls[0]!==e)break;
      if(container.querySelector('label'))break;
      const next=container.parentElement;
      if(!next||['FORM','BODY','HTML'].includes(next.tagName))break;
      const siblings=[...next.querySelectorAll('input,select,textarea')].filter(n=>!['hidden','submit','button','checkbox'].includes(n.type)&&!n.classList.contains('select-dropdown'));
      if(siblings.length!==1||siblings[0]!==e)break;
      container=next;
    }
    const owned=container&&[...container.querySelectorAll('input,select,textarea')].filter(n=>!['hidden','submit','button','checkbox'].includes(n.type)&&!n.classList.contains('select-dropdown'));
    const local=owned?.length===1&&owned[0]===e?[...container.querySelectorAll('label')].map(n=>n.textContent):[];
    return {direct:norm([linked?.textContent,e.closest('label')?.textContent,...aria,...local,e.getAttribute('aria-label'),e.placeholder].filter(Boolean).join(' ')),meta:norm(`${e.id} ${e.name}`),context:norm(e.parentElement?.textContent)};
  }
  function selector(e){if(e.id)return '#'+CSS.escape(e.id);if(e.name)return `${e.tagName.toLowerCase()}[name="${CSS.escape(e.name)}"]`;return '';}
  function field(key,optional=false){
    if(location.pathname==='/ordem_servico_form.php'&&imasIds[key]){
      const exact=[...document.querySelectorAll('#'+CSS.escape(imasIds[key]))];
      if(exact.length>1)throw Error(`Campo ambíguo: ${key}. Identificador duplicado.`);
      if(exact.length){const e=exact[0];if(e.disabled)throw Error(`Campo desabilitado: ${key}.`);if(!kinds[key].includes(e.tagName==='SELECT'?'select':e.type))throw Error(`Tipo inesperado: ${key}.`);return e;}
    }
    const candidates=[...document.querySelectorAll('input,select,textarea')].filter(e=>!e.disabled&&(!['hidden','submit','button','file','checkbox'].includes(e.type))&&!e.classList.contains('select-dropdown')&&(visible(e)||e.tagName==='SELECT'||(key==='observation'&&e.tagName==='TEXTAREA')));
    const rows=candidates.filter(e=>kinds[key].includes(e.tagName==='SELECT'?'select':e.type)).map(e=>{const c=labels(e);if(key==='creationJustification'&&/\bans\b|desacordo/.test(norm(c.direct+' '+c.meta).replace(/[_-]/g,' ')))return {e,score:0};const score=Math.max(0,...definitions[key].map(terms=>{const has=s=>terms.every(t=>s.includes(norm(t)));return has(c.direct)?300+terms.length:has(c.meta)?200+terms.length:has(c.context)?100+terms.length:0;}));return {e,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    if(!rows.length){if(optional)return null;throw Error(`Campo não identificado: ${key}. Use Conferir campos na extensão.`);}
    if(rows.length>1&&rows[0].score===rows[1].score)throw Error(`Campo ambíguo: ${key}. Nenhum salvamento foi feito.`);
    return rows[0].e;
  }
  function read(e){return e.tagName==='SELECT'?e.selectedOptions[0]?.textContent||'':e.value;}
  function matches(a,b){const clean=s=>norm(s).replace(/^\d+\s*[-–:]\s*/,'');return clean(a)===clean(b);}
  function set(key,value,optional=false){const e=field(key,optional);if(!e)return;if(e.tagName==='SELECT'){
    let options=[...e.options].filter(o=>matches(o.textContent,value));
    const exact=options.filter(o=>norm(o.textContent)===norm(value));if(exact.length)options=exact;
    // IMAS can repeat the selected status as a placeholder. Prefer the actual
    // numbered status when its value agrees with the requested status number.
    const number=key==='status'?/^\s*(\d+)\s*[-–:]/.exec(value)?.[1]:null;
    const numbered=number?options.filter(o=>o.value===number):[];if(numbered.length)options=numbered;
    options=options.filter((o,i,all)=>all.findIndex(other=>other.value===o.value)===i);
    if(options.length!==1)throw Error(`Opção ${value} não encontrada de forma única em ${key}.`);e.value=options[0].value;
    const visual=e.parentElement?.querySelector('input.select-dropdown');if(visual)visual.value=options[0].textContent;
  }else{const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,String(value));}
  e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return e;}
  function split(value){const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);if(!match)throw Error('Data/hora incompleta.');return [match[1],match[2]];}
  function dates(key,value){const [date,time]=split(value);const e=field(key+'Date');const display=e.type==='date'?date:date.split('-').reverse().join('/');set(key+'Date',display);set(key+'Time',time);}
  async function waitFor(fn){for(let i=0;i<60;i++){const result=fn();if(result)return result;await new Promise(r=>setTimeout(r,250));}throw Error('Campo ou janela não apareceu no IMAS em 15 segundos.');}
  async function stepPause(ms=1000){if(globalThis.chrome?.runtime?.id)await new Promise(r=>setTimeout(r,ms));}
  const actionSelector='button,a,input[type="button"],input[type="submit"],input[type="image"],[role="button"],label[for],[onclick],.btn,.button,[class*="btn-"],[class*="-button"]';
  function buttonText(e){
    // An input's value is its displayed caption. Tooltips/ARIA descriptions
    // must not replace that caption (e.g. value=Salvar, title=Salvar a OS).
    if(e.tagName==='INPUT'&&e.type!=='image'&&e.value?.trim())return norm(e.value);
    const copy=e.cloneNode(true);
    const originals=[...e.querySelectorAll('*')],clones=[...copy.querySelectorAll('*')];
    originals.forEach((node,index)=>{const style=getComputedStyle(node);if(node.hidden||style.display==='none'||style.visibility==='hidden')clones[index]?.remove();});
    // Remove icon glyphs, not every italic element: an <i> may contain Salvar.
    copy.querySelectorAll('svg,.material-icons,.material-icons-outlined,.material-symbols-outlined,.material-symbols-rounded,.material-symbols-sharp').forEach(n=>n.remove());
    copy.querySelectorAll('i').forEach(n=>{if(/^(save|save_alt|check|done|add|search|file_upload|cloud_upload|upload|send|publish)$/.test(norm(n.textContent)))n.remove();});
    return norm(copy.textContent?.trim()||e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('alt')||e.value);
  }
  function exactButton(text,scope=document){
    const nodes=[...scope.querySelectorAll(actionSelector)].filter(visible).filter(e=>buttonText(e)===norm(text)).filter((e,i,all)=>!all.some(other=>other!==e&&other.contains(e)));
    if(nodes.length!==1)throw Error(`Botão ${text} não identificado de forma única (${nodes.length} encontrados na seção).`);
    return nodes[0];
  }
  async function expand(text){const rows=[...document.querySelectorAll('a,button,legend,summary,div,span')].filter(visible).filter(e=>norm(e.textContent)===norm(text)).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length);if(!rows.length)throw Error(`Seção ${text} não encontrada.`);rows[0].click();await new Promise(r=>setTimeout(r,200));}
  function clientPlus(row){
    const cell=row.cells[row.cells.length-1];if(!cell)throw Error('Coluna de seleção do cliente ausente.');
    const nodes=[...cell.querySelectorAll('button,a,input[type="button"],[role="button"],[onclick],i,svg,span')].filter(visible);
    const plus=nodes.filter(e=>/^(\+|add|add_box|control_point)$/.test(norm(e.textContent))||/(?:^|\s)(?:fa-plus(?:-square|-circle)?|fa-square-plus|bi-plus-square)(?:\s|$)/.test(e.getAttribute('class')||'')||/plus|adicionar|selecionar/.test(norm([e.getAttribute('data-icon'),e.getAttribute('aria-label'),e.getAttribute('title')].filter(Boolean).join(' '))));
    const leaf=list=>list.filter(e=>!list.some(other=>other!==e&&e.contains(other)));
    const choices=leaf(plus.length?plus:nodes);
    if(choices.length!==1)throw Error(`Ícone + do cliente 91 não identificado de forma única (${choices.length} encontrados).`);
    return choices[0];
  }
  async function client(fixed){
    const code=field('clientCode',true);if(code&&String(code.value)==='91')return;
    let scope=code?.closest('fieldset');
    if(!scope){let parent=code?.parentElement;while(parent&&!['FORM','BODY','HTML'].includes(parent.tagName)){if(parent.querySelector('#id_local_unidade')&&[...parent.querySelectorAll('button,a,input[type="button"],[role="button"]')].some(e=>visible(e)&&buttonText(e)==='localizar')){scope=parent;break;}parent=parent.parentElement;}}
    await progress('Abrir localização do cliente');exactButton('Localizar',scope||document).click();await stepPause(2000);
    const search=await waitFor(()=>{const known=document.getElementById('busca-cliente');if(known&&visible(known))return known;const inputs=[...document.querySelectorAll('input')].filter(e=>visible(e)&&/procurar por/.test(norm(e.placeholder||labels(e).context)));return inputs.length===1?inputs[0]:null;});
    const dialog=search.closest('[role="dialog"],dialog,.modal');
    await progress('Pesquisar cliente BB Depósito');search.value='deposito';search.dispatchEvent(new Event('input',{bubbles:true}));exactButton('Pesquisar',dialog||document).click();await stepPause(2000);
    const row=await waitFor(()=>{const rows=[...(dialog||document).querySelectorAll('tr')].filter(e=>visible(e)&&norm(e.textContent).includes(norm(fixed.client))&&[...e.cells].some(cell=>norm(cell.textContent)==='91'));if(rows.length>1)throw Error('Mais de um resultado para o cliente código 91.');return rows[0];});
    const plus=clientPlus(row);await progress('Clicar + do cliente código 91');plus.click();await stepPause(2000);
    await waitFor(()=>field('clientCode',true)?.value==='91');
    await progress('Aguardar unidades do cliente');
    await waitFor(()=>{const options=[...field('unit').options].filter(o=>matches(o.textContent,fixed.unit));if(options.length>1)throw Error('Unidade do cliente ambígua.');return options.length===1;});
  }
  function observationEditors(){
    const editors=[...document.querySelectorAll('[contenteditable]:not([contenteditable="false"]),.note-editable,.jqte_editor,.sceditor-container textarea')].filter(visible);
    const observation=field('observation',true),section=observation?.closest('fieldset');
    for(const frame of document.querySelectorAll('iframe')){
      if(!visible(frame))continue;
      try{const doc=frame.contentDocument,body=doc?.body,editable=doc?.querySelector('[contenteditable]:not([contenteditable="false"])');if(body&&(editable||String(doc.designMode).toLowerCase()==='on'||section?.contains(frame)||frame.closest('.sceditor-container')||frame.classList.contains('cke_wysiwyg_frame')))editors.push(editable||body);}catch{}
    }
    return [...new Set(editors)];
  }
  function editorText(e){if(e.tagName==='TEXTAREA')return e.value;const copy=e.cloneNode(true);copy.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));return (e.innerText??copy.textContent??'').replace(/\r\n/g,'\n');}
  function sameObservation(a,b){return String(a).replace(/\s+/g,' ').trim()===String(b).replace(/\s+/g,' ').trim();}
  async function observations(value){
    await stepPause(2000);
    if(document.getElementById('cke_obs')){await progress('Preparar CKEditor obs');return {editor:'CKEditor obs',pendingSync:true};}
    let e=field('observation',true),editor=observationEditors();
    if(!editor.length&&(!e||!visible(e))){await expand('Observações');await new Promise(r=>setTimeout(r,800));e=field('observation',true);editor=observationEditors();}
    if(editor.length>1)throw Error('Mais de um editor de observações encontrado.');
    if(!editor.length&&(!e||!visible(e)))throw Error('Editor visível de observações não identificado. Confira o diagnóstico do editor.');
    if(!editor.length&&e){e.click();e.focus();e.select();}
    if(e)set('observation',value);
    if(editor.length){const target=editor[0],doc=target.ownerDocument,win=doc.defaultView;target.scrollIntoView?.({block:'center'});target.click();target.focus();if(target.tagName==='TEXTAREA')Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype,'value').set.call(target,value);else{const range=doc.createRange();range.selectNodeContents(target);const selection=win.getSelection();selection.removeAllRanges();selection.addRange(range);if(!doc.execCommand?.('insertText',false,value))target.textContent=value;target.style.whiteSpace='pre-wrap';}target.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));target.dispatchEvent(new win.Event('change',{bubbles:true}));await stepPause();if(!sameObservation(editorText(target),value))throw Error('Observação não confirmada no editor visível.');}
  }
  function expected(job){const r=job.report;return {status:job.phase==='criar'?job.fixed.status:'Concluída',creationJustification:job.phase==='criar'?job.fixed.creationJustification:job.fixed.completionJustification,environment:r.environment,floor:r.floor,responsible:job.responsible,...(job.phase==='criar'?{type:job.fixed.type,subject:r.imasSubject,unit:job.fixed.unit,system:r.imasSystem,ans:job.fixed.ans,ansJustification:job.fixed.ansJustification}:{}),...(r.imasActivation?{activation:r.imasActivation}:{}),...(r.imasClientReference?{clientReference:r.imasClientReference}:{})};}
  async function prepare(job){
    if(location.origin!=='https://admin.rcoengenharia.com')throw Error('Destino inválido.');
    if(job.saveAllowed!==false||job.photoUploadAllowed!==false||job.mode!=='validation')throw Error('Salvamento bloqueado durante validação.');
    const code=field('code',true);const urlNumber=new URL(location.href).searchParams.get('id_ordem_servico');
    if(job.phase==='criar'&&((urlNumber&&urlNumber!=='0')||(code&&code.value&&code.value!=='0')))throw Error('Este formulário já tem número. Abra Novo para não sobrescrever uma OS existente.');
    if(job.phase==='encerrar'&&urlNumber!==job.externalNumber)throw Error('A OS aberta não corresponde à OS da fila.');
    if(job.phase==='encerrar'&&matches(read(field('status')),'Concluída'))throw Error('Esta OS já está concluída no IMAS. Confira a baixa manualmente.');
    // Preflight every field before any values are changed.
    try{
      for(const key of Object.keys(expected(job))){await progress('Identificar campo',key);field(key);}
      for(const key of ['start','end',...(job.phase==='criar'?['opened']:[])]){await progress('Identificar data e hora',key);field(key+'Date');field(key+'Time');}
    }catch(e){e.noFormChanges=true;throw e;}
    if(job.phase==='criar'){await progress('Selecionar cliente e unidade');await client(job.fixed);await progress('Selecionar Depósito Sorocaba','unit');await waitFor(()=>[...field('unit').options].some(o=>matches(o.textContent,job.fixed.unit)));set('unit',job.fixed.unit);if(!matches(read(field('unit')),job.fixed.unit))throw Error('Unidade Depósito Sorocaba não confirmada.');}
    const values=expected(job);for(const [key,value]of Object.entries(values)){await progress('Preencher campo',key);const e=field(key);if(e.tagName==='SELECT')await waitFor(()=>[...field(key).options].some(o=>matches(o.textContent,value)));set(key,value);await stepPause(e.tagName==='SELECT'?1500:750);}
    const checkbox=[...document.querySelectorAll('input[type="checkbox"]')].filter(e=>norm(labels(e).direct+' '+labels(e).meta).includes('status'));if(checkbox.length>1)throw Error('Marcação de Status ambígua.');if(checkbox.length&&!checkbox[0].checked)checkbox[0].click();
    await progress('Preencher datas e horários');dates('start',job.report.executionStartedAt);dates('end',job.report.completedAt);if(job.phase==='criar')dates('opened',job.report.imasOpenedAt);
    await progress('Preencher observação');await observations(job.report.observations);
    if(job.phase==='encerrar'){
      await ensurePhotoSection();
      await waitFor(()=>photoInput(true));
    }
    return {prepared:true,saveClicked:false,uploadClicked:false};
  }
  function photoInput(optional=false){
    const files=[...document.querySelectorAll('input[type="file"]')].filter(e=>!e.disabled&&!/orcamento|documento|material|assinatura/.test(norm(`${e.id} ${e.name}`)));
    // IMAS uses #imagem as a text path control beside its native file input.
    // Locate that component first; other sections also contain file inputs.
    const path=document.getElementById('imagem');
    if(path&&path.type!=='file'){
      let parent=path.parentElement;
      for(let depth=0;parent&&depth<4&&!['FORM','BODY','HTML'].includes(parent.tagName);depth++,parent=parent.parentElement){
        const owned=files.filter(e=>parent.contains(e));
        if(owned.length===1)return owned[0];
        if(owned.length>1)break;
      }
    }
    const rows=files.map(e=>{
      const meta=norm(`${e.id} ${e.name}`),accept=norm(e.getAttribute('accept'));
      let score=/(?:^|[_\s-])(foto|fotos|imagem|imagens|image|images|photo|photos)(?:$|[_\s[\]-])/.test(meta)?300:0;
      let parent=e.parentElement;
      for(let depth=0;parent&&depth<4&&!['FORM','BODY','HTML'].includes(parent.tagName);depth++,parent=parent.parentElement){
        if([...parent.querySelectorAll('legend,summary,label,h3,h4,.collapsible-header')].some(n=>buttonText(n)==='fotos')){score+=200;break;}
      }
      if(/image\//.test(accept))score+=100;
      return {e,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    if(rows.length&&(!rows[1]||rows[0].score>rows[1].score))return rows[0].e;
    if(!rows.length&&files.length===1)return files[0];
    if(optional&&!rows.length&&!files.length)return null;
    throw Error(`Campo de Fotos não identificado de forma única (${files.length} campos de arquivo; ${rows.length} candidatos a fotos).`);
  }
  async function addPhoto({dataUrl,name,reset}){
    const input=photoInput();
    const match=/^data:image\/jpeg;base64,(.+)$/.exec(dataUrl);if(!match)throw Error('Foto inválida.');const bytes=Uint8Array.from(atob(match[1]),c=>c.charCodeAt(0));
    const transfer=new DataTransfer();if(!reset)for(const f of input.files)transfer.items.add(f);
    transfer.items.add(new File([bytes],name,{type:'image/jpeg'}));if(transfer.files.length>1&&!input.multiple)throw Error('O campo do IMAS aceita apenas uma foto. Confira o envio sequencial antes da validação.');
    // No change event: the site's event handler could upload immediately.
    input.files=transfer.files;if(input.files.length!==transfer.files.length)throw Error('A seleção não foi confirmada no campo de Fotos.');return {selected:input.files.length,uploaded:false,selector:selector(input)};
  }
  async function audit(job){const errors=[],fields={};for(const [key,value]of Object.entries(expected(job))){if(job.verifyUploaded&&key==='creationJustification')continue;try{const actual=read(field(key));fields[key]=actual;if(!matches(actual,value))errors.push(key);}catch(e){errors.push(e.message);}}
    for(const key of ['start','end',...(job.phase==='criar'?['opened']:[])]){const value=key==='start'?job.report.executionStartedAt:key==='end'?job.report.completedAt:job.report.imasOpenedAt;const [date,time]=split(value);try{const dateElement=field(key+'Date');if(dateElement.value!==(dateElement.type==='date'?date:date.split('-').reverse().join('/')))errors.push(key+'Date');if(field(key+'Time').value!==time)errors.push(key+'Time');}catch(e){errors.push(e.message);}}
    const e=field('observation',true),editor=observationEditors();let stored=e?.value;if(e&&document.getElementById('cke_obs')){const parsed=document.createElement('div');parsed.innerHTML=e.value;stored=editorText(parsed);}if(e&&!sameObservation(stored,job.report.observations))errors.push('observation');if(!job.verifyUploaded&&!(e&&document.getElementById('cke_obs')&&sameObservation(stored,job.report.observations))&&(editor.length>1||(editor.length===1&&!sameObservation(editorText(editor[0]),job.report.observations))||(!editor.length&&(!e||!visible(e)))))errors.push('observationEditor');
    let photos=0;if(job.phase==='encerrar'){try{photos=job.verifyUploaded?linkedPhotos(job).count:photoInput().files.length;if(job.verifyUploaded?photos<job.report.photos.length:photos!==job.report.photos.length)errors.push('Quantidade de fotos selecionadas');}catch(e){errors.push(e.message);}}
    return {ok:errors.length===0,errors,fields,photos,saveClicked:false,uploadClicked:false};
  }
  function closingIdentity(job){
    if(job.phase!=='encerrar'||job.externalNumber==='323902'||job.publicId==='4e9bd0d3-5e4f-4f25-8301-2942d04dc0d1')throw Error('Esta OS está protegida ou não é de encerramento.');
    if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php'||new URL(location.href).searchParams.get('id_ordem_servico')!==job.externalNumber||field('code').value!==job.externalNumber||field('clientCode').value!=='91')throw Error('Número/cliente da OS divergente.');
    if(!matches(read(field('unit')),job.fixed.unit))throw Error('Unidade divergente.');
  }
  function photoGallery(section){
    const sources=new Set();
    for(const image of section.querySelectorAll('a img')){
      if(!visible(image)||!image.complete||!image.naturalWidth)continue;
      const source=image.currentSrc||image.getAttribute('src');if(!source)continue;
      try{const url=new URL(source,location.href);if(/^https?:$/.test(url.protocol)&&url.origin===location.origin)sources.add(url.href);}catch{}
    }
    return sources.size;
  }
  function linkedPhotos(job){
    closingIdentity(job);
    const section=document.getElementById('imagem')?.closest('fieldset');if(!section)throw Error('Seção Fotos não identificada.');
    const matchesCount=[...String(section.textContent||'').matchAll(/(?:esta\s+o\.?s\.?\s+tem|tem)\s*\(?\s*(\d+)\s*\)?\s*fotos?\s+vinculad/gi)];
    const counterCount=matchesCount.length===1?Number(matchesCount[0][1]):null,galleryCount=photoGallery(section);
    if(counterCount===null&&!galleryCount)throw Error('Quantidade de fotos vinculadas não identificada.');
    // IMAS may update the uploaded gallery without updating its static caption.
    // Count only loaded, linked server images; selected blob/data previews do not qualify.
    return {count:Math.max(counterCount||0,galleryCount),counterCount,galleryCount};
  }
  function photoUploadButton(){
    const section=document.getElementById('imagem')?.closest('fieldset');if(!section)throw Error('Seção Fotos não identificada.');
    const isSend=e=>{
      const caption=buttonText(e);
      // IMAS can include the rendered upload glyph before the caption.
      return /^(?:(?:file_upload|cloud_upload|upload|send|publish|↑|⇧|\uf093|\uf0ee)\s*)?enviar\s+arquivos(?:\s*\(\d+\))?$/.test(caption)||norm(e.getAttribute('aria-label'))==='enviar arquivos';
    };
    const leaf=nodes=>nodes.filter(e=>!nodes.some(other=>other!==e&&other.contains(e)));
    let nodes=leaf([...section.querySelectorAll(actionSelector)].filter(visible).filter(isSend));
    if(!nodes.length){
      // Some IMAS layouts place the action next to the upload fieldset.
      // Accept only a unique visible action, excluding other attachment sections.
      nodes=leaf([...document.querySelectorAll(actionSelector)].filter(visible).filter(isSend).filter(e=>{const owner=e.closest('fieldset');return !owner||owner===section;}));
    }
    if(nodes.length!==1){
      const seen=[...section.querySelectorAll(actionSelector)].filter(visible).map(buttonText).filter(Boolean).slice(0,6).join(' | ');
      const error=Error(`Enviar arquivos: ${nodes.length} botões candidatos. Controles de Fotos: ${seen||'nenhum'}.`);error.uploadUnavailable=nodes.length===0;throw error;
    }
    return nodes[0];
  }
  async function ensurePhotoSection(){
    const section=document.getElementById('imagem')?.closest('fieldset');if(!section)throw Error('Seção Fotos não identificada.');
    try{photoUploadButton();return {alreadyOpen:true};}catch(error){if(!error.uploadUnavailable)throw error;}
    // Observed IMAS header: the handler belongs to its chevron, not to the
    // smallest element whose text is "Fotos". Never toggle an open section.
    const arrows=[...section.querySelectorAll('i,svg,[role="button"]')].filter(visible).filter(e=>/(?:^|\s)fa-chevron-right(?:\s|$)/.test(String(e.className||'')));
    if(arrows.length>1)throw Error('Seta de abertura de Fotos ambígua.');
    if(!arrows.length)return {alreadyOpen:true};
    await progress('Abrir Fotos pela seta do cabeçalho');arrows[0].click();
    await waitFor(()=>{try{return !!photoUploadButton();}catch(error){if(!error.uploadUnavailable)throw error;}return !/(?:^|\s)fa-chevron-right(?:\s|$)/.test(String(arrows[0].className||''));});
    await stepPause(750);return {opened:true};
  }
  async function waitPhotoUploadButton(){
    let lastError;
    for(let attempt=0;attempt<40;attempt++){
      try{const button=photoUploadButton();if(!button.disabled)return button;lastError=Error('Enviar arquivos permanece desabilitado.');}
      catch(error){if(!error.uploadUnavailable)throw error;lastError=error;}
      if(attempt<39)await new Promise(resolve=>setTimeout(resolve,300));
    }
    throw Error(`O botão de envio não ficou disponível em 12 segundos. ${lastError.message}`);
  }
  async function closingTarget(job){
    closingIdentity(job);if(!['upload','save'].includes(job.operation))throw Error('Operação inválida.');
    if(job.operation==='upload')await ensurePhotoSection();
    const checked=await audit({...job,verifyUploaded:job.operation==='save'});if(!checked.ok)throw Error('Campos divergentes: '+checked.errors.join('; '));
    if(!/^[-a-zA-Z0-9]{1,80}$/.test(job.token||''))throw Error('Identificador da operação inválido.');
    const before=linkedPhotos(job).count;
    if(job.operation==='upload'&&before!==0)throw Error('Esta OS já possui fotos vinculadas. Confira as evidências antes de outro envio; nada foi reenviado.');
    const button=job.operation==='upload'?await waitPhotoUploadButton():exactButton('Salvar');
    // The supervisor can edit while the upload widget is loading. Recheck
    // the form and the linked-photo count immediately before reserving a click.
    closingIdentity(job);
    const fresh=await audit({...job,verifyUploaded:job.operation==='save'});if(!fresh.ok)throw Error('Campos divergentes após aguardar: '+fresh.errors.join('; '));
    if(linkedPhotos(job).count!==before)throw Error('As fotos vinculadas mudaram enquanto o botão carregava. Nada foi enviado.');
    if(button.disabled)throw Error('Botão indisponível.');button.setAttribute('data-rco-close',job.token);
    return {selector:`[data-rco-close="${job.token}"]`,before,caption:buttonText(button),tag:button.tagName};
  }
  async function closingSelection(job){
    closingIdentity(job);
    await ensurePhotoSection();
    const checked=await audit(job);if(!checked.ok)throw Error('Campos divergentes: '+checked.errors.join('; '));
    const before=linkedPhotos(job).count;if(before!==0)throw Error('Esta OS já possui fotos vinculadas. Nada foi reenviado.');
    const input=photoInput(),inputSelector=selector(input);
    if(!inputSelector||document.querySelectorAll(inputSelector).length!==1)throw Error('Campo de Fotos sem identificador único.');
    return {selector:inputSelector,before,count:input.files.length};
  }
  function inventory(){return Object.keys(definitions).map(key=>{try{const e=field(key);return {field:key,selector:selector(e),type:e.tagName==='SELECT'?'select':e.type,options:e.tagName==='SELECT'?[...e.options].map(o=>o.textContent):undefined};}catch(e){return {field:key,error:e.message};}});}
  function navigate(job){
    if(location.origin!=='https://admin.rcoengenharia.com'||job.mode!=='validation'||job.saveAllowed!==false)throw Error('Navegação não autorizada.');
    const passwords=[...document.querySelectorAll('input[type="password"]')].filter(visible);
    if(passwords.length){
      if(job.loginAttempted)return {waitingLogin:true};
      if(passwords.length!==1)throw Error('Login ambíguo: mais de um campo de senha visível.');
      // The observed /login.php page can use a JavaScript click handler without
      // a native form association. Keep the button and password unique there.
      const form=passwords[0].form||(location.pathname==='/login.php'?document:null);
      if(!form)throw Error('Formulário de login ambíguo.');
      if(!passwords[0].value)return {waitingLogin:true};
      const buttons=[...form.querySelectorAll('button,input[type="submit"],input[type="button"],a')].filter(visible).filter(e=>norm(e.tagName==='INPUT'?e.value:e.textContent)==='entrar');
      if(buttons.length!==1)throw Error('Botão Entrar não identificado de forma única.');
      // Use the browser-filled form locally. Never return, log or store credentials.
      setTimeout(()=>buttons[0].click(),100);return {expanded:'entrar'};
    }
    const current=new URL(location.href);
    if(current.pathname==='/ordem_servico_form.php'){
      const number=current.searchParams.get('id_ordem_servico');
      if(job.phase==='encerrar'&&number===job.externalNumber)return {ready:true};
      // IMAS can leave the creation URL unchanged after saving. Navigate to
      // the official edit URL only when the saved code, client and unit agree.
      if(job.phase==='encerrar'&&(!number||number==='0')&&field('code',true)?.value===job.externalNumber&&field('clientCode',true)?.value==='91'&&matches(read(field('unit')),job.fixed.unit))return {url:new URL('/ordem_servico_form.php?id_ordem_servico='+job.externalNumber,location.origin).href};
      if(job.phase==='criar'&&(!number||number==='0'))return {ready:true};
      throw Error('Há outro formulário de OS aberto. Termine ou descarte essa edição antes do teste.');
    }
    if(job.phase==='encerrar'){
      if(!/^\d+$/.test(job.externalNumber||''))throw Error('Número da OS inválido.');
      return {url:new URL('/ordem_servico_form.php?id_ordem_servico='+job.externalNumber,location.origin).href};
    }
    // Exact read-only navigation routes observed in the user's IMAS screenshots.
    if(current.pathname==='/'||current.pathname==='/index.php')return {url:new URL('/manutencao_main.php',location.origin).href};
    if(current.pathname==='/manutencao_main.php')return {url:new URL('/ordem_servico_rel.php?id_ordem_servico_status=4',location.origin).href};
    // This create-form route was reached successfully in the real audit.
    // The list can repeat Novo above and below the table; no button choice is
    // needed to navigate to its blank form. This GET never saves an OS.
    if(current.pathname==='/ordem_servico_rel.php')return {url:new URL('/ordem_servico_form.php',location.origin).href};
    const actionLabel=e=>{const copy=e.cloneNode(true);copy.querySelectorAll('i,svg,.material-icons').forEach(icon=>icon.remove());return norm(copy.textContent?.trim()||e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('alt')||e.value).replace(/^\(\d+\)\s*/,'').replace(/\b(ordem|servico)\(s\)/g,'$1');};
    // IMAS navigation also uses text nodes inside menu headings and delegated
    // click handlers. Match only the known navigation labels, then deduplicate
    // nested labels that belong to the same action.
    const actions=[...document.querySelectorAll('a,button,span,div,li,label,[role="button"],[onclick],input[type="button"]')];
    const groups=[['novo','nova os','nova ordem de servico'],['ordem de servicos pendente','ordens de servicos pendentes','ordens de servico pendentes','ordem de servico pendente','ordem de servicos pendentes'],['manutencao']];
    for(let step=0;step<groups.length;step++){
      if(job.navigationVisited?.includes(groups[step][0]))continue;
      const matchesLabel=e=>groups[step].includes(actionLabel(e))||(step===1&&/^orde(?:m|ns) de servicos? pendentes?$/.test(actionLabel(e)));
      const rows=[...new Set(actions.filter(e=>matchesLabel(e)&&![...e.querySelectorAll('a,button,span,div,li,label,[role="button"],[onclick]')].some(matchesLabel)).map(e=>e.closest('a,button,[role="button"],[onclick]')||e))].filter(e=>!e.disabled&&!(e.form&&e.type==='submit'));
      const usable=rows.filter(e=>{
        const href=e.getAttribute('href');if(!href||href==='#'||href.startsWith('javascript:'))return visible(e);
        const url=new URL(href,location.href);return url.href!==current.href&&url.origin===location.origin&&(step!==0||url.pathname==='/ordem_servico_form.php');
      });
      if(usable.length>1)throw Error('Navegação ambígua no IMAS: '+groups[step][0]+'. Envie um print do menu.');
      if(usable.length===1){
        const e=usable[0],href=e.getAttribute('href');
        if(href&&href!=='#'&&!href.startsWith('javascript:'))return {url:new URL(href,location.href).href};
        e.click();return {expanded:groups[step][0]};
      }
    }
    const seen=[...new Set(actions.filter(visible).map(actionLabel).filter(text=>text.length<80&&/manutenc|ordem|ordens|novo|pendente/.test(text)))].slice(0,12);
    throw Error('Não encontrei a próxima opção no menu do IMAS. Opções detectadas: '+(seen.join(' | ')||'nenhuma')+'. Página: '+location.pathname);
  }
  function diagnostics(){
    const photoSection=document.getElementById('imagem')?.closest('fieldset');
    const gallerySummary=photoSection?[{id:'',name:'',type:'upload-summary',label:`Fotos no servidor=${photoGallery(photoSection)} contadores=${[...String(photoSection.textContent||'').matchAll(/(?:esta\s+o\.?s\.?\s+tem|tem)\s*\(?\s*(\d+)\s*\)?\s*fotos?\s+vinculad/gi)].map(m=>m[1]).join(',')||'ausente'}`,selector:''}]:[];
    const photoControls=[...document.querySelectorAll(actionSelector)].filter(e=>photoSection?.contains(e)||/enviar|upload|selecionar fotos/.test(buttonText(e))).filter(e=>!e.querySelector('input[type="password"]')).slice(0,12).map(e=>({id:e.id||'',name:e.name||'',type:'button',label:`FOTOS texto=${buttonText(e)} tag=${e.tagName} type=${e.type||''} classe=${e.className||''} visível=${visible(e)} seção=${photoSection?.contains(e)?'Fotos':'adjacente'}`,selector:selector(e)}));
    const photoFiles=[...document.querySelectorAll('input[type="file"]')].map(e=>({id:e.id||'',name:e.name||'',type:'upload-summary',label:`Arquivo múltiplo=${!!e.multiple} selecionados=${e.files?.length||0} seção=${photoSection?.contains(e)?'Fotos':'outros'}`,selector:selector(e)}));
    const editors=[...document.querySelectorAll('iframe,[contenteditable],.jqte_editor,.sceditor-container,.cke,.note-editor')].slice(0,15).map(e=>({id:e.id,name:'',type:'editor',label:`${e.tagName} class=${e.className} editable=${e.getAttribute('contenteditable')??'ausente'} visível=${visible(e)}`,selector:selector(e)}));
    // Record actions even when caption matching fails. The previous audit
    // repeated the locator's predicate and concealed the very cause of failure.
    const actions=[...document.querySelectorAll(actionSelector)].filter(e=>!e.closest('.cke,[contenteditable]')).filter(e=>!e.querySelector('textarea,input[type="password"]')).map(e=>({e,text:buttonText(e)})).filter(({text})=>text&&text.length<=160).sort((a,b)=>Number(/salvar|gravar|save/.test(b.text))-Number(/salvar|gravar|save/.test(a.text))).slice(0,35).map(({e,text})=>({id:e.id,name:e.name||'',type:'button',label:`${text} texto=${String(e.tagName==='INPUT'?e.value:e.textContent).trim().slice(0,160)} tag=${e.tagName} type=${e.type||''} class=${e.getAttribute('class')||''} title=${e.getAttribute('title')||''} aria=${e.getAttribute('aria-label')||''} visível=${visible(e)} desabilitado=${!!e.disabled} onclick=${e.hasAttribute('onclick')}`,selector:selector(e)}));
    const fields=[...document.querySelectorAll('input,select,textarea')].filter(e=>!['password','hidden','file','submit','button'].includes(e.type)&&!e.classList.contains('select-dropdown')).map(e=>({id:e.id,name:e.name,type:e.tagName==='SELECT'?'select':e.type,label:labels(e).direct,selector:selector(e)}));
    const uploads=[...document.querySelectorAll('input[type="file"]')].map(e=>({id:e.id,name:e.name||'',type:'file',label:`accept=${e.getAttribute('accept')||''} multiple=${!!e.multiple} desabilitado=${!!e.disabled} visível=${visible(e)} selecionados=${e.files?.length||0}`,selector:selector(e)}));
    return [...gallerySummary,...photoControls,...photoFiles,...uploads,...actions,...editors,...fields].slice(0,100);
  }
  async function saveCreation(job){
    if(job.phase!=='criar'||job.explicitSave!==true||job.mode!=='validation'||job.saveAllowed!==false)throw Error('Apenas o teste explícito de salvar criação está liberado.');
    if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php')throw Error('Formulário de criação não está aberto.');
    const urlId=new URL(location.href).searchParams.get('id_ordem_servico');if(urlId&&urlId!=='0')throw Error('A URL já identifica uma OS existente.');
    const code=field('code',true);if(code?.value&&code.value!=='0')throw Error('A OS já possui número. Nenhum novo salvamento foi feito.');
    if(field('clientCode').value!=='91')throw Error('Cliente divergente.');
    const result=await audit(job);if(!result.ok)throw Error('Campos divergentes antes de salvar: '+result.errors.join('; '));
    const button=exactButton('Salvar');if(button.disabled)throw Error('O botão Salvar está desabilitado.');
    if(job.locateOnly){if(!/^[-a-zA-Z0-9]{1,80}$/.test(job.saveToken||''))throw Error('Identificador de salvamento inválido.');button.setAttribute('data-rco-save',job.saveToken);return {selector:`[data-rco-save="${job.saveToken}"]`,tag:button.tagName,type:button.type||''};}
    button.click();return {clicked:true};
  }
  async function savedNumber(job){if(location.origin!=='https://admin.rcoengenharia.com'||location.pathname!=='/ordem_servico_form.php'||!job)return null;if(field('clientCode',true)?.value!=='91'||!(await audit(job)).ok)return null;const code=field('code',true)?.value,urlId=new URL(location.href).searchParams.get('id_ordem_servico');if(/^[1-9]\d*$/.test(code||'')&&/^[1-9]\d*$/.test(urlId||'')&&code!==urlId)return null;return [code,urlId].find(v=>/^[1-9]\d*$/.test(v||''))||null;}
  globalThis.RcoImas={prepare,observations,addPhoto,audit,inventory,navigate,diagnostics,saveCreation,savedNumber,linkedPhotos,closingTarget,closingSelection,photoUploadButton,waitPhotoUploadButton,ensurePhotoSection,photoGallery};
})();
