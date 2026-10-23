# Base para envio de documentos pelo Gmail aberto no computador

Extensão separada da RCO/IMAS. Versão 0.1.0 apenas consulta a fila autenticada do Supervisor. O endpoint retorna mensagem, destinatários e anexo privado, mas o worker só extrai protocolo e contagem. Nenhum dado médico ou anexo é mantido no armazenamento local da extensão.

**Envio desativado**, aguardando validação e liberação no computador a partir de terça-feira, 13/10/2026. Nenhuma data habilita envio automaticamente. Não há botão ativador escondido, worker automático, comandos de Gmail ou código que clique em Enviar nesta base.

Na terça-feira: observar o Gmail real de `fernandorosa.mb@gmail.com`, preparar uma mensagem com anexo, validar remetente/Para/Cc/corpo e confirmação em Enviados, antes de implementar e liberar o executor. Só então adicionar a permissão de host Gmail e o agendamento necessários. O site deverá controlar claim e confirmação persistentes; documentar qualquer resultado incerto como revisão para impedir mensagem ou anexo duplicados. Não marcar documentos como enviados apenas porque ficaram em rascunho. Destinatários fixos: Bianca `bianca@rcoengenharia.com`, cópia `luis.gimenes@rcoengenharia.com`.

Instalação e teste no computador ficam para a liberação. Arquivos desta pasta não integram nem substituem a extensão IMAS.
