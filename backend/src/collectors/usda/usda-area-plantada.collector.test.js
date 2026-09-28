"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { URL } = require("node:url");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./usda-area-plantada.collector");
const { UpstreamServiceError } = require("../../shared/errors");

// Trecho da listagem REAL do ESMIS (2026-09-28), reduzido: uma linha por edição, com a data em <time
// datetime>, os arquivos e o link da edição (/publication/<publicacao>/<slug>). As linhas do topo repetem a
// edição mais recente em toda página.
function linha({ publicacao = "prospective-plantings", data, slug = data, arquivos }) {
  const links = arquivos.map((a) => `<a href="${a}" class="usa-tag">${a.split(".").pop()}</a>`).join("");
  return `<tr><td><time datetime="${data}T12:00:00Z">x</time></td>
    <td>${links}</td><td><a href="/publication/${publicacao}/${slug}">Ver</a></td></tr>`;
}
const zip = (n) => `/sites/default/release-files/795840/pspl${n}.zip`;

// ZIP mínimo sem compressão ("stored"), só para exercitar a leitura do CSV.
function montarZip(arquivos) {
  const locais = [];
  const centrais = [];
  let offset = 0;
  for (const { nome, conteudo } of arquivos) {
    const nomeBuf = Buffer.from(nome, "latin1");
    const dados = Buffer.from(conteudo, "latin1");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    locais.push(local, nomeBuf, dados);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrais.push(central, nomeBuf);
    offset += local.length + nomeBuf.length + dados.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

// CSV mínimo no layout real: a tabela de área do milho com uma coluna por ano (e a de variação, que fica de fora).
const csvEdicao = (relatorio, data, anos, valores) => [
  `91,"t","${relatorio}: Released ${data}, by the National Agricultural Statistics Service (NASS)."`,
  '91,"t","Corn Area Planted - States and United States"',
  `91,"h","",${anos.map(() => '"Area planted"').join(",")},"Area planted"`,
  `91,"h","",${anos.map((a) => `"${a}"`).join(",")},"Percent of"`,
  `91,"u","",${anos.map(() => '"(1,000 acres)"').join(",")},"(percent)"`,
  `91,"d","United States",${valores.join(",")},97`
].join("\n");

const resposta = (corpo, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  text: async () => corpo.toString("latin1"),
  arrayBuffer: async () => corpo.buffer.slice(corpo.byteOffset, corpo.byteOffset + corpo.byteLength)
});
const semEspera = async () => {};

// Edição já lida pelo parser, para exercitar normalize/persist sem ZIP.
const edicao = (publicacao, data, valores) => ({
  publicacao,
  data,
  slug: data,
  arquivo: `${publicacao}.zip`,
  dataLiberacao: data,
  titulo: "Corn Area Planted - States and United States",
  valores: Object.entries(valores).map(([ano, valor]) => ({ ano: Number(ano), valor }))
});

test("extrairEdicoesDaPagina: data real, slug e ZIP; só as linhas da publicação pedida", () => {
  const html = `<table>
    ${linha({ data: "2026-03-31", arquivos: ["/sites/default/release-files/795840/pspl0326.pdf", zip("0326")] })}
    ${linha({ data: "2001-03-30", arquivos: ["/sites/default/release-files/1/pspl0301.txt"] })}
    ${linha({ publicacao: "acreage", data: "2026-06-30", arquivos: ["/x/acrg0626.zip"] })}
  </table>`;
  assert.deepEqual(coletor.extrairEdicoesDaPagina(html, "prospective-plantings"), [
    { publicacao: "prospective-plantings", data: "2026-03-31", slug: "2026-03-31", caminhoZip: zip("0326") },
    { publicacao: "prospective-plantings", data: "2001-03-30", slug: "2001-03-30", caminhoZip: null }
  ]);
});

test("escolherUmaPorData: na mesma data e publicação vale a republicação (sufixo maior); ordem cronológica", () => {
  const r = coletor.escolherUmaPorData([
    { publicacao: "acreage", data: "2026-06-30", slug: "2026-06-30" },
    { publicacao: "prospective-plantings", data: "2026-03-31", slug: "2026-03-31" },
    { publicacao: "prospective-plantings", data: "2026-03-31", slug: "2026-03-31-0" }
  ]);
  assert.deepEqual(r.map((e) => e.slug), ["2026-03-31-0", "2026-06-30"]);
});

test("listarEdicoes: percorre as páginas até passar de `desde`, sem repetir as linhas fixas do topo", async () => {
  const topo = linha({ data: "2026-03-31", arquivos: [zip("0326")] });
  const paginas = [
    `${topo}${linha({ data: "2025-03-31", arquivos: [zip("0325")] })}`,
    `${topo}${linha({ data: "2002-03-28", arquivos: [zip("0302")] })}${linha({ data: "2001-03-30", arquivos: ["/a.txt"] })}`,
    `${topo}${linha({ data: "1999-03-31", arquivos: ["/b.pdf"] })}`
  ];
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    return resposta(Buffer.from(paginas[Number(new URL(url).searchParams.get("page"))]));
  };
  const r = await coletor.listarEdicoes("prospective-plantings", { desde: coletor.DATA_INICIAL, fetchFn, esperar: semEspera });
  assert.deepEqual(r.map((e) => e.data), ["2002-03-28", "2025-03-31", "2026-03-31"], "2001-03-30 (sem CSV) fica antes do início");
  assert.equal(urls.length, 2, "parou na página que já passou de `desde`");
});

