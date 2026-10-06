"use strict";

const { FATORES: FATORES_FEL1 } = require("../../shared/fatores-fel1");

// AGREGAÇÃO DETERMINÍSTICA DO CAFÉ (PROPOSTA, ADR 0066): junta a leitura C dos 8 fatores do Motor do Café v1 numa
// leitura por horizonte (direção, faixa e confiança), em código, sem IA. Em produção desde 2026-10-05, por decisão do
// usuário (ADR 0066): calculada a cada leitura diária, vai ao prompt do café (bloco 3B) como evidência para a IA e fica
// gravada com a leitura (o Centro de Decisão e a Qualidade da IA a mostram ao lado da IA). A validação é do Comitê.
//
//   fatores individuais (parte C de cada um, já calculada pelo motor)
//   -> score do fator (forte ±2, moderada ±1, neutra 0, sem dado 0 e AUSENTE)
//   -> score da família (a Oferta junta F1 + F2 + F3 por precedência e confirmação: UM voto)
//   -> peso da família no horizonte
//   -> score agregado S, cobertura, conflito
//   -> tendência, faixa e confiança; o F7 (fundos) só como informação (desde a v3, não muda a confiança)
//
// A ORIGEM de cada regra e de cada número está em ORIGEM (abaixo) e no ADR 0066, em três classes:
//   DAVID     - insumo do estudo do David (Motor do Café v1, 2026-10-04) ou do FEL 1, sem mudança;
//   DERIVADA  - regra tirada diretamente do estudo, com a forma operacional do FinMind;
//   PROPOSTA  - parâmetro introduzido por esta proposta para operacionalizar a metodologia, NÃO definido pelo David
//               e ainda não validado fora da amostra.
// Os números da PROPOSTA ficam como estão até o backtest; revisá-los é versão nova (VERSAO), nunca ajuste ao resultado.

// v2 (2026-10-06): o F7 só baixa a confiança com o catalisador do estudo (F1 ou F2 na mesma direção dele); sem ele, sem
// papel. No histórico do café, o extremo dos fundos sozinho foi seguido de continuação, não de reversão (ADR 0089).
// v3 (2026-10-06): o F7 não muda mais a confiança, em nenhum caso; fica só como informação do papel dele. O
// catalisador da v2 quase nunca acontecia (em 2009 a 2026, nenhuma semana de extremo forte com o F1 na mesma direção) e
// o do F2 nunca foi testado; o extremo sozinho não mostrou reversão (ADR 0089, revisão).
const VERSAO = 3;
const DATA_VERSAO = "2026-10-06";

const HORIZONTES = Object.freeze(["IMEDIATO", "CURTO", "MEDIO", "LONGO"]);

const ORIGEM = Object.freeze({ DAVID: "DAVID", DERIVADA: "DERIVADA", PROPOSTA: "PROPOSTA" });

// O horizonte de cada fator, do campo "Sazonalidade e Horizonte" do estudo (DAVID), nos horizontes do FinMind (1, 7, 30
// e 90 dias corridos). O F5 fica sem horizonte: o estudo o restringe a 90 dias ou mais, com defasagem de 1 a 3
// temporadas, e o Longo do FinMind (90 dias corridos, cerca de 63 pregões) fica abaixo disso. O F7 tem horizonte (7 a
// 30 dias), mas não vota: é modificador (MODIFICADOR, abaixo).
const HORIZONTE_DO_FATOR = Object.freeze({
  CAFE_CLIMA: { horizontes: ["CURTO", "MEDIO"], estudo: "Curto a Médio Prazo (7 a 30 dias)" },
  CAFE_SAFRA_BRASIL: {
    horizontes: ["IMEDIATO", "CURTO", "MEDIO", "LONGO"],
    estudo: "Médio a Longo Prazo (30 a 90 dias); impacto concentrado nos dias imediatamente subsequentes à publicação"
  },
  CAFE_ESTOQUES: { horizontes: ["CURTO", "MEDIO"], estudo: "Curto a Médio Prazo (7 a 30 dias) para os dados diários da ICE" },
  CAFE_DOLAR: { horizontes: ["IMEDIATO", "CURTO"], estudo: "Imediato a Curto Prazo (mesmo dia a 7 dias)" },
  CAFE_CUSTO_PRECO_MINIMO: { horizontes: [], estudo: "Longo Prazo (90 dias ou mais), defasagem de 1 a 3 temporadas" },
  CAFE_DEMANDA: { horizontes: ["MEDIO", "LONGO"], estudo: "Médio a Longo Prazo (30 a 90 dias)" },
  CAFE_FUNDOS: { horizontes: ["CURTO", "MEDIO"], estudo: "Curto a Médio Prazo (7 a 30 dias); amplificador de volatilidade" },
  CAFE_JUROS: { horizontes: ["MEDIO", "LONGO"], estudo: "Médio a Longo Prazo (30 a 90 dias)" }
});

