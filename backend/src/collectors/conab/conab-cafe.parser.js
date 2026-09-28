"use strict";

// Extrai o CAFÉ de uma planilha de levantamento da Conab (Boletim da Safra de Café, XLS, ~4 por ano).
// ADR 0029. Funciona sobre matrizes de células (array de linhas), como o parser do milho: a leitura do
// arquivo fica em `lerPlanilha`, e o resto é função pura, testável sem arquivo.
//
// Layout conferido nas 15 planilhas com página de levantamento na Conab (jan/2023 a set/2026): 11 abas,
// as mesmas em todas. Tudo é achado pelo TEXTO, nunca pelo número da linha nem da coluna.
//
//   - Abas `1 Café Total`, `2 Café Arábica` e `3 Café Conilon`: uma linha por região, UF e sub-região
//     (as sub-regiões da Bahia e de Minas vêm recuadas com espaços, logo abaixo da UF); três blocos de colunas
//     (`ÁREA EM PRODUÇÃO (ha)`, `PRODUTIVIDADE (sc/ha)`, `PRODUÇÃO (mil sacas beneficiadas)`), cada um com duas
//     safras (`Safra 2025`, `Safra 2026`) e a variação percentual.
//   - Rodapé: "Nota: Estimativa em setembro/2026." (o mês do levantamento; confere a data da página).
//
// Diferenças reais entre as planilhas, tratadas aqui:
//   - O rótulo da safra era "Safra 2022 (a)" até 2024 e virou "Safra 2024", com "(a)" na linha de baixo, em 2025.
//   - A área veio em "mil ha" SÓ na planilha de jan/2023; em todas as outras, em "ha". O valor de "mil ha" é
//     multiplicado por 1.000 (a mesma grandeza, para a série não mudar de escala no meio), e a unidade original
//     fica em `unidadeOriginal`. É a única conversão feita; qualquer outra unidade falha a leitura.
//
// NÃO extraído, de propósito (ADR 0029): a variação percentual (derivada dos dois valores ao lado), as abas de
// área em formação, parque cafeeiro (covas) e % colhido por mês.

const XLSX = require("xlsx");

const ABAS = { "1 Café Total": "TOTAL", "2 Café Arábica": "ARABICA", "3 Café Conilon": "CONILON" };

const RE_BLOCO = /^(ÁREA EM PRODUÇÃO|PRODUTIVIDADE|PRODUÇÃO)\s*\(([^)]+)\)/i;
const RE_SAFRA = /^Safra (\d{4})\b/;
const RE_NOTA_ESTIMATIVA = /Estimativa em ([A-Za-zçÇãÃéÉêÊ]+)\/(\d{4})/i;

const METRICA_DO_BLOCO = { "ÁREA EM PRODUÇÃO": "AREA", PRODUTIVIDADE: "PRODUTIVIDADE", "PRODUÇÃO": "PRODUCAO" };
// Unidade gravada de cada métrica, e as unidades aceitas na planilha com o fator até ela.
const UNIDADE_DA_METRICA = { AREA: "ha", PRODUTIVIDADE: "sc/ha", PRODUCAO: "mil sacas" };
const UNIDADES_ACEITAS = {
  AREA: { ha: 1, "mil ha": 1000 },
  PRODUTIVIDADE: { "sc/ha": 1 },
  PRODUCAO: { "mil sacas beneficiadas": 1 }
};

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

