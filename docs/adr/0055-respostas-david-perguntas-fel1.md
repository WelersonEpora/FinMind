# 0055 — Respostas do David às perguntas do FEL 1 (P1 a P16) e a proposta do Motor do Milho v0

**Status:** aceita (2026-10-04). Registra respostas; não implementa nada.

## Contexto

O `STATUS_DO_PROJETO.md` (§4) reunia 16 perguntas ao David, vindas da análise crítica do FEL 1
(`docs/analise-critica-fel1-milho-ouro.md`, §H), e a §5 pedia a confirmação das medidas (camada A) dos 8 fatores do
milho. Na reunião do Comitê de 2026-10-01, as perguntas 2, 3 e 8 foram respondidas ("seguir com o histórico
disponível"), e o David ficou de mandar um documento com todas as respostas.

O documento chegou em 2026-10-03 ("Respostas FEL1 FINMIND", guardado com o material do especialista, fora do que a
tela publica). Tem duas partes, escritas em momentos diferentes:

1. **As respostas P1 a P16 e a confirmação da §5.** Ele avisa, na P12, que foram escritas **antes da reunião de
   2026-10-03**, em que aprovou os fatores do petróleo (ADR 0052) e do ouro (ADR 0054). Onde as duas coisas divergem,
   vale a decisão mais nova (ex.: o preço de referência do ouro).
2. **"Motor do Milho — Tabelas por Fator", versão 0, de 2026-10-02:** para cada um dos 8 fatores, a coleta, as
   camadas A, B e C, uma regra de alta e uma de baixa (R-CLI-01 v0 etc.), o peso por mês e as correlações; uma matriz
   de correlação 8 × 8, regras de agregação e um prompt para a IA. O próprio documento diz que é **proposta para
   deliberação do Comitê**, com limiares e pesos **ilustrativos**, a calibrar em backtest.

## Decisão

Registrar as respostas como estão, com o que muda (ou não) no FinMind. **Nada é implementado por este ADR**: o que
pede código terá o seu próprio ADR.

| # | Resposta do David | Efeito no FinMind |
|---|---|---|
| P1 | Milho + ouro como prova de arquitetura: **sim**. Uma trilha de validação em paralelo, sem mudar a ordem CAFÉ → PETRÓLEO → MILHO → OURO | Nenhum: é o que o projeto já faz |
| P2 | O preço de referência é o do **instrumento operado** (é contra ele que o resultado é medido). Milho: o **CCM** (B3) basta; o ZC entra como fator, não como substituto. Ouro: a LBMA; o GC só se for o operado | Milho sem mudança. Ouro: escrito antes da decisão do GLD (ADR 0054), que prevalece. O instrumento operado do ouro e do petróleo volta à conversa: na P3 ele cita a **Pepperstone (ouro e Brent)** |
| P3 | Premissa de fontes gratuitas e confiáveis; os desenvolvedores sinalizam quando um investimento for necessário. Proposta de um **caixa para aquisições**, só para o que for **fator de sucesso**, com o **Luiz** gerindo os custos junto do Welerson e da Carla e levando ao Comitê. Haverá uma **camada de análise técnica gráfica** (B3 para café e milho; Pepperstone para ouro e Brent) | Pedido de compra passa pelo Luiz. A análise técnica é camada nova, a definir pelo David (o FinMind não cria indicador técnico) |
| P4 | O COTAHIST **não** atende os futuros; a afirmação da §6.5.2 do FEL 1 está errada. O Boletim Diário + Up2Data (ADR 0020) vale para o CCM; para o ICF, o mesmo caminho | Já feito (ADRs 0020 e 0028) |
| P5 | Ciência do vintage. A aproximação pelo WASDE para a safrinha antes de fev/2025 está **validada**, declarada como aproximação; medir o viés rodando a regra com os dois vintages onde houver. A §12.3 (vedado dado sem data de publicação) fica | Quando houver regra da safrinha, o backtest roda com os dois vintages e declara a aproximação |
| P6 | Uso interno coberto. Antes de qualquer externalização: licença da IBA/LBMA, do CEPEA (CC BY-NC) e da B3. Dados do governo americano (EIA, NOAA, USDA, CFTC) são domínio público | Registrado aqui. As licenças seguem adiadas até haver uso externo (decisão de 2026-10-01) |
| P7 | CEPEA resolvido pela B3 (ADR 0021) | Já feito |
| P8 | A §12.1 do FEL 1 é o alvo, em duas fases: **Fase 1**, testar agora no CCM (2022+), declarando a limitação; **Fase 2**, confirmar no ZC quando houver orçamento. O mínimo de **100 operações** (§12.2) é o critério prático. O Comitê já decidiu **testar em mercado com lotes mínimos** assim que o sistema estiver pronto | O backtest começa na Fase 1 |
| P9 | **Duas réguas ao mesmo tempo:** comprar e segurar o ativo **e** o CDI; a regra só passa se superar as duas. O Sharpe fica no backtest; a Selic no prompt como custo de oportunidade | Pendente: temos a Selic, não o CDI |
| P10 | Critérios **propostos**, a fixar **antes** do primeiro teste: Sharpe ≥ 0,5 dentro da amostra e ≥ 0,3 fora dela; drawdown ≤ 15% no backtest (o limite operacional é 10%); 100 operações por ativo (o Comitê define o mínimo para operar de verdade); profit factor ≥ 2,0; degradação no walk-forward ≤ 20% | Proposta, não aprovada. O próprio documento aponta o que falta definir (cálculo do Sharpe, custos, métrica da degradação, 15% contra 10%) |
| P11 | Papel da IA **confirmado**: motor determinístico em código e a IA como analista que pesa e explica | Nenhum: é o desenho atual |
| P12 | Fator 8 aprovado em duas partes: (1) **exportação por destino**, medida pela **participação da China no total** e a variação **contra o mesmo mês do ano anterior** (mês contra mês engana pela sazonalidade); (2) **tarifas como eventos**, lidos pela IA em boletins oficiais no dia da publicação, sem backtest do passado e sem número que entre no motor. Depois da reunião de 2026-10-03, pede para avaliar o fator de eventos também no **milho e no café** | Os dados já são coletados (ADRs 0034 e 0049, que já cobrem milho e café). Falta ligar ao fator do milho |
| P13 | O David revisa o FEL 1 e envia ao Comitê **até 2026-10-15** | Pesos e textos do FEL 1 podem mudar |
| P14 | O WASDE **não** cobre café; vale o texto. Corrigir a planilha (a linha do WASDE vira "Milho") e incluir o Coffee: World Markets and Trade (USDA FAS) | O café já usa o PSD do USDA FAS. Correção da planilha é do David |
| P15 | FAO/AMIS **não** é necessária; segue adiada | Nenhum |
| P16 | Paridade de exportação: **opção 1, a paridade já calculada pelo IMEA** (MT, semanal, desde 2015), sem coletar os componentes. Ressalvas: é a paridade de MT, não de Campinas (o Comitê declara a praça); a série quebra na troca do contrato de referência; o porto do prêmio é ambíguo | Aprovada como demanda do David. A coleta precisa de ADR próprio, com a autorização do usuário |

**Confirmação da §5 (medidas dos fatores do milho):**

- As medidas propostas valem (COT, estoque/uso, % boa + excelente).
- COT: managed money do relatório desagregado, em contratos e em % dos contratos em aberto.
- WASDE: estoque/uso dos EUA e do mundo; a revisão entre edições conta como informação.
- Safrinha: nível e revisão, com a Conab como primária e o IMEA como refinamento de MT.
- Clima: % boa + excelente, com o VHI como complemento.
- Insumos: o custo agregado do IMEA atende a v1.
- Instrumento: o CCM no milho. A recomendação deve ser absoluta (comprado, vendido ou fora), não "manter". O perfil é **especulativo, não hedge**: swing trade de 7 a 21 dias, com risco × retorno mínimo de 2:1 e dois alvos.

**Motor do Milho v0:** recebido como proposta do David para o Comitê. O milho continua fora do prompt diário, do
Centro de Decisão e da IA até a aprovação, como foi com o petróleo e o ouro (ADRs 0052 e 0054).

## Consequências

- O §4 do status passa a ter a resposta e a data de cada pergunta, com este ADR como referência.
- **Pontos em aberto para a conversa com o David**, reunidos em `docs/conversa-david-respostas-fel1.md`:
  - o instrumento operado do ouro e do petróleo;
  - o formato da leitura da IA;
  - o peso sazonal e a agregação;
  - a validação humana dos eventos;
  - a praça da paridade;
  - os detalhes da P10;
  - as fontes novas citadas na proposta do milho;
  - a sequência tendência → recomendação.
- **Petróleo: o instrumento foi confirmado em 2026-10-04.** O usuário confirmou com o David que o petróleo operado é o
  Brent; a leitura diária passou do WTI ao Brent (ADR 0052, adendo). O ouro segue em aberto.
- **Conferência pedida pelo David:** os dois números da Conab que ele não confirmou estão no banco: 111.030,9 mil t no
  11º levantamento (2026-08-13) e 110.460,4 mil t no 1º (2025-10-14). Comparado ao mesmo levantamento da safra anterior
  (o 12º de 2024/25, 112.032,8 mil t, de 2025-09-11), o 12º de 2025/26 fica +0,1%, não −1,0%: a crítica dele ao
  exemplo do §5 (comparar no mesmo estágio) muda o número.

## Não decidido aqui

O instrumento operado do ouro (o do petróleo foi confirmado depois, em 2026-10-04: o Brent, ADR 0052, adendo); qualquer outra mudança no petróleo ou no ouro; a coleta da paridade do IMEA; as
fontes novas; a implementação do Motor do Milho; os critérios da P10.
