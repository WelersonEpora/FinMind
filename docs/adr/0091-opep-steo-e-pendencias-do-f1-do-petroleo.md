# 0091 — As pendências da OPEP+ (F1 do petróleo): o STEO da EIA no lugar das cotas, e toda decisão como evento

**Status:** aceita (2026-10-06).

## Contexto

O F1 do petróleo ("Decisões da OPEP+ (cotas de produção)", peso Alto) era um fator só de evento (ADR 0050, item 16): os
eventos aceitos da leitura diária marcados com ele, numa janela de 45 dias. A produção do JODI não servia: ele perdeu
os Emirados e o Irã (2018), a Rússia (2023) e o Iraque (2024). Duas perguntas estavam abertas, e o catálogo registrava
uma lacuna:

1. A janela de 45 dias basta como memória da política em vigor, ou a leitura diária deve registrar a vigência?
2. O cumprimento das cotas é necessário?
3. Lacuna: a leitura diária só registrava a decisão "extraordinária" da OPEP+; a reunião que só mantém as cotas podia
   não virar evento, e o fator ficava vazio.

**Decisão do usuário (Welerson, 2026-10-06), pelo mesmo poder de decisão do David:** manter os 45 dias; toda decisão de
produção vira evento; e o cumprimento das cotas é necessário. **É a demanda específica para uma fonte nova** (a
aquisição está encerrada desde 2026-10-01, `STATUS_DO_PROJETO.md`, §1).

### Reconhecimento (2026-10-06, com chamadas reais)

- **OPEP (opec.org):** todas as páginas, inclusive o MOMR e os comunicados, respondem 403 com o desafio do Cloudflare
  ("Just a moment..."). Acesso automático bloqueado (nível 0). As cotas por país só estão nos comunicados.
- **EIA, Short-Term Energy Outlook (STEO):** a API v2 (`api.eia.gov/v2/steo`) exige chave (a `DEMO_KEY` bateu no limite
  em ~10 chamadas) e só guarda a edição atual. O **arquivo de edições** (`/outlooks/steo/archives/<mmm><aa>_base.xlsx`,
  XLS até 2013) é público, sem chave, ~1 MB por edição, ~10 s por pedido. Não traz as cotas. Traz, por mês, a produção
  de petróleo bruto de cada país da OPEP e o total; até 2023 (tabela 3c), a capacidade e a capacidade ociosa de cada
  país; de 2024 em diante (tabela 3d), a OPEP+ (total, os membros da OPEP sujeitos aos acordos e os outros
  participantes, Rússia e Cazaquistão entre eles) e só a capacidade da OPEP. Detalhe:
  `docs/reconhecimento-fontes/petroleo.md`.

Com as cotas inacessíveis, o usuário escolheu (2026-10-06) **coletar o STEO sem as cotas**: a pegada das decisões na
produção e na capacidade ociosa da OPEP, ao lado dos eventos. Antes de decidir a leitura, o FinMind validou as medidas
no histórico (sem gravar nada): 225 edições, de jan/2008 a out/2026, cada uma com o que se sabia nela (a edição é o
point-in-time), contra o Brent 3 e 6 meses depois da divulgação estimada.

- A variação da produção sozinha não diz nada: −0,13 com o Brent 6 meses depois.
- A produção e a capacidade ociosa juntas separam os casos (média de 3 meses contra os mesmos 3 do ano anterior;
  limiares de ±1,5% na produção e ±400 mil barris/dia na ociosa):

| Caso em 12 meses | Edições | Episódios | Brent em alta 6 meses depois (média) | Sem 2008-09 e sem 2020 |
|---|---|---|---|---|
| Corte (produção caindo, ociosa subindo) | 51 | 5 | 73% (+11,3%) | 62% (−0,9%) |
| Aumento (produção subindo, ociosa caindo) | 58 | 7 | 41% (−0,2%) | 46% (+6,3%) |
| Interrupção (as duas caindo) | 9 | 4 | 11% (−10,2%) | igual |
| Neutro | 95 | — | 52% (+2,7%) | 49% |
| Todas | 218 | — | 53% (+3,8%) | 50% (+2,0%) |

O sentido é o do FEL 1 ("alta com cortes; baixa com aumento de cotas"), mas vem sobretudo dos grandes cortes de 2009 e
2020: sem eles, o corte ainda acerta a direção, e a variação média some. Poucos episódios, sem significância por
episódio (como o F8 do café, ADR 0090). Desde abr/2026 o caso é interrupção: a guerra no Golfo derrubou a produção da
OPEP em 18% e a ociosa a zero; não é decisão da OPEP.

## Decisão (usuário, Welerson, 2026-10-06)

1. **Memória da política:** fica a janela de 45 dias dos eventos, sem registrar a vigência de cada decisão.
2. **Toda decisão de produção da OPEP+ é evento.** O tipo "Política de oferta" (`shared/eventos-mercado.js`) passa a
   incluir toda decisão de produção da OPEP+, inclusive a que mantém as cotas; o prompt de eventos (v13) diz o que o
   resumo traz (o que foi decidido, para quando e, se a fonte disser, a comparação com o esperado) e que a decisão que
   confirma o rumo anterior não muda o nível do ativo sozinha. Vale para a frente do ouro e do petróleo.
