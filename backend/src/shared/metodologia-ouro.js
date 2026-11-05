"use strict";

const { SITUACAO, VALIDACAO_MOTORES, montarFatores, montarMetodologia } = require("./metodologia-base");

// Metodologia dos 8 fatores do ouro: só as definições (o formato de cada uma está em metodologia-base.js). Nasceu como
// PROPOSTA para o David validar (ADR 0053), no molde da do petróleo (ADR 0050); o motor foi validado como está pelo
// Comitê, com o David, em 2026-10-07 (ADR 0108). Fonte do FEL 1: a tabela "Fatores de Influência de Preço: Ouro", v1.1.
//
// A validação histórica de cada fator é contra o ouro da LBMA (PM, em US$, diário), o histórico mais longo na base; a
// LBMA saiu em 2026-10-01 (ADR 0044), então o histórico vai até 2026-09-28.
//
// Aprovação do David (2026-10-03, ADR 0054): os fatores vão ao prompt diário do ouro e a leitura de tendência da IA
// aparece no Centro de Decisão, como no petróleo (ADR 0052). Com as decisões: o preço de referência é o futuro GLD da B3
// (a LBMA só como histórico, shared/analise-diaria-ouro.js), a inflação vira CONTEXTO do juro real, o COT fica na
// leitura "amplifica" e é tratado como qualificador, e os bancos centrais usam o World Gold Council contra o ritmo dos
// 3 anos anteriores. Nada daqui gera sinal de compra ou venda.

// v1 (2026-10-03): a proposta (ADR 0053). v2 (2026-10-04): as decisões do David (ADR 0054).
// v3 (2026-10-08): o motor validado pelo Comitê, com o David, em 2026-10-07; os fatores saem como validados (ADR 0108).
// v4 (2026-11-04): pelo IC por horizonte (análise do ouro de 2026-11-01, item E1; ADR 0150, adendo), o juro real, o
// dólar, a inflação, os ETFs e os fundos como INFORMAÇÃO, sem peso; a inflação deixa de ser contexto do juro real; os
// bancos centrais votam só no MEDIO e no LONGO.
// v5 (2026-11-04): a geopolítica com o peso Baixo e o voto só no IMEDIATO, pelo teste do índice de risco geopolítico
// (GPR) contra o ouro de 1986 a 2026 (item E4 da análise; ADR 0154).
// v6 (2026-11-04): a expectativa de juros (o Treasury de 2 anos em 13 semanas), fator fora do FEL 1, com peso Baixo e
// voto só no MEDIO e no LONGO (item M1 da análise; ADR 0155).
const VERSAO = 6;
const DATA_VERSAO = "2026-11-04";
const DECISAO_DAVID = "David, 2026-10-03 (ADR 0054)";
// A decisão do IC (ADR 0150, adendo): o fator com IC indistinguível de zero em todos os horizontes perde o voto e o peso.
const DECISAO_IC =
  "o usuário (Welerson), em 2026-11-04, com o mesmo poder de decisão do David, pela análise do ouro de 2026-11-01, item E1 (ADR 0150, adendo)";
const semPeso = (noFel1) => ({ campo: "Peso", noFel1, ajuste: "Sem peso", noPrompt: "pelo usuário", origem: `Decidido por ${DECISAO_IC}.` });