// As famílias. A Oferta é a cadeia clima -> safra -> estoques do estudo (DAVID: "o mesmo evento não pode acionar vários
// fatores no balanço geral"): um voto só. As demais têm um fator cada. `composicao`: os membros da Oferta que entram em
// cada horizonte (DERIVADA): no Imediato, só a safra, e só com publicação recente (o "impacto concentrado nos dias
// imediatamente subsequentes à publicação"); no Longo, só a safra (clima e estoques da ICE são de 7 a 30 dias).
const FAMILIAS = Object.freeze([
  {
    codigo: "OFERTA",
    rotulo: "Oferta (F1 + F2 + F3)",
    fatores: ["CAFE_CLIMA", "CAFE_SAFRA_BRASIL", "CAFE_ESTOQUES"],
    composicao: {
      IMEDIATO: ["CAFE_SAFRA_BRASIL"],
      CURTO: ["CAFE_CLIMA", "CAFE_SAFRA_BRASIL", "CAFE_ESTOQUES"],
      MEDIO: ["CAFE_CLIMA", "CAFE_SAFRA_BRASIL", "CAFE_ESTOQUES"],
      LONGO: ["CAFE_SAFRA_BRASIL"]
    }
  },
  { codigo: "CAMBIO", rotulo: "Câmbio (F4)", fatores: ["CAFE_DOLAR"] },
  { codigo: "DEMANDA", rotulo: "Demanda (F6)", fatores: ["CAFE_DEMANDA"] },
  { codigo: "JUROS", rotulo: "Juros (F8)", fatores: ["CAFE_JUROS"] },
  { codigo: "CUSTOS", rotulo: "Custos (F5)", fatores: ["CAFE_CUSTO_PRECO_MINIMO"] }
]);

const MODIFICADOR = Object.freeze({ fator: "CAFE_FUNDOS", horizontes: ["CURTO", "MEDIO"] });

// A família está no horizonte quando um fator dela está (DERIVADA). O Imediato da Oferta depende da publicação recente.
const familiaNoHorizonte = (familia, horizonte) => familia.fatores.some((f) => HORIZONTE_DO_FATOR[f].horizontes.includes(horizonte));

// A magnitude da família: o peso do FEL 1 (DAVID; Alto 3, Médio 2, Baixo 1), o MAIOR dos membros, nunca a soma (a
// Oferta vale 3, não 3 + 3 + 3: a soma recontaria a mesma cadeia).
const PONTOS_FEL1 = Object.freeze({ Alto: 3, Médio: 2, Baixo: 1 });
const pesoFel1 = (codigo) => {
  const fator = FATORES_FEL1.find((f) => f.codigo === codigo);
  if (!fator) throw new Error(`Fator sem peso no FEL 1: ${codigo}`);
  return PONTOS_FEL1[fator.peso];
};
const magnitudeDaFamilia = (familia) => Math.max(...familia.fatores.map(pesoFel1));

// Os pesos por horizonte, DERIVADOS (não escolhidos): horizonte do estudo x magnitude do FEL 1, normalizados para 1
// entre as famílias do horizonte. Resultado: Imediato e Curto 60/40 (Oferta/Câmbio); Médio e Longo 50/33/17
// (Oferta/Demanda/Juros); Custos 0 em todos. Os números são PROPOSTA (a regra de derivação é do FinMind).
function derivarPesos() {
  const pesos = {};
  for (const h of HORIZONTES) {
    const noHorizonte = FAMILIAS.filter((familia) => familiaNoHorizonte(familia, h));
    const total = noHorizonte.reduce((soma, familia) => soma + magnitudeDaFamilia(familia), 0);
    pesos[h] = Object.fromEntries(FAMILIAS.map((familia) => [familia.codigo, noHorizonte.includes(familia) ? magnitudeDaFamilia(familia) / total : 0]));
  }
  return pesos;
}
const PESOS = Object.freeze(derivarPesos());

