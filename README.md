# RCO — Manutenção Predial · Depósito BB Sorocaba

Repositório privado. Dois projetos que trabalham juntos:

- `site/` — site RCO (Next/vinext no Cloudflare, D1 e R2). Painel do supervisor, relatórios, fila para o IMAS e o painel "Automação IMAS".
- `extensao/` — extensão de Chrome "RCO para IMAS" (v3.0.2, só manual). Cria e conclui OS no IMAS 360 pro e dá baixa no app.
- `docs/` — prompt para o ChatGPT e lista de equipamentos do IMAS (código;equipamento).

Contrato entre os dois: `extensao/CONTRATO.md` (schema 1).

## Regras
- Nada de senha, chave ou token no repositório (variáveis como SESSION_SECRET ficam no ambiente de publicação).
- A extensão nunca roda sozinha: só quando o supervisor clica.
- OS protegidas (ex.: 323902) não são alteradas; só recebem baixa se já estiverem Concluídas no IMAS.
