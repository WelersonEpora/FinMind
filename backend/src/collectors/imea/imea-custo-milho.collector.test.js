"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { URL } = require("node:url");
const XLSX = require("xlsx");
const coletor = require("./imea-custo-milho.collector");

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Um arquivo real do catálogo (`GET /api/arquivo`), reduzido aos campos usados.
function arquivoCatalogo({ nome, id, data, mimeType = MIME_XLSX, path = "https://bucket/x.xlsx?assinatura", isPublico = true, liberado = true }) {
  return { Nome: nome, Id: id, Data: data, MimeType: mimeType, Path: path, IsPublico: isPublico, Liberado: liberado, HorarioPublicacao: "00:00:00", UrlCompleto: "https://imea.com.br/pagina" };
}

const MENSAL_ALTA = arquivoCatalogo({ nome: "Custo de Produção - Milho - Mensal Alta Tecnologia", id: "1", data: "2026-09-15T00:00:00" });

const resposta = (corpo, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => corpo, arrayBuffer: async () => (Buffer.isBuffer(corpo) ? corpo.buffer.slice(corpo.byteOffset, corpo.byteOffset + corpo.byteLength) : Buffer.from("").buffer) });

// XLSX "grande o bastante" para passar da guarda de tamanho (assinatura ZIP "PK").
const XLSX_FALSO = Buffer.concat([Buffer.from("PK"), Buffer.alloc(60_000)]);

function fetchFake(rotas, chamadas = []) {
  return async (url) => {
    chamadas.push(url);
    const rota = rotas[url] ?? Object.entries(rotas).find(([chave]) => url.startsWith(chave))?.[1];
    if (rota === undefined) return resposta("", { ok: false, status: 404 });
    return typeof rota === "function" ? rota() : resposta(rota);
  };
}

// --- identificarArquivo ---

test("identificarArquivo: reconhece os 4 nomes reais do catálogo (mesmo com acento)", () => {
  assert.deepEqual(coletor.identificarArquivo("Custo de Produção - Milho - Mensal Alta Tecnologia"), { tipo: "MENSAL", tecnologia: "ALTA" });
  assert.deepEqual(coletor.identificarArquivo("Custo de Produção - Milho - Mensal Média Tecnologia"), { tipo: "MENSAL", tecnologia: "MEDIA" });
  assert.deepEqual(coletor.identificarArquivo("Custo de Produção - Milho - Ponderado Alta Tecnologia"), { tipo: "PONDERADO", tecnologia: "ALTA" });
  assert.deepEqual(coletor.identificarArquivo("Custo de Produção - Milho - Ponderado Média Tecnologia"), { tipo: "PONDERADO", tecnologia: "MEDIA" });
});

test("identificarArquivo: qualquer outro nome (outra cultura, boletim, etc.) devolve null", () => {
  assert.equal(coletor.identificarArquivo("Boletim Semanal - Milho"), null);
  assert.equal(coletor.identificarArquivo("Custo de Produção - Soja - Mensal Alta Tecnologia"), null);
  assert.equal(coletor.identificarArquivo(""), null);
});

// --- escolherArquivos ---

test("escolherArquivos: pega o mais NOVO (por Data, depois por Id) de cada (tipo, tecnologia)", () => {
  const antigo = arquivoCatalogo({ nome: "Custo de Produção - Milho - Mensal Alta Tecnologia", id: "100", data: "2026-08-15T00:00:00" });
  const novo = arquivoCatalogo({ nome: "Custo de Produção - Milho - Mensal Alta Tecnologia", id: "200", data: "2026-09-15T00:00:00" });
  const mesmaDataIdMenor = arquivoCatalogo({ nome: "Custo de Produção - Milho - Ponderado Média Tecnologia", id: "5", data: "2026-09-15T00:00:00" });
  const mesmaDataIdMaior = arquivoCatalogo({ nome: "Custo de Produção - Milho - Ponderado Média Tecnologia", id: "50", data: "2026-09-15T00:00:00" });

  const escolhidos = coletor.escolherArquivos([antigo, novo, mesmaDataIdMenor, mesmaDataIdMaior]);

  assert.equal(escolhidos.length, 2);
  assert.ok(escolhidos.find((a) => a.sourceCode === "IMEA_CUSTO_MILHO_MENSAL_ALTA" && a.id === "200"));
  assert.ok(escolhidos.find((a) => a.sourceCode === "IMEA_CUSTO_MILHO_PONDERADO_MEDIA" && a.id === "50"));
});