// Os parâmetros operacionais. TODOS são PROPOSTA (ADR 0066): não vêm do David e não foram validados.
const PARAMETROS = Object.freeze({
  limiarLateral: 0.5, // |S| abaixo: LATERAL
  limiarForte: 1.25, // |S| a partir: FORTE; entre os dois, LEVE
  coberturaMinima: 0.5, // abaixo: INSUFICIENTE
  coberturaPlena: 0.8, // abaixo: a confiança desce um nível
  pesoContraMinimo: 0.25, // família com esse peso ou mais contra a direção: a confiança desce um nível
  conflitoRazao: 0.75, // as duas maiores contribuições opostas, a menor >= 75% da maior: LATERAL, confiança BAIXA
  pregoesPublicacaoRecente: 2, // a Conab "recente" para o Imediato: publicada há até 2 pregões
  confiancaTeto: "MEDIA" // até a validação fora da amostra, a confiança não passa de MÉDIA
});

// As regras da agregação, uma por linha: `regra` (a tela), a origem e a fonte (a auditoria e o ADR) e `prompt`, a frase
// EXATA que vai ao cabeçalho do bloco 3B do prompt diário (prompt-diario.service.js::blocoAgregacao). A tela mostra a
// mesma frase na coluna "Hoje no FinMind": toda regra daqui está no prompt, e um teste confere.
const pctRegra = (n) => `${Math.round(n * 100)}%`;
const numRegra = (n) => n.toLocaleString("pt-BR");
const pesosNoPrompt = () =>
  [
    ["IMEDIATO e CURTO", PESOS.CURTO],
    ["MEDIO e LONGO", PESOS.MEDIO]
  ]
    .map(
      ([rotulo, pesos]) =>
        `${rotulo}, ${Object.entries(pesos)
          .filter(([, w]) => w > 0)
          .map(([f, w]) => `${f} ${pctRegra(w)}`)
          .join(", ")}`
    )
    .join("; ");

