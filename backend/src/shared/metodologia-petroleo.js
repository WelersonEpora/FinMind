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
      leitura: "Produção abaixo da referência e caindo pressiona para cima; acima e subindo, para baixo (a direção do FEL 1). O anúncio de corte ou aumento entra pelos eventos de mercado, no dia da reunião."
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
      "O \"esperado\" do FEL 1 pode ser lido como o normal da época (a média de 5 anos), deixando de lado a reação do dia da divulgação?",
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
      observaveis: ["PETROLEO_DEMANDA_JODI", "PETROLEO_FLUXOS_EIA"],
      eventos: false,
      lacunas: [
        "A Rússia não reporta ao JODI; a China e a Índia têm código de avaliação 3 (não avaliado).",
        "Indicadores de atividade econômica (PMI, PIB) não são coletados."
      ]
    },
    proposta: {
      objetivo: "Medir se o consumo de petróleo está acelerando ou desacelerando.",
      medida: "Demanda de derivados da China e dos EUA (JODI, mensal) e os derivados fornecidos nos EUA (EIA, semanal).",
      comparacao: "O mesmo período do ano anterior (variação anual), para tirar a sazonalidade.",
      leitura: "Crescimento anual positivo e subindo é demanda forte (pressão de alta); queda é demanda fraca."
    },
    perguntas: [
      "Basta China e EUA, como no FEL 1, ou entram Índia e Europa?",
      "O consumo medido basta, ou é preciso um indicador de atividade (que hoje não é coletado)?"
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
      observaveis: ["CAMBIO_DXY_FED", "DOLAR_AMPLO_FED"],
      eventos: false,
      lacunas: ["O DXY oficial (ICE) é licenciado e não é coletado; o FinMind tem as moedas da cesta e o índice amplo do Fed."]
    },
    proposta: {
      objetivo: "Medir a força do dólar, que encarece o petróleo para quem compra em outra moeda.",
      medida: "Índice amplo do dólar do Fed e a variação em 1 e 3 meses.",
      comparacao: "A própria tendência (variação em 3 meses).",
      leitura: "Dólar subindo pressiona para baixo; dólar caindo, para cima (a direção do FEL 1)."
    },
    perguntas: [
      "O índice amplo do Fed serve no lugar do DXY, ou é preciso remontar o DXY pelas moedas da cesta?",
      "O dólar é um fator próprio ou só confirma os outros?"
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
      lacunas: ["A contagem de sondas (rig count, Baker Hughes) não é coletada."]
    },
    proposta: {
      objetivo: "Medir se a oferta americana está crescendo ou encolhendo.",
      medida: "Produção semanal de petróleo dos EUA (EIA) e a variação em 4 semanas.",
      comparacao: "Máxima histórica e média das 13 semanas anteriores.",
      leitura: "Produção em recorde e subindo pressiona para baixo; produção caindo, para cima (a direção do FEL 1)."
    },
    perguntas: [
      "Sem o rig count, a produção semanal basta? Ou o rig count (que antecipa a produção) é necessário?",
      "A produção semanal é estimativa da EIA, revista depois pelo dado mensal: usar a semanal mesmo assim?"
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
      leitura: "Não dá direção sozinho (o FEL 1 diz que amplifica): confirma a direção dos outros fatores; posição em extremo indica risco de reversão."
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
      lacunas: ["A margem de refino (crack spread) não é publicada pela EIA: é um cálculo sobre os preços (ADR 0040)."]
    },
    proposta: {
      objetivo: "Medir se refinar está dando lucro, o que puxa a compra de petróleo bruto.",
      medida: "Crack spread 3-2-1 com os preços de Nova York: [(2 × gasolina + 1 × diesel) × 42 galões − 3 × WTI] ÷ 3, em US$ por barril; e a utilização das refinarias.",
      comparacao: "Média da mesma época nos 5 anos anteriores (a margem é sazonal).",
      leitura: "Margem acima da referência indica demanda firme por petróleo bruto (pressão de alta); abaixo, demanda fraca."
    },
    perguntas: [
      "Qual crack spread: 3-2-1, 2-1-1, ou gasolina e diesel separados?",
      "Os preços de Nova York (os que a EIA publica de graça) servem, ou é preciso a Costa do Golfo?"
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
      objetivo: "Medir o crescimento da oferta fora da OPEP+, nos produtores citados pelo FEL 1.",
      medida: "Produção do Brasil (ANP), da Noruega (JODI) e dos EUA (EIA), cada uma com a variação anual.",
      comparacao: "O mesmo mês do ano anterior.",
      leitura: "Crescimento forte da oferta não-OPEP pressiona para baixo; queda, para cima (a direção do FEL 1)."
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
