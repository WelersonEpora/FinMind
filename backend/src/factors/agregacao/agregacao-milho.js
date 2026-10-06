"use strict";

const { scoreDoFator, precedenciaF1F2 } = require("./agregacao-cafe");

// AGREGAÇÃO DETERMINÍSTICA DO MILHO (PROPOSTA, ADR 0081): junta a leitura C dos 8 fatores do milho numa leitura
// (direção, faixa e confiança), em código, sem IA. No molde da do café (ADR 0066), com uma diferença de fundo: no milho
// o David deu os pesos (o calendário por mês do Motor do Milho v0, ADR 0065) e as regras de agregação (Seção 4). A
// agregação segue o David onde ele definiu e só completa o resto (a escala do score, os limiares e a confiança, os
// mesmos do café). Ainda fora do prompt, do Centro de Decisão e da Qualidade da IA: o usuário decide depois de ver o
// histórico (decisão de 2026-10-05).
//
//   fatores (parte C de cada um, já calculada pelo motor)
//   -> peso do fator no mês (o calendário do David) com as regras dele que o motor sabe aplicar
//   -> o bloco de oferta (F1 + F2 + F3) como UM argumento, com o teto de um fator Alto
//   -> o F7 multiplica por 1,25 o peso de F1, F3 e F8 alinhados ao extremo dele; contra, risco de reversão
//   -> score agregado S, cobertura, conflito -> tendência, faixa e confiança
//
// O Motor do Milho v0 não diz em que prazo cada fator age (só o F6, lento): os pesos são os mesmos nos 4 horizontes e
// a leitura sai igual neles. É uma limitação registrada no ADR 0081, não uma escolha.
//
// A ORIGEM de cada regra está em ORIGEM_DAS_REGRAS, nas três classes do café:
//   DAVID     - do Motor do Milho v0 (2026-10-02) ou do FEL 1, sem mudança (ou decisão do usuário que vale como a dele);
//   DERIVADA  - regra tirada diretamente do Motor v0, com a forma operacional do FinMind;
//   PROPOSTA  - parâmetro do FinMind, NÃO definido pelo David e não validado.

const VERSAO = 1;
const DATA_VERSAO = "2026-10-05";

const HORIZONTES = Object.freeze(["IMEDIATO", "CURTO", "MEDIO", "LONGO"]);
const ORIGEM = Object.freeze({ DAVID: "DAVID", DERIVADA: "DERIVADA", PROPOSTA: "PROPOSTA" });

const F = Object.freeze({
  CLIMA: "MILHO_CLIMA_SAFRA_EUA",
  SAFRINHA: "MILHO_SAFRINHA",
  ESTOQUES: "MILHO_ESTOQUES_WASDE",
  DOLAR: "MILHO_DOLAR_PARIDADE",
  ETANOL: "MILHO_ETANOL",
  INSUMOS: "MILHO_INSUMOS",
  FUNDOS: "MILHO_FUNDOS",
  POLITICA: "MILHO_POLITICA_COMERCIAL"
});

// As famílias: o bloco de oferta é um argumento só (DAVID, "Bloco de oferta"); as demais têm um fator cada. O F6 fica
// fora (DAVID, "Sinais defasados": age sobre a safra seguinte, de 6 a 12 meses, e não é sinal imediato). O F7 não vota.
const FAMILIAS = Object.freeze([
  { codigo: "OFERTA", rotulo: "Oferta (F1 + F2 + F3)", fatores: [F.CLIMA, F.SAFRINHA, F.ESTOQUES] },
  { codigo: "CAMBIO", rotulo: "Dólar e paridade (F4)", fatores: [F.DOLAR] },
  { codigo: "ETANOL", rotulo: "Etanol (F5)", fatores: [F.ETANOL] },
  { codigo: "POLITICA", rotulo: "Política comercial (F8)", fatores: [F.POLITICA] }
]);
const FORA = Object.freeze({ fator: F.INSUMOS, motivo: "sinal defasado de 6 a 12 meses, sobre a safra seguinte" });
const MODIFICADOR = Object.freeze({ fator: F.FUNDOS, multiplica: [F.CLIMA, F.ESTOQUES, F.POLITICA], horizontes: HORIZONTES });

