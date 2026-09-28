// Rolagem ao navegar (scrollBehavior do vue-router). Página nova abre no topo. Na MESMA página, quando só muda a
// query (ex.: `?doc=adr-0027`, o documento aberto no modal da tela "Status do projeto"), a rolagem é mantida: sem
// isso, abrir o modal jogava a página do fundo para o topo e o leitor perdia onde estava.
export function rolagemAoNavegar(to, from) {
  if (from && to.path === from.path) return false
  return { top: 0 }
}
