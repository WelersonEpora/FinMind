"use strict";

// Eventos de mercado (análise do café de 2026-10-19, item E2; ADR 0130):
//   - geopolitica_leitura: o nível NAO_VERIFICADO. Quando a pesquisa do dia não cumpre o mínimo de fontes de um ativo e
//     a IA o declara NORMAL, o coletor grava NAO_VERIFICADO: "NORMAL" só com o escopo pesquisado. O nível é do coletor,
//     não da IA (a escala da IA continua com os quatro de antes).
//   - geopolitica_evento: o tipo SAFRA (a safra de fora do que o FinMind coleta em série: a Colômbia, o Vietnã).
//
// Escopo: GLOBAL (ADR 0007, §3), como as tabelas.

const ATIVOS = ["ouro", "petroleo", "milho", "cafe", "soja", "dolar"];
const NIVEIS_ANTES = "('NORMAL', 'ATENCAO', 'RELEVANTE', 'EXCEPCIONAL')";
const NIVEIS_DEPOIS = "('NORMAL', 'ATENCAO', 'RELEVANTE', 'EXCEPCIONAL', 'NAO_VERIFICADO')";
const TIPOS_ANTES = [
  "GEOPOLITICA",
  "POLITICA_COMERCIAL",
  "CLIMA_EXTREMO",
  "REGULACAO",
  "CHOQUE_LOGISTICO",
  "SANIDADE",
  "POLITICA_OFERTA",
  "POLITICA_MONETARIA",
  "POLITICA_FISCAL",
  "RISCO_INSTITUCIONAL",
  "INTERVENCAO_CAMBIAL",
  "DADO_ECONOMICO"
];
const lista = (valores) => `(${valores.map((v) => `'${v}'`).join(", ")})`;

async function trocar(queryInterface, niveis, tipos) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const sql = (texto) => queryInterface.sequelize.query(texto, { transaction });
    for (const ativo of ATIVOS) {
      const nome = `ck_geopolitica_leitura_nivel_${ativo}`;
      await sql(`ALTER TABLE geopolitica_leitura DROP CONSTRAINT ${nome}`);
      await sql(`ALTER TABLE geopolitica_leitura ADD CONSTRAINT ${nome} CHECK (nivel_${ativo} IN ${niveis})`);
    }
    await sql("ALTER TABLE geopolitica_evento DROP CONSTRAINT ck_geopolitica_evento_tipo");
    await sql(`ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_tipo CHECK (tipo IN ${lista(tipos)})`);
  });
}

module.exports = {
  async up(queryInterface) {
    await trocar(queryInterface, NIVEIS_DEPOIS, [...TIPOS_ANTES, "SAFRA"]);
  },

  // Volta só se nenhuma leitura tiver NAO_VERIFICADO nem evento SAFRA (as constraints antigas recusam a linha).
  async down(queryInterface) {
    await trocar(queryInterface, NIVEIS_ANTES, TIPOS_ANTES);
  }
};