const PONTOS = Object.freeze({ Baixo: 1, Médio: 2, Alto: 3 });
const NIVEIS = ["Baixo", "Médio", "Alto"];
const menor = (a, b) => (PONTOS[a] <= PONTOS[b] ? a : b);
const descerNivel = (nivel) => NIVEIS[Math.max(0, NIVEIS.indexOf(nivel) - 1)];

// Os parâmetros. O multiplicador e a colheita são do David (e do usuário, ADR 0077); o resto é PROPOSTA, os mesmos
// números do café (ADR 0066), para os dois ativos terem a mesma régua.
const PARAMETROS = Object.freeze({
  multiplicadorFundos: 1.25, // DAVID: "Multiplica o peso de F1, F3 e F8 quando o extremo de posição está alinhado"
  colheitaAjusteF1Pct: 50, // DAVID (o "um nível" é do usuário, ADR 0077)
  mesesAjusteF1: [6, 7, 8],
  limiarLateral: 0.5,
  limiarForte: 1.25,
  coberturaMinima: 0.5,
  coberturaPlena: 0.8,
  pesoContraMinimo: 0.25,
  conflitoRazao: 0.75,
  confiancaTeto: "MEDIA"
});

const pctRegra = (n) => `${Math.round(n * 100)}%`;
const numRegra = (n) => n.toLocaleString("pt-BR");

