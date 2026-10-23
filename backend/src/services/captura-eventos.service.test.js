"use strict";

process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || "5432";
process.env.POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || "finmind_test";
process.env.POSTGRES_USER = process.env.POSTGRES_USER || "finmind";
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  gerarCandidatos,
  listar,
  criarManual,
  avaliar,
  remover,
  candidatosDoCalendario,
  candidatosDoPreco,
  candidatosSecundarios,
  retornosDoFuturo,
  resumir,
  janelaDeCaptura
} = require("./captura-eventos.service");
const { somarDias } = require("../shared/utils/date-utils");

const ID = "11111111-2222-4333-8444-555555555555";
const USUARIO = "99999999-2222-4333-8444-555555555555";

test("janela de captura: do dia do evento até 2 dias úteis depois (a sexta vai até a terça)", () => {
  assert.deepEqual(janelaDeCaptura("2026-10-23"), { inicio: "2026-10-23", fim: "2026-10-27" });
  assert.deepEqual(janelaDeCaptura("2026-10-20"), { inicio: "2026-10-20", fim: "2026-10-22" });
});

test("calendário: um candidato por relatório do ativo e dia de publicação; a fonte de outro ativo fica de fora", () => {
  const dias = [
    { sourceCode: "CONAB_LEVANTAMENTO_CAFE", dia: "2026-09-24", estimada: false, versoes: 120 },
    { sourceCode: "USDA_WASDE", dia: "2026-09-11", estimada: false, versoes: 40 }
  ];
  const [c, ...resto] = candidatosDoCalendario("CAFE", dias);
  assert.equal(resto.length, 0);
  assert.deepEqual(c, {
    ativo: "CAFE",
    data: "2026-09-24",
    origem: "CALENDARIO",
    chave: "CALENDARIO:CAFE:CONAB_LEVANTAMENTO_CAFE:2026-09-24",
    titulo: "Publicação: Conab: levantamento da safra de café",
    detalhe: { fonte: "CONAB_LEVANTAMENTO_CAFE", versoes: 120, dataEstimada: false }
  });
  assert.equal(candidatosDoCalendario("MILHO", dias)[0].chave, "CALENDARIO:MILHO:USDA_WASDE:2026-09-11");
});

// 70 pregões: o Z26 alterna +1% e −1%; no 66º, sobe 5%. O H27 tem mais negócios só a partir do 68º, quando já negocia
// há um dia: a troca não vira retorno.
function futuro() {
  const ajustes = new Map([["ICFZ26", new Map()], ["ICFH27", new Map()]]);
  const negociados = new Map([["ICFZ26", new Map()], ["ICFH27", new Map()]]);
  let preco = 100;
  for (let i = 0; i < 70; i += 1) {
    const dia = somarDias("2026-01-01", i);
    preco *= i === 0 ? 1 : i === 66 ? 1.05 : i % 2 ? 1.01 : 0.99;
    ajustes.get("ICFZ26").set(dia, preco);
    negociados.get("ICFZ26").set(dia, i >= 68 ? 10 : 500);
    if (i >= 67) {
      ajustes.get("ICFH27").set(dia, 90);
      negociados.get("ICFH27").set(dia, i >= 68 ? 900 : 0);
    }
  }
  return { ajustes, negociados };
}

