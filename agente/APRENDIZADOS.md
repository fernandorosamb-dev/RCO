# Aprendizados do processo RCO + IMAS

Formato: data · sintoma · causa · regra para evitar.

- 2026-10-23 · OS corretivas aprovadas não encerravam (325134, 325136) · IMAS não conclui sem Equipamento vinculado e o RCO não tinha essa informação · Colaborador escolhe o equipamento no RCO (lista do IMAS, obrigatório); OS sem equipamento aparece como FALTA EQUIPAMENTO.
- 2026-10-23 · Site entregue sobre código velho quase apagou o que o ChatGPT publicou · cópia local era a 2026-10-09.124 e o ar estava na .138 · Sempre conferir appVersion no ar e usar o zip mais recente antes de alterar.
- 2026-10-23 · Letras brancas sobre fundo claro na Revisão da OS · tema escuro sem regra para `bg-cyan-50` · Ao usar nova cor de fundo, adicionar a regra no tema escuro (globals.css).
- 2026-10-22 · OS aprovada voltava para Revisão · falha técnica do IMAS misturada com aprovação de conteúdo · "Erro do IMAS" é fila separada; a aprovação é mantida.
- 2026-10-22 · "O IMAS não confirmou todas as fotos" · contagem de fotos vinculadas lida do formulário antes de salvar · Contar pelo servidor ("tem (N) fotos vinculadas") e retomar sem reenviar fotos.
- 2026-10-22 · "Já houve tentativa de envio/encerramento" · tentativa anterior marcada no app · OS aprovada com erro vai por Reabrir OS / Forçar fechamento, que limpa só a tentativa daquela OS.
- 2026-10-22 · "Nenhuma OS pronta na fila" depois de recarregar a extensão · aba do RCO continuava com a versão antiga · Apertar F5 no RCO após recarregar a extensão.
- 2026-10-22 · "Há um formulário em edição" · aba do IMAS em formulário · Voltar à lista de OS antes de iniciar o lote.
- 2026-10-22 · OS concluída no IMAS sem baixa no RCO (323902, 324277, 324278) · baixa não confirmada · Botão "Já está OK no IMAS — encerrar no RCO" (supervisor).
- 2026-10-22 · OS 323139 e 323175 concluídas no IMAS sem relatório no RCO · nenhum relatório para a extensão baixar · Marcar como concluída direto no RCO (supervisor).
- 2026-10-22 · 324314 concluída à mão com equipamento errado e 0 fotos · fechamento manual sem conferir · Conferir equipamento e fotos antes de concluir à mão.
- Ferramenta: escrita de arquivo na pasta do usuário às vezes chega velha; conferir tamanho depois de gravar e regravar se diferente.
