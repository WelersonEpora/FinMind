<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { legendaDoEspaco } from '../../utils/workspace.js'
import WorkspaceCreateModal from './WorkspaceCreateModal.vue'

// Seletor do espaço ativo. É o 1º item do grupo "Espaços" da sidebar, no nível
// de "Visão geral" (o título do grupo é fixo, como os outros): é o único lugar
// que mostra o NOME do espaço; os itens abaixo dele são o que existe dentro do
// espaço. Tipo e papel ("Pessoal · Proprietário") ficam na lista e na dica, que
// é onde interessam: na hora de trocar.
const emit = defineEmits(['navigate'])

const router = useRouter()
const workspaces = useWorkspaceStore()

const createOpen = ref(false)

// Escolher um espaço sempre leva à Visão geral dele - de qualquer página, inclusive
// de uma página global (Centro de Decisão, dados de mercado) ou de outra página do
// espaço anterior. Escolher o espaço que já está ativo também leva à Visão
// geral (se já estiver nela, não muda nada).
function selectWorkspace(id) {
  workspaces.setActive(id)
  router.push({ name: 'espaco', params: { workspaceId: id } })
  emit('navigate')
}

// O store já tornou o novo espaço o ativo; levamos o usuário até ele, onde
// dá para incluir membros.
function onCreated(espaco) {
  createOpen.value = false
  router.push({ name: 'espaco', params: { workspaceId: espaco.id } })
  emit('navigate')
}
</script>

<template>
  <div v-if="workspaces.active.value" class="dropdown">
    <!-- strategy "fixed": o menu lateral rola e corta (overflow) qualquer
         filho posicionado de forma absoluta; fixo, o dropdown escapa dele.
         Mesma altura e recuo de um item do menu (`.nav-link` da sidebar); a seta
         de abrir à direita o distingue de um link que muda de página. -->
    <button
      type="button"
      class="nav-link finmind-workspace-btn w-100 text-white d-flex align-items-center gap-2"
      data-bs-toggle="dropdown"
      data-bs-popper-config='{"strategy":"fixed"}'
      aria-expanded="false"
      :aria-label="`Espaço: ${workspaces.active.value.nome}. ${legendaDoEspaco(workspaces.active.value)}. Trocar ou criar espaço`"
      :title="`${workspaces.active.value.nome} · ${legendaDoEspaco(workspaces.active.value)} (trocar ou criar espaço)`"
    >
      <i class="bi bi-collection flex-shrink-0 finmind-nav-icon"></i>
      <span class="finmind-nav-label finmind-workspace-name flex-grow-1 text-start text-truncate">
        {{ workspaces.active.value.nome }}
      </span>
      <i class="bi bi-chevron-expand flex-shrink-0 finmind-workspace-caret"></i>
    </button>

    <ul class="dropdown-menu">
      <li><h6 class="dropdown-header">Seus espaços</h6></li>
      <li v-for="espaco in workspaces.state.list" :key="espaco.id">
        <button
          type="button"
          class="dropdown-item d-flex align-items-center gap-3"
          :class="{ active: espaco.id === workspaces.active.value.id }"
          :aria-current="espaco.id === workspaces.active.value.id ? 'true' : undefined"
          @click="selectWorkspace(espaco.id)"
        >
          <span class="flex-grow-1 text-truncate">
            {{ espaco.nome }}
            <small class="d-block finmind-workspace-legenda">{{ legendaDoEspaco(espaco) }}</small>
          </span>
          <i v-if="espaco.id === workspaces.active.value.id" class="bi bi-check-lg flex-shrink-0"></i>
        </button>
      </li>
      <li><hr class="dropdown-divider" /></li>
      <li>
        <button type="button" class="dropdown-item fw-semibold" @click="createOpen = true">
          <i class="bi bi-plus-lg me-1"></i> Criar espaço
        </button>
      </li>
    </ul>

    <WorkspaceCreateModal :open="createOpen" @close="createOpen = false" @created="onCreated" />
  </div>
</template>

<style scoped>
/* Mesmas medidas do `.nav-link` e do ícone da sidebar (AppSidebar.vue): o CSS
   scoped dela não chega aqui dentro. */
.finmind-workspace-btn {
  padding: 0.38rem 0.75rem;
  border: none;
  background: transparent;
}
.finmind-nav-icon {
  font-size: 1rem;
  width: 18px;
  text-align: center;
}
.finmind-workspace-btn:hover,
.finmind-workspace-btn:focus-visible,
.finmind-workspace-btn.show {
  background: rgba(255, 255, 255, 0.08);
}

.finmind-workspace-name {
  min-width: 0;
}
.finmind-workspace-caret {
  font-size: 0.8rem;
  opacity: 0.7;
}

/* Largura limitada: sem isso, um nome de espaço comprido alarga o menu (que é
   fixo e sai da sidebar) para além da janela. Os nomes truncam dentro dele. */
.dropdown-menu {
  min-width: 15rem;
  max-width: min(22rem, calc(100vw - 1rem));
}
.finmind-workspace-legenda {
  font-size: 0.72rem;
  opacity: 0.75;
}

/* Menu recolhido: só o ícone, como os outros itens (o rótulo some pela regra da
   sidebar; o nome fica na dica). ATENÇÃO: o seletor INTEIRO precisa ficar dentro
   de :global(...) - com `:global(.a) .b` o compilador do Vue descarta o `.b` e
   gera uma regra só com `.a` (que esconderia a sidebar). */
:global(.finmind-sidebar-collapsed .finmind-workspace-name),
:global(.finmind-sidebar-collapsed .finmind-workspace-caret) {
  display: none;
}
:global(.finmind-sidebar-collapsed .finmind-workspace-btn) {
  justify-content: center;
}

/* No mobile o drawer sempre mostra o rótulo, mesmo com `collapsed` true. Além
   disso o drawer tem `transform`, o que o torna o bloco de contenção (e o
   corte, por overflow) dos filhos fixos: o menu precisa caber na largura dele
   (82% da janela, no máximo 300px). */
@media (max-width: 767.98px) {
  .dropdown-menu {
    max-width: min(284px, calc(82vw - 1rem));
  }

  :global(.finmind-sidebar-collapsed .finmind-workspace-name) {
    display: block;
  }
  :global(.finmind-sidebar-collapsed .finmind-workspace-caret) {
    display: inline;
  }
  :global(.finmind-sidebar-collapsed .finmind-workspace-btn) {
    justify-content: flex-start;
  }
}
</style>
