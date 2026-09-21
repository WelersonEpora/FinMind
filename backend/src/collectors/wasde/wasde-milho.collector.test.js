"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const coletor = require("./wasde-milho.collector");
const pointInTime = require("../../services/point-in-time.service");

// Trecho REAL da listagem do ESMIS (2026-09-21), reduzido: uma linha por edição, com a data em
// <time datetime>, os arquivos e o link da edição (/publication/.../<slug>).
function linha({ data, slug, arquivos }) {
  const links = arquivos.map((a) => `<a href="${a}" class="usa-tag">${a.split(".").pop()}</a>`).join("");
  return `<tr><td class="views-field-release-date"><time datetime="${data}T12:00:00Z">x</time></td>
    <td class="views-field-release-files">${links}</td>
    <td><a href="/publication/world-agricultural-supply-and-demand-estimates/${slug}">Ver</a></td></tr>`;
}
// As linhas fixas do topo repetem a última edição em toda página e NÃO têm o link /publication/.
const LINHA_FIXA = `<tr><td><time datetime="2026-09-11T12:00:00Z">x</time></td>
  <td><a href="/sites/default/release-files/796054/wasde0926.xls">xls</a></td></tr>`;

const PAGINA_0 = `<table>${LINHA_FIXA}
  ${linha({ data: "2026-09-11", slug: "2026-09-11", arquivos: ["/sites/default/release-files/796054/wasde0926.pdf", "/sites/default/release-files/796054/wasde0926.xls"] })}
  ${linha({ data: "2026-05-12", slug: "2026-05-12", arquivos: ["/sites/default/release-files/795000/wasde0526.xls"] })}
  ${linha({ data: "2026-05-12", slug: "2026-05-12-0", arquivos: ["/sites/default/release-files/795001/wasde0526v2.xls"] })}
  ${linha({ data: "2022-06-10", slug: "2022-06-10", arquivos: ["/sites/default/release-files/3t945q76s/pv63h524n/j9603704v/wasde0622.xls"] })}
  ${linha({ data: "2014-01-23", slug: "2014-01-23", arquivos: ["/sites/default/release-files/1/wasde0114.pdf"] })}
</table>`;

test("extrairEdicoesDaPagina: data real, slug e XLS (inclusive o padrão antigo de URL); ignora a linha fixa", () => {
  const edicoes = coletor.extrairEdicoesDaPagina(PAGINA_0);

  assert.deepEqual(
    edicoes.map((e) => [e.data, e.slug, e.caminhoXls]),
    [
      ["2026-09-11", "2026-09-11", "/sites/default/release-files/796054/wasde0926.xls"],
      ["2026-05-12", "2026-05-12", "/sites/default/release-files/795000/wasde0526.xls"],
      ["2026-05-12", "2026-05-12-0", "/sites/default/release-files/795001/wasde0526v2.xls"],
      ["2022-06-10", "2022-06-10", "/sites/default/release-files/3t945q76s/pv63h524n/j9603704v/wasde0622.xls"],
      ["2014-01-23", "2014-01-23", null] // edição sem planilha
    ]
  );
});

test("escolherUmaPorData: na mesma data vale a republicação (sufixo maior) e sai em ordem cronológica", () => {
  const escolhidas = coletor.escolherUmaPorData(coletor.extrairEdicoesDaPagina(PAGINA_0));

  assert.deepEqual(
    escolhidas.map((e) => e.slug),
    ["2014-01-23", "2022-06-10", "2026-05-12-0", "2026-09-11"]
  );
});

test("listarEdicoes: percorre as páginas até passar de `desde` e não repete edição", async () => {
  const chamadas = [];
  const pagina1 = `<table>${LINHA_FIXA}${linha({ data: "2011-01-12", slug: "2011-01-12", arquivos: ["/sites/default/release-files/5/wasde0111.xls"] })}</table>`;
  const fetchFn = async (url) => {
    chamadas.push(url);
    const corpo = url.endsWith("page=0") ? PAGINA_0 : pagina1;
    return { ok: true, status: 200, text: async () => corpo };
  };

  const edicoes = await coletor.listarEdicoes({ desde: "2015-01-01", fetchFn, esperar: async () => {} });

  assert.equal(chamadas.length, 1, "a página 0 já traz edições anteriores a `desde`: não precisa da 1");
  assert.deepEqual(edicoes.map((e) => e.slug), ["2022-06-10", "2026-05-12-0", "2026-09-11"]);

  chamadas.length = 0;
  const todas = await coletor.listarEdicoes({ desde: "2011-01-01", fetchFn, esperar: async () => {} });
  // Página 0, página 1 (com a edição de 2011) e mais uma que já não traz nada novo: aí encerra.
  assert.equal(chamadas.length, 3);
  assert.equal(todas[0].slug, "2011-01-12");
});