const ORIGEM_DAS_REGRAS = Object.freeze([
  {
    regra: "Clima, safra e estoques como um voto só (família Oferta)",
    origem: ORIGEM.DERIVADA,
    fonte: "Motor do Café v1, §5 (dupla contagem) e §8 (pares F1-F2 e F2-F3)",
    prompt:
      "Famílias: OFERTA = CAFE_CLIMA + CAFE_SAFRA_BRASIL + CAFE_ESTOQUES, um voto só (a cadeia clima → safra → estoques); CAMBIO = CAFE_DOLAR; DEMANDA = CAFE_DEMANDA; JUROS = CAFE_JUROS."
  },
  {
    regra: "Pesos por horizonte (60/40; 50/33/17; custos 0)",
    origem: ORIGEM.PROPOSTA,
    fonte: "Derivação do FinMind: o horizonte de cada fator no estudo (David) × o peso do FEL 1 (David), o maior da família, normalizado para 100%",
    prompt: `Peso de cada família por horizonte: ${pesosNoPrompt()}.`
  },
  {
    regra: "F5 sem peso nos quatro horizontes",
    origem: ORIGEM.DERIVADA,
    fonte: "§8: F5 restrito a mais de 90 dias, com defasagem de 1 a 3 temporadas; o Longo do FinMind tem 90 dias corridos",
    prompt: "CAFE_CUSTO_PRECO_MINIMO sem peso em nenhum horizonte: age sobre as safras seguintes."
  },
  {
    regra: `Oferta no Imediato só com a Conab publicada há até ${PARAMETROS.pregoesPublicacaoRecente} pregões, e só o F2`,
    origem: ORIGEM.PROPOSTA,
    fonte: "O impacto concentrado nos dias seguintes à publicação é do estudo; os 2 pregões são desta proposta",
    prompt: `No IMEDIATO, a OFERTA é só CAFE_SAFRA_BRASIL e só entra com um levantamento da Conab publicado há até ${PARAMETROS.pregoesPublicacaoRecente} pregões.`
  },
  {
    regra: "Imediato sem Oferta: faixa no máximo LEVE, confiança no máximo BAIXA",
    origem: ORIGEM.PROPOSTA,
    fonte: "Parâmetro desta proposta (um fator só no horizonte)",
    prompt: "Sem a OFERTA no IMEDIATO, o CAMBIO fica com 100% do peso, a faixa no máximo LEVE e a confiança no máximo BAIXA."
  },
  {
    regra: "Longo: a Oferta é só o F2",
    origem: ORIGEM.DERIVADA,
    fonte: "Horizonte de cada fator no estudo: clima e estoques da ICE de 7 a 30 dias",
    prompt: "No LONGO, a OFERTA é só CAFE_SAFRA_BRASIL."
  },
  {
    regra: "F1 e F2: o maior módulo, sem somar; opostos: soma líquida",
    origem: ORIGEM.DERIVADA,
    fonte: "§8: filtro de precedência F1 → F2",
    prompt:
      "Na OFERTA, CAFE_CLIMA e CAFE_SAFRA_BRASIL com o mesmo sinal (ou um neutro) valem o maior módulo, sem somar; com sinais opostos, a soma líquida, marcada como conflito."
  },
  {
    regra: "F3 confirma (mantém), contradiz (módulo − 1) ou define (no máximo ±1)",
    origem: ORIGEM.DERIVADA,
    fonte: "§8: F3 atua como confirmação de F2",
    prompt:
      "CAFE_ESTOQUES com o mesmo sinal confirma a OFERTA (mantém); com o sinal oposto, contradiz (o módulo cai 1); com a base zero, define o sinal, no máximo ±1."
  },
  {
    regra: "Score do fator: forte ±2, moderada ±1, neutra 0",
    origem: ORIGEM.PROPOSTA,
    fonte: "Escala do FinMind sobre a intensidade que o motor já calcula",
    prompt: "Score do fator: forte ±2, moderada ±1, neutra 0. S = soma do peso de cada família no horizonte × o score dela, de −2 a +2."
  },
  {
    regra: `|S| < ${numRegra(PARAMETROS.limiarLateral)} LATERAL; < ${numRegra(PARAMETROS.limiarForte)} LEVE; ≥ ${numRegra(PARAMETROS.limiarForte)} FORTE`,
    origem: ORIGEM.PROPOSTA,
    fonte: "Parâmetros desta proposta",
    prompt: `|S| < ${numRegra(PARAMETROS.limiarLateral)}: LATERAL; até ${numRegra(PARAMETROS.limiarForte)}: LEVE; a partir de ${numRegra(PARAMETROS.limiarForte)}: FORTE.`
  },
  {
    regra: `Cobertura mínima de ${pctRegra(PARAMETROS.coberturaMinima)} (abaixo: INSUFICIENTE)`,
    origem: ORIGEM.PROPOSTA,
    fonte: "Operacionaliza a neutralidade mandatória com dado faltando (§5, David); o limite é desta proposta",
    prompt: `Família sem dado conta 0 e reduz a cobertura (a soma dos pesos com dado); cobertura abaixo de ${pctRegra(PARAMETROS.coberturaMinima)}: INSUFICIENTE.`
  },
  {
    regra: `Conflito: as duas maiores contribuições opostas, a menor ≥ ${pctRegra(PARAMETROS.conflitoRazao)} da maior`,
    origem: ORIGEM.PROPOSTA,
    fonte: "Operacionaliza a neutralidade mandatória com conflito (§5, David); o limite é desta proposta",
    prompt: `Conflito: as duas maiores contribuições com sinais opostos, a menor com ${pctRegra(PARAMETROS.conflitoRazao)} ou mais da maior: LATERAL, confiança BAIXA.`
  },
  {
    regra: "Teto de confiança MÉDIA até a validação fora da amostra",
    origem: ORIGEM.PROPOSTA,
    fonte: "Decisão metodológica desta proposta",
    prompt: "A confiança do motor parte de MEDIA e não passa disso até a validação; o piso é BAIXA."
  },
  {
    regra: `Confiança desce com cobertura < ${pctRegra(PARAMETROS.coberturaPlena)} ou família ≥ ${pctRegra(PARAMETROS.pesoContraMinimo)} contra`,
    origem: ORIGEM.PROPOSTA,
    fonte: "Parâmetros desta proposta",
    prompt: `A confiança desce um nível com cobertura abaixo de ${pctRegra(PARAMETROS.coberturaPlena)}, com uma família de ${pctRegra(PARAMETROS.pesoContraMinimo)} ou mais de peso contra a direção .`
  },
  {
    regra: "F7 sem peso e sem voto, só modificador de risco",
    origem: ORIGEM.DAVID,
    fonte: "§5 e o F7: sem voto fundamental independente",
    prompt: "CAFE_FUNDOS sem peso e sem voto: não muda S, a direção nem a faixa."
  },
  {
    regra: "F7 só como informação: não muda a confiança",
    origem: ORIGEM.PROPOSTA,
    fonte: "Decisão do usuário, 2026-10-06 (ADR 0089, revisão): o extremo sozinho não mostrou reversão no histórico, e o catalisador do estudo quase nunca aconteceu",
    prompt:
      "CAFE_FUNDOS não muda a confiança do motor: o papel dele (só no CURTO e no MEDIO, só no extremo, a pressão forte) vai como informação. Contra a direção agregada, SEM_PAPEL (extremo contra, só informação); a favor, EXCESSO."
  }
]);

