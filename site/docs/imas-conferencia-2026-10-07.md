# Relação reservada para conferência final de Fernando

Fonte: mpdf(4).pdf, emitido 07/10/2026 às 10:50:53 (São Paulo), 94 OS abertas.
Não dar baixa por ausência na lista. Fernando conferirá depois de terminar a automação.

- Ainda Aberta no PDF: 323162 (válvula de recalque / Guarita).
- Ausentes da lista de abertas: 323080, 323140, 323145, 323902, 323930, 323963, 323964.
- 323145: upload de 8 fotos confirmado; Save disparado; OK não reconhecido pela extensão.
- Fernando confirmou duas verificações manuais: clique direto em OK; Salvar seguido de Enter no OK.
- Permissão operacional: repetir Salvar no encerramento; nunca repetir o upload de fotos.
- Preservar preenchimento, seleção e envio de fotos que já funcionam.

## Resultado posterior — versão 2.1.55

- OS 323144: execução em 07/10 às 13:55–13:56; fotos vinculadas, Salvar nativo, OK não observado, encerramento confirmado na releitura e baixa no app às 13:56:47.739.
- Executor no app para 323144 e 323145: EVERSON VICENTE FERREIRA - BOMBEIRO HIDRÁULICO. Seleção não foi omitida pelo colaborador.
- Correção 2.1.56: executor validado e preenchido também no encerramento; não alterar fotos, Salvar ou OK.

Fernando conferiu o IMAS em 07/10 às 14:05: clicar Salvar já finaliza; OK é aviso de sucesso. Usar releitura persistida para confirmar a baixa, sem exigir que o popup tenha sido observado.

## Relação da fila do app às 14:06–14:07

Baixa confirmada pela automação: 323144.
Ainda na fila do app (não implica status Aberta no IMAS):
323081, 323082, 323083, 323084, 323085, 323140, 323145, 323156, 323157,
323162, 323163, 323164, 323165, 323166, 323902, 323930, 323963, 323964.
Fernando fará conferência individual após a execução. Não dar baixa ou reenviar fotos por esta relação.
Pedido mais recente: somente relacionar as OS; nesta atualização limitar alteração ao executor.

## Execução em lote autorizada

Fernando pediu execução de todas em 07/10 às 14:05 e perguntou como rodar todas às 14:14.57. Lote sequencial explícito, uma OS por alarme, mesmas rotinas de criação/encerramento, não repetir tentativas antigas; preservar OS em revisão em caso de falha. OS antigas separadas para conferência. Sem baixa em lote feita pelo agente no navegador local.

## Lote com conferência ao final

A versão 2.1.57 continua para a próxima OS quando uma execução falha. Preserva a pendência e o diagnóstico no relatório, sem repetir criação ou fotos da OS incerta. Tentativas antigas permanecem separadas para avaliação. O botão **Baixar relatório do lote** relaciona os números oficiais das baixas confirmadas, as pendências com motivo e as OS restantes. Nos primeiros lotes, Fernando confere o resultado no IMAS antes de liberar qualquer retomada.

## Conferência de Fernando às 15:09 e reprocessamento autorizado às 15:10

- 323081, 323082, 323164, 323165, 323166: sem baixa, sem dados preenchidos e sem fotos no IMAS.
- 323157: dados não preenchidos, fotos já anexadas. Não repetir upload.
- 2.1.58: botão de reprocessamento limitado a essas seis OS e a uma tentativa por OS. As cinco só liberam o envio após confirmação de zero fotos no IMAS. A 323157 usa prepare/observations e retomada final do Save, sem selecionar/enviar fotos. Bloqueios das outras OS são preservados.

## Resultado do reprocessamento e conferência às 16:11

Relatório do lote 77d11bc2-7465-4e50-99dc-1a7020416c9e: iniciado 15:40:26, terminado 15:50:18. Baixas confirmadas: 323157, 323082, 323081, 323164, 323165. Pendência: 323166, envio não confirmado. Fernando confirmou às 16:11 que as fotos da 323166 estão no IMAS, os dados não ficaram preenchidos e a OS permanece Aberta.