const ORIGEM_DAS_REGRAS = Object.freeze([
  {
    regra: "Peso do fator: o do mês da análise no calendário do David",
    origem: ORIGEM.DAVID,
    fonte: "Motor do Milho v0, mapa sazonal de pesos (ADR 0065); o F1 de janeiro a maio e o F2 em janeiro e fevereiro, do usuário (ADR 0077)",
    prompt: "Peso de cada fator: o do mês da análise na tabela 2.5 (Alto 3, Médio 2, Baixo 1), o mesmo nos 4 horizontes."
  },
  {
    regra: "Pressão de baixa do F1, do F3 e do F5: no máximo Médio (o F1 Alto com a polinização concluída)",
    origem: ORIGEM.DAVID,
    fonte: "Regras de peso por força do sinal do Motor v0 (ADR 0065, adendo); o mês é o teto",
    prompt:
      "Com pressão de baixa, MILHO_CLIMA_SAFRA_EUA, MILHO_ESTOQUES_WASDE e MILHO_ETANOL valem no máximo Médio; MILHO_CLIMA_SAFRA_EUA de baixa forte (a polinização concluída) mantém o peso do mês."
  },
  {
    regra: `F1 um nível abaixo de junho a agosto com ${PARAMETROS.colheitaAjusteF1Pct}% ou mais da safrinha de MT colhida`,
    origem: ORIGEM.DAVID,
    fonte: "Motor v0 (ajuste do F1 ao CCM); o \"um nível\" é decisão do usuário (ADR 0077)",
    prompt: `De junho a agosto, com ${PARAMETROS.colheitaAjusteF1Pct}% ou mais da safrinha de MT colhida, MILHO_CLIMA_SAFRA_EUA desce um nível de peso.`
  },
  {
    regra: "Bloco de oferta (F1 + F2 + F3) como um argumento, com o teto de um fator Alto",
    origem: ORIGEM.DAVID,
    fonte: "Motor v0, Seção 4, \"Bloco de oferta\": três sinais na mesma direção contam como um sinal Alto",
    prompt:
      "OFERTA = MILHO_CLIMA_SAFRA_EUA + MILHO_SAFRINHA + MILHO_ESTOQUES_WASDE, um argumento só; o peso dela é o do maior membro com dado, nunca a soma."
  },
  {
    regra: "No bloco, F1 e F2: o maior módulo, sem somar; opostos: soma líquida",
    origem: ORIGEM.DERIVADA,
    fonte: "\"Bloco de oferta\" (a mesma cadeia) na forma do café (ADR 0066)",
    prompt:
      "Na OFERTA, MILHO_CLIMA_SAFRA_EUA e MILHO_SAFRINHA com o mesmo sinal (ou um neutro) valem o maior módulo; com sinais opostos, a soma líquida, marcada como conflito."
  },
  {
    regra: "F3 como filtro: confirma (mantém), contradiz (módulo − 1) ou, sozinho, define",
    origem: ORIGEM.DERIVADA,
    fonte: "Motor v0, \"F3 como filtro\" e F3 como hub do motor",
    prompt:
      "MILHO_ESTOQUES_WASDE com o mesmo sinal confirma a OFERTA; com o sinal oposto, o módulo cai 1; com a base zero, define o sinal da OFERTA."
  },
  {
    regra: "F5 contradito pelo F3: um nível abaixo",
    origem: ORIGEM.DERIVADA,
    fonte: "Motor v0, \"F3 como filtro\": sinal contradito por F3 perde peso",
    prompt: "MILHO_ETANOL com o sinal oposto ao de MILHO_ESTOQUES_WASDE desce um nível de peso."
  },
  {
    regra: "F6 fora dos horizontes",
    origem: ORIGEM.DAVID,
    fonte: "Motor v0, \"Sinais defasados\": o F6 age sobre a safra seguinte (6 a 12 meses), não como sinal imediato",
    prompt: "MILHO_INSUMOS sem peso nos 4 horizontes: é sinal defasado, sobre a safra seguinte."
  },
  {
    regra: `F7 não vota; alinhado, multiplica por ${numRegra(PARAMETROS.multiplicadorFundos)} o peso de F1, F3 e F8; contra, risco de reversão`,
    origem: ORIGEM.DAVID,
    fonte: "Motor v0, \"Fundos como multiplicador\"; o extremo é a intensidade forte do F7 (ADR 0075)",
    prompt: `MILHO_FUNDOS não vota. Em extremo (pressão forte), multiplica por ${numRegra(PARAMETROS.multiplicadorFundos)} o peso de MILHO_CLIMA_SAFRA_EUA, MILHO_ESTOQUES_WASDE e MILHO_POLITICA_COMERCIAL quando o sinal deles é o mesmo da pressão dele; contra a direção agregada, RISCO_DE_REVERSAO e a confiança desce um nível.`
  },
  {
    regra: "Conflito entre blocos: mantém a direção, marca o conflito e a confiança vai a BAIXA",
    origem: ORIGEM.DAVID,
    fonte: `Motor v0, \"Conflito entre blocos\" (o motor não resolve sozinho); o limite de ${pctRegra(PARAMETROS.conflitoRazao)} é desta proposta`,
    prompt: `Conflito: as duas maiores contribuições com sinais opostos, a menor com ${pctRegra(PARAMETROS.conflitoRazao)} ou mais da maior: a direção fica a do score, marcada como conflito, e a confiança é BAIXA.`
  },
  {
    regra: "Score do fator: forte ±2, moderada ±1, neutra 0",
    origem: ORIGEM.PROPOSTA,
    fonte: "A mesma escala do café (ADR 0066)",
    prompt: "Score do fator: forte ±2, moderada ±1, neutra 0. S = soma do peso efetivo de cada família × o score dela, de −2 a +2."
  },
  {
    regra: `|S| < ${numRegra(PARAMETROS.limiarLateral)} LATERAL; < ${numRegra(PARAMETROS.limiarForte)} LEVE; ≥ ${numRegra(PARAMETROS.limiarForte)} FORTE`,
    origem: ORIGEM.PROPOSTA,
    fonte: "Os mesmos limiares do café (ADR 0066)",
    prompt: `|S| < ${numRegra(PARAMETROS.limiarLateral)}: LATERAL; até ${numRegra(PARAMETROS.limiarForte)}: LEVE; a partir de ${numRegra(PARAMETROS.limiarForte)}: FORTE.`
  },
  {
    regra: `Cobertura mínima de ${pctRegra(PARAMETROS.coberturaMinima)} (abaixo: INSUFICIENTE)`,
    origem: ORIGEM.PROPOSTA,
    fonte: "Motor v0, \"Cobertura\" (cobertura baixa reduz a confiança); o limite é o do café",
    prompt: `Família sem dado conta 0 e reduz a cobertura (a soma dos pesos efetivos com dado); abaixo de ${pctRegra(PARAMETROS.coberturaMinima)}: INSUFICIENTE.`
  },
  {
    regra: "Teto de confiança MÉDIA até a validação fora da amostra",
    origem: ORIGEM.PROPOSTA,
    fonte: "A mesma regra do café (ADR 0066)",
    prompt: "A confiança do motor parte de MEDIA e não passa disso até a validação; o piso é BAIXA."
  },
  {
    regra: `Confiança desce com cobertura < ${pctRegra(PARAMETROS.coberturaPlena)}, família ≥ ${pctRegra(PARAMETROS.pesoContraMinimo)} contra ou F7 contra`,
    origem: ORIGEM.PROPOSTA,
    fonte: "Os mesmos parâmetros do café (ADR 0066)",
    prompt: `A confiança desce um nível com cobertura abaixo de ${pctRegra(PARAMETROS.coberturaPlena)}, com uma família de ${pctRegra(PARAMETROS.pesoContraMinimo)} ou mais de peso efetivo contra a direção ou com MILHO_FUNDOS contra.`
  }
]);

