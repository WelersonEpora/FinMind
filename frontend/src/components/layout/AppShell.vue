<script setup>
import { ref } from 'vue'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'

const sidebarOpen = ref(false)

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}
</script>

<template>
  <div class="d-flex flex-column flex-md-row">
    <AppSidebar
      class="d-none d-md-flex"
      @navigate="sidebarOpen = false"
    />

    <div
      v-if="sidebarOpen"
      class="finmind-sidebar-overlay d-md-none"
      @click="sidebarOpen = false"
    >
      <AppSidebar class="d-flex" @navigate="sidebarOpen = false" @click.stop />
    </div>

    <div class="flex-grow-1 min-vh-100 d-flex flex-column">
      <AppTopbar @toggle-sidebar="toggleSidebar" />
      <main class="flex-grow-1 p-3 p-md-4">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.finmind-sidebar-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
}
</style>
