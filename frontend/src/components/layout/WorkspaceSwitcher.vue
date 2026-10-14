<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '../../stores/workspace.js'
import { legendaDoEspaco, siglaDoEspaco } from '../../utils/workspace.js'
import WorkspaceCreateModal from './WorkspaceCreateModal.vue'

// Seletor do espaço ativo. É o TÍTULO do grupo "Espaço" da sidebar, no mesmo
// estilo de "Dados de Mercado" e "Sistema" (caixa alta, cinza, linha acima): é o
// único lugar que mostra o NOME do espaço; os itens abaixo são o que existe
// dentro dele. Tipo e papel ("Pessoal · Proprietário") ficam na lista e na dica,
// que é onde interessam: na hora de trocar.
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
  <div v-if="workspaces.active.value" class="finmind-workspace">
    <div class="dropdown">
      <!-- strategy "fixed": o menu lateral rola e corta (overflow) qualquer
           filho posicionado de forma absoluta; fixo, o dropdown escapa dele. -->
      <button
        type="button"
        class="finmind-workspace-btn w-100 d-flex align-items-center gap-1"
        data-bs-toggle="dropdown"
        data-bs-popper-config='{"strategy":"fixed"}'
        aria-expanded="false"
        :aria-label="`Espaço: ${workspaces.active.value.nome}. ${legendaDoEspaco(workspaces.active.value)}. Trocar ou criar espaço`"
        :title="`${workspaces.active.value.nome} · ${legendaDoEspaco(workspaces.active.value)} (trocar ou criar espaço)`"
      >
        <span class="finmind-workspace-sigla">{{ siglaDoEspaco(workspaces.active.value.nome) }}</span>
        <span class="finmind-workspace-name flex-grow-1 text-start text-truncate">{{ workspaces.active.value.nome }}</span>
        <i class="bi bi-chevron-down flex-shrink-0 finmind-workspace-caret"></i>
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
    </div>

    <WorkspaceCreateModal :open="createOpen" @close="createOpen = false" @created="onCreated" />
  </div>
</template>

<style scoped>
/* Título de grupo clicável: mesma linha divisória, cor, tamanho e caixa alta do
   `.finmind-group-label` da sidebar; o realce ao passar o mouse e a seta mostram
   que ele abre a lista. */
.finmind-workspace {
  margin-top: 0.35rem;
  padding: 0.2rem 0.5rem 0;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.finmind-workspace-btn {
  padding: 0.3rem 0.5rem;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: #6c757d;
  font-size: 0.875em;
  text-transform: uppercase;
  cursor: pointer;
}
.finmind-workspace-btn:hover,
.finmind-workspace-btn:focus-visible,
.finmind-workspace-btn.show {
  background: rgba(255, 255, 255, 0.08);
  color: #dee2e6;
}

.finmind-workspace-name {
  min-width: 0;
}
.finmind-workspace-caret {
  font-size: 0.7rem;
}

/* Só no menu recolhido, no lugar do nome. */
.finmind-workspace-sigla {
  display: none;
  min-width: 1.7rem;
  padding: 0.1rem 0.3rem;
  border-radius: 0.3rem;
  background: rgba(255, 255, 255, 0.1);
  color: #dee2e6;
  font-size: 0.68rem;
  font-weight: 700;
  text-align: center;
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

/* Menu recolhido: a sigla no lugar do nome (o nome fica na dica) - mesmo
   critério dos rótulos da sidebar (ver AppSidebar.vue). ATENÇÃO: o seletor
   INTEIRO precisa ficar dentro de :global(...) - com `:global(.a) .b` o
   compilador do Vue descarta o `.b` e gera uma regra só com `.a` (que
   esconderia a sidebar). */
:global(.finmind-sidebar-collapsed .finmind-workspace-name),
:global(.finmind-sidebar-collapsed .finmind-workspace-caret) {
  display: none;
}
:global(.finmind-sidebar-collapsed .finmind-workspace-sigla) {
  display: inline-block;
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
  :global(.finmind-sidebar-collapsed .finmind-workspace-sigla) {
    display: none;
  }
  :global(.finmind-sidebar-collapsed .finmind-workspace-btn) {
    justify-content: flex-start;
  }
}
</style>
