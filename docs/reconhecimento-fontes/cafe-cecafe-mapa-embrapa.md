# Café: Cecafé, MAPA e Embrapa — reconhecimento rápido (passo 4 da onda do café)

**Data:** 2026-10-01. **Situação:** o **resumo diário do Cecafé foi implementado no mesmo dia** (nível 4 em dev, ADR 0038),
com a autorização do usuário; MAPA, Embrapa e o resto do Cecafé seguem no nível 1, sem coletor. A pergunta era a mesma do reconhecimento de Abimilho e CNA
(`docs/reconhecimento-fontes/abimilho-cna.md`): estas fontes trazem dado **original** ou só **republicam** o que o
FinMind já coleta (Conab, ADR 0029; Comex Stat, ADR 0028; USDA PSD, ADR 0031; NOAA, ADR 0030; ICE, ADR 0032)?

## Resumo

| Fonte | Dado original? | Recomendação |
|---|---|---|
| **Cecafé** — resumo diário das exportações | **Sim.** Certificados de origem emitidos por dia, por porto, em **arábica, conilon e solúvel** | **Candidata**: dado diário e antecipado (o Comex Stat é mensal) com a quebra arábica × conilon, que o Comex Stat não tem. Implementar só com autorização |
| Cecafé — relatórios mensais (por tipo de café, por destino, por porto) | Sim, mas em PDF | **Não implementar:** o `robots.txt` do Cecafé proíbe robôs em `/*.pdf$` e em `/wp-*/`, onde os PDFs ficam |
| Cecafé — IPEP (Arábica e Conilon) | Índice calculado pelo Cecafé (participação do produtor no preço de exportação), trimestral | Não implementar: é um indicador derivado de outros preços, não dado bruto |
| Cecafé — preços (Cepea, OIC, Minas, Vitória), produção, consumo, estoques | Não: republica Cepea, OIC, Conab e outros | Não implementar |
| **MAPA** — Sumário Executivo do café, VBP | Não: o Sumário mensal compila Conab, Comex Stat e Cecafé; o VBP é a produção da Conab vezes o preço do Cepea | **Não implementar** |
| **Embrapa** — Observatório do Café (Consórcio Pesquisa Café) | Não: relatórios e boletins que compilam Conab, Cecafé, OIC e MAPA | **Não implementar** |

## Cecafé — resumo diário (evidência de 2026-10-01)

Página `https://www.cecafe.com.br/dados-estatisticos/exportacoes-brasileiras/resumo-diario/`, HTML (fora das áreas
proibidas pelo `robots.txt`), sem login:

| # | Pergunta | Resposta |
|---|---|---|
| 1–3 | API, autenticação, chave | Não há API: tabela HTML, sem login nem chave |
| 4 | Formato | 6 tabelas HTML: "Emissão de Certificados de Origem" e "Unidades de Despachos Aduaneiros", por unidade (Santos, Vitória, Rio de Janeiro, Salvador, REDEX/EADI de Minas Gerais, outros e total), em sacas de 60 kg, com **arábica, conilon e solúvel** separados, para o **dia**, o **acumulado do mês** e o **mês anterior** |
| 5 | Documentação | Nenhuma além dos rótulos da página |
| 6 | Histórico | **Só o mês atual e o anterior**: o histórico teria de ser acumulado a partir da 1ª coleta (o mensal antigo existe só nos PDFs, proibidos a robôs) |
| 7 | Revisa? | Não medido. O "acumulado do mês" se refaz a cada dia |
| 8 | `published_at` | A página diz "Informações recebidas até: 30/09/2026": a data do dado, real |
| 9 | Limite | Não encontrado; página de ~1,5 MB (o tema do site é pesado) |
| 10 | Licença | **A página de termos de uso do Cecafé existe, mas está vazia** (`/termos-de-uso/`, só o título, conferido em 2026-10-01): não há restrição escrita. O `robots.txt` não proíbe esta página. Os números são do Cecafé, uma associação privada: citar a fonte |
| 11 | Riscos | Raspagem de HTML sem contrato (quebra se o layout mudar); "certificado de origem" é a intenção de embarque, não o embarque registrado no Comex Stat: os números não são iguais aos do Comex |

**Exemplo real (set/2026, informações até 30/09):** certificados de origem emitidos no mês: **4.072.399 sacas**, sendo
2.895.876 de arábica, 877.430 de conilon e 299.093 de solúvel (agosto inteiro: 3.725.093). Santos responde por 2,44
milhões; Vitória, onde sai o conilon, por 0,80 milhão.

## Recomendação

- **Cecafé, resumo diário: implementar, se o usuário autorizar.** É o único dado diário de exportação de café e o
  único com arábica e conilon separados. O histórico começa na 1ª coleta: o valor está em ter a série daqui para
  frente, com o dia exato.
- **Os demais: não implementar.** Republicam fontes que o FinMind já coleta ou ficam atrás de uma proibição explícita a
  robôs.

## Fontes

- Cecafé: https://www.cecafe.com.br/dados-estatisticos/exportacoes-brasileiras/ e `/resumo-diario/`; `robots.txt` em https://www.cecafe.com.br/robots.txt
- Agência Gov (estimativa da Conab de 2026, mostrando que o MAPA divulga a Conab): https://agenciagov.ebc.com.br/noticias/202609/producao-de-cafe-e-estimada-em-67-6-milhoes-de-sacas-influenciada-por-bienalidade-positiva-em-2026
- Embrapa, Observatório do Café: https://www.embrapa.br/en/busca-de-noticias/-/noticia/2473940/consorcio-pesquisa-cafe-disponibiliza-analises-periodicas-no-observatorio-do-cafe
