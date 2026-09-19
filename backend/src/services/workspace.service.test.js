"use strict";

process.env.MARIADB_HOST = process.env.MARIADB_HOST || "localhost";
process.env.MARIADB_PORT = process.env.MARIADB_PORT || "3306";
process.env.MARIADB_DATABASE = process.env.MARIADB_DATABASE || "finmind_test";
process.env.MARIADB_USER = process.env.MARIADB_USER || "finmind";
process.env.MARIADB_PASSWORD = process.env.MARIADB_PASSWORD || "finmind";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const workspaceService = require("./workspace.service");

function vinculo({ id, name, personalUserId = null, role }) {
  return { role, espaco: { id, name, personal_user_id: personalUserId } };
}

// ---------- listarEspacosDoUsuario ----------

test("listarEspacosDoUsuario consulta só os vínculos do usuário informado", async () => {
  let consultado = null;
  const repo = {
    findMembershipsByUser: async (userId) => {
      consultado = userId;
      return [];
    }
  };

  const resultado = await workspaceService.listarEspacosDoUsuario("user-1", { workspaceRepository: repo });

  assert.equal(consultado, "user-1");
  assert.deepEqual(resultado, { espacos: [] });
});

test("listarEspacosDoUsuario mapeia id, nome, pessoal e papel", async () => {
  const repo = {
    findMembershipsByUser: async () => [
      vinculo({ id: "w1", name: "Espaço pessoal", personalUserId: "user-1", role: "owner" }),
      vinculo({ id: "w2", name: "Família Souza", role: "editor" })
    ]
  };

  const { espacos } = await workspaceService.listarEspacosDoUsuario("user-1", { workspaceRepository: repo });

  assert.deepEqual(espacos, [
    { id: "w1", nome: "Espaço pessoal", pessoal: true, papel: "owner" },
    { id: "w2", nome: "Família Souza", pessoal: false, papel: "editor" }
  ]);
});

test("listarEspacosDoUsuario põe o pessoal primeiro e ordena os demais por nome", async () => {
  const repo = {
    findMembershipsByUser: async () => [
      vinculo({ id: "w3", name: "Cliente B", role: "editor" }),
      vinculo({ id: "w1", name: "Espaço pessoal", personalUserId: "user-1", role: "owner" }),
      vinculo({ id: "w2", name: "Álvaro (cliente A)", role: "viewer" })
    ]
  };

  const { espacos } = await workspaceService.listarEspacosDoUsuario("user-1", { workspaceRepository: repo });

  assert.deepEqual(
    espacos.map((espaco) => espaco.id),
    ["w1", "w2", "w3"]
  );
});

test("o espaço pessoal de OUTRO usuário nunca é marcado como meu pessoal", async () => {
  const repo = {
    findMembershipsByUser: async () => [vinculo({ id: "w9", name: "Espaço pessoal", personalUserId: "user-2", role: "viewer" })]
  };

  const { espacos } = await workspaceService.listarEspacosDoUsuario("user-1", { workspaceRepository: repo });

  assert.equal(espacos[0].pessoal, false);
});

// ---------- criarEspaco ----------

test("criarEspaco cria um espaço compartilhado em que o criador é owner", async () => {
  let recebido = null;
  const repo = {
    createSharedWithOwner: async (dados) => {
      recebido = dados;
      return { id: "w-novo", name: dados.name };
    }
  };

  const resultado = await workspaceService.criarEspaco("user-1", { nome: "  Família Souza  " }, { workspaceRepository: repo });

  assert.deepEqual(recebido, { name: "Família Souza", ownerUserId: "user-1" });
  assert.deepEqual(resultado, { espaco: { id: "w-novo", nome: "Família Souza", pessoal: false, papel: "owner" } });
});

test("criarEspaco exige um nome de verdade", async () => {
  const repo = { createSharedWithOwner: async () => assert.fail("não deveria criar") };

  for (const nome of [undefined, null, "", "   ", 42, {}]) {
    await assert.rejects(() => workspaceService.criarEspaco("user-1", { nome }, { workspaceRepository: repo }), /nome/);
  }
  await assert.rejects(() => workspaceService.criarEspaco("user-1", undefined, { workspaceRepository: repo }), /nome/);
});

test("criarEspaco rejeita nome maior que 120 caracteres", async () => {
  const repo = { createSharedWithOwner: async () => assert.fail("não deveria criar") };
  await assert.rejects(
    () => workspaceService.criarEspaco("user-1", { nome: "x".repeat(121) }, { workspaceRepository: repo }),
    /120/
  );
});

