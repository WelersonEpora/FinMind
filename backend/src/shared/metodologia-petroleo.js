"use strict";

const { SITUACAO, montarFatores, montarMetodologia } = require("./metodologia-base");

// Metodologia dos 10 fatores do petróleo: só as definições (o formato de cada uma está em metodologia-base.js). Uma
// PROPOSTA para o David validar, não uma regra (ADR 0050). Fonte do FEL 1: a tabela "Fatores de Influência de Preço:
// Petróleo", v1.1.
//
// Desde a aprovação do David (2026-10-03), a leitura dos fatores vai ao prompt diário e a leitura de tendência da IA
// aparece no Centro de Decisão (ADR 0052). Nada daqui gera sinal de compra ou venda.

// v2 (2026-10-06): a OPEP+ (F1) passa a fator calculado com eventos, pelo STEO da EIA; as perguntas viram decisões (ADR 0091).
// v3 (2026-10-06): o refino (F9) passa a contexto da demanda e os fundos (F8), a só informação, os dois sem pressão
// própria; as perguntas viram decisões (ADRs 0093 e 0094).
// v4 (2026-10-07): os estoques (F2) ficam com a média de 5 anos e a direção do especialista, como leitura da situação,
// com Cushing, gasolina e destilados como contexto; a validação passa ao Brent futuro; as perguntas viram decisões (ADR 0097).
// v6 (2026-10-07): a demanda (F4) fica só com os EUA e o consumo medido, validada contra o Brent futuro (ADR 0099).
// v7 (2026-10-07): o dólar (F5) fica com o índice das economias avançadas, como fator próprio (ADR 0100).
// v5 (2026-10-07): as perguntas da geopolítica (F3) viram decisões: fator próprio, o evento mais grave, a ameaça conta
// com menos peso que a interrupção e a janela de 7 dias, sem vigência (ADR 0098).
const VERSAO = 7;
const DATA_VERSAO = "2026-10-07";

