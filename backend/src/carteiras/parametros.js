"use strict";

const { CONTAS, ESPECIFICACOES } = require("./especificacoes");

// Os parâmetros de uma carteira virtual (ADR 0127, §8): por carteira, versionados e append-only; valem para as três
// trilhas. Os padrões são os da Cartilha de Operações v1.0 do Comitê (não aprovada), como estão:
//   - por ativo, a Tabela 2: risco por operação, piso do stop em ATR(14), alvos em R e R:R mínimo; mais a slippage e o
//     custo por contrato, da execução simulada;
//   - da carteira, a Tabela 3 e as regras de saída;
//   - da execução simulada, as decisões do ADR 0127 (§5 e §7).
// O custo por contrato fica nulo no padrão até o número real (corretagem e emolumentos): a carteira roda com custo zero
// e um aviso (`pendencias`). Quando ele chegar, vale desde o início, por lançamentos de correção, sem abrir segmento
// novo de medição: custo é fato, não escolha de estratégia (ADR 0127, §8).
const MODELO = "cartilha-1.0";

// O vencimento e a liquidez, por ativo (D13): entrar só num contrato a mais de N dias úteis do limite e com pelo menos M
// contratos no dia; encerrar K dias úteis antes do limite, sem rolar (liquidez do ADR 0078). Nos ativos da Cartilha, 30,
// 15 e 100.
const VENCIMENTO_PADRAO = Object.freeze({ diasUteisMinimosAteOLimite: 30, diasUteisEncerrarAntesDoLimite: 15, liquidezMinima: 100 });
const CAMPOS_VENCIMENTO = Object.freeze(Object.keys(VENCIMENTO_PADRAO));

const PADRAO_POR_ATIVO = Object.freeze({
  // O agro da B3: 2%, piso de 1,5× o ATR(14) diário, alvo 1 em 1R, alvo 2 em 3R, R:R mínimo 1:2.
  MILHO: Object.freeze({ riscoPct: 2, pisoAtr: 1.5, alvo1R: 1, alvo2R: 3, rrMinimo: 2, slippageTicks: 2, custoPorContrato: null, ...VENCIMENTO_PADRAO }),
  CAFE: Object.freeze({ riscoPct: 2, pisoAtr: 1.5, alvo1R: 1, alvo2R: 3, rrMinimo: 2, slippageTicks: 2, custoPorContrato: null, ...VENCIMENTO_PADRAO }),
  SOJA: Object.freeze({ riscoPct: 2, pisoAtr: 1.5, alvo1R: 1, alvo2R: 3, rrMinimo: 2, slippageTicks: 2, custoPorContrato: null, ...VENCIMENTO_PADRAO }),
  // O dólar (WDO), fora da Cartilha: decisões do usuário em 2026-10-15 (adendo ao ADR 0127). O risco e os alvos são os do
  // agro da B3; 1 tick de slippage (o 1º vencimento negocia ~2,5 milhões de contratos por dia). O WDO vence todo mês e a
  // liquidez fica no 1º vencimento: entra com mais de 3 dias úteis até o limite e sai 2 antes dele, sem rolar.
  DOLAR: Object.freeze({
    riscoPct: 2,
    pisoAtr: 1.5,
    alvo1R: 1,
    alvo2R: 3,
    rrMinimo: 2,
    slippageTicks: 1,
    custoPorContrato: null,
    diasUteisMinimosAteOLimite: 3,
    diasUteisEncerrarAntesDoLimite: 2,
    liquidezMinima: 100
  }),
  // Ouro e petróleo: 1,5% e 1%, alvo 1 em 1,5R, R:R mínimo 1:2,5. A Cartilha pede o ATR de 4 horas; sem esse dado, o
  // piso usa o diário (ADR 0127, §11).
  OURO: Object.freeze({ riscoPct: 1.5, pisoAtr: 1.5, alvo1R: 1.5, alvo2R: 3, rrMinimo: 2.5, slippageTicks: 3, custoPorContrato: null, ...VENCIMENTO_PADRAO }),
  PETROLEO: Object.freeze({ riscoPct: 1, pisoAtr: 1.5, alvo1R: 1.5, alvo2R: 3, rrMinimo: 2.5, slippageTicks: 3, custoPorContrato: null, ...VENCIMENTO_PADRAO })
});

