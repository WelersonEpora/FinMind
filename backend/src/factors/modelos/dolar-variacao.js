"use strict";

const pointInTimeService = require("../../services/point-in-time.service");
const d = require("./dolar-comum");

// MOLDE dos fatores do dólar com UM primário, no máximo uma confirmação e o contexto (proposta do dólar, §2.3; ADR
// 0126): o F2 (dólar global), o F3 (juros dos EUA) e o F5 (aversão a risco). O cálculo é este; cada fator dá as séries,
// o tipo da variação, o lado que a alta pressiona, a regra extra (o limiar do VIX no F5) e os textos.
//
// OBSERVÁVEL → FATOR (ver ADR 0008):
//   observáveis (observation), diários: `primario.serie`, `confirmacao.serie` e as do `contexto`
//   fator (calculado sob demanda, NUNCA gravado), um ponto por dia útil do primário:
//     A. o nível do primário e o da confirmação no dia
//     B. a variação do primário em cada janela (1, 5, 20 e 60 dias úteis) e a posição dela no histórico (a régua);
//        a da confirmação, na mesma janela; o contexto
//     C. por horizonte: a leitura do primário pela régua, limitada a fraca se a confirmação aponta o lado oposto
//        (medição aprovada); a R2 tira os horizontes que o dado não alcança
// Propriedades: determinístico, versionado, point-in-time, sem IA.

