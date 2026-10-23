# Entrega de documentos ao RH

Aba Documentos > Atestado / declaração de horas. Registros em `medical_documents` e anexos privados em R2. Não envolve OS nem IMAS.

O colaborador informa seu nome cadastrado, função, tipo de documento e período. Uma foto ou PDF legível é obrigatório. Fotos grandes são preparadas separadamente das fotos das OS: até 2000 pixels, JPEG 90%, limite de 10 MB. Não exigir diagnóstico, CID ou CPF neste formulário.

Supervisor e Engenheiro recebem avisos independentes. Reconhecer um aviso só altera o marcador de leitura do respectivo perfil. O Engenheiro continua sem poder criar ou alterar documentos.

## Situação atual: envio pelo computador aguardando liberação

O usuário escolheu envio via Gmail aberto no computador. A base separada está em `tools/rh-gmail-extension`, apenas consulta. `GET /api/medical-documents/desktop-queue` é exclusivo do Supervisor e retorna `automationEnabled: false`. Novas entregas ficam `pending_supervisor`; a tela do Supervisor abre a lista de pendentes e permite alternar para todas. As notificações continuam separadas para Supervisor e Engenheiro.

A liberação poderá ser concluída na terça-feira, 13/10/2026, com teste do Gmail real. Não instalar, ativar nem enviar mensagens antecipadamente. Não alterar a extensão IMAS. Nenhuma data liga o envio automaticamente.

## Alternativa futura: Gmail API do supervisor

Nenhuma caixa foi conectada nesta publicação. A plataforma registra `pending_supervisor`, informa isso ao colaborador e não faz chamadas de envio sem configuração completa.

A alternativa Gmail API exige liberação explícita (`RCO_MEDICAL_EMAIL_ENABLED=true`, `RCO_MEDICAL_EMAIL_MODE=api`), além das seguintes configurações seguras. Nenhum desses ativadores está ligado:

- `RCO_GMAIL_CLIENT_ID`: cliente OAuth Google com Gmail API habilitado.
- `RCO_GMAIL_CLIENT_SECRET`: segredo desse cliente.
- `RCO_GMAIL_REFRESH_TOKEN`: autorização offline concedida pelo titular da caixa com escopo `https://www.googleapis.com/auth/gmail.send`.
- `RCO_GMAIL_FROM`: endereço real da caixa autorizada, ou alias autorizado nessa mesma conta.

Obter os dados por uma conexão OAuth legítima; não solicitar senha do Gmail nem registrar credenciais no código, logs ou documentos. Revogar ou expirar autorização deixa os próximos envios como falha, sem perder a entrega do documento.

Remetente: a própria caixa autorizada. Destinatários fixos no servidor: Bianca `bianca@rcoengenharia.com`, cópia `luis.gimenes@rcoengenharia.com`. Corpo padronizado por `medicalEmail`, com nome, função, local, tipo, período, protocolo, observação opcional e assinatura Fernando da Rosa, Supervisor de Manutenção. Arquivo anexado à mensagem MIME. Não envia links públicos de anexos.

Envio: documento persistido, atualização condicional para `sending`, renovação OAuth, chamada única Gmail `users/me/messages/send`, gravação do identificador retornado. `sent` significa aceite pelo Gmail, não leitura pelo RH. Repetir uma entrega com o mesmo token não cria outra entrega nem outro e-mail. Se perder a confirmação após iniciar o envio, fica `review`: não repetir automaticamente. `failed` significa rejeição conhecida ou falha anterior ao envio. Somente Supervisor pode tentar encaminhar registros `pending_configuration`, `pending_supervisor` ou `failed`; `sent`, `sending` e `review` não são reenviados por esse botão. Pendências anteriores à conexão podem ser encaminhadas na lista pelo Supervisor.

## Validação

`node --test tests/medical-documents.test.mjs tests/service-documents.test.mjs tests/engineer-access.test.mjs`: persistência, permissões, leitura separada de avisos, anexos protegidos, ausência de envio sem configuração, destinatários, MIME, períodos e não repetição em resultado incerto. Testes usam Gmail simulado e não encaminham mensagens reais ao RH.