2.1.60 libera uma única retomada da 323166 para preencher dados e executar Save/releitura/baixa, pelo mesmo caminho sem upload usado na 323157. Nenhum bloqueio de outra OS é removido.


## Envio automático e revisão — atualização 2.1.63

Solicitação de Fernando: processar novas OS após o envio do colaborador, simplificar botões temporários, manter relatório/auditoria e só registrar baixa com encerramento confirmado; dúvidas ficam em revisão.

- Extensão consulta a fila autenticada do supervisor a cada minuto, com Chrome e sessão disponíveis. Usa exclusivamente o runner existente, sem alterar preenchimento, upload ou Save. Novos pedidos são seriados; tentativa prévia, preparo, gravação ou execução em curso bloqueiam repetição. Pausar lote também pausa entrada automática.
- Históricos dos últimos 30 lotes ficam disponíveis no relatório. Supervisor filtra revisões de todas as competências e pode verificar uma OS por leitura/reload do IMAS, sem preparar campos, reenviar fotos ou salvar. Baixa exige identidade (número/cliente), campos persistidos, status Concluída e contagem de fotos.
- Retirados controles temporários de gravação, liberação, próxima OS e retomada específica de testes da interface. Retirado botão manual OS baixada.
- Datas: antes do dia programado Dentro do prazo; D0, D+1 e D+2 Execução; D+3 em diante Fora de prazo. Dias corridos, calendário de São Paulo.
- Fotos novas: JPEG, lado máximo 800 px, formato quadrado com margem branca/proporção original, qualidade inicial .55, redução progressiva até <=60.000 bytes. A extensão também compacta fotos antigas antes de um primeiro envio autorizado. Não altera fotos já anexadas ao IMAS.
- O PDF é produzido pelo IMAS: não se pode assegurar um teto global de 14 MB apenas com compressão por foto; total depende da quantidade e da geração externa. Limite final deve ser conferido no PDF.
- Testes automatizados cobrem entrada automática sem repetição, pausa, revisão somente leitura, divergência sem baixa, D+2/D+3 e upload sequencial. Execução real depende da atualização local da extensão.


## Compactação forte com base no relatório enviado — 2.1.64

Arquivo de referência: ed._deposito_sorocaba_(sp)_01102026171218.pdf, 218 páginas, 17.163.702 bytes. Imagens únicas com lado >400 px: 327 (inclui capa), streams somando 16.700.114 bytes. Teste de JPEG em memória a 480 px / qualidade 35 (Pillow, sem margem adicional) resultou em 2.893.198 bytes; estimativa, não PDF final gerado no IMAS e não encoder do Chrome. Fotos aparecem em duas colunas (~8,55 cm cada).

Novo padrão de upload no app e extensão: JPEG, máximo 480 px, qualidade inicial .35, redução adaptativa até <=20.000 bytes por arquivo, mantendo proporção, formato quadrado e margem branca. Teto aplicado antes do envio. Nenhuma mudança em preenchimento, Save, OK, seleção/upload ou baixa. Não reenvia ou altera anexos já existentes. A 327 fotos, o teto de bytes do conjunto novo é 6.540.000 (sem estrutura do PDF); fotos ilimitadas não permitem garantia universal de um único PDF <=14 MB. Textos pequenos em etiquetas podem perder legibilidade nesta resolução.


## Padrão de 5 fotos e aprovação do supervisor — 2.1.65

Fernando solicitou média de 5 fotos/OS e compactação automática de fotos originais grandes, sem operação manual dos funcionários. Pode enviar mais de 5, mas a conclusão deve aguardar supervisor.