test("escolherArquivos: descarta o que não é XLSX, sem Path, não público ou não liberado, e nomes desconhecidos", () => {
  const semXlsx = arquivoCatalogo({ nome: "Custo de Produção - Milho - Mensal Alta Tecnologia", id: "1", data: "2026-09-15", mimeType: "application/pdf" });
  const semPath = arquivoCatalogo({ nome: "Custo de Produção - Milho - Mensal Alta Tecnologia", id: "2", data: "2026-09-15", path: null });
  const naoPublico = arquivoCatalogo({ nome: "Custo de Produção - Milho - Mensal Alta Tecnologia", id: "3", data: "2026-09-15", isPublico: false });
  const naoLiberado = arquivoCatalogo({ nome: "Custo de Produção - Milho - Mensal Alta Tecnologia", id: "4", data: "2026-09-15", liberado: false });
  const outro = arquivoCatalogo({ nome: "Boletim Semanal - Milho", id: "5", data: "2026-09-15" });

  assert.deepEqual(coletor.escolherArquivos([semXlsx, semPath, naoPublico, naoLiberado, outro]), []);
});

test("escolherArquivos: cada campo devolvido não carrega a URL assinada (path) diretamente exposta fora do necessário", () => {
  const [escolhido] = coletor.escolherArquivos([MENSAL_ALTA]);
  assert.equal(escolhido.data, "2026-09-15");
  assert.equal(escolhido.path, MENSAL_ALTA.Path);
  assert.equal(escolhido.nome, MENSAL_ALTA.Nome);
});

// --- listarCatalogo ---

test("listarCatalogo: pede cadeia=3, nome=Custo e para quando junta o TotalCount", async () => {
  const chamadas = [];
  const fetchFn = fetchFake(
    {
      [coletor.URL_LISTA]: () => resposta({ TotalCount: 4, Result: [MENSAL_ALTA, MENSAL_ALTA, MENSAL_ALTA, MENSAL_ALTA] })
    },
    chamadas
  );
  const arquivos = await coletor.listarCatalogo({ fetchFn });

  assert.equal(arquivos.length, 4);
  assert.equal(chamadas.length, 1, "TotalCount já foi atingido na 1ª página");
  const url = new URL(chamadas[0]);
  assert.equal(url.searchParams.get("cadeia"), "3");
  assert.equal(url.searchParams.get("nome"), "Custo");
});

test("listarCatalogo: resposta sem `Result` em lista é barrada", async () => {
  await assert.rejects(coletor.listarCatalogo({ fetchFn: fetchFake({ [coletor.URL_LISTA]: () => resposta({ TotalCount: 1 }) }) }), /não trouxe `Result`/);
});

// --- download ---

test("download: baixa cada arquivo escolhido, com pausa entre eles", async () => {
  const chamadasEspera = [];
  const fetchFn = fetchFake({
    [coletor.URL_LISTA]: () => resposta({ TotalCount: 1, Result: [MENSAL_ALTA] }),
    [MENSAL_ALTA.Path]: () => resposta(XLSX_FALSO)
  });

  const baixados = await coletor.download({ fetchFn, esperar: async (ms) => chamadasEspera.push(ms) });

  assert.equal(baixados.length, 1);
  assert.ok(Buffer.isBuffer(baixados[0].buffer));
  assert.equal(baixados[0].path, undefined, "a URL assinada não segue adiante");
  assert.equal(chamadasEspera.length, 0, "só 1 arquivo: sem pausa a aplicar");
});

test("download: arquivo que não parece XLSX (pequeno ou sem assinatura ZIP) falha a execução", async () => {
  const fetchFn = fetchFake({
    [coletor.URL_LISTA]: () => resposta({ TotalCount: 1, Result: [MENSAL_ALTA] }),
    [MENSAL_ALTA.Path]: () => resposta(Buffer.from("não é um xlsx"))
  });
  await assert.rejects(coletor.download({ fetchFn }), /não parece uma planilha XLSX/);
});

test("download: catálogo sem nenhum arquivo de custo reconhecido falha a execução", async () => {
  const fetchFn = fetchFake({ [coletor.URL_LISTA]: () => resposta({ TotalCount: 1, Result: [arquivoCatalogo({ nome: "Boletim Semanal - Milho", id: "1", data: "2026-09-15" })] }) });
  await assert.rejects(coletor.download({ fetchFn }), /não trouxe nenhuma planilha de custo/);
});

// --- parse ---

function workbookValido() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Item", "Dados", "Local", "Unidade"], ["Milho_MT", "x", "MT", "R$/ha"]]), "Indice");
  const abaMT = [
    [],
    ["        CUSTO DE PRODUÇÃO MENSAL"],
    ["MILHO ALTA TECNOLOGIA"],
    ["MATO GROSSO"],
    [],
    ["Safra", "2026/27"],
    ["Ano", 2026],
    ["Mês", "Junho"],
    ["A. CUSTEIO (1+2...+6)", 3696.73],
    ["Unidade: R$/ha."]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaMT), "Milho_MT");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

test("parse: lê cada planilha com o tipo/tecnologia do próprio arquivo; falha de UMA não derruba as demais", () => {
  const boa = { sourceCode: "IMEA_CUSTO_MILHO_MENSAL_ALTA", tipo: "MENSAL", tecnologia: "ALTA", nome: "boa.xlsx", buffer: workbookValido() };
  const ilegivel = { sourceCode: "IMEA_CUSTO_MILHO_PONDERADO_ALTA", tipo: "PONDERADO", tecnologia: "ALTA", nome: "ruim.xlsx", buffer: Buffer.from("não é xlsx") };

  const [resultadoBoa, resultadoRuim] = coletor.parse([boa, ilegivel]);

  assert.equal(resultadoBoa.observacoes.length, 1);
  assert.equal(resultadoBoa.buffer, undefined, "o buffer não segue para a frente");
  assert.match(resultadoRuim.erro, /Falha ao ler a planilha/);
});

