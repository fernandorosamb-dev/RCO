# Contrato RCO ⇄ IMAS

Ao alterar campos, rotas ou o formato de Job da integração IMAS, atualize
`CONTRATO.md` e `app/imas-contract.ts` na mesma alteração. Mantenha `appVersion`
alinhada à publicação que acompanha o contrato. Mudanças incompatíveis exigem
incrementar `schemaVersion` e avisar o usuário antes de publicar.

`GET /api/imas/contract` é exclusivo do Supervisor autenticado. Preserve as
travas de validação e os formatos das rotas existentes, salvo pedido explícito.
