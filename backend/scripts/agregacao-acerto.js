"use strict";

// O acerto de uma agregação em código no histórico (ADRs 0081 e 0066), comum aos scripts `agregacao-<ativo>-historico.js`:
// o que o preço de referência fez em cada horizonte, medido como a Qualidade da IA mede uma leitura (o contrato de cada
// horizonte do ADR 0078, o realizado do ADR 0063 e as comparações do ADR 0064), contra os benchmarks Sempre Lateral e
// Persistência. Não chama a IA e não grava nada.

const centroDecisaoService = require("../src/services/centro-decisao.service");
const { lerContratosPorHorizonte } = require("../src/services/prompt-diario.service");
const { apurarRealizados } = require("../src/services/realizado-analise.service");
const { comparar, persistencia } = require("../src/services/qualidade-ia.service");
const { configuracaoDoAtivo } = require("../src/shared/analise-diaria");
const { somarDias } = require("../src/shared/utils/date-utils");

function criarAvaliador(ativo) {
  const config = configuracaoDoAtivo(ativo);
  const serie = centroDecisaoService.ATIVOS.find((a) => a.codigo === ativo).series.find((s) => s.codigo === config.PRECO.serie);
  const linhas = [];

  // A leitura do motor como uma leitura gravada (analise-diaria.service.js::leituraGravada), com o contrato de cada
  // horizonte: o que a avaliação precisa para apurar o realizado.
  async function leituraParaAvaliar(data, agora) {
    const preco = await centroDecisaoService.lerPreco(serie, { data, agora }, {});
    if (!preco.disponivel) return null;
    const curva = serie.futuro ? await centroDecisaoService.lerCurva(serie.futuro, { data, agora }, {}) : null;
    const porHorizonte = await lerContratosPorHorizonte(serie, { dataAnalise: data, agora, curva, config }, centroDecisaoService, {});
    return {
      data,
      precoReferencia: { serie: config.PRECO.serie, seriesCode: preco.seriesCode, contrato: preco.contrato, dataReferencia: preco.dataReferencia, valor: preco.valor },
      referenciaHorizontes: { tipo: "DATA_DA_ANALISE", data },
      horizontes: config.HORIZONTES.map(({ codigo, dias }) => {
        const precoH = porHorizonte[codigo].preco;
        return {
          codigo,
          dias,
          ...config.FAIXAS[codigo],
          dataAlvo: somarDias(data, dias),
          ...(precoH.disponivel
            ? { seriesCode: precoH.seriesCode, contrato: precoH.contrato, precoRecebido: { valor: precoH.valor, dataReferencia: precoH.dataReferencia } }
            : {}),
          variacoes: precoH.disponivel ? precoH.variacoes : null
        };
      })
    };
  }

  // Mede a agregação de uma data (o resultado de agregar<Ativo>, com `horizontes`) e guarda as linhas avaliáveis: o
  // realizado apurado, a base no dia e o motor com leitura.
  async function avaliar(data, resultado, agora) {
    const leitura = await leituraParaAvaliar(data, agora);
    if (!leitura) return;
    const [realizado] = await apurarRealizados([leitura], { agora });
    for (const h of leitura.horizontes) {
      const apurado = realizado.horizontes.find((x) => x.horizonte === h.codigo);
      const motorH = resultado.horizontes.find((x) => x.horizonte === h.codigo);
      if (apurado?.situacao !== "APURADO" || !apurado.faixa || !apurado.base?.naDataDaAnalise) continue;
      const pers = persistencia(h.variacoes, h);
      linhas.push({
        data,
        horizonte: h.codigo,
        motor: motorH?.faixa ? comparar(motorH.faixa, apurado.faixa) : null,
        lateral: comparar("LATERAL", apurado.faixa),
        persistencia: pers ? comparar(pers.faixa, apurado.faixa) : null
      });
    }
  }

  // O acerto de cada previsor por horizonte. Persistência: a variação passada de mesmo prazo no contrato do horizonte,
  // como a IA a receberia.
  function resumir() {
    console.log(`\nAcerto contra o ${config.PRECO.serie} (as mesmas regras da Qualidade da IA): direção | faixa exata | distância média`);
    for (const { codigo } of config.HORIZONTES) {
      const doH = linhas.filter((l) => l.horizonte === codigo);
      const medir = (chave) => {
        const v = doH.map((l) => l[chave]).filter(Boolean);
        if (!v.length) return "-";
        const dir = v.filter((x) => x.direcao).length;
        const exata = v.filter((x) => x.faixaExata).length;
        const dist = v.reduce((s, x) => s + x.distancia, 0) / v.length;
        return `${Math.round((dir / v.length) * 100)}% | ${Math.round((exata / v.length) * 100)}% | ${dist.toFixed(2)} (n=${v.length})`;
      };
      const naoLaterais = doH.filter((l) => l.motor && l.motor.faixa !== "LATERAL");
      const dirNaoLat = naoLaterais.filter((l) => l.motor.direcao).length;
      console.log(`  ${codigo.padEnd(8)} motor ${medir("motor")} | sempre lateral ${medir("lateral")} | persistência ${medir("persistencia")}`);
      console.log(`           motor fora do LATERAL: ${naoLaterais.length} leituras, direção certa em ${naoLaterais.length ? Math.round((dirNaoLat / naoLaterais.length) * 100) : "-"}%`);
    }
  }

  return { avaliar, resumir, linhas };
}

module.exports = { criarAvaliador };
