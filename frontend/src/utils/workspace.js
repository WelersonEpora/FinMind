// Escolhe qual espaço fica ativo. Ordem: o da URL (quando a rota é
// /e/:workspaceId/...), depois o último usado neste navegador, depois o
// espaço pessoal, depois o primeiro da lista. Só considera ids que estão na
// lista do usuário - um id salvo/da URL que não é dele é simplesmente
// ignorado. Função pura (sem DOM/localStorage), testável com node --test.
export function escolherEspacoAtivo(espacos, { rotaId, salvoId } = {}) {
  if (!espacos.length) return null

  const porId = (id) => (id ? espacos.find((espaco) => espaco.id === id) : undefined)
  const escolhido = porId(rotaId) || porId(salvoId) || espacos.find((espaco) => espaco.pessoal) || espacos[0]

  return escolhido.id
}

// Papel do usuário DENTRO do espaço (workspace_member.role) - não confundir
// com o papel de plataforma (admin/user em user.role).
const ROTULOS_PAPEL = { owner: 'Proprietário', editor: 'Editor', viewer: 'Leitor' }

export function rotuloPapel(papel) {
  return ROTULOS_PAPEL[papel] || papel
}

// Legenda do espaço ativo no seletor: tipo + papel do usuário nele, ex.:
// "Pessoal · Proprietário" ou "Compartilhado · Editor".
export function legendaDoEspaco(espaco) {
  return `${espaco.pessoal ? 'Pessoal' : 'Compartilhado'} · ${rotuloPapel(espaco.papel)}`
}
