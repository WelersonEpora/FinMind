"use strict";

const crypto = require("node:crypto");
const { carregarPrompt } = require("../ai/carregar-prompt");
const { configuracaoDoAtivo } = require("../shared/analise-diaria");
const metodologiaAtivoService = require("./metodologia-ativo.service");
const centroDecisaoService = require("./centro-decisao.service");
const marketQuoteRepository = require("../repositories/market-quote.repository");
const { somarDias } = require("../shared/utils/date-utils");

// Prompt diário de análise de um ativo (ADR 0051; o petróleo, e o ouro desde o ADR 0054): monta, para uma data, o
// prompt que a IA de tendência recebe, com o que se sabia até o fim daquele dia. Não chama nenhuma IA: a tela mostra o
// prompt e o coletor da leitura diária (collectors/analise/) o envia.
//
// Reaproveita o que já existe, sem lógica própria de cálculo:
//   - os fatores na data: metodologia-ativo.service.js::simularFatores (os textos A/B/C/D e os blocos de evento);
//   - o preço de referência: centro-decisao.service.js::lerPreco (point-in-time, variações de 1, 7, 30 e 90 dias);
//   - o texto fixo e a versão: ai/prompts/<ativo>-analise-diaria.md, por carregarPrompt (o mesmo da geopolítica);
//   - os horizontes, as faixas e os textos do preço: shared/analise-diaria-<ativo>.js (configuração explícita, versionada).
// O que a IA recebeu fica reconstituível pela versão do prompt, da metodologia e da configuração, pelos parâmetros de
// cada fator e pelo hash da entrada (ADR 0010).

const fmtData = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "-");
const fmtNumero = (n, casas = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const fmtPct = (n) => `${n > 0 ? "+" : ""}${fmtNumero(n)}%`;

// A data (AAAA-MM-DD, em São Paulo) de um instante de publicação.
function diaDaPublicacao(instante) {
  if (!instante) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(instante));
}

function diasEntre(inicio, fim) {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000);
}

// --- 2.1 Preço -----------------------------------------------------------------------------------------------------

// A PTAX de venda do dia do preço (ou do último dia útil antes dele), para o preço em reais (só referência). A PTAX
// sai à tarde do próprio dia: no fim do dia da análise, a do dia do preço já era conhecida.
async function lerPtax(dataReferencia, deps = {}) {
  const repo = deps.marketQuoteRepository || marketQuoteRepository;
  const { registros } = await repo.buscarHistorico({
    instrumentCode: "USD_BRL",
    modality: "venda",
    dataFim: dataReferencia,
    pagina: 1,
    tamanhoPagina: 1,
    ordem: "DESC"
  });
  const registro = registros[0];
  return registro ? { data: String(registro.reference_date).slice(0, 10), valor: Number(registro.value) } : null;
}

function linhaEmReais(preco, ptax, config) {
  if (!ptax) return `Em reais: SEM DADO (sem PTAX até ${fmtData(preco.dataReferencia)}).`;
  return (
    `Em reais: R$ ${fmtNumero(preco.valor * ptax.valor)} ${config.PRECO.unidadeEmReais || "por onça"}, pela PTAX de venda de ${fmtData(ptax.data)} ` +
    `(R$ ${fmtNumero(ptax.valor, 4)} por US$). Só referência: as faixas da tabela 2.4 são sobre o preço em US$.`
  );
}

