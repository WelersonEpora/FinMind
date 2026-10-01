# World Gold Council (Goldhub) — ETFs, demanda e oferta de ouro — reconhecimento

**Data:** 2026-10-01. **Situação:** **implementado no mesmo dia, para uso interno com o risco da licença aceito pelo
usuário** (opção 2 abaixo; nível 4 em dev; ADR 0037). Antes de qualquer uso comercial, pedir permissão ao WGC.

O FEL 1 cita o World Gold Council em três fatores do ouro na planilha `controle_fatores.xlsx`: "Geopolítica e risco
sistêmico" (Alto), "Demanda de bancos centrais" (Alto) e "Fluxo de ETFs de ouro" (Médio). A aba "Calendário de
Relatórios" lista o *Gold Demand Trends*, trimestral, "XLSX + PDF". O ouro dos bancos centrais já é coletado pelo FMI
(ADR 0036), de onde o próprio WGC tira a sua tabela de reservas oficiais (o arquivo se chama
`World_official_gold_holdings_as_of_Sep2026_IFS.xlsx`, "IFS" sendo a base do FMI).

## Checklist

| # | Pergunta | Resposta (evidência de 2026-10-01) |
|---|---|---|
| 1 | API oficial? | **Não documentada.** As páginas do Goldhub carregam os gráficos de `fsapi.gold.org/api/v11/charts/...` (JSON), endereço que aparece no HTML de cada página (`data-chart-data-endpoint`) |
| 2 | Pública ou autenticada? | A API JSON responde **sem login**. Os arquivos XLSX (`/download/file/...`) respondem **403** sem login: o Goldhub exige cadastro, gratuito ("Register today and get free and unlimited access to all Goldhub market data") |
| 3 | Cadastro ou chave? | Cadastro gratuito no site para os XLSX; nenhum para a API JSON |
| 4 | Formato | JSON (séries prontas para gráfico) e XLSX (com login) |
| 5 | Documentação oficial | Só as notas de metodologia em PDF (ETFs, bancos centrais, oferta e demanda). A API não tem documentação |
| 6 | Histórico | **ETFs** (`etfv2/revised/holdings-chart2`): estoque de ouro em ETFs, em toneladas e em US$, por região (América do Norte, Europa, Ásia, outros), **semanal desde 2003-02-28** (1.228 semanas, até 2026-09-25), e também mensal, trimestral e anual. Tabela-resumo por região (`archive-tablegroup/all`) com fluxos em US$ e em toneladas. **Oferta e demanda** (`supply-and-demand/43`): **trimestral desde o 1º tri/2010** (66 trimestres, até o 2º tri/2026) e anual, com a demanda por setor (joalheria, tecnologia, barras e moedas, **ETFs**, **bancos centrais**) e a oferta (**produção das minas**, hedge, reciclagem) |
| 7 | Revisa? | **Sim, pelo nome do endpoint** ("revised") e pela metodologia: os trimestres são revisados nas edições seguintes. Não medido aqui. A API só traz o valor atual |
| 8 | `published_at` | A resposta traz `asOfDate` (ETFs: 2026-09-25; oferta e demanda: 2026-06-30, o fim do trimestre, não a data da publicação). A data real de publicação não vem: seria a da coleta |
| 9 | Limite de requisições | Não encontrado; a API usa um parâmetro `break-cache` com a data |
| 10 | Licença | **Restritiva.** Termos do site (`gold.org/terms-and-conditions`, lidos em 2026-10-01): *"You are permitted to save, display or print out information contained on this Website only for your personal, non-commercial use"* e *"you agree that you will not redistribute the website pages and/or the contents thereon to any third party"* sem permissão escrita. Não falam de acesso automatizado. O Goldhub pode ter termos próprios para cadastrados (não lidos). A demanda e a oferta usam dados da Metals Focus (empresa privada), citados como fonte |
| 11 | Riscos | Licença (acima). API interna, sem contrato: pode mudar ou fechar sem aviso. Valor atual sem versões. O "bancos centrais" do WGC **inclui estimativa de compras não declaradas** (por isso difere da soma do FMI) |

## O que a fonte acrescenta (dado real, 2026-10-01)

| Série | Fator | Outra fonte gratuita? | Último valor |
|---|---|---|---|
| Estoque em ETFs por região, semanal desde 2003 | 6, ETFs (Médio) | **Não.** Cada emissor publica o próprio ETF (ex.: o GLD), mas o total mundial só o WGC compila | 4.248,9 t em 2026-09-25 (América do Norte 2.112, Europa 1.523, Ásia 537, outros 77) |
| Demanda dos bancos centrais, trimestral desde 2010 | 5, bancos centrais (Alto) | **Em parte:** o FMI (ADR 0036) traz o declarado por país; o WGC soma o mundo e estima o não declarado | 288,9 t no 2º tri/2026 |
| Fluxo trimestral de ETFs | 6, ETFs | Não | −44,8 t no 2º tri/2026 |
| Produção das minas, trimestral desde 2010 | 8, mineração (Baixo) | **Sim:** o USGS publica a produção mundial anual (domínio público, não reconhecido) | 965,6 t no 2º tri/2026 |

## Recomendação

**O dado tem valor, a licença é o problema.** É a única fonte gratuita do total mundial em ETFs de ouro e da demanda
dos bancos centrais com o não declarado. Mas os termos restringem o uso a fins **pessoais e não comerciais** e proíbem
redistribuir, e a via automatizável é uma API interna sem contrato. É um risco maior que o da ICE (ADR 0032): lá a
restrição era a robôs; aqui é ao próprio uso.

Opções para o usuário decidir:

1. **Não implementar** e cobrir o que der por outras fontes: bancos centrais pelo FMI (já feito), mineração pelo USGS
   (anual, a reconhecer). Os ETFs ficam sem fonte.
2. **Implementar com o risco aceito**, para uso interno, como na ICE, e rever antes de qualquer uso comercial ou
   exibição a terceiros.
3. **Pedir permissão ou licença ao WGC** para o uso no FinMind (o termo prevê permissão escrita).

Em qualquer caso, a decisão de quais destes números entram nos fatores é do David.

## Fontes

- Termos: https://www.gold.org/terms-and-conditions
- ETFs: https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows (API: `fsapi.gold.org/api/v11/charts/etfv2/revised/holdings-chart2`, `.../archive-tablegroup/all`)
- Oferta e demanda: https://www.gold.org/goldhub/data/gold-supply-and-demand-statistics (API: `fsapi.gold.org/api/v11/charts/supply-and-demand/43`)
- Reservas oficiais: https://www.gold.org/goldhub/data/gold-reserves-by-country (XLSX com login, a partir do IFS do FMI)