// ---------- listarMembros ----------

function vinculoMembro({ id, userId, nome, email, role }) {
  return { id, user_id: userId, role, usuario: { id: userId, name: nome, email } };
}

test("listarMembros: owner vê o e-mail; os demais só nome e papel", async () => {
  const repo = {
    findMembers: async () => [
      vinculoMembro({ id: "m1", userId: "u-dono", nome: "Dono", email: "dono@x.com", role: "owner" }),
      vinculoMembro({ id: "m2", userId: "u-ed", nome: "Editora", email: "ed@x.com", role: "editor" })
    ]
  };

  const comoOwner = await workspaceService.listarMembros("w1", { userId: "u-dono", papel: "owner" }, { workspaceRepository: repo });
  assert.equal(comoOwner.membros[0].email, "dono@x.com");
  assert.equal(comoOwner.membros[1].email, "ed@x.com");

  const comoEditor = await workspaceService.listarMembros("w1", { userId: "u-ed", papel: "editor" }, { workspaceRepository: repo });
  for (const membro of comoEditor.membros) {
    assert.equal("email" in membro, false, "editor não pode ver e-mails");
    assert.equal("user_id" in membro || "usuarioId" in membro, false, "nunca expõe id de usuário");
  }
});

test("listarMembros marca 'voce' e ordena owner > editor > viewer, depois por nome", async () => {
  const repo = {
    findMembers: async () => [
      vinculoMembro({ id: "m3", userId: "u3", nome: "Zé", email: "z@x.com", role: "viewer" }),
      vinculoMembro({ id: "m2", userId: "u2", nome: "Ana", email: "a@x.com", role: "viewer" }),
      vinculoMembro({ id: "m1", userId: "u1", nome: "Dono", email: "d@x.com", role: "owner" })
    ]
  };

  const { membros } = await workspaceService.listarMembros("w1", { userId: "u2", papel: "viewer" }, { workspaceRepository: repo });

  assert.deepEqual(membros.map((m) => m.nome), ["Dono", "Ana", "Zé"]);
  assert.deepEqual(membros.map((m) => m.voce), [false, true, false]);
});

// ---------- adicionarMembro ----------

function repoAdicao({ espaco = { id: "w1", personal_user_id: null }, jaMembro = false, falhaAoAdicionar = null } = {}) {
  const chamadas = { addMember: [] };
  return {
    chamadas,
    findWorkspaceById: async () => espaco,
    findMembership: async () => (jaMembro ? { id: "m-existente" } : null),
    addMember: async (dados) => {
      if (falhaAoAdicionar) throw falhaAoAdicionar;
      chamadas.addMember.push(dados);
      return { id: "m-novo", role: dados.role };
    }
  };
}

const usuarioAtivo = { id: "u-alvo", name: "Alvo", email: "alvo@x.com", active: true };
const usersCom = (usuario) => ({ findByEmail: async (email) => (usuario && email === usuario.email ? usuario : null) });
const depsCom = (repo, usuario = usuarioAtivo) => ({ workspaceRepository: repo, userRepository: usersCom(usuario) });

test("adicionarMembro cria o vínculo com o papel pedido (e-mail normalizado)", async () => {
  const repo = repoAdicao();

  const resultado = await workspaceService.adicionarMembro("w1", { email: "  ALVO@x.com ", papel: "editor" }, depsCom(repo));

  assert.deepEqual(repo.chamadas.addMember, [{ workspaceId: "w1", userId: "u-alvo", role: "editor" }]);
  assert.deepEqual(resultado, { membro: { id: "m-novo", nome: "Alvo", email: "alvo@x.com", papel: "editor", voce: false } });
});

test("adicionarMembro só aceita editor ou viewer - nunca owner", async () => {
  for (const papel of ["owner", "admin", "", undefined, "dono"]) {
    const repo = repoAdicao();
    await assert.rejects(() => workspaceService.adicionarMembro("w1", { email: "alvo@x.com", papel }, depsCom(repo)), /papel/);
    assert.equal(repo.chamadas.addMember.length, 0);
  }
});

test("adicionarMembro exige e-mail", async () => {
  const repo = repoAdicao();
  for (const email of [undefined, "", "   ", 5]) {
    await assert.rejects(() => workspaceService.adicionarMembro("w1", { email, papel: "viewer" }, depsCom(repo)), /email/);
  }
});