const DEFINICOES = [
  {
    codigo: "OURO_JUROS_REAIS",
    nome: "Juro real (Treasury de 10 anos indexado à inflação)",
    fel1: {
      tipo: "Macroeconômico",
      direcao: "Juros reais altos pressionam ouro; juros baixos favorecem",
      mecanismo: "Ouro não paga juros; custo de oportunidade sobe com taxas altas",
      fonte: "Federal Reserve, US Treasury"
    },
    // Só informação, sem peso (ADR 0150, adendo): o IC é zero nos quatro horizontes.
    informativo: true,
    papelDecididoPor: "do usuário",
    ajustesFel1: [semPeso("Alto")],
    dados: {
      observaveis: ["TREASURY_10A", "META_FED"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o juro real de 10 anos (TIPS, no FRED desde 2003) é a medida de mercado do custo de oportunidade que o especialista descreve. No histórico do FinMind (2006 a 2026, contra o ouro da LBMA), a variação do juro real em 26 semanas anda com o ouro em sentido contrário: -0,52 com a variação do ouro nas mesmas 26 semanas, e -0,64 em 2023 a 2026, os anos do \"descolamento\" que o FEL 1 cita (que é do NÍVEL do juro real, não da variação). Mas ela não antecipa o preço: +0,12 com o ouro 26 semanas depois. O nível tem correlação POSITIVA com o ouro seguinte (+0,51), o contrário da direção do FEL 1, por efeito das tendências longas: por isso a proposta usa a variação. O IC por horizonte (ADR 0150), de 2006 a 2026 contra a LBMA: −0,00 em 1 pregão, +0,03 em 5, +0,01 em 21 e −0,02 em 62, perto de zero nas duas metades do período; a variação de 1 e de 4 semanas, também. O fator explica o movimento que já aconteceu, mas não o antecipa em nenhum horizonte."
      },
      lacunas: [
        "A expectativa direta para o Fed (os futuros de Fed Funds) não é coletada; o juro de 10 anos a embute.",
        "O FRED publica o valor de sexta na segunda: a semana mais recente pode ficar incompleta."
      ]
    },
    proposta: {
      objetivo: "Medir se o custo de oportunidade de ficar com o ouro está subindo ou caindo.",
      medida: "Juro real de 10 anos (TIPS), na média da semana; a meta do Fed e o ciclo dela em 52 semanas como contexto.",
      comparacao: "O mesmo juro real 26 semanas antes: a variação, em p.p.",
      leitura: "Juro real subindo além de uma faixa (padrão: 0,25 p.p. em 26 semanas) pressiona o ouro para baixo; caindo, favorece (pressão de alta). Intensidade forte a partir de 0,6 p.p. Tendência: se a variação mudou 0,2 p.p. ou mais em 4 semanas, o juro real está acelerando a alta ou a queda. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    decisoes: [
      `Só como informação, sem peso (Alto no FEL 1): o IC é indistinguível de zero nos quatro horizontes, pela variação de 26, 4 e 1 semana; o nível tem o sinal contrário ao do FEL 1 (−0,21 em 21 pregões e −0,36 em 62), efeito de duas séries em tendência, e não é usado. O fator vai à IA sem pressão e fora dos fatores a favor e contra. Decidido por ${DECISAO_IC}.`
    ],
    perguntas: [
      "O FEL 1 fala em \"detecção de regime\" para o descolamento de 2023-2025: a variação, que manteve a relação nesses anos, resolve, ou o especialista quer outro tratamento?"
    ]
  },
  {
    codigo: "OURO_DOLAR",
    nome: "Dólar (índice do Fed contra as economias avançadas)",
    fel1: {
      tipo: "Cambial",
      direcao: "Dólar forte pressiona ouro; dólar fraco favorece",
      mecanismo: "Ouro é cotado em US$; correlação inversa clássica",
      fonte: "US Treasury, World Bank"
    },
    // Só informação, sem peso (ADR 0150, adendo): o IC tem um sinal fraco só em 7 dias.
    informativo: true,
    papelDecididoPor: "do usuário",
    ajustesFel1: [semPeso("Alto")],
    dados: {
      observaveis: ["DOLAR_AMPLO_FED", "CAMBIO_DXY_FED"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o mesmo índice do Fed contra as economias avançadas usado no petróleo, o mais próximo do DXY que o especialista cita. No histórico do FinMind (2006 a 2026, contra a LBMA), o desvio do dólar contra a média das 52 semanas anteriores tem -0,50 com a variação do ouro nas 26 semanas anteriores, nos três períodos (2006 a 2014, 2015 a 2022 e 2023 a 2026): a \"correlação inversa clássica\" do FEL 1. Mas não antecipa o preço: -0,04 com o ouro 26 semanas depois. O IC por horizonte (ADR 0150), de 2006 a 2026 contra a LBMA: +0,05 em 1 pregão, +0,06 em 5 (o único com o intervalo de 90% excluindo o zero, por pouco: +0,01 a +0,11), +0,05 em 21 e +0,06 em 62; a variação de 1 e de 4 semanas, perto de zero."
      },
      lacunas: [
        "O DXY oficial (ICE) é licenciado e não é coletado; o índice do Fed das economias avançadas é o substituto.",
        "O Fed divulga os índices em lote semanal (segundas): a última semana pode estar incompleta."
      ]
    },
    proposta: {
      objetivo: "Medir se o dólar está forte ou fraco em relação ao normal recente, o que encarece ou barateia o ouro para quem compra em outra moeda.",
      medida: "Índice do dólar do Fed contra as economias avançadas, na média da semana; a variação em 13 semanas como contexto. O mesmo cálculo do fator do petróleo.",
      comparacao: "A média das 52 semanas anteriores (o normal recente do dólar).",
      leitura: "Dólar acima do normal além de uma faixa (padrão: 2%) pressiona o ouro para baixo; abaixo, favorece (pressão de alta). Intensidade forte a partir de 5%. Tendência: se o desvio mudou 1,5 p.p. ou mais em 4 semanas, o dólar está se fortalecendo ou se enfraquecendo. Os mesmos parâmetros do petróleo (a medida é a mesma), ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "O índice do Fed das economias avançadas serve no lugar do DXY, como no petróleo? A proposta da camada A ao Comitê (§5b do status) usava o índice amplo (26 moedas), também coletado."
    ],
    decisoes: [
      `Só como informação, sem peso (Alto no FEL 1): o sinal positivo em 7 dias é pequeno (+0,06) e, entre os 28 testes do IC (7 fatores e 4 horizontes), cerca de 3 passariam a 90% só por acaso; nos outros horizontes, o IC é indistinguível de zero. O fator vai à IA sem pressão e fora dos fatores a favor e contra; o npm run ic:ouro acompanha. Decidido por ${DECISAO_IC}.`
    ]
  },
  {
    codigo: "OURO_INFLACAO",
    nome: "Inflação dos EUA (CPI) contra a meta do Fed",
    fel1: {
      tipo: "Macroeconômico",
      direcao: "Inflação alta favorece ouro como proteção",
      mecanismo: "Ouro é reserva de valor contra erosão do poder de compra",
      fonte: "Fed, IMF"
    },
    dados: {
      observaveis: ["CPI_EUA", "TREASURY_10A"],
      eventos: false,
      avaliacao: {
        suficiente: false,
        texto:
          "O dado basta para medir a inflação (o CPI cheio sem ajuste sazonal não é revisado; o núcleo e a inflação implícita de 10 anos também são coletados), mas a relação que o FEL 1 descreve NÃO aparece no histórico do FinMind (2006 a 2026, contra a LBMA, com a data da 1ª divulgação): a inflação anual tem -0,04 com o ouro 26 semanas depois; em 2023 a 2026, -0,38 (a inflação alta trouxe o Fed e o juro real para cima, o que pesa no ouro). Nem no histórico longo (1970 a 2026, com os anos 1970): +0,06 com o ouro 26 semanas depois (-0,15 em 1970 a 1980; -0,19 em 1981 a 2000), e com a inflação acima de 8% o ouro subiu em 45% dos casos, menos que nos meses comuns (61%). A inflação implícita de mercado (a expectativa) e a aceleração do CPI também não: trocam de sinal entre os períodos. O efeito da inflação no ouro parece passar pelo juro real, que já é fator próprio (-0,52). Medidas fora da base (o PCE, a inflação esperada de 5 anos daqui a 5 anos, as pesquisas de expectativa) exigiriam fonte nova."
      },
      lacunas: [
        "A meta do Fed é do PCE (não coletado); a proposta compara o CPI com 2%, e o CPI costuma ficar um pouco acima do PCE.",
        "Mensal, com ~2 semanas de atraso (o BLS divulga o mês por volta do dia 10 a 15 do seguinte)."
      ]
    },
    proposta: {
      objetivo: "Medir se a inflação dos EUA está acima ou abaixo do que o Fed persegue.",
      medida: "Inflação anual do CPI cheio dos EUA (sem ajuste sazonal, contra o mesmo mês do ano anterior); a do núcleo como contexto.",
      comparacao: "A meta de 2% do Fed: a distância, em p.p.",
      leitura: "Informação, sem peso, desde a v4 (ADR 0150, adendo); antes, contexto do juro real (decisão do David), que também virou informação. Na análise, a inflação não tem pressão própria e não conta a favor nem contra; ela ajuda a explicar o movimento do juro real, por onde o efeito dela passa. A simulação da camada C continua na tela (acima da meta além de 0,75 p.p. = alta; forte a partir de 2 p.p.; tendência com 0,5 p.p. em 3 meses), só como referência para o Comitê; a tendência (acelerando ou desacelerando) vai ao prompt."
    },
    // Só informação, sem peso (ADR 0150, adendo): era contexto do juro real, que também virou informação.
    informativo: true,
    papelDecididoPor: "do usuário",
    ajustesFel1: [semPeso("Alto")],
    decisoes: [
      `Só como informação, sem peso (Alto no FEL 1): o IC é zero nos quatro horizontes (+0,06, +0,02, +0,01 e −0,04 em 1, 5, 21 e 62 pregões, 2006 a 2026), e o peso Alto de um fator sem voto confundia a leitura (item E3 da análise). Deixa de ser contexto do juro real, que também virou informação; continua no prompt, com a tendência, para explicar o juro real. A surpresa do CPI contra o consenso, a alternativa do item E3, depende de um consenso pago e não é viável. Decidido por ${DECISAO_IC}.`,
      `A inflação deixa de ser fator próprio e vira contexto do juro real (OURO_JUROS_REAIS), porque a relação do FEL 1 não aparece no histórico e o efeito dela passa pelo juro real. ${DECISAO_DAVID}. Substituída pela decisão acima em 2026-11-04.`
    ],
    perguntas: [
      "A medida é a inflação realizada (CPI, a proposta) ou a esperada (a inflação implícita de 10 anos, também coletada)?",
      "Comparar com a meta de 2% do Fed serve, sendo a meta do PCE e não do CPI?"
    ]
  },
  {
    codigo: "OURO_GEOPOLITICA",
    fel1: {
      tipo: "Geopolítico",
      direcao: "Crises elevam ouro (flight to safety)",
      mecanismo: "Busca por ativo seguro em momentos de tensão",
      fonte: "World Gold Council"
    },
    evento: { janelaDias: 7 },
    // Peso Baixo e só o IMEDIATO (ADR 0154): no histórico do GPR, o efeito das crises no ouro é pequeno e dura 1 pregão.
    ajustesFel1: [
      {
        campo: "Peso",
        noFel1: "Alto",
        ajuste: "Baixo",
        noPrompt: "pelo usuário",
        origem: "O usuário (Welerson), em 2026-11-04, com o mesmo poder de decisão do David, pela análise do ouro de 2026-11-01, item E4 (ADR 0154)."
      }
    ],
    soNosHorizontes: {
      horizontes: ["IMEDIATO"],
      motivo:
        "No histórico do índice de risco geopolítico (GPR, 1986 a 2026), o ouro subiu um pouco mais no pregão seguinte a um pico de risco só de 2006 em diante, e em 5 e 21 pregões não houve diferença; nos maiores episódios, o ouro costumou devolver o ganho em semanas"
    },
    dados: {
      observaveis: [],
      eventos: true,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente como fator de evento: a leitura diária por IA (desde 2026-10-02) cobre o ouro e o petróleo na mesma chamada, em fontes autorizadas, e só aceita o evento sustentado por uma página que a pesquisa leu. Não é série: não é reproduzível nem serve para backtest (ADRs 0047 e 0049); o histórico das leituras é guardado para calibrar a régua depois. A premissa do FEL 1 (crises elevam o ouro), testada com o índice de risco geopolítico (GPR, Caldara e Iacoviello, diário) contra a LBMA, de 1986 a 2026 (ADR 0154): no dia do pico, o ouro não reage (−0,02% em média); no pregão seguinte, de 2006 em diante, sobe em 66% dos 116 episódios, contra 52% em todos os dias, com +0,21% em média (de 1986 a 2005, 48%); em 5 e 21 pregões, nenhuma diferença (p de 0,19 a 0,95), e nos atos extremos o ouro tende a cair em 21 pregões (−0,26% contra +0,62%). Nos maiores episódios, o ganho volta: Golfo (jan/1991) −7,4% em 21 pregões; Iraque (fev/2003) −6,1%; mar/2026 −13,3%."
      },
      lacunas: [
        "A régua dos níveis da leitura diária (o que é \"fora do normal\") é provisória (ADRs 0047 e 0049).",
        "A leitura registra o fato novo das últimas 24 a 48 horas: uma crise crônica só volta a aparecer quando algo muda. A janela de 7 dias guarda os fatos recentes, não o que é crônico.",
        "O \"risco sistêmico\" do FEL 1 (uma crise bancária, por exemplo) entra só quando a IA o classifica como evento: a leitura diária foi desenhada para geopolítica e política de oferta."
      ]
    },
    proposta: {
      objetivo: "Levar à análise as crises que levam à busca pelo ouro como ativo seguro, com os fatos recentes que seguem pesando.",
      medida: "Fator de evento, sem cálculo: os eventos aceitos da leitura diária marcados com este fator nos últimos 7 dias, cada um com a data da leitura que o registrou e a idade, o tipo, o resumo, o canal, a pressão (leitura da IA), a intensidade, a confiança e a página da fonte autorizada, mais o nível e o resumo do ouro na leitura mais recente. O mesmo tratamento da geopolítica do petróleo.",
      comparacao: "Sem comparação numérica: a idade de cada evento e o nível da leitura mais recente (NORMAL a EXCEPCIONAL, escala provisória).",
      leitura: "Fica com a IA do ativo, com os outros fatores: crise que aumenta a incerteza favorece o ouro (a direção indicada pelo especialista)."
    },
    decisoes: [
      `Peso Baixo (Alto no FEL 1) e voto só no IMEDIATO: o único efeito das crises no ouro, no histórico do GPR, é de 1 pregão, pequeno e só de 2006 em diante; nos outros horizontes, os eventos vão como pouco relevantes. A leitura de eventos da IA é validada à parte, num teste pré-registrado (npm run validacao:geopolitica-ouro, com 20 episódios). Intensidade e confiança como multiplicadores numéricos não são adotados (seria agregação em código, ADR 0152). Decidido pelo usuário, em 2026-11-04, com o mesmo poder de decisão do David (ADR 0154).`,
      `A janela é de 7 dias, como na geopolítica do petróleo: eventos em dias seguidos costumam ser desdobramentos do mesmo fato, não acúmulo independente. Welerson, 2026-10-04, o mesmo ajuste do petróleo (ADRs 0050 e 0054).`
    ],
    perguntas: [
      "O risco sistêmico (crise bancária, de dívida) deve ser um tipo de evento próprio na leitura diária (exige mudar o prompt)?"
    ]
  },
  {
    codigo: "OURO_BANCOS_CENTRAIS",
    nome: "Compras dos bancos centrais (World Gold Council, com as declaradas ao FMI)",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com compras de bancos centrais",
      mecanismo: "Bancos centrais diversificam reservas em ouro",
      fonte: "World Gold Council, IMF, BCB"
    },
    // Só o MEDIO e o LONGO (ADR 0150, adendo): o IC só tem sinal em 21 e 62 pregões.
    soNosHorizontes: {
      horizontes: ["MEDIO", "LONGO"],
      motivo:
        "O dado é trimestral e sai cerca de um mês depois do fim do trimestre: no histórico, as compras antecipam o ouro em 30 e 90 dias, não em 1 e 7"
    },
    dados: {
      observaveis: ["OURO_OFERTA_DEMANDA_WGC", "OURO_BANCOS_CENTRAIS_FMI"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente, com ressalvas: o World Gold Council dá a demanda dos bancos centrais por trimestre, desde 2010, com a estimativa das compras NÃO declaradas (~2/3 do total recente); o FMI dá só o declarado, por mês e por país. No histórico do FinMind (contra a LBMA), as compras declaradas ao FMI não antecipam o ouro (-0,14 com o ouro 26 semanas depois, 2006 a 2026), mas as do WGC, sim: as compras de 4 trimestres contra a média dos 3 anos anteriores têm +0,26 com o ouro 26 semanas depois e +0,47 com 52 (2013 a 2026), nas duas metades do período (+0,31 e +0,52 até 2019; +0,20 e +0,42 de 2020 em diante). Com as compras mais de 325 t acima do normal, o ouro subiu em 5 de 6 casos 26 semanas depois. Ressalvas: só 51 trimestres; parte da relação é a alta de 2022 a 2025, quando compras recordes e ouro subiram juntos; o WGC revisa a estimativa e é de uso interno. O IC por horizonte (ADR 0150), de 2013 a 2026 contra a LBMA: −0,03 em 1 pregão, +0,07 em 5, +0,23 em 21 e +0,45 em 62, os dois últimos com o intervalo de 90% excluindo o zero (+0,02 a +0,40 e +0,21 a +0,55); o único fator do ouro com sinal."
      },
      lacunas: [
        "A estimativa das não declaradas é do World Gold Council (dados da Metals Focus), revisada depois; o dado é de uso interno (ADR 0037).",
        "Trimestral, ~1 mês depois do fim do trimestre. As declaradas ao FMI (contexto) são mensais, mas cada país reporta no seu ritmo, até ~2 meses depois; o mês só entra com 90% dos países dos 12 meses anteriores.",
        "No FMI, alguns países reportam o volume em unidade errada (Brasil e Angola 1.000× maior, Chile em quilos, Cazaquistão com zero) e três sem o valor que permitiria conferir: ficam de fora do contexto.",
        "O WGC e o FMI não informam quando publicaram: a disponibilidade é a da 1ª coleta (2026-10-01), e uma simulação numa data anterior fica sem dado.",
        "O BCB, que o FEL 1 cita, publica as reservas totais do Brasil, não o ouro (o ouro do Brasil vem do FMI)."
      ]
    },
    proposta: {
      objetivo: "Medir se os bancos centrais estão comprando ouro acima ou abaixo do ritmo recente.",
      medida: "As compras dos bancos centrais nos últimos 4 trimestres somados, em toneladas, do World Gold Council (com a estimativa das não declaradas); as compras declaradas ao FMI em 12 meses, país a país, como contexto (mais rápidas e com quem comprou).",
      comparacao: "A média das compras de 4 trimestres nos 3 anos anteriores (12 trimestres): o desvio, em toneladas.",
      leitura: "Compras acima do ritmo dos 3 anos anteriores além de uma faixa (padrão: 100 t) favorecem o ouro (pressão de alta); abaixo dele, pressionam. Intensidade forte a partir de 300 t. Tendência: se o desvio mudou 100 t ou mais em 2 trimestres, as compras estão acelerando ou desacelerando. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    decisoes: [
      `Voto só no MEDIO e no LONGO, com o peso Alto: o IC tem sinal em 21 e 62 pregões (+0,23 e +0,45) e é indistinguível de zero em 1 e 5 (−0,03 e +0,07); um dado trimestral, publicado um mês depois do fim do trimestre, não informa 1 a 7 dias. Com as ressalvas de 51 trimestres e do ciclo de 2022 a 2025, fica no acompanhamento do npm run ic:ouro. Decidido por ${DECISAO_IC}.`,
      `A medida é a estimativa do World Gold Council, com as não declaradas (a única com relação para frente no histórico); o declarado ao FMI fica como contexto. ${DECISAO_DAVID}.`,
      `O fator compara as compras com o ritmo dos 3 anos anteriores, não com zero. O prompt diz as duas coisas: compras historicamente altas abaixo do ritmo recorde são desaceleração, não venda. ${DECISAO_DAVID}.`
    ],
    perguntas: []
  },
  {
    codigo: "OURO_ETFS",
    nome: "Fluxo dos ETFs de ouro (World Gold Council)",
    fel1: {
      tipo: "Fundamentalista/Fluxo",
      direcao: "Alta com entradas em ETFs; baixa com saídas",
      mecanismo: "ETFs são canal de investimento e influenciam demanda",
      fonte: "World Gold Council"
    },
    // Só informação, sem peso (ADR 0150, adendo): o IC é zero nos quatro horizontes; o fluxo segue o preço.
    informativo: true,
    papelDecididoPor: "do usuário",
    ajustesFel1: [semPeso("Médio")],
    dados: {
      observaveis: ["OURO_ETFS_WGC"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o ouro guardado pelos ETFs de cada região, por semana, desde 2004 (World Gold Council, uso interno). No histórico do FinMind (2007 a 2026, contra a LBMA), o fluxo em 13 semanas anda com o ouro (+0,48 com a variação do ouro nas 26 semanas anteriores; +0,77 em 2015 a 2022): os investidores entram com a alta e saem com a queda, o canal que o FEL 1 descreve. Não antecipa de forma estável: +0,09 com o ouro 26 semanas depois (+0,31 em 2006 a 2014, -0,20 em 2015 a 2022). Com entradas fortes (acima de 11% em 13 semanas), o ouro subiu em 82% dos casos 26 semanas depois. O IC por horizonte (ADR 0150), de 2007 a 2026 contra a LBMA: −0,01, −0,00, +0,03 e +0,02 em 1, 5, 21 e 62 pregões, sem horizonte em que o fluxo antecipe o preço (item M5 da análise)."
      },
      lacunas: [
        "Dado de uso interno: os termos do World Gold Council permitem só uso pessoal e não comercial (ADR 0037).",
        "A fonte é a API interna dos gráficos do Goldhub, sem contrato: pode mudar ou fechar sem aviso.",
        "O WGC não informa quando publicou: a disponibilidade é a da 1ª coleta (2026-10-01), e uma simulação numa data anterior fica sem dado."
      ]
    },
    proposta: {
      objetivo: "Medir se os investidores estão entrando ou saindo do ouro pelos ETFs.",
      medida: "O ouro guardado pelos ETFs das quatro regiões, somado, em toneladas, por semana; o fluxo em 13 semanas em toneladas.",
      comparacao: "O que os ETFs tinham 13 semanas antes: o fluxo em %.",
      leitura: "Entradas além de uma faixa (padrão: 3% em 13 semanas) favorecem o ouro (pressão de alta); saídas, pressionam. Intensidade forte a partir de 8%. Tendência: se o fluxo mudou 2 p.p. ou mais em 4 semanas, as entradas ou as saídas estão ganhando força. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "A janela de 13 semanas para o fluxo serve, ou o especialista olha outra (semanal, mensal)?"
    ],
    decisoes: [
      `Só como informação, sem peso (Médio no FEL 1): o IC é indistinguível de zero nos quatro horizontes; o fluxo acompanha o preço (+0,48 no mesmo período), e não há horizonte em que ele o antecipe. O fator vai à IA sem pressão e fora dos fatores a favor e contra. Decidido por ${DECISAO_IC}.`
    ]
  },
  {
    codigo: "OURO_FUNDOS",
    nome: "Posicionamento dos fundos no ouro (COT)",
    fel1: {
      tipo: "Técnico/Fluxo",
      direcao: "Amplifica movimentos em ambos os sentidos",
      mecanismo: "Posições especulativas amplificam tendências",
      fonte: "CFTC"
    },
    // Só informação, sem peso, lido como risco de posição concentrada, sem sentido (ADR 0150, adendo; como o café, ADR 0141).
    informativo: true,
    papelDecididoPor: "do usuário",
    ajustesFel1: [semPeso("Médio")],
    dados: {
      observaveis: ["COT_OURO"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: a posição dos fundos (managed money) no ouro da COMEX, por semana, desde 2006 (CFTC). No histórico do FinMind (2009 a 2026, contra a LBMA), a posição segue o preço (+0,49 com a variação do ouro nas 26 semanas anteriores) e, nos extremos, a leitura do FEL 1 (\"amplifica\") se sustenta melhor que a de reversão usada no petróleo: com os fundos entre os 10% mais comprados dos 3 anos, o ouro subiu em 76% dos casos 26 semanas depois (média +8,9%), contra 63% fora dos extremos; entre os 10% mais vendidos, em 68% (média +4,0%). A relação muda de regime: +0,41 com o ouro 26 semanas depois em 2009 a 2014, -0,26 em 2015 a 2022 (reversão) e +0,32 em 2023 a 2026. O IC por horizonte (ADR 0150), de 2009 a 2026 contra a LBMA: +0,01, +0,00, +0,04 e +0,09 em 1, 5, 21 e 62 pregões, todos com o intervalo de 90% incluindo o zero."
      },
      lacunas: [
        "Posição de terça, divulgada na sexta seguinte (às vezes depois, com feriado ou shutdown).",
        "Só futuros e só os fundos (managed money); as opções e os outros participantes ficam de fora."
      ]
    },
    proposta: {
      objetivo: "Medir se os fundos estão muito comprados ou muito vendidos no ouro em relação aos últimos 3 anos.",
      medida: "A posição líquida dos fundos (comprados menos vendidos) em % dos contratos em aberto. O mesmo cálculo do fator do petróleo.",
      comparacao: "O percentil da posição entre as das 156 semanas anteriores, menos 50: a posição relativa, de -50 a +50.",
      leitura: "Desde a v4 (ADR 0150, adendo), a leitura é de risco, sem sentido: muitos fundos de um lado só aumentam o risco de um movimento forte quando a posição for desmontada, sem dizer para que lado o preço vai (como no café, ADR 0141). Texto anterior: pela direção do FEL 1 (amplifica), ao contrário do petróleo: fundos muito comprados além de uma faixa (padrão: 30 pontos, acima do percentil 80) favorecem o ouro (pressão de alta); muito vendidos, pressionam. Intensidade forte a partir de 40 pontos (acima do percentil 90). Tendência: se a posição relativa mudou 15 pontos ou mais em 4 semanas, os fundos estão comprando ou vendendo. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    decisoes: [
      `Só como informação, sem peso (Médio no FEL 1), lido como risco de posição concentrada, sem sentido: o IC é indistinguível de zero nos quatro horizontes, e a relação muda de regime (amplifica em 2009 a 2014 e em 2023 a 2026, reverte em 2015 a 2022; item M6 da análise). O fator vai à IA sem pressão e fora dos fatores a favor e contra; o papel do COT na leitura continua em posicionamentoCot. Decidido por ${DECISAO_IC}.`,
      `A leitura é a do FEL 1 (amplifica: fundos comprados = alta), a que o histórico favorece. ${DECISAO_DAVID}. Substituída pela decisão acima em 2026-11-04.`,
      `O COT qualifica a leitura dos outros fatores (confirma, excesso, risco de reversão, enfraquece), como no petróleo: não é um voto de alta ou de baixa. ${DECISAO_DAVID}.`
    ],
    perguntas: []
  },
  {
    codigo: "OURO_MINERACAO",
    nome: "Produção das minas (World Gold Council)",
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Impacto limitado; oferta é relativamente inelástica",
      mecanismo: "Produção mineral tem resposta lenta a preço",
      fonte: "USGS"
    },
    dados: {
      observaveis: ["OURO_OFERTA_DEMANDA_WGC"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para o peso Baixo: a produção das minas por trimestre, desde 2010 (World Gold Council, com dados da Metals Focus; uso interno), no lugar do USGS que o FEL 1 cita (anual, com mais atraso). No histórico do FinMind (2011 a 2026, 59 trimestres, contra a LBMA), a produção varia pouco (|crescimento anual| até ~4% em 80% dos trimestres) e a relação com o preço é fraca: -0,25 com o ouro 26 semanas depois. Confirma o \"impacto limitado\" do FEL 1."
      },
      lacunas: [
        "O USGS, citado no FEL 1, não é coletado; o World Gold Council (trimestral) o substitui.",
        "Dado de uso interno: os termos do World Gold Council permitem só uso pessoal e não comercial (ADR 0037).",
        "Trimestral, ~1 mês depois do fim do trimestre; a disponibilidade é a da 1ª coleta (2026-10-01), e uma simulação numa data anterior fica sem dado.",
        "A reciclagem (a outra parte da oferta, ~1/4 do total) não entra no fator."
      ]
    },
    proposta: {
      objetivo: "Medir se a oferta de ouro novo das minas está crescendo ou encolhendo.",
      medida: "A produção das minas nos últimos 4 trimestres somados, em toneladas (tira a sazonalidade).",
      comparacao: "Os mesmos 4 trimestres um ano antes: o crescimento anual, em %.",
      leitura: "Produção crescendo além de uma faixa (padrão: 2,5% no ano) pressiona o ouro para baixo (mais oferta); encolhendo, favorece. Intensidade forte a partir de 4%. Tendência: se o crescimento mudou 1,5 p.p. ou mais em 2 trimestres, a produção está acelerando ou desacelerando. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "Com o impacto limitado que o FEL 1 descreve e o histórico confirma, o fator vale a pena, ou sai da análise?",
      "A oferta inclui a reciclagem (que responde ao preço mais rápido que as minas)?"
    ]
  }
];

