# 0098 — As pendências da geopolítica do petróleo (F3): fator próprio, o evento mais grave e a ameaça com menos peso

**Status:** aceita (2026-10-07).

## Contexto

O F3 do petróleo ("Geopolítica e conflitos (Oriente Médio, Rússia)", peso Alto no FEL 1, direção "alta com tensão e
risco de interrupção de oferta") é fator de evento desde 2026-10-02 (ADR 0050, §5c): os eventos aceitos da leitura
diária por IA marcados com ele, numa janela de 7 dias (ADR 0054), vão ao prompt com a data, a idade, o tipo, o canal, a
pressão e a fonte. A metodologia dizia que a ameaça sem efeito material era "só atenção". Quatro perguntas estavam
abertas:

1. A leitura diária deve registrar a vigência de cada fato (exige mudar o prompt)?
2. Uma ameaça sem efeito material conta, ou só a interrupção que já aconteceu?
3. Vale o evento mais grave do dia ou a quantidade de eventos?
4. A geopolítica é um fator próprio ou um modificador dos fatores de oferta (OPEP+, oferta não-OPEP)?

Ao contrário dos fatores calculados (ADR 0097), o F3 não tem validação contra o preço: as leituras de eventos existem
desde 2026-10-02 e não são reproduzíveis para trás (ADRs 0047 e 0049). No banco de dev, o petróleo tinha quatro eventos
(Ormuz em 02 e 06/10, o porta-aviões dos EUA em 02/10 e a OPEP+ em 06/10). As decisões são de desenho, pelo FEL 1 e
pela coerência com o resto: a leitura de eventos já separa a ameaça (nível ATENÇÃO) da interrupção (RELEVANTE ou
EXCEPCIONAL), registra só o fato novo das últimas 24 a 48 horas e rejeita a repetição (ADR 0092); o F1 marca a
interrupção da oferta pelo STEO (ADR 0091), e o prompt já diz para não contá-la duas vezes.

## Decisão (usuário, Welerson, 2026-10-07, pelo mesmo poder de decisão do David)

As quatro saídas recomendadas:

1. **Vigência:** a leitura diária não registra até quando cada fato vale; fica a janela de 7 dias. Uma situação em
   curso sem fato novo sai da janela, mas o preço, a curva e a interrupção do F1 a carregam, e uma escalada nova volta
   como evento. As alternativas (uma lista de situações em curso, confirmada a cada dia, que exigiria um prompt de
   eventos novo para os quatro ativos e uma tabela; ou a janela de volta a 30 dias) ficaram de fora.
2. **Ameaça:** conta como pressão de alta, menor que a da interrupção concreta, como diz o FEL 1 ("tensão e risco").
3. **Mais grave ou quantidade:** vale o evento mais grave da janela. A quantidade não soma pressão, porque premiaria a
   cobertura da imprensa; vários eventos só dizem que a tensão escala quando são desdobramentos novos.
4. **Papel:** fator próprio, como no FEL 1, sem contar duas vezes a interrupção que o F1 mostra. Revisitar quando o
   David definir peso e agregação (§4, "Peso e agregação" do ativo).

## Implementação

- **Prompt diário do petróleo v8:** o item 4 de "Como analisar" diz como ler a geopolítica: o evento mais grave, a
  ameaça com menos peso que a interrupção, e a falta de evento novo não encerra a situação em curso, já refletida no
  preço e na curva (sem contá-la de novo).
- **Metodologia do petróleo v5:** o F3 sem perguntas, com as quatro decisões e a leitura reescrita. A lacuna da
  situação crônica continua escrita no fator. A leitura de eventos (prompt v14), o cálculo e a janela não mudam.

## Consequências

- O F3 não tem pergunta pendente. Os próximos fatores do petróleo (demanda, dólar, produção dos EUA, juros e oferta
  não-OPEP) seguem, um a um, contra o Brent futuro (ADR 0097).
- Esta decisão vale só para o petróleo; a geopolítica do ouro tem a sua própria pergunta em aberto (o risco
  sistêmico como tipo de evento).
- Com histórico de leituras suficiente, o FinMind pode medir os eventos contra o preço e rever a régua dos níveis (ADRs
  0047 e 0049).
- As leituras já gravadas não mudam.
