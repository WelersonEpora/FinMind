"use strict";

// Extrai o MILHO (ADR 0017) e a SOJA (ADR 0114) de uma planilha de levantamento da Conab (Boletim da Safra de Grãos,
// XLSX mensal). O que muda por produto (abas e leitor do balanço) está em PRODUTOS; os comentários abaixo descrevem o
// milho, e o da soja está em `extrairBalancoSoja`. Funciona sobre matrizes de células (array de linhas), não sobre o arquivo: a leitura do
// XLSX fica em `lerPlanilha`, e o resto é função pura, testável sem arquivo.
//
// O layout foi conferido nas 15 planilhas que o índice da Conab mantém (safras 2024/25 e 2025/26,
// de fev/2025 a set/2026): mesmas abas e mesmo cabeçalho em todas. Tudo é achado pelo TEXTO, nunca
// pelo número da linha nem da coluna.
//
//   - Abas `Milho 1a`, `Milho 2a`, `Milho 3a` e `Milho Total`: uma linha por Região/UF (as macrorregiões,
//     as 27 UFs e `BRASIL`); três blocos de colunas (`ÁREA (Em mil ha)`, `PRODUTIVIDADE (Em kg/ha)`,
//     `PRODUÇÃO (Em mil t)`), cada um com duas safras (`Safra 24/25`, `Safra 25/26`) e a variação
//     percentual (`VAR. %`).
//   - Aba `Suprimento` (todos os produtos): o bloco `MILHO` traz uma linha por safra, com estoque inicial,
//     produção, importação, suprimento, consumo, exportação, demanda total e estoque final (mil t). A safra em
//     projeção aparece em DUAS linhas (mês anterior e mês atual, rótulos `ago/26` e `set/26`): fica a última.
//
// NÃO extraído, de propósito: a variação percentual (`VAR. %`, derivada dos dois valores ao lado) e o
// `Estoque de Passagem`. Nenhum cálculo, conversão de unidade nem interpretação: só valores publicados.

const XLSX = require("xlsx");

const ABAS_DE_SAFRA = { "Milho 1a": "1A", "Milho 2a": "2A", "Milho 3a": "3A", "Milho Total": "TOTAL" };
const ABA_BALANCO = "Suprimento";

const RE_BLOCO = /^(ÁREA|PRODUTIVIDADE|PRODUÇÃO)\s*\(Em ([^)]+)\)/i;
const RE_SAFRA = /^Safra (\d{2})\/(\d{2})$/;
const RE_SAFRA_BALANCO = /^(\d{4})\/(\d{2})$/;
const RE_MES_ROTULO = /^([a-z]{3})\/(\d{2})$/;
const RE_NOTA_ESTIMATIVA = /^Nota:\s*Estimativa em ([A-Za-zçÇãÃéÉêÊ]+)\/(\d{4})/i;

const METRICA_DO_BLOCO = { "ÁREA": "AREA", PRODUTIVIDADE: "PRODUTIVIDADE", "PRODUÇÃO": "PRODUCAO" };
// Unidade esperada de cada métrica: se a Conab mudar, a leitura falha em vez de gravar um número na unidade errada.
const UNIDADE_DA_METRICA = { AREA: "mil ha", PRODUTIVIDADE: "kg/ha", PRODUCAO: "mil t" };

const COLUNAS_DO_BALANCO = {
  "ESTOQUE INICIAL": "ESTOQUE_INICIAL",
  PRODUCAO: "PRODUCAO",
  IMPORTACAO: "IMPORTACAO",
  SUPRIMENTO: "SUPRIMENTO",
  CONSUMO: "CONSUMO",
  EXPORTACAO: "EXPORTACAO",
  "DEMANDA TOTAL": "DEMANDA_TOTAL",
  "ESTOQUE FINAL": "ESTOQUE_FINAL"
};
const UNIDADE_DO_BALANCO = "mil t";

const MESES_PT = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const MESES_POR_EXTENSO = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
};

function texto(celula) {
  if (celula === null || celula === undefined) return "";
  return String(celula).replace(/\s+/g, " ").trim();
}