// null = célula vazia; NaN = texto que não é número (vai para os inválidos).
function numero(celula) {
  if (typeof celula === "number") return Number.isFinite(celula) ? celula : NaN;
  const t = texto(celula);
  if (t === "") return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

// "CENTRO-OESTE" -> CENTRO_OESTE, "OUTROS (*)" -> OUTROS, "Sul e Centro-Oeste" -> SUL_E_CENTRO_OESTE.
function slugRegiao(celula) {
  return semAcento(texto(celula).replace(/\(\*\)/g, ""))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Sub-região = rótulo recuado com espaços (vem logo abaixo da UF).
function ehSubRegiao(celula) {
  return typeof celula === "string" && /^\s{2,}\S/.test(celula);
}

// A safra do café é o ano da colheita: "Safra 2026" -> { safra: "2026", observedAt: "2026-01-01" }.
function lerSafra(rotulo) {
  const m = RE_SAFRA.exec(texto(rotulo));
  return m ? { safra: m[1], observedAt: `${m[1]}-01-01` } : null;
}

// "Nota: Estimativa em setembro/2026." -> { mes: 9, ano: 2026 } (ou null).
function lerNotaEstimativa(celula) {
  const m = RE_NOTA_ESTIMATIVA.exec(texto(celula));
  if (!m) return null;
  const mes = MESES_POR_EXTENSO[semAcento(m[1]).toLowerCase()];
  return mes ? { mes, ano: Number(m[2]) } : null;
}

// Uma aba -> { observacoes, invalidos, estimativa }. Lança Error se o layout não é o esperado.
function extrairAba(linhas, tipo) {
  const cabecalho = linhas.findIndex((l) => texto(l[0]) === "REGIÃO/UF");
  if (cabecalho < 0) throw new Error(`aba "${tipo}": cabeçalho "REGIÃO/UF" não encontrado.`);

  const linhaBlocos = linhas[cabecalho];
  const linhaSafras = linhas[cabecalho + 1] || [];
  const inicios = [];
  linhaBlocos.forEach((celula, coluna) => {
    const m = RE_BLOCO.exec(texto(celula));
    if (m) inicios.push({ coluna, metrica: METRICA_DO_BLOCO[m[1].toUpperCase()], unidadeOriginal: texto(m[2]) });
  });
  if (inicios.length !== 3) throw new Error(`aba "${tipo}": esperava 3 blocos (área em produção, produtividade, produção), achei ${inicios.length}.`);

  const blocos = inicios.map((bloco, i) => {
    const fator = UNIDADES_ACEITAS[bloco.metrica][bloco.unidadeOriginal];
    if (!fator) {
      throw new Error(`aba "${tipo}": unidade de ${bloco.metrica} não reconhecida ("${bloco.unidadeOriginal}").`);
    }
    const fim = i + 1 < inicios.length ? inicios[i + 1].coluna : linhaSafras.length;
    const safras = [];
    for (let coluna = bloco.coluna; coluna < fim; coluna += 1) {
      const safra = lerSafra(linhaSafras[coluna]);
      if (safra) safras.push({ coluna, ...safra });
    }
    if (safras.length === 0) throw new Error(`aba "${tipo}": bloco de ${bloco.metrica} sem colunas de safra.`);
    return { ...bloco, fator, safras };
  });

  const observacoes = [];
  const invalidos = [];
  let temBrasil = false;
  let estimativa = null;
  let uf = null;

  for (let k = cabecalho + 2; k < linhas.length; k += 1) {
    const linha = linhas[k];
    const celula = linha[0];
    const nota = lerNotaEstimativa(celula);
    if (nota) estimativa = nota;
    // Linhas de dado têm rótulo de texto; as de "0" soltas (sobra de fórmula), "(a) (b)", legenda e fonte não.
    if (typeof celula !== "string" || !texto(celula) || /^(Fonte|Nota|Legenda)\b/i.test(texto(celula))) continue;

    let regiao = slugRegiao(celula);
    if (ehSubRegiao(celula)) {
      if (!uf) throw new Error(`aba "${tipo}": sub-região "${texto(celula)}" sem UF acima.`);
      regiao = `${uf}_${regiao}`;
    } else {
      uf = /^[A-Z]{2}$/.test(regiao) ? regiao : null;
    }
    if (regiao === "BRASIL") temBrasil = true;

    for (const bloco of blocos) {
      for (const safra of bloco.safras) {
        const valor = numero(linha[safra.coluna]);
        if (valor === null) continue;
        if (Number.isNaN(valor)) {
          invalidos.push({ motivo: `aba "${tipo}", ${texto(celula)}, ${bloco.metrica} ${safra.safra}: valor não numérico ("${texto(linha[safra.coluna])}").` });
          continue;
        }
        observacoes.push({
          seriesCode: `CONAB.CAFE.${regiao}.${bloco.metrica}_${tipo}`,
          observedAt: safra.observedAt,
          valor: valor * bloco.fator,
          unidade: UNIDADE_DA_METRICA[bloco.metrica],
          ...(bloco.fator !== 1 && { unidadeOriginal: bloco.unidadeOriginal }),
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

// Planilha lida ([{ nome, linhas }]) -> tudo do café. Lança Error se alguma aba esperada faltar ou se as abas
// discordarem do mês da estimativa.
function extrairLevantamento(planilha) {
  const porNome = new Map(planilha.map((aba) => [aba.nome.trim(), aba.linhas]));
  const observacoes = [];
  const invalidos = [];
  let estimativa = null;

  for (const [nomeAba, tipo] of Object.entries(ABAS)) {
    if (!porNome.has(nomeAba)) throw new Error(`aba "${nomeAba}" não encontrada na planilha.`);
    const aba = extrairAba(porNome.get(nomeAba), tipo);
    observacoes.push(...aba.observacoes);
    invalidos.push(...aba.invalidos);
    if (aba.estimativa) {
      if (estimativa && (estimativa.mes !== aba.estimativa.mes || estimativa.ano !== aba.estimativa.ano)) {
        throw new Error(`as abas discordam do mês da estimativa (${estimativa.mes}/${estimativa.ano} x ${aba.estimativa.mes}/${aba.estimativa.ano}).`);
      }
      estimativa = aba.estimativa;
    }
  }
  return { observacoes, invalidos, estimativa };
}

function lerPlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames.map((nome) => ({
    nome,
    linhas: XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: true })
  }));
}

module.exports = { extrairLevantamento, extrairAba, lerPlanilha, slugRegiao, lerSafra, lerNotaEstimativa, ABAS, UNIDADE_DA_METRICA };