const DEFINICOES = [
  {
    codigo: "PETROLEO_OPEP",
    nome: "Decisões da OPEP+ (produção e capacidade ociosa da OPEP, com os eventos)",
    fel1: {
      tipo: "Geopolítico/Fundamentalista",
      direcao: "Alta com cortes de produção; baixa com aumento de cotas",
      mecanismo: "OPEP+ controla parcela relevante da oferta global",
      fonte: "OPEC"
    },
    evento: { janelaDias: 45 },
    dados: {
      observaveis: ["PETROLEO_OPEP_STEO", "PETROLEO_PRODUCAO_JODI"],
      eventos: true,
      avaliacao: {
        suficiente: true,
        texto:
          "Basta para a pegada das decisões, não para as cotas. No STEO da EIA (225 edições de 2008 a 2026, cada uma com o que se sabia nela), o Brent subiu 6 meses depois em 73% das edições em corte (produção caindo e ociosa subindo; média +11,3%) e em 41% das em aumento (−0,2%), contra 53% em todas (+3,8%): o sentido do especialista. Sem a crise de 2008-09 e sem 2020, 62% e 46%, contra 50%, e a variação média some: o efeito vem sobretudo dos grandes cortes, em 5 episódios de corte e 7 de aumento. A interrupção (as duas caindo: guerra, ataque ou perda de capacidade) não é decisão da OPEP e não é lida pelo fator. A variação da produção sozinha não diz nada (−0,13 com o Brent 6 meses depois)."
      },
      lacunas: [
        "As cotas e o cumprimento delas não são medidos: só estão nos comunicados da OPEP, cujo site bloqueia acesso automático (desafio do Cloudflare, 2026-10-06; ADR 0091).",
        "A capacidade ociosa existe só para a OPEP, não para a OPEP+; a produção da OPEP+ por país só existe nas edições do STEO desde 2024 (contexto).",
        "O STEO estima o mês anterior e revisa os meses seguintes (mediana de 100 mil barris/dia em 3 edições): a decisão de um mês aparece no cálculo com um a dois meses de atraso; a do mês chega pelos eventos.",
        "A filiação da OPEP muda (Angola sai em 2024, os Emirados em 2026), e a edição que tira um país refaz o total para trás; meses antigos guardam a filiação da edição deles."
      ]
    },
    proposta: {
      objetivo: "Medir a pegada das decisões da OPEP+ na oferta e levar à análise as decisões que seguem valendo.",
      medida: "A produção de petróleo bruto e a capacidade ociosa da OPEP no STEO da EIA, mensais; a OPEP+, a Rússia e a Arábia Saudita como contexto. E os eventos aceitos da leitura diária marcados com este fator nos últimos 45 dias, cada um com a data, a idade, o tipo, o resumo, o canal, a pressão (leitura da IA), a intensidade, a confiança e a página da fonte.",
      comparacao: "A média de 3 meses da produção e a da ociosa contra os mesmos 3 meses do ano anterior. Nos eventos, a idade de cada um; os oito países dos cortes voluntários se reúnem todo mês, e toda decisão de produção vira evento, inclusive a que mantém as cotas.",
      leitura: "Corte (produção caindo e ociosa subindo) pesa para alta; aumento (produção subindo e ociosa caindo), para baixa: a direção do especialista. Interrupção, expansão e o resto ficam neutros. Os limiares (±1,5% na produção e ±400 mil barris/dia na ociosa, forte a partir de 5%) são do FinMind, da validação no STEO, ajustáveis pelo Comitê no card C. Decidir. Os eventos ficam com a IA do ativo."
    },
    perguntas: [],
    decisoes: [
      "Memória da política em vigor (usuário, 2026-10-06, ADR 0091): fica a janela de 45 dias dos eventos, sem registrar a vigência de cada decisão.",
      "Toda decisão de produção da OPEP+ é evento (usuário, 2026-10-06, ADR 0091): a leitura diária (prompt de eventos v13) registra também a reunião que só mantém as cotas.",
      "Cumprimento das cotas (usuário, 2026-10-06, ADR 0091): as cotas só estão no site da OPEP, bloqueado; no lugar delas, o STEO da EIA (fonte nova autorizada pelo usuário), com a produção e a capacidade ociosa da OPEP lidas em quatro casos (corte, aumento, interrupção e neutro), validados no histórico do STEO."
    ]
  },
  {
    codigo: "PETROLEO_ESTOQUES_EIA",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com estoques abaixo do esperado; baixa com estoques altos",
      mecanismo: "Relatório semanal de estoques move o preço imediatamente",
      fonte: "EIA, API"
    },
    dados: {
      observaveis: ["PETROLEO_ESTOQUES_EIA"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para a situação do estoque (sobra ou aperto). No histórico do Brent futuro (2011 a 2026, com a data de publicação), o desvio contra a média de 5 anos anda com o preço (-0,50 com o nível: estoque abaixo do normal, preço alto), mas não o antecipa nos horizontes desta leitura (+0,04 com a variação do Brent 30 dias depois; +0,08 com 91 dias). Em 6 meses, o histórico aponta o contrário da direção do especialista: com o estoque 10% ou mais acima do normal, o Brent subiu em 66% das semanas 182 dias depois, contra 48% em todas; 10% ou mais abaixo, em 5% (21 semanas, de poucos episódios); o mesmo sem 2014-16 e 2020-21 e sem sobreposição. Por isso a leitura é a da situação. Não serve para a reação do dia da divulgação: com a variação da semana longe da típica, o Brent foi no sentido esperado em 54% das vezes, porque o mercado reage à previsão dos analistas, que é paga. Cushing, gasolina e destilados vão como contexto: o total (petróleo, gasolina e destilados) anda um pouco mais com o preço (-0,56), com o mesmo padrão para frente."
      },
      lacunas: [
        "Para a reação do dia: a previsão dos analistas para a semana (o \"esperado\" no sentido do mercado) não é coletada; é paga.",
        "O boletim do API não é coletado: mede o mesmo que a EIA, um dia antes, e é pago."
      ]
    },
    proposta: {
      objetivo: "Medir se há sobra ou falta de petróleo nos EUA.",
      medida: "Estoque de petróleo sem a reserva estratégica (SPR) e a variação contra a semana anterior; como contexto, fora da regra, o desvio de Cushing, da gasolina e dos destilados contra a mesma média.",
      comparacao: "Média da mesma semana nos 5 anos anteriores (a comparação que a própria EIA publica no relatório).",
      leitura: "Estoque abaixo da média de 5 anos indica aperto (pressão de alta); acima, sobra (pressão de baixa); dentro de uma faixa neutra (padrão: 3%), sem pressão. Intensidade forte a partir de 10% de desvio. Tendência: se o desvio mudou 2 p.p. ou mais em 4 semanas, o aperto ou a sobra está aumentando ou diminuindo. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [],
    decisoes: [
      "Esperado (usuário, 2026-10-07, ADR 0097): o normal da época, a média da mesma semana nos 5 anos anteriores; a reação do dia da divulgação fica de fora (depende da previsão dos analistas, que é paga). A direção do especialista fica, como leitura da situação, como na demanda e na oferta não-OPEP: no histórico do Brent futuro, o fator não antecipa o preço até 90 dias e, em 6 meses, aponta o contrário.",
      "Estoques (usuário, 2026-10-07, ADR 0097): a pressão vem só do petróleo sem a SPR; o desvio de Cushing, da gasolina e dos destilados vai ao prompt como contexto, fora da regra. Na semana de 2026-09-25, o petróleo estava perto do normal (+1,9%) e os destilados, 13% abaixo."
    ]
  },
  {
    codigo: "PETROLEO_GEOPOLITICA",
    fel1: {
      tipo: "Geopolítico",
      direcao: "Alta com tensão e risco de interrupção de oferta",
      mecanismo: "Conflitos ameaçam rotas e produção",
      fonte: "EIA, IEA"
    },
    evento: { janelaDias: 7 },
    dados: {
      observaveis: [],
      eventos: true,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente como fator de evento: a leitura diária por IA (desde 2026-10-02) busca em fontes autorizadas (UKMTO/JMIC, Tesouro dos EUA, AP News, OPEP e outras) e só aceita o evento sustentado por uma página que a pesquisa leu. Não é série: não é reproduzível nem serve para backtest (ADRs 0047 e 0049); o histórico das leituras é guardado para calibrar a régua depois."
      },
      lacunas: [
        "A régua dos níveis da leitura diária (o que é \"fora do normal\") é provisória (ADRs 0047 e 0049).",
        "A leitura registra o fato novo das últimas 24 a 48 horas: uma situação crônica (uma guerra em curso, uma sanção antiga) só volta a aparecer quando algo muda. A janela de 7 dias guarda os fatos recentes, não o que é crônico.",
        "A data do evento é a da leitura que o registrou; o evento não diz até quando vale."
      ]
    },
    proposta: {
      objetivo: "Levar à análise o risco de interrupção da oferta ou das rotas por conflito, sanção ou ataque, com os fatos recentes que seguem pesando.",
      medida: "Fator de evento, sem cálculo: os eventos aceitos da leitura diária marcados com este fator nos últimos 7 dias, cada um com a data da leitura que o registrou e a idade, o tipo, o resumo (com a data do fato, quando a fonte a dá), o canal, a pressão (leitura da IA), a intensidade, a confiança e a página da fonte autorizada, mais o nível e o resumo do petróleo na leitura mais recente.",
      comparacao: "Sem comparação numérica: a idade de cada evento e o nível da leitura mais recente (NORMAL a EXCEPCIONAL, escala provisória).",
      leitura: "Fica com a IA do ativo, com os outros fatores, como fator próprio: vale o evento mais grave da janela, não a quantidade; a interrupção material (ataque a navio ou instalação, rota fechada, produção parada) pressiona para cima, e a ameaça ou tensão sem efeito material também, com menos peso (a direção do especialista: \"alta com tensão e risco de interrupção\"). A falta de evento novo não encerra uma situação em curso."
    },
    perguntas: [],
    decisoes: [
      "Vigência (usuário, 2026-10-07, ADR 0098): a leitura diária não registra até quando cada fato vale; fica a janela de 7 dias. Uma situação em curso sem fato novo sai da janela, mas o preço, a curva e a interrupção da OPEP+ (F1) a carregam, e uma escalada nova volta como evento.",
      "Ameaça (usuário, 2026-10-07, ADR 0098): conta como pressão de alta, menor que a da interrupção concreta, como no FEL 1 (\"alta com tensão e risco de interrupção\").",
      "Mais grave ou quantidade (usuário, 2026-10-07, ADR 0098): vale o evento mais grave da janela; a quantidade não soma pressão, porque premiaria a cobertura da imprensa. Vários eventos só dizem que a tensão escala quando são desdobramentos novos (a regra de repetição, ADR 0092).",
      "Papel (usuário, 2026-10-07, ADR 0098): fator próprio, como no FEL 1 (peso Alto), sem contar duas vezes a interrupção que o F1 já mostra; revisitar quando o David definir peso e agregação."
    ]
  },
  {
    codigo: "PETROLEO_DEMANDA",
    nome: "Demanda dos EUA (consumo de derivados)",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com demanda forte; baixa com recessão",
      mecanismo: "Crescimento econômico (China, EUA) define demanda",
      fonte: "IEA, OPEC"
    },
    dados: {
      observaveis: ["PETROLEO_FLUXOS_EIA", "PETROLEO_DEMANDA_JODI"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para a demanda dos EUA, que o fator calcula. No histórico do Brent futuro (2011 a 2026, com a data de publicação), o crescimento anual do consumo dos EUA anda com o preço que já aconteceu (+0,28 com a variação dos 6 meses anteriores), mas não o antecipa (-0,06, -0,08 e -0,12 com o Brent 30, 91 e 182 dias depois; sem 2020-21, perto de zero): os dois seguem a economia. Mede a situação, como o especialista descreve. Os extremos (5% ou mais para cima ou para baixo) foram seguidos de alta em ~70% dos casos em 6 meses, mas quase só pelo colapso e pela retomada da pandemia. A China, que o especialista cita, ficou de fora: no JODI é \"não avaliada\", não mostra relação com o Brent (perto de zero antes e depois) e a queda de 2026 (-23,7% contra um ano antes em jul/2026) acompanha a perda de oferta da OPEP no STEO (de 25,9 para 16,4 milhões de barris/dia de fev a mai/2026): leria um choque de oferta como demanda fraca."
      },
      lacunas: [
        "A China (JODI) não entra no cálculo: dado não avaliado pelo próprio JODI, sem relação com o Brent, com ~2 meses de atraso e, em 2026, a queda que acompanha a perda de oferta da OPEP. Continua coletada (card do JODI).",
        "A Rússia não reporta ao JODI; indicadores de atividade econômica (PMI, PIB) não são coletados."
      ]
    },
    proposta: {
      objetivo: "Medir se o consumo de petróleo está forte ou fraco, pela demanda dos EUA.",
      medida: "Consumo médio das últimas 4 semanas nos EUA (derivados fornecidos, EIA); a semana isolada oscila com feriados.",
      comparacao: "O mesmo período do ano anterior (crescimento anual), que tira a sazonalidade.",
      leitura: "Crescimento anual acima de uma faixa neutra (padrão: 2%) é demanda forte (pressão de alta); abaixo, demanda fraca (pressão de baixa). Intensidade forte a partir de 5%. Tendência: se o crescimento mudou 2,5 p.p. ou mais em 13 semanas, está subindo ou caindo. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [],
    decisoes: [
      "China (usuário, 2026-10-07, ADR 0099): só os EUA. A China do JODI fica fora do cálculo e do prompt: \"não avaliada\", sem relação com o Brent e, em 2026, com a queda que acompanha a perda de oferta da OPEP, que o fator leria como demanda fraca. Continua coletada.",
      "Atividade econômica (usuário, 2026-10-07, ADR 0099): o consumo medido basta, lido como situação, com a direção do especialista (como os estoques, ADR 0097). Um indicador de atividade também andaria com a economia, e seria fonte nova com a aquisição encerrada; fica como lacuna."
    ]
  },
  {
    codigo: "PETROLEO_DOLAR",
    nome: "Dólar (índice do Fed contra as economias avançadas)",
    fel1: {
      tipo: "Cambial",
      direcao: "Dólar forte pressiona; dólar fraco favorece",
      mecanismo: "Petróleo é cotado em US$; correlação inversa",
      fonte: "US Treasury"
    },
    dados: {
      observaveis: ["DOLAR_AMPLO_FED", "CAMBIO_DXY_FED"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o índice do Fed contra as moedas das economias avançadas é o mais próximo do DXY que o especialista cita. No histórico do Brent futuro (2011 a 2026, com a data de publicação), o dólar é o fator do petróleo com a relação mais forte com o preço seguinte, na direção do especialista: o desvio contra a média das 52 semanas anteriores tem -0,14, -0,19 e -0,35 com a variação do Brent 30, 91 e 182 dias depois (-0,38 com os 6 meses anteriores: andam juntos, em sentidos opostos), o mesmo sem 2014-16 e 2020-21 (-0,24 e -0,38 em 91 e 182 dias). Com o dólar 5% ou mais acima do normal, o Brent subiu em 22% dos casos 91 dias depois (10% em 182, média de -18%); de 2% a 5% abaixo, em 70% (79% em 182, +18%), contra 49% em todas; sem sobreposição, o mesmo quadro. O índice amplo (26 moedas) dá quase o mesmo (-0,15 em 91 dias). Exemplos: dólar 15,6% acima do normal em out/2008 e 8,4% em dez/2014, nas duas grandes quedas do petróleo."
      },
      lacunas: [
        "O DXY oficial (ICE) é licenciado e não é coletado; o índice do Fed das economias avançadas é o substituto (mesmas moedas principais, pesos diferentes).",
        "O Fed divulga os índices em lote semanal (segundas): a última semana pode estar incompleta."
      ]
    },
    proposta: {
      objetivo: "Medir se o dólar está forte ou fraco em relação ao normal recente, o que encarece ou barateia o petróleo para quem compra em outra moeda.",
      medida: "Índice do dólar do Fed contra as economias avançadas, na média da semana; a variação em 13 semanas como contexto.",
      comparacao: "A média das 52 semanas anteriores (o normal recente do dólar).",
      leitura: "Dólar acima do normal além de uma faixa (padrão: 2%) pressiona o petróleo para baixo; abaixo, favorece (pressão de alta). Intensidade forte a partir de 5%. Tendência: se o desvio mudou 1,5 p.p. ou mais em 4 semanas, o dólar está se fortalecendo ou se enfraquecendo. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [],
    decisoes: [
      "Índice (usuário, 2026-10-07, ADR 0100): o do Fed contra as economias avançadas, no lugar do DXY: o mais parecido com o do especialista e um pouco melhor nos horizontes da leitura que o amplo (-0,19 contra -0,15 em 91 dias). O amplo continua coletado.",
      "Papel (usuário, 2026-10-07, ADR 0100): fator próprio, como no FEL 1 (peso Médio), com a direção do especialista; é o fator do petróleo que mais antecipa o preço no histórico do Brent futuro."
    ]
  },
  {
    codigo: "PETROLEO_PRODUCAO_EUA",
    nome: "Produção dos EUA",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com produção menor; baixa com produção recorde",
      mecanismo: "Rig count e produção de xisto ajustam oferta",
      fonte: "EIA, Baker Hughes"
    },
    dados: {
      observaveis: ["PETROLEO_FLUXOS_EIA"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para medir a oferta americana. No histórico do FinMind, de 2010 em diante, o crescimento anual da produção anda no sentido contrário do WTI 26 semanas depois (correlação de -0,39; -0,22 em 13 semanas; desde 1990, -0,19): produção crescendo forte antecede preço em queda, a direção indicada pelo especialista. O preço não aparece puxando a produção no mesmo período (o crescimento não acompanha a alta do WTI dos 6 a 12 meses anteriores). Exemplos: recorde e +13% no ano em nov/2014, antes da queda de 2015; recorde e +10% em nov/2019, antes de 2020. A semana isolada é estimativa arredondada da EIA: por isso a medida usa a média de 4 semanas e o crescimento anual."
      },
      lacunas: [
        "O rig count (Baker Hughes) não é coletado: ele antecipa a produção em alguns meses (um aviso mais cedo), mas não é necessário para medi-la.",
        "A produção semanal é estimativa da EIA, arredondada e revista depois pelo dado mensal (não coletado)."
      ]
    },
    proposta: {
      objetivo: "Medir se a oferta americana está crescendo ou encolhendo, e se está em recorde.",
      medida: "Produção média das últimas 4 semanas (a semana isolada é arredondada) e a distância do recorde.",
      comparacao: "O mesmo período do ano anterior (crescimento anual), que tira a sazonalidade.",
      leitura: "Crescimento anual acima de uma faixa neutra (padrão: 3%) indica mais oferta (pressão de baixa); abaixo, menos oferta (pressão de alta). Intensidade forte a partir de 10%. Tendência: se o crescimento mudou 2 p.p. ou mais em 13 semanas, o crescimento está subindo ou caindo. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "O crescimento anual da produção basta, ou o rig count (que antecipa a produção, e não é coletado) é necessário?",
      "A produção em recorde deve pesar por si, mesmo com crescimento pequeno (como em set/2026: recorde, +3,3% no ano)?"
    ]
  },
  {
    codigo: "PETROLEO_JUROS",
    fel1: {
      tipo: "Macroeconômico",
      direcao: "Juros altos podem pressionar demanda; juros baixos favorecem",
      mecanismo: "Custo de capital e atividade econômica",
      fonte: "Fed"
    },
    dados: {
      observaveis: ["META_FED", "TREASURY_10A", "CPI_EUA"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o Treasury de 10 anos (diário, desde 1962) e a meta do Fed (desde dez/2008) são coletados do FRED. No histórico do FinMind (2010 a 2026), a meta do Fed só se relaciona com o preço por causa da pandemia: sem 2019 a 2021, a correlação dela com o WTI 26 ou 52 semanas depois fica perto de zero. O juro longo, sim: a alta do Treasury em 26 semanas tem correlação de -0,17 com o WTI 26 semanas depois (-0,29 sem a pandemia), e com o juro subindo 1 p.p. ou mais no ano o WTI caiu em 76% dos casos nas 26 semanas seguintes (média de -7%), a direção indicada pelo especialista. O juro também anda com o petróleo dos meses anteriores (+0,25: petróleo alto, inflação, juro). Ressalva: no período houve só dois ciclos de alta (2015-18 e 2022-23)."
      },
      lacunas: [
        "A expectativa do mercado para os juros (futuros de Fed Funds) não é coletada; o Treasury de 10 anos a embute.",
        "A inflação (CPI) é coletada, mas não entra no cálculo: chega ao petróleo pelo juro."
      ]
    },
    proposta: {
      objetivo: "Medir se o custo do dinheiro nos EUA está subindo ou caindo, o que pesa na atividade e na demanda por petróleo.",
      medida: "Rendimento do Treasury de 10 anos, na média da semana; a meta do Fed e a variação dela em 52 semanas (o ciclo) como contexto.",
      comparacao: "O próprio Treasury 26 semanas antes: a variação em p.p.",
      leitura: "Juro subindo além de uma faixa (padrão: 0,5 p.p. em 26 semanas) pressiona o petróleo para baixo; caindo, favorece (pressão de alta). Intensidade forte a partir de 1 p.p. Tendência: se a variação mudou 0,25 p.p. ou mais em 4 semanas, a alta (ou a queda) está ganhando força. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "Juros entram como fator com direção própria ou só como contexto para a demanda? A proposta dá direção, com base no histórico do juro longo.",
      "O juro longo (Treasury de 10 anos, que o mercado define) serve no lugar da meta do Fed (que o FEL 1 cita)? A meta, sozinha, não mostrou relação com o preço fora da pandemia."
    ]
  },
  {
    codigo: "PETROLEO_FUNDOS",
    fel1: {
      tipo: "Técnico/Fluxo",
      direcao: "Amplifica movimentos em ambos os sentidos",
      mecanismo: "Posições especulativas amplificam tendências",
      fonte: "CFTC"
    },
    informativo: true,
    papelDecididoPor: "do usuário",
    dados: {
      observaveis: ["COT_PETROLEO_WTI"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para medir o posicionamento: o COT da CFTC traz as posições compradas e vendidas dos fundos (managed money) no WTI da NYMEX, toda semana, desde 2006. No histórico do Brent (2010 a 2026, com a data de divulgação), a posição líquida em % dos contratos em aberto segue o preço (+0,27 com a variação dos 6 meses anteriores: os fundos compram depois da alta, o \"amplifica\" indicado pelo especialista), mas não o antecipa. Nos extremos dos 3 anos anteriores, nem reversão nem continuação com significância: com os fundos entre os 10% mais vendidos, o Brent subiu em 66% das semanas 26 semanas depois, contra 49% em todas, mas são 15 episódios, e sem sobreposição 8 de 14 (p = 0,38); entre os 10% mais comprados, subiu em 54%, o contrário da reversão (6 de 11 na queda; p = 0,52). Com 1 e 5 anos de janela e com o desvio-padrão no lugar do percentil, o mesmo. Por isso o fator é só informação, sem pressão própria."
      },
      lacunas: [
        "Só futuros e só os fundos (managed money): o relatório que soma opções e as demais categorias (produtores, swap dealers) não é coletado.",
        "Posição de terça, divulgada na sexta seguinte: atrasa com feriado e atrasou semanas no shutdown de 2025."
      ]
    },
    proposta: {
      objetivo: "Medir o posicionamento dos fundos (managed money) no WTI.",
      medida: "Posição líquida (comprados menos vendidos) em % dos contratos em aberto, com a variação semanal em contratos.",
      comparacao: "Percentil da posição líquida nas 156 semanas (3 anos) anteriores; a posição relativa é o percentil menos 50 (de -50 a +50).",
      leitura: "Só informação (decisão do usuário, ADR 0094): na análise, os fundos não têm pressão própria e não contam a favor nem contra; a posição, o percentil e a tendência (comprando ou vendendo) vão ao prompt, e a IA diz o papel do posicionamento no campo próprio dele, sem ler reversão como pressão. A simulação da camada C continua na tela só como referência para o Comitê: fundos muito comprados (acima do percentil 80, posição relativa de +30) seriam pressão de baixa, muito vendidos (abaixo do 20) de alta; forte além do 10 e do 90 (40 pontos); tendência se a posição relativa mudou 15 pontos ou mais em 4 semanas."
    },
    perguntas: [],
    decisoes: [
      "Direção própria (usuário, 2026-10-06, ADR 0094): os fundos ficam só como informação, sem pressão própria. No histórico do Brent, nem a reversão nos extremos (a proposta) nem seguir os fundos (o \"amplifica\" do especialista) se sustentam por episódio; é a mesma decisão do F7 do café (ADR 0089).",
      "Extremo (usuário, 2026-10-06, ADR 0094): o percentil nos 3 anos anteriores (P10/P90 e P20/P80), como no ouro e no café, só para descrever a posição. Janelas de 1 e 5 anos e o desvio-padrão deram o mesmo; a máxima histórica não foi testada (rara demais para a amostra)."
    ]
  },
  {
    codigo: "PETROLEO_REFINO",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Margens altas elevam demanda por cru; margens baixas reduzem",
      mecanismo: "Rentabilidade do refino influencia demanda por petróleo bruto",
      fonte: "EIA"
    },
    contextoDe: "PETROLEO_DEMANDA",
    papelDecididoPor: "do usuário",
    dados: {
      observaveis: ["PETROLEO_PRECOS_EIA", "PETROLEO_FLUXOS_EIA"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para medir a margem de refino, que a EIA não publica: o FinMind a calcula com os preços à vista que já coleta (gasolina e diesel de Nova York e o Brent), desde 2006 (o diesel S10 começa aí; a média de 5 anos, em 2011). A margem acima do normal anda com refinarias mais cheias (correlação de +0,25 com a utilização), o mecanismo indicado pelo especialista, mas a direção que ele dá para o preço NÃO aparece no histórico do Brent (2011 a 2026, com a data de publicação): o desvio tem -0,16 com o Brent 26 semanas depois, no sentido contrário; com a margem bem acima do normal (US$ 10 ou mais), o Brent subiu em 26% dos casos 26 semanas depois (média de -7%), contra 48% em todas as semanas; sem a crise do diesel de 2022-23, em 32% (poucos episódios). O crack só do diesel dá o mesmo (-0,17); o só da gasolina, mais fraco (-0,11). Por isso o refino é contexto da demanda, sem pressão própria. Com o Brent, e não o WTI, no crack: os derivados de Nova York são precificados contra o Brent, e em 2011-2013 o WTI ficou até US$ 20 abaixo dele, o que inflava o crack sem que a margem real subisse."
      },
      lacunas: [
        "A margem de refino não é publicada pela EIA: é calculada pelo FinMind (crack 3-2-1). Só Nova York: os preços da Costa do Golfo não são coletados.",
        "Os preços diários saem uma vez por semana (quarta): a última semana pode ter só 1 ou 2 dias."
      ]
    },
    proposta: {
      objetivo: "Medir se refinar está dando lucro acima ou abaixo do normal, o que puxa (ou freia) a compra de petróleo bruto.",
      medida: "Crack spread 3-2-1 com os preços de Nova York e o Brent: [(2 × gasolina + 1 × diesel) × 42 galões − 3 × Brent] ÷ 3, em US$ por barril, na média dos dias da semana; a utilização das refinarias como contexto.",
      comparacao: "Média do crack da mesma semana nos 5 anos anteriores (a margem é sazonal); o desvio em US$ por barril, e não em %, que explode quando a média é baixa.",
      leitura: "Contexto da demanda (decisão do usuário, ADR 0093): na análise, o refino não tem pressão própria e não conta a favor nem contra; a margem explica a demanda por petróleo bruto, e a tendência dela (subindo ou caindo) vai ao prompt. A simulação da camada C continua na tela só como referência para o Comitê: margem acima do normal além de uma faixa (padrão: US$ 3 por barril) seria pressão de alta, abaixo, de baixa (a direção do especialista); forte a partir de US$ 10; tendência se o desvio mudou US$ 3 ou mais em 4 semanas."
    },
    perguntas: [],
    decisoes: [
      "Crack spread (usuário, 2026-10-06, ADR 0093): fica o 3-2-1 com o Brent. Gasolina e diesel separados não mudam a relação com o preço (o diesel dá o mesmo; a gasolina, uma relação mais fraca); a margem do diesel, que puxa a alta de 2022 e de 2026, já pesa nele.",
      "Margem muito alta (usuário, 2026-10-06, ADR 0093): o refino passa a contexto da demanda, sem pressão própria. No histórico do Brent, a margem bem acima do normal foi seguida de queda do petróleo, não de alta (a direção do especialista); inverter a leitura se apoiaria quase só em 2022-23."
    ]
  },
  {
    codigo: "PETROLEO_OFERTA_NAO_OPEP",
    nome: "Oferta não-OPEP (Brasil, Noruega e Canadá)",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com oferta menor; baixa com crescimento de produção",
      mecanismo: "Novos produtores aumentam oferta global",
      fonte: "ANP, EIA, IEA"
    },
    dados: {
      observaveis: ["PETROLEO_PRODUCAO_ANP", "PETROLEO_PRODUCAO_JODI"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para medir a oferta de Brasil, Noruega e Canadá (~10,7 milhões de barris/dia em jul/2026), mensal, desde 2002. No histórico do FinMind (2010 a 2026), o crescimento anual destes três não antecipa o preço (perto de zero com o WTI 6 e 12 meses depois, contando os ~2 meses até a divulgação): mede a situação da oferta, como a demanda. A relação com o preço aparece nos EUA (-0,39), que têm fator próprio. A oferta dos três cresceu na maior parte do período (pré-sal e areias betuminosas): com a faixa padrão, o fator fica em pressão de baixa em cerca de metade dos meses."
      },
      lacunas: [
        "A Guiana, que o especialista cita e é a produção que mais cresce, não reporta a nenhuma fonte coletada.",
        "O Brasil para no JODI em dez/2022: vem da ANP, em m³ por mês e por UF, convertido pelo FinMind em barris/dia.",
        "Mensal, com ~2 meses de atraso (JODI); o mês só entra com os três países."
      ]
    },
    proposta: {
      objetivo: "Medir o crescimento da oferta de Brasil, Noruega e Canadá, produtores fora da OPEP+.",
      medida: "Produção somada de Brasil (ANP), Noruega e Canadá (JODI), em mil barris/dia, na média de 3 meses. O Canadá, fora do FEL 1, entrou por decisão do usuário (4º produtor do mundo); os EUA ficaram de fora, por decisão do usuário, porque já são o fator de produção dos EUA.",
      comparacao: "A média dos mesmos 3 meses do ano anterior: o crescimento anual, em %.",
      leitura: "Oferta crescendo além de uma faixa (padrão: 3% no ano) pressiona o petróleo para baixo; encolhendo, favorece (pressão de alta). Intensidade forte a partir de 7%. Tendência: se o crescimento mudou 2 p.p. ou mais em 3 meses, a oferta está acelerando ou desacelerando. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "Os países são lidos um a um ou somados num bloco? A proposta soma Brasil, Noruega e Canadá.",
      "O fator mede a situação (não antecipa o preço, como a demanda): serve assim, ou a oferta não-OPEP só importa quando surpreende (o que exigiria a projeção da IEA ou da EIA, não coletada)?"
    ]
  }
];