test("listarEdicoes: para quando uma página não traz edição nova (fim do arquivo)", async () => {
  let n = 0;
  const fetchFn = async () => {
    n += 1;
    return { ok: true, status: 200, text: async () => PAGINA_0 };
  };
  await coletor.listarEdicoes({ desde: "1900-01-01", fetchFn, esperar: async () => {} });
  assert.equal(n, 2, "a página 1 repete a 0: sem novidade, encerra");
});

test("listarEdicoes: HTTP de erro vira UpstreamServiceError", async () => {
  const fetchFn = async () => ({ ok: false, status: 503, text: async () => "" });
  await assert.rejects(
    coletor.listarEdicoes({ fetchFn, esperar: async () => {} }),
    (err) => err.name === "UpstreamServiceError" && /503/.test(err.message)
  );
});

test("baixarEdicoes: recusa um arquivo que não é XLS (página de erro salva como .xls) e marca a edição sem planilha", async () => {
  const html = Buffer.from("<html>erro</html>".repeat(5000));
  const fetchFn = async () => ({ ok: true, status: 200, arrayBuffer: async () => html });

  await assert.rejects(
    coletor.baixarEdicoes([{ data: "2026-09-11", slug: "2026-09-11", caminhoXls: "/sites/default/release-files/1/wasde0926.xls" }], { fetchFn, esperar: async () => {} }),
    /não parece uma planilha XLS/
  );

  const semXls = await coletor.baixarEdicoes([{ data: "2014-01-23", slug: "2014-01-23", caminhoXls: null }], { fetchFn, esperar: async () => {} });
  assert.equal(semXls[0].semPlanilha, true);
});

// ---- normalize (sem arquivo: o parse já foi testado no parser)
const obs = (seriesCode, safra, valor, extra = {}) => ({
  seriesCode, observedAt: `${safra.slice(0, 4)}-09-01`, safra, situacao: "proj", escopo: "EUA", regiao: "UNITED_STATES",
  atributo: seriesCode.split(".").pop(), unidade: "M bu", valor, ...extra
});
const edicaoParseada = (data, mes, valor) => ({
  data, slug: data, arquivo: "x.xls", edicao: "1", mes, invalidos: [],
  observacoes: [obs("WASDE.MILHO.EUA.ENDING_STOCKS", "2010/11", valor)]
});

test("normalize: published_at REAL (fim do dia do release, UTC), fonte e metadados da edição", () => {
  const { validos, invalidos } = coletor.normalize([edicaoParseada("2011-01-12", { nome: "January", ano: 2011 }, 745)]);

  assert.equal(invalidos.length, 0);
  assert.equal(validos.length, 1);
  const v = validos[0];
  assert.equal(v.series_code, "WASDE.MILHO.EUA.ENDING_STOCKS");
  assert.equal(v.observed_at, "2010-09-01");
  assert.equal(v.value, 745);
  assert.equal(v.source_code, "USDA_WASDE");
  assert.equal(v.published_at.toISOString(), "2011-01-12T23:59:59.000Z");
  assert.equal(v.published_at_is_estimated, false);
  assert.equal(v.published_at_basis, "source");
  assert.equal(v.metadata.dataRelease, "2011-01-12");
  assert.equal(v.metadata.safra, "2010/11");
  assert.equal(v.metadata.situacao, "proj");
});

test("normalize: ordena por data de release (o serviço compara com a versão anterior de cada série)", () => {
  const { validos } = coletor.normalize([
    edicaoParseada("2012-01-12", { nome: "January", ano: 2012 }, 1128),
    edicaoParseada("2011-01-12", { nome: "January", ano: 2011 }, 745)
  ]);
  assert.deepEqual(validos.map((v) => v.value), [745, 1128]);
});

test("normalize: cabeçalho que não confere com a data do release, edição sem planilha e erro de leitura viram inválidos", () => {
  const { validos, invalidos } = coletor.normalize([
    edicaoParseada("2011-01-12", { nome: "February", ano: 2011 }, 1),
    edicaoParseada("2011-03-10", null, 2),
    { data: "2014-01-23", slug: "2014-01-23", erro: "A edição não tem planilha XLS no ESMIS." },
    { ...edicaoParseada("2011-04-08", { nome: "April", ano: 2011 }, 3), invalidos: [{ motivo: "Production (2010/11): valor não numérico." }] }
  ]);

  assert.equal(validos.length, 1, "só a de abril é aproveitada (os outros três não passam)");
  assert.equal(validos[0].value, 3);
  assert.equal(invalidos.length, 4);
  assert.match(invalidos[0].motivo, /não confere com a data do release/);
  assert.match(invalidos[1].motivo, /ausente/);
  assert.match(invalidos[2].motivo, /não tem planilha/);
  assert.match(invalidos[3].motivo, /não numérico/);
});