const NIVEIS_CONFIANCA = ["BAIXA", "MEDIA", "ALTA"];
const sinal = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const arredondar = (n, casas = 4) => Math.round(n * 10 ** casas) / 10 ** casas + 0;
const pct = (n) => `${Math.round(n * 100)}%`;
const rebaixar = (nivel) => NIVEIS_CONFIANCA[Math.max(0, NIVEIS_CONFIANCA.indexOf(nivel) - 1)];

// O peso do fator no mês, do calendário montado (metodologia-base.js::montarPesoFator): o do mês (`meses`), o fixo ou
// nenhum (`papel`). Mês sem definição: o do FEL 1 (ADR 0065).
function nivelDoMes(pesoFator, mes) {
  if (!pesoFator) return null;
  if (pesoFator.meses) return pesoFator.meses[mes - 1]?.peso || pesoFator.pesoFel1;
  if (pesoFator.fixo) return pesoFator.fixo;
  return null;
}

// O nível de peso de cada fator votante no mês, com as regras do David que o motor sabe aplicar e o motivo de cada
// mudança. `colheitaMtPct`: o andamento da colheita de MT (contexto do F2, ADR 0077).
function niveisDosFatores(pesosFatores, decisoes, mes, colheitaMtPct, scores) {
  const niveis = {};
  for (const codigo of [F.CLIMA, F.SAFRINHA, F.ESTOQUES, F.DOLAR, F.ETANOL, F.POLITICA]) {
    const doMes = nivelDoMes(pesosFatores.find((p) => p.codigo === codigo), mes);
    niveis[codigo] = { nivel: doMes, doMes, motivos: [] };
  }
  const ajustar = (codigo, novo, motivo) => {
    const n = niveis[codigo];
    if (novo !== n.nivel) {
      n.nivel = novo;
      n.motivos.push(motivo);
    }
  };
  // Pressão de baixa: no máximo Médio (o mês é o teto); o F1 de baixa forte (polinização concluída) fica com o do mês.
  for (const codigo of [F.CLIMA, F.ESTOQUES, F.ETANOL]) {
    const d = decisoes[codigo];
    if (d?.direcao !== "BAIXA") continue;
    if (codigo === F.CLIMA && d.intensidade === "FORTE") continue;
    ajustar(codigo, menor(niveis[codigo].nivel, "Médio"), "pressão de baixa: no máximo Médio");
  }
  if (PARAMETROS.mesesAjusteF1.includes(mes) && colheitaMtPct !== null && colheitaMtPct !== undefined && colheitaMtPct >= PARAMETROS.colheitaAjusteF1Pct) {
    ajustar(F.CLIMA, descerNivel(niveis[F.CLIMA].nivel), `${numRegra(colheitaMtPct)}% da safrinha de MT colhida: um nível abaixo`);
  }
  const f3 = scores[F.ESTOQUES];
  const f5 = scores[F.ETANOL];
  if (!f3.ausente && !f5.ausente && sinal(f3.score) * sinal(f5.score) < 0) {
    ajustar(F.ETANOL, descerNivel(niveis[F.ETANOL].nivel), "contradito pelos estoques (F3): um nível abaixo");
  }
  return niveis;
}