test("download (coleta diária): a edição mais recente de CADA publicação, lida do ZIP até o normalize", async () => {
  const zipPp = montarZip([
    { nome: "pspl_help.htm", conteudo: "<html></html>" },
    { nome: "pspl_all_tables.csv", conteudo: csvEdicao("Prospective Plantings", "March 31, 2026", ["2024", "2025", "2026 1/"], [90909, 98788, 95338]) }
  ]);
  const zipAcrg = montarZip([
    { nome: "acrg_all_tables.csv", conteudo: csvEdicao("Acreage", "June 30, 2026", ["2025", "2026 1/"], [98788, 95343]) }
  ]);
  const fetchFn = async (url) => {
    if (url.includes("/publication/prospective-plantings")) return resposta(Buffer.from(linha({ data: "2026-03-31", arquivos: [zip("0326")] })));
    if (url.includes("/publication/acreage")) return resposta(Buffer.from(linha({ publicacao: "acreage", data: "2026-06-30", arquivos: ["/sites/default/release-files/1/acrg0626.zip"] })));
    if (url.endsWith("pspl0326.zip")) return resposta(zipPp);
    if (url.endsWith("acrg0626.zip")) return resposta(zipAcrg);
    throw new Error(`URL inesperada: ${url}`);
  };

  const baixadas = await coletor.download({ fetchFn, esperar: semEspera });
  assert.deepEqual(baixadas.map((e) => [e.publicacao, e.data, e.arquivo]), [
    ["prospective-plantings", "2026-03-31", "pspl0326.zip"],
    ["acreage", "2026-06-30", "acrg0626.zip"]
  ]);
  const { validos, invalidos } = coletor.normalize(coletor.parse(baixadas));
  assert.deepEqual(invalidos, []);
  assert.deepEqual(validos.map((v) => [v.metadata.relatorio, v.observed_at, v.value]), [
    ["Prospective Plantings", "2024-09-01", 90909],
    ["Prospective Plantings", "2025-09-01", 98788],
    ["Prospective Plantings", "2026-09-01", 95338],
    ["Acreage", "2025-09-01", 98788],
    ["Acreage", "2026-09-01", 95343]
  ]);
});

test("listagem com HTTP de erro vira UpstreamServiceError (a execução falha, não grava nada)", async () => {
  const fetchFn = async () => resposta(Buffer.from(""), { ok: false, status: 503 });
  await assert.rejects(coletor.download({ fetchFn, esperar: semEspera }), UpstreamServiceError);
});

test("normalize: uma série, 1º/set do ano de plantio, mil acres, published_at REAL (fim do dia do release, UTC)", () => {
  const { validos } = coletor.normalize([edicao("prospective-plantings", "2026-03-31", { 2025: 98788, 2026: 95338 })]);
  assert.equal(validos.length, 2);
  const v = validos.find((x) => x.observed_at === "2026-09-01");
  assert.equal(v.series_code, "USDA.CORN.AREA_PLANTED");
  assert.equal(v.source_code, "USDA_NASS_AREA");
  assert.equal(v.unit, "mil acres");
  assert.equal(v.value, 95338);
  assert.equal(v.published_at.toISOString(), "2026-03-31T23:59:59.000Z");
  assert.equal(v.published_at_is_estimated, false);
  assert.equal(v.metadata.relatorio, "Prospective Plantings");
});

test("normalize: 'intenção' só no ano da edição do Prospective Plantings; o resto é área plantada", () => {
  const { validos } = coletor.normalize([
    edicao("prospective-plantings", "2026-03-31", { 2025: 98788, 2026: 95338 }),
    edicao("acreage", "2026-06-30", { 2026: 95343 })
  ]);
  assert.deepEqual(validos.map((v) => [v.metadata.relatorio, v.metadata.anoPlantio, v.metadata.tipoEstimativa]), [
    ["Prospective Plantings", 2025, "plantada"],
    ["Prospective Plantings", 2026, "intencao"],
    ["Acreage", 2026, "plantada"]
  ]);
});

test("normalize: em ordem de release, mesmo com as publicações misturadas (o serviço compara com a versão anterior)", () => {
  const { validos } = coletor.normalize([
    edicao("acreage", "2025-06-30", { 2025: 95203 }),
    edicao("prospective-plantings", "2025-03-31", { 2025: 95326 }),
    edicao("prospective-plantings", "2026-03-31", { 2025: 98788, 2026: 95338 })
  ]);
  assert.deepEqual([...new Set(validos.map((v) => v.metadata.dataRelease))], ["2025-03-31", "2025-06-30", "2026-03-31"]);
});

