"use strict";

const workspaceRepository = require("../repositories/workspace.repository");
const userRepository = require("../repositories/user.repository");
const { ValidationError, ConflictError, NotFoundError } = require("../shared/errors");

const TAMANHO_MAXIMO_NOME = 120;

// `owner` não é atribuível por aqui: tornar alguém owner seria uma
// transferência de propriedade, que não existe ainda (ver ADR 0007).
const PAPEIS_ATRIBUIVEIS = ["editor", "viewer"];
const ORDEM_PAPEIS = { owner: 0, editor: 1, viewer: 2 };

function paraEspacoResposta(vinculo, userId) {
  return {
    id: vinculo.espaco.id,
    nome: vinculo.espaco.name,
    // "Meu" espaço pessoal - não basta personal_user_id estar preenchido.
    pessoal: vinculo.espaco.personal_user_id === userId,
    papel: vinculo.role
  };
}

// Espaços dos quais o usuário é membro, com o papel dele em cada um. O
// pessoal vem primeiro, os demais por nome - ordem estável para a interface.
async function listarEspacosDoUsuario(userId, deps = {}) {
  const repo = deps.workspaceRepository || workspaceRepository;
  const vinculos = await repo.findMembershipsByUser(userId);

  const espacos = vinculos.map((vinculo) => paraEspacoResposta(vinculo, userId));
  espacos.sort((a, b) => Number(b.pessoal) - Number(a.pessoal) || a.nome.localeCompare(b.nome, "pt-BR"));

  return { espacos };
}

// Qualquer usuário autenticado pode criar um espaço e vira owner dele. Não
// tem finalidade financeira: só o espaço + o vínculo, numa transação.
async function criarEspaco(userId, { nome } = {}, deps = {}) {
  const repo = deps.workspaceRepository || workspaceRepository;

  if (typeof nome !== "string" || !nome.trim()) {
    throw new ValidationError('"nome" é obrigatório.');
  }
  const nomeFinal = nome.trim();
  if (nomeFinal.length > TAMANHO_MAXIMO_NOME) {
    throw new ValidationError(`"nome" deve ter no máximo ${TAMANHO_MAXIMO_NOME} caracteres.`);
  }

  const espaco = await repo.createSharedWithOwner({ name: nomeFinal, ownerUserId: userId });

  return { espaco: { id: espaco.id, nome: espaco.name, pessoal: false, papel: "owner" } };
}

// Membros de um espaço. Todo membro vê nome e papel; o e-mail só o owner vê
// (é o que ele usou para adicionar). Nunca expõe id de usuário nem nada além
// disso, e só devolve membros DESTE espaço.
async function listarMembros(workspaceId, { userId, papel }, deps = {}) {
  const repo = deps.workspaceRepository || workspaceRepository;
  const vinculos = await repo.findMembers(workspaceId);
  const souOwner = papel === "owner";

  const membros = vinculos.map((vinculo) => {
    const membro = {
      id: vinculo.id,
      nome: vinculo.usuario.name,
      papel: vinculo.role,
      voce: vinculo.user_id === userId
    };
    if (souOwner) membro.email = vinculo.usuario.email;
    return membro;
  });

  membros.sort(
    (a, b) => ORDEM_PAPEIS[a.papel] - ORDEM_PAPEIS[b.papel] || a.nome.localeCompare(b.nome, "pt-BR")
  );

  return { membros };
}

// Lista de escolha de "adicionar membro": usuários ativos que ainda não estão
// no espaço, só com nome e e-mail. A autorização (owner do espaço) é do
// middleware da rota. Mesmas recusas de adicionar: o espaço pessoal não
// aceita membros, então nem lista candidatos.
async function listarCandidatos(workspaceId, deps = {}) {
  const repo = deps.workspaceRepository || workspaceRepository;

  const espaco = await repo.findWorkspaceById(workspaceId);
  if (!espaco) {
    throw new NotFoundError("Espaço não encontrado.");
  }
  if (espaco.personal_user_id) {
    throw new ConflictError("O espaço pessoal não aceita outros membros. Crie um espaço para compartilhar.");
  }

  const usuarios = await repo.findAddableUsers(workspaceId);
  return { candidatos: usuarios.map((usuario) => ({ nome: usuario.name, email: usuario.email })) };
}

