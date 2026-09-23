"use strict";

// Escopo: GLOBAL (mesma tabela do 20260920100000-create-observation-table.js).
//
// Índice de cobertura para o resumo por série (`observation.repository.js::resumirSeries`), usado pela lista de
// observáveis e pela tela de detalhe de cada card (primeira/última data, total, % de publicação estimada).
// A consulta lê `source_code` e `published_at_is_estimated`, que não estavam em nenhum índice: para cada linha o
// banco ia até a tabela (onde fica o `metadata` JSON), não só ao índice. Achado real depois do backfill do CCM
// pelo Boletim Diário (ADR 0020), que triplicou as linhas do card: em dev, o detalhe do CCM passou a levar
// ~1,1 s só nesse resumo, e na VM de produção, disputando CPU, as requisições chegaram a ~20 s e foram
// abortadas. Com este índice o resumo é lido só do índice.
//
// A ORDEM das colunas importa (medido em dev, 238 séries do CCM): `source_code` logo depois de `series_code` casa
// com o `GROUP BY series_code, source_code` e elimina o filesort - o resumo caiu de ~800 ms para ~37 ms. Com
// `source_code` no fim do índice, ele era usado ("Using index"), mas o filesort mantinha ~500 ms.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex("observation", ["series_code", "source_code", "observed_at", "published_at_is_estimated"], {
      name: "idx_observation_resumo"
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("observation", "idx_observation_resumo");
  }
};