function blocoPreco(preco, dataAnalise, config, ptax = null) {
  if (!preco.disponivel) return `Preço do ${config.PRECO.rotulo}: SEM DADO até a data da análise.`;
  // A moeda do preço: US$ no petróleo, no ouro e no café (o ICF), R$ no milho (o CCM).
  const moeda = config.PRECO.moeda || "US$";
  const publicado = diaDaPublicacao(preco.publicadoEm);
  const linhas = [`Série: ${preco.nome}, ${preco.unidade} | Fonte: ${preco.fonte}`];
  // Futuro (o GLD do ouro): o contrato do preço, o vencimento mais próximo negociado (centro-decisao.service.js::lerFuturo).
  if (preco.contrato) {
    linhas.push(`Contrato: ${preco.contrato.rotulo}, o vencimento mais próximo negociado até a data`);
  }
  linhas.push(
    `Último preço: ${moeda} ${fmtNumero(preco.valor)} em ${fmtData(preco.dataReferencia)} | publicado em ${fmtData(publicado)}` +
      `${preco.publicadoEmEstimado ? " (data estimada)" : ""} | ${preco.diasSemDado} dia(s) antes da data da análise` +
      `${preco.defasada ? " | DEFASADO: passou da tolerância da série" : ""}`
  );
  if (config.PRECO.emReais) linhas.push(linhaEmReais(preco, ptax, config));
  linhas.push(
    // Os horizontes contam da data da análise (config.REFERENCIA_HORIZONTES, ADR 0052): o intervalo entre o último
    // preço e ela é dito como desconhecido, para a IA não o estimar.
    `Os horizontes da tabela 2.4 contam a partir de ${fmtData(dataAnalise)}, a data da análise.` +
      (preco.dataReferencia < dataAnalise
        ? ` O preço depois de ${fmtData(preco.dataReferencia)} até ${fmtData(dataAnalise)} NÃO está na BASE: é desconhecido.`
        : ""),
    ...config.PRECO.avisos
  );
  const variacoes = config.HORIZONTES.map(({ variacao, dias }) => {
    const v = preco.variacoes[variacao];
    const rotulo = dias === 1 ? "1 dia (pregão anterior)" : `${dias} dias`;
    return v ? `${rotulo}: ${fmtPct(v.percentual)} (desde ${fmtData(v.desde)})` : `${rotulo}: SEM DADO`;
  });
  linhas.push(`Variação até ${fmtData(preco.dataReferencia)}: ${variacoes.join(" | ")}`);

  const pontos = preco.pontos || [];
  if (pontos.length > 0) {
    const minimo = pontos.reduce((a, b) => (b.valor < a.valor ? b : a));
    const maximo = pontos.reduce((a, b) => (b.valor > a.valor ? b : a));
    linhas.push(
      `Mínimo e máximo dos últimos 90 dias: ${moeda} ${fmtNumero(minimo.valor)} (${fmtData(minimo.data)}) e ` +
        `${moeda} ${fmtNumero(maximo.valor)} (${fmtData(maximo.data)})`
    );
    const ultimos = pontos.slice(-config.PRECO.pregoesNoHistorico).reverse();
    linhas.push(
      `Últimos ${ultimos.length} pregões (data: ${config.PRECO.unidadeHistorico}): ` +
        ultimos.map((p) => `${fmtData(p.data)}: ${fmtNumero(p.valor)}`).join("; ")
    );
  }
  return linhas.join("\n");
}

// --- 2.2 Curva futura ----------------------------------------------------------------------------------------------

// Sem fonte (CURVA.fonte null), o prompt diz SEM DADO. Quando houver, a curva entra aqui como vencimento -> preço, sem
// leitura do formato. Num ativo sem curva no prompt (CURVA.aplica false, o ouro), o bloco não existe. Num futuro da B3
// com contrato por horizonte (o milho e o café, ADR 0078), cada vencimento com o ajuste e os contratos negociados.
function blocoCurva(curva, config) {
  if (!curva) return config.CURVA.semDado;
  const moeda = config.PRECO.moeda || "US$";
  const liquidez = (v) =>
    v.contratosNegociados === null || v.contratosNegociados === undefined
      ? "contratos negociados: SEM DADO"
      : `${fmtNumero(v.contratosNegociados, 0)} contratos negociados${v.contratosNegociados < config.CURVA.liquidezMinima ? ` (POUCA LIQUIDEZ: menos de ${config.CURVA.liquidezMinima})` : ""}`;
  return [
    `Ajuste de cada vencimento no pregão de ${fmtData(curva.dataReferencia)}, do mais próximo ao mais distante. Só fatos:`,
    "a inclinação da curva não é sinal por si.",
    ...curva.vencimentos.map((v) =>
      v.contratosNegociados === undefined ? `${v.vencimento}: ${moeda} ${fmtNumero(v.preco)}` : `${v.rotulo}: ${moeda} ${fmtNumero(v.preco)} | ${liquidez(v)}`
    ),
    `Fonte: ${config.CURVA.fonte || curva.fonte}`
  ].join("\n");
}

