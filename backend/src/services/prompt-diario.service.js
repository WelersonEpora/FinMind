"use strict";

const crypto = require("node:crypto");
const { carregarPrompt } = require("../ai/carregar-prompt");
const { NotFoundError } = require("../shared/errors");
const config = require("../shared/analise-diaria-petroleo");
const metodologiaAtivoService = require("./metodologia-ativo.service");
const centroDecisaoService = require("./centro-decisao.service");

// Prompt diário de análise do petróleo (ADR 0051): monta, para uma data, o prompt que a IA de tendência receberia,
// com o que se sabia até o fim daquele dia. Não chama nenhuma IA: o prompt é gerado e mostrado (as propostas de fator
// não alimentam a IA enquanto o envio não for decidido, CLAUDE.md e ADR 0050).
//
// Reaproveita o que já existe, sem lógica própria de cálculo:
//   - os 10 fatores na data: metodologia-ativo.service.js::simularFatores (os textos A/B/C/D e os blocos de evento);
//   - o preço do WTI: centro-decisao.service.js::lerPreco (point-in-time, variações de 1, 7, 30 e 90 dias);
//   - o texto fixo e a versão: ai/prompts/petroleo-analise-diaria.md, por carregarPrompt (o mesmo da geopolítica);
//   - os horizontes e as faixas: shared/analise-diaria-petroleo.js (configuração explícita, versionada).
// O que a IA recebeu fica reconstituível pela versão do prompt, da metodologia e da configuração, pelos parâmetros de
// cada fator e pelo hash da entrada (ADR 0010); a gravação de cada execução vem com o envio à IA.

const ARQUIVO_PROMPT = "petroleo-analise-diaria.md";
const ATIVOS_COM_PROMPT = ["PETROLEO"];

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

function blocoPreco(preco, dataAnalise) {
  if (!preco.disponivel) return "Preço do WTI: SEM DADO até a data da análise.";
  const publicado = diaDaPublicacao(preco.publicadoEm);
  const linhas = [
    `Série: ${preco.nome}, ${preco.unidade} | Fonte: ${preco.fonte}`,
    `Último preço: US$ ${fmtNumero(preco.valor)} em ${fmtData(preco.dataReferencia)} | publicado em ${fmtData(publicado)}` +
      `${preco.publicadoEmEstimado ? " (data estimada)" : ""} | ${preco.diasSemDado} dia(s) antes da data da análise` +
      `${preco.defasada ? " | DEFASADO: passou da tolerância da série" : ""}`,
    // Os horizontes contam da data da análise (config.REFERENCIA_HORIZONTES, ADR 0052): o intervalo entre o último
    // preço e ela é dito como desconhecido, para a IA não o estimar.
    `Os horizontes da tabela 2.4 contam a partir de ${fmtData(dataAnalise)}, a data da análise.` +
      (preco.dataReferencia < dataAnalise
        ? ` O preço depois de ${fmtData(preco.dataReferencia)} até ${fmtData(dataAnalise)} NÃO está na BASE: é desconhecido.`
        : ""),
    "Aviso: a EIA publica os preços diários uma vez por semana; o último preço pode não refletir fatos posteriores a ele."
  ];
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
      `Mínimo e máximo dos últimos 90 dias: US$ ${fmtNumero(minimo.valor)} (${fmtData(minimo.data)}) e ` +
        `US$ ${fmtNumero(maximo.valor)} (${fmtData(maximo.data)})`
    );
    const ultimos = pontos.slice(-config.PRECO.pregoesNoHistorico).reverse();
    linhas.push(`Últimos ${ultimos.length} pregões (data: US$/barril): ${ultimos.map((p) => `${fmtData(p.data)}: ${fmtNumero(p.valor)}`).join("; ")}`);
  }
  return linhas.join("\n");
}

// --- 2.2 Curva futura ----------------------------------------------------------------------------------------------

