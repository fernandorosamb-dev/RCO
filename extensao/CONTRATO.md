# CONTRATO RCO ⇄ IMAS (fonte única de verdade)

Este arquivo vale para qualquer plataforma (ChatGPT, Claude, outra). Quem mudar o app RCO
ou a extensão DEVE atualizar este arquivo na mesma alteração e subir a `schemaVersion`
se o formato mudar de forma incompatível.

Versão do contrato: **schemaVersion 1** · Extensão: **2.4.0**

## Peças
- **App RCO** (feito pelo ChatGPT): https://rco-manutencao.fernandorosa-mb.chatgpt.site — login de Supervisor.
- **Extensão Chrome "RCO para IMAS"**: lê a fila do app e preenche o IMAS (https://admin.rcoengenharia.com).
- **IMAS 360 pro**: sistema de OS do cliente (formulário `/ordem_servico_form.php`).

## Endpoints do app usados pela extensão (todos autenticados pela sessão do Supervisor)
| Método | Rota | Uso |
|---|---|---|
| GET | `/api/imas/contract` | **NOVO.** Versão do contrato e configuração (abaixo). |
| GET | `/api/imas/queue` | Fila de OS: `{ jobs: [Job] }` |
| POST | `/api/imas/link` | `{publicId, osNumber}` vincula o número gerado no IMAS |
| POST | `/api/imas/approve` | `{action:'claim', publicId, requestId}` consome aprovação do supervisor |
| POST | `/api/imas/diagnostics` | recebe o diagnóstico da execução (`state`: running/review/failed/completed) |
| PATCH | `/api/reports/downloaded` | `{publicId, expectedNumber}` dá baixa |
| GET | `/api/photos/<id>` | foto da evidência; **deve ser `image/jpeg`** |

## GET /api/imas/contract
```json
{
  "schemaVersion": 1,
  "appVersion": "2026-10-09.1",
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
- `approvalRequest` (opcional): `{requestId}` quando o supervisor aprovou OS em revisão
- `report.automationState` (opcional): `processing`/`changed`/`failed`/`queued` fazem a OS ser ignorada no envio automático

## Regras de negócio
- Cliente fixo **91**; unidade Depósito Sorocaba. Uma OS por vez.
- Mais de 5 fotos (`maxFotosSemRevisao`) → vai para "Para conferir" até aprovação no app.
- OS protegidas nunca são tocadas. OS de testes anteriores só voltam com aprovação no app.
- Qualquer divergência: a extensão para, não repete Salvar nem fotos e lista em "Para conferir".
- Envio automático (checkbox no popup, nasce desligado) roda em ciclos fixos às 09h, 13h e 17h (São Paulo); consulta o app com até 3 tentativas de 25 s, abre/acorda a aba do RCO se preciso e o login salvo do IMAS é usado sem intervenção. Botão "Rodar ciclo agora" executa o mesmo ciclo na hora.

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
- 2.4.0 — motor carregado direto de background.js (corrige "Service worker registration failed. Status code: 2"); schedule.js não é mais usado.
- 2.3.3 — marcador de vida do motor e diagnóstico automático no popup.
- 2.3.2 — limites de tempo e mensagens claras quando a aba do RCO não responde.
- 2.3.1 — envio automático desligado por padrão; aprovações no app só rodam com ele ligado ou pelo botão "Executar todas as prontas" (com confirmação).
- 2.3.0 — checagem de contrato (`/api/imas/contract`), configuração vinda do app, aviso no popup.
- 2.2.1 — versão auditada base.
- ext 2.5.0 — envio automático em ciclos 09h/13h/17h (antes: a cada 1 min); consulta da fila com timeout de 25 s e 3 tentativas (antes 4,5 s, causa de "A aba do RCO não respondeu"); abre a aba do RCO se fechada; popup mostra próximo/último ciclo e botão "Rodar ciclo agora". Preenchimento do formulário mais rápido: pausas fixas reduzidas (busca do cliente 2 s→0,5 s, editor/observação, navegação 2 s→0,8 s); nenhuma pausa/validação de Salvar, envio de fotos, OK e releitura foi reduzida. Sem mudança de formato, rotas ou schema (contrato inalterado).