// O bloco de oferta: precedência F1/F2 e o F3 como filtro (com a base zero, o F3 define, sem limite: é o hub).
function agregarOferta(scores) {
  const { base, conflito } = precedenciaF1F2(scores[F.CLIMA], scores[F.SAFRINHA]);
  const f3 = scores[F.ESTOQUES];
  const f3Presente = !f3.ausente;
  let score = base;
  let papelF3 = f3Presente ? "NEUTRO" : "SEM_DADO";
  if (f3Presente && f3.score !== 0) {
    if (base === null || base === 0) {
      score = f3.score;
      papelF3 = "DEFINE";
    } else if (sinal(f3.score) === sinal(base)) {
      papelF3 = "CONFIRMA";
    } else {
      score = sinal(base) * (Math.abs(base) - 1);
      papelF3 = "CONTRADIZ";
    }
  } else if (base === null && f3Presente) {
    score = 0;
  }
  const ausente = score === null;
  return { score: ausente ? 0 : Math.max(-2, Math.min(2, score)), ausente, detalhe: { baseF1F2: base, conflitoF1F2: conflito, papelF3 } };
}

// O F7: em extremo (intensidade forte), a direção da pressão dele (leitura de reversão, ADR 0075). null fora disso.
function extremoDosFundos(fundos) {
  const d = fundos?.decisao;
  if (!d || d.intensidade !== "FORTE" || d.direcao === "NEUTRA") return null;
  return d.direcao === "ALTA" ? 1 : -1;
}

function papelDosFundos(fundos, tendencia) {
  if (!fundos?.decisao) return { papel: "SEM_DADO", contra: false };
  const extremo = extremoDosFundos(fundos);
  if (extremo === null) return { papel: "SEM_PAPEL", contra: false, motivo: "fora do extremo" };
  if (tendencia !== "ALTA" && tendencia !== "BAIXA") return { papel: "SEM_PAPEL", contra: false, motivo: "sem direção agregada" };
  if (extremo !== (tendencia === "ALTA" ? 1 : -1)) return { papel: "RISCO_DE_REVERSAO", contra: true };
  return { papel: "MULTIPLICADOR", contra: false };
}

