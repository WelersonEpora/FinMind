"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { lerPlanilha, lerIndice, extrairAba, extrairCusto, codigoDoLocal } = require("./imea-custo-milho.parser");

// --- fixtures no layout real das planilhas do IMEA (conferido nas 4 publicadas em 15/09/2026) ---

function linhasAba({ titulo1, tecnologiaTitulo, localTitulo, colSafra, colAno, colMes, itens, unidadeLinha = "Unidade: R$/ha." }) {
  return [
    [],
    [titulo1],
    [tecnologiaTitulo],
    [localTitulo],
    [],
    ["Safra", ...colSafra],
    ["Ano", ...colAno],
    ["Mês", ...colMes],
    ...itens,
    [unidadeLinha],
    ["Fonte: Imea."]
  ];
}

function abaMensal(local, { tecnologia = "ALTA", itens = [["A. CUSTEIO (1+2...+6)", 3696.73, 3779.19, 3788.94]] } = {}) {
  return linhasAba({
    titulo1: "        CUSTO DE PRODUÇÃO MENSAL",
    tecnologiaTitulo: `MILHO ${tecnologia === "ALTA" ? "ALTA" : "MÉDIA"} TECNOLOGIA`,
    localTitulo: local,
    colSafra: ["2026/27", "2026/27", "2026/27"],
    colAno: [2026, 2026, 2026],
    colMes: ["Junho", "Julho", "Agosto*"],
    itens
  });
}

function abaPonderado(local, { tecnologia = "ALTA", itens = [["A. CUSTEIO (1+2...+6)", 3536.44, 3535.73]] } = {}) {
  return linhasAba({
    titulo1: "CUSTO DE PRODUÇÃO",
    tecnologiaTitulo: `MILHO ${tecnologia === "ALTA" ? "ALTA" : "MÉDIA"} TECNOLOGIA`,
    localTitulo: local,
    colSafra: ["2025/26", "2026/27"],
    colAno: [2025, 2026],
    colMes: ["Consolidado", "Julho"],
    itens
  });
}

// --- lerIndice ---

test("lerIndice: só linhas 'Milho_*' com local preenchido, na ordem da planilha", () => {
  const linhas = [
    ["Item", "Dados", "Local", "Unidade"],
    ["Milho_MT", "Custo de produção da Safra de Milho", "MT", "R$/ha"],
    ["Milho_Mensal_ALTA_sor", "Custo de produção da Safra de Milho", "Sorriso", "R$/ha"],
    ["Milho_Mensal_ALTA_nmt", "Custo de produção da Safra de Milho", "", "R$/ha"], // sem local: fora
    ["OutraCoisa", "x", "Nova Mutum", "R$/ha"] // não começa com Milho_: fora
  ];
  assert.deepEqual(lerIndice(linhas), [
    { aba: "Milho_MT", local: "MT" },
    { aba: "Milho_Mensal_ALTA_sor", local: "Sorriso" }
  ]);
});

// --- codigoDoLocal ---

test("codigoDoLocal: 'MT' é o estado; os demais são o slug do município", () => {
  assert.equal(codigoDoLocal("MT"), "MATO_GROSSO");
  assert.equal(codigoDoLocal("Tangará da Serra"), "TANGARA_DA_SERRA");
});

// --- extrairAba: caminho feliz ---

