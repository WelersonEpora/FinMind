<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { legendaDoEspaco, rotuloPapel } from '../../utils/workspace.js'
import WorkspaceCreateModal from './WorkspaceCreateModal.vue'

// Seletor do espaço ativo. Vive no grupo "Espaço" da sidebar, como cabeçalho
// dele: é o único lugar que mostra o NOME do espaço; os itens abaixo são o que
// existe dentro dele.
const emit = defineEmits(['navigate'])

const router = useRouter()
const workspaces = useWorkspaceStore()

const createOpen = ref(false)

// Escolher um espaço sempre leva à Visão geral dele - de qualquer página, inclusive
// de uma página global (dashboard, dados de mercado) ou de outra página do
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
  <div v-if="workspaces.active.value" class="finmind-workspace px-2 pb-1">
    <div class="dropdown">
      <!-- strategy "fixed": o menu lateral rola e corta (overflow) qualquer
           filho posicionado de forma absoluta; fixo, o dropdown escapa dele. -->
      <button
        type="button"
        class="finmind-workspace-btn w-100 d-flex align-items-center gap-2"
        data-bs-toggle="dropdown"
        data-bs-popper-config='{"strategy":"fixed"}'
        aria-expanded="false"
        :aria-label="`Espaço: ${workspaces.active.value.nome}. ${legendaDoEspaco(workspaces.active.value)}. Trocar ou criar espaço`"
        :title="`Espaço: ${workspaces.active.value.nome} (trocar ou criar)`"
      >
        <i class="bi bi-collection flex-shrink-0 finmind-workspace-icon"></i>
        <span class="finmind-workspace-text flex-grow-1 text-start">
          <span class="d-block text-truncate finmind-workspace-name">{{ workspaces.active.value.nome }}</span>
          <small class="d-block text-truncate finmind-workspace-papel">
            {{ legendaDoEspaco(workspaces.active.value) }}
          </small>
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
            <span class="flex-grow-1 text-truncate">{{ espaco.nome }}</span>
            <small class="finmind-workspace-role">{{ rotuloPapel(espaco.papel) }}</small>
          </button>
        </li>
        <li><hr class="dropdown-divider" /></li>
        <li>
          <button type="button" class="dropdown-item fw-semibold" @click="createOpen = true">
            <i class="bi bi-plus-lg me-1"></i> Criar espaço
          </button>
        </li>
      </ul>
    </div>

    <WorkspaceCreateModal :open="createOpen" @close="createOpen = false" @created="onCreated" />
  </div>
</template>

<style scoped>
/* Destaque do contexto ativo: fundo mais claro + acento na borda esquerda
   (mesmo azul do logo), para se distinguir dos itens de navegação abaixo. */
.finmind-workspace-btn {
  padding: 0.5rem 0.6rem;
  border: none;
  border-left: 3px solid #3b82f6;
  border-radius: 0.375rem;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
}
.finmind-workspace-btn:hover,
.finmind-workspace-btn:focus-visible,
.finmind-workspace-btn.show {
  background: rgba(255, 255, 255, 0.16);
}

.finmind-workspace-icon {
  font-size: 1.1rem;
  width: 18px;
  text-align: center;
}

.finmind-workspace-text {
  min-width: 0;
  line-height: 1.2;
}
.finmind-workspace-name {
  font-weight: 600;
}
/* Legenda (tipo · papel): tamanho de legenda de propósito - em 14px,
   "Compartilhado · Proprietário" (~175px) não cabe nos ~155px do bloco e o
   papel seria cortado; em 0.72rem cabe com folga. */
.finmind-workspace-papel {
  color: #adb5bd;
  font-size: 0.72rem;
}
.finmind-workspace-caret {
  font-size: 0.8rem;
  opacity: 0.8;
}

/* Largura limitada: sem isso, um nome de espaço comprido alarga o menu (que é
   fixo e sai da sidebar) para além da janela. Os nomes truncam dentro dele. */
.dropdown-menu {
  min-width: 15rem;
  max-width: min(22rem, calc(100vw - 1rem));
}
.finmind-workspace-role {
  opacity: 0.85;
}

/* Menu recolhido: só o ícone (o nome fica na dica) - mesmo critério dos
   rótulos da sidebar (ver AppSidebar.vue). ATENÇÃO: o seletor INTEIRO precisa
   ficar dentro de :global(...) - com `:global(.a) .b` o compilador do Vue
   descarta o `.b` e gera uma regra só com `.a` (que esconderia a sidebar). */
:global(.finmind-sidebar-collapsed .finmind-workspace-text),
:global(.finmind-sidebar-collapsed .finmind-workspace-caret) {
  display: none;
}
:global(.finmind-sidebar-collapsed .finmind-workspace-btn) {
  justify-content: center;
  padding-left: 0.4rem;
  padding-right: 0.4rem;
}

/* No mobile o drawer sempre mostra o rótulo, mesmo com `collapsed` true. Além
   disso o drawer tem `transform`, o que o torna o bloco de contenção (e o
   corte, por overflow) dos filhos fixos: o menu precisa caber na largura dele
   (82% da janela, no máximo 300px). */
@media (max-width: 767.98px) {
  .dropdown-menu {
    max-width: min(284px, calc(82vw - 1rem));
  }

  :global(.finmind-sidebar-collapsed .finmind-workspace-text) {
    display: block;
  }
  :global(.finmind-sidebar-collapsed .finmind-workspace-caret) {
    display: inline;
  }
  :global(.finmind-sidebar-collapsed .finmind-workspace-btn) {
    justify-content: flex-start;
    padding-left: 0.6rem;
    padding-right: 0.6rem;
  }
}
</style>
