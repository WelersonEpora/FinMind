"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { montarPromptDiario, situacaoDoFator, blocoPesos } = require("./prompt-diario.service");
const { obterMetodologiaMilho } = require("../shared/metodologia-milho");
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

// O Brent futuro (configuração v4 do petróleo, ADR 0052, adendo de 2026-10-07): o vencimento mais próximo negociado.
const PRECO = {
  disponivel: true,
  nome: "Brent futuro (NYMEX BZ)",
  unidade: "US$/barril",
  fonte: "Yahoo Finance (não oficial) - Brent da NYMEX (BZ)",
  seriesCode: "YAHOO.BZ.BZX26.SETTLE",
  contrato: { ticker: "BZX26", rotulo: "BZX26 (nov/2026)" },
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

// `precoPorAlvo(dataAlvo)`: o preço do contrato de um horizonte (ADR 0078; null = o mesmo `preco`); `curva`: a de lerCurva.
function deps({ fatores = [EVENTO, CALCULADO, SEM_DADO], preco = PRECO, pesos = null, precoPorAlvo = null, curva = null, eventosDoAtivo = null } = {}) {
  const chamadas = {};
  return {
    chamadas,
    agora: new Date("2026-10-03T15:00:00Z"),
    metodologiaAtivoService: {
      async simularFatores(ativo, opcoes) {
        chamadas.simular = [ativo, opcoes.data];
        return {
          simulacao: {
            ativo,
            data: opcoes.data,
            versaoMetodologia: "petroleo-v1 (2026-10-02)",
            fatores,
            ...(pesos ? { pesos } : {}),
            ...(eventosDoAtivo ? { eventosDoAtivo } : {})
          }
        };
      }
    },
    centroDecisaoService: {
      ATIVOS,
      async lerPreco(serie, opcoes) {
        if (!opcoes.vencimentoApos) chamadas.preco = [serie.codigo, opcoes.data];
        else (chamadas.alvos ||= []).push(opcoes.vencimentoApos);
        return (opcoes.vencimentoApos && precoPorAlvo && precoPorAlvo(opcoes.vencimentoApos)) || preco;
      },
      async lerCurva(futuro, opcoes) {
        chamadas.curva = [futuro.prefixo, opcoes.data];
        return curva;
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
  assert.equal(p.versaoPrompt, "petroleo-analise-diaria@10");
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

test("a base traz o preço do Brent futuro com o contrato, as datas e as variações dos horizontes, e a curva sem vencimentos como SEM DADO", async () => {
  const d = deps();
  const { promptDiario: p } = await montarPromptDiario("PETROLEO", { data: "2026-10-03" }, d);
  assert.deepEqual(d.chamadas.preco, ["BRENT_FUTURO", "2026-10-03"]);
  assert.deepEqual(d.chamadas.curva, ["YAHOO.BZ", "2026-10-03"]);
  assert.match(p.prompt, /2\.1 PREÇO DO BRENT FUTURO .*\nSérie: Brent futuro \(NYMEX BZ\), US\$\/barril \| Fonte: Yahoo Finance \(não oficial\)/);
  assert.match(p.prompt, /Contrato: BZX26 \(nov\/2026\), o vencimento mais próximo negociado até a data/);
  assert.deepEqual(d.chamadas.simular, ["PETROLEO", "2026-10-03"]);
  assert.match(p.prompt, /Último preço: US\$ 96,16 em 29\/09\/2026 \| publicado em 30\/09\/2026 \(data estimada\) \| 4 dia\(s\) antes da data da análise/);
  assert.match(
    p.prompt,
    /Os horizontes da tabela 2\.4 contam a partir de 03\/10\/2026, a data da análise\. O preço depois de 29\/09\/2026 até 03\/10\/2026 NÃO está na BASE: é desconhecido\./
  );
  assert.match(p.prompt, /1 dia \(pregão anterior\): -3,23% \(desde 28\/09\/2026\) \| 7 dias: -0,26% .* \| 90 dias: SEM DADO/);
  assert.match(p.prompt, /Últimos 2 pregões \(data: US\$\/barril\): 29\/09\/2026: 96,16; 28\/09\/2026: 99,37/);
  assert.match(p.prompt, /2\.2 CURVA FUTURA DO BRENT .*\nSEM DADO: nenhum vencimento do Brent futuro com ajuste até a data\./);
  assert.equal(p.entrada.curva, null);
  assert.equal(p.entrada.precoReferencia.dataReferencia, "2026-09-29");
});

test("petróleo (ADR 0052, adendo de 2026-10-07): cada horizonte no seu vencimento do Brent e a curva só com o ajuste, sem liquidez", async () => {
  const contrato = (ticker, rotulo, valor) => ({ ...PRECO, seriesCode: `YAHOO.BZ.${ticker}.SETTLE`, contrato: { ticker, rotulo }, valor });
  // Análise de 07/10: o Z26 vence em 30/10, então o médio (06/11) cai no F27 e o longo (05/01) no H27.
  const porAlvo = {
    "2026-11-06": contrato("BZF27", "BZF27 (jan/2027)", 97.59),
    "2027-01-05": contrato("BZH27", "BZH27 (mar/2027)", 93.25)
  };
  const curva = {
    dataReferencia: "2026-10-06",
    vencimentos: [
      { ticker: "BZZ26", rotulo: "BZZ26 (dez/2026)", vencimento: "2026-12", seriesCode: "YAHOO.BZ.BZZ26.SETTLE", preco: 100.58, contratosNegociados: null },
      { ticker: "BZF27", rotulo: "BZF27 (jan/2027)", vencimento: "2027-01", seriesCode: "YAHOO.BZ.BZF27.SETTLE", preco: 97.59, contratosNegociados: null }
    ]
  };
  const d = deps({ preco: contrato("BZZ26", "BZZ26 (dez/2026)", 100.58), precoPorAlvo: (alvo) => porAlvo[alvo], curva });
  d.agora = new Date("2026-10-07T15:00:00Z");
  const { promptDiario: p } = await montarPromptDiario("PETROLEO", { data: "2026-10-07" }, d);

  assert.deepEqual(d.chamadas.alvos, ["2026-10-08", "2026-10-14", "2026-11-06", "2027-01-05"]);
  assert.match(p.prompt, /BZZ26 \(dez\/2026\): US\$ 100,58\nBZF27 \(jan\/2027\): US\$ 97,59\nFonte: Yahoo Finance, não oficial/);
  assert.match(p.prompt, /MEDIO \(Médio, 30 dias\).*\n {3}Contrato: BZF27 \(jan\/2027\), negocia depois da data-alvo \(06\/11\/2026\) \| US\$ 97,59 em 29\/09\/2026 \| variação até/);
  assert.match(p.prompt, /LONGO \(Longo, 90 dias\).*\n {3}Contrato: BZH27 \(mar\/2027\)/);
  assert.doesNotMatch(p.prompt, /contratos negociados|POUCA LIQUIDEZ/);
  const medio = p.entrada.horizontes.find((h) => h.codigo === "MEDIO");
  assert.equal(medio.contrato.ticker, "BZF27");
  assert.equal(medio.seriesCode, "YAHOO.BZ.BZF27.SETTLE");
  assert.equal(p.entrada.precoReferencia.serie, "BRENT_FUTURO");
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
  // Um fator só de informação (ADR 0094; no petróleo, os fundos) segue o mesmo caminho, sem fator-pai.
  const informativo = { ...CALCULADO, codigo: "OURO_FUNDOS", nome: "Fundos", informativo: true, decisao: { direcao: "BAIXA", intensidade: "FORTE", tendencia: "SUBINDO" }, textoPrompt: "FATOR — Fundos" };
  const d = deps({ fatores: [inflacao, informativo], preco: precoGld });
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
  assert.equal(p.versaoPrompt, "ouro-analise-diaria@3");
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
  assert.match(p.prompt, /2\. OURO_FUNDOS — .* \| INFORMAÇÃO, sem leitura própria \|/);
  assert.equal(p.entrada.fatores[1].informativo, true);
  assert.deepEqual(p.entrada.fatores[1].leitura, { papel: "INFORMACAO", tendencia: "SUBINDO" });
  assert.deepEqual(p.entrada.precoReferencia.ptax, { data: "2026-10-02", valor: 5.4 });
  assert.equal(p.entrada.precoReferencia.contrato.ticker, "GLDZ26");
  // A série exata vai com a leitura (ADR 0064): o realizado não depende da configuração futura.
  assert.equal(p.entrada.precoReferencia.seriesCode, "B3.GLD.GLDZ26.SETTLE");

  await assert.rejects(montarPromptDiario("SOJA", { data: "2026-10-03" }, deps()), /Não há prompt diário/);
});

test("milho (ADRs 0058, 0078 e 0095): o CCM em reais, sem PTAX, com o contrato de cada horizonte e a curva; os eventos numa seção da base", async () => {
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
  const precoF27 = { ...precoCcm, seriesCode: "B3.CCM.CCMF27.SETTLE", contrato: { ticker: "CCMF27", rotulo: "CCMF27 (jan/2027)" }, valor: 76.26 };
  const d = deps({
    fatores: [{ ...CALCULADO, codigo: "MILHO_FUNDOS", textoPrompt: "FATOR — Fundos" }],
    preco: precoCcm,
    pesos: obterMetodologiaMilho().pesos,
    eventosDoAtivo: { janelaDias: 7, janelaPorFator: {}, eventos: 1, ultimaLeitura: { data: "2026-10-03", nivel: "ATENCAO" }, textoPrompt: "EVENTOS DO ATIVO DE TESTE" },
    // O CCMX26 vale até 15/11/2026: o horizonte de 90 dias (alvo 01/01/2027) vai ao CCMF27.
    precoPorAlvo: (alvo) => (alvo > "2026-11-15" ? precoF27 : null),
    curva: {
      dataReferencia: "2026-10-02",
      vencimentos: [
        { ticker: "CCMX26", rotulo: "CCMX26 (nov/2026)", vencimento: "2026-11", seriesCode: "B3.CCM.CCMX26.SETTLE", preco: 71.67, contratosNegociados: 8153 },
        { ticker: "CCMF27", rotulo: "CCMF27 (jan/2027)", vencimento: "2027-01", seriesCode: "B3.CCM.CCMF27.SETTLE", preco: 76.26, contratosNegociados: 60 }
      ]
    }
  });
  d.marketQuoteRepository = {
    async buscarHistorico() {
      throw new Error("o milho não converte pela PTAX");
    }
  };
  const { promptDiario: p } = await montarPromptDiario("MILHO", { data: "2026-10-03" }, d);

  assert.deepEqual(d.chamadas.preco, ["CCM", "2026-10-03"]);
  assert.equal(p.versaoPrompt, "milho-analise-diaria@8");
  // Os eventos numa seção só da base (ADR 0095), antes da leitura do motor, e o que foi gravado com a leitura.
  assert.match(p.prompt, /2\.6 EVENTOS DO ATIVO[^\n]*\nEVENTOS DO ATIVO DE TESTE\n[\s\S]*\[3\. LEITURA DO MOTOR/);
  assert.deepEqual(p.entrada.eventosDoAtivo, { janelaDias: 7, janelaPorFator: {}, eventos: 1, ultimaLeitura: { data: "2026-10-03", nivel: "ATENCAO" } });
  assert.deepEqual(d.chamadas.alvos, ["2026-10-04", "2026-10-10", "2026-11-02", "2027-01-01"]);
  assert.deepEqual(d.chamadas.curva, ["B3.CCM", "2026-10-03"]);
  // O calendário de pesos como tabela fixa (ADR 0065): em outubro, o F1 é Baixo e o F4 é Alto.
  assert.match(p.prompt, /2\.5 PESO DE CADA FATOR POR MÊS/);
  assert.match(p.prompt, /F1 MILHO_CLIMA_SAFRA_EUA +\| Alto +\| Baixo† +\|/);
  assert.match(p.prompt, /† mês que a proposta não define, com o peso decidido depois \(não é do especialista\): Usuário \(Welerson\), 2026-10-05 \(ADR 0077\)\./);
  assert.match(p.prompt, /F4 MILHO_DOLAR_PARIDADE +\| Médio +\| Alto +\|/);
  assert.match(p.instrucaoDoSistema, /coluna do mês da data da análise, na tabela 2\.5/);
  // As frases das relações entre os fatores vão ao bloco 2.5, as mesmas da tela; a matriz de símbolos não vai.
  const { relacoes } = obterMetodologiaMilho().pesos;
  assert.match(p.prompt, /Relações entre os fatores \(orientação para o julgamento, não fórmula\):/);
  for (const frase of [...relacoes.leitura, ...relacoes.observacoes]) assert.ok(p.prompt.includes(`- ${frase}`), frase);
  assert.doesNotMatch(p.prompt, /\+\/\+\+|desprezível/);
  assert.match(p.prompt, /Contrato: CCMX26 \(nov\/2026\), o vencimento mais próximo negociado/);
  assert.match(p.prompt, /Último preço: R\$ 71,67 em 02\/10\/2026/);
  assert.doesNotMatch(p.prompt, /US\$|Em reais:/);
  // A curva (ADR 0078): cada vencimento com o ajuste e os contratos negociados; o pouco líquido, com aviso.
  assert.match(p.prompt, /2\.2 CURVA FUTURA DO CCM/);
  assert.match(p.prompt, /CCMX26 \(nov\/2026\): R\$ 71,67 \| 8\.153 contratos negociados\n/);
  assert.match(p.prompt, /CCMF27 \(jan\/2027\): R\$ 76,26 \| 60 contratos negociados \(POUCA LIQUIDEZ: menos de 100\)/);
  // As faixas da v2, recalibradas no próprio CCM (ADR 0058, adendo), com o contrato de cada horizonte.
  assert.match(p.prompt, /LONGO \(Longo, 90 dias\): T1 = 3,0% \| T2 = 8,0%\n {3}Contrato: CCMF27 \(jan\/2027\), negocia depois da data-alvo \(01\/01\/2027\) \| R\$ 76,26 em 02\/10\/2026 \| 60 contratos negociados no dia \(POUCA LIQUIDEZ/);
  assert.match(p.prompt, /MEDIO \(Médio, 30 dias\): T1 = 2,0% \| T2 = 5,0%\n {3}Contrato: CCMX26 \(nov\/2026\), negocia depois da data-alvo \(02\/11\/2026\)/);
  assert.match(p.instrucaoDoSistema, /Cada horizonte tem o seu contrato/);
  // O contrato de cada horizonte fica na entrada: a avaliação o usa.
  const longo = p.entrada.horizontes.find((h) => h.codigo === "LONGO");
  assert.equal(longo.seriesCode, "B3.CCM.CCMF27.SETTLE");
  assert.equal(longo.contratosNegociados, 60);
  assert.equal(p.entrada.horizontes.find((h) => h.codigo === "CURTO").contrato.ticker, "CCMX26");
  assert.equal(p.entrada.curva.vencimentos.length, 2);
  assert.match(p.instrucaoDoSistema, /não passou por validação humana/);
  assert.doesNotMatch(p.instrucaoDoSistema, /\d+(,\d+)?\s?%/);
  assert.equal(p.entrada.precoReferencia.serie, "CCM");
  assert.equal(p.entrada.precoReferencia.ptax, undefined);
});

test("pesos (ADR 0065): o mês não definido sai com o FEL 1 e *, o fator sem peso remete às instruções, e as condições vêm à parte", () => {
  const mes = (peso, condicao = null) => ({ peso, condicao });
  const texto = blocoPesos({
    autoria: "David",
    noPrompt: { autorizacao: "Usuário", mesSemDefinicao: "vale o peso do FEL 1" },
    fatores: [
      { sigla: "F1", codigo: "A", pesoFel1: "Alto", meses: [null, ...Array(10).fill(mes("Baixo")), mes("Alto", "c")], fixo: null, papel: null, condicoes: [], noPrompt: ["F1 (dez): c"] },
      { sigla: "F2", codigo: "B", pesoFel1: "Médio", meses: null, fixo: "Baixo", papel: null, condicoes: ["geral"], noPrompt: ["F2: geral"] },
      { sigla: "F3", codigo: "C", pesoFel1: "Médio", meses: null, fixo: null, papel: "não vota", condicoes: [], noPrompt: [] }
    ]
  });
  assert.match(texto, /^F1 A +\| Alto +\| Alto\* +\| Baixo +\|.*\| Alto$/m);
  assert.match(texto, /^F2 B +\| Médio \| Baixo +\|/m);
  assert.match(texto, /^- F3 C: sem peso próprio/m);
  assert.match(texto, /^- F1 \(dez\): c$/m);
  assert.match(texto, /^- F2: geral$/m);
  assert.match(texto, /\* mês que a proposta não define: vale o peso do FEL 1\./);
});

test("café (ADRs 0062, 0066 e 0078): o ICF com o contrato e o preço em reais por saca, o contrato de cada horizonte e a leitura agregada do motor", async () => {
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
  assert.equal(p.versaoPrompt, "cafe-analise-diaria@7");
  assert.equal(p.versaoConfiguracao, 3);
  assert.match(p.prompt, /2\.1 PREÇO DO CAFÉ ARÁBICA \(ICF\)/);
  assert.match(p.prompt, /Contrato: ICFZ26 \(dez\/2026\), o vencimento mais próximo negociado/);
  assert.match(p.prompt, /Último preço: US\$ 351,90 em 02\/10\/2026/);
  assert.match(p.prompt, /Em reais: R\$ 1\.829,88 por saca, pela PTAX de venda de 02\/10\/2026/);
  assert.match(p.prompt, /Últimos 2 pregões \(data: US\$\/saca\)/);
  // Sem curva na base: SEM DADO, e a liquidez de cada horizonte também.
  assert.match(p.prompt, /2\.2 CURVA FUTURA DO ICF — os vencimentos negociados no último pregão\nSEM DADO: nenhum vencimento do ICF negociou até a data\./);
  assert.match(p.prompt, /Contrato: ICFZ26 \(dez\/2026\), negocia depois da data-alvo \(01\/01\/2027\) \| US\$ 351,90 em 02\/10\/2026 \| contratos negociados: SEM DADO/);
  assert.match(p.prompt, /LONGO \(Longo, 90 dias\): T1 = 11,0% \| T2 = 25,0%/);
  assert.match(p.instrucaoDoSistema, /modificador de risco, sem voto próprio/);
  assert.match(p.instrucaoDoSistema, /não\s+passou por validação humana/);
  assert.doesNotMatch(p.instrucaoDoSistema, /\d+(,\d+)?\s?%/);
  assert.doesNotMatch(p.prompt, /\{\{/);
  assert.equal(p.entrada.precoReferencia.serie, "ICF");
  assert.deepEqual(p.entrada.precoReferencia.ptax, { data: "2026-10-02", valor: 5.2 });
  // A leitura agregada do motor (ADR 0066): no bloco 3B do prompt e gravada na entrada, os quatro horizontes.
  assert.match(p.prompt, /\[3B\. LEITURA AGREGADA DO MOTOR/);
  assert.match(p.prompt, /^CURTO: /m);
  assert.match(p.prompt, /CAFE_FUNDOS \(modificador\)/);
  assert.match(p.instrucaoDoSistema, /O bloco 3B traz a LEITURA AGREGADA DO MOTOR/);
  assert.deepEqual(
    p.entrada.agregacaoMotor.horizontes.map((h) => h.horizonte),
    ["IMEDIATO", "CURTO", "MEDIO", "LONGO"]
  );
  assert.match(p.entrada.agregacaoMotor.versao, /^cafe-agregacao-v3/);
  // Toda regra que a tela de metodologia mostra está no prompt, com a mesma frase.
  for (const regra of require("../factors/agregacao/agregacao-cafe").ORIGEM_DAS_REGRAS) assert.ok(p.prompt.includes(`- ${regra.prompt}`), regra.regra);
});

test("ativo sem agregação (o ouro): sem bloco 3B nem agregacaoMotor na entrada", async () => {
  const d = deps({ fatores: [{ ...CALCULADO, codigo: "OURO_FUNDOS", textoPrompt: "FATOR — Fundos" }] });
  d.marketQuoteRepository = {
    async buscarHistorico() {
      return { registros: [{ reference_date: "2026-10-02", value: "5.2000" }], total: 1 };
    }
  };
  const { promptDiario: p } = await montarPromptDiario("OURO", { data: "2026-10-03" }, d);
  assert.doesNotMatch(p.prompt, /LEITURA AGREGADA DO MOTOR/);
  assert.equal(p.entrada.agregacaoMotor, undefined);
});