// --- normalize ---

test("normalize: published_at é o fim do dia da data do arquivo; source_code e metadata vêm do arquivo e da observação", () => {
  const arquivo = {
    sourceCode: "IMEA_CUSTO_MILHO_MENSAL_ALTA",
    nome: "Custo de Produção - Milho - Mensal Alta Tecnologia",
    id: "1",
    data: "2026-09-15",
    horario: "00:00:00",
    urlPublica: "https://imea.com.br/x",
    observacoes: [
      {
        seriesCode: "IMEA.CUSTO.MILHO.MES.MENSAL_ALTA_MATO_GROSSO.A_CUSTEIO",
        observedAt: "2026-06-01",
        valor: 3696.73,
        unidade: "R$/ha",
        tipo: "MENSAL",
        tecnologia: "ALTA",
        periodo: "MES",
        local: "MATO_GROSSO",
        localNome: "Mato Grosso",
        item: "A_CUSTEIO",
        rotulo: "A. CUSTEIO (1+2...+6)",
        safra: "2026/27",
        mes: "Junho",
        estimativa: false
      }
    ],
    invalidos: []
  };

  const agora = new Date("2026-09-22T00:00:00Z");
  const { validos, invalidos } = coletor.normalize([arquivo], agora);

  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 1);
  assert.equal(validos[0].source_code, "IMEA_CUSTO_MILHO_MENSAL_ALTA");
  assert.equal(validos[0].published_at.toISOString(), "2026-09-15T23:59:59.000Z");
  assert.equal(validos[0].metadata.arquivo, arquivo.nome);
  assert.equal(validos[0].metadata.item, "A_CUSTEIO");
});

test("normalize: arquivo sem data real (\"0001-01-01\", igual à listagem quando falta) fica inválido, sem gravar nada", () => {
  const arquivo = { sourceCode: "X", nome: "x", id: "1", data: "0001-01-01", observacoes: [{ seriesCode: "S" }], invalidos: [] };
  const { validos, invalidos } = coletor.normalize([arquivo]);
  assert.equal(validos.length, 0);
  assert.match(invalidos[0].motivo, /não informa uma data de publicação válida/);
});

test("normalize: item.erro do parse vira inválido direto (arquivo ilegível)", () => {
  const { validos, invalidos } = coletor.normalize([{ nome: "x", id: "1", erro: "Falha ao ler a planilha: xyz" }]);
  assert.equal(validos.length, 0);
  assert.equal(invalidos[0].motivo, "Falha ao ler a planilha: xyz");
});

test("normalize: inválidos do parser (linha ambígua, item repetido...) são repassados com o identificador do arquivo", () => {
  const arquivo = { sourceCode: "X", nome: "arq.xlsx", id: "1", data: "2026-09-15", observacoes: [], invalidos: [{ item: { local: "MATO_GROSSO" }, motivo: "coisa ambígua" }] };
  const { invalidos } = coletor.normalize([arquivo]);
  assert.equal(invalidos.length, 1);
  assert.equal(invalidos[0].motivo, "coisa ambígua");
  assert.equal(invalidos[0].item.arquivo, "arq.xlsx");
  assert.equal(invalidos[0].item.local, "MATO_GROSSO");
});

// --- persist ---

test("persist: agrupa por source_code (uma planilha não pode descartar a reingestão de outra publicada no mesmo dia)", async () => {
  const chamadasPorFonte = [];
  const deps = {
    observationRepository: { listarSeriesEInstantes: async (sourceCode) => (chamadasPorFonte.push(sourceCode), []) },
    pointInTimeService: { registrarObservacoes: async (validos) => ({ criados: validos.length, atualizados: 0, ignorados: 0, falhas: [] }) }
  };

  const validos = [
    { series_code: "IMEA.CUSTO.MILHO.MES.MENSAL_ALTA_MATO_GROSSO.A_CUSTEIO", source_code: "IMEA_CUSTO_MILHO_MENSAL_ALTA", published_at: new Date("2026-09-15T23:59:59Z") },
    { series_code: "IMEA.CUSTO.MILHO.SAFRA.ALTA_MATO_GROSSO.A_CUSTEIO", source_code: "IMEA_CUSTO_MILHO_PONDERADO_ALTA", published_at: new Date("2026-09-15T23:59:59Z") }
  ];

  const resultado = await coletor.persist(validos, { execucaoId: "exec-1" }, deps);

  assert.equal(resultado.criados, 2);
  assert.deepEqual(chamadasPorFonte.sort(), ["IMEA_CUSTO_MILHO_MENSAL_ALTA", "IMEA_CUSTO_MILHO_PONDERADO_ALTA"]);
});