test("extrairAba: planilha Mensal - uma observação por mês, série com tipo/período/tecnologia/local/item", () => {
  const { observacoes, invalidos } = extrairAba(abaMensal("Mato Grosso"), { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" });

  assert.equal(invalidos.length, 0);
  assert.deepEqual(
    observacoes.map((o) => [o.seriesCode, o.observedAt, o.valor, o.unidade, o.estimativa]),
    [
      ["IMEA.CUSTO.MILHO.MES.MENSAL_ALTA_MATO_GROSSO.A_CUSTEIO", "2026-06-01", 3696.73, "R$/ha", false],
      ["IMEA.CUSTO.MILHO.MES.MENSAL_ALTA_MATO_GROSSO.A_CUSTEIO", "2026-07-01", 3779.19, "R$/ha", false],
      ["IMEA.CUSTO.MILHO.MES.MENSAL_ALTA_MATO_GROSSO.A_CUSTEIO", "2026-08-01", 3788.94, "R$/ha", true]
    ]
  );
});

test("extrairAba: planilha Ponderado - coluna 'Consolidado' vira SAFRA (1º de setembro do ano de início)", () => {
  const { observacoes } = extrairAba(abaPonderado("Mato Grosso"), { tipo: "PONDERADO", tecnologia: "ALTA", local: "Mato Grosso" });

  assert.deepEqual(
    observacoes.map((o) => [o.seriesCode, o.periodo, o.observedAt, o.valor, o.safra]),
    [
      ["IMEA.CUSTO.MILHO.SAFRA.ALTA_MATO_GROSSO.A_CUSTEIO", "SAFRA", "2025-09-01", 3536.44, "2025/26"],
      ["IMEA.CUSTO.MILHO.MES.PONDERADO_ALTA_MATO_GROSSO.A_CUSTEIO", "MES", "2026-07-01", 3535.73, "2026/27"]
    ]
  );
});

test("extrairAba: valor arredondado a 6 casas (a planilha calcula com mais precisão que o DECIMAL(18,6) do banco guarda)", () => {
  // Achado real (2026-09-22): sem arredondar aqui, Number(27.8871875).toFixed(6) ("27.887187", o jeito do JS
  // arredondar o float) discorda do que o MariaDB grava ao inserir o mesmo float bruto ("27.887188", arredondamento
  // decimal do banco) - a mesma coleta relida gerava uma "revisão" falsa a cada execução, sem o valor ter mudado.
  const itens = [["Benfeitorias", 27.8871875]];
  const { observacoes } = extrairAba(abaMensal("Mato Grosso", { itens }), { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" });
  assert.equal(observacoes[0].valor, 27.887187);
  // Idempotente: arredondar de novo o valor já arredondado não muda nada.
  assert.equal(Number(observacoes[0].valor.toFixed(6)), observacoes[0].valor);
});

test("extrairAba: '-' e célula vazia são ausência (não viram zero); zero numérico publicado é mantido", () => {
  const itens = [["Semente de Cobertura", " -  ", "", 0]];
  const { observacoes, invalidos } = extrairAba(abaMensal("Mato Grosso", { itens }), { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" });

  assert.equal(invalidos.length, 0);
  assert.equal(observacoes.length, 1, "só a coluna de Agosto (0) vira observação; Junho e Julho ficam de fora, sem inventar valor");
  assert.equal(observacoes[0].observedAt, "2026-08-01");
  assert.equal(observacoes[0].valor, 0);
});

test("extrairAba: local é o município (não o estado) quando o título e o Índice dizem o município", () => {
  const { observacoes } = extrairAba(abaMensal("Sorriso"), { tipo: "MENSAL", tecnologia: "ALTA", local: "Sorriso" });
  assert.equal(observacoes[0].seriesCode, "IMEA.CUSTO.MILHO.MES.MENSAL_ALTA_SORRISO.A_CUSTEIO");
  assert.equal(observacoes[0].localNome, "Sorriso");
});

test("extrairAba: preposição grafada diferente entre Índice e título da aba não barra (Campo Novo do/dos Parecis)", () => {
  const linhas = abaMensal("CAMPO NOVO DOS PARECIS");
  const { invalidos } = extrairAba(linhas, { tipo: "MENSAL", tecnologia: "ALTA", local: "Campo Novo do Parecis" });
  assert.equal(invalidos.length, 0);
});

// --- extrairAba: itens com unidade própria (produtividade modal, dólar) ---

test("extrairAba: 'Produtividade Modal (Sc/ha)**' e 'Dólar compra (R$/US$)' saem na PRÓPRIA unidade, não em R$/ha", () => {
  const itens = [
    ["Produtividade Modal (Sc/ha)**", 119.17, 119.23, 119.17],
    ["Dólar compra (R$/US$)", 5.1133, 5.1223, 5.1526]
  ];
  const { observacoes, invalidos } = extrairAba(abaMensal("Mato Grosso", { itens }), { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" });

  assert.equal(invalidos.length, 0);
  const porItem = Object.fromEntries(observacoes.map((o) => [`${o.item}|${o.observedAt}`, o]));
  assert.equal(porItem["PRODUTIVIDADE_MODAL|2026-06-01"].unidade, "sc/ha");
  assert.equal(porItem["DOLAR_COMPRA|2026-06-01"].unidade, "R$/US$");
});

test("extrairAba: um rótulo com unidade entre parênteses que NÃO é uma linha conhecida vira inválido (não grava como R$/ha)", () => {
  const itens = [["Novo Item (US$/ha)", 10, 20, 30]];
  const { observacoes, invalidos } = extrairAba(abaMensal("Mato Grosso", { itens }), { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" });
  assert.equal(observacoes.length, 0);
  assert.match(invalidos[0].motivo, /indica uma unidade que não é a da planilha/);
});

// --- extrairAba: guardas de layout ---

test("extrairAba: título de tecnologia diferente do arquivo é barrado", () => {
  assert.throws(() => extrairAba(abaMensal("Mato Grosso", { tecnologia: "MEDIA" }), { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" }), /tecnologia ALTA/);
});

test("extrairAba: título sem 'MENSAL' num arquivo Mensal (ou com 'MENSAL' num Ponderado) é barrado", () => {
  assert.throws(() => extrairAba(abaPonderado("Mato Grosso"), { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" }), /não diz "MENSAL"/);
  assert.throws(() => extrairAba(abaMensal("Mato Grosso"), { tipo: "PONDERADO", tecnologia: "ALTA", local: "Mato Grosso" }), /diz "MENSAL"/);
});

test("extrairAba: título de local diferente do Índice é barrado", () => {
  assert.throws(() => extrairAba(abaMensal("Sorriso"), { tipo: "MENSAL", tecnologia: "ALTA", local: "Sinop" }), /não é o local "SINOP"/);
});

test("extrairAba: linhas de cabeçalho Safra/Ano/Mês ausentes são barradas", () => {
  const semCabecalho = [[], ["CUSTO DE PRODUÇÃO MENSAL"], ["MILHO ALTA TECNOLOGIA"], ["MATO GROSSO"]];
  assert.throws(() => extrairAba(semCabecalho, { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" }), /não foram encontradas/);
});

test("extrairAba: unidade da planilha diferente de R$/ha é barrada (guarda contra a fonte mudar a unidade)", () => {
  const linhas = abaMensal("Mato Grosso", { itens: [["A. CUSTEIO (1+2...+6)", 1, 2, 3]] }).map((l) => (l[0] === "Unidade: R$/ha." ? ["Unidade: R$/saca."] : l));
  assert.throws(() => extrairAba(linhas, { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" }), /a unidade da planilha mudou/);
});

test('extrairAba: sem a linha "Unidade: ..." a planilha terminou antes do esperado - barrada', () => {
  const linhas = abaMensal("Mato Grosso").filter((l) => l[0] !== "Unidade: R$/ha.");
  assert.throws(() => extrairAba(linhas, { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" }), /não foi encontrada \(a planilha terminou antes/);
});

// --- extrairAba: linhas de dado ---

test("extrairAba: item repetido na mesma aba vira inválido a partir da 2ª ocorrência", () => {
  const itens = [
    ["Fungicida", 100, 110, 120],
    ["Fungicida", 200, 210, 220]
  ];
  const { observacoes, invalidos } = extrairAba(abaMensal("Mato Grosso", { itens }), { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" });
  assert.equal(observacoes.filter((o) => o.item === "FUNGICIDA").length, 3, "só a 1ª ocorrência é gravada (uma por coluna)");
  assert.match(invalidos[0].motivo, /repete um código já lido/);
});

test("extrairAba: valor não numérico numa célula vira inválido, sem abortar a aba", () => {
  const itens = [["A. CUSTEIO (1+2...+6)", "N/D", 3779.19, 3788.94]];
  const { observacoes, invalidos } = extrairAba(abaMensal("Mato Grosso", { itens }), { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" });
  assert.equal(observacoes.length, 2);
  assert.match(invalidos[0].motivo, /valor não numérico: "N\/D"/);
});

test("extrairAba: colunas com o MESMO período (rótulo repetido na fonte) são ambíguas - nenhuma é gravada, o resto da aba segue", () => {
  const linhas = linhasAba({
    titulo1: "CUSTO DE PRODUÇÃO",
    tecnologiaTitulo: "MILHO MÉDIA TECNOLOGIA",
    localTitulo: "Tangará da Serra",
    colSafra: ["2023/24", "2025/26", "2025/26", "2026/27"],
    colAno: [2023, 2025, 2025, 2026],
    colMes: ["Consolidado", "Consolidado", "Consolidado", "Julho"],
    itens: [["A. CUSTEIO (1+2...+6)", 2477.26, 2243.51, 2458.3, 3200.38]]
  });
  const { observacoes, invalidos } = extrairAba(linhas, { tipo: "PONDERADO", tecnologia: "MEDIA", local: "Tangará da Serra" });

  assert.equal(invalidos.length, 2, "as duas colunas ambíguas, cada uma reportada");
  assert.match(invalidos[0].motivo, /não há como saber qual é qual/);
  assert.deepEqual(observacoes.map((o) => o.observedAt).sort(), ["2023-09-01", "2026-07-01"]);
});

// --- extrairCusto: a planilha inteira (Índice + abas) ---

test("extrairCusto: percorre o Índice, junta as observações de cada aba e lista locais sem aba (lacuna da fonte)", () => {
  const indice = [
    ["Item", "Dados", "Local", "Unidade"],
    ["Milho_MT", "x", "MT", "R$/ha"],
    ["Milho_Mensal_ALTA_sor", "x", "Sorriso", "R$/ha"],
    ["Milho_Mensal_ALTA_nmt", "x", "Nova Mutum", "R$/ha"] // no Índice, sem aba correspondente (visto na fonte real)
  ];
  const abas = { Milho_MT: abaMensal("Mato Grosso"), Milho_Mensal_ALTA_sor: abaMensal("Sorriso") };

  const { observacoes, invalidos, locaisSemAba } = extrairCusto({ indice, abas }, { tipo: "MENSAL", tecnologia: "ALTA" });

  assert.equal(observacoes.length, 6, "3 meses x 2 locais com aba");
  assert.equal(invalidos.length, 0);
  assert.deepEqual(locaisSemAba, ["Nova Mutum"]);
});

test("extrairCusto: falha ao ler UMA aba vira inválido e não derruba as demais", () => {
  const indice = [
    ["Milho_MT", "x", "MT", "R$/ha"],
    ["Milho_Mensal_ALTA_sor", "x", "Sorriso", "R$/ha"]
  ];
  const abas = { Milho_MT: abaMensal("Mato Grosso"), Milho_Mensal_ALTA_sor: abaMensal("Sorriso", { tecnologia: "MEDIA" }) }; // título não bate com "ALTA"

  const { observacoes, invalidos } = extrairCusto({ indice, abas }, { tipo: "MENSAL", tecnologia: "ALTA" });

  assert.equal(observacoes.length, 3, "só a aba do MT, que leu bem");
  assert.equal(invalidos.length, 1);
  assert.match(invalidos[0].motivo, /Aba não lida:/);
});

test("extrairCusto: Índice sem nenhuma linha de milho é barrado", () => {
  assert.throws(() => extrairCusto({ indice: [["Item", "Dados", "Local"]], abas: {} }, { tipo: "MENSAL", tecnologia: "ALTA" }), /não lista nenhuma aba de milho/);
});

// --- lerPlanilha: arquivo real (XLSX gerado em memória) ---

function workbookDeTeste() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Item", "Dados", "Local", "Unidade"], ["Milho_MT", "x", "MT", "R$/ha"]]), "Indice");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaMensal("Mato Grosso")), "Milho_MT");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

test("lerPlanilha: lê a aba Indice e as abas Milho_* de um XLSX real", () => {
  const { indice, abas } = lerPlanilha(workbookDeTeste());
  assert.equal(lerIndice(indice).length, 1);
  assert.ok(abas.Milho_MT);
  const { observacoes } = extrairAba(abas.Milho_MT, { tipo: "MENSAL", tecnologia: "ALTA", local: "Mato Grosso" });
  assert.equal(observacoes.length, 3);
});

test('lerPlanilha: sem a aba "Indice" é barrado', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"]]), "Outra");
  assert.throws(() => lerPlanilha(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })), /não tem a aba "Indice"/);
});