3. **Fonte nova: o STEO da EIA**, autorizado pelo usuário para o F1, no limite da tabela da produção de petróleo bruto
   da OPEP e da OPEP+ (sem a previsão e sem as demais tabelas). A EIA é fonte do FEL 1 no petróleo.
4. **O F1 passa a fator calculado com eventos**, `factors/opep-petroleo.factor.js` (v1), no lugar do "cumprimento das
   cotas". Camadas A e B: a produção, a capacidade e a capacidade ociosa da OPEP (a OPEP+, a Rússia e a Arábia Saudita
   como contexto); a média de 3 meses da produção e a da ociosa contra os mesmos 3 meses do ano anterior. Camada C
   pelos **quatro casos**: corte é pressão de alta, aumento é pressão de baixa, interrupção, expansão e neutro ficam sem
   pressão (a interrupção de uma guerra chega pelos eventos de geopolítica); forte com a produção mudando 5% ou mais;
   tendência pela variação da ociosa de 3 meses antes (mudança mínima de 300 mil barris/dia). **Os limiares são do
   FinMind**, os da validação, ajustáveis pelo Comitê na tela (`fator_parametro_versao`); não são do David. Os eventos
   seguem no mesmo fator, depois do cálculo, como no milho (ADR 0058).
5. **A OPEP total, não a OPEP+, entra na regra:** a ociosa só existe para a OPEP, e a OPEP+ por país só existe nas
   edições desde 2024.

## Implementação

- **Coletor `eia-steo`** (`collectors/eia/eia-steo.collector.js`, leitor em `eia-steo.parser.js`): uma planilha por
  edição; a tabela é achada pela linha `copr_sa` (3c ou 3d). Só os meses históricos (os países não têm previsão: o
  último mês com a Arábia Saudita é o último histórico). Séries `EIA_STEO.PETROLEO.<ITEM>.<CAMPO>`: item = país (ISO
  alfa-2, como o JODI) ou grupo (`OPEP`, `OPEP_MAIS`, `OPEP_MAIS_MEMBROS_OPEP`, `OPEP_MAIS_OUTROS`); campo =
  `PRODUCAO`, `CAPACIDADE` ou `CAPACIDADE_OCIOSA` (só a OPEP). Em mil barris/dia (a planilha traz milhões), em
  `observation` (ADR 0008). Coleta diária: a edição do mês e a anterior, se ainda não estão no banco; a do mês só
  existe depois da divulgação.
- **Vintage:** cada edição revisa os meses anteriores (mediana de 100 mil barris/dia em 3 edições e de 290 mil em 12;
  96% dos meses revisados em 3 edições). Cada revisão vira uma versão nova, com a data da edição que a trouxe
  (`edition_lag_rule`, como a ICO, ADR 0061). Uma edição que tira um país da OPEP refaz o total para trás: em abr/2020
  (o Equador), o total de jan/2019 caiu de 30.680 para 30.156 mil barris/dia. A filiação muda: a Indonésia sai em
  2009, o Catar em 2019, o Equador em 2020, Angola em 2024 e os Emirados a partir da edição de mai/2026.
- **published_at estimado:** o STEO sai na terça depois da 1ª quinta do mês (conferido em jun/2012, jan/2016, jan/2021,
  jan/2023 e jan/2025); a data é o fim da quarta seguinte, um dia de folga. O `Last-Modified` não serve: é de 1 a 5 dias
  antes da divulgação. A data "Forecast date" das edições desde 2024 é o fechamento da previsão (uma quinta), também
  antes: fica no `metadata` (`dataPrevisao`).
- **Defeito da fonte tratado:** o `oct13_base.xls` responde 200 com uma página de erro em HTML; a edição está no
  `.xlsx`. O coletor confere a assinatura da planilha e tenta a outra extensão.
- **Carga:** `npm run backfill:eia-steo` (jan/2008 até a edição do mês, ~225 planilhas, ~45 min), **antes da coleta
  diária** num banco novo (a coleta diária se recusa a gravar séries sem carga histórica). Em dev: 226 edições, 0
  falhas.
- **Card** `PETROLEO_OPEP_STEO` no catálogo de observáveis, por país ou grupo, com três métricas (descritor
  `steo-item`).
- **Metodologia do petróleo v2:** o F1 sem perguntas, com as três decisões e a validação histórica no texto D. A
  validação dos parâmetros aceita um `maximo` por parâmetro (a ociosa em mil barris/dia passa de 100).
- **Prompt diário do petróleo v4:** o item 4 de "Como analisar" diz que o cálculo mostra a pegada das decisões com um
  a dois meses de atraso, que a IA diz quando uma decisão recente ainda não aparece nele, e que a interrupção vem pela
  geopolítica (não contar duas vezes). Nenhuma regra de peso nova.

## Consequências

- O F1 do petróleo não tem pergunta pendente; as decisões ficam no fator, na tela de metodologia.
- O cumprimento das cotas segue sem medida: volta se as cotas ficarem acessíveis de forma automática.
- A interrupção de 2026 não pesa para nenhum lado no F1: o efeito da guerra fica com o F3 (geopolítica). Nos 9 casos
  históricos de interrupção (Líbia em 2011, por exemplo) o Brent caiu depois; não servem para ler 2026.
- No servidor: rodar o backfill antes da 1ª coleta diária (a coleta diária com o coletor novo falha a gravação até lá,
  com a instrução na mensagem).
