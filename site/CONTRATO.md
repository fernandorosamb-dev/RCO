# CONTRATO RCO ⇄ IMAS (fonte única de verdade)

Este arquivo vale para qualquer plataforma (ChatGPT, Claude, outra). Quem mudar o app RCO
ou a extensão DEVE atualizar este arquivo na mesma alteração e subir a `schemaVersion`
se o formato mudar de forma incompatível.

Versão do contrato: **schemaVersion 1** · Extensão: **2.3.0**

## Peças
- **App RCO** (feito pelo ChatGPT): https://rco-manutencao.fernandorosa-mb.chatgpt.site — login de Supervisor.
- **Extensão Chrome "RCO para IMAS"**: lê a fila do app e preenche o IMAS (https://admin.rcoengenharia.com).
- **IMAS 360 pro**: sistema de OS do cliente (formulário `/ordem_servico_form.php`).

## Endpoints do app usados pela extensão (todos autenticados pela sessão do Supervisor)
| Método | Rota | Uso |
|---|---|---|
| GET | `/api/imas/contract` | Versão do contrato e configuração (abaixo). |
| GET | `/api/imas/queue` | Fila de OS: `{ mode:"validation", saveAllowed:false, photoUploadAllowed:false, jobs:[Job] }` |
| POST | `/api/imas/link` | `{publicId, osNumber}` vincula o número gerado no IMAS |
| POST | `/api/imas/approve` | `{action:'claim', publicId, requestId}` consome aprovação do supervisor |
| POST | `/api/imas/diagnostics` | recebe o diagnóstico da execução (`state`: running/review/failed/completed) |
| PATCH | `/api/reports/downloaded` | `{publicId, expectedNumber}` dá baixa |
| GET | `/api/photos/<id>` | foto da evidência; **deve ser `image/jpeg`** |

## GET /api/imas/contract

Acesso exclusivo ao Supervisor autenticado. Sem sessão ou com outro perfil: HTTP 403, JSON `{ "error": "Entre como Supervisor para consultar o contrato IMAS." }`. Sucesso: HTTP 200 com o JSON abaixo. Todas as respostas desta rota usam `Cache-Control: private, no-store`.

`appVersion` identifica a versão de publicação do app; atualizar na mesma alteração que acompanha este documento. O limite de fotos é compartilhado com a política efetiva do app (`STANDARD_PHOTOS = 5`).
```json
{
  "schemaVersion": 1,
  "appVersion": "2026-10-23.139",
  "minExtensionVersion": "2.3.0",
  "config": {
    "maxFotosSemRevisao": 5,
    "osProtegidas": ["323902", "324279"],
    "publicIdsProtegidos": ["4e9bd0d3-5e4f-4f25-8301-2942d04dc0d1", "4d2fcf45-fbce-4c0c-9a02-688f1fe24000"],
    "osTestesAnteriores": ["323080","323081","323082","323140","323145","323157","323162","323164","323165","323166","323930","323963","323964"]
  }
}
```
Regras da extensão:
- `schemaVersion` diferente de 1 → a extensão **para** antes de tocar no IMAS e avisa no popup.
- Extensão mais antiga que `minExtensionVersion` → mesma parada.
- Endpoint inexistente (404) → segue com valores locais e mostra "Contrato com o app: ausente".
- `config`: listas de proteção só **somam** às locais (nunca removem); `maxFotosSemRevisao` aceito entre 1 e 10.

## Formato de cada Job (`/api/imas/queue`)
Campos obrigatórios (a extensão rejeita se faltarem ou divergirem):
- `publicId` (string `[-a-zA-Z0-9]+`), `reference`, `ready` (bool), `errors` (array)
- `phase`: `"criar"` ou `"encerrar"`
- `externalNumber`: vazio em `criar`; número do IMAS (somente dígitos) em `encerrar`
- `mode: "validation"`, `saveAllowed: false`, `photoUploadAllowed: false` (valores fixos; é a trava de segurança atual)
- `responsible` (texto do colaborador no IMAS)
- `fixed`: `client`, `unit`, `status`, `type`, `ans`, `ansJustification`, `creationJustification`, `completionJustification`
- `report`: `imasOpenedAt` (só em `criar`), `executionStartedAt`, `completedAt` — formato `YYYY-MM-DDTHH:mm`, fuso America/Sao_Paulo;
  `observations`, `environment`, `floor`, `imasSubject`, `imasSystem`, `photos[]` (`{publicId,url}`), opcionais `imasActivation`, `imasClientReference`, `imasEquipmentCode` (código do equipamento no IMAS) e `imasEquipmentName`
- `approvalRequest`: `{requestId}` quando há aprovação válida na fila; `null` quando não há. Só é devolvido para um Job pronto, com aprovação enfileirada e impressão dos dados ainda correspondente ao relatório
- `report.automationState` (opcional): `processing`/`changed`/`failed`/`queued` fazem a OS ser ignorada no envio automático

## Escopo desta publicação
- A publicação 122 adicionou o endpoint de contrato; a extensão deve consultá-lo e aplicar as regras acima.
- A extensão incluída anteriormente no app não é substituída nesta publicação: a versão 2.3.0 é requisito da extensão externa que forneceu este contrato.
- As rotas existentes e as travas `mode`, `saveAllowed` e `photoUploadAllowed` permanecem iguais.
- A sessão do Supervisor é a usada pela extensão; outras rotas podem ter permissões adicionais para uso interno do app, mantidas nesta alteração.

## Regras de negócio
- Cliente fixo **91**; unidade Depósito Sorocaba. Uma OS por vez.
- Mais de 5 fotos (`maxFotosSemRevisao`) → vai para "Para conferir" até aprovação no app.
- OS protegidas nunca são tocadas. OS de testes anteriores só voltam com aprovação no app.
- Qualquer divergência: a extensão para, não repete Salvar nem fotos e lista em "Para conferir".
- Envio automático consulta o app a cada minuto (checkbox no popup).
- Horário não bloqueia: o app entrega `executionStartedAt`/`completedAt` entre 08:30 e 16:00, duração ≥ 3 h, e `imasOpenedAt` ≤ início. A extensão não precisa ajustar nada.

## Checklist ao mudar o app (ChatGPT)
1. Mudou campo/rota/formato do Job? Atualize este arquivo e o `/api/imas/contract`.
2. Mudança incompatível? Suba `schemaVersion` (a extensão bloqueia até ser atualizada).
3. Mudou o domínio do app? Avise: o domínio está em `manifest.json`, `rco.js` e `background.js`.
4. Envie o diff deste arquivo ao Claude para ele revisar a extensão.

## Checklist ao mudar a extensão (Claude)
1. Mudou o que lê/escreve no app? Atualize este arquivo e peça ao ChatGPT para ajustar o app.
2. Subiu `CONTRACT_SCHEMA` em `background.js`? O app precisa publicar a mesma `schemaVersion`.
3. Subiu a versão do `manifest.json`? Ajuste `minExtensionVersion` se a nova versão for obrigatória.

## Histórico
- 2026-10-09 · app 2026-10-09.122 — adicionado `GET /api/imas/contract`, exclusivo do Supervisor, sem cache; schema 1 e extensão mínima 2.3.0; limite de 5 fotos, OS/publicId protegidos e 13 OS de testes anteriores. Documentados os campos já existentes no envelope da fila e `approvalRequest: null`. Nenhuma alteração no formato dos Jobs ou nas rotas existentes.
- 2.3.0 — checagem de contrato (`/api/imas/contract`), configuração vinda do app, aviso no popup.
- 2.2.1 — versão auditada base.
- 2026-10-09 · app 2026-10-09.123 — regra de horário: o horário deixa de bloquear OS. O app (ao criar, editar, receber do colaborador e ao montar a fila) ajusta `report.executionStartedAt` e `report.completedAt` para ficar entre 08:30 e 16:00 com duração mínima de 3 h, e `report.imasOpenedAt` nunca posterior ao início (padrão: 08:00 do dia do início). Nenhum campo, rota ou formato mudou (schema 1, extensão mínima 2.3.0): a extensão apenas passa a receber valores já coerentes e não encontra mais "Abertura posterior ao início da execução".
- 2026-10-09 · app 2026-10-09.124 — sem mudança de campos, rotas usadas pela extensão ou formato do Job (schema 1; extensão mínima 2.3.0). Mudanças de comportamento do app: (1) a trava de revisão do Fabrício foi retirada — o erro "Revisão do supervisor…" deixa de aparecer; (2) o engenheiro passou a registrar pedidos (aprovar, rejeitar, devolver, editar e executar lote do mês) que só valem após autorização do supervisor; o lote do engenheiro aparece em Pedidos do engenheiro e só é disparado após Autorizar lote, pela página do supervisor com o mesmo evento `rco-imas-batch` já existente; (3) "Rejeitar": OS nova do app é excluída e nunca criada; OS do IMAS tem os dados zerados e volta à fila do colaborador; (4) prazos da elétrica a partir de 16/10; (5) novas rotas internas do app: `/api/reports/proposals`, `/api/reports/proposals/decide`, `/api/reports/reject`, `/api/imas/batch-request` (a extensão não as usa).

## Ajustes de validação da publicação 124
- Lotes do engenheiro exigem Autorizar lote ou Recusar no painel do supervisor. Abrir a página não autoriza nem dispara lotes. A extensão continua usando o evento existente e aplica suas próprias travas.
- Rejeitar preserva o relatório antigo como Excluída para rastreabilidade; seus dados não preenchem mais a OS retornada ao colaborador nem o acompanhamento. Não há exclusão no IMAS.
- Mantida a validação estrita de datas e horas da publicação 123.

- 2026-10-09 · app 2026-10-09.125 — aprovação confirmada retira imediatamente a OS da revisão e a mostra no filtro Fila. Estados queued/processing/completed prevalecem sobre diagnósticos antigos; uma falha nova após execução continua visível na revisão. Relatórios sem cache. Contrato schema 1 inalterado.

- 2026-10-09 · app 2026-10-09.126 — Aprovar habilitado para OS Devolvida. A aprovação explícita do supervisor valida o relatório e a evidência atuais, encerra a devolução e enfileira em transação única. Claim direto de OS ainda devolvida continua bloqueado. Não há execução IMAS nesta publicação; schema 1 inalterado.

- 2026-10-14 · app 2026-10-14.130 — acompanhamento legível por OS em `GET /api/reports/automation-status` (Supervisor/Engenheiro), revisão mostra motivo/ação/etapa/data. Aprovação continua durável e dispara `rco-imas-approved`; status queued/processing prevalece sobre diagnóstico antigo. Diagnósticos iniciados antes da aprovação atual não podem encerrar seu claim. Schema 1 e envelope da fila preservados; nenhuma alteração nos cliques, fotos, Salvar ou OK da extensão.

- 2026-10-14 · app 2026-10-21.138 — agenda permite antecipar/adiar a data de execução de OS atribuídas ainda sem retorno, pelo próprio setor ou Supervisor. Data original e histórico preservados. Programação não impede execução antecipada; datas de execução/conclusão continuam sendo as informadas no retorno. Campos de programação adicionados à consulta work-orders; sem mudanças no envelope IMAS ou nos cliques da extensão.

- Regra de conclusão (v131): início/fim ausentes ou conclusão futura são corrigidos usando a data/hora de recebimento do retorno na plataforma. Conclusão anterior válida é preservada. Registros antigos usam createdAt como referência, nunca o dia em que a extensão executar. Se a duração mínima gerar horário futuro para uma OS já entregue, prevalece o período concluído informado/recebido. Programação do plano não bloqueia execução antecipada. Fingerprint e formato de Job preservados.


## Publicação 2026-10-16.132 — ajustes operacionais
Schema 1 e extensão mínima 2.3.0 preservados. Nenhum arquivo da extensão foi alterado. Nenhuma OS real foi executada no teste/publicação.

- Timeout: consultas da fila e do estado da automação, e Aprovar, verificam pedidos processing sem atualização de pedido nem diagnóstico há mais de 30 minutos. Uma atualização atômica muda somente esse pedido para failed e registra "execução sem resposta da extensão". A OS volta à Revisão e permite nova aprovação; nenhum upload, criação, baixa ou reenvio é feito por esse caminho. A reapresentação continua exigindo o fingerprint atual. Uma resposta recente ou concorrente impede a expiração.
- Datas: início e conclusão no mesmo dia (dia do início válido), ambos entre 08:30 e 16:00, duração mínima 3 horas e abertura ≤ início. Datas de dias diferentes geram aviso não bloqueante nos formulários. Criação, edição, propostas do engenheiro e Job usam essa regra. A fila normaliza retornos legados sem regravar o histórico. Ausência/data futura continua usando o recebimento original como referência, antes da padronização. A regra de 3 horas desta publicação prevalece sobre a exceção de duração da v131; em retornos muito cedo, o horário padronizado pode ser posterior ao envio e deve ser conferido antes da execução. Não usa a data da automação.
- Evidência de encerramento: ter número oficial e não ter downloadedAt não comprova conclusão. O alerta "Concluída no IMAS, sem baixa no app" exige diagnóstico de conclusão, ou confirmação conhecida do Supervisor (323902). O alerta não altera downloadedAt nem libera a OS protegida. Conferir baixas é a ação da extensão; o app não a simula.
- Corretivas no Acompanhamento mantêm as abas e passam a mostrar data/hora da última tentativa, etapa e último erro de diagnóstico. Não expõem controles brutos.

### Lote do engenheiro (sem segunda autorização)
POST /api/imas/batch-request — sessão engenheiro; body {"month":"2026-10"}. Cria pedido state=authorized por até 6 horas, idempotente enquanto houver outro autorizado válido do mesmo mês. Resposta 201: {"sent":true,"authorized":true,"message":"Lote autorizado. Aguardando a extensão no computador do Supervisor."}.

GET /api/imas/batch-request — sessão supervisor da extensão no computador executor; resposta {"requests":[{"id":"<public_id>","month":"2026-10","authorized":true,"createdAt":<epoch_ms>}]} apenas com lotes autorizados não expirados, Cache-Control:no-store. Não consome os pedidos ao ler. Mantidos os campos id/month já existentes; os demais são aditivos.

Antes de executar, a extensão faz claim: PATCH no mesmo endpoint com {"id":"<public_id>","action":"claim"}, ou compatibilidade {"id":"<public_id>","decision":"apply"}. Resposta {"claimed":true}; repetição/expiração retorna 409. A extensão deve executar somente após claim bem-sucedido e usar o mês do pedido para selecionar as OS. PATCH decision=dismiss continua disponível ao Supervisor. Comando do engenheiro não aparece mais em Pedidos do engenheiro exigindo Autorizar lote. Pedidos legados pending não são autorizados retroativamente. Aprovações individuais, revisão de fotos, fingerprint e proteção contra fotos duplicadas permanecem em vigor. Receber/autorizar o pedido não comprova execução ou baixa: a extensão instalada precisa consumir este contrato e enviar os diagnósticos.


## Publicação 2026-10-20.133 — fila autorizada

Correção compatível (schema 1, mínimo 2.3.0): GET /api/imas/queue preserva o formato, mas job.ready só é true quando os campos são válidos E existe aprovação queued com fingerprint atual e sem falha posterior ao início dessa aprovação. Validade dos campos não equivale a autorização. Relatórios failed/review/returned/rejected/completed ou sem aprovação podem continuar na resposta para consulta, sempre ready=false/approvalRequest=null. O consumidor deve filtrar ready antes de navegar.

Falha posterior à aprovação bloqueia o lote e o claim antigo. O estado apresentado ao Supervisor é failed/Revisão, inclusive se o executor falhou antes de fazer claim e o pedido durável permaneceu queued. Uma nova aprovação explícita cria novo requestId e pode retomar; não há limpeza de tentativas ou liberação de upload. Uma falha iniciada antes da nova aprovação não bloqueia a retomada recém-aprovada.

Proteção de execução reforçada: 323902 e 324279, ou seus publicIds conhecidos, nunca ficam prontas nem são aprovadas para execução. Nenhuma baixa, foto ou data foi alterada nesta publicação. A configuração de protegidas é entregue pelo contrato.

Os arquivos da extensão não foram alterados. Diagnósticos recebidos reportam 2.5.8; o fonte disponível neste repositório permanece a base histórica 2.1.72. Falhas de preenchimento e divergências de status/endTime na 324278 não foram corrigidas por suposição: exigem fonte instalado e inspeção autenticada do IMAS. Não foi executado lote real na validação local.


## Publicação 2026-10-20.134 — responsáveis por cargo e datas preventivas

- `GET/PUT /api/role-responsibles`: cadastro atual por cargo, com revisão otimista e histórico. GET autenticado, PUT somente Supervisor. Elétrica passa para Allan; `imasName` deve ser o nome completo confirmado no IMAS. Sem confirmação, a OS permanece em revisão.
- `work-orders` apresenta o responsável atual do cargo e preserva `originalAssignedResponsible`. As 44 OS elétricas anteriormente atribuídas a Fernando passam a ser consultadas sob Allan, sem trocar executor histórico de `service_reports`, evidências ou baixas. Novas atribuições/importações usam o cadastro.
- Selecionar preventiva preenche início no prazo às 09h e conclusão dois dias depois às 16h, limitada ao dia 20 da competência. Exemplos: 15→17, 19→20 e 20→20. Servidor e Job aplicam fallback se as datas faltarem. Conclusão antecipada informada continua válida; preventivas nunca ultrapassam dia 20. Corretivas mantêm sua regra e podem passar de 20.
- Esta regra de preventivas substitui a normalização de mesmo dia da versão 132 somente para origem sistema. `executorImasName` e `workOrder.plannedExecutionAt/competence/dueAt` são adições compatíveis ao relatório do Job.
- Fotos, upload, cliques, extensão distribuída e proteções 323902/324279 não foram alterados. Nenhuma OS foi executada por esta publicação.


## Publicação 2026-10-20.135 — identificação oficial de Allan

Nome e cadastro IMAS confirmados pelo Supervisor: `ALLAN DOS SANTOS BENIDES - ELETROTÉCNICO`. Cadastro padrão e novas importações usam o nome completo. Jobs passam a usar esse executor oficial, sem exceção por mês para Fernando. Retornos com o rótulo anterior `Allan - Eletrotécnico` permanecem reconhecidos enquanto o responsável atual for Allan dos Santos Benides. Cadastro editado pelo Supervisor tem precedência sobre o padrão. Nenhum executor histórico de Fernando foi trocado. Nenhum relatório, foto, tentativa ou OS do IMAS foi executado por esta publicação.


## Publicação 2026-10-21.138 — continuidade após assumir OS

Correção de regressão da v133 reproduzida em teste: fila retornava `ready=false` imediatamente após uma claim válida mudar a aprovação para `processing`. A extensão consultava novamente antes de preencher e parava com "Corrija os campos pendentes", mesmo sem campos faltantes.

GET /api/imas/queue passa a preservar Job válido e fingerprint aprovado durante `queued` e `processing`, com o mesmo `approvalRequest.requestId` e campo aditivo `approvalRequest.state`. Processing é continuidade da execução existente, não autorização para segunda claim. POST /api/imas/approve action=claim permanece atômico: somente queued→processing; segunda claim recebe409. Falhas posteriores, campos/fingerprint divergentes, ausência de aprovação, processamento expirado e OS protegidas permanecem bloqueados. Nenhum marcador de fotos, histórico ou confirmação de baixa é removido. Fonte da extensão instalada2.5.8 não foi substituída pelo pacote antigo2.1.72.


## Publicação 137 — criação separada da execução e aprovação persistente
- `POST /api/local-orders`, com `workflow=creation`, solicita criação de corretiva/teste sem exigir foto da execução; salva status **Aguardando criação**. Clientes antigos sem esse campo conservam o fluxo legado.
- `POST /api/imas/link` confere e vincula o número oficial como antes; para esse novo fluxo muda o relatório para **Aguardando execução** e a solicitação para `waiting_execution`. Não registra baixa, não envia fotos e não autoriza encerrar imediatamente. Chamadas repetidas com o mesmo número são idempotentes.
- Nessa etapa `GET /api/imas/queue` retorna Job `ready:false`; uma tentativa de claim ou baixa é recusada até o colaborador preencher a execução e anexar evidências por `PATCH /api/reports/edit`. A mesma referência e número são mantidos.
- Aprovação de conteúdo se mantém para `failed`/`completed` sem baixa, desde que o fingerprint ainda corresponda exatamente a dados e fotos. Falha técnica e timeout não voltam para Revisão do supervisor. Alterações de conteúdo invalidam a aprovação anterior.
- Jobs aprovados com erro retornam `approvalRequest` com `state:failed`/`completed`, `ready:false` e erro **Erro do IMAS — reprocessar**. O consumidor deve respeitar `ready`; essa informação não autoriza executar.
- `POST /api/imas/approve` aceita `action:retry`/`force`, com publicId e fingerprint atual, para gerar uma nova solicitação sem pedir nova aprovação. Recusa dados alterados, processamento em curso, OS protegidas e campos obrigatórios inválidos. Fotos e histórico são preservados.
- Forçar fechamento recoloca só a OS aprovada na fila e envia o evento de lote existente `rco-imas-batch` para uma única OS. A extensão deve reler status, campos e fotos antes de retomar; não há instrução de reenviar evidências já vinculadas. Nenhuma trava de identidade da OS, autorização ou equipamento é removida.
- Opção **Encerrado no IMAS** é uma confirmação explícita do Supervisor após conferência externa, envia `expectedNumber` à baixa e encerra a solicitação. É recusada durante a etapa de criação/aguardando execução. Não é uma verificação independente feita pelo servidor.
- Painel de automação usa os eventos existentes: criação individual `rco-imas-create-save`, encerramento em lote `rco-imas-batch`. Separa criar, encerrar preventivas, encerrar corretivas e auditoria. No lote de encerramento as preventivas vêm primeiro. Extensão instalada não foi substituída por arquivos antigos do pacote.
- Schema permanece 1, mínimo 2.3.0. Sem migração de dados existentes; estados são aditivos.


## Publicação 138 — correção do significado de Forçar fechamento (substitui a descrição da v137)
- **Forçar fechamento** significa: Supervisor conferiu que a OS já está encerrada no IMAS; registrar a baixa somente no RCO, retirar da fila/revisão e mostrar como Concluída. Não reprocessa, não abre IMAS, não envia fotos e não dispara eventos da extensão.
- POST `/api/reports/confirm-closed`: exclusivo Supervisor, recebe `{publicId,expectedNumber,fingerprint,confirmed:true}`. Valida número oficial e dados/fotos atuais, confirma status local, downloaded_at, pedido completed e OS vinculada Concluída. Preserva fotos, datas, observações e histórico, acrescentando registro de confirmação manual distinto da execução automática. Repetir confirmação já aplicada é idempotente.
- Confirmação manual não exige nova aprovação de fotos/conteúdo nem envio de execução pendente: a declaração do Supervisor é que a OS já foi encerrada externamente. Bloqueia execução simultânea, número divergente, referência excluída e dados alterados. Não constitui consulta independente ao IMAS.
- Opção **Encerrado no IMAS** usa a mesma confirmação manual. **Voltar à fila** continua sendo a única dessas ações que recoloca para automação.
- POST `/api/imas/approve` action force deixa de enfileirar e retorna 409 orientando atualizar a página, protegendo contra a interface antiga em cache. `retry` e claim permanecem como antes.
- Schema 1, mínimo 2.3.0, extensão instalada inalterada.

## Publicação 2026-10-23.139 — equipamento escolhido pelo colaborador
- `Job.report` passa a trazer `imasEquipmentCode` e `imasEquipmentName` (opcionais; schema continua 1).
- OS corretiva sem `imasEquipmentCode` fica com erro "FALTA EQUIPAMENTO" e não entra na fila de execução.
- A extensão deve adicionar esse equipamento na OS do IMAS ao encerrar (a etapa na extensão vem em versão separada).