// `config`:
//   factorId, factorVersion
//   primario     { serie, tipo (dolar-comum.js::TIPO), acima (o lado que a alta pressiona), rotulo, nivel: { unidade, casas } }
//   confirmacao  o mesmo formato, ou null
//   contexto     [{ serie, tipo, rotulo, nivel: { unidade, casas } }]: o nível e a variação de 20 dias úteis, só texto
//   r2           { HORIZONTE: "motivo" }: os horizontes que o primário não alcança (a defasagem)
//   ajustar      (opcional) (leitura, { nivel }) -> leitura: a regra extra do fator sobre a leitura do primário
//   regraExtra   (opcional) o texto da regra extra, para a regra do prompt
//   episodios, apresentacao: { titulo, nota, graficoAB }
function criarFatorDolarVariacao(config) {
  const { factorId, factorVersion, primario, confirmacao, contexto = [], r2 = {}, ajustar = null } = config;
  const series = [primario.serie, ...(confirmacao ? [confirmacao.serie] : []), ...contexto.map((c) => c.serie)];

  function contextoDoDia(linhasPorSerie, data) {
    return contexto
      .map((c) => {
        const serie = linhasPorSerie.get(c.serie);
        const i = d.indiceAte(serie, data);
        if (i < 0) return `${c.rotulo}: sem dado`;
        const agora = serie[i];
        const antes = i >= 20 ? serie[i - 20] : null;
        const variacao = antes ? c.tipo.calcular(agora.valor, antes.valor) : null;
        return (
          `${c.rotulo} ${d.fmt(agora.valor, c.nivel.casas)}${c.nivel.unidade} em ${d.dataBr(agora.observedAt)}` +
          (variacao === null ? "" : ` (${d.comSinal(variacao, c.tipo.casas)}${c.tipo.unidade} em 20 dias úteis)`)
        );
      })
      .join("; ");
  }

  // Função PURA: as linhas de obterAsOf() -> um ponto por dia útil do primário (a partir do 1º com leitura).
  function derivar(linhasAsOf, { parametros = d.PARAMETROS_REGUA } = {}) {
    const linhasPorSerie = new Map(series.map((s) => [s, d.serieDiaria(linhasAsOf, s)]));
    const serieP = linhasPorSerie.get(primario.serie);
    const reguaP = d.reguasPorHorizonte(serieP, primario.tipo, parametros);
    const serieC = confirmacao ? linhasPorSerie.get(confirmacao.serie) : null;
    const reguaC = confirmacao ? d.reguasPorHorizonte(serieC, confirmacao.tipo, parametros) : null;

    const pontos = [];
    for (let i = 0; i < serieP.length; i += 1) {
      // Só a partir do 1º dia com leitura em alguma janela (antes, o histórico não basta).
      if (!d.HORIZONTES.some((h) => reguaP[h.codigo][i] && reguaP[h.codigo][i].percentil !== null)) continue;
      const dia = serieP[i];
      const iC = confirmacao ? d.indiceAte(serieC, dia.observedAt) : -1;
      const porHorizonte = {};
      const variacoes = [];
      const variacoesConf = [];
      for (const h of d.HORIZONTES) {
        const rP = reguaP[h.codigo][i];
        const rC = iC >= 0 ? reguaC[h.codigo][iC] : null;
        variacoes.push(`${h.janela} d.u.: ${d.descreverVariacao(rP, primario.tipo)}`);
        if (confirmacao) variacoesConf.push(`${h.janela} d.u.: ${d.descreverVariacao(rC, confirmacao.tipo)}`);
        if (r2[h.codigo]) {
          porHorizonte[h.codigo] = d.semLeituraR2(r2[h.codigo]);
          continue;
        }
        let leitura = d.leituraDaRegua(rP, parametros, primario.acima);
        if (leitura && ajustar) leitura = ajustar(leitura, { nivel: dia.valor });
        const leituraConf = confirmacao ? d.leituraDaRegua(rC, parametros, confirmacao.acima) : null;
        const final = d.aplicarConfirmacao(leitura, confirmacao ? [{ rotulo: confirmacao.rotulo, leitura: leituraConf }] : []);
        porHorizonte[h.codigo] = d.leituraDoHorizonte(final, `${primario.rotulo} ${d.descreverVariacao(rP, primario.tipo)}`);
      }
      const leituraTela = porHorizonte[d.HORIZONTE_DA_TELA];
      const disponivelEm = iC >= 0 && serieC[iC].disponivelEm > dia.disponivelEm ? serieC[iC].disponivelEm : dia.disponivelEm;
      pontos.push({
        factorId,
        factorVersion,
        observedAt: dia.observedAt,
        nivel: dia.valor,
        nivelConfirmacao: iC >= 0 ? serieC[iC].valor : null,
        variacoesTexto: variacoes.join(" | "),
        confirmacaoTexto: confirmacao ? variacoesConf.join(" | ") : "-",
        contextoTexto: contexto.length ? contextoDoDia(linhasPorSerie, dia.observedAt) : "-",
        variacaoMedio: reguaP.MEDIO[i]?.variacao ?? null,
        // A posição só existe quando a leitura do horizonte de 30 dias vale (a regra extra do F5 pode zerá-la).
        posicaoMedio: leituraTela.aplica && leituraTela.direcao === d.DIRECAO.NEUTRA && reguaP.MEDIO[i]?.percentil >= parametros.reguaPercentilNeutro ? 0 : d.posicaoComSinal(reguaP.MEDIO[i]),
        porHorizonte,
        decisao: d.decisaoDaTela(porHorizonte),
        disponivelEm,
        disponivelEmEhEstimado: Boolean(dia.estimado)
      });
    }
    return pontos;
  }

  async function calcular({ asOf, parametros = d.PARAMETROS_REGUA }, deps = {}) {
    const servico = deps.pointInTimeService || pointInTimeService;
    const linhas = await servico.obterAsOf({ seriesCodes: series, asOf }, deps);
    return derivar(linhas, { parametros });
  }

  function explicar(ponto) {
    if (!ponto) return [];
    return [
      `${d.dataBr(ponto.observedAt)}: ${primario.rotulo} em ${d.fmt(ponto.nivel, primario.nivel.casas)}${primario.nivel.unidade}.`,
      `Variação por janela: ${ponto.variacoesTexto}.`,
      ...(confirmacao ? [`Confirmação (${confirmacao.rotulo}): ${ponto.confirmacaoTexto}.`] : []),
      ...(contexto.length ? [`Contexto: ${ponto.contextoTexto}.`] : []),
      ...d.linhasPorHorizonte(ponto.porHorizonte)
    ];
  }

  function exemplos(pontos) {
    return d.exemplosPorData(pontos, config.episodios || []);
  }

  const apresentacao = {
    unidade: "percentil",
    quadros: [
      { camada: "A", rotulo: primario.rotulo, campo: "nivel", casas: primario.nivel.casas, unidadeValor: primario.nivel.unidade },
      ...(confirmacao ? [{ camada: "A", rotulo: `${confirmacao.rotulo} (confirmação)`, campo: "nivelConfirmacao", casas: confirmacao.nivel.casas, unidadeValor: confirmacao.nivel.unidade }] : []),
      { camada: "B", rotulo: `Variação de ${primario.rotulo} por janela (a régua)`, campo: "variacoesTexto" },
      ...(confirmacao ? [{ camada: "B", rotulo: `Confirmação: ${confirmacao.rotulo}`, campo: "confirmacaoTexto" }] : []),
      ...(contexto.length ? [{ camada: "B", rotulo: "Contexto", campo: "contextoTexto" }] : [])
    ],
    graficoAB: config.apresentacao.graficoAB,
    graficoC: d.graficoC(primario.rotulo),
    rotulosDecisao: d.ROTULOS_DECISAO,
    parametros: d.DESCRITORES_PARAMETROS,
    semTendencia: true,
    porHorizonte: true,
    regra: `${d.REGRA_REGUA}; ${config.apresentacao.regra}`,
    exemplos: { colunaValor: "Posição com sinal (percentil, 30 dias)" },
    nota: config.apresentacao.nota
  };

  return {
    series,
    derivar,
    calcular,
    explicar,
    exemplos,
    METODOLOGIA: {
      factorId,
      factorVersion,
      parametrosPadrao: d.PARAMETROS_REGUA,
      periodicidade: "DIARIA",
      calcular,
      explicar,
      exemplos,
      apresentacao
    }
  };
}

module.exports = { criarFatorDolarVariacao };
