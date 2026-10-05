"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { montarPromptDiario, situacaoDoFator } = require("./prompt-diario.service");
const config = require("../shared/analise-diaria-petroleo");
const { ATIVOS } = require("./centro-decisao.service");

const CALCULADO = {
  codigo: "PETROLEO_ESTOQUES_EIA",
  nome: "Estoques de petróleo dos EUA (EIA)",
  peso: "Alto",
  tipoFel1: "Fundamentalista",
  situacaoRegra: "PROPOSTA",
  tipo: "CALCULADO",
  observedAt: "2026-09-25",
  publicadoEm: "2026-09-30T15:30:00Z",
  publicadoEmEstimado: true,
  periodicidade: "SEMANAL",
  factorId: "estoques_petroleo_eia",
  factorVersion: 1,
  parametros: { limiarModeradoPct: 3 },
  origemParametros: null,
  medida: { rotulo: "Desvio (B)", valor: 1.86, unidade: "%" },
  decisao: { direcao: "NEUTRA", intensidade: "FRACA", tendencia: "ESTAVEL" },
  textoPrompt: "FATOR — Estoques de petróleo dos EUA (EIA) — PETRÓLEO (peso Alto)\nCódigo: PETROLEO_ESTOQUES_EIA"
};
const SEM_DADO = { ...CALCULADO, codigo: "PETROLEO_OFERTA_NAO_OPEP", nome: "Oferta não-OPEP", periodicidade: "MENSAL", medida: null, decisao: null, textoPrompt: "FATOR — Oferta" };
const EVENTO = {
  codigo: "PETROLEO_GEOPOLITICA",
  nome: "Geopolítica e conflitos",
  peso: "Alto",
  tipoFel1: "Geopolítico",
  situacaoRegra: "PROPOSTA",
  tipo: "EVENTO",
  eventos: 2,
  janelaDias: 7,
  primeiraLeitura: "2026-10-02",
  ultimaLeitura: { data: "2026-10-02", nivel: "RELEVANTE" },
  textoPrompt: "EVENTOS DO FATOR — Geopolítica\nCódigo: PETROLEO_GEOPOLITICA"
};

const PRECO = {
  disponivel: true,
  nome: "Brent à vista (EIA)",
  unidade: "US$/barril",
  fonte: "EIA - preços à vista (spot)",
  valor: 96.16,
  dataReferencia: "2026-09-29",
  publicadoEm: "2026-09-30T15:30:00Z",
  publicadoEmEstimado: true,
  diasSemDado: 4,
  defasada: false,
  variacoes: {
    d1: { percentual: -3.23, desde: "2026-09-28" },
    d7: { percentual: -0.26, desde: "2026-09-22" },
    d30: { percentual: 13.7, desde: "2026-08-28" },
    d90: null
  },
  pontos: [
    { data: "2026-09-28", valor: 99.37 },
    { data: "2026-09-29", valor: 96.16 }
  ]
};

function deps({ fatores = [EVENTO, CALCULADO, SEM_DADO], preco = PRECO } = {}) {
  const chamadas = {};
  return {
    chamadas,
    agora: new Date("2026-10-03T15:00:00Z"),
    metodologiaAtivoService: {
      async simularFatores(ativo, opcoes) {
        chamadas.simular = [ativo, opcoes.data];
        return { simulacao: { ativo, data: opcoes.data, versaoMetodologia: "petroleo-v1 (2026-10-02)", fatores } };
      }
    },
    centroDecisaoService: {
      ATIVOS,
      async lerPreco(serie, opcoes) {
        chamadas.preco = [serie.codigo, opcoes.data];
        return preco;
      }
    }
  };
}