- JPEG até 480 px e 15.000 bytes por foto, redução adaptativa automática no app e extensão. A 150 OS x 5 fotos: teto 11.250.000 bytes de imagens; margem de 2.750.000 bytes para PDF de 14 MB. Acima desse volume, aprovação humana considera o aumento; PDF externo ainda precisa conferir.
- Novos retornos e OS avulsas com >5 fotos persistem status Aguardando aprovação / photo_approval_status pending. Upload não limita quantidade nem exige compressão manual. Servidor exige arquivos reduzidos e a fila bloqueia pendentes independentemente do botão/UI. Retorno atribuído publica report + metadados das fotos + estado da OS juntos, após uploads.
- Supervisor usa Relatórios > Verificar revisão > Aprovar fotos adicionais e liberar OS. A aprovação só pode ser executada por role supervisor, confere a lista exata de fotos e registra timestamp. Libera o estado Concluída do retorno e OS atribuída para a automação; NÃO registra baixada nem altera IMAS. Baixa continua exigindo verificação externa.
- Edição posterior de uma OS com >5 fotos revoga aprovação e exige nova conferência, inclusive quando a edição mantém o mesmo número de fotos. Redução a <=5 retira necessidade. Baixa tem guarda adicional de aprovação no servidor.
- Registros antigos ainda não baixados com >5 fotos também aparecem para aprovação; os baixados não foram alterados.
- Migração gerada por Drizzle: 0010_panoramic_wendigo.sql, dois campos com defaults D1 seguros, sem backfill. Catálogo histórico tinha colisão nas snapshots 0006/0007; geração feita em staging a partir da última snapshot 0009, preservando integralmente histórico aplicado.
- Testes com SQLite e APIs cobrem 1/5/6/10/14 fotos, permissões, lista de fotos alterada, liberação da fila e OS atribuída, revogação em edição, bloqueio da baixa sem aprovação, e rejeição de arquivos não compactados.

## Revisão no acompanhamento e exclusão por foto — 08/10/2026

Fernando pediu substituir o indicador Sem programação por Revisão, reunindo OS para conferir no IMAS e OS com fotos adicionais para escolher as evidências necessárias. O quadro Revisão do supervisor lê relatórios pendentes e últimos diagnósticos failed/review, sem classificar uma execução running como falha nem duplicar OS com dois motivos.

A revisão mostra fotos e botão Excluir foto. Fotos não excluídas são mantidas. A exclusão só é autorizada ao supervisor, apenas em revisão de fotos, preservando pelo menos uma evidência. Permanece photo_approval_status pending mesmo quando o total fica <=5: a fila e a baixa permanecem bloqueadas até Concluir revisão e liberar OS, que confere a lista exata de fotos restantes. Confirmação não salva no IMAS; apenas libera o fluxo já existente.

Exclusão é bloqueada em registros aprovados/baixados e quando a auditoria indica envio de anexos ao IMAS ou execução em andamento. Não remove fotos já enviadas ao IMAS, não altera cliques, automação ou compactação (480 px / 15 KB, extensão permanece 2.1.65). É possível revisar e excluir pelas fotos tanto no acompanhamento quanto nos relatórios. Testes cobrem chegada a 5 fotos sem liberação prematura, lista antiga recusada na aprovação, última foto protegida, permissões, anexos já enviados e união dos motivos de revisão.


## 08/10 — revisão simplificada

Verificar OS solicita a conferência pela extensão e acompanha o resultado sem expor o relatório técnico. Os diagnósticos continuam disponíveis no backend para investigação. Concluir exige confirmação explícita do supervisor de que conferiu dados, fotos e status Concluída no IMAS; usa o vínculo oficial exato e respeita a aprovação pendente de fotos. Ajustar OS abre o editor existente na revisão. Nenhum código de navegação, preenchimento, envio de fotos, Salvar ou OK da extensão foi alterado.


## 08/10 — liberação sem revisão visual obrigatória

Para excesso de fotos, Liberar automação aprova diretamente a lista atual inteira com confirmação de mantê-la; não declara que o supervisor viu cada foto e não exige abrir a galeria. Revisar OS expande fotos e edição, permitindo excluir antes de liberar. A mesma escolha aparece no acompanhamento e na consulta. A aprovação usa a validação existente da lista exata de fotos; não marca baixa no IMAS nem remove bloqueios de tentativas anteriores. Extensão permanece intacta.


## 08/10 — Aprovar OS em um clique (extensão 2.1.67)

Aprovar OS aprova todas as fotos atuais e registra solicitação durável no backend. Aprovação não equivale a baixa: só a releitura persistida de dados, status e anexos confirma o encerramento. Revisar OS expande fotos/edição; Abrir no IMAS é consulta. Verificar OS e ações manuais de etapas não aparecem mais no site.