test("parse: uma planilha ilegível não aborta as demais", () => {
  const itens = coletor.parse([
    { data: "2014-01-23", slug: "2014-01-23", semPlanilha: true },
    { data: "2011-01-12", slug: "2011-01-12", arquivo: "x.xls", buffer: Buffer.from("isto não é um xls") }
  ]);

  assert.equal(itens.length, 2);
  assert.match(itens[0].erro, /não tem planilha/);
  assert.ok(itens[1].erro || itens[1].observacoes.length === 0, "lixo binário não vira dado");
  assert.throws(() => coletor.parse({}), /formato inesperado/);
});

// ---- Vintage ponta a ponta no serviço point-in-time (com repositório em memória)
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

test("vintage: 3 edições viram novo / mesmo valor / revisão no serviço point-in-time, com published_at real", async () => {
  const repo = repositorioEmMemoria();
  const { validos } = coletor.normalize([
    edicaoParseada("2011-01-12", { nome: "January", ano: 2011 }, 745),
    edicaoParseada("2011-02-09", { nome: "February", ano: 2011 }, 745), // mesmo valor: não grava
    edicaoParseada("2011-03-10", { nome: "March", ano: 2011 }, 900) // revisão
  ]);

  const r = await pointInTime.registrarObservacoes(validos, { execucaoId: "x", coletadoEm: new Date("2026-09-21T12:00:00Z") }, { observationRepository: repo });

  assert.deepEqual([r.criados, r.atualizados, r.ignorados, r.falhas.length], [1, 1, 1, 0]);
  assert.deepEqual(repo.linhas.map((l) => [l.revision_seq, l.value, l.published_at.toISOString().slice(0, 10)]), [
    [0, 745, "2011-01-12"],
    [1, 900, "2011-03-10"]
  ]);
  assert.equal(repo.linhas[0].published_at_is_estimated, false);
});

test("persist: reler edições já ingeridas (inclusive as ANTIGAS, depois das novas) não gera falha nem linha nova", async () => {
  const repo = repositorioEmMemoria();
  const edicoes = () => coletor.normalize([
    edicaoParseada("2011-01-12", { nome: "January", ano: 2011 }, 745),
    edicaoParseada("2011-02-09", { nome: "February", ano: 2011 }, 900),
    edicaoParseada("2011-03-10", { nome: "March", ano: 2011 }, 1128)
  ]).validos;

  const primeira = await coletor.persistirBackfill(edicoes(), { execucaoId: "x" }, { observationRepository: repo });
  assert.deepEqual([primeira.criados, primeira.atualizados, primeira.ignorados, primeira.falhas.length], [1, 2, 0, 0]);

  // A coleta diária relê as edições: sem o filtro, jan (745) e fev (900) seriam "valor diferente da
  // última versão (1128) com published_at anterior" e virariam 2 falhas.
  const segunda = await coletor.persist(edicoes(), { execucaoId: "y" }, { observationRepository: repo });
  assert.deepEqual([segunda.criados, segunda.atualizados, segunda.ignorados, segunda.falhas.length], [0, 0, 3, 0]);
  assert.equal(repo.linhas.length, 3);
});

test("persist: uma edição nova segue para o serviço junto de edições já ingeridas", async () => {
  const repo = repositorioEmMemoria();
  await coletor.persistirBackfill(
    coletor.normalize([edicaoParseada("2011-01-12", { nome: "January", ano: 2011 }, 745)]).validos,
    { execucaoId: "x" },
    { observationRepository: repo }
  );

  const r = await coletor.persist(
    coletor.normalize([
      edicaoParseada("2011-01-12", { nome: "January", ano: 2011 }, 745),
      edicaoParseada("2011-02-09", { nome: "February", ano: 2011 }, 675)
    ]).validos,
    { execucaoId: "y" },
    { observationRepository: repo }
  );

  assert.deepEqual([r.criados, r.atualizados, r.ignorados, r.falhas.length], [0, 1, 1, 0]);
  assert.deepEqual(repo.linhas.map((l) => l.value), [745, 675]);
});

test("persist (coleta diária) se recusa a gravar com a fonte vazia; o backfill pode; depois disso a diária funciona", async () => {
  const repo = repositorioEmMemoria();
  const validos = coletor.normalize([edicaoParseada("2026-09-11", { nome: "September", ano: 2026 }, 1567)]).validos;

  const recusada = await coletor.persist(validos, { execucaoId: "x" }, { observationRepository: repo });
  assert.equal(recusada.criados, 0);
  assert.equal(repo.linhas.length, 0, "nada gravado: gravar só a edição recente truncaria o vintage das safras");
  assert.equal(recusada.falhas.length, 1);
  assert.match(recusada.falhas[0].motivo, /1 série.*backfill:wasde-milho/);

  await coletor.persistirBackfill(validos, { execucaoId: "y" }, { observationRepository: repo });
  assert.equal(repo.linhas.length, 1);

  const nova = coletor.normalize([edicaoParseada("2026-09-15", { nome: "September", ano: 2026 }, 1600)]).validos;
  const diaria = await coletor.persist(nova, { execucaoId: "z" }, { observationRepository: repo });
  assert.deepEqual([diaria.criados, diaria.atualizados, diaria.falhas.length], [0, 1, 0]);
});