const FATORES_PETROLEO = montarFatores("PETROLEO", DEFINICOES);

// O que vale para o ativo, não para um fator (metodologia-base.js): o preço de referência e a leitura da IA. As
// perguntas vêm das respostas do David ao FEL 1 (ADR 0055) e da conversa marcada com ele
// (docs/conversa-david-respostas-fel1.md, pontos 2 a 4).
const DO_ATIVO = {
  decisoes: [
    "Preço de referência: o Brent futuro (NYMEX BZ, pelo Yahoo, fonte não oficial e provisória), o instrumento operado, com cada horizonte no vencimento que ainda negocia depois da data-alvo, a curva no prompt e as faixas recalibradas no futuro. Usuário, 2026-10-07 (ADRs 0052, adendo de 2026-10-07, e 0096). Antes: o Brent à vista da EIA (David, 2026-10-04) e, até 2026-10-03, o WTI.",
    "Leitura diária de tendência da IA no Centro de Decisão: quatro horizontes (1, 7, 30 e 90 dias), contados da data da análise, cada um com uma faixa de variação calibrada no histórico (provisória). Leitura, não recomendação. David, 2026-10-03 (ADRs 0051 e 0052)."
  ],
  perguntas: [
    "Brent futuro como referência (decisão do usuário de 2026-10-07, para confirmar): o contrato por horizonte vale para o petróleo, como no milho e no café? E a mudança de nível está de acordo (em setembro de 2026, o futuro ficou ~US$ 11 abaixo do Brent à vista da EIA)? A assinatura da ICE (~US$ 2.500/ano), a fonte oficial, vai ao Comitê.",
    "Formato da leitura da IA: as faixas calibradas por horizonte (hoje) atendem, ou a IA deve dar uma variação central em % com as 6 classes fixas do prompt do milho (de irrelevante a excepcional)? Os cenários altista, neutro e baixista, sem probabilidade, podem entrar.",
    "Peso e agregação: o mapa sazonal de pesos e as regras de agregação propostas para o milho (blocos com teto de peso, fundos como multiplicador, conflito entre blocos reduz a confiança) valem também para o petróleo (ex.: a temporada de gasolina dos EUA)? Hoje o peso é o do FEL 1, e a IA explica as forças, sem agregação.",
    "Validação dos eventos: os eventos da OPEP+ e da geopolítica vão ao prompt sem validação humana, cada um com o link da fonte. A validação humana antes do prompt, pedida no fator 8 do milho, vale também aqui?"
  ]
};

function obterMetodologiaPetroleo() {
  return montarMetodologia({ ativo: "PETROLEO", nome: "Petróleo", versao: VERSAO, dataVersao: DATA_VERSAO, doAtivo: DO_ATIVO, fatores: FATORES_PETROLEO });
}

module.exports = { SITUACAO, FATORES_PETROLEO, obterMetodologiaPetroleo };
