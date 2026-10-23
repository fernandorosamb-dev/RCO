# Data de execução e conclusão — v131

Colaboradores podem escolher uma data anterior ou posterior para OS atribuída ainda sem retorno: Reprogramar OS > data > Salvar. Motivo opcional. Supervisor também altera; Engenheiro consulta. Mudança vale para ordenação, agenda e indicadores. Data original e histórico por revisão são preservados. Cada alteração registra perfil, data anterior, nova data, motivo e horário. Controle de revisão impede sobrescrever uma mudança concorrente. OS com retorno/baixa/processamento não têm seus dados de execução modificados pela reprogramação.

Conclusão antecipada é permitida. Programação do plano não é data obrigatória da execução. Conforme instrução posterior do Supervisor, conclusão inválida/ausente/futura é corrigida automaticamente tomando como referência o recebimento do retorno. Em retornos antigos, usa-se createdAt, nunca a data em que a automação rodar. Data anterior válida é mantida. A duração mínima não pode criar horário futuro para uma OS já entregue: nesse caso, prevalece o intervalo válido informado ou o recebimento. Campos de datas no envio são opcionais; o formulário explica a regra.

A correção de registros antigos é feita no Job enviado à extensão, preservando o dado original e o fingerprint da aprovação já existente. Os novos retornos persistem os valores corrigidos. Não são alteradas OS baixadas e não são executadas OS como parte desta publicação. A extensão, fotos, Salvar e OK permanecem intactos.

Nova migração 0016 contém somente duas tabelas de programação/histórico; migrações anteriores são imutáveis. Contrato schema 1 preservado.
