# 0037 — Ouro: ETFs e oferta e demanda trimestral (World Gold Council), uso interno com risco aceito

## Contexto

O FEL 1 cita o World Gold Council em três fatores do ouro: "Demanda de bancos centrais" (Alto), "Fluxo de ETFs de
ouro" (Médio) e, na prática, "Produção e oferta de mineração" (Baixo, cuja fonte na planilha é o USGS). O reconhecimento
de 2026-10-01 (`docs/reconhecimento-fontes/wgc-ouro.md`) achou os dados numa API JSON interna do Goldhub, sem login, e
**a única fonte gratuita do total mundial em ETFs de ouro**. O problema é a licença: os termos do site permitem só uso
*"personal, non-commercial"* e proíbem redistribuir sem permissão escrita.

**Decisão do usuário, 2026-10-01:** implementar com o risco aceito, para **uso interno**, com o risco explicado no
card. Se o FinMind passar a uso comercial, haverá tempo de pedir a permissão ao WGC ("Vamos com a opção 2 detalhando
isso no card. Se ao longo do tempo migrarmos para alguma coisa comercial teremos tempo de pegar a permissão no WGC").
Como nas demais fontes, é **só aquisição de dados**: quais números entram nos fatores é decisão do David.

## Evidência (chamadas reais, 2026-10-01)

- `fsapi.gold.org/api/v11/charts/etfv2/revised/holdings-chart2`: estoque em ETFs por região (América do Norte, Europa,
  Ásia, outros), em toneladas e em US$, semanal (sextas) desde 2003-02-28, até 2026-09-25 (1.228 semanas). A Ásia só
  existe desde 2007 (antes, `null`). Funciona sem o parâmetro `break-cache` que o site usa.
- `fsapi.gold.org/api/v11/charts/supply-and-demand/43`: oferta e demanda trimestral desde o 1º tri/2010, até o 2º
  tri/2026 (66 trimestres), 17 linhas (demanda por setor e oferta) e o preço LBMA.
- Os XLSX do site exigem cadastro (403); a API JSON não. Nenhuma das duas respostas traz data de publicação; o endpoint
  dos ETFs se chama "revised".
- Termos lidos em `gold.org/terms-and-conditions` (citados no reconhecimento).

## Decisão

1. **Dois coletores** num módulo (`collectors/wgc/wgc-ouro.collector.js`, `criarColetorWgc`):
   - `wgc-etf-ouro` (fonte `WGC_ETF`): séries `WGC.ETF.<REGIAO>.TONELADAS` e `.MI_USD`, semanais. O valor em US$ é
     gravado em **milhões** (só a escala): a América do Norte já passa de US$ 360 bilhões, perto do teto da coluna
     `value` (10¹²), o mesmo estouro que o FMI teve (ADR 0036).
   - `wgc-oferta-demanda-ouro` (fonte `WGC_OFERTA_DEMANDA`): séries `WGC.OFERTA_DEMANDA.<CAMPO>`, em toneladas,
     trimestrais, com o trimestre no 1º dia. Os 17 nomes da fonte são mapeados um a um; um nome novo vira item inválido.
     **O preço LBMA que vem junto não é gravado** (já coletado da LBMA, com a licença da IBA).
2. **Sem `published_at`**: vale o instante da coleta (ADR 0008), como na PSD e no FMI. O vintage começa na 1ª coleta;
   cada revisão vista depois vira versão nova.
3. **Dois cards**, com o risco da licença no escopo de cada um e no nome da fonte ("uso interno, licença não
   comercial"): "Ouro em ETFs por região (World Gold Council)" (semanal, um item por região) e "Ouro - oferta e demanda
   trimestral (World Gold Council)" (trimestral, destaque: bancos centrais).

## Fora do escopo (de propósito)

- **Somar as regiões, calcular o fluxo** (variação do estoque) ou comparar os bancos centrais do WGC com a soma do FMI:
  são medidas, e cabem ao David.
- **Os XLSX com cadastro**, a tabela por fundo e a tabela anual: a API já traz o necessário.
- **O preço LBMA** da resposta.

## Resultado (2026-10-01, banco de dev)

- `wgc-etf-ouro`: **9.332 valores**, 8 séries, 0 falhas; 2ª coleta: 0 criados, 0 revisões.
- `wgc-oferta-demanda-ouro`: **1.122 valores**, 17 séries, 0 falhas; 2ª coleta: 0 criados, 0 revisões.
- Cards: ETFs, América do Norte com 2.111,98 t em 2026-09-25; oferta e demanda, bancos centrais com 288,9 t no 2º
  tri/2026.

## Consequências e limitações

- **Licença:** uso interno apenas. **Antes de qualquer uso comercial ou exibição a terceiros, pedir permissão ao WGC.**
  O aviso está no card e neste ADR.
- **API interna, sem contrato:** pode mudar de formato, de endereço ou fechar. Uma mudança vira falha explícita da
  coleta (formato inesperado) ou itens inválidos (nomes novos), não dado errado.
- **Sem vintage do passado** e com revisões frequentes: uma leitura "o que se sabia em D" anterior à 1ª coleta não
  enxerga o dado.
- **Bancos centrais no WGC × FMI:** o WGC inclui a estimativa de compras não declaradas; o FMI (ADR 0036) traz o
  declarado por país. Os dois ficam gravados; qual usar é do David.
