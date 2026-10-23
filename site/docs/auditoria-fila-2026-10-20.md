# Auditoria da seleção da fila — 20/10/2026

Defeito confirmado no servidor: job.ready era calculado apenas a partir dos campos, independentemente do estado da solicitação de automação. Por isso, falhas e itens sem aprovação podiam aparecer como prontos em Executar todas. Consulta encontrou 17 solicitações failed e seis queued, algumas antigas; quantidades da base não equivalem à fila efetivamente executável.

Correção: validade + aprovação queued + fingerprint atual + ausência de falha posterior. Sem autorização: ready=false e approvalRequest=null. O claim antigo após falha é recusado; aprovação nova gera novo identificador, sem resetar fotos/tentativas. Reforçada proteção de 323902/324279, confirmadas concluídas pelo Supervisor. Nenhuma alteração de dados ou execução IMAS.

Diagnóstico independente: extensão reportada 2.5.8; último erro da 324278: divergências status/endTime após tentativa Salvar, com uma foto detectada e uma esperada. Diversas falhas de Preencher campo têm trace extenso na projeção limitada da consulta; não se conclui qual campo faltou sem a parte final/inspeção. Houve também comunicação com a aba RCO sem resposta. Esses fatos não comprovam uma causa única nos cliques.

Acesso disponível: Sites para fonte/diagnósticos. O navegador acessível não tem abas e a interface de controle do Chrome local não está disponível nesta conversa. Não foi possível supervisionar execução real. A busca dos arquivos disponíveis não encontrou fonte 2.5.8. Preservados os arquivos da extensão histórica; não devem ser instalados sobre 2.5.8.

Verificação: script scripts/test-adjustments-20261016.sh, agora com regressões da fila, falha após aprovação, bloqueio de claim antigo e proteção de 324279. Compilação de produção. Nenhuma promessa de baixa confirmada por teste local.
