"use strict";

const pointInTimeService = require("../../services/point-in-time.service");
const faixa = require("../base/decisao-por-faixa");
const { somarDias, mediaSemanal } = require("../base/semana-de-dias");

// MOLDE dos fatores de juros (ADR 0050): a variação de uma taxa diária em 26 semanas, na média da semana, com uma
// segunda taxa como contexto (o ciclo dela em 52 semanas). O cálculo é este; cada ativo dá as séries, os nomes dos
// campos do ponto, os textos e a apresentação. Ex.: o Treasury nominal no petróleo (juros-petroleo.factor.js) e o
// juro real no ouro (juros-reais-ouro.factor.js), os dois com a meta do Fed como contexto.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (tabela observation), diários, na média da semana (sábado a sexta): `series.principal` e
//   `series.contexto`
//   fator (calculado sob demanda, NUNCA gravado):
//     A. a taxa principal e a de contexto na semana; a variação da de contexto em 52 semanas (o ciclo)
//     B. a taxa principal 26 semanas antes e a variação, em p.p.
//     C. decisão por faixa sobre a variação: subindo além da faixa pressiona para `acimaPressiona`
// Propriedades: determinístico, versionado, point-in-time, sem IA.

const DIAS_SEMANA = 7;
const SEMANAS_VARIACAO = 26;
const SEMANAS_CICLO = 52;

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// `config`:
//   factorId, factorVersion, parametrosPadrao
//   series          { principal, contexto }: os códigos das duas taxas
//   campos          os nomes dos campos do ponto: { principal, contexto, variacaoContexto, principalAntes, variacao }
//   acimaPressiona  o lado que a taxa subindo pressiona (decisao-por-faixa.js)
//   textos          os textos da explicação da camada C (decisao-por-faixa.js::explicarPorFaixa), sem o `campo`
//   episodios, cenarios, apresentacao
function criarFatorJuroVariacao(config) {
  const { factorId, factorVersion, parametrosPadrao, series, campos, acimaPressiona, episodios, cenarios, apresentacao } = config;

  // Função PURA: recebe as linhas de obterAsOf() e devolve um ponto por semana (a sexta), as semanas da taxa principal.
  function derivar(linhasAsOf, { parametros = parametrosPadrao } = {}) {
    const principal = mediaSemanal(linhasAsOf, series.principal);
    const contexto = mediaSemanal(linhasAsOf, series.contexto);
    const contextoEm = (data) => contexto.get(data)?.media;

    const variacoes = new Map();
    const pontos = [];
    for (const observedAt of [...principal.keys()].sort()) {
      const semana = principal.get(observedAt);
      const antes = principal.get(somarDias(observedAt, -DIAS_SEMANA * SEMANAS_VARIACAO))?.media;
      const variacao = antes === undefined ? null : arredondar(semana.media - antes, 2);
      variacoes.set(observedAt, variacao);
      const contextoAgora = contextoEm(observedAt);
      const contextoAntes = contextoEm(somarDias(observedAt, -DIAS_SEMANA * SEMANAS_CICLO));
      const anterior = variacoes.get(somarDias(observedAt, -DIAS_SEMANA * parametros.semanasTendencia));
      const semanaContexto = contexto.get(observedAt);
      const disponivelEm =
        semanaContexto && semanaContexto.disponivelEm > semana.disponivelEm ? semanaContexto.disponivelEm : semana.disponivelEm;
      pontos.push({
        factorId,
        factorVersion,
        observedAt,
        [campos.principal]: arredondar(semana.media, 2),
        diasNaSemana: semana.dias,
        [campos.contexto]: contextoAgora === undefined ? null : arredondar(contextoAgora, 2),
        [campos.variacaoContexto]:
          contextoAgora === undefined || contextoAntes === undefined ? null : arredondar(contextoAgora - contextoAntes, 2),
        [campos.principalAntes]: antes === undefined ? null : arredondar(antes, 2),
        [campos.variacao]: variacao,
        decisao: faixa.decidirPorFaixa(variacao, anterior ?? null, parametros, acimaPressiona),
        disponivelEm,
        disponivelEmEhEstimado: semana.estimado || Boolean(semanaContexto?.estimado)
      });
    }
    return pontos;
  }

  async function calcular({ asOf, parametros = parametrosPadrao }, deps = {}) {
    const servico = deps.pointInTimeService || pointInTimeService;
    const linhas = await servico.obterAsOf({ seriesCodes: [series.principal, series.contexto], asOf }, deps);
    return derivar(linhas, { parametros });
  }

  const textos = { campo: campos.variacao, ...config.textos };

  function explicar(ponto, parametros = parametrosPadrao) {
    return faixa.explicarPorFaixa(ponto, parametros, textos);
  }

  function exemplos(pontosTodos, parametros = parametrosPadrao) {
    return faixa.exemplosPorFaixa(pontosTodos, parametros, { campo: textos.campo, episodios, cenarios, acimaPressiona });
  }

  return {
    derivar,
    calcular,
    explicar,
    exemplos,
    METODOLOGIA: {
      factorId,
      factorVersion,
      parametrosPadrao,
      periodicidade: "SEMANAL",
      calcular,
      explicar,
      exemplos,
      apresentacao
    }
  };
}

module.exports = { criarFatorJuroVariacao };
