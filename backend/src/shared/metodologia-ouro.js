"use strict";

const { SITUACAO, montarFatores, montarMetodologia } = require("./metodologia-base");

// Metodologia dos 8 fatores do ouro: só as definições (o formato de cada uma está em metodologia-base.js). Uma
// PROPOSTA para o David validar, não uma regra (ADR 0053), no molde da do petróleo (ADR 0050). Fonte do FEL 1: a
// tabela "Fatores de Influência de Preço: Ouro", v1.1.
//
// A validação histórica de cada fator é contra o ouro da LBMA (PM, em US$, diário), o histórico mais longo na base; a
// LBMA saiu em 2026-10-01 (ADR 0044), então o histórico vai até 2026-09-28. O preço de referência do dia a dia é uma
// pergunta ao David.
//
// Os fatores ainda não vão ao prompt diário nem ao Centro de Decisão: isso vem depois da aprovação do David, como no
// petróleo (ADR 0052). Nada daqui gera sinal de compra ou venda.

const VERSAO = 1;
const DATA_VERSAO = "2026-10-03";

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
    dados: {
      observaveis: ["TREASURY_10A", "META_FED"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o juro real de 10 anos (TIPS, no FRED desde 2003) é a medida de mercado do custo de oportunidade que o especialista descreve. No histórico do FinMind (2006 a 2026, contra o ouro da LBMA), a variação do juro real em 26 semanas anda com o ouro em sentido contrário: -0,52 com a variação do ouro nas mesmas 26 semanas, e -0,64 em 2023 a 2026, os anos do \"descolamento\" que o FEL 1 cita (que é do NÍVEL do juro real, não da variação). Mas ela não antecipa o preço: +0,12 com o ouro 26 semanas depois. O nível tem correlação POSITIVA com o ouro seguinte (+0,51), o contrário da direção do FEL 1, por efeito das tendências longas: por isso a proposta usa a variação."
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
    perguntas: [
      "A leitura é pela variação do juro real (a proposta, que anda com o ouro) ou pelo nível (o que o FEL 1 descreve, que no histórico não mostrou a relação esperada)?",
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
    dados: {
      observaveis: ["DOLAR_AMPLO_FED", "CAMBIO_DXY_FED"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o mesmo índice do Fed contra as economias avançadas usado no petróleo, o mais próximo do DXY que o especialista cita. No histórico do FinMind (2006 a 2026, contra a LBMA), o desvio do dólar contra a média das 52 semanas anteriores tem -0,50 com a variação do ouro nas 26 semanas anteriores, nos três períodos (2006 a 2014, 2015 a 2022 e 2023 a 2026): a \"correlação inversa clássica\" do FEL 1. Mas não antecipa o preço: -0,04 com o ouro 26 semanas depois."
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
      "O índice do Fed das economias avançadas serve no lugar do DXY, como no petróleo? A proposta da camada A ao Comitê (§5b do status) usava o índice amplo (26 moedas), também coletado.",
      "Com o dólar andando junto com o ouro, mas sem antecipá-lo, ele é um fator próprio (peso Alto, como no FEL 1) ou um filtro que confirma os outros?"
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
      leitura: "Inflação acima da meta além de uma faixa (padrão: 0,75 p.p.) favorece o ouro (pressão de alta, como o FEL 1 diz); abaixo, pressiona. Intensidade forte a partir de 2 p.p. Tendência: se a distância mudou 0,5 p.p. ou mais em 3 meses, a inflação está acelerando ou desacelerando. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "Com a relação ausente no histórico (desde 1970, e negativa em 2023-2026, pelo juro real), a inflação continua um fator próprio de peso Alto, ou o efeito dela já está no juro real e ela vira contexto do fator de juros reais?",
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
    evento: { janelaDias: 30 },
    dados: {
      observaveis: [],
      eventos: true,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente como fator de evento: a leitura diária por IA (desde 2026-10-02) cobre o ouro e o petróleo na mesma chamada, em fontes autorizadas, e só aceita o evento sustentado por uma página que a pesquisa leu. Não é série: não é reproduzível nem serve para backtest (ADRs 0047 e 0049); o histórico das leituras é guardado para calibrar a régua depois."
      },
      lacunas: [
        "A régua dos níveis da leitura diária (o que é \"fora do normal\") é provisória (ADRs 0047 e 0049).",
        "A leitura registra o fato novo das últimas 24 a 48 horas: uma crise crônica só volta a aparecer quando algo muda. A janela de 30 dias guarda os fatos recentes, não o que é crônico.",
        "O \"risco sistêmico\" do FEL 1 (uma crise bancária, por exemplo) entra só quando a IA o classifica como evento: a leitura diária foi desenhada para geopolítica e política de oferta."
      ]
    },
    proposta: {
      objetivo: "Levar à análise as crises que levam à busca pelo ouro como ativo seguro, com os fatos recentes que seguem pesando.",
      medida: "Fator de evento, sem cálculo: os eventos aceitos da leitura diária marcados com este fator nos últimos 30 dias, cada um com a data da leitura que o registrou e a idade, o tipo, o resumo, o canal, a pressão (leitura da IA), a intensidade, a confiança e a página da fonte autorizada, mais o nível e o resumo do ouro na leitura mais recente. O mesmo tratamento da geopolítica do petróleo.",
      comparacao: "Sem comparação numérica: a idade de cada evento e o nível da leitura mais recente (NORMAL a EXCEPCIONAL, escala provisória).",
      leitura: "Fica com a IA do ativo, com os outros fatores: crise que aumenta a incerteza favorece o ouro (a direção indicada pelo especialista)."
    },
    perguntas: [
      "A janela de 30 dias basta, como no petróleo?",
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
    dados: {
      observaveis: ["OURO_OFERTA_DEMANDA_WGC", "OURO_BANCOS_CENTRAIS_FMI"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente, com ressalvas: o World Gold Council dá a demanda dos bancos centrais por trimestre, desde 2010, com a estimativa das compras NÃO declaradas (~2/3 do total recente); o FMI dá só o declarado, por mês e por país. No histórico do FinMind (contra a LBMA), as compras declaradas ao FMI não antecipam o ouro (-0,14 com o ouro 26 semanas depois, 2006 a 2026), mas as do WGC, sim: as compras de 4 trimestres contra a média dos 3 anos anteriores têm +0,26 com o ouro 26 semanas depois e +0,47 com 52 (2013 a 2026), nas duas metades do período (+0,31 e +0,52 até 2019; +0,20 e +0,42 de 2020 em diante). Com as compras mais de 325 t acima do normal, o ouro subiu em 5 de 6 casos 26 semanas depois. Ressalvas: só 51 trimestres; parte da relação é a alta de 2022 a 2025, quando compras recordes e ouro subiram juntos; o WGC revisa a estimativa e é de uso interno."
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
    perguntas: [
      "A medida é a estimativa do World Gold Council, com as não declaradas (a proposta, a única com relação para frente no histórico), ou só o declarado ao FMI (oficial, mensal, mas sem relação com o preço)?",
      "O fator compara as compras com o ritmo dos 3 anos anteriores (a proposta: com as compras altas desde 2022, comprar 800 t por ano hoje lê como pressão de baixa) ou com zero (comprando ou vendendo)?"
    ]
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
    dados: {
      observaveis: ["OURO_ETFS_WGC"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o ouro guardado pelos ETFs de cada região, por semana, desde 2004 (World Gold Council, uso interno). No histórico do FinMind (2007 a 2026, contra a LBMA), o fluxo em 13 semanas anda com o ouro (+0,48 com a variação do ouro nas 26 semanas anteriores; +0,77 em 2015 a 2022): os investidores entram com a alta e saem com a queda, o canal que o FEL 1 descreve. Não antecipa de forma estável: +0,09 com o ouro 26 semanas depois (+0,31 em 2006 a 2014, -0,20 em 2015 a 2022). Com entradas fortes (acima de 11% em 13 semanas), o ouro subiu em 82% dos casos 26 semanas depois."
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
      "A janela de 13 semanas para o fluxo serve, ou o especialista olha outra (semanal, mensal)?",
      "Com o fluxo seguindo o preço, ele confirma a leitura (como o COT) ou é um fator próprio?"
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
    dados: {
      observaveis: ["COT_OURO"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: a posição dos fundos (managed money) no ouro da COMEX, por semana, desde 2006 (CFTC). No histórico do FinMind (2009 a 2026, contra a LBMA), a posição segue o preço (+0,49 com a variação do ouro nas 26 semanas anteriores) e, nos extremos, a leitura do FEL 1 (\"amplifica\") se sustenta melhor que a de reversão usada no petróleo: com os fundos entre os 10% mais comprados dos 3 anos, o ouro subiu em 76% dos casos 26 semanas depois (média +8,9%), contra 63% fora dos extremos; entre os 10% mais vendidos, em 68% (média +4,0%). A relação muda de regime: +0,41 com o ouro 26 semanas depois em 2009 a 2014, -0,26 em 2015 a 2022 (reversão) e +0,32 em 2023 a 2026."
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
      leitura: "Pela direção do FEL 1 (amplifica), ao contrário do petróleo: fundos muito comprados além de uma faixa (padrão: 30 pontos, acima do percentil 80) favorecem o ouro (pressão de alta); muito vendidos, pressionam. Intensidade forte a partir de 40 pontos (acima do percentil 90). Tendência: se a posição relativa mudou 15 pontos ou mais em 4 semanas, os fundos estão comprando ou vendendo. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "A leitura no ouro é a do FEL 1 (amplifica: fundos comprados = alta), a proposta, ou a de reversão do petróleo? O histórico favorece a primeira, mas muda de regime.",
      "O COT é um fator próprio ou só qualifica a leitura dos outros (confirma, excesso, risco de reversão), como o prompt do petróleo o trata?"
    ]
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

const FATORES_OURO = montarFatores("OURO", DEFINICOES);

function obterMetodologiaOuro() {
  return montarMetodologia({ ativo: "OURO", nome: "Ouro", versao: VERSAO, dataVersao: DATA_VERSAO, fatores: FATORES_OURO });
}

module.exports = { SITUACAO, FATORES_OURO, obterMetodologiaOuro };