// Sem fonte (CURVA.fonte null), o prompt diz SEM DADO. Quando houver, a curva entra aqui como vencimento -> preço, sem
// leitura do formato.
function blocoCurva(curva) {
  if (!curva) {
    return "SEM DADO: não há fonte da curva futura do WTI na base (o futuro é pago; a EIA deixou de publicar os vencimentos da NYMEX em 2024).";
  }
  return [
    ...curva.vencimentos.map((v) => `${v.vencimento}: US$ ${fmtNumero(v.preco)}`),
    `Fonte: ${curva.fonte} | referência: ${fmtData(curva.dataReferencia)}`
  ].join("\n");
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

function blocoCobertura(fatores, dataAnalise) {
  return fatores
    .map((f, i) => `${i + 1}. ${f.codigo} — ${f.nome} (peso ${f.peso}) | ${situacaoDoFator(f, dataAnalise).texto}`)
    .join("\n");
}

// --- 2.4 Horizontes e faixas ---------------------------------------------------------------------------------------

function blocoFaixas() {
  const linhas = [
    "Variação do WTI à vista entre a data da análise e o fim de cada horizonte (o preço de cada data é o do último pregão até ela).",
    "Faixas: LATERAL (de -T1 a +T1, sem os extremos) | ALTA_LEVE (de +T1 a +T2) | ALTA_FORTE (+T2 ou mais) |",
    "        BAIXA_LEVE (de -T2 a -T1) | BAIXA_FORTE (-T2 ou menos)"
  ];
  for (const h of config.HORIZONTES) {
    const { t1, t2 } = config.FAIXAS[h.codigo];
    linhas.push(`${h.codigo} (${h.rotulo}, ${h.dias} dia${h.dias > 1 ? "s" : ""}): T1 = ${fmtNumero(t1, 1)}% | T2 = ${fmtNumero(t2, 1)}%`);
  }
  return linhas.join("\n");
}

// --- Montagem ------------------------------------------------------------------------------------------------------

// O que entrou no prompt, estruturado: para guardar com a resposta da IA e reconstituir a entrada (ADR 0010).
function entradaEstruturada({ simulacao, preco, dataAnalise }) {
  return {
    precoReferencia: preco.disponivel
      ? {
          serie: config.PRECO.serie,
          dataReferencia: preco.dataReferencia,
          valor: preco.valor,
          publicadoEm: preco.publicadoEm,
          publicadoEmEstimado: preco.publicadoEmEstimado,
          defasado: preco.defasada,
          variacoes: preco.variacoes
        }
      : null,
    curva: null,
    referenciaHorizontes: config.REFERENCIA_HORIZONTES,
    horizontes: config.HORIZONTES.map(({ codigo, dias }) => ({ codigo, dias, ...config.FAIXAS[codigo] })),
    fatores: simulacao.fatores.map((f) => ({
      fator: f.codigo,
      tipo: f.tipo,
      peso: f.peso,
      tipoFel1: f.tipoFel1,
      situacaoRegra: f.situacaoRegra,
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
            leitura: f.decisao ? { pressao: f.decisao.direcao, intensidade: f.decisao.intensidade, tendencia: f.decisao.tendencia } : null
          }
        : { janelaDias: f.janelaDias, eventos: f.eventos, ultimaLeitura: f.ultimaLeitura })
    }))
  };
}

// GET /ativos/:ativo/metodologia/prompt-diario?data= : o prompt da data (hoje, sem `data`), com o que se sabia até o
// fim dela.
async function montarPromptDiario(ativo, { data } = {}, deps = {}) {
  const codigo = String(ativo || "").trim().toUpperCase();
  if (!ATIVOS_COM_PROMPT.includes(codigo)) throw new NotFoundError("Não há prompt diário para este ativo.");
  const agora = deps.agora || new Date();
  const dataAnalise = data || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

  const metodologia = deps.metodologiaAtivoService || metodologiaAtivoService;
  const centro = deps.centroDecisaoService || centroDecisaoService;
  const serie = centro.ATIVOS.find((a) => a.codigo === codigo).series.find((s) => s.codigo === config.PRECO.serie);
  const [{ simulacao }, preco] = await Promise.all([
    metodologia.simularFatores(codigo, { data: dataAnalise }, deps),
    centro.lerPreco(serie, { data: dataAnalise, agora }, deps)
  ]);

  const carregado = carregarPrompt(ARQUIVO_PROMPT, {
    data_analise: fmtData(dataAnalise),
    versao_metodologia: simulacao.versaoMetodologia,
    versao_configuracao: `analise-diaria-petroleo v${config.VERSAO}`,
    bloco_preco: blocoPreco(preco, dataAnalise),
    bloco_curva: blocoCurva(null),
    bloco_cobertura: blocoCobertura(simulacao.fatores, dataAnalise),
    bloco_faixas: blocoFaixas(),
    blocos_fatores: simulacao.fatores.filter((f) => f.textoPrompt).map((f) => f.textoPrompt).join("\n\n")
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
      entrada: entradaEstruturada({ simulacao, preco, dataAnalise })
    }
  };
}

module.exports = { montarPromptDiario, blocoPreco, blocoCurva, blocoCobertura, blocoFaixas, situacaoDoFator };
