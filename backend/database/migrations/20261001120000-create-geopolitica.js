"use strict";

// Leitura diária de geopolítica para o ouro e o petróleo (ADR 0047): uma chamada ao Gemini com busca na web por dia,
// no padrão do AgroMind (ADR 0027 de lá). Cada dia tem UMA leitura (a resposta bruta da IA, o nível e o resumo de
// cada ativo) e os eventos dela. Reexecutar no mesmo dia apaga e recria a leitura do dia (os eventos saem em
// cascata), numa transação.
//
// Escopo: GLOBAL (ADR 0007, §3) - é dado de mercado, nunca ganha workspace_id.
//
// Não é point-in-time (ADR 0008) de propósito: a leitura é o contexto do fator do dia, não uma série que a fonte
// revisa; a busca ao vivo não é reproduzível, então ela só vale da primeira coleta em diante.

const agora = (Sequelize) => ({ type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") });

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const opcoes = { transaction };

      await queryInterface.createTable(
        "geopolitica_leitura",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          data_referencia: { type: Sequelize.DATEONLY, allowNull: false },
          // Nível de cada ativo: NORMAL | ATENCAO | RELEVANTE | EXCEPCIONAL (escala provisória, ADR 0047).
          nivel_ouro: { type: Sequelize.STRING(20), allowNull: false },
          resumo_ouro: { type: Sequelize.TEXT, allowNull: true },
          nivel_petroleo: { type: Sequelize.STRING(20), allowNull: false },
          resumo_petroleo: { type: Sequelize.TEXT, allowNull: true },
          // Proveniência da chamada: a resposta inteira, o prompt enviado e o grounding da busca, como vieram.
          texto_bruto: { type: Sequelize.TEXT, allowNull: false },
          // O que foi enviado à IA, como foi: a instrução do sistema (regras, escala, formato) e o prompt (data e sites).
          instrucao_sistema: { type: Sequelize.TEXT, allowNull: false },
          prompt: { type: Sequelize.TEXT, allowNull: false },
          versao_prompt: { type: Sequelize.STRING(40), allowNull: false },
          modelo: { type: Sequelize.STRING(80), allowNull: false },
          tokens: { type: Sequelize.INTEGER, allowNull: true },
          // Chave do Gemini que respondeu: "gratuita" ou "paga" (a paga só entra quando a gratuita falha).
          chave: { type: Sequelize.STRING(10), allowNull: false },
          grounding: { type: Sequelize.JSONB, allowNull: true },
          collection_execution_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "collection_execution", key: "id" }
          },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await queryInterface.addIndex("geopolitica_leitura", ["data_referencia"], {
        name: "uq_geopolitica_leitura_data",
        unique: true,
        transaction
      });
      for (const coluna of ["nivel_ouro", "nivel_petroleo"]) {
        await queryInterface.sequelize.query(
          `ALTER TABLE geopolitica_leitura ADD CONSTRAINT ck_geopolitica_leitura_${coluna} CHECK (${coluna} IN ('NORMAL', 'ATENCAO', 'RELEVANTE', 'EXCEPCIONAL'))`,
          opcoes
        );
      }

      await queryInterface.createTable(
        "geopolitica_evento",
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          leitura_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "geopolitica_leitura", key: "id" },
            onDelete: "CASCADE"
          },
          ativo: { type: Sequelize.STRING(20), allowNull: false },
          // Assunto (o fator): hoje só GEOPOLITICA, preenchido pelo coletor, nunca pela IA. Um assunto novo usa o mesmo
          // mecanismo com o próprio prompt e as próprias fontes (ADR 0047).
          assunto: { type: Sequelize.STRING(30), allowNull: false },
          // Tipo dentro do assunto, da lista fechada do prompt (v6). Valor fora da lista vira OUTRO; null = não veio.
          tipo: { type: Sequelize.STRING(30), allowNull: true },
          // Posição do evento na seção do ativo (EVENTO 1, 2...): a ordem de relevância que a IA deu.
          ordem: { type: Sequelize.INTEGER, allowNull: false },
          titulo: { type: Sequelize.STRING(300), allowNull: false },
          resumo: { type: Sequelize.TEXT, allowNull: true },
          canal_transmissao: { type: Sequelize.TEXT, allowNull: true },
          // ALTA | BAIXA | AMBIGUA: para que lado o fato, sozinho e com o resto constante, empurra o preço do ativo.
          // Leitura da IA, não previsão nem tendência (prompt v2, ADR 0047). null: o texto não trouxe um valor reconhecível.
          pressao: { type: Sequelize.STRING(10), allowNull: true },
          // BAIXA | MEDIA | ALTA, autodeclaradas pela IA; null quando o texto não trouxe um valor reconhecível.
          intensidade: { type: Sequelize.STRING(10), allowNull: true },
          confianca: { type: Sequelize.STRING(10), allowNull: true },
          // [{ nome, url, fonteAutorizada }] - fonteAutorizada é o código da fonte da lista (ou null).
          fontes: { type: Sequelize.JSONB, allowNull: false },
          // false = nenhuma fonte autorizada sustenta o evento: fica gravado para a tela, mas não vai ao Motor.
          aceito: { type: Sequelize.BOOLEAN, allowNull: false },
          motivo_rejeicao: { type: Sequelize.STRING(255), allowNull: true },
          created_at: agora(Sequelize),
          updated_at: agora(Sequelize)
        },
        opcoes
      );
      await queryInterface.addIndex("geopolitica_evento", ["leitura_id", "ativo", "ordem"], {
        name: "idx_geopolitica_evento_leitura_ativo",
        transaction
      });
      await queryInterface.sequelize.query(
        "ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_ativo CHECK (ativo IN ('OURO', 'PETROLEO'))",
        opcoes
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_pressao CHECK (pressao IN ('ALTA', 'BAIXA', 'AMBIGUA'))",
        opcoes
      );
      // Em sincronia manual com GeopoliticaEvento.ASSUNTOS e .TIPOS (model). Assunto novo = um valor a mais aqui (ADR).
      await queryInterface.sequelize.query(
        "ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_assunto CHECK (assunto IN ('GEOPOLITICA'))",
        opcoes
      );
      await queryInterface.sequelize.query(
        "ALTER TABLE geopolitica_evento ADD CONSTRAINT ck_geopolitica_evento_tipo CHECK (tipo IN ('CONFLITO_MILITAR', 'ROTA_MARITIMA', 'INFRAESTRUTURA', 'SANCAO', 'PRODUCAO', 'DIPLOMACIA', 'OUTRO'))",
        opcoes
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("geopolitica_evento", { transaction });
      await queryInterface.dropTable("geopolitica_leitura", { transaction });
    });
  }
};
