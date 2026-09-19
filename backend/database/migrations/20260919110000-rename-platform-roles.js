"use strict";

// docs/adr/0007-escopo-de-dados-global-espaco-usuario.md, §5: user.role é
// papel de PLATAFORMA e não pode compartilhar vocabulário com o papel dentro
// de um Espaço (workspace_member.role = owner | editor | viewer).
//   owner       -> admin
//   colaborador -> user
// Só os valores mudam; a coluna continua `role`. Roda também em bancos sem
// nenhum usuário (o UPDATE simplesmente não afeta linhas).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "UPDATE user SET role = CASE role WHEN 'owner' THEN 'admin' WHEN 'colaborador' THEN 'user' ELSE role END"
    );

    await queryInterface.changeColumn("user", "role", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "user"
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "UPDATE user SET role = CASE role WHEN 'admin' THEN 'owner' WHEN 'user' THEN 'colaborador' ELSE role END"
    );

    await queryInterface.changeColumn("user", "role", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "colaborador"
    });
  }
};
