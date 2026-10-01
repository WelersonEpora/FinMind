# FMI — reservas de ouro dos bancos centrais (IRFCL) — reconhecimento

**Data:** 2026-10-01. **Situação:** **implementado no mesmo dia** (nível 4 em dev; ADR 0036), com a autorização do
usuário. O texto abaixo é o reconhecimento como foi feito; as correções vieram na implementação (88 países, não ~100;
a escala `SCALE = 6`, ver o ADR).

O fator 5 do ouro na planilha `controle_fatores.xlsx`, "Demanda de bancos centrais (reservas)" (peso **Alto**), aponta
como fonte "World Gold Council, IMF, BCB" e como indicador "Compras de reservas". A aba "Calendário de Relatórios"
lista o "Gold Reserve Statistics" do FMI, mensal, "API (SDMX)". Até aqui o FinMind só tinha as reservas **totais** do
Brasil (ADR 0023), que não medem compra de ouro. Era um dos 2 fatores de peso Alto do ouro sem nenhuma fonte.

## O que é a fonte

O "Gold Reserve Statistics" não é um conjunto à parte na API do FMI: o ouro das reservas está no **IRFCL**
(*International Reserves and Foreign Currency Liquidity*, o "Reserves Data Template"), que cada banco central reporta
ao FMI todo mês. É de lá que o World Gold Council compila as estatísticas de reservas de ouro.

## Checklist

| # | Pergunta | Resposta (evidência de 2026-10-01) |
|---|---|---|
| 1 | API oficial? | Sim: **SDMX** em `api.imf.org/external/sdmx/` (2.1 em XML; 3.0 em JSON). A API antiga (`dataservices.imf.org`, SDMX JSON) **não responde mais**: a migração do FMI em 2025 a aposentou |
| 2 | Pública ou autenticada? | Pública: todas as consultas foram feitas sem autenticação |
| 3 | Cadastro ou chave? | Não |
| 4 | Formato | JSON SDMX 3.0 (`Accept: application/vnd.sdmx.data+json`) ou XML SDMX 2.1. Os dados vêm só com códigos; os nomes estão nas listas de códigos (`CL_IRFCL_INDICATOR_PUB`, 814 indicadores). Consulta: `/data/dataflow/IMF.STA/IRFCL/%2B/<PAÍS>.<INDICADOR>.<SETOR>.M` (o `+` da versão precisa ir codificado; `lastNObservations` não funciona com `dimensionAtObservation=AllDimensions`) |
| 5 | Documentação oficial | A do padrão SDMX e o portal `data.imf.org`, que **bloqueia acesso automático** (403): não foi lida |
| 6 | Histórico | **Mensal desde dez/1999**. Volume de ouro (`IRFCLDT1_IRFCL56V_FTO`, onças troy): **111 séries** (país × setor), **88 países** (80 com dado em 2026) e 2 agregados; cada país reporta o setor `S1XS1311`. Inclui os grandes compradores: China, Rússia, Turquia, Índia, Polônia, Cazaquistão, República Tcheca. **Ausentes:** Uzbequistão e Catar. **Sem total mundial** na fonte (`G163` é um agregado regional, provavelmente a área do euro: 347 milhões de onças) |
| 7 | Revisa? | **Não medido.** A API não guarda versões; só a coleta repetida mostraria uma revisão (como na PSD do USDA, ADR 0031) |
| 8 | `published_at` | **A fonte não informa** (a resposta não traz data de atualização, nem no cabeçalho HTTP). Cada país reporta no seu ritmo: em 2026-10-01, a maioria tinha até ago/2026, mas a China só até jul/2026. Teria de ser a data da coleta (o vintage começa na 1ª coleta) |
| 9 | Limite de requisições | Não encontrado: a consulta de todos os países numa chamada (816 KB) levou 2,8 s, sem erro |
| 10 | Licença | **Não verificada**: as páginas de termos do FMI (`imf.org/en/About/copyright-and-terms`, `data.imf.org/en/terms-of-use`) respondem 403 a acesso automático. Ler à mão antes de implementar |
| 11 | Riscos | Ver "Achados" abaixo: unidade errada no Brasil, valor em US$ não comparável entre países, ritmos de reporte diferentes. API nova (migrada em 2025), formato SDMX verboso |

## Achados (dado real, 2026-10-01)