// A leitura agregada (a mesma nos 4 horizontes): famílias com peso, score, contribuição; cobertura, conflito,
// tendência, faixa e confiança.
function agregarLeitura(scores, niveis, fundos) {
  const extremo = extremoDosFundos(fundos);
  const multiplicado = (codigo) => extremo !== null && MODIFICADOR.multiplica.includes(codigo) && sinal(scores[codigo].score) === extremo;
  const pontosDe = (codigo) => {
    const nivel = niveis[codigo].nivel;
    if (!nivel) return 0;
    return PONTOS[nivel] * (multiplicado(codigo) ? PARAMETROS.multiplicadorFundos : 1);
  };

  const oferta = agregarOferta(scores);
  const membrosComDado = FAMILIAS[0].fatores.filter((c) => !scores[c].ausente);
  const familias = FAMILIAS.map((familia) => {
    if (familia.codigo === "OFERTA") {
      // O teto: o peso do maior membro com dado (todos sem dado: o maior do mês, só para a cobertura).
      const candidatos = membrosComDado.length ? membrosComDado : familia.fatores;
      const pontos = Math.max(...candidatos.map(pontosDe));
      return { codigo: familia.codigo, rotulo: familia.rotulo, pontos, score: oferta.score, ausente: oferta.ausente, detalhe: oferta.detalhe };
    }
    const codigo = familia.fatores[0];
    return {
      codigo: familia.codigo,
      rotulo: familia.rotulo,
      pontos: pontosDe(codigo),
      score: scores[codigo].score,
      ausente: scores[codigo].ausente,
      detalhe: multiplicado(codigo) ? { multiplicadoPeloF7: true } : null
    };
  });
  if (oferta.score !== 0 && extremo !== null && FAMILIAS[0].fatores.some((c) => multiplicado(c))) {
    familias[0].detalhe = { ...familias[0].detalhe, multiplicadoPeloF7: true };
  }

  const total = familias.reduce((s, f) => s + f.pontos, 0);
  for (const f of familias) {
    f.ativa = f.pontos > 0;
    f.peso = total ? arredondar(f.pontos / total) : 0;
    f.pesoEfetivo = f.peso;
    f.contribuicao = f.ausente ? 0 : arredondar(f.pesoEfetivo * f.score);
    delete f.pontos;
  }
  const cobertura = arredondar(familias.filter((f) => !f.ausente).reduce((s, f) => s + f.pesoEfetivo, 0));
  const score = arredondar(familias.reduce((s, f) => s + f.contribuicao, 0));
  const base = { familias, cobertura, score };

  if (cobertura < PARAMETROS.coberturaMinima) {
    const faltando = familias.filter((f) => f.ausente).map((f) => f.codigo);
    return {
      ...base,
      tendencia: "INSUFICIENTE",
      faixa: null,
      confianca: null,
      conflito: null,
      motivosConfianca: [`cobertura de ${pct(cobertura)}, abaixo de ${pct(PARAMETROS.coberturaMinima)} (sem dado: ${faltando.join(", ")})`],
      fundos: papelDosFundos(fundos, null)
    };
  }

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
  if (Math.abs(score) < PARAMETROS.limiarLateral) {
    tendencia = "LATERAL";
    faixa = "LATERAL";
  } else {
    tendencia = score > 0 ? "ALTA" : "BAIXA";
    faixa = `${tendencia}_${Math.abs(score) >= PARAMETROS.limiarForte ? "FORTE" : "LEVE"}`;
  }

  let confianca = PARAMETROS.confiancaTeto;
  const descer = (motivo) => {
    confianca = rebaixar(confianca);
    motivos.push(motivo);
  };
  if (conflito) {
    confianca = "BAIXA";
    motivos.push(`conflito entre blocos: ${conflito.familias.join(" x ")} (a menor contribuição é ${pct(conflito.razao)} da maior)`);
  }
  if (cobertura < PARAMETROS.coberturaPlena) descer(`cobertura de ${pct(cobertura)}, abaixo de ${pct(PARAMETROS.coberturaPlena)}`);
  if (tendencia === "ALTA" || tendencia === "BAIXA") {
    const direcao = tendencia === "ALTA" ? 1 : -1;
    const contra = familias.filter((f) => f.pesoEfetivo >= PARAMETROS.pesoContraMinimo && sinal(f.score) === -direcao);
    if (contra.length) descer(`família contra a direção com peso de ${pct(PARAMETROS.pesoContraMinimo)} ou mais: ${contra.map((f) => f.codigo).join(", ")}`);
  }
  const papelFundos = papelDosFundos(fundos, tendencia);
  if (papelFundos.contra) descer("F7 (fundos) em extremo contra a direção: risco de reversão");

  return { ...base, tendencia, faixa, confianca, conflito, motivosConfianca: motivos, fundos: papelFundos };
}