test("e-mail inexistente e usuário inativo dão a MESMA resposta (sem enumeração)", async () => {
  const repo = repoAdicao();
  const erroDe = async (usuario, email) => {
    try {
      await workspaceService.adicionarMembro("w1", { email, papel: "viewer" }, depsCom(repo, usuario));
    } catch (err) {
      return { status: err.statusCode, message: err.message, code: err.code };
    }
    return null;
  };

  const inexistente = await erroDe(null, "ninguem@x.com");
  const inativo = await erroDe({ ...usuarioAtivo, active: false }, "alvo@x.com");

  assert.equal(inexistente.status, 404);
  assert.deepEqual(inexistente, inativo);
  assert.equal(repo.chamadas.addMember.length, 0);
});

test("o espaço pessoal não aceita outros membros", async () => {
  const repo = repoAdicao({ espaco: { id: "w1", personal_user_id: "u-dono" } });
  await assert.rejects(() => workspaceService.adicionarMembro("w1", { email: "alvo@x.com", papel: "viewer" }, depsCom(repo)), /pessoal/);
  assert.equal(repo.chamadas.addMember.length, 0);
});

test("adicionarMembro impede duplicação (checagem prévia)", async () => {
  const repo = repoAdicao({ jaMembro: true });
  await assert.rejects(() => workspaceService.adicionarMembro("w1", { email: "alvo@x.com", papel: "viewer" }, depsCom(repo)), /já é membro/);
  assert.equal(repo.chamadas.addMember.length, 0);
});

test("adicionarMembro impede duplicação também na corrida (índice único do banco)", async () => {
  const corrida = Object.assign(new Error("dup"), { name: "SequelizeUniqueConstraintError" });
  const repo = repoAdicao({ falhaAoAdicionar: corrida });
  await assert.rejects(() => workspaceService.adicionarMembro("w1", { email: "alvo@x.com", papel: "viewer" }, depsCom(repo)), /já é membro/);
});

test("adicionarMembro propaga erros inesperados do banco (não os mascara)", async () => {
  const repo = repoAdicao({ falhaAoAdicionar: new Error("banco caiu") });
  await assert.rejects(() => workspaceService.adicionarMembro("w1", { email: "alvo@x.com", papel: "viewer" }, depsCom(repo)), /banco caiu/);
});

// ---------- listarCandidatos ----------

test("listarCandidatos devolve só nome e e-mail (sem id nem senha)", async () => {
  const repo = {
    findWorkspaceById: async () => ({ id: "w1", personal_user_id: null }),
    findAddableUsers: async () => [
      { id: "u1", name: "Ana", email: "ana@x.com", password_hash: "segredo", role: "admin" },
      { id: "u2", name: "Bia", email: "bia@x.com", password_hash: "segredo", role: "user" }
    ]
  };

  const resultado = await workspaceService.listarCandidatos("w1", { workspaceRepository: repo });

  assert.deepEqual(resultado, {
    candidatos: [
      { nome: "Ana", email: "ana@x.com" },
      { nome: "Bia", email: "bia@x.com" }
    ]
  });
  assert.doesNotMatch(JSON.stringify(resultado), /segredo|u1|u2|admin|password/);
});

test("listarCandidatos consulta os candidatos DO espaço informado", async () => {
  let consultado = null;
  const repo = {
    findWorkspaceById: async () => ({ id: "w-x", personal_user_id: null }),
    findAddableUsers: async (workspaceId) => {
      consultado = workspaceId;
      return [];
    }
  };

  const resultado = await workspaceService.listarCandidatos("w-x", { workspaceRepository: repo });

  assert.equal(consultado, "w-x");
  assert.deepEqual(resultado, { candidatos: [] });
});

test("o espaço pessoal não lista candidatos (não aceita membros)", async () => {
  const repo = {
    findWorkspaceById: async () => ({ id: "w1", personal_user_id: "u-dono" }),
    findAddableUsers: async () => assert.fail("não deveria consultar usuários")
  };
  await assert.rejects(() => workspaceService.listarCandidatos("w1", { workspaceRepository: repo }), /pessoal/);
});

test("listarCandidatos com espaço inexistente: 404", async () => {
  const repo = { findWorkspaceById: async () => null, findAddableUsers: async () => assert.fail("não deveria consultar") };
  await assert.rejects(() => workspaceService.listarCandidatos("w1", { workspaceRepository: repo }), /não encontrado/);
});

// ---------- removerMembro ----------