const obsRegiao = (regiao, valor = 1) => ({
  seriesCode: `WASDE.MILHO.MUNDO.${regiao}.PRODUCTION`, observedAt: "2010-09-01", safra: "2010/11", situacao: "proj",
  escopo: "MUNDO", regiao, atributo: "PRODUCTION", unidade: "Mt", valor
});

test("normalize: guarda TODAS as linhas que o WASDE oferece (EUA, mundo, países, blocos e agregados), sem filtrar região", () => {
  const regioes = ["WORLD", "BRAZIL", "UNITED_STATES", "ARGENTINA", "CHINA", "WORLD_LESS_CHINA", "EUROPEAN_UNION", "MAJOR_EXPORTERS"];
  const edicao = {
    ...edicaoParseada("2011-01-12", { nome: "January", ano: 2011 }, 745),
    observacoes: [obs("WASDE.MILHO.EUA.ENDING_STOCKS", "2010/11", 745), ...regioes.map((r) => obsRegiao(r))]
  };

  const { validos } = coletor.normalize([edicao]);

  assert.equal(validos.length, 1 + regioes.length);
  assert.deepEqual(
    validos.map((v) => v.metadata.regiao).sort(),
    ["ARGENTINA", "BRAZIL", "CHINA", "EUROPEAN_UNION", "MAJOR_EXPORTERS", "UNITED_STATES", "WORLD", "WORLD_LESS_CHINA", "UNITED_STATES"].sort()
  );
});

// ---- carga por série (a coleta diária não grava série sem carga histórica)
test("persist (diária): uma SÉRIE nova (região incluída depois no escopo) não é gravada até o backfill; as já carregadas seguem", async () => {
  const repo = repositorioEmMemoria();
  const carga = coletor.normalize([edicaoParseada("2011-01-12", { nome: "January", ano: 2011 }, 745)]).validos;
  await coletor.persistirBackfill(carga, { execucaoId: "x" }, { observationRepository: repo });

  const nova = {
    ...edicaoParseada("2011-02-09", { nome: "February", ano: 2011 }, 675),
    observacoes: [obs("WASDE.MILHO.EUA.ENDING_STOCKS", "2010/11", 675), obsRegiao("BRAZIL", 51)]
  };
  const diaria = await coletor.persist(coletor.normalize([nova]).validos, { execucaoId: "y" }, { observationRepository: repo });

  assert.deepEqual([diaria.criados, diaria.atualizados], [0, 1], "a série já carregada recebeu a edição nova");
  assert.equal(diaria.falhas.length, 1);
  assert.match(diaria.falhas[0].motivo, /1 série.*backfill:wasde-milho/);
  assert.equal(repo.linhas.some((l) => l.series_code.includes("BRAZIL")), false, "a região nova ficou de fora");
});

test("persistirBackfill: uma série NOVA recebe TODAS as edições, mesmo as que já constam para as outras séries", async () => {
  const repo = repositorioEmMemoria();
  const edicoes = (comBrasil) => [
    ["2011-01-12", "January", 745, 50],
    ["2011-02-09", "February", 675, 51],
    ["2011-03-10", "March", 730, 52]
  ].map(([data, mes, eua, br]) => ({
    ...edicaoParseada(data, { nome: mes, ano: 2011 }, eua),
    observacoes: [obs("WASDE.MILHO.EUA.ENDING_STOCKS", "2010/11", eua), ...(comBrasil ? [obsRegiao("BRAZIL", br)] : [])]
  }));

  await coletor.persistirBackfill(coletor.normalize(edicoes(false)).validos, { execucaoId: "x" }, { observationRepository: repo });
  const r = await coletor.persistirBackfill(coletor.normalize(edicoes(true)).validos, { execucaoId: "y" }, { observationRepository: repo });

  // EUA: as 3 edições já constam e são descartadas; Brasil: série nova, entra inteira (1 criada + 2 revisões).
  assert.deepEqual([r.criados, r.atualizados, r.falhas.length], [1, 2, 0]);
  const brasil = repo.linhas.filter((l) => l.series_code.includes("BRAZIL")).map((l) => l.value);
  assert.deepEqual(brasil, [50, 51, 52]);
});