// A expectativa de juros (ADR 0155): decidida pelo usuário depois do motor validado pelo Comitê.
DEFINICOES.push({
  codigo: "OURO_EXPECTATIVA_JUROS",
  fel1: {
    tipo: "Macroeconômico (fora do FEL 1)",
    direcao: "Expectativa de juros do Fed subindo pressiona o ouro; caindo, favorece",
    mecanismo: "O ouro reage ao que o mercado espera do Fed, não à taxa já decidida: o Treasury de 2 anos antecipa o ciclo",
    fonte: "Tesouro dos EUA e Fed, pelo FRED (DGS2, DFEDTARU)"
  },
  validacao: { por: "o usuário (Welerson), com o mesmo poder de decisão do David", data: "2026-11-04", adr: "ADR 0155" },
  soNosHorizontes: {
    horizontes: ["MEDIO", "LONGO"],
    motivo:
      "No histórico (2006 a 2026), a variação de 13 semanas do Treasury de 2 anos antecipou o ouro em 30 e 90 dias, não em 1 e 7"
  },
  dados: {
    observaveis: ["TREASURY_2A", "META_FED"],
    eventos: false,
    avaliacao: {
      suficiente: true,
      texto:
        "Suficiente: o Treasury de 2 anos (FRED, diário desde 1976, já coletado na fase do dólar, ADR 0119) é o prazo da curva que mais reage à expectativa para o Fed, no lugar das probabilidades do CME FedWatch (pagas). O IC da variação de 13 semanas contra o ouro da LBMA (ADR 0155), de 2006 a 2026: +0,03 em 1 pregão, +0,06 em 5, +0,12 em 21 e +0,17 em 62, os três últimos com o intervalo de 90% excluindo o zero, positivo nas duas metades (+0,11 e +0,13 em 21) e em 48 de 79 janelas de 12 meses. Fora da amostra, de 1977 a 2005: +0,00, −0,01, +0,04 e +0,05, o mesmo lado e cerca de um terço do tamanho, sem significância. A relação é do regime pós-2006, em que o Fed domina o ouro. As outras versões testadas (1 e 4 semanas, a distância até a meta do Fed) não têm a mesma consistência."
    },
    lacunas: ["O CME FedWatch (as probabilidades por reunião, que o documento pede) é pago e não é coletado.", "O FRED publica o valor de sexta na segunda: a semana mais recente pode ficar incompleta."]
  },
  proposta: {
    autoria: "FinMind, pela análise do ouro de 2026-11-01 (item M1), decidida pelo usuário",
    objetivo: "Medir se o mercado passou a esperar juros mais altos ou mais baixos do Fed.",
    medida: "O Treasury de 2 anos, na média da semana; a meta do Fed e o ciclo dela em 52 semanas como contexto.",
    comparacao: "O mesmo Treasury 13 semanas antes: a variação, em p.p.",
    leitura:
      "O 2 anos subindo além de uma faixa (padrão: 0,15 p.p. em 13 semanas) pressiona o ouro para baixo; caindo, favorece (pressão de alta). Intensidade forte a partir de 0,5 p.p. Tendência: se a variação mudou 0,15 p.p. ou mais em 4 semanas, a expectativa de aperto ou de cortes está ganhando força. Os limites são os percentis 40 e 80 de 2006 a 2026, arredondados; parâmetros ajustáveis pelo Comitê no card C. Decidir."
  },
  perguntas: [],
  decisoes: [
    `Fator novo, fora do FEL 1, com peso Baixo e voto só no MEDIO e no LONGO: o único candidato com sinal na análise do ouro (o IC de +0,12 e +0,17 em 30 e 90 dias, de 2006 a 2026); o peso Baixo pela fraqueza fora da amostra (1977 a 2005). O CME FedWatch não entra (pago). O npm run ic:ouro acompanha o sinal; se ele sumir, o fator volta a ser informação. Decidido pelo usuário, em 2026-11-04, com o mesmo poder de decisão do David (ADR 0155).`
  ]
});

