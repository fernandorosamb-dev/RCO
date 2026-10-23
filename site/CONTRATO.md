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
  "appVersion": "2026-10-09.124",
  "minExtensionVersion": "2.3.0",
  "config": {
    "maxFotosSemRevisao": 5,
    "osProtegidas": ["323902"],
    "publicIdsProtegidos": ["4e9bd0d3-5e4f-4f25-8301-2942d04dc0d1"],
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
  `observations`, `environment`, `floor`, `imasSubject`, `imasSystem`, `photos[]` (`{publicId,url}`), opcionais `imasActivation`, `imasClientReference`
- `approvalRequest`: `{requestId}` quando há aprovação válida na fila; `null` quando não há. Só é devolvido para um Job pronto, com aprovação enfileirada e impressão dos dados ainda correspondente ao relatório
- `report.automationState` (opcional): `processing`/`changed`/`failed`/`queued` fazem a OS ser ignorada no envio automático

## Escopo desta publicação
- A alteração adiciona somente o endpoint de contrato; a extensão deve consultá-lo e aplicar as regras acima.
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
- 2026-10-09 · app 2026-10-09.124 — sem mudança de campos, rotas usadas pela extensão ou formato do Job (schema 1; extensão mínima 2.3.0). Mudanças de comportamento do app: (1) a trava de revisão do Fabrício foi retirada — o erro "Revisão do supervisor…" deixa de aparecer; (2) o engenheiro passou a registrar pedidos (aprovar, rejeitar, devolver, editar e executar lote do mês) que só valem após autorização do supervisor; o lote do engenheiro é disparado pela página do supervisor com o mesmo evento `rco-imas-batch` já existente; (3) "Rejeitar": OS nova do app é excluída e nunca criada; OS do IMAS tem os dados zerados e volta à fila do colaborador; (4) prazos da elétrica a partir de 16/10; (5) novas rotas internas do app: `/api/reports/proposals`, `/api/reports/proposals/decide`, `/api/reports/reject`, `/api/imas/batch-request` (a extensão não as usa).