// Função PURA. `fatores`: os fatores do milho numa data, como metodologia-ativo.service.js::simularFatores os devolve
// ({ codigo, decisao, agregacao? }); `pesos`: o calendário montado (simulacao.pesos, metodologia-base.js::montarPesos).
function agregarMilho(fatores, { dataAnalise, pesos }) {
  if (!pesos?.fatores) throw new Error("A agregação do milho precisa do calendário de pesos (simulacao.pesos).");
  const porCodigo = new Map(fatores.map((f) => [f.codigo, f]));
  const codigos = Object.values(F);
  const scores = Object.fromEntries(codigos.map((codigo) => [codigo, scoreDoFator(porCodigo.get(codigo))]));
  const decisoes = Object.fromEntries(codigos.map((codigo) => [codigo, porCodigo.get(codigo)?.decisao ?? null]));
  const mes = Number(dataAnalise.slice(5, 7));
  const colheitaMtPct = porCodigo.get(F.SAFRINHA)?.agregacao?.colheitaMtPct ?? null;
  const niveis = niveisDosFatores(pesos.fatores, decisoes, mes, colheitaMtPct, scores);
  const fundos = porCodigo.get(F.FUNDOS);
  const leitura = agregarLeitura(scores, niveis, fundos);
  return {
    versao: `milho-agregacao-v${VERSAO} (${DATA_VERSAO})`,
    situacao: "PROPOSTA",
    dataAnalise,
    mes,
    colheitaMtPct,
    fatores: Object.fromEntries(
      codigos.map((codigo) => {
        const f = porCodigo.get(codigo);
        return [
          codigo,
          {
            ...scores[codigo],
            direcao: f?.decisao?.direcao ?? null,
            intensidade: f?.decisao?.intensidade ?? null,
            ...(niveis[codigo] ? { pesoDoMes: niveis[codigo].doMes, peso: niveis[codigo].nivel, motivosPeso: niveis[codigo].motivos } : {})
          }
        ];
      })
    ),
    regrasNoPrompt: ORIGEM_DAS_REGRAS.map((r) => r.prompt),
    // A mesma leitura nos 4 horizontes: o Motor v0 não diferencia o prazo dos fatores (ADR 0081).
    horizontes: HORIZONTES.map((horizonte) => ({ horizonte, ...structuredClone(leitura) }))
  };
}

const ROTULOS_HORIZONTE = Object.freeze({ IMEDIATO: "Imediato", CURTO: "Curto", MEDIO: "Médio", LONGO: "Longo" });

// A proposta como a tela de metodologia a mostra (metodologia-milho.js, `pesos.agregacaoFinMind`). Os pesos vêm do
// calendário do David (o card ao lado), por isso a célula diz "mês".
function resumoParaTela() {
  return {
    versao: `milho-agregacao-v${VERSAO} (${DATA_VERSAO})`,
    situacao: "PROPOSTA",
    adr: "ADR 0081",
    emProducao: false,
    descricao:
      "Proposta do FinMind para operacionalizar o Motor do Milho v0: o peso de cada fator é o do mês no calendário do David, com as regras dele que o motor sabe aplicar; o bloco de oferta conta como um argumento, com o teto de um fator Alto; o F7 multiplica o peso dos fatores alinhados; e o score agregado dá a tendência, a faixa e a confiança. A escala do score, os limiares e a confiança são do FinMind (os mesmos do café) e não foram validados. O Motor v0 não diz em que prazo cada fator age: a leitura é a mesma nos 4 horizontes. Fica fora do prompt, como referência: no histórico do CCM, não supera os benchmarks (decisão do usuário, 2026-10-06).",
    horizontes: HORIZONTES.map((codigo) => ({ codigo, rotulo: ROTULOS_HORIZONTE[codigo] })),
    familias: [
      ...FAMILIAS.map((familia) => ({
        codigo: familia.codigo,
        rotulo: familia.rotulo,
        fatores: familia.fatores,
        pesos: Object.fromEntries(HORIZONTES.map((h) => [h, "mês"])),
        composicao: null
      })),
      { codigo: "DEFASADO", rotulo: "Insumos (F6), sinal defasado", fatores: [FORA.fator], pesos: Object.fromEntries(HORIZONTES.map((h) => [h, 0])), composicao: null }
    ],
    modificador: { fator: MODIFICADOR.fator, horizontes: MODIFICADOR.horizontes, rotulo: "×1,25 e confiança" },
    regras: ORIGEM_DAS_REGRAS
  };
}

module.exports = {
  VERSAO,
  DATA_VERSAO,
  HORIZONTES,
  ORIGEM,
  ORIGEM_DAS_REGRAS,
  FAMILIAS,
  FORA,
  MODIFICADOR,
  PARAMETROS,
  nivelDoMes,
  niveisDosFatores,
  agregarOferta,
  agregarMilho,
  resumoParaTela
};