const NIVEIS_CONFIANCA = ["BAIXA", "MEDIA", "ALTA"];
const sinal = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const arredondar = (n, casas = 4) => Math.round(n * 10 ** casas) / 10 ** casas + 0;

// O score de um fator, da parte C que o motor já calcula. Sem fator, sem decisão: 0 e AUSENTE.
function scoreDoFator(fator) {
  const d = fator?.decisao;
  if (!d) return { score: 0, ausente: true };
  if (d.direcao === "NEUTRA") return { score: 0, ausente: false };
  const modulo = d.intensidade === "FORTE" ? 2 : d.intensidade === "MODERADA" ? 1 : 0;
  return { score: (d.direcao === "ALTA" ? 1 : -1) * modulo, ausente: false };
}

// Os pregões (dias úteis, de segunda a sexta) depois do dia da publicação até a data da análise. Sem o calendário de
// feriados da B3: um feriado no meio conta como pregão.
function pregoesDesde(diaPublicacao, dataAnalise) {
  if (!diaPublicacao || diaPublicacao > dataAnalise) return null;
  let n = 0;
  const d = new Date(`${diaPublicacao}T12:00:00Z`);
  const fim = new Date(`${dataAnalise}T12:00:00Z`);
  while (d < fim) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) n += 1;
  }
  return n;
}

const diaEmSaoPaulo = (instante) =>
  instante ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(instante)) : null;

// F1 + F2: o maior módulo com o mesmo sinal (ou um neutro), sem somar; opostos, a soma líquida, com conflito.
function precedenciaF1F2(f1, f2) {
  const presentes = [f1, f2].filter((s) => s && !s.ausente);
  if (presentes.length === 0) return { base: null, conflito: false };
  if (presentes.length === 1) return { base: presentes[0].score, conflito: false };
  const [a, b] = [f1.score, f2.score];
  if (sinal(a) * sinal(b) < 0) return { base: a + b, conflito: true };
  const maior = Math.abs(a) >= Math.abs(b) ? a : b;
  return { base: maior, conflito: false };
}

