# EIA — etanol combustível dos EUA: reconhecimento (nível 1) e implementação (nível 5)

**Data:** 2026-09-23. **Situação:** implementada no escopo do FEL 1 (fator do milho "Demanda de etanol e
biocombustível"; dado "Produção de etanol, estoques"). Decisão e resultado: ADR 0024.

| # | Pergunta | Resposta (evidência de 2026-09-23) |
|---|---|---|
| 1 | API oficial? | Sim, a API v2 (`api.eia.gov`), que exige chave. O mesmo dado está nas planilhas históricas por série (`/dnav/pet/hist_xls/<SOURCEKEY>w.xls`), usadas aqui |
| 2 | Pública ou autenticada? | Planilhas públicas. API: 403 `API_KEY_MISSING` sem chave |
| 3 | Cadastro ou chave? | Planilhas: não. API: chave gratuita (cadastro em `eia.gov/opendata/register.php`), ainda não criada |
| 4 | Formato | XLS (aba "Data 1": "Sourcekey", depois data da semana + valor). Tabelas do WPSR também em CSV (`ir.eia.gov/wpsr/tableN.csv`), só com as semanas recentes |
| 5 | Documentação | Página de cada série no site (ex.: "Weekly Ethanol Production") e calendário oficial do WPSR |
| 6 | Histórico | Semanas desde **2010-06-04** (851 por série até 2026-09-18), sem lacuna |
| 7 | Revisa? | **Não medido.** A planilha só traz o valor atual. As 8 amostras conferidas contra a tabela do WPSR de 2026-09-23 são iguais |
| 8 | Publicação | Quarta, depois das 10:30 ET; em semana com feriado, quinta; fechamentos extraordinários (Natal de 2025: segunda, 10 dias depois). A página de calendário lista as exceções de ~2 anos |
| 9 | Limite de requisições | Não verificado (3 requisições por coleta) |
| 10 | Licença | **Domínio público** ("U.S. government publications are in the public domain"), citação pedida |
| 11 | Riscos | (a) Sem chave, depende da planilha do site, não da API documentada. (b) Datas de publicação de fechamentos extraordinários antigos são desconhecidas. (c) O `curl` do Git Bash não conecta (o `fetch` do Node funciona), como em outros hosts do governo dos EUA |

## Recomendação e o que foi feito

**Adotar.** Implementadas produção e estoques semanais (coletor `eia-etanol`, ADR 0024). Se a chave da API for
criada, dá para trocar a via de download sem mudar o dado.

**Não coletado:** consumo, comércio exterior e dados mensais de etanol, e o milho usado para etanol (USDA/WASDE).

## Fontes

- Weekly Ethanol Production: https://www.eia.gov/dnav/pet/pet_pnp_wprode_s1_w.htm
- WPSR — calendário de divulgação: https://www.eia.gov/petroleum/supply/weekly/schedule.php
- Copyrights and Reuse: https://www.eia.gov/about/copyrights_reuse.php