// O contrato de cada horizonte (ADR 0078): o vencimento mais próximo que ainda vale depois da data-alvo, com o preço e as
// variações dele (centro-decisao.service.js::lerPreco, `vencimentoApos`) e a liquidez no dia (da curva). -> { CODIGO:
// { dataAlvo, preco (o de lerPreco), contratosNegociados } }.
async function lerContratosPorHorizonte(serie, { dataAnalise, agora, curva, config }, centro, deps) {
  const lidos = await Promise.all(
    config.HORIZONTES.map(async ({ codigo, dias }) => {
      const dataAlvo = somarDias(dataAnalise, dias);
      const preco = await centro.lerPreco(serie, { data: dataAnalise, agora, vencimentoApos: dataAlvo }, deps);
      const naCurva = preco.disponivel ? curva?.vencimentos.find((v) => v.ticker === preco.contrato?.ticker) : null;
      return [codigo, { dataAlvo, preco, contratosNegociados: naCurva ? naCurva.contratosNegociados : null }];
    })
  );
  return Object.fromEntries(lidos);
}

// A coluna do contrato na tabela 2.4: o contrato do horizonte, o preço, a liquidez e as variações dele (as mesmas
// janelas do bloco 2.1, no contrato do horizonte).
function linhaContratoDoHorizonte(h, porHorizonte, config) {
  const { dataAlvo, preco, contratosNegociados } = porHorizonte[h.codigo];
  if (!preco.disponivel) return `   Contrato: SEM DADO (nenhum vencimento negociado vale até ${fmtData(dataAlvo)})`;
  const moeda = config.PRECO.moeda || "US$";
  const liquidez =
    contratosNegociados === null
      ? "contratos negociados: SEM DADO"
      : `${fmtNumero(contratosNegociados, 0)} contratos negociados no dia${contratosNegociados < config.CURVA.liquidezMinima ? ` (POUCA LIQUIDEZ: menos de ${config.CURVA.liquidezMinima}; preço menos confiável)` : ""}`;
  const variacoes = config.HORIZONTES.map(({ variacao, dias }) => {
    const v = preco.variacoes[variacao];
    return `${dias} dia${dias > 1 ? "s" : ""} ${v ? fmtPct(v.percentual) : "SEM DADO"}`;
  }).join(", ");
  return (
    `   Contrato: ${preco.contrato.rotulo}, negocia depois da data-alvo (${fmtData(dataAlvo)}) | ${moeda} ${fmtNumero(preco.valor)} em ` +
    `${fmtData(preco.dataReferencia)} | ${liquidez} | variação até ${fmtData(preco.dataReferencia)}: ${variacoes}`
  );
}

// --- 2.3 Situação dos dados dos fatores -----------------------------------------------------------------------------

// Só fatos: a referência, a publicação (e se é estimada), a idade e SEM DADO / SEM LEITURA. A defasagem de cada fator
// fica com a IA, pela idade e pela periodicidade: não há tolerância por fator (os fatores misturam séries com
// tolerâncias diferentes) e criar uma seria regra nova.
function situacaoDoFator(fator, dataAnalise) {
  if (fator.tipo === "EVENTO") {
    const semLeitura = !fator.primeiraLeitura || fator.primeiraLeitura > dataAnalise || !fator.ultimaLeitura;
    return {
      situacao: semLeitura ? "SEM_LEITURA" : "COM_LEITURA",
      texto: semLeitura
        ? `fator de evento | SEM LEITURA diária na janela de ${fator.janelaDias} dias`
        : `fator de evento | última leitura em ${fmtData(fator.ultimaLeitura.data)} | ${fator.eventos} evento(s) na janela de ${fator.janelaDias} dias`
    };
  }
  if (!fator.medida) return { situacao: "SEM_DADO", texto: `${fator.periodicidade.toLowerCase()} | SEM DADO até a data` };
  const publicado = diaDaPublicacao(fator.publicadoEm);
  return {
    situacao: fator.publicadoEmEstimado ? "ESTIMADO" : "PUBLICADO",
    idadeDias: diasEntre(fator.observedAt, dataAnalise),
    texto:
      `${fator.periodicidade.toLowerCase()} | referência ${fmtData(fator.observedAt)} | publicado em ${fmtData(publicado)}` +
      `${fator.publicadoEmEstimado ? " (data estimada)" : ""} | idade: ${diasEntre(fator.observedAt, dataAnalise)} dia(s)`
  };
}

