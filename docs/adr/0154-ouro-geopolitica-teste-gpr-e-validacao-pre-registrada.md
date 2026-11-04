# 0154 — Ouro: a geopolítica testada com o índice de risco geopolítico (GPR); peso Baixo e voto só no IMEDIATO

## Contexto

O item **E4** do "Relatório de oportunidades de melhoria: sistema de sinais do ouro (prompt ouro-v3)", de 2026-11-01
(resposta no `STATUS_DO_PROJETO.md`, §0), aponta que a geopolítica (F4) tem peso Alto sem validação histórica: o evento
de 30/10 tinha intensidade baixa e confiança média, e o ouro caiu mesmo com a tensão crescente. Pede rebaixar o peso até
haver validação, usar intensidade e confiança como multiplicadores numéricos e medir o retorno do ouro de 1 a 5 dias
depois de eventos de magnitude alta e baixa, com a amostra mínima definida antes do teste.

Depois da decisão do E1 (ADR 0150, adendo), a geopolítica com peso Alto ficou quase sozinha com voto no IMEDIATO e no
CURTO do ouro.

**A amostra própria não basta:** de 2026-10-02 a 2026-11-03, 8 eventos aceitos do ouro, nenhum de intensidade alta, quase
todos do mesmo episódio (o Irã e Ormuz). Em 3 dos 4 dias independentes com pressão de alta, o GLD caiu no pregão
seguinte (−1,03%, −1,29% e −3,34%; +1,03% no 4º).

**A fonte do teste, autorizada pelo usuário em 2026-11-04 (Welerson), para uma análise avulsa:** o índice de risco
geopolítico (GPR) de Dario Caldara e Matteo Iacoviello (Federal Reserve), diário desde 1985, a contagem de notícias de
tensão geopolítica em jornais, separada em ameaças e atos (`data_gpr_daily_recent.xls`, do site dos autores; uso livre
com citação). A demanda é o E4; o arquivo foi baixado uma vez para a análise e **não é coletado**: não há coletor, nada
foi gravado no banco e nada vai ao prompt. Usá-lo no dia a dia seria outra decisão.

## Evidência

**O desenho, fixado antes de olhar os retornos:** um episódio é o 1º dia em que o GPR passa do percentil 95 (ou 99, o
extremo) dos 365 dias anteriores, sem outro pico nos 10 pregões antes. Para cada série (o total, as ameaças e os atos):
a reação no dia do pico e o retorno do ouro da LBMA do fechamento do dia do pico até 1, 5 e 21 pregões depois (o que a
leitura da madrugada pode capturar), contra todos os dias do mesmo período, com o p-valor de 2.000 sorteios de dias ao
acaso. 1986 a 2026 (a LBMA até 2026-09-29), e as duas metades.

| Série (episódios, 1986 a 2026) | No dia | 1 pregão: alta (todos os dias) | 5 pregões: média (todos) | 21 pregões: média (todos) |
|---|---|---|---|---|
| GPR total, p95 (196) | −0,02% | 59% (51%) | +0,19% (+0,15%), p 0,77 | +0,78% (+0,62%), p 0,63 |
| GPR total, p99 (94) | −0,02% | 57% (51%) | −0,05% (+0,15%), p 0,32 | +0,29% (+0,62%), p 0,47 |
| Ameaças, p99 (97) | −0,03% | 65% (51%) | +0,06% (+0,15%), p 0,63 | +0,37% (+0,62%), p 0,58 |
| Atos, p99 (89) | +0,07% | 53% (51%) | −0,04% (+0,15%), p 0,35 | **−0,26% (+0,62%), p 0,05** |

**Por período, em 1 pregão:**

| Período | GPR total p95 | GPR total p99 | Ameaças p99 | Atos p99 | Todos os dias |
|---|---|---|---|---|---|
| 1986 a 2005: alta em | 48% | 46% | 50% | 38% | 50% |
| 2006 a 2026: alta em | **66%** (116 episódios; média +0,21% contra +0,05%) | 65% | 74% | 68% | 52% |

Em 2006 a 2026, a frequência de alta no pregão seguinte (66% contra 52%) tem significância (p ≈ 0,003). A média é
pequena e não tem (p = 0,15). Em 5 pregões, o efeito some em todas as séries.

**Os maiores episódios** (os 15 maiores do p99): no dia, o ouro quase não reage; em 21 pregões, a Guerra do Golfo
(jan/1991) −7,4%, o Iraque (fev/2003) −6,1% e −4,5%, mar/2026 (o maior pico desde 1991) −13,3%; a Ucrânia (fev/2022),
+1,7%.

**Em resumo:** a premissa do FEL 1 ("crises elevam o ouro") só se sustenta no pregão seguinte, com efeito pequeno e só
de 2006 em diante. Em 7, 30 e 90 dias, o histórico não dá base para a pressão de alta; nos grandes episódios, o ouro
costuma devolver o ganho ("compra no boato, vende no fato").

**A limitação:** o GPR mede a atenção dos jornais, não os eventos que a nossa leitura diária classifica. Ele testa a
premissa do fator, não a qualidade da nossa leitura.

## Decisão

**Quem decidiu:** o usuário (Welerson), em 2026-11-04, com o mesmo poder de decisão do David (`CLAUDE.md`), sobre a
recomendação do FinMind.

1. **A geopolítica do ouro com peso Baixo** (Alto no FEL 1; `ajustesFel1`, no prompt) **e voto só no IMEDIATO**
   (`soNosHorizontes`), onde está o único efeito. Nos outros horizontes, os eventos ficam como pouco relevantes, e o
   prompt (v7, item 6) diz que nos grandes episódios o ouro costumou devolver o ganho. Metodologia ouro-v5.
2. **O teste pré-registrado da nossa leitura de eventos** (`npm run validacao:geopolitica-ouro`), fixado agora:
   - episódio: um evento aceito do `OURO_GEOPOLITICA` com pressão de ALTA; a menos de 5 pregões do anterior, é o mesmo
     episódio;
   - a base: o último pregão do GLD antes da data da leitura; o retorno do GLD encadeado (o vencimento mais próximo com
     ajuste nos dois pregões) 1 e 5 pregões depois, contra o de todos os pregões do mesmo período;
   - passa se, em 1 pregão, a alta for de pelo menos 10 p.p. a mais de casos que em todos os pregões, com o retorno
     médio positivo; o de 5 pregões é registrado ao lado;
   - só roda com **20 episódios**; antes, só conta. Em 2026-11-04, 1 episódio (o dev; no servidor, 3). No ritmo atual,
     de 6 a 12 meses.
3. **Intensidade e confiança como multiplicadores numéricos: não adotados.** Seria agregação em código (ADR 0152); a IA
   já recebe as duas.

## Consequências

- No CURTO do ouro, só as minas votam; no MEDIO e no LONGO, os bancos centrais e as minas; no IMEDIATO, a geopolítica
  (Baixo) e as minas. As leituras de 7 dias tendem a LATERAL ou INSUFICIENTE: o ouro não tem preditor validado nesse
  prazo.
- O GPR fica fora do sistema. O arquivo e o script da análise ficaram fora do repositório; o método e os números estão
  aqui.