function semAcento(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// null = célula vazia ou só espaços (a Conab deixa a produtividade em branco onde a área é zero);
// NaN = texto que não é número (vai para os inválidos).
function numero(celula) {
  if (typeof celula === "number") return Number.isFinite(celula) ? celula : NaN;
  const t = texto(celula);
  if (t === "") return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

// "CENTRO-OESTE" -> CENTRO_OESTE, "NORTE/NORDESTE" -> NORTE_NORDESTE, "MT" -> MT.
function slugRegiao(celula) {
  return semAcento(texto(celula))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// "Safra 25/26" -> { safra: "2025/26", observedAt: "2025-09-01" }. O ano de início mais 1 tem de ser o
// segundo número, senão o rótulo não é uma safra (barra `Safra 24/26`).
function lerSafra(anoInicial2Digitos, anoFinal2Digitos) {
  const inicio = 2000 + Number(anoInicial2Digitos);
  if ((inicio + 1) % 100 !== Number(anoFinal2Digitos)) return null;
  return { safra: `${inicio}/${anoFinal2Digitos}`, observedAt: `${inicio}-09-01` };
}

// "set/26" -> { mes: 9, ano: 2026 } ou null.
function lerMesRotulo(celula) {
  const m = RE_MES_ROTULO.exec(texto(celula).toLowerCase());
  if (!m || !MESES_PT[m[1]]) return null;
  return { mes: MESES_PT[m[1]], ano: 2000 + Number(m[2]) };
}

// ---------------------------------------------------------------- abas de safra (1a, 2a, 3a, total)

// Uma aba -> { observacoes, invalidos, estimativa }. Lança Error se o layout não é o esperado.
function extrairAbaDeSafra(linhas, tipo, serie = "MILHO") {
  const cabecalho = linhas.findIndex((l) => texto(l[0]) === "REGIÃO/UF");
  if (cabecalho < 0) throw new Error(`aba "${tipo}": cabeçalho "REGIÃO/UF" não encontrado.`);

  // Blocos de colunas: a métrica e a unidade vêm do texto do bloco; as safras, da linha de baixo.
  const linhaBlocos = linhas[cabecalho];
  const linhaSafras = linhas[cabecalho + 1] || [];
  const inicios = [];
  linhaBlocos.forEach((celula, coluna) => {
    const m = RE_BLOCO.exec(texto(celula));
    if (m) inicios.push({ coluna, metrica: METRICA_DO_BLOCO[m[1].toUpperCase()], unidade: texto(m[2]) });
  });
  if (inicios.length !== 3) throw new Error(`aba "${tipo}": esperava 3 blocos (área, produtividade, produção), achei ${inicios.length}.`);

  const blocos = inicios.map((bloco, i) => {
    const fim = i + 1 < inicios.length ? inicios[i + 1].coluna : linhaSafras.length;
    const safras = [];
    for (let coluna = bloco.coluna; coluna < fim; coluna += 1) {
      const m = RE_SAFRA.exec(texto(linhaSafras[coluna]));
      if (!m) continue;
      const safra = lerSafra(m[1], m[2]);
      if (!safra) throw new Error(`aba "${tipo}": rótulo de safra inválido "${texto(linhaSafras[coluna])}".`);
      safras.push({ coluna, ...safra });
    }
    if (safras.length === 0) throw new Error(`aba "${tipo}": bloco de ${bloco.metrica} sem colunas de safra.`);
    if (bloco.unidade !== UNIDADE_DA_METRICA[bloco.metrica]) {
      throw new Error(`aba "${tipo}": unidade de ${bloco.metrica} mudou (esperava "${UNIDADE_DA_METRICA[bloco.metrica]}", veio "${bloco.unidade}").`);
    }
    return { ...bloco, safras };
  });

  // Dados: a partir da primeira linha com rótulo depois da linha de safras (a de baixo, "(a) (b) (b/a)", não tem rótulo).
  const observacoes = [];
  const invalidos = [];
  let temBrasil = false;
  let estimativa = null;
  let dentro = false;

  for (let k = cabecalho + 2; k < linhas.length; k += 1) {
    const linha = linhas[k];
    const rotulo = texto(linha[0]);
    const nota = RE_NOTA_ESTIMATIVA.exec(rotulo);
    if (nota) {
      const mes = MESES_POR_EXTENSO[semAcento(nota[1]).toLowerCase()];
      if (mes) estimativa = { mes, ano: Number(nota[2]) };
    }
    if (!rotulo) {
      if (dentro) dentro = false;
      continue;
    }
    if (/^(Fonte|Nota)\b/i.test(rotulo)) {
      dentro = false;
      continue;
    }
    dentro = true;

    const regiao = slugRegiao(rotulo);
    if (regiao === "BRASIL") temBrasil = true;

    for (const bloco of blocos) {
      for (const safra of bloco.safras) {
        const valor = numero(linha[safra.coluna]);
        if (valor === null) continue;
        if (Number.isNaN(valor)) {
          invalidos.push({ motivo: `aba "${tipo}", ${rotulo}, ${bloco.metrica} ${safra.safra}: valor não numérico ("${texto(linha[safra.coluna])}").` });
          continue;
        }
        observacoes.push({
          seriesCode: `CONAB.${serie}.${regiao}.${bloco.metrica}_${tipo}`,
          observedAt: safra.observedAt,
          valor,
          unidade: bloco.unidade,
          tipo,
          regiao,
          metrica: bloco.metrica,
          safra: safra.safra
        });
      }
    }
  }

  if (!temBrasil) throw new Error(`aba "${tipo}": linha BRASIL não encontrada.`);
  return { observacoes, invalidos, estimativa };
}

// ---------------------------------------------------------------- balanço (aba Suprimento)

// Bloco MILHO da aba Suprimento -> { observacoes, invalidos, mesAtual }. Lança Error se o layout mudou.
function extrairBalanco(linhas) {
  const cabecalho = linhas.findIndex((l) => texto(l[0]) === "PRODUTO" && texto(l[1]) === "SAFRA");
  if (cabecalho < 0) throw new Error('aba "Suprimento": cabeçalho "PRODUTO / SAFRA" não encontrado.');

  const colunas = [];
  linhas[cabecalho].forEach((celula, coluna) => {
    const codigo = COLUNAS_DO_BALANCO[semAcento(texto(celula)).toUpperCase()];
    if (codigo) colunas.push({ coluna, codigo });
  });
  if (colunas.length !== Object.keys(COLUNAS_DO_BALANCO).length) {
    throw new Error(`aba "Suprimento": esperava ${Object.keys(COLUNAS_DO_BALANCO).length} colunas de balanço, achei ${colunas.length}.`);
  }

  const inicio = linhas.findIndex((l, i) => i > cabecalho && semAcento(texto(l[0])).toUpperCase() === "MILHO");
  if (inicio < 0) throw new Error('aba "Suprimento": bloco MILHO não encontrado.');

  // Uma linha por safra; a safra em projeção tem uma 2ª linha SEM rótulo de safra (mês atual): a última vale.
  const porSafra = new Map();
  let safraAtual = null;
  let mesAtual = null;
  for (let k = inicio; k < linhas.length; k += 1) {
    const linha = linhas[k];
    if (k > inicio && texto(linha[0])) break; // outro produto
    const rotuloSafra = texto(linha[1]);
    if (rotuloSafra) {
      if (!RE_SAFRA_BALANCO.test(rotuloSafra)) break;
      safraAtual = rotuloSafra;
    } else if (!safraAtual || !texto(linha[2])) {
      break;
    }
    const mes = lerMesRotulo(linha[2]);
    if (mes) mesAtual = mes;
    porSafra.set(safraAtual, linha);
  }
  if (porSafra.size === 0) throw new Error('aba "Suprimento": bloco MILHO sem safras.');

  const observacoes = [];
  const invalidos = [];
  for (const [rotulo, linha] of porSafra) {
    const m = RE_SAFRA_BALANCO.exec(rotulo);
    const safra = lerSafra(m[1].slice(2), m[2]);
    if (!safra) {
      invalidos.push({ motivo: `aba "Suprimento": rótulo de safra inválido "${rotulo}".` });
      continue;
    }
    for (const { coluna, codigo } of colunas) {
      const valor = numero(linha[coluna]);
      if (valor === null) continue;
      if (Number.isNaN(valor)) {
        invalidos.push({ motivo: `aba "Suprimento", milho ${rotulo}, ${codigo}: valor não numérico ("${texto(linha[coluna])}").` });
        continue;
      }
      observacoes.push({
        seriesCode: `CONAB.MILHO.BALANCO.${codigo}`,
        observedAt: safra.observedAt,
        valor,
        unidade: UNIDADE_DO_BALANCO,
        tipo: "BALANCO",
        regiao: "BRASIL",
        metrica: codigo,
        safra: safra.safra
      });
    }
  }
  return { observacoes, invalidos, mesAtual };
}

// ---------------------------------------------------------------- balanço da soja (aba Suprimento - Soja)

// A soja tem aba própria de balanço, TRANSPOSTA em relação à do milho (conferida nos 15 levantamentos): as safras nas
// colunas (de 2020/21 até a corrente, todas reestimadas a cada levantamento) e uma linha por item, em três blocos
// numerados: "1. Soja em grão", "2. Farelo" e "3. Óleo". Só o grão é lido (como no WASDE, ADR 0111). A nota "Estimativa
// em <mês>/<ano>" no rodapé é o mês do balanço. Unidade: mil t (a produção é a da aba "Soja", em mil t).
const ITENS_DO_BALANCO_SOJA = {
  "ESTOQUE INICIAL": "ESTOQUE_INICIAL",
  PRODUCAO: "PRODUCAO",
  IMPORTACAO: "IMPORTACAO",
  "SEMENTES/OUTROS": "SEMENTES_OUTROS",
  EXPORTACAO: "EXPORTACAO",
  PROCESSAMENTO: "PROCESSAMENTO",
  "ESTOQUE FINAL": "ESTOQUE_FINAL"
};

// Aba "Suprimento - Soja" -> { observacoes, invalidos, mesAtual }. Lança Error se o layout mudou.
function extrairBalancoSoja(linhas) {
  const cabecalho = linhas.findIndex((l) => texto(l[0]) === "PRODUTO" && texto(l[1]) === "SAFRA");
  if (cabecalho < 0) throw new Error('aba "Suprimento - Soja": cabeçalho "PRODUTO / SAFRA" não encontrado.');
  const safras = [];
  (linhas[cabecalho + 1] || []).forEach((celula, coluna) => {
    const m = RE_SAFRA_BALANCO.exec(texto(celula));
    if (!m) return;
    const safra = lerSafra(m[1].slice(2), m[2]);
    if (!safra) throw new Error(`aba "Suprimento - Soja": rótulo de safra inválido "${texto(celula)}".`);
    safras.push({ coluna, ...safra });
  });
  if (safras.length === 0) throw new Error('aba "Suprimento - Soja": nenhuma safra no cabeçalho.');

  const inicio = linhas.findIndex((l, i) => i > cabecalho && /^1\.\s*Soja em gr[aã]o$/i.test(texto(l[0])));
  if (inicio < 0) throw new Error('aba "Suprimento - Soja": bloco "1. Soja em grão" não encontrado.');

  const observacoes = [];
  const invalidos = [];
  const itensAchados = new Set();
  let mesAtual = null;
  for (let k = inicio + 1; k < linhas.length; k += 1) {
    const rotulo = texto(linhas[k][0]);
    const nota = RE_NOTA_ESTIMATIVA.exec(rotulo);
    if (nota) {
      const mes = MESES_POR_EXTENSO[semAcento(nota[1]).toLowerCase()];
      if (mes) mesAtual = { mes, ano: Number(nota[2]) };
    }
    // Itens do grão: "1.1. Estoque Inicial" ... "1.7. Estoque Final". O bloco seguinte ("2. Farelo") encerra.
    const item = /^1\.\d+\.?\s*(.+)$/.exec(rotulo);
    if (!item) continue;
    const codigo = ITENS_DO_BALANCO_SOJA[semAcento(item[1]).toUpperCase().replace(/\s+/g, " ")];
    if (!codigo) {
      invalidos.push({ motivo: `aba "Suprimento - Soja": item desconhecido "${rotulo}".` });
      continue;
    }
    itensAchados.add(codigo);
    for (const safra of safras) {
      const valor = numero(linhas[k][safra.coluna]);
      if (valor === null) continue;
      if (Number.isNaN(valor)) {
        invalidos.push({ motivo: `aba "Suprimento - Soja", ${codigo} ${safra.safra}: valor não numérico ("${texto(linhas[k][safra.coluna])}").` });
        continue;
      }
      observacoes.push({
        seriesCode: `CONAB.SOJA.BALANCO.${codigo}`,
        observedAt: safra.observedAt,
        valor,
        unidade: UNIDADE_DO_BALANCO,
        tipo: "BALANCO",
        regiao: "BRASIL",
        metrica: codigo,
        safra: safra.safra
      });
    }
  }
  const faltando = Object.values(ITENS_DO_BALANCO_SOJA).filter((c) => !itensAchados.has(c));
  if (faltando.length > 0) throw new Error(`aba "Suprimento - Soja": itens do grão não encontrados: ${faltando.join(", ")}.`);
  return { observacoes, invalidos, mesAtual };
}

// Um produto por entrada: as abas de safra (nome -> tipo), a aba do balanço e o leitor dela, e o segmento do código da
// série (`CONAB.<serie>.<REGIAO>.<METRICA>_<TIPO>`, `CONAB.<serie>.BALANCO.<ITEM>`).
const PRODUTOS = {
  milho: { nome: "milho", serie: "MILHO", abasDeSafra: ABAS_DE_SAFRA, abaBalanco: ABA_BALANCO, extrairBalanco },
  soja: { nome: "soja", serie: "SOJA", abasDeSafra: { Soja: "TOTAL" }, abaBalanco: "Suprimento - Soja", extrairBalanco: extrairBalancoSoja }
};

// ---------------------------------------------------------------- levantamento inteiro

// Planilha lida ([{ nome, linhas }]) -> tudo do produto (padrão: o milho). Lança Error se alguma aba esperada faltar.
function extrairLevantamento(planilha, produto = PRODUTOS.milho) {
  const porNome = new Map(planilha.map((aba) => [aba.nome, aba.linhas]));
  const observacoes = [];
  const invalidos = [];
  let estimativa = null;

  for (const [nomeAba, tipo] of Object.entries(produto.abasDeSafra)) {
    if (!porNome.has(nomeAba)) throw new Error(`aba "${nomeAba}" não encontrada na planilha.`);
    const aba = extrairAbaDeSafra(porNome.get(nomeAba), tipo, produto.serie);
    observacoes.push(...aba.observacoes);
    invalidos.push(...aba.invalidos);
    if (tipo === "TOTAL") estimativa = aba.estimativa;
  }

  if (!porNome.has(produto.abaBalanco)) throw new Error(`aba "${produto.abaBalanco}" não encontrada na planilha.`);
  const balanco = produto.extrairBalanco(porNome.get(produto.abaBalanco));
  observacoes.push(...balanco.observacoes);
  invalidos.push(...balanco.invalidos);

  return { observacoes, invalidos, estimativa, mesBalanco: balanco.mesAtual };
}

function lerPlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames.map((nome) => ({
    nome,
    linhas: XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: true })
  }));
}

module.exports = {
  PRODUTOS,
  extrairLevantamento,
  extrairAbaDeSafra,
  extrairBalanco,
  extrairBalancoSoja,
  lerPlanilha,
  slugRegiao,
  lerSafra,
  lerMesRotulo,
  ABAS_DE_SAFRA,
  ABA_BALANCO,
  UNIDADE_DA_METRICA,
  UNIDADE_DO_BALANCO
};