// Um fator de CONTEXTO (metodologia-base.js, `contextoDe`) diz de qual fator é contexto: não tem leitura própria.
function blocoCobertura(fatores, dataAnalise) {
  return fatores
    .map(
      (f, i) =>
        `${i + 1}. ${f.codigo} — ${f.nome} (peso ${f.peso})` +
        `${f.contextoDe ? ` | CONTEXTO de ${f.contextoDe}, sem leitura própria` : ""} | ${situacaoDoFator(f, dataAnalise).texto}`
    )
    .join("\n");
}

// --- 2.4 Horizontes e faixas ---------------------------------------------------------------------------------------

// `porHorizonte` (um futuro com contrato por horizonte, ADR 0078): cada horizonte ganha a linha do contrato dele.
function blocoFaixas(config, porHorizonte = null) {
  const linhas = [
    `Variação do ${config.PRECO.descricaoFaixas} entre a data da análise e o fim de cada horizonte (o preço de cada data é o do último pregão até ela).`,
    "Faixas: LATERAL (de -T1 a +T1, sem os extremos) | ALTA_LEVE (de +T1 a +T2) | ALTA_FORTE (+T2 ou mais) |",
    "        BAIXA_LEVE (de -T2 a -T1) | BAIXA_FORTE (-T2 ou menos)"
  ];
  if (porHorizonte) {
    linhas.push(
      "Contrato: cada horizonte é lido e avaliado no vencimento mais próximo que ainda negocia depois da data-alvo (um",
      "contrato que vence antes não tem preço no fim do horizonte). A variação do horizonte é a desse contrato."
    );
  }
  for (const h of config.HORIZONTES) {
    const { t1, t2 } = config.FAIXAS[h.codigo];
    linhas.push(`${h.codigo} (${h.rotulo}, ${h.dias} dia${h.dias > 1 ? "s" : ""}): T1 = ${fmtNumero(t1, 1)}% | T2 = ${fmtNumero(t2, 1)}%`);
    if (porHorizonte) linhas.push(linhaContratoDoHorizonte(h, porHorizonte, config));
  }
  return linhas.join("\n");
}

// --- 2.5 Peso de cada fator por mês --------------------------------------------------------------------------------

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// O calendário de pesos da metodologia (o milho, ADR 0065), como uma tabela fixa: o mesmo texto todo dia, sem cálculo.
// O mês que o especialista não definiu sai com o peso do FEL 1 marcado com "*", ou, se alguém o decidiu depois, com o
// peso decidido marcado com "†" e a origem na nota; o fator sem peso próprio (`papel`) remete às instruções.
function blocoPesos(pesos) {
  const colunas = (f) => {
    if (f.meses) return f.meses.map((m) => (!m ? `${f.pesoFel1}*` : m.decididoPor ? `${m.peso}†` : m.peso));
    if (f.fixo) return Array(12).fill(f.fixo);
    if (f.papel) return Array(12).fill("-");
    return Array(12).fill(`${f.pesoFel1}*`);
  };
  const rotulo = (f) => `${f.sigla} ${f.codigo}`;
  const largura = Math.max(...pesos.fatores.map((f) => rotulo(f).length));
  const linha = (inicio, fel1, celulas) => [inicio.padEnd(largura), fel1.padEnd(5), ...celulas.map((c) => c.padEnd(6))].join(" | ").trimEnd();

  // As condições e as regras de peso de cada fator, como a tela as mostra (metodologia-base.js, `noPrompt`).
  const condicoes = pesos.fatores.flatMap((f) => f.noPrompt.map((texto) => `- ${texto}`));
  const semPeso = pesos.fatores.filter((f) => f.papel && !f.meses && !f.fixo);
  const decididos = [...new Set(pesos.fatores.flatMap((f) => (f.meses || []).filter((m) => m?.decididoPor).map((m) => m.decididoPor)))];
  // As frases das relações entre os fatores, como a tela as mostra; a matriz de símbolos fica só na tela.
  const relacoes = pesos.relacoes ? [...pesos.relacoes.leitura, ...pesos.relacoes.observacoes].map((frase) => `- ${frase}`) : [];

  return [
    `O peso de cada fator em cada mês, da proposta de ${pesos.autoria}. Vale a coluna do mês da data da análise.`,
    "",
    linha("Fator", "FEL 1", MESES),
    ...pesos.fatores.map((f) => linha(rotulo(f), f.pesoFel1, colunas(f))),
    "",
    `* mês que a proposta não define: ${pesos.noPrompt.mesSemDefinicao}.`,
    ...decididos.map((origem) => `† mês que a proposta não define, com o peso decidido depois (não é do especialista): ${origem}.`),
    ...semPeso.map((f) => `- ${f.sigla} ${f.codigo}: sem peso próprio; o papel dele está nas instruções.`),
    ...(condicoes.length ? ["", "Condições e regras de peso (só valem quando a BASE mostra que estão atendidas):", ...condicoes] : []),
    ...(relacoes.length ? ["", "Relações entre os fatores (orientação para o julgamento, não fórmula):", ...relacoes] : [])
  ].join("\n");
}

