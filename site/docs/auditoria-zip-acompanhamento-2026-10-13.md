# Auditoria do ZIP e publicação do acompanhamento — 13/10/2026

Referência: `RCO_site_alteracoes_horario(1).zip`. Base atual: Site versão 128, commit `d1dfee65d80b3c15682923c7dfd03e7a9f866af5`.

O `RESUMO.txt` do ZIP solicita somente a divisão do acompanhamento em Preventivas (IMAS) e Corretivas (criadas no app), incluindo testes de equipamentos e os estados Aguardando IMAS / Criada no IMAS / Encerrada / Devolvida. Não há novas regras de horário descritas no resumo. A regra de horário do ZIP já existe no site: início/fim entre 08:30 e 16:00, duração mínima de 3h e abertura nunca posterior ao início. A validação atual é mais rigorosa e foi preservada.

## Problemas encontrados e resolvidos

- O ZIP contém uma cópia anterior de outras partes do site. Substituir o projeto inteiro eliminaria documentos de RH, pendências do Supervisor e avisos, além de regredir concorrência, rejeição de OS, revisão, deduplicação, cache e validação de datas. Só a tela descrita no resumo foi incorporada sobre a base atual.
- A nova tela do ZIP usa `/api/reports`, que deliberadamente omite OS já baixadas para Supervisor/Engenheiro. O contador Encerrada não mostraria o histórico confirmado. Foi criada uma consulta de leitura isolada (`/api/dashboard/correctives`) que inclui baixadas e mantém as permissões por área.
- O campo `status=Concluída` no app indica a entrega do colaborador; não comprova encerramento no IMAS. O contador Encerrada usa `downloadedAt`. Número oficial sem confirmação continua Criada no IMAS. Devolvidas sem baixa continuam Devolvida.
- O ZIP remove a atualização instantânea da revisão após aprovação. O evento atual foi preservado.
- O filtro de áreas do ZIP considera só preventivas. A aba Corretivas usa as áreas das corretivas autorizadas no mês, mesmo se a área não tiver preventiva.
- Falha ao carregar corretivas não fica oculta como zero registros: a tela informa erro.
- Abrir uma OS já baixada na consulta pendente levaria a uma lista vazia. As corretivas têm consulta dos dados e fotos no próprio acompanhamento; Abrir OS permanece para as não baixadas.

## Resultado

Abas separadas, contadores por situação, busca por OS/local/responsável e área, mês da execução para corretivas, leitura do histórico confirmado e fotos protegidas. Dados de banco, rotinas da extensão, envio de fotos/Salvar/OK, fila e documentos RH não foram substituídos ou reprocessados. Não é necessária migração do banco nem atualização da extensão.

## Verificação

Testes específicos com SQLite cobrem encerradas, exclusão de importadas/rejeitadas, foto protegida, permissões de Supervisor/Engenheiro/colaborador, mês de execução versus criação, validação do mês e ausência de mutação. Executar também os testes existentes de revisão e horários, além de compilar o site antes da publicação. Verificação em navegador do computador do usuário não faz parte desta auditoria de código.

Resultado realizado: 61 testes aprovados, zero falhas; compilação de produção concluída. ZIP de referência SHA-256: `aee839c2bcbad0544ce8fb1acc9ceec31c4b09a79fb2ba6da66ff92660b1b2de`.
