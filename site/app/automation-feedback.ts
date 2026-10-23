export type AutomationFeedback={state:string;title:string;reason:string;action:string;step:string;updatedAt:number|null;requestId?:string;osNumber?:string;lastAttemptAt?:number|null;lastError?:string;imasCompletionPending?:boolean};
export type AutomationRun={state:string;step:string;trace_json?:unknown;updated_at:number};
export type AutomationRequest={state:string;request_id:string;requested_at:number;updated_at:number};
const messages=(run?:AutomationRun|null)=>{try{const events=JSON.parse(String(run?.trace_json||"[]"));return Array.isArray(events)?events:[];}catch{return [];}};
export function runStartedAt(run:AutomationRun){const times=messages(run).map(event=>Date.parse(String(event.at||""))).filter(Number.isFinite);return times.length?Math.min(...times):run.updated_at;}
export function failureExplanation(message:string,step:string){
 if(/execução sem resposta da extensão/i.test(message))return {reason:"Execução sem resposta da extensão por mais de 30 minutos.",action:"Confira o estado atual no IMAS e use Voltar à fila para retomar. A baixa não foi registrada e fotos existentes devem ser preservadas."};
 if(/conclus[aã]o no futuro/i.test(message))return {reason:"A data ou o horário de conclusão informado ainda está no futuro.",action:"Confira a data e a hora reais da execução em Revisar → Editar. Se o horário estiver correto, a aprovação permanece na fila para executar quando chegar esse horário."};
 if(/Cannot access contents|Chrome bloqueou|host.permission/i.test(message))return {reason:"O Chrome bloqueou o acesso da extensão ao IMAS.",action:"No computador, permita acesso ao site admin.rcoengenharia.com na extensão e recarregue a aba do IMAS."};
 if(/Could not load file.*imas\.js/i.test(message))return {reason:"A extensão instalada não conseguiu carregar o arquivo imas.js.",action:"Confira a instalação e recarregue a extensão no Chrome do computador. A aprovação não substitui arquivos ausentes."};
 if(/aba do RCO n[aã]o respondeu|receiving end|context invalidated|comunica[cç][aã]o.*respondeu/i.test(message))return {reason:"A comunicação entre a plataforma e a extensão não respondeu.",action:"Atualize a aba RCO no computador e confirme o login de Supervisor. A OS aprovada continua aguardando o executor."};
 if(/Encerramento n[aã]o confirmado|Salvar acionado.*confirma[cç]|Registro gravado continua|conclus[aã]o.*confirm/i.test(message))return {reason:message||"O IMAS não confirmou que o encerramento foi gravado.",action:"Confira os dados, as fotos e o status no IMAS. As fotos já anexadas devem ser preservadas; a retomada aprovada deve conferir a OS antes de reenviar qualquer evidência."};
 if(/40 segundos|n[aã]o terminou de carregar|n[aã]o ficou pronto/i.test(message))return {reason:"A página do IMAS não carregou a tempo.",action:"Confira a conexão e o login no IMAS no computador. Uma nova tentativa deve retomar a OS existente."};
 if(/outro formul[aá]rio|OS preparada|teste em andamento/i.test(message))return {reason:"Há outro formulário ou execução em andamento no computador.",action:"Conclua ou descarte a edição pendente no IMAS. A OS aprovada aguarda sua vez na fila."};
 return {reason:message||`A automação parou na etapa “${step||"não informada"}” sem registrar um motivo detalhado.`,action:"Confira a etapa indicada e os dados da OS em Revisar. A baixa só será registrada após confirmação no IMAS."};
}
export function automationFeedback(request:AutomationRequest|null,latest:AutomationRun|null,now=Date.now()):AutomationFeedback{
 // Uma aprovação nova não herda uma falha de execução iniciada antes dela.
 const run=latest&&(!request||runStartedAt(latest)>=request.requested_at)?latest:null;
 const events=messages(run),message=String([...events].reverse().find(event=>event.status==="failed"&&event.message)?.message||"").slice(0,300);
 const base={step:run?.step||"",updatedAt:run?.updated_at||request?.updated_at||null,requestId:request?.request_id};
 if(request?.state==="waiting_execution")return {state:"waiting_execution",title:"Criada no IMAS — aguardando execução",reason:"Número oficial recebido. A OS está disponível na fila do colaborador.",action:"O colaborador deve abrir a OS, informar a execução e enviar as fotos para encerrar.",...base};
 if(request?.state==="queued"){
  if(run?.state==="failed")return {state:"failed",title:"Erro do IMAS — aprovação mantida",...failureExplanation(message,run.step),action:"Confira o resultado no IMAS e os dados da OS. Depois use Voltar à fila para autorizar uma nova tentativa, preservando as fotos já anexadas.",...base};
  return {state:"queued",title:"Aprovada — na fila automática",reason:"A aprovação foi registrada. O computador ainda não confirmou o início desta OS.",action:"Mantenha o Chrome aberto, a extensão ativa e a plataforma RCO conectada como Supervisor. Não é necessário aprovar novamente.",...base};
 }
 if(request?.state==="processing"||run?.state==="running"){
  const inactive=now-(run?.updated_at||request?.updated_at||now)>10*60*1000;
  return {state:"processing",title:inactive?"Processamento sem confirmação recente":"Em processamento no IMAS",reason:inactive?"O computador parou de informar o andamento há mais de 10 minutos.":`A extensão recebeu a OS${run?.step?` e está na etapa “${run.step}”`:""}.`,action:inactive?"Confira o IMAS e a extensão no computador antes de retomar. A OS não foi marcada como baixada, e nenhum reenvio foi autorizado automaticamente.":"Aguarde a confirmação de gravação e a conferência da OS no IMAS.",...base};
 }
 if(request?.state==="completed"||run?.state==="completed")return {state:"completed",title:"Execução confirmada",reason:"O executor registrou a conclusão do processamento.",action:"A baixa depende do vínculo oficial e da confirmação registrada no IMAS.",...base};
 if(request?.state==="failed"||run?.state==="failed")return {state:"failed",title:"Não foi possível confirmar a criação ou o encerramento",...failureExplanation(message,run?.step||""),...base};
 if(run?.state==="review")return {state:"review",title:"Processamento aguardando revisão",reason:/cria[cç][aã]o salva/i.test(run.step)?"A OS foi criada e vinculada, mas o encerramento ainda não foi confirmado.":"A extensão preparou a OS, mas não registrou confirmação de gravação no IMAS.",action:"Confira a OS e use Voltar à fila para retomar. A extensão deve conferir o que já foi gravado antes de concluir.",...base};
 return {state:request?.state||"pending",title:"Aguardando aprovação",reason:"Esta OS ainda não tem uma aprovação executável na fila.",action:"Confira os dados e fotos e use Aprovar para colocá-la na fila automática.",...base};
}