test("os blocos fixos (1, 4, 5 e 6) vão na instrução do sistema; a base e a leitura do motor (2 e 3), no prompt", async () => {
  const { promptDiario: p } = await montarPromptDiario("petroleo", { data: "2026-10-03" }, deps());
  for (const bloco of ["[1. PAPEL E OBJETIVO]", "[4. COMO ANALISAR]", "[5. LIMITES]", "[6. FORMATO DA RESPOSTA — JSON]"]) {
    assert.ok(p.instrucaoDoSistema.includes(bloco), bloco);
  }
  for (const bloco of ["[2. BASE", "2.1 PREÇO DO BRENT", "2.2 CURVA FUTURA", "2.3 SITUAÇÃO DOS DADOS", "2.4 HORIZONTES E FAIXAS", "[3. LEITURA DO MOTOR"]) {
    assert.ok(p.prompt.includes(bloco), bloco);
  }
  assert.equal(p.versaoPrompt, "petroleo-analise-diaria@3");
  assert.equal(p.versaoMetodologia, "petroleo-v1 (2026-10-02)");
  assert.equal(p.versaoConfiguracao, config.VERSAO);
  assert.match(p.hashEntrada, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(p.prompt, /\{\{/);
});

test("a instrução não esconde números da metodologia nem recomenda: as faixas vêm da configuração, no bloco 2.4", async () => {
  const { promptDiario: p } = await montarPromptDiario("PETROLEO", { data: "2026-10-03" }, deps());
  assert.doesNotMatch(p.instrucaoDoSistema, /\d+(,\d+)?\s?%/);
  assert.match(p.instrucaoDoSistema, /leitura de tendência, não recomendação/);
  assert.match(p.instrucaoDoSistema, /Não faça síntese nem conclusão entre os horizontes/);
  for (const h of config.HORIZONTES) {
    const { t1, t2 } = config.FAIXAS[h.codigo];
    const fmt = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    assert.ok(p.prompt.includes(`${h.codigo} (${h.rotulo}, ${h.dias} dia`), h.codigo);
    assert.ok(p.prompt.includes(`T1 = ${fmt(t1)}% | T2 = ${fmt(t2)}%`), `${h.codigo} faixas`);
  }
});

test("a base traz o preço do Brent com as datas e as variações dos horizontes, e a curva sem fonte como SEM DADO", async () => {
  const d = deps();
  const { promptDiario: p } = await montarPromptDiario("PETROLEO", { data: "2026-10-03" }, d);
  assert.deepEqual(d.chamadas.preco, ["BRENT", "2026-10-03"]);
  assert.deepEqual(d.chamadas.simular, ["PETROLEO", "2026-10-03"]);
  assert.match(p.prompt, /Último preço: US\$ 96,16 em 29\/09\/2026 \| publicado em 30\/09\/2026 \(data estimada\) \| 4 dia\(s\) antes da data da análise/);
  assert.match(
    p.prompt,
    /Os horizontes da tabela 2\.4 contam a partir de 03\/10\/2026, a data da análise\. O preço depois de 29\/09\/2026 até 03\/10\/2026 NÃO está na BASE: é desconhecido\./
  );
  assert.match(p.prompt, /1 dia \(pregão anterior\): -3,23% \(desde 28\/09\/2026\) \| 7 dias: -0,26% .* \| 90 dias: SEM DADO/);
  assert.match(p.prompt, /Últimos 2 pregões \(data: US\$\/barril\): 29\/09\/2026: 96,16; 28\/09\/2026: 99,37/);
  assert.match(p.prompt, /2\.2 CURVA FUTURA DO BRENT .*\nSEM DADO: não há fonte da curva futura do Brent/);
  assert.equal(p.entrada.curva, null);
  assert.equal(p.entrada.precoReferencia.dataReferencia, "2026-09-29");
});

test("sem preço na data, o bloco diz SEM DADO", async () => {
  const { promptDiario: p } = await montarPromptDiario("PETROLEO", { data: "2026-10-03" }, deps({ preco: { disponivel: false } }));
  assert.match(p.prompt, /2\.1 PREÇO DO BRENT .*\nPreço do Brent: SEM DADO até a data da análise\./);
  assert.equal(p.entrada.precoReferencia, null);
});

test("a situação dos dados só traz fatos: referência, publicação, idade, SEM DADO e SEM LEITURA", async () => {
  const { promptDiario: p } = await montarPromptDiario("PETROLEO", { data: "2026-10-03" }, deps());
  assert.match(p.prompt, /1\. PETROLEO_GEOPOLITICA — Geopolítica e conflitos \(peso Alto\) \| fator de evento \| última leitura em 02\/10\/2026 \| 2 evento\(s\) na janela de 7 dias/);
  assert.match(p.prompt, /2\. PETROLEO_ESTOQUES_EIA — .* \| semanal \| referência 25\/09\/2026 \| publicado em 30\/09\/2026 \(data estimada\) \| idade: 8 dia\(s\)/);
  assert.match(p.prompt, /3\. PETROLEO_OFERTA_NAO_OPEP — .* \| mensal \| SEM DADO até a data/);
  assert.doesNotMatch(p.prompt, /DEFASADO/);
  assert.equal(situacaoDoFator({ ...EVENTO, primeiraLeitura: null, ultimaLeitura: null }, "2026-10-03").situacao, "SEM_LEITURA");
  assert.equal(situacaoDoFator({ ...EVENTO, primeiraLeitura: "2026-10-02" }, "2022-03-15").situacao, "SEM_LEITURA");
});

test("a leitura do motor junta os blocos dos fatores na ordem do catálogo; a entrada estruturada guarda regra, versão e leitura", async () => {
  const { promptDiario: p } = await montarPromptDiario("PETROLEO", { data: "2026-10-03" }, deps());
  const leitura = p.prompt.slice(p.prompt.indexOf("[3. LEITURA DO MOTOR"));
  assert.ok(leitura.indexOf("EVENTOS DO FATOR — Geopolítica") < leitura.indexOf("FATOR — Estoques"));
  const estoques = p.entrada.fatores.find((f) => f.fator === "PETROLEO_ESTOQUES_EIA");
  assert.equal(estoques.factorId, "estoques_petroleo_eia");
  assert.equal(estoques.situacaoRegra, "PROPOSTA");
  assert.deepEqual(estoques.leitura, { pressao: "NEUTRA", intensidade: "FRACA", tendencia: "ESTAVEL" });
  assert.equal(p.entrada.fatores.find((f) => f.fator === "PETROLEO_GEOPOLITICA").janelaDias, 7);
  assert.deepEqual(p.entrada.horizontes.map((h) => h.codigo), ["IMEDIATO", "CURTO", "MEDIO", "LONGO"]);
  assert.equal(p.entrada.referenciaHorizontes, "DATA_DA_ANALISE");
});

test("o mesmo dia e a mesma base dão o mesmo hash; outro ativo não tem prompt diário", async () => {
  const a = (await montarPromptDiario("PETROLEO", { data: "2026-10-03" }, deps())).promptDiario.hashEntrada;
  const b = (await montarPromptDiario("PETROLEO", { data: "2026-10-03" }, deps())).promptDiario.hashEntrada;
  assert.equal(a, b);
  await assert.rejects(montarPromptDiario("SOJA", {}, deps()), (err) => err.statusCode === 404);
});

test("faixas: quatro horizontes com T1 < T2; a classificação do realizado segue as bordas da tabela 2.4", () => {
  assert.deepEqual(config.HORIZONTES.map((h) => [h.codigo, h.dias]), [["IMEDIATO", 1], ["CURTO", 7], ["MEDIO", 30], ["LONGO", 90]]);
  for (const h of config.HORIZONTES) assert.ok(config.FAIXAS[h.codigo].t1 < config.FAIXAS[h.codigo].t2, h.codigo);
  const { t1, t2 } = config.FAIXAS.CURTO;
  assert.equal(config.classificarVariacao(0, "CURTO"), "LATERAL");
  assert.equal(config.classificarVariacao(t1 - 0.01, "CURTO"), "LATERAL");
  assert.equal(config.classificarVariacao(t1, "CURTO"), "ALTA_LEVE");
  assert.equal(config.classificarVariacao(-t2, "CURTO"), "BAIXA_FORTE");
  assert.equal(config.classificarVariacao(null, "CURTO"), null);
  for (const codigo of config.CODIGOS_FAIXA) assert.ok(config.TENDENCIA_DA_FAIXA[codigo]);
});

test("ouro (ADR 0054): o GLD com o contrato e o preço em reais pela PTAX, sem bloco de curva; a inflação vai como contexto", async () => {
  const precoGld = {
    ...PRECO,
    nome: "Futuro B3 (GLD)",
    unidade: "US$/oz",
    fonte: "B3 - Up2Data",
    seriesCode: "B3.GLD.GLDZ26.SETTLE",
    contrato: { ticker: "GLDZ26", rotulo: "GLDZ26 (dez/2026)" },
    valor: 4177.5,
    dataReferencia: "2026-10-02",
    diasSemDado: 1
  };
  const inflacao = {
    ...CALCULADO,
    codigo: "OURO_INFLACAO",
    nome: "Inflação dos EUA (CPI) contra a meta do Fed",
    contextoDe: "OURO_JUROS_REAIS",
    decisao: { direcao: "ALTA", intensidade: "MODERADA", tendencia: "DESACELERANDO" },
    textoPrompt: "FATOR — Inflação"
  };
  const d = deps({ fatores: [inflacao], preco: precoGld });
  const ptaxPedidas = [];
  d.marketQuoteRepository = {
    async buscarHistorico(filtros) {
      ptaxPedidas.push(filtros);
      return { registros: [{ reference_date: "2026-10-02", value: "5.4000" }], total: 1 };
    }
  };
  const { promptDiario: p } = await montarPromptDiario("OURO", { data: "2026-10-03" }, d);

  assert.deepEqual(d.chamadas.preco, ["GLD", "2026-10-03"]);
  assert.equal(ptaxPedidas[0].dataFim, "2026-10-02");
  assert.equal(p.versaoPrompt, "ouro-analise-diaria@1");
  assert.match(p.prompt, /Contrato: GLDZ26 \(dez\/2026\), o vencimento mais próximo negociado/);
  assert.match(p.prompt, /Em reais: R\$ 22\.558,50 por onça, pela PTAX de venda de 02\/10\/2026 \(R\$ 5,4000 por US\$\)/);
  assert.match(p.prompt, /Últimos 2 pregões \(data: US\$\/onça\)/);
  assert.match(p.prompt, /2\.2 CURVA FUTURA — não se aplica ao ouro/);
  assert.doesNotMatch(p.prompt, /SEM DADO: não há fonte da curva/);
  assert.match(p.prompt, /IMEDIATO \(Imediato, 1 dia\): T1 = 0,4% \| T2 = 1,2%/);
  assert.match(p.prompt, /1\. OURO_INFLACAO — .* \| CONTEXTO de OURO_JUROS_REAIS, sem leitura própria \|/);
  assert.match(p.instrucaoDoSistema, /Nunca o liste em "fatoresAFavor" nem em "fatoresContra"/);
  assert.doesNotMatch(p.instrucaoDoSistema, /\d+(,\d+)?\s?%/);

  const entrada = p.entrada.fatores[0];
  assert.equal(entrada.contextoDe, "OURO_JUROS_REAIS");
  assert.deepEqual(entrada.leitura, { papel: "CONTEXTO", contextoDe: "OURO_JUROS_REAIS", tendencia: "DESACELERANDO" });
  assert.deepEqual(p.entrada.precoReferencia.ptax, { data: "2026-10-02", valor: 5.4 });
  assert.equal(p.entrada.precoReferencia.contrato.ticker, "GLDZ26");
  // A série exata vai com a leitura (ADR 0064): o realizado não depende da configuração futura.
  assert.equal(p.entrada.precoReferencia.seriesCode, "B3.GLD.GLDZ26.SETTLE");

  await assert.rejects(montarPromptDiario("SOJA", { data: "2026-10-03" }, deps()), /Não há prompt diário/);
});

test("milho (ADR 0058): o CCM em reais, sem PTAX e sem bloco de curva; os eventos usados como chegam", async () => {
  const precoCcm = {
    ...PRECO,
    nome: "Futuro B3 (CCM)",
    unidade: "R$/saca",
    fonte: "B3 - Up2Data",
    contrato: { ticker: "CCMX26", rotulo: "CCMX26 (nov/2026)" },
    valor: 71.67,
    dataReferencia: "2026-10-02",
    diasSemDado: 2
  };
  const d = deps({ fatores: [{ ...CALCULADO, codigo: "MILHO_FUNDOS", textoPrompt: "FATOR — Fundos" }], preco: precoCcm });
  d.marketQuoteRepository = {
    async buscarHistorico() {
      throw new Error("o milho não converte pela PTAX");
    }
  };
  const { promptDiario: p } = await montarPromptDiario("MILHO", { data: "2026-10-03" }, d);

  assert.deepEqual(d.chamadas.preco, ["CCM", "2026-10-03"]);
  assert.equal(p.versaoPrompt, "milho-analise-diaria@1");
  assert.match(p.prompt, /Contrato: CCMX26 \(nov\/2026\), o vencimento mais próximo negociado/);
  assert.match(p.prompt, /Último preço: R\$ 71,67 em 02\/10\/2026/);
  assert.doesNotMatch(p.prompt, /US\$|Em reais:/);
  assert.match(p.prompt, /2\.2 CURVA FUTURA — fora desta versão/);
  // As faixas da v2, recalibradas no próprio CCM (ADR 0058, adendo).
  assert.match(p.prompt, /LONGO \(Longo, 90 dias\): T1 = 3,0% \| T2 = 8,0%/);
  assert.match(p.instrucaoDoSistema, /não passou por validação humana/);
  assert.doesNotMatch(p.instrucaoDoSistema, /\d+(,\d+)?\s?%/);
  assert.equal(p.entrada.precoReferencia.serie, "CCM");
  assert.equal(p.entrada.precoReferencia.ptax, undefined);
});

test("café (ADR 0062): o ICF com o contrato e o preço em reais por saca, sem bloco de curva", async () => {
  const precoIcf = {
    ...PRECO,
    nome: "Futuro B3 (ICF)",
    unidade: "US$/saca",
    fonte: "B3 - Up2Data",
    contrato: { ticker: "ICFZ26", rotulo: "ICFZ26 (dez/2026)" },
    valor: 351.9,
    dataReferencia: "2026-10-02",
    diasSemDado: 1
  };
  const d = deps({ fatores: [{ ...CALCULADO, codigo: "CAFE_FUNDOS", textoPrompt: "FATOR — Fundos" }], preco: precoIcf });
  d.marketQuoteRepository = {
    async buscarHistorico() {
      return { registros: [{ reference_date: "2026-10-02", value: "5.2000" }], total: 1 };
    }
  };
  const { promptDiario: p } = await montarPromptDiario("CAFE", { data: "2026-10-03" }, d);

  assert.deepEqual(d.chamadas.preco, ["ICF", "2026-10-03"]);
  assert.equal(p.versaoPrompt, "cafe-analise-diaria@1");
  assert.match(p.prompt, /2\.1 PREÇO DO CAFÉ ARÁBICA \(ICF\)/);
  assert.match(p.prompt, /Contrato: ICFZ26 \(dez\/2026\), o vencimento mais próximo negociado/);
  assert.match(p.prompt, /Último preço: US\$ 351,90 em 02\/10\/2026/);
  assert.match(p.prompt, /Em reais: R\$ 1\.829,88 por saca, pela PTAX de venda de 02\/10\/2026/);
  assert.match(p.prompt, /Últimos 2 pregões \(data: US\$\/saca\)/);
  assert.match(p.prompt, /2\.2 CURVA FUTURA — fora desta versão/);
  assert.match(p.prompt, /LONGO \(Longo, 90 dias\): T1 = 11,0% \| T2 = 25,0%/);
  assert.match(p.instrucaoDoSistema, /modificador de risco, sem voto próprio/);
  assert.match(p.instrucaoDoSistema, /não\s+passou por validação humana/);
  assert.doesNotMatch(p.instrucaoDoSistema, /\d+(,\d+)?\s?%/);
  assert.doesNotMatch(p.prompt, /\{\{/);
  assert.equal(p.entrada.precoReferencia.serie, "ICF");
  assert.deepEqual(p.entrada.precoReferencia.ptax, { data: "2026-10-02", valor: 5.2 });
});