test("movimento do preço: o retorno no vencimento mais negociado, dentro do contrato, com o z contra os 60 anteriores", () => {
  const retornos = retornosDoFuturo(futuro());
  assert.equal(retornos.length, 69);
  assert.ok(retornos.slice(0, 60).every((r) => r.z === null));
  const salto = retornos.find((r) => r.data === somarDias("2026-01-01", 66));
  assert.equal(salto.ticker, "ICFZ26");
  assert.ok(Math.abs(salto.retorno - 0.05) < 1e-9);
  assert.ok(salto.z > 4);
  // No 68º o H27 é o mais negociado, e o retorno é o dele (90 → 90), não o salto de 100 para 90.
  const troca = retornos.find((r) => r.data === somarDias("2026-01-01", 68));
  assert.equal(troca.ticker, "ICFH27");
  assert.equal(troca.retorno, 0);

  const candidatos = candidatosDoPreco("CAFE", retornos, { dataInicio: "2026-01-01", dataFim: "2026-12-31" });
  assert.deepEqual(
    candidatos.map((c) => [c.chave, c.origem]),
    [[`PRECO:CAFE:${somarDias("2026-01-01", 66)}`, "PRECO"]]
  );
  assert.match(candidatos[0].titulo, /^Movimento do preço: ICFZ26 \(dez\/2026\) \+5,0% no dia \(z \+\d/);
  // Fora do período, nada.
  assert.equal(candidatosDoPreco("CAFE", retornos, { dataInicio: "2026-12-01", dataFim: "2026-12-31" }).length, 0);
});

test("alerta de fonte secundária: só o evento sustentado apenas por secundária; a chave usa o título, não o id", () => {
  const eventos = [
    { data: "2026-10-20", titulo: "Chuva atrasa a florada", fontes: [{ origem: "pesquisa", nome: "Notícias Agrícolas", secundaria: true }] },
    { data: "2026-10-20", titulo: "Conab revisa a safra", fontes: [{ origem: "pesquisa", nome: "Conab" }, { origem: "pesquisa", nome: "Safras", secundaria: true }] },
    { data: "2026-10-21", titulo: "Sem página", fontes: [{ origem: "citada", nome: "X", secundaria: true }] }
  ];
  const candidatos = candidatosSecundarios("CAFE", eventos);
  assert.equal(candidatos.length, 1);
  assert.equal(candidatos[0].titulo, "Alerta: Chuva atrasa a florada");
  assert.match(candidatos[0].chave, /^SECUNDARIA:CAFE:2026-10-20:[0-9a-f]{12}$/);
  assert.deepEqual(candidatos[0].detalhe, { fontes: ["Notícias Agrícolas"] });
});

test("resumo: o percentual sobre os relevantes conferidos, contra a meta de 80%, e sem os alertas de fonte secundária", () => {
  const item = (origem, relevante, captura = null) => ({ origem, relevante, captura });
  const itens = [
    item("CALENDARIO", true, "CAPTURADO"),
    item("CALENDARIO", true, "CAPTURADO"),
    item("PRECO", true, "NAO_CAPTURADO"),
    item("PRECO", false),
    item("SECUNDARIA", true, "CAPTURADO"),
    item("SECUNDARIA", true, "CAPTURADO"),
    item("MANUAL", true, null),
    item("PRECO", null)
  ];
  const r = resumir(itens, { dataInicio: "2026-09-22", dataFim: "2026-10-21" });
  assert.equal(r.total, 8);
  assert.equal(r.pendentes, 1);
  assert.equal(r.relevantes, 6);
  assert.equal(r.capturados, 4);
  assert.equal(r.semConferencia, 1);
  assert.equal(r.pctCaptura, 80);
  assert.equal(r.atingeMeta, true);
  assert.ok(Math.abs(r.semSecundaria.pctCaptura - 200 / 3) < 1e-9);
  assert.equal(r.porOrigem.PRECO.total, 3);
  assert.equal(r.diasDoPeriodo, 30);
  assert.equal(r.periodoDoCriterio, true);
  assert.equal(r.completo, false);
  assert.equal(resumir([], { dataInicio: "2026-10-01", dataFim: "2026-10-01" }).pctCaptura, null);
});

test("gerar candidatos: junta os três gatilhos e grava só os novos; listar devolve a janela e o critério", async () => {
  const gravados = [];
  const deps = {
    agora: new Date("2026-10-23T12:00:00Z"),
    observationRepository: {
      async listarDiasDePublicacao({ sourceCodes, dataInicio, dataFim }) {
        assert.ok(sourceCodes.includes("CONAB_LEVANTAMENTO_CAFE"));
        assert.deepEqual([dataInicio, dataFim], ["2026-09-22", "2026-10-21"]);
        return [{ sourceCode: "CONAB_LEVANTAMENTO_CAFE", dia: "2026-09-24", estimada: false, versoes: 3 }];
      },
      async listarUltimasDatasItens({ prefixoSerie }) {
        assert.equal(prefixoSerie, "B3.ICF");
        return [];
      }
    },
    geopoliticaRepository: {
      async listarEventosAceitosDoAtivo({ ativo }) {
        assert.equal(ativo, "CAFE");
        return [{ titulo: "Alerta X", leitura: { data_referencia: "2026-10-01" }, fontes: [{ origem: "pesquisa", nome: "TE", secundaria: true }] }];
      }
    },
    eventoReferenciaRepository: {
      async inserirCandidatos(candidatos) {
        gravados.push(...candidatos);
        return 1;
      },
      async listar() {
        return gravados.map((c, i) => ({ id: `id-${i}`, ...c, relevante: null, captura: null, captura_evento: null, observacao: null, avaliado_em: null }));
      }
    }
  };
  const r = await gerarCandidatos({ ativo: "cafe", dataInicio: "2026-09-22", dataFim: "2026-10-21" }, deps);
  assert.deepEqual(r, { criados: 1, gerados: 2, porOrigem: { CALENDARIO: 1, PRECO: 0, SECUNDARIA: 1, MANUAL: 0 } });

  const lista = await listar({ ativo: "CAFE", dataInicio: "2026-09-22", dataFim: "2026-10-21" }, deps);
  assert.equal(lista.eventosReferencia.length, 2);
  assert.deepEqual(lista.eventosReferencia[0].janela, { inicio: "2026-09-24", fim: "2026-09-28" });
  assert.equal(lista.eventosReferencia[0].origemRotulo, "Publicação de relatório");
  assert.equal(lista.criterio.metaPct, 80);
  assert.equal(lista.resumo.pendentes, 2);

  await assert.rejects(() => gerarCandidatos({ ativo: "OURO", dataInicio: "2026-09-22", dataFim: "2026-10-21" }, deps), /"ativo" deve ser um entre: MILHO, CAFE, SOJA/);
  await assert.rejects(() => listar({ ativo: "CAFE", dataInicio: "2026-10-21", dataFim: "2026-09-22" }, deps), /não pode ser depois/);
});

function repoComUm(registro) {
  const chamadas = [];
  return {
    chamadas,
    async buscarPorId(id) {
      return id === registro.id ? registro : null;
    },
    async atualizar(id, campos) {
      chamadas.push(campos);
      return { ...registro, ...campos };
    },
    async remover(id) {
      chamadas.push({ removido: id });
    },
    async criar(campos) {
      return { id: ID, ...campos };
    }
  };
}

const BASE = { id: ID, ativo: "CAFE", data: "2026-10-23", origem: "PRECO", titulo: "Movimento", detalhe: null, relevante: null, captura: null, captura_evento: null, observacao: null };

test("avaliar: a captura só num relevante, o evento que capturou na janela, e quem avaliou", async () => {
  const deps = { agora: new Date("2026-10-23T12:00:00Z"), eventoReferenciaRepository: repoComUm(BASE) };
  await assert.rejects(() => avaliar(ID, { captura: "CAPTURADO" }, USUARIO, deps), /Só um evento relevante tem captura/);

  const evento = { id: "e1", data: "2026-10-27", titulo: "Geada no sul de Minas" };
  const { eventoReferencia: r } = await avaliar(ID, { relevante: true, captura: "CAPTURADO", capturaEvento: evento }, USUARIO, deps);
  assert.equal(r.captura, "CAPTURADO");
  assert.deepEqual(r.capturaEvento, evento);
  assert.equal(deps.eventoReferenciaRepository.chamadas[0].avaliado_por, USUARIO);

  // Fora da janela (sexta + 2 dias úteis = terça, 27/10).
  await assert.rejects(
    () => avaliar(ID, { relevante: true, captura: "CAPTURADO", capturaEvento: { ...evento, data: "2026-10-28" } }, USUARIO, deps),
    /de 2026-10-23 a 2026-10-27/
  );

  // Não relevante: a captura sai.
  const depsCapturado = { eventoReferenciaRepository: repoComUm({ ...BASE, relevante: true, captura: "CAPTURADO", captura_evento: evento }) };
  const { eventoReferencia: naoRelevante } = await avaliar(ID, { relevante: false }, USUARIO, depsCapturado);
  assert.deepEqual([naoRelevante.relevante, naoRelevante.captura, naoRelevante.capturaEvento], [false, null, null]);
  // Não capturado: o evento que capturou sai.
  const { eventoReferencia: naoCapturado } = await avaliar(ID, { captura: "NAO_CAPTURADO" }, USUARIO, depsCapturado);
  assert.deepEqual([naoCapturado.captura, naoCapturado.capturaEvento], ["NAO_CAPTURADO", null]);

  await assert.rejects(() => avaliar("nao-e-uuid", { relevante: true }, USUARIO, deps), /não encontrado/);
  await assert.rejects(() => avaliar(ID, { relevante: "sim" }, USUARIO, deps), /"relevante" deve ser/);
});

test("manual: entra como relevante; só o manual pode ser removido", async () => {
  const deps = { agora: new Date("2026-10-23T12:00:00Z"), eventoReferenciaRepository: repoComUm(BASE) };
  const { eventoReferencia: m } = await criarManual({ ativo: "SOJA", data: "2026-10-20", titulo: " Greve no porto " }, USUARIO, deps);
  assert.deepEqual([m.origem, m.relevante, m.titulo, m.ativo], ["MANUAL", true, "Greve no porto", "SOJA"]);
  await assert.rejects(() => criarManual({ ativo: "SOJA", data: "2026-10-20", titulo: "" }, USUARIO, deps), /"titulo" é obrigatório/);

  await assert.rejects(() => remover(ID, deps), /Só o evento adicionado à mão/);
  const depsManual = { eventoReferenciaRepository: repoComUm({ ...BASE, origem: "MANUAL" }) };
  await remover(ID, depsManual);
  assert.deepEqual(depsManual.eventoReferenciaRepository.chamadas, [{ removido: ID }]);
});
