"use strict";

// O teste da leitura de eventos da geopolítica do ouro, pré-registrado (ADR 0154; item E4 da análise do ouro de
// 2026-11-01). Só roda com EPISODIOS_MINIMOS episódios de pressão de alta; antes disso, só conta os episódios e não
// calcula nenhum retorno. Não chama a IA e não grava nada.
//
// O desenho, fixado antes de olhar os retornos:
//   - episódio: um evento aceito do OURO_GEOPOLITICA com pressão de ALTA; eventos a menos de 5 pregões do anterior são o
//     mesmo episódio (Ormuz em quatro leituras seguidas conta uma vez);
//   - a base é o último pregão do GLD antes da data da leitura (o preço que a leitura da madrugada viu);
//   - o retorno do GLD encadeado (o vencimento mais próximo com ajuste nos dois pregões) 1 e 5 pregões depois da base,
//     contra o de todos os pregões do mesmo período;
//   - passa se, em 1 pregão, a alta for de pelo menos DIFERENCA_MINIMA_PP a mais de casos que em todos os pregões, com o
//     retorno médio positivo. O de 5 pregões é registrado ao lado.
//
// Uso: npm run validacao:geopolitica-ouro

const { sequelize } = require("../src/models");
const geopoliticaRepository = require("../src/repositories/geopolitica.repository");
const { calcularIndiceFuturo } = require("../src/factors/volatilidade-futuro");

const EPISODIOS_MINIMOS = 20;
const PREGOES_ENTRE_EPISODIOS = 5;
const DIFERENCA_MINIMA_PP = 10;
const PRAZOS = [1, 5];
const INICIO = "2026-10-02"; // a 1ª leitura de eventos (ADR 0047)

const fmt = (v, casas = 2) => (v === null || v === undefined ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(casas)}`);

async function main() {
  const hoje = new Date().toISOString().slice(0, 10);
  const eventos = (await geopoliticaRepository.listarEventosAceitosDoFator({ ativo: "OURO", fator: "OURO_GEOPOLITICA", dataInicio: INICIO, dataFim: hoje }))
    .filter((e) => e.pressao === "ALTA")
    .map((e) => ({ data: String(e.leitura.data_referencia).slice(0, 10), titulo: e.titulo }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
  const indice = await calcularIndiceFuturo({ prefixo: "B3.GLD", desde: "2026-09-01" });
  const datas = indice.map((p) => p.data);
  const base = (data) => datas.filter((d) => d < data).length - 1;

  const episodios = [];
  for (const e of eventos) {
    const i = base(e.data);
    if (i < 0) continue;
    if (episodios.length && i - episodios.at(-1).i < PREGOES_ENTRE_EPISODIOS) continue;
    episodios.push({ ...e, i });
  }
  console.log(`Eventos aceitos de pressão de alta (OURO_GEOPOLITICA): ${eventos.length}; episódios: ${episodios.length}`);
  for (const e of episodios) console.log(`  ${e.data}: ${e.titulo}`);
  if (episodios.length < EPISODIOS_MINIMOS) {
    console.log(`\nO teste só roda com ${EPISODIOS_MINIMOS} episódios ou mais (ADR 0154): nenhum retorno calculado.`);
    return;
  }

  const retorno = (i, h) => (i + h < indice.length ? (indice[i + h].valor / indice[i].valor - 1) * 100 : null);
  for (const h of PRAZOS) {
    const r = episodios.map((e) => retorno(e.i, h)).filter((x) => x !== null);
    const primeiro = episodios[0].i;
    const todos = indice.map((_, i) => (i >= primeiro ? retorno(i, h) : null)).filter((x) => x !== null);
    const altas = (lista) => (100 * lista.filter((x) => x > 0).length) / lista.length;
    const media = (lista) => lista.reduce((s, x) => s + x, 0) / lista.length;
    const passa = altas(r) - altas(todos) >= DIFERENCA_MINIMA_PP && media(r) > 0;
    console.log(
      `${h} pregão(ões): ${r.length} episódios | alta em ${altas(r).toFixed(0)}% (todos os pregões: ${altas(todos).toFixed(0)}%) | média ${fmt(media(r))}% (todos: ${fmt(media(todos))}%)` +
        (h === 1 ? ` | ${passa ? "PASSA" : "NÃO PASSA"}` : " | registrado ao lado")
    );
  }
}

main()
  .then(() => sequelize.close())
  .catch(async (erro) => {
    console.error(erro);
    await sequelize.close();
    process.exit(1);
  });