test("normalize: arquivo trocado, fora do mês, anos inesperados, sem ZIP e erro de leitura viram inválidos", () => {
  const { validos, invalidos } = coletor.normalize([
    { ...edicao("prospective-plantings", "2026-03-31", { 2026: 1 }), dataLiberacao: "2025-03-31" },
    edicao("acreage", "2026-03-31", { 2026: 1 }),
    edicao("prospective-plantings", "2026-03-31", { 2027: 1 }),
    edicao("prospective-plantings", "2026-03-31", { 2023: 1, 2026: 1 }),
    { publicacao: "acreage", data: "2001-06-29", slug: "2001-06-29", erro: "A edição não tem o arquivo ZIP (CSV) no ESMIS." },
    ...coletor.parse([{ publicacao: "acreage", data: "2026-06-30", slug: "x", arquivo: "x.zip", buffer: Buffer.from("não é zip") }])
  ]);
  assert.equal(validos.length, 0);
  assert.equal(invalidos.length, 6);
  assert.match(invalidos[0].motivo, /data do CSV/);
  assert.match(invalidos[1].motivo, /fora do mês/);
  assert.match(invalidos[2].motivo, /anos inesperados/);
  assert.match(invalidos[3].motivo, /anos inesperados/);
  assert.match(invalidos[4].motivo, /não tem o arquivo ZIP/);
  assert.match(invalidos[5].motivo, /Falha ao ler o CSV/);
});

test("csvDaEdicao: recusa um ZIP sem o CSV com todas as tabelas", () => {
  assert.throws(() => coletor.csvDaEdicao(montarZip([{ nome: "pspl_p06_t091.csv", conteudo: "91" }])), /_all/);
});

// ---- persist com repositório em memória: vintage, reingestão e ordem de carga
function repositorioEmMemoria() {
  const linhas = [];
  return {
    linhas,
    async buscarUltimasVersoes(seriesCode) {
      const mapa = new Map();
      for (const l of linhas.filter((x) => x.series_code === seriesCode)) {
        const atual = mapa.get(l.observed_at);
        if (!atual || l.revision_seq > atual.revision_seq) mapa.set(l.observed_at, l);
      }
      return mapa;
    },
    async inserirVersoes(novas) {
      linhas.push(...novas);
      return novas.length;
    },
    async listarSeriesEInstantes(sourceCode) {
      const vistos = new Map();
      for (const l of linhas.filter((x) => x.source_code === sourceCode)) vistos.set(`${l.series_code}|${l.published_at.getTime()}`, { series_code: l.series_code, published_at: l.published_at });
      return [...vistos.values()];
    }
  };
}

test("vintage: intenção de março, área de junho e revisão no ano seguinte viram versões; valor igual não grava", async () => {
  const repo = repositorioEmMemoria();
  const { validos } = coletor.normalize([
    edicao("prospective-plantings", "2012-03-30", { 2012: 95864 }),
    edicao("acreage", "2012-06-29", { 2012: 96405 }),
    edicao("prospective-plantings", "2013-03-28", { 2012: 97155, 2013: 97282 }),
    edicao("acreage", "2013-06-28", { 2012: 97155, 2013: 97379 })
  ]);
  const r = await coletor.persistirBackfill(validos, { execucaoId: "x" }, { observationRepository: repo });
  assert.deepEqual([r.criados, r.atualizados, r.ignorados, r.falhas.length], [2, 3, 1, 0]);
  assert.deepEqual(repo.linhas.filter((l) => l.observed_at === "2012-09-01").map((l) => [l.revision_seq, l.value, l.published_at.toISOString().slice(0, 10)]), [
    [0, 95864, "2012-03-30"],
    [1, 96405, "2012-06-29"],
    [2, 97155, "2013-03-28"]
  ]);
});

test("persist (coleta diária) se recusa a gravar com a série vazia; depois do backfill, reler a mesma edição não grava nem falha", async () => {
  const repo = repositorioEmMemoria();
  const validos = () => coletor.normalize([edicao("acreage", "2026-06-30", { 2025: 98788, 2026: 95343 })]).validos;

  const recusada = await coletor.persist(validos(), { execucaoId: "x" }, { observationRepository: repo });
  assert.equal(repo.linhas.length, 0, "gravar só a edição recente truncaria o vintage");
  assert.equal(recusada.falhas.length, 1);
  assert.match(recusada.falhas[0].motivo, /backfill:usda-area-plantada/);

  await coletor.persistirBackfill(validos(), { execucaoId: "y" }, { observationRepository: repo });
  const diaria = await coletor.persist(validos(), { execucaoId: "z" }, { observationRepository: repo });
  assert.deepEqual([diaria.criados, diaria.atualizados, diaria.ignorados, diaria.falhas.length], [0, 0, 2, 0]);
  assert.equal(repo.linhas.length, 2);
});
