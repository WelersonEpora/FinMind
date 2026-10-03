"use strict";

const { FATORES } = require("./fatores-fel1");

// Metodologia dos 10 fatores do petróleo: uma PROPOSTA para o David validar, não uma regra (ADR 0050).
//
// Cada fator separa três origens, e a tela mostra cada uma com o seu rótulo:
//   fel1     - o que o David escreveu no FEL 1 (tabela "Fatores de Influência de Preço: Petróleo", v1.1), sem
//              reescrever: tipo, direção do impacto, mecanismo de transmissão e fonte. O nome e o peso vêm de
//              `fatores-fel1.js` (a planilha).
//   dados    - o que o FinMind já coleta para o fator (cards do catálogo de observáveis) e as lacunas conhecidas.
//              É fato, não proposta. `avaliacao` (opcional): se o dado basta para o fator, com a evidência do histórico
//              (o FEL 1 foi escrito com apoio de IA: um requisito dele pode não ser necessário).
//   proposta - um rascunho do fator nas três camadas do motor (STATUS_DO_PROJETO.md, §5): a medida (A. Medir), a
//              comparação (B. Ler) e um esboço da leitura (C. Decidir, só o Comitê), escrito para abrir caminho e ser
//              corrigido. Fica com `situacao: "PROPOSTA"` até o David validar; aí vira "VALIDADA"
//              com a data e a referência da validação (no ADR).
//   perguntas - o que o David precisa decidir para a proposta virar regra.
//   nome     - (opcional) o título do fator quando o dado usado é mais estreito que o nome da planilha (ex.: o FEL 1
//              diz "Demanda global", o cálculo usa só os EUA). O título diz exatamente o que entra no cálculo; o nome
//              do FEL 1 continua na resposta (`nomeFel1`) e no bloco do especialista na tela.
//   evento   - (opcional) { janelaDias }: FATOR DE EVENTO, sem cálculo. O resultado dele são os eventos aceitos da
//              leitura diária marcados com ele nessa janela (geopolitica.service.js::obterEventosDoFator), o bloco que
//              vai ao prompt da IA do ativo como está.
//
// Desde a aprovação do David (2026-10-03), a leitura dos fatores vai ao prompt diário e a leitura de tendência da IA
// aparece no Centro de Decisão (ADR 0052). Nada daqui gera sinal de compra ou venda.

const SITUACAO = { PROPOSTA: "PROPOSTA", VALIDADA: "VALIDADA" };

const VERSAO = 1;
const DATA_VERSAO = "2026-10-02";

