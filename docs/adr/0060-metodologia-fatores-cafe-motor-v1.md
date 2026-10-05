# 0060 — Metodologia dos fatores do café: o Motor do Café v1 na tela, com os limiares calibrados pelo FinMind

**Status:** aceita (2026-10-04).

## Contexto

O David mandou o "Motor do Café — Relatório de Análise Técnica, Correções e Regras Revisadas por Fator", versão 1, de
2026-10-04 (no fim de `Respostas FINMIND_V02.docx`). O relatório revisa um Motor do Café v0, que não está no
repositório. Para cada um dos 8 fatores, ele traz objetivo, variáveis, método de leitura, regras candidatas de alta e de
baixa, neutralidade, horizonte, sazonalidade e controle de dupla contagem. Também traz:

- uma tabela de relações por par (§8);
- regras transversais (§5): point-in-time, surpresa, neutralidade mandatória e dupla contagem;
- as pendências P01 a P07.

O relatório é diferente do Motor do Milho v0 (ADR 0056) em três pontos:

- **Nenhuma regra tem limiar.** Todas trazem "[CALIBRAR COM DADOS POINT-IN-TIME]" e a marca "Hipótese v0 — não
  validada".
- **Pesos e matriz descartados.** Os pesos fixos e a matriz de correlações do v0 são descartados ("devem ser zerados e
  recalibrados").
- **Recomendação ao Comitê:** aprovar a arquitetura, a ingestão e o protótipo, e rejeitar as regras para operação.

A conferência com a base confirmou números citados no relatório:

- **Conab, 3º levantamento de 2026 (24/09):** arábica de 48.213 mil sacas e conilon de 19.393 mil sacas; o 2º
  levantamento, de 66,7 milhões de sacas, também confere.
- **Estoques certificados da ICE:** em ago/2026, a série vai de 260,7 mil a 224,0 mil sacas, a ordem de grandeza que o
  relatório marcou como "não confirmada".

As pendências P01 (PTAX), P03 (ICE) e P05 (COT managed money) já estão atendidas.

**Decisão do usuário (Welerson, 2026-10-04):** montar a metodologia do café na tela (item 1). Calcular as camadas A e B
(item 2). Propor a calibração dos limiares (item 3, a P06 do relatório). **Limite:** só a tela de metodologia. O café não
vai ao prompt diário, à IA nem ao Centro de Decisão (`CLAUDE.md`). Nada gera sinal de compra ou venda.

## Decisão

1. **Os 8 fatores do café** (`shared/metodologia-cafe.js`), no formato de `metodologia-base.js`:
   - a tabela do FEL 1, sem reescrever;
   - os dados e as lacunas;
   - a proposta do relatório, com `autoria`;
   - as regras candidatas como escritas (`regrasEspecialista`);
   - as perguntas;
   - o `doAtivo`, com as decisões da P12 e da P14 (ADR 0055) e as pendências do ativo.

   Todos os fatores recebem os eventos da leitura diária (7 dias; 30 na demanda), como no milho, a pedido do David
   (P12).
2. **A calibração (P06) pelo próprio histórico.** Onde a medida é contínua, o limiar é a posição dela no histórico
   anterior a cada ponto (`factors/modelos/posicao-historica.js`): percentil − 50.
   - **Faixa neutra:** do percentil 20 ao 80, a mesma que o relatório usa no COT, estendida aos outros fatores.
   - **Faixa forte:** abaixo do percentil 10 ou acima do 90.

   O limiar se recalibra com o histórico de cada base e respeita o point-in-time. É calibração do FinMind, marcada no
   texto de cada fator, e o Comitê ajusta pelos parâmetros.
3. **Os cálculos** (`factors/*-cafe*.factor.js`):

   | Fator | Medida (A) | Leitura (B) | Decisão (C) |
   |---|---|---|---|
   | F1 Clima | VHI da NOAA sobre o café de MG, SP, ES e BA, ponderado pelo arábica da Conab por UF | Percentil contra a mesma semana dos 30 anos anteriores | Posição; só de junho a novembro (janelas críticas do relatório) |
   | F2 Safra | Arábica da Conab por levantamento | Revisão contra o levantamento anterior da mesma safra | Faixa de 2%, forte em 5% (percentis 40 e 80 das 11 revisões da base) |
   | F3 Estoques | Estoque certificado da ICE, variação em 4 semanas | Percentil em 5 anos | Posição |
   | F4 Câmbio | PTAX, variação em 10 pregões | Percentil em 5 anos | Posição; real se valorizando = alta |
   | F5 Custos | ICF (vencimento mais próximo) × PTAX contra a mediana do custo do arábica da Conab | Margem sobre o custo operacional e o total | Margem ≤ 0 por 4 semanas = alta; margem total no percentil 80 = baixa (com 2 anos de histórico) |
   | F6 Demanda | Consumo mundial do USDA PSD (soma dos países) | Crescimento contra a safra anterior, com os mesmos países | Faixa de 1% a 2% (do relatório); forte em 4 p.p. (percentil 80, 2003 a 2026) |
   | F7 Fundos | Molde do COT, Coffee C | Percentil em 3 anos | Faixa de 20 a 80 (do relatório); reversão |
   | F8 Juros | Molde dos juros, Treasury de 10 anos | Variação em 26 semanas | Limiares do petróleo (mesma série) |

   Duas periodicidades novas na tela e no texto do prompt:
   - `LEVANTAMENTO`, a data exata de cada levantamento (em jan/2025 houve dois no mesmo mês);
   - `PUBLICACAO`, a publicação do PSD.
4. **Pesos e relações:** o relatório não tem peso nem matriz. A seção mostra o peso do FEL 1, as 5 relações por par
   (novo formato `pares` em `metodologia-base.js`) e as 4 regras transversais como agregação, cada uma com a situação no
   FinMind. O texto de abertura da seção passou a vir dos dados (`descricao`): o texto anterior era o do milho.

## Evidência (dev, simulação de 2026-10-03)

| Fator | Leitura |
|---|---|
| F1 Clima | VHI de 64,3, +42 pontos contra a mesma semana em 30 anos: pressão de baixa, forte |
| F2 Safra | Revisão de +5,33% no 3º levantamento: pressão de baixa, forte |
| F3 Estoques | Sem decisão em dev (a ICE só desde ago/2026; no servidor, desde 2016) |
| F4 Câmbio | +0,84% em 10 pregões, percentil 66,5: neutra |
| F5 Custos | ICFZ26 a US$ 351,90 (R$ 1.834,53), margem de +74,6% sobre o custo total: neutra |
| F6 Demanda | Consumo +3,62%: pressão de alta, moderada |
| F7 Fundos | Percentil 7,7 em 3 anos: pressão de alta, forte |
| F8 Juros | Treasury +0,93 p.p. em 26 semanas: pressão de baixa, moderada |

Episódios no F1:

- **Seca de set/2024:** −48 pontos, pressão de alta forte.
- **Seca de jan-fev/2014:** −44 pontos, mas cai fora das janelas críticas do relatório e fica neutra. Virou pergunta ao
  David.

## Consequências

- **Os 4 ativos do FEL 1 têm metodologia na tela.** O café segue fora do prompt, da IA e do Centro de Decisão.
- **Novas pendências do café**, a maioria do relatório:
  - as janelas críticas do clima;
  - as fontes novas (INMET, ECF, ICO, FOB e o robusta de Londres), cada uma com o seu ADR;
  - os horizontes em pregões ou em dias;
  - a agregação (proposta em código, com famílias e peso por horizonte, no ADR 0066, de 2026-10-05; fora do prompt);
  - se vale a mesma régua para o milho.
- **O F3 só decide no servidor**, onde o histórico da ICE é completo.

## Fora do escopo

Prompt, IA e Centro de Decisão do café; fontes novas; backtest walk-forward; agregação em código.