const PADRAO_CARTEIRA = Object.freeze({
  maxPosicoes: 2,
  // Perda diária e semanal: 4% e 8% no agro; 3% e 6% no ouro e no petróleo (por conta, abaixo).
  perdaDiariaPct: 4,
  perdaSemanalPct: 8,
  drawdownMaxPct: 10,
  perdasSeguidas: 3,
  // A pausa depois das perdas seguidas não tem duração na Cartilha: 5 pregões é proposta do FinMind (ADR 0127, D11).
  pausaPregoes: 5,
  saidaAlvo1Pct: 50,
  fracaoReduzirPct: 50,
  // "Overnight com metade do risco" valeria sempre em swing: 1,0 na v1, pergunta ao Comitê (ADR 0127, D10).
  fatorOvernight: 1
});

const PERDAS_POR_CONTA = Object.freeze({
  B3: Object.freeze({ perdaDiariaPct: 4, perdaSemanalPct: 8 }),
  INTERNACIONAL: Object.freeze({ perdaDiariaPct: 3, perdaSemanalPct: 6 })
});

const PADRAO_EXECUCAO = Object.freeze({
  quantidade: "FRACIONARIA",
  periodoAtr: 14,
  registroTardioDiasUteis: 5
});

const QUANTIDADES = Object.freeze(["FRACIONARIA"]);

// Os parâmetros padrão de uma carteira nova, para a conta e os ativos escolhidos.
function parametrosPadrao(conta, ativos) {
  return {
    modelo: MODELO,
    conta,
    ativos: Object.fromEntries(ativos.map((ativo) => [ativo, { ...PADRAO_POR_ATIVO[ativo] }])),
    carteira: { ...PADRAO_CARTEIRA, ...(PERDAS_POR_CONTA[conta] || {}) },
    execucao: { ...PADRAO_EXECUCAO }
  };
}

const CAMPOS_ATIVO = Object.freeze(Object.keys(PADRAO_POR_ATIVO.MILHO));
const CAMPOS_CARTEIRA = Object.freeze(Object.keys(PADRAO_CARTEIRA));
const CAMPOS_EXECUCAO = Object.freeze(Object.keys(PADRAO_EXECUCAO));

const numero = (v) => typeof v === "number" && Number.isFinite(v);
const inteiro = (v) => Number.isInteger(v);

function camposDesconhecidos(objeto, campos, onde, erros) {
  for (const chave of Object.keys(objeto)) {
    if (!campos.includes(chave)) erros.push(`${onde}: campo desconhecido "${chave}".`);
  }
  for (const chave of campos) {
    if (!(chave in objeto)) erros.push(`${onde}: falta "${chave}".`);
  }
}

