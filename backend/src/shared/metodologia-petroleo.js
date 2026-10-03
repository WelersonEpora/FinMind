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
//
// Nada daqui alimenta o Centro de Decisão, o motor ou o prompt da IA, e nada gera sinal (ADR 0050).

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
    dados: {
      observaveis: ["PETROLEO_PRODUCAO_JODI"],
      eventos: true,
      lacunas: [
        "As cotas (metas) da OPEP+ por membro não são coletadas: o MOMR da OPEP não foi acessível de forma automática (ADR 0042).",
        "A Rússia para de reportar ao JODI em mar/2023."
      ]
    },
    proposta: {
      objetivo: "Medir se a oferta da OPEP+ está subindo ou caindo de fato, não só no anúncio.",
      medida: "Produção mensal somada dos membros da OPEP+ que reportam ao JODI, e a variação contra o mês anterior.",
      comparacao: "Média dos 12 meses anteriores.",
      leitura: "Produção abaixo da referência e caindo pressiona para cima; acima e subindo, para baixo (a direção indicada pelo especialista). O anúncio de corte ou aumento entra pelos eventos de mercado, no dia da reunião."
    },
    perguntas: [
      "O que pesa mais: o anúncio da reunião (evento) ou a produção efetivamente bombeada (dado mensal, com ~2 meses de atraso)?",
      "Sem as cotas por membro, a produção agregada basta, ou é preciso medir o desvio contra a meta?"
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
    dados: {
      observaveis: [],
      eventos: true,
      lacunas: ["A régua dos níveis da leitura diária (o que é \"fora do normal\") é provisória (ADRs 0047 e 0049)."]
    },
    proposta: {
      objetivo: "Capturar o risco de interrupção da oferta ou das rotas por conflito, sanção ou ataque.",
      medida: "O nível da leitura diária de eventos de mercado do petróleo e os eventos geopolíticos do dia, com o canal de transmissão.",
      comparacao: "O nível NORMAL da própria leitura.",
      leitura: "Evento com interrupção material (rota fechada, produção parada) pressiona para cima; ameaça sem efeito material é só atenção."
    },
    perguntas: [
      "Uma ameaça sem efeito material conta, ou só a interrupção que já aconteceu?",
      "Vale o evento mais grave do dia ou a quantidade de eventos?",
      "A geopolítica é um fator próprio ou um modificador dos fatores de oferta (OPEP+, oferta não-OPEP)?"
    ]
  },
  {
    codigo: "PETROLEO_DEMANDA",
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
      lacunas: ["A expectativa do mercado para os juros (futuros de Fed Funds) não é coletada."]
    },
    proposta: {
      objetivo: "Medir se a política monetária americana está apertando ou afrouxando.",
      medida: "Meta dos Fed Funds e o rendimento do Treasury de 10 anos.",
      comparacao: "A direção do último movimento da meta (alta, corte ou manutenção).",
      leitura: "Ciclo de alta pressiona a demanda (para baixo); ciclo de corte favorece (para cima). Contexto, mais do que pressão direta."
    },
    perguntas: ["Juros entram como fator com direção própria ou só como contexto para a demanda?"]
  },
  {
    codigo: "PETROLEO_FUNDOS",
    fel1: {
      tipo: "Técnico/Fluxo",
      direcao: "Amplifica movimentos em ambos os sentidos",
      mecanismo: "Posições especulativas amplificam tendências",
      fonte: "CFTC"
    },
    dados: { observaveis: ["COT_PETROLEO_WTI"], eventos: false, lacunas: [] },
    proposta: {
      objetivo: "Medir o posicionamento dos fundos (managed money) no WTI.",
      medida: "Posição líquida (comprado menos vendido) e a variação semanal.",
      comparacao: "Percentil da posição líquida nos últimos 3 anos.",
      leitura: "Não dá direção sozinho (o especialista diz que amplifica): confirma a direção dos outros fatores; posição em extremo indica risco de reversão."
    },
    perguntas: [
      "COT confirma os outros fatores ou tem direção própria?",
      "O que conta como extremo de posição (percentil, desvio-padrão, máxima histórica)?"
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
    fel1: {
      tipo: "Fundamentalista",
      direcao: "Alta com oferta menor; baixa com crescimento de produção",
      mecanismo: "Novos produtores aumentam oferta global",
      fonte: "ANP, EIA, IEA"
    },
    dados: {
      observaveis: ["PETROLEO_PRODUCAO_ANP", "PETROLEO_PRODUCAO_JODI", "PETROLEO_FLUXOS_EIA"],
      eventos: false,
      lacunas: [
        "A Guiana não reporta ao JODI.",
        "O Brasil para no JODI em dez/2022: o Brasil vem da ANP (em m³, por UF)."
      ]
    },
    proposta: {
      objetivo: "Medir o crescimento da oferta fora da OPEP+, nos produtores citados pelo especialista.",
      medida: "Produção do Brasil (ANP), da Noruega (JODI) e dos EUA (EIA), cada uma com a variação anual.",
      comparacao: "O mesmo mês do ano anterior.",
      leitura: "Crescimento forte da oferta não-OPEP pressiona para baixo; queda, para cima (a direção indicada pelo especialista)."
    },
    perguntas: [
      "Os EUA entram aqui ou só no fator de produção dos EUA (para não contar duas vezes)?",
      "Os países são lidos um a um ou somados num bloco?"
    ]
  }
];

const FATORES_PETROLEO = DEFINICOES.map((definicao) => {
  const fator = FATORES.find((item) => item.codigo === definicao.codigo);
  if (!fator) throw new Error(`Fator do petróleo ausente no catálogo do FEL 1: ${definicao.codigo}`);
  return {
    codigo: fator.codigo,
    nome: fator.nome,
    peso: fator.peso,
    fel1: definicao.fel1,
    dados: definicao.dados,
    proposta: { situacao: SITUACAO.PROPOSTA, ...definicao.proposta },
    perguntas: definicao.perguntas
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