// --- 3B. Leitura agregada do motor (o café, ADR 0066) -------------------------------------------------------------

const fmtScore = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtNumero(Math.abs(n))}`;
const fmtPeso = (n) => `${Math.round(n * 100)}%`;

// O resultado da agregação em código, em texto: por horizonte, a leitura, o score, a cobertura e a confiança, a
// contribuição de cada família e os motivos. No cabeçalho, as regras da agregação, com as mesmas frases que a tela de
// metodologia mostra (agregacao-cafe.js::ORIGEM_DAS_REGRAS).
function blocoAgregacao(agregacao) {
  const familia = (f) => {
    if (!f.ativa) return `${f.codigo} inativa (${f.detalhe.motivo})`;
    const membros = f.detalhe?.membros ? ` [${f.detalhe.membros.join(" + ")}]` : "";
    const valor = f.ausente ? "SEM DADO" : `score ${fmtScore(f.score)}, contribuição ${fmtScore(f.contribuicao)}`;
    const oferta = f.detalhe?.membros
      ? `; F1/F2 ${f.detalhe.baseF1F2 === null ? "sem dado" : fmtScore(f.detalhe.baseF1F2)}${f.detalhe.conflitoF1F2 ? " (em conflito)" : ""}, F3 ${f.detalhe.papelF3}`
      : "";
    return `${f.codigo} ${fmtPeso(f.pesoEfetivo)}${membros}: ${valor}${oferta}`;
  };
  const horizonte = (h) =>
    [
      `${h.horizonte}: ${h.faixa ?? h.tendencia} | S = ${fmtScore(h.score)} | cobertura ${fmtPeso(h.cobertura)} | confiança ${h.confianca ?? "-"}`,
      ...h.familias.map((f) => `  - ${familia(f)}`),
      `  - CAFE_FUNDOS (modificador): ${h.fundos.papel}${h.fundos.motivo ? ` (${h.fundos.motivo})` : ""}`,
      ...(h.conflito ? [`  - conflito entre ${h.conflito.familias.join(" e ")}`] : []),
      ...(h.motivosConfianca.length ? [`  - motivos: ${h.motivosConfianca.join("; ")}`] : [])
    ].join("\n");
  return [
    `Agregação ${agregacao.versao}: proposta do FinMind, sem backtest, a validar pelo Comitê. As regras:`,
    ...agregacao.regrasNoPrompt.map((regra) => `- ${regra}`),
    "",
    "O resultado em cada horizonte:",
    ...agregacao.horizontes.map(horizonte)
  ].join("\n");
}

// O que da agregação fica gravado na entrada (o Centro de Decisão e a Qualidade da IA leem daí): a leitura de cada
// horizonte e o que a formou, sem os textos das regras (estão na versão).
function agregacaoParaEntrada(agregacao) {
  return {
    versao: agregacao.versao,
    situacao: agregacao.situacao,
    horizontes: agregacao.horizontes.map((h) => ({
      horizonte: h.horizonte,
      tendencia: h.tendencia,
      faixa: h.faixa,
      confianca: h.confianca,
      score: h.score,
      cobertura: h.cobertura,
      conflito: h.conflito,
      fundos: h.fundos.papel,
      motivosConfianca: h.motivosConfianca,
      familias: h.familias.map((f) => ({
        codigo: f.codigo,
        ativa: f.ativa,
        pesoEfetivo: f.pesoEfetivo,
        score: f.score,
        ausente: f.ausente,
        contribuicao: f.contribuicao
      }))
    }))
  };
}

// --- Montagem ------------------------------------------------------------------------------------------------------

// A leitura do motor de um fator calculado, como foi ao prompt. Um fator de CONTEXTO não leva pressão nem intensidade
// (o texto dele também não, factors/base/texto-prompt.js): só o papel e a tendência.
function leituraDoFator(f) {
  if (!f.decisao) return null;
  if (f.contextoDe) return { papel: "CONTEXTO", contextoDe: f.contextoDe, tendencia: f.decisao.tendencia };
  return { pressao: f.decisao.direcao, intensidade: f.decisao.intensidade, tendencia: f.decisao.tendencia };
}

// O que entrou no prompt, estruturado: para guardar com a resposta da IA e reconstituir a entrada (ADR 0010).
// O contrato de um horizonte, como fica gravado (ADR 0078): a avaliação usa o `seriesCode`, e a Persistência da Qualidade
// da IA, as variações que a IA recebeu desse contrato.
function contratoParaEntrada(doHorizonte) {
  if (!doHorizonte) return {};
  const { preco, contratosNegociados } = doHorizonte;
  if (!preco.disponivel) return { contrato: null };
  return {
    contrato: preco.contrato,
    seriesCode: preco.seriesCode,
    dataReferencia: preco.dataReferencia,
    valor: preco.valor,
    contratosNegociados,
    variacoes: preco.variacoes
  };
}

function entradaEstruturada({ simulacao, preco, ptax, dataAnalise, config, agregacao = null, curva = null, porHorizonte = null }) {
  return {
    // A leitura agregada do motor que foi ao prompt (o café, ADR 0066).
    ...(agregacao ? { agregacaoMotor: agregacaoParaEntrada(agregacao) } : {}),
    precoReferencia: preco.disponivel
      ? {
          serie: config.PRECO.serie,
          // A série exata no banco: o realizado e a avaliação a usam sem depender da configuração futura (ADR 0064).
          ...(preco.seriesCode ? { seriesCode: preco.seriesCode } : {}),
          ...(preco.contrato ? { contrato: preco.contrato } : {}),
          dataReferencia: preco.dataReferencia,
          valor: preco.valor,
          publicadoEm: preco.publicadoEm,
          publicadoEmEstimado: preco.publicadoEmEstimado,
          defasado: preco.defasada,
          variacoes: preco.variacoes,
          ...(config.PRECO.emReais ? { ptax } : {})
        }
      : null,
    curva,
    referenciaHorizontes: config.REFERENCIA_HORIZONTES,
    horizontes: config.HORIZONTES.map(({ codigo, dias }) => ({
      codigo,
      dias,
      ...config.FAIXAS[codigo],
      ...(porHorizonte ? contratoParaEntrada(porHorizonte[codigo]) : {})
    })),
    fatores: simulacao.fatores.map((f) => ({
      fator: f.codigo,
      tipo: f.tipo,
      peso: f.peso,
      tipoFel1: f.tipoFel1,
      situacaoRegra: f.situacaoRegra,
      ...(f.contextoDe ? { contextoDe: f.contextoDe } : {}),
      ...situacaoDoFator(f, dataAnalise),
      ...(f.tipo === "CALCULADO"
        ? {
            factorId: f.factorId,
            factorVersion: f.factorVersion,
            parametros: f.parametros,
            origemParametros: f.origemParametros,
            dataReferencia: f.observedAt,
            publicadoEm: f.publicadoEm,
            medida: f.medida,
            leitura: leituraDoFator(f),
            // Calculado e com eventos (o milho, ADR 0058): os eventos da janela que foram ao prompt.
            ...(f.eventos !== undefined ? { janelaDias: f.janelaDias, eventos: f.eventos, ultimaLeitura: f.ultimaLeitura } : {})
          }
        : { janelaDias: f.janelaDias, eventos: f.eventos, ultimaLeitura: f.ultimaLeitura })
    }))
  };
}

// GET /ativos/:ativo/metodologia/prompt-diario?data= : o prompt da data (hoje, sem `data`), com o que se sabia até o
// fim dela. Ativo sem leitura diária: 404.
async function montarPromptDiario(ativo, { data } = {}, deps = {}) {
  const codigo = String(ativo || "").trim().toUpperCase();
  const config = configuracaoDoAtivo(codigo);
  const agora = deps.agora || new Date();
  const dataAnalise = data || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

  const metodologia = deps.metodologiaAtivoService || metodologiaAtivoService;
  const centro = deps.centroDecisaoService || centroDecisaoService;
  const serie = centro.ATIVOS.find((a) => a.codigo === codigo).series.find((s) => s.codigo === config.PRECO.serie);
  const [{ simulacao }, preco] = await Promise.all([
    metodologia.simularFatores(codigo, { data: dataAnalise }, deps),
    centro.lerPreco(serie, { data: dataAnalise, agora }, deps)
  ]);
  const ptax = config.PRECO.emReais && preco.disponivel ? await lerPtax(preco.dataReferencia, deps) : null;
  // A curva e o contrato de cada horizonte (o milho e o café, ADR 0078).
  const curva = config.CURVA.porHorizonte && serie.futuro ? await centro.lerCurva(serie.futuro, { data: dataAnalise, agora }, deps) : null;
  const porHorizonte =
    config.CURVA.porHorizonte && serie.futuro ? await lerContratosPorHorizonte(serie, { dataAnalise, agora, curva, config }, centro, deps) : null;
  // A agregação em código (o café, ADR 0066), sobre os mesmos fatores do prompt.
  const agregacao = config.AGREGACAO ? config.AGREGACAO.calcular(simulacao.fatores, { dataAnalise }) : null;

  const carregado = carregarPrompt(config.ARQUIVO_PROMPT, {
    data_analise: fmtData(dataAnalise),
    versao_metodologia: simulacao.versaoMetodologia,
    versao_configuracao: `${config.NOME} v${config.VERSAO}`,
    bloco_preco: blocoPreco(preco, dataAnalise, config, ptax),
    ...(config.CURVA.aplica ? { bloco_curva: blocoCurva(curva, config) } : {}),
    bloco_cobertura: blocoCobertura(simulacao.fatores, dataAnalise),
    bloco_faixas: blocoFaixas(config, porHorizonte),
    ...(simulacao.pesos ? { bloco_pesos: blocoPesos(simulacao.pesos) } : {}),
    blocos_fatores: simulacao.fatores.filter((f) => f.textoPrompt).map((f) => f.textoPrompt).join("\n\n"),
    ...(agregacao ? { bloco_agregacao: blocoAgregacao(agregacao) } : {})
  });

  const hashEntrada = crypto.createHash("sha256").update(`${carregado.instrucaoDoSistema}\n\n${carregado.prompt}`).digest("hex");
  return {
    promptDiario: {
      ativo: codigo,
      dataAnalise,
      versaoPrompt: carregado.versao,
      versaoMetodologia: simulacao.versaoMetodologia,
      versaoConfiguracao: config.VERSAO,
      hashEntrada,
      instrucaoDoSistema: carregado.instrucaoDoSistema,
      prompt: carregado.prompt,
      entrada: entradaEstruturada({ simulacao, preco, ptax, dataAnalise, config, agregacao, curva, porHorizonte })
    }
  };
}

module.exports = {
  montarPromptDiario,
  blocoPreco,
  blocoCurva,
  lerContratosPorHorizonte,
  blocoCobertura,
  blocoFaixas,
  blocoPesos,
  blocoAgregacao,
  agregacaoParaEntrada,
  situacaoDoFator,
  lerPtax
};