const DEFINICOES = [
  {
    codigo: "PETROLEO_OPEP",
    fel1: {
      tipo: "Geopolítico/Fundamentalista",
      direcao: "Alta com cortes de produção; baixa com aumento de cotas",
      mecanismo: "OPEP+ controla parcela relevante da oferta global",
      fonte: "OPEC"
    },
    evento: { janelaDias: 45 },
    dados: {
      observaveis: ["PETROLEO_PRODUCAO_JODI"],
      eventos: true,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente como fator de evento: as decisões da OPEP+ chegam pela leitura diária de eventos de mercado (o site da OPEP é fonte autorizada). A produção, não: dos grandes da OPEP+, o JODI perdeu os Emirados e o Irã (2018), a Rússia (2023) e o Iraque (2024); hoje reportam a Arábia Saudita, o Kuwait, o Cazaquistão, a Nigéria, a Argélia, a Venezuela, a Líbia, o Azerbaijão e o México. Sem esses quatro, a soma não mede a OPEP+, e o cumprimento das cotas não é medido."
      },
      lacunas: [
        "O cumprimento das cotas (produção contra a meta de cada membro) não é medido: as cotas não são coletadas (o MOMR da OPEP não foi acessível de forma automática, ADR 0042) e a produção da Rússia, do Iraque, dos Emirados e do Irã não está no JODI.",
        "A leitura diária registra a decisão da OPEP+ só quando ela é \"extraordinária\" (o tipo Política de oferta do prompt): uma reunião que só mantém as cotas pode não virar evento.",
        "A data do evento é a da leitura que o registrou (o fato é das 24 a 48 horas anteriores); o evento não diz até quando vale: a janela de 45 dias faz esse papel."
      ]
    },
    proposta: {
      objetivo: "Levar à análise as decisões da OPEP+ que seguem valendo, e não só as do dia.",
      medida: "Fator de evento, sem cálculo: os eventos aceitos da leitura diária marcados com este fator nos últimos 45 dias, cada um com a data da leitura que o registrou e a idade, o tipo, o resumo (com a data do fato, quando a fonte a dá), o canal, a pressão (leitura da IA), a intensidade, a confiança e a página da fonte autorizada.",
      comparacao: "Sem comparação numérica: a idade de cada evento e o retrato do ativo na leitura mais recente. Os oito países dos cortes voluntários se reúnem todo mês: 45 dias pegam a última decisão com folga.",
      leitura: "Fica com a IA do ativo, com os outros fatores: corte de produção pressiona para cima, aumento de cotas para baixo (a direção indicada pelo especialista), e o que move o preço é a surpresa contra o esperado, que só aparece quando a fonte fala dela."
    },
    perguntas: [
      "A janela de 45 dias basta como memória da política em vigor, ou a leitura diária deve registrar a vigência de cada decisão (exige mudar o prompt)?",
      "O cumprimento das cotas é necessário? Sem a produção dos quatro grandes que saíram do JODI, ele só seria medido com uma fonte nova (ex.: o STEO da EIA)."
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
          "Suficiente para a situação do estoque (sobra ou aperto), que é o que pesa nos horizontes do FinMind. No histórico do FinMind, de 2010 em diante, o desvio contra a média de 5 anos anda com o preço (correlação de -0,55 com o nível do WTI: estoque abaixo do normal, preço alto). Não serve para a reação do dia da divulgação: nem a variação semanal nem a variação contra a típica da semana acompanham o WTI naquele dia (preço no sentido esperado em 55% das semanas com variação grande), porque o mercado reage à previsão dos analistas, que é paga. Também não prevê sozinho o preço das 4 semanas seguintes."
      },
      lacunas: [
        "Para a reação do dia: a previsão dos analistas para a semana (o \"esperado\" no sentido do mercado) não é coletada; é paga.",
        "O boletim do API não é coletado: mede o mesmo que a EIA, um dia antes, e é pago."
      ]
    },
    proposta: {
      objetivo: "Medir se há sobra ou falta de petróleo nos EUA.",
      medida: "Estoque de petróleo sem a reserva estratégica (SPR) e a variação contra a semana anterior.",
      comparacao: "Média da mesma semana nos 5 anos anteriores (a comparação que a própria EIA publica no relatório).",
      leitura: "Estoque abaixo da média de 5 anos indica aperto (pressão de alta); acima, sobra (pressão de baixa); dentro de uma faixa neutra (padrão: 3%), sem pressão. Intensidade forte a partir de 10% de desvio. Tendência: se o desvio mudou 2 p.p. ou mais em 4 semanas, o aperto ou a sobra está aumentando ou diminuindo. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "O \"esperado\" da definição do fator pode ser lido como o normal da época (a média de 5 anos), deixando de lado a reação do dia da divulgação?",
      "Entram Cushing, gasolina e destilados (também coletados), ou só o petróleo sem SPR?"
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
    evento: { janelaDias: 30 },
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
        "A leitura registra o fato novo das últimas 24 a 48 horas: uma situação crônica (uma guerra em curso, uma sanção antiga) só volta a aparecer quando algo muda. A janela de 30 dias guarda os fatos recentes, não o que é crônico.",
        "A data do evento é a da leitura que o registrou; o evento não diz até quando vale."
      ]
    },
    proposta: {
      objetivo: "Levar à análise o risco de interrupção da oferta ou das rotas por conflito, sanção ou ataque, com os fatos recentes que seguem pesando.",
      medida: "Fator de evento, sem cálculo: os eventos aceitos da leitura diária marcados com este fator nos últimos 30 dias, cada um com a data da leitura que o registrou e a idade, o tipo, o resumo (com a data do fato, quando a fonte a dá), o canal, a pressão (leitura da IA), a intensidade, a confiança e a página da fonte autorizada, mais o nível e o resumo do petróleo na leitura mais recente.",
      comparacao: "Sem comparação numérica: a idade de cada evento e o nível da leitura mais recente (NORMAL a EXCEPCIONAL, escala provisória).",
      leitura: "Fica com a IA do ativo, com os outros fatores: interrupção material (rota fechada, produção parada) pressiona para cima; ameaça sem efeito material é só atenção (a direção indicada pelo especialista)."
    },
    perguntas: [
      "A janela de 30 dias basta, ou a leitura diária deve registrar os riscos em curso e a vigência de cada fato (exige mudar o prompt)?",
      "Uma ameaça sem efeito material conta, ou só a interrupção que já aconteceu?",
      "Vale o evento mais grave do dia ou a quantidade de eventos?",
      "A geopolítica é um fator próprio ou um modificador dos fatores de oferta (OPEP+, oferta não-OPEP)?"
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
          "Suficiente para a demanda dos EUA, que o fator calcula. No histórico do FinMind (desde 1990), o crescimento anual do consumo dos EUA anda junto com o preço (correlação de +0,28 com a variação do WTI dos 6 meses anteriores, desde 2010), mas não o antecipa (perto de zero com o WTI 13 ou 26 semanas depois): os dois seguem a economia. Mede a situação, como o especialista descreve. A China, que o especialista cita, ficou de fora: no JODI ela é \"não avaliada\" e caiu ~30% de mar a jun/2026 (de ~17.500 para ~11.700 mil barris/dia) sem explicação; a do JODI também não antecipa o preço."
      },
      lacunas: [
        "A China (JODI) não entra no cálculo: dado não avaliado pelo próprio JODI, com a queda de 2026 sem explicação, e ~2 meses de atraso. Continua coletada (card do JODI).",
        "A Rússia não reporta ao JODI; indicadores de atividade econômica (PMI, PIB) não são coletados."
      ]
    },
    proposta: {
      objetivo: "Medir se o consumo de petróleo está forte ou fraco, pela demanda dos EUA.",
      medida: "Consumo médio das últimas 4 semanas nos EUA (derivados fornecidos, EIA); a semana isolada oscila com feriados.",
      comparacao: "O mesmo período do ano anterior (crescimento anual), que tira a sazonalidade.",
      leitura: "Crescimento anual acima de uma faixa neutra (padrão: 2%) é demanda forte (pressão de alta); abaixo, demanda fraca (pressão de baixa). Intensidade forte a partir de 5%. Tendência: se o crescimento mudou 2,5 p.p. ou mais em 13 semanas, está subindo ou caindo. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "A demanda dos EUA basta como medida, ou a China precisa entrar? A série da China no JODI é \"não avaliada\" e caiu ~30% em 2026 sem explicação: há outra fonte confiável para ela?",
      "O consumo medido basta, ou é preciso um indicador de atividade econômica (que hoje não é coletado)?"
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
          "Suficiente: o índice do Fed contra as moedas das economias avançadas é o mais próximo do DXY que o especialista cita. No histórico do FinMind (2006 a 2026), o dólar é o fator com a relação mais forte com o preço do petróleo: o desvio do dólar contra a média das 52 semanas anteriores tem correlação de -0,56 com a variação do WTI dos 6 meses anteriores (andam juntos, em sentidos opostos: a \"correlação inversa\" indicada pelo especialista) e de -0,37 com o WTI 26 semanas depois, desde 2015 (dólar forte antecede petróleo mais fraco). Exemplos: dólar 15,6% acima do normal em out/2008 e 8,4% em dez/2014, nas duas grandes quedas do petróleo."
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
    perguntas: [
      "O índice do Fed das economias avançadas serve no lugar do DXY? O índice amplo (26 moedas) também é coletado e anda ainda mais junto com o petróleo (-0,63), mas antecipa um pouco menos.",
      "O dólar é um fator próprio (como na definição, peso Médio) ou um filtro que confirma os outros?"
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
    dados: {
      observaveis: ["COT_PETROLEO_WTI"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente: o COT da CFTC traz as posições compradas e vendidas dos fundos (managed money) no WTI da NYMEX, toda semana, desde 2006. No histórico do FinMind (2010 a 2026), a posição líquida em % dos contratos em aberto segue o preço (+0,2 com a variação do WTI das 13 a 26 semanas anteriores: os fundos compram depois da alta, o \"amplifica\" indicado pelo especialista) e, nos extremos, o preço tende a virar: com os fundos entre os 10% mais vendidos dos 3 anos anteriores, o WTI subiu em 74% dos casos 26 semanas depois (média de +12%); entre os 10% mais comprados, em 44% (média de -1%). Fora dos extremos, perto de 50%. Exemplos: muito comprados em jun/2014, antes da queda; muito vendidos em fev/2016 e abr/2025."
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
      leitura: "O especialista diz que amplifica; a proposta lê os extremos como risco de reversão: fundos muito comprados (acima do percentil 80, padrão: posição relativa de +30) pressionam para baixo, muito vendidos (abaixo do 20) para cima; forte além do 10 e do 90 (40 pontos). Tendência: se a posição relativa mudou 15 pontos ou mais em 4 semanas, os fundos estão comprando ou vendendo. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "COT confirma os outros fatores ou tem direção própria? A proposta lê o extremo como risco de reversão (o histórico mostra isso, sobretudo do lado vendido); a outra leitura, a de seguir os fundos, o histórico não sustenta.",
      "O que conta como extremo de posição (percentil, desvio-padrão, máxima histórica)? A proposta usa os percentis 20/80 e 10/90 dos 3 anos anteriores."
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
    dados: {
      observaveis: ["PETROLEO_PRECOS_EIA", "PETROLEO_FLUXOS_EIA"],
      eventos: false,
      avaliacao: {
        suficiente: true,
        texto:
          "Suficiente para medir a margem de refino, que a EIA não publica: o FinMind a calcula com os preços à vista que já coleta (gasolina e diesel de Nova York e o Brent), desde 2006 (o diesel S10 começa aí; a média de 5 anos, em 2011). No histórico, a margem acima do normal anda com refinarias mais cheias (correlação de +0,25 com a utilização e +0,20 com o crescimento do petróleo processado), o mecanismo indicado pelo especialista, mas não antecipa o preço do petróleo (-0,08 a -0,15 com o WTI 13 e 26 semanas depois, levemente no sentido contrário). Mede a situação do refino. Com o Brent, e não o WTI: os derivados de Nova York são precificados contra o Brent, e em 2011-2013 o WTI ficou até US$ 20 abaixo dele, o que inflava o crack sem que a margem real subisse."
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
      leitura: "Margem acima do normal além de uma faixa (padrão: US$ 3 por barril) indica demanda firme por petróleo bruto (pressão de alta); abaixo, demanda fraca (pressão de baixa). Intensidade forte a partir de US$ 10. Tendência: se o desvio mudou US$ 3 ou mais em 4 semanas. Parâmetros do FinMind, ajustáveis pelo Comitê no card C. Decidir."
    },
    perguntas: [
      "Qual crack spread: 3-2-1, 2-1-1, ou gasolina e diesel separados? (Em 2022 e em 2026 a alta veio do diesel.)",
      "Margem muito alta por falta de derivados (como em 2022 e hoje) deve ser lida como alta para o petróleo, como diz o especialista, ou como um problema do refino que não puxa o petróleo?"
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

const FATORES_PETROLEO = DEFINICOES.map((definicao) => {
  const fator = FATORES.find((item) => item.codigo === definicao.codigo);
  if (!fator) throw new Error(`Fator do petróleo ausente no catálogo do FEL 1: ${definicao.codigo}`);
  return {
    codigo: fator.codigo,
    nome: definicao.nome || fator.nome,
    nomeFel1: fator.nome,
    peso: fator.peso,
    fel1: definicao.fel1,
    dados: definicao.dados,
    proposta: { situacao: SITUACAO.PROPOSTA, ...definicao.proposta },
    perguntas: definicao.perguntas,
    evento: definicao.evento || null
  };
});

function obterMetodologiaPetroleo() {
  return {
    ativo: "PETROLEO",
    nome: "Petróleo",
    versao: VERSAO,
    dataVersao: DATA_VERSAO,
    fatores: FATORES_PETROLEO
  };
}

module.exports = { SITUACAO, FATORES_PETROLEO, obterMetodologiaPetroleo };