// Adiciona um usuário JÁ EXISTENTE ao espaço, pelo e-mail exato (o que a lista
// de listarCandidatos devolve, ou digitado direto na API). A autorização (só
// owner do espaço) é do middleware da rota. Mesmo com a lista, a rota segue
// com limite de tentativas por usuário e uma resposta única para "não existe"
// e "inativo" - proteção para quem chama a API sem passar pela lista.
async function adicionarMembro(workspaceId, { email, papel } = {}, deps = {}) {
  const repo = deps.workspaceRepository || workspaceRepository;
  const users = deps.userRepository || userRepository;

  if (typeof email !== "string" || !email.trim()) {
    throw new ValidationError('"email" é obrigatório.');
  }
  if (!PAPEIS_ATRIBUIVEIS.includes(papel)) {
    throw new ValidationError(`"papel" deve ser um entre: ${PAPEIS_ATRIBUIVEIS.join(", ")}.`);
  }

  const espaco = await repo.findWorkspaceById(workspaceId);
  if (!espaco) {
    throw new NotFoundError("Espaço não encontrado.");
  }
  if (espaco.personal_user_id) {
    throw new ConflictError("O espaço pessoal não aceita outros membros. Crie um espaço para compartilhar.");
  }

  const usuario = await users.findByEmail(email.trim().toLowerCase());
  if (!usuario?.active) {
    throw new NotFoundError("Não foi possível adicionar este usuário. Confira o e-mail informado.");
  }

  if (await repo.findMembership(workspaceId, usuario.id)) {
    throw new ConflictError("Este usuário já é membro do espaço.");
  }

  let vinculo;
  try {
    vinculo = await repo.addMember({ workspaceId, userId: usuario.id, role: papel });
  } catch (err) {
    // Duas adições simultâneas do mesmo usuário: o índice único do banco decide.
    if (err.name === "SequelizeUniqueConstraintError") {
      throw new ConflictError("Este usuário já é membro do espaço.");
    }
    throw err;
  }

  return { membro: { id: vinculo.id, nome: usuario.name, email: usuario.email, papel: vinculo.role, voce: false } };
}

// Remove um membro do espaço (só o owner chama - middleware da rota). Nunca o
// próprio owner: um espaço não pode ficar sem proprietário, e ainda não há
// transferência de propriedade. O espaço pessoal não tem membros a remover.
async function removerMembro(workspaceId, membroId, deps = {}) {
  const repo = deps.workspaceRepository || workspaceRepository;

  const espaco = await repo.findWorkspaceById(workspaceId);
  if (!espaco) {
    throw new NotFoundError("Espaço não encontrado.");
  }
  if (espaco.personal_user_id) {
    throw new ConflictError("O espaço pessoal não tem outros membros para remover.");
  }

  // Procura pelo id do vínculo DENTRO deste espaço - id de outro espaço = 404.
  const vinculo = await repo.findMemberInWorkspace(workspaceId, membroId);
  if (!vinculo) {
    throw new NotFoundError("Membro não encontrado neste espaço.");
  }
  if (vinculo.role === "owner") {
    throw new ConflictError("O proprietário do espaço não pode ser removido.");
  }

  const removidos = await repo.removeMember(workspaceId, membroId);
  if (removidos === 0) {
    throw new NotFoundError("Membro não encontrado neste espaço.");
  }
}

// Exclui um espaço compartilhado (só o owner - middleware da rota). Nunca o
// pessoal. Exige que o pedido traga o nome exato do espaço: quem chama a API
// (ou a interface) precisa confirmar QUAL espaço está apagando.
async function excluirEspaco(workspaceId, { confirmacao } = {}, deps = {}) {
  const repo = deps.workspaceRepository || workspaceRepository;

  const espaco = await repo.findWorkspaceById(workspaceId);
  if (!espaco) {
    throw new NotFoundError("Espaço não encontrado.");
  }
  if (espaco.personal_user_id) {
    throw new ConflictError("O espaço pessoal não pode ser excluído.");
  }
  if (typeof confirmacao !== "string" || confirmacao.trim() !== espaco.name) {
    throw new ValidationError("Confirmação inválida: informe o nome exato do espaço para excluí-lo.");
  }

  await repo.deleteSharedWorkspace(workspaceId);
}

module.exports = {
  listarEspacosDoUsuario,
  criarEspaco,
  listarMembros,
  listarCandidatos,
  adicionarMembro,
  removerMembro,
  excluirEspaco
};