**O volume é a medida certa; o valor em dólar não serve para comparar.** Os EUA reportam **261.499.000 onças**, o
número oficial, constante desde 2012 (o mesmo do reconhecimento do US Treasury,
`docs/reconhecimento-fontes/us-treasury.md`). O valor em US$ dos EUA é **11,04 bilhões**, que é o preço legal de
US$ 42,22 por onça, não o de mercado. Os demais países usam o valor aproximado de mercado. Em volume, os números batem
com a ordem de grandeza conhecida: China 76,08 milhões de onças, Rússia 73,0, Suíça 33,4, Índia 28,3, Japão 27,2,
Turquia 25,4 e Polônia 20,8.

**Defeito da fonte: o volume de alguns países está numa unidade errada.** Conferência sistemática (2026-10-01): para
cada país, o valor em US$ dividido pelo volume dá um "preço implícito", que tem de ficar perto do preço do ouro no
mês (LBMA, média de ago/2026: US$ 4.410 a onça). Dos **79 países com volume e valor**:

| Grupo | Países | Leitura |
|---|---|---|
| **Consistentes** (US$ 3.000 a 6.000 a onça) | **69** (mediana US$ 4.452) | Volume e valor coerentes |
| **Volume em unidade errada** | **Brasil** (5,54 bilhões de "onças", preço implícito US$ 4,43), **Angola** (593 milhões, US$ 4,05) e **Chile** (7.900, US$ 195.610) | Brasil e Angola, escala 1.000× maior (o Brasil tem ~5,54 milhões de onças, ~172 t); o Chile parece estar em quilos (7,9 t) |
| **Volume certo, valor contábil** | EUA (US$ 42,22, o preço legal), Arábia Saudita (US$ 41,68), Singapura (US$ 891), Coreia do Sul (US$ 1.427), Tunísia (US$ 793, dado de 2019) | O volume bate com o conhecido (Coreia 104 t, Arábia Saudita 323 t); o valor em US$ não é de mercado |
| **Dado antigo** | Bolívia (2021, US$ 1.819), Quirguistão (2025, US$ 2.881) | Coerentes com o preço da época |

Outros **13** países não têm um dos dois ou reportam zero (Canadá, Noruega e Nova Zelândia: sem ouro). Um coletor
gravaria o número como publicado e **marcaria automaticamente** o país cujo preço implícito sair da faixa, sem corrigir
a escala por conta própria (isso seria inventar o dado). Só a comparação com o valor em US$ revela o defeito: um país
que errasse as duas séries na mesma proporção passaria.

**As compras aparecem mês a mês.** Exemplos dos últimos 12 meses: Polônia de 16,57 para 20,83 milhões de onças;
China de 73,96 para 76,08; Cazaquistão de 9,93 para 11,89; República Tcheca de 2,10 para 2,76. A Rússia caiu de 74,8
para 73,0. A variação do volume é a "compra de reservas" que a planilha pede, mas calculá-la é medida, e cabe ao David.

## Recomendação

**Possível e de valor: implementar só com autorização.** É a única fonte gratuita, oficial e mensal para o fator de
peso Alto que estava sem nada, com ~100 países desde 1999 numa única chamada. Um coletor gravaria o **volume de ouro
por país** (onças, como publicado), mais o valor em US$ como conferência. Antes de implementar:

1. **Ler a licença do FMI à mão** (o site bloqueia o acesso automático).
2. **Decidir como tratar os defeitos de unidade** (Brasil, Angola e Chile hoje): a proposta é gravar como publicado e marcar automaticamente o país cujo preço implícito sair da faixa.
3. **Aceitar o vintage desde a 1ª coleta**: a fonte não diz quando publicou nem guarda versões, como a PSD do USDA.

O total mundial e as compras somadas dos bancos centrais (o número que a imprensa cita) são do World Gold Council, que
compila esta mesma fonte: é o próximo reconhecimento.

## Fontes

- API SDMX do FMI: `https://api.imf.org/external/sdmx/3.0/` (estrutura: `/structure/dataflow`, `/structure/codelist/IMF.STA/CL_IRFCL_INDICATOR_PUB/+`)
- Indicadores usados: `IRFCLDT1_IRFCL56V_FTO` (volume, onças troy) e `IRFCLDT1_IRFCL56_USD` (valor, US$); setor `S1XS1311` (autoridades monetárias)