// A família Oferta num horizonte: precedência F1/F2 e o F3 como confirmação. `scores`: código -> { score, ausente }.
function agregarOferta(scores, membros) {
  const de = (codigo) => (membros.includes(codigo) ? scores[codigo] : null);
  const { base, conflito } = precedenciaF1F2(de("CAFE_CLIMA"), de("CAFE_SAFRA_BRASIL"));
  const f3 = de("CAFE_ESTOQUES");
  const f3Presente = f3 && !f3.ausente;
  let score = base;
  let papelF3 = membros.includes("CAFE_ESTOQUES") ? (f3Presente ? "NEUTRO" : "SEM_DADO") : "FORA_DO_HORIZONTE";
  let confirmado = false;
  if (f3Presente && f3.score !== 0) {
    if (base === null || base === 0) {
      score = Math.max(-1, Math.min(1, f3.score));
      papelF3 = "DEFINE";
    } else if (sinal(f3.score) === sinal(base)) {
      papelF3 = "CONFIRMA";
      confirmado = true;
    } else {
      score = sinal(base) * (Math.abs(base) - 1);
      papelF3 = "CONTRADIZ";
    }
  } else if (base === null && f3Presente) {
    score = 0;
  }
  const ausente = score === null;
  return {
    score: ausente ? 0 : Math.max(-2, Math.min(2, score)),
    ausente,
    detalhe: {
      membros,
      baseF1F2: base,
      conflitoF1F2: conflito,
      papelF3,
      confirmado
    }
  };
}

// A família num horizonte: { ativa, score, ausente, detalhe }.
function scoreDaFamilia(familia, horizonte, scores, contexto) {
  if (familia.codigo !== "OFERTA") {
    const s = scores[familia.fatores[0]];
    return { ativa: true, score: s.score, ausente: s.ausente, detalhe: null };
  }
  const membros = familia.composicao[horizonte];
  if (horizonte === "IMEDIATO") {
    const recente = contexto.pregoesDesdeConab !== null && contexto.pregoesDesdeConab <= PARAMETROS.pregoesPublicacaoRecente;
    if (!recente) {
      return {
        ativa: false,
        score: 0,
        ausente: false,
        detalhe: { motivo: `sem levantamento da Conab nos últimos ${PARAMETROS.pregoesPublicacaoRecente} pregões`, pregoesDesdeConab: contexto.pregoesDesdeConab }
      };
    }
  }
  const oferta = agregarOferta(scores, membros);
  return { ativa: true, score: oferta.score, ausente: oferta.ausente, detalhe: { ...oferta.detalhe, pregoesDesdeConab: contexto.pregoesDesdeConab } };
}

function rebaixar(nivel) {
  return NIVEIS_CONFIANCA[Math.max(0, NIVEIS_CONFIANCA.indexOf(nivel) - 1)];
}

// O papel do F7 (fundos) no horizonte, pela leitura C dele (a de reversão: comprados em extremo pressionam para
// baixa), só como informação: desde a v3, nunca muda a confiança (ADR 0089, revisão). O papel na leitura gravada usa os
// valores que o formato da resposta já conhece: contra a direção, SEM_PAPEL com o motivo; a favor, EXCESSO.
function papelDosFundos(fundos, horizonte, tendencia) {
  const d = fundos?.decisao;
  if (!d) return { papel: "SEM_DADO", contra: false };
  if (!MODIFICADOR.horizontes.includes(horizonte)) return { papel: "SEM_PAPEL", contra: false, motivo: "fora do horizonte do F7 (7 a 30 dias)" };
  if (d.intensidade !== "FORTE" || d.direcao === "NEUTRA") return { papel: "SEM_PAPEL", contra: false, motivo: "fora do extremo" };
  if (tendencia !== "ALTA" && tendencia !== "BAIXA") return { papel: "SEM_PAPEL", contra: false, motivo: "sem direção agregada" };
  if (d.direcao !== tendencia) return { papel: "SEM_PAPEL", contra: false, extremoContra: true, motivo: "extremo contra a direção, só informação" };
  return { papel: "EXCESSO", contra: false };
}

