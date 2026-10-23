# Pacote para o ChatGPT — Site RCO | Manutenção Predial · Depósito BB Sorocaba (21/10/2026)

Anexe este pacote inteiro ao ChatGPT e cole o texto abaixo da linha. Conteúdo:
- `site/` — código atual do site, JÁ com o painel "Automação IMAS" (app/AutomacaoPanel.tsx).
- `equipamentos_IMAS_cliente91.csv` — 272 equipamentos do IMAS (código;equipamento).
- `site/CONTRATO.md` — contrato site ↔ extensão "RCO para IMAS" (schema 1).

---------------------------------------------------------------------

Você mantém o site RCO (Next/vinext, Cloudflare, D1/R2). O código atual está na pasta `site/`. Faça os ajustes abaixo, rode build e testes (`node --test tests/*.test.mjs`), publique e me diga o `appVersion` novo. Preserve TODAS as OS, fotos, relatórios, usuários e histórico. Não quebre o contrato com a extensão (schema 1; minExtensionVersion 2.3.0 hoje — pode subir para 3.0.0 só por causa dos botões novos, e avise antes). A extensão "RCO para IMAS" 3.0.0 é manual: nada roda sozinho.

## 1. Manter o painel "Automação IMAS" (já está no código)
`app/AutomacaoPanel.tsx`, mostrado ao supervisor na aba Acompanhamento. Cinco funções, todas por clique do supervisor, que disparam eventos que a extensão executa:
1. Criar OS corretivas (evento `rco-imas-run-create`): cria no IMAS as OS criadas no RCO e devolve o número ao app.
2. Concluir OS corretivas (`rco-imas-run-corrective`).
3. Concluir OS preventivas liberadas (`rco-imas-run-preventive`).
4. Auditoria do processo: lista os erros que a extensão registrou (`GET /api/imas/diagnostics`).
5. Forçar fechamento (`rco-imas-force` com `{publicId}`): para OS travada por erro.
Não remova nem renomeie esses eventos. Revise o componente e o visual, mantendo o comportamento. Se algum botão ficar desabilitado sem motivo, corrija.

## 2. "Erro do IMAS" separado da "Revisão" do supervisor
Problema: OS que o supervisor JÁ aprovou voltam para "Revisão" quando a extensão falha (ex.: "O IMAS não confirmou todas as fotos vinculadas") ou quando o processamento fica parado mais de 30 minutos. O supervisor precisa aprovar de novo toda vez. Isso mistura dois assuntos: aprovar o conteúdo (decisão do supervisor) e erro técnico do IMAS (automação).
Regra nova:
- **Revisão** = só OS cujo conteúdo o supervisor precisa aprovar (fotos demais, dados divergentes). Mantém Aprovar / Rejeitar / Revisar.
- **Erro do IMAS** = seção/aba SEPARADA para falhas da automação (login, fotos não confirmadas, janela não apareceu, extensão sem resposta). Cada cartão: número da OS, etapa em que parou, motivo, hora, nº da tentativa e botão **Reprocessar**, que recoloca SÓ aquela OS na fila, já aprovada. Pode ter "Ver diagnóstico".
- Quando uma OS aprovada falha, a aprovação é MANTIDA. Ela sai da fila normal, vai para "Erro do IMAS" e só volta para `queued` no Reprocessar, sem pedir nova aprovação.
- A aprovação só é consumida quando a baixa é confirmada (`PATCH /api/reports/downloaded`) ou o supervisor rejeita.
- `processing` parado por mais de 30 min sem diagnóstico novo → "Erro do IMAS" (motivo "extensão sem resposta"), mantendo a aprovação.
- `/api/imas/queue` continua devolvendo a OS com `approvalRequest` até a baixa. Para OS em "Erro do IMAS": `ready:false` e `errors:["Erro do IMAS — reprocessar"]` até o Reprocessar.
- Reprocessar não altera fotos nem relatório; só limpa o estado de erro.
- OS que o supervisor já resolveu manualmente no IMAS (Concluída lá) devem poder ser marcadas como concluídas no app sem passar por revisão (a extensão faz isso pelo botão Forçar fechamento via `PATCH /api/reports/downloaded`). Garanta que, após a baixa, a OS saia de Revisão e de Erro do IMAS e apareça como Concluída.

## 3. Equipamento obrigatório nas OS corretivas de Climatização
O IMAS não conclui OS de Climatização sem Equipamento vinculado.
- Em "Nova OS" (corretiva) com sistema Climatização (por segurança, qualquer sistema), exigir **Equipamento**, escolhido em lista pesquisável (código + nome). Lista inicial: `equipamentos_IMAS_cliente91.csv`. Guarde essa lista no banco para poder atualizar depois.
- Gravar `imasEquipmentCode` e `imasEquipmentName` no relatório e devolvê-los em `Job.report` na fila.
- OS sem equipamento: alerta no painel "FALTA EQUIPAMENTO — escolha no app ou no IMAS antes de encerrar".
- O mecânico de Refrigeração escolhe ao lançar o relatório; o supervisor pode corrigir.
- OS preventivas já vêm do IMAS com equipamento: não exigir nada nelas.

## 4. Limpar botões sem uso
Manter só o que o trabalho usa: Acompanhamento, Distribuir, Nova OS, Planilha, Relatórios, Documentos, Senha, Sair, Atualizar, abas Preventivas/Corretivas, filtros de área e status, nos cartões: Abrir OS, Reprogramar OS, Consultar serviço e equipamento / TAG, na Revisão: Aprovar, Rejeitar, Revisar, e o painel Automação IMAS. Remova botões de teste, diagnóstico antigo e automação por horário (removida da extensão). Liste em `RESUMO.txt` o que foi removido.

## 4b. Concluir manualmente OS que já foi baixada no IMAS (sem relatório no app)
Caso real: as OS 323139 e 323175 aparecem em "Fora de prazo" no painel de Acompanhamento, mas já estão **Concluídas no IMAS** (conferido). Como o colaborador não enviou relatório pelo app, a OS não tem relatório para a extensão dar baixa, e ela nunca sai do painel.
- Nos cartões de OS do Acompanhamento (perfil supervisor), quando a OS NÃO está concluída, adicionar o botão **"Marcar como concluída (já baixada no IMAS)"**, com confirmação ("Confirme que esta OS já está Concluída no IMAS").
- Ao confirmar: a OS passa a Concluída no app, registrando data/hora e usuário (supervisor) e o motivo "Concluída direto no IMAS". Preservar histórico; não apagar nada; permitir desfazer pelo supervisor.
- Não depende da extensão. Opcional: guardar `concludedInImas: true` para diferenciar de OS concluída por relatório.
- Depois de marcada, a OS sai de "Fora de prazo / Execução" e conta como Concluída nos totais e nos relatórios.
- Aplicar nas OS 323139 e 323175 após publicar (ou deixar o botão pronto para o supervisor clicar).

## 5. Como entregar
- Rodar build e testes; informar `appVersion` novo e se há incompatibilidade com a extensão.
- Entregar o zip do site atualizado, como nas publicações anteriores.