// -> lista de erros (vazia: válidos). Estrita: campo desconhecido é erro (um erro de digitação não vira um parâmetro
// ignorado).
function validarParametros(p) {
  const erros = [];
  if (!p || typeof p !== "object") return ["Parâmetros ausentes."];
  if (p.modelo !== MODELO) erros.push(`modelo: "${p.modelo}" desconhecido (esperado ${MODELO}).`);
  if (!CONTAS[p.conta]) erros.push(`conta: "${p.conta}" desconhecida.`);

  const ativos = Object.keys(p.ativos || {});
  if (ativos.length === 0) erros.push("ativos: escolha pelo menos um.");
  const proprio = ativos.find((ativo) => ESPECIFICACOES[ativo]?.carteiraPropria);
  if (proprio && ativos.length > 1) erros.push(`ativos.${proprio}: roda numa carteira própria, sem outros ativos.`);
  for (const ativo of ativos) {
    const onde = `ativos.${ativo}`;
    const espec = ESPECIFICACOES[ativo];
    if (!espec) {
      erros.push(`${onde}: ativo desconhecido.`);
      continue;
    }
    if (espec.conta !== p.conta) erros.push(`${onde}: o ativo é da conta ${espec.conta}, não da ${p.conta}.`);
    const a = p.ativos[ativo];
    camposDesconhecidos(a, CAMPOS_ATIVO, onde, erros);
    if (!(numero(a.riscoPct) && a.riscoPct > 0 && a.riscoPct <= 10)) erros.push(`${onde}.riscoPct: entre 0 e 10.`);
    if (!(numero(a.pisoAtr) && a.pisoAtr > 0)) erros.push(`${onde}.pisoAtr: maior que 0.`);
    if (!(numero(a.alvo1R) && a.alvo1R > 0)) erros.push(`${onde}.alvo1R: maior que 0.`);
    if (!(numero(a.alvo2R) && a.alvo2R > a.alvo1R)) erros.push(`${onde}.alvo2R: maior que o alvo 1.`);
    if (!(numero(a.rrMinimo) && a.rrMinimo > 0)) erros.push(`${onde}.rrMinimo: maior que 0.`);
    if (!(inteiro(a.slippageTicks) && a.slippageTicks >= 0)) erros.push(`${onde}.slippageTicks: inteiro, 0 ou mais.`);
    if (a.custoPorContrato !== null && !(numero(a.custoPorContrato) && a.custoPorContrato >= 0)) {
      erros.push(`${onde}.custoPorContrato: nulo (pendente) ou 0 ou mais.`);
    }
    if (!(inteiro(a.diasUteisEncerrarAntesDoLimite) && a.diasUteisEncerrarAntesDoLimite >= 0)) {
      erros.push(`${onde}.diasUteisEncerrarAntesDoLimite: inteiro, 0 ou mais.`);
    }
    if (!(inteiro(a.diasUteisMinimosAteOLimite) && a.diasUteisMinimosAteOLimite > a.diasUteisEncerrarAntesDoLimite)) {
      erros.push(`${onde}.diasUteisMinimosAteOLimite: inteiro, maior que os dias para encerrar.`);
    }
    if (!(inteiro(a.liquidezMinima) && a.liquidezMinima >= 0)) erros.push(`${onde}.liquidezMinima: inteiro, 0 ou mais.`);
  }

  const c = p.carteira || {};
  camposDesconhecidos(c, CAMPOS_CARTEIRA, "carteira", erros);
  if (!(inteiro(c.maxPosicoes) && c.maxPosicoes >= 1)) erros.push("carteira.maxPosicoes: inteiro, 1 ou mais.");
  for (const campo of ["perdaDiariaPct", "perdaSemanalPct", "drawdownMaxPct"]) {
    if (!(numero(c[campo]) && c[campo] > 0 && c[campo] <= 100)) erros.push(`carteira.${campo}: entre 0 e 100.`);
  }
  if (!(inteiro(c.perdasSeguidas) && c.perdasSeguidas >= 1)) erros.push("carteira.perdasSeguidas: inteiro, 1 ou mais.");
  if (!(inteiro(c.pausaPregoes) && c.pausaPregoes >= 0)) erros.push("carteira.pausaPregoes: inteiro, 0 ou mais.");
  for (const campo of ["saidaAlvo1Pct", "fracaoReduzirPct"]) {
    if (!(numero(c[campo]) && c[campo] > 0 && c[campo] < 100)) erros.push(`carteira.${campo}: entre 0 e 100, exclusive.`);
  }
  if (!(numero(c.fatorOvernight) && c.fatorOvernight > 0 && c.fatorOvernight <= 1)) erros.push("carteira.fatorOvernight: entre 0 e 1.");

  const e = p.execucao || {};
  camposDesconhecidos(e, CAMPOS_EXECUCAO, "execucao", erros);
  if (!QUANTIDADES.includes(e.quantidade)) erros.push(`execucao.quantidade: uma entre ${QUANTIDADES.join(", ")}.`);
  if (!(inteiro(e.periodoAtr) && e.periodoAtr >= 2)) erros.push("execucao.periodoAtr: inteiro, 2 ou mais.");
  if (!(inteiro(e.registroTardioDiasUteis) && e.registroTardioDiasUteis >= 0)) erros.push("execucao.registroTardioDiasUteis: inteiro, 0 ou mais.");
  return erros;
}

// O que não impede a carteira de rodar, mas a tela avisa: hoje, o custo por contrato ainda sem o número real (conta
// como zero). -> [{ codigo, ativo, detalhe }].
function pendencias(p) {
  return Object.entries(p?.ativos || {})
    .filter(([, a]) => a.custoPorContrato === null)
    .map(([ativo]) => ({ codigo: "CUSTO_PENDENTE", ativo, detalhe: `${ativo}: custo por contrato pendente; conta como zero até o número real.` }));
}