Cada solicitação é vinculada ao SHA-256 dos dados e IDs ordenados das fotos. Claim atômico antes da execução impede dois consumidores. Edições invalidam solicitações anteriores; solicitações em processamento bloqueiam alterações pela edição. Atualização da extensão usa a fonte e o atualizador já instalado.

Retomada aprovada lê a OS antes de alterar: encerramento já completo só confirma baixa; galeria vazia segue a rotina existente; fotos completas existentes são preservadas enquanto reaplica os dados e usa a rotina final existente. Quantidade divergente permanece para avaliação sem reenviar. Criação com tentativa anterior continua bloqueada até vínculo do número oficial. A OS 323902 permanece protegida. Nenhuma rotina existente de identificação de campos, upload, Salvar ou OK foi alterada.

Dashboard: removida a visualização do plano/calendário; substituída pelo gráfico de barras de Dentro do prazo, Execução, Fora de prazo e Concluída, usando a mesma contagem dos botões e filtro de área. Barras também filtram a lista.

## 08/10 — processamento agendado da fila parada

Primeiro disparo em 08/10/2026 às 15:00 de São Paulo; de 09/10 em diante, segunda a sexta às 07:00. A agenda da extensão substitui a consulta antiga de 11h/16h por processamento no lote existente. A agenda é ativada automaticamente na atualização desta política. O calendário considera segunda a sexta, sem calendário de feriados adicional.

O disparo marca solicitação local pendente antes de consultar: se há lote ou execução ativa, o intake de um minuto retoma após liberação. Na fila parada, OS prontas sem tentativa anterior voltam a ser elegíveis mesmo já consultadas. Aprovação de fotos, dados obrigatórios, bloqueios de tentativas anteriores e proteção da 323902 são preservados. Não altera rotinas de preenchimento, upload, Salvar ou OK. Depende do Chrome/PC ativo, extensão carregada e RCO logado como supervisor.


## Identidade visual — 08/10/2026
Portal redesenhado com superfícies preto/grafite, ações laranja e nome RCO branco, preservando o emblema original. Login com imagem ilustrativa de manutenção predial. Cabeçalho: Plano de Manutenção Preventivo e Corretivo Predial — Depósito BB · Sorocaba · SP. Dashboard mantém as contagens reais e os filtros, com gráfico circular de conclusão. Nenhuma rotina de preenchimento, fotos ou gravação IMAS foi alterada por esta revisão visual.


## Acesso de consulta do engenheiro — 08/10/2026
Usuário Eng_Luis_Gimenes, papel independente engenheiro. Visualiza acompanhamento, distribuição por área/responsável, relatórios, revisão, fotos e leituras de todas as áreas, com o mesmo escopo de consulta do supervisor. Sem criação, edição, exclusão, aprovação ou acionamento da automação. Rotas de escrita continuam restritas aos papéis anteriores; inclusive a alteração de senha do engenheiro é administrada pelo supervisor. Senha inicial configurada como segredo de execução, ausente do código. Testes verificam bloqueio de todos os handlers de escrita e login em sessão própria. Capa: logo maior em faixa preta acima da imagem, título em três linhas conforme solicitado.


## Documentos de portaria — 08/10/2026
Aba Documentos: saída durante expediente com retorno/não retorno, autorização de entrada com veículo/placa, chegada mais tarde. Colaboradores criam solicitações; supervisor confere, autoriza e imprime; engenheiro apenas consulta. Histórico persistido em service_documents, isolado das OS e da fila IMAS. CPF/nome/função/horários preenchidos a partir dos documentos fornecidos em 25/09/2026, sempre editáveis para conferência; CPF de Luis ausente na referência. Horários dessa referência não substituem alteração posterior de escala. A autorização mantém assinaturas manuscritas na impressão. Não há alteração de dados após autorização: segunda autorização e gravação concorrente são bloqueadas. Impressão HTML A4 com botão imprimir/salvar PDF do navegador.


## Reagendamento solicitado — 08/10/2026
Primeira execução remarcada de 15h para 15h45 São Paulo. A partir de 09/10, segunda a sexta 07h permanece. Versão 2.1.69, alteração somente em agenda/política para reagendar alarme existente; rotinas IMAS preservadas. Publicação não comprova atualização no computador do supervisor.