const FATORES_OURO = montarFatores("OURO", DEFINICOES, VALIDACAO_MOTORES);

// O que vale para o ativo, não para um fator (metodologia-base.js): o preço de referência e a leitura da IA. As
// perguntas vêm das respostas do David ao FEL 1 (ADR 0055) e da conversa marcada com ele
// (docs/conversa-david-respostas-fel1.md, pontos 1 a 4).
const DO_ATIVO = {
  decisoes: [
    `Preço de referência: o futuro GLD da B3, o vencimento mais próximo negociado, sem emendar contratos. A LBMA fica como histórico (até 2026-09-30), e é contra ela que os fatores foram validados. ${DECISAO_DAVID}.`,
    `Leitura diária de tendência da IA no Centro de Decisão, no molde do petróleo: quatro horizontes (1, 7, 30 e 90 dias), cada um com uma faixa de variação calibrada no histórico do ouro (provisória). Leitura, não recomendação. ${DECISAO_DAVID}.`
  ],
  perguntas: [
    "Instrumento operado: o ouro operado na Pepperstone é o XAUUSD (à vista) ou um CFD sobre o futuro? E qual o horário do fechamento diário usado? Pela regra da P2 (ADR 0055), o preço de referência é o do instrumento operado; o GLD está a ~0,8% acima do à vista.",
    "Para a leitura de tendência, o GLD vale como aproximação do à vista? Se valer, com uma série contínua (vencimentos emendados, ajustando a diferença na rolagem), que tira o SEM DADO do horizonte de 90 dias (ADR 0044).",
    "Para medir o resultado das operações: alguém do Comitê exporta o histórico diário do XAUUSD (Pepperstone ou TradingView) com regularidade? Não há fonte gratuita e oficial do ouro à vista desde que a LBMA fechou o feed (ADR 0044).",
    "Formato da leitura da IA: as faixas calibradas por horizonte (hoje) atendem, ou a IA deve dar uma variação central em % com as 6 classes fixas do prompt do milho (de irrelevante a excepcional)? Os cenários altista, neutro e baixista, sem probabilidade, podem entrar.",
    "Peso e agregação: o mapa sazonal de pesos e as regras de agregação propostas para o milho (blocos com teto de peso, fundos como multiplicador, conflito entre blocos reduz a confiança) valem também para o ouro? Hoje o peso é o do FEL 1, e a IA explica as forças, sem agregação.",
    "Validação dos eventos: os eventos da geopolítica vão ao prompt sem validação humana, cada um com o link da fonte. A validação humana antes do prompt, pedida no fator 8 do milho, vale também aqui?"
  ]
};

function obterMetodologiaOuro() {
  return montarMetodologia({ ativo: "OURO", nome: "Ouro", versao: VERSAO, dataVersao: DATA_VERSAO, doAtivo: DO_ATIVO, fatores: FATORES_OURO });
}

module.exports = { SITUACAO, FATORES_OURO, obterMetodologiaOuro };