// --- Versões (ADR 0127, §8). Uma versão é { versao, tipo, vigente_desde, parametros }:
//   INICIAL e AJUSTE  valem a partir de `vigente_desde`; um AJUSTE abre um segmento novo de medição;
//   CORRECAO_CUSTO    o custo real por contrato: vale desde o início, em TODAS as versões, sem abrir segmento.
// Os parâmetros de uma data são os da última INICIAL ou AJUSTE vigente nela, com o custo da última correção por cima.

const TIPOS_VERSAO = Object.freeze(["INICIAL", "AJUSTE", "CORRECAO_CUSTO"]);

// JSON com as chaves em ordem: dois objetos iguais dão o mesmo texto.
function canonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor && typeof valor === "object") {
    return `{${Object.keys(valor)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valor);
}

const semCustos = (p) => ({
  ...p,
  ativos: Object.fromEntries(Object.entries(p.ativos || {}).map(([ativo, a]) => [ativo, { ...a, custoPorContrato: undefined }]))
});

// Os parâmetros gravados antes do adendo de 2026-10-15 têm o vencimento e a liquidez em `execucao`, um valor para a
// carteira inteira: na leitura, o mesmo valor vai para cada ativo (nada muda no que a carteira fazia). As versões
// gravadas não são reescritas (append-only).
function noFormatoAtual(parametros) {
  const p = structuredClone(parametros);
  const antigos = CAMPOS_VENCIMENTO.filter((campo) => p.execucao && campo in p.execucao);
  if (!antigos.length) return p;
  for (const a of Object.values(p.ativos || {})) {
    for (const campo of antigos) if (!(campo in a)) a[campo] = p.execucao[campo];
  }
  for (const campo of antigos) delete p.execucao[campo];
  return p;
}

// -> { parametros, versao (a base), versaoCusto (a correção aplicada, ou null) }, ou null (nenhuma versão vigente).
function resolverVigenteComVersao(versoes, data) {
  const ordenadas = [...versoes].sort((a, b) => b.versao - a.versao);
  const base = ordenadas.find((v) => v.tipo !== "CORRECAO_CUSTO" && v.vigente_desde <= data);
  if (!base) return null;
  const correcao = ordenadas.find((v) => v.tipo === "CORRECAO_CUSTO");
  const parametros = noFormatoAtual(base.parametros);
  if (correcao) {
    for (const [ativo, a] of Object.entries(parametros.ativos)) {
      const custo = correcao.parametros.ativos?.[ativo]?.custoPorContrato;
      if (custo != null) a.custoPorContrato = custo;
    }
  }
  return { parametros, versao: base.versao, versaoCusto: correcao?.versao ?? null };
}

// -> os parâmetros que valem na data, ou null (nenhuma versão vigente ainda).
function resolverVigente(versoes, data) {
  return resolverVigenteComVersao(versoes, data)?.parametros ?? null;
}

// O tipo de uma mudança: `atuais` são os parâmetros em vigor (os da última versão, com o custo corrigido) e `novos`, os
// propostos. -> { tipo: "AJUSTE" | "CORRECAO_CUSTO" } ou { erro } (nada mudou; custo junto com outra coisa).
function classificarMudanca(atuais, novos) {
  const restoMudou = canonico(semCustos(atuais)) !== canonico(semCustos(novos));
  const custoMudou = Object.entries(novos.ativos || {}).some(([ativo, a]) => a.custoPorContrato !== atuais.ativos?.[ativo]?.custoPorContrato);
  if (!restoMudou && !custoMudou) return { erro: "Nada mudou: nenhuma versão nova." };
  if (restoMudou && custoMudou) {
    return { erro: "Mude o custo por contrato numa versão à parte: ele vale desde o início, e as outras mudanças, a partir da próxima rodada." };
  }
  return { tipo: custoMudou ? "CORRECAO_CUSTO" : "AJUSTE" };
}

module.exports = {
  MODELO,
  PADRAO_POR_ATIVO,
  PADRAO_CARTEIRA,
  PADRAO_EXECUCAO,
  PERDAS_POR_CONTA,
  CAMPOS_VENCIMENTO,
  TIPOS_VERSAO,
  noFormatoAtual,
  parametrosPadrao,
  validarParametros,
  pendencias,
  resolverVigente,
  resolverVigenteComVersao,
  classificarMudanca
};