function repoRemocao({ espaco = { id: "w1", personal_user_id: null }, vinculo = { id: "m1", role: "editor" }, removidos = 1 } = {}) {
  const chamadas = { find: [], remove: [] };
  return {
    chamadas,
    findWorkspaceById: async () => espaco,
    findMemberInWorkspace: async (workspaceId, membroId) => {
      chamadas.find.push([workspaceId, membroId]);
      return vinculo;
    },
    removeMember: async (workspaceId, membroId) => {
      chamadas.remove.push([workspaceId, membroId]);
      return removidos;
    }
  };
}

test("removerMembro remove editor/leitor procurando o vínculo DENTRO do espaço", async () => {
  const repo = repoRemocao();
  await workspaceService.removerMembro("w1", "m1", { workspaceRepository: repo });

  assert.deepEqual(repo.chamadas.find, [["w1", "m1"]]);
  assert.deepEqual(repo.chamadas.remove, [["w1", "m1"]]);
});

test("removerMembro: vínculo de OUTRO espaço não é encontrado (404) e nada é removido", async () => {
  const repo = repoRemocao({ vinculo: null });
  await assert.rejects(() => workspaceService.removerMembro("w1", "m-de-outro-espaco", { workspaceRepository: repo }), /não encontrado/);
  assert.equal(repo.chamadas.remove.length, 0);
});

test("removerMembro nunca remove o owner", async () => {
  const repo = repoRemocao({ vinculo: { id: "m1", role: "owner" } });
  await assert.rejects(() => workspaceService.removerMembro("w1", "m1", { workspaceRepository: repo }), /proprietário/);
  assert.equal(repo.chamadas.remove.length, 0);
});

test("removerMembro: o espaço pessoal não tem membros a remover", async () => {
  const repo = repoRemocao({ espaco: { id: "w1", personal_user_id: "u-dono" } });
  await assert.rejects(() => workspaceService.removerMembro("w1", "m1", { workspaceRepository: repo }), /pessoal/);
  assert.equal(repo.chamadas.find.length, 0);
});

test("removerMembro: espaço inexistente e remoção que não afetou nada dão 404", async () => {
  await assert.rejects(() => workspaceService.removerMembro("w1", "m1", { workspaceRepository: repoRemocao({ espaco: null }) }), /Espaço não encontrado/);
  await assert.rejects(() => workspaceService.removerMembro("w1", "m1", { workspaceRepository: repoRemocao({ removidos: 0 }) }), /Membro não encontrado/);
});

// ---------- excluirEspaco ----------

function repoExclusao({ espaco = { id: "w1", name: "Família Souza", personal_user_id: null } } = {}) {
  const chamadas = { delete: [] };
  return {
    chamadas,
    findWorkspaceById: async () => espaco,
    deleteSharedWorkspace: async (workspaceId) => {
      chamadas.delete.push(workspaceId);
    }
  };
}

test("excluirEspaco exclui quando a confirmação é o nome exato (com espaços aparados)", async () => {
  const repo = repoExclusao();
  await workspaceService.excluirEspaco("w1", { confirmacao: "  Família Souza " }, { workspaceRepository: repo });
  assert.deepEqual(repo.chamadas.delete, ["w1"]);
});

test("excluirEspaco recusa confirmação ausente, errada ou de outro tipo - e não exclui", async () => {
  for (const confirmacao of [undefined, null, "", "familia souza", "Família", "Família Souza!", 42, {}]) {
    const repo = repoExclusao();
    await assert.rejects(() => workspaceService.excluirEspaco("w1", { confirmacao }, { workspaceRepository: repo }), /Confirmação inválida/);
    assert.equal(repo.chamadas.delete.length, 0);
  }
  await assert.rejects(() => workspaceService.excluirEspaco("w1", undefined, { workspaceRepository: repoExclusao() }), /Confirmação inválida/);
});

test("excluirEspaco NUNCA exclui o espaço pessoal, mesmo com o nome certo", async () => {
  const repo = repoExclusao({ espaco: { id: "w1", name: "Espaço pessoal", personal_user_id: "u-dono" } });
  await assert.rejects(() => workspaceService.excluirEspaco("w1", { confirmacao: "Espaço pessoal" }, { workspaceRepository: repo }), /pessoal/);
  assert.equal(repo.chamadas.delete.length, 0);
});

test("excluirEspaco com espaço inexistente: 404", async () => {
  await assert.rejects(() => workspaceService.excluirEspaco("w1", { confirmacao: "x" }, { workspaceRepository: repoExclusao({ espaco: null }) }), /não encontrado/);
});