function agregarHorizonte(horizonte, scores, fundos, contexto) {
  const familias = FAMILIAS.map((familia) => ({ familia, peso: PESOS[horizonte][familia.codigo] }))
    .filter(({ peso }) => peso > 0)
    .map(({ familia, peso }) => ({ codigo: familia.codigo, rotulo: familia.rotulo, peso, ...scoreDaFamilia(familia, horizonte, scores, contexto) }));

  // Os pesos das famílias ativas, renormalizados para 1 (no Imediato sem Conab recente, o Câmbio fica com 100%).
  const ativas = familias.filter((f) => f.ativa);
  const totalAtivas = ativas.reduce((s, f) => s + f.peso, 0);
  for (const f of familias) {
    f.pesoEfetivo = f.ativa ? arredondar(f.peso / totalAtivas) : 0;
    f.contribuicao = f.ativa && !f.ausente ? arredondar(f.pesoEfetivo * f.score) : 0;
    f.peso = arredondar(f.peso);
  }
  const imediatoSemOferta = horizonte === "IMEDIATO" && !familias.find((f) => f.codigo === "OFERTA").ativa;

  const cobertura = arredondar(ativas.filter((f) => !f.ausente).reduce((s, f) => s + f.pesoEfetivo, 0));
  const score = arredondar(familias.reduce((s, f) => s + f.contribuicao, 0));
  const base = { horizonte, familias, cobertura, score };

  if (cobertura < PARAMETROS.coberturaMinima) {
    const faltando = ativas.filter((f) => f.ausente).map((f) => f.codigo);
    return {
      ...base,
      tendencia: "INSUFICIENTE",
      faixa: null,
      confianca: null,
      conflito: null,
      motivosConfianca: [`cobertura de ${pct(cobertura)}, abaixo de ${pct(PARAMETROS.coberturaMinima)} (sem dado: ${faltando.join(", ")})`],
      fundos: papelDosFundos(fundos, horizonte, null)
    };
  }

  // Conflito: as duas maiores contribuições com sinais opostos e a menor com 75% ou mais da maior.
  const ordenadas = familias.filter((f) => f.contribuicao !== 0).sort((a, b) => Math.abs(b.contribuicao) - Math.abs(a.contribuicao));
  let conflito = null;
  if (ordenadas.length >= 2) {
    const [maior, segunda] = ordenadas;
    const razao = arredondar(Math.abs(segunda.contribuicao) / Math.abs(maior.contribuicao));
    if (sinal(maior.contribuicao) !== sinal(segunda.contribuicao) && razao >= PARAMETROS.conflitoRazao) {
      conflito = { familias: [maior.codigo, segunda.codigo], razao };
    }
  }

  const motivos = [];
  let tendencia;
  let faixa;
  if (conflito) {
    tendencia = "LATERAL";
    faixa = "LATERAL";
    motivos.push(`conflito: ${conflito.familias.join(" x ")} (a menor contribuição é ${pct(conflito.razao)} da maior)`);
  } else if (Math.abs(score) < PARAMETROS.limiarLateral) {
    tendencia = "LATERAL";
    faixa = "LATERAL";
  } else {
    tendencia = score > 0 ? "ALTA" : "BAIXA";
    let forca = Math.abs(score) >= PARAMETROS.limiarForte ? "FORTE" : "LEVE";
    if (imediatoSemOferta && forca === "FORTE") {
      forca = "LEVE";
      motivos.push("Imediato sem Oferta: faixa limitada a LEVE");
    }
    faixa = `${tendencia}_${forca}`;
  }

  // A confiança: parte do teto (MÉDIA) e desce um nível por motivo; nunca abaixo de BAIXA.
  let confianca = PARAMETROS.confiancaTeto;
  const descer = (motivo) => {
    confianca = rebaixar(confianca);
    motivos.push(motivo);
  };
  if (conflito) confianca = "BAIXA";
  if (cobertura < PARAMETROS.coberturaPlena) descer(`cobertura de ${pct(cobertura)}, abaixo de ${pct(PARAMETROS.coberturaPlena)}`);
  if (tendencia === "ALTA" || tendencia === "BAIXA") {
    const direcao = tendencia === "ALTA" ? 1 : -1;
    const contra = familias.filter((f) => f.ativa && f.pesoEfetivo >= PARAMETROS.pesoContraMinimo && sinal(f.score) === -direcao);
    if (contra.length) descer(`família contra a direção com peso de ${pct(PARAMETROS.pesoContraMinimo)} ou mais: ${contra.map((f) => f.codigo).join(", ")}`);
  }
  const papelFundos = papelDosFundos(fundos, horizonte, tendencia);
  if (imediatoSemOferta && confianca !== "BAIXA") {
    confianca = "BAIXA";
    motivos.push("Imediato sem Oferta: confiança limitada a BAIXA");
  }

  return { ...base, tendencia, faixa, confianca, conflito, motivosConfianca: motivos, fundos: papelFundos };
}

