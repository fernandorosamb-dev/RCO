# Aprovação e diagnóstico visível por OS — 14/10/2026

Base: Site v129. As aprovações já eram duráveis e o cliente já disparava `rco-imas-approved` para o executor. Aprovação libera o trabalho; não comprova gravação no IMAS e não deve ignorar datas futuras ou confirmação de encerramento.

Auditoria às 07h56–08h de São Paulo: pedidos registrados incluíam 7 queued, 39 completed, 1 processing e 2 failed. Algumas solicitações queued são antigas e pertencem a relatórios já baixados: não são elegíveis na fila de trabalho. A extensão que enviou os últimos diagnósticos era 2.5.1. Os cliques do executor instalado no computador não foram alterados ou executados neste trabalho.

Motivos identificados: 323154/323155 com conclusão em 15/10; 323158/323159 em 16/10. 324277 e 324278 com encerramento não confirmado após releitura e fotos existentes preservadas. Também houve bloqueio de host pelo Chrome, imas.js ausente e falta de comunicação com a aba RCO. Esses problemas devem ser apresentados ao Supervisor, em vez de exigir interpretação de relatórios técnicos.

Mudanças:
- Consulta autorizada `/api/reports/automation-status`, somente Supervisor/Engenheiro, sem cache, com situação, motivo, ação, etapa e data da última informação, sem controles ou valores capturados do navegador.
- Mesma explicação nos cartões dos Relatórios/Fila e na revisão do Acompanhamento.
- Aprovação continua disparando o executor e retira imediatamente a OS da revisão. Texto distingue aprovação/fila de baixa confirmada.
- Leituras do frontend iniciadas antes de uma aprovação são invalidadas, para que respostas de consultas antigas não recoloquem a OS na revisão. Relatórios atualizam o andamento a cada 15 segundos enquanto abertos.
- Diagnóstico atrasado de uma tentativa anterior não muda uma nova solicitação processing para failed/completed. Quando fornecido, requestId deve corresponder exatamente; para extensões antigas, usa-se o início dos eventos. Um relatório vazio sem requestId não encerra um claim.
- Explicação escolhe a execução mais recente que pertence à aprovação atual, descartando resultados antigos recebidos com atraso.
- Processamento sem atualização recente é mostrado como não confirmado; não libera repetição, não marca baixa e não reenvia fotos automaticamente.
- Contrato schema 1 e envelope da fila preservados. Sem migração de banco nem alteração nos arquivos da extensão.

Validação: testes cobrem fila após aprovação, origem das falhas, datas futuras, leitura por perfil, atraso de diagnósticos, descarte de resultados antigos, atualização de revisão, fingerprint, claim, contrato e consulta de corretivas. Não houve execução real de OS nesta auditoria. Aprovação depende do Chrome/IMAS/extension ativos no computador do Supervisor para executar e confirmar a gravação.