const pct = (n) => `${Math.round(n * 100)}%`;

// Função PURA. `fatores`: os fatores do café numa data, como metodologia-ativo.service.js::simularFatores os devolve
// ({ codigo, decisao: { direcao, intensidade }, publicadoEm }). `dataAnalise`: AAAA-MM-DD.
function agregarCafe(fatores, { dataAnalise }) {
  const porCodigo = new Map(fatores.map((f) => [f.codigo, f]));
  const scores = Object.fromEntries(Object.keys(HORIZONTE_DO_FATOR).map((codigo) => [codigo, scoreDoFator(porCodigo.get(codigo))]));
  const safra = porCodigo.get("CAFE_SAFRA_BRASIL");
  const contexto = { pregoesDesdeConab: pregoesDesde(diaEmSaoPaulo(safra?.publicadoEm), dataAnalise) };
  const fundos = porCodigo.get("CAFE_FUNDOS");
  return {
    versao: `cafe-agregacao-v${VERSAO} (${DATA_VERSAO})`,
    situacao: "PROPOSTA",
    dataAnalise,
    fatores: Object.fromEntries(
      Object.keys(HORIZONTE_DO_FATOR).map((codigo) => {
        const f = porCodigo.get(codigo);
        return [codigo, { ...scores[codigo], direcao: f?.decisao?.direcao ?? null, intensidade: f?.decisao?.intensidade ?? null }];
      })
    ),
    pregoesDesdeConab: contexto.pregoesDesdeConab,
    // As regras como vão ao cabeçalho do bloco 3B do prompt (as mesmas frases da tela).
    regrasNoPrompt: ORIGEM_DAS_REGRAS.map((r) => r.prompt),
    horizontes: HORIZONTES.map((h) => agregarHorizonte(h, scores, fundos, contexto))
  };
}

const ROTULOS_HORIZONTE = Object.freeze({ IMEDIATO: "Imediato", CURTO: "Curto", MEDIO: "Médio", LONGO: "Longo" });

// A proposta como a tela de metodologia a mostra (metodologia-cafe.js, `pesos.agregacaoFinMind`): os pesos, a
// composição da Oferta, o modificador e as regras (com a origem e a frase do prompt) saem daqui, do mesmo dado que o cálculo usa, para a tela
// e o código não divergirem.
function resumoParaTela() {
  return {
    versao: `cafe-agregacao-v${VERSAO} (${DATA_VERSAO})`,
    situacao: "PROPOSTA",
    adr: "ADR 0066",
    descricao:
      "Proposta do FinMind para operacionalizar o Motor do Café v1: os fatores são agregados em famílias, a família recebe um peso por horizonte e o score agregado dá a tendência, a faixa e a confiança. Os pesos são derivados do horizonte de cada fator no estudo e do peso do FEL 1, normalizados para 100%. Os pesos e os limiares não foram definidos pelo David e não foram validados fora da amostra: a validação é do Comitê.",
    horizontes: HORIZONTES.map((codigo) => ({ codigo, rotulo: ROTULOS_HORIZONTE[codigo] })),
    familias: FAMILIAS.map((familia) => ({
      codigo: familia.codigo,
      rotulo: familia.rotulo,
      fatores: familia.fatores,
      magnitudeFel1: magnitudeDaFamilia(familia),
      pesos: Object.fromEntries(HORIZONTES.map((h) => [h, Math.round(PESOS[h][familia.codigo] * 100)])),
      composicao: familia.composicao || null
    })),
    modificador: { fator: MODIFICADOR.fator, horizontes: MODIFICADOR.horizontes },
    regras: ORIGEM_DAS_REGRAS
  };
}

module.exports = {
  resumoParaTela,
  VERSAO,
  DATA_VERSAO,
  HORIZONTES,
  ORIGEM,
  ORIGEM_DAS_REGRAS,
  HORIZONTE_DO_FATOR,
  FAMILIAS,
  MODIFICADOR,
  PESOS,
  PARAMETROS,
  derivarPesos,
  scoreDoFator,
  pregoesDesde,
  precedenciaF1F2,
  agregarOferta,
  agregarCafe
};
