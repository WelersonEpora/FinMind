<script setup>
import { colorForId, initials } from '../utils/avatar.js'

const props = defineProps({
  userId: { type: String, default: null },
  name: { type: String, default: '' },
  hasPhoto: { type: Boolean, default: false },
  size: { type: String, default: 'md' } // sm | md | lg
})

function photoUrl(id) {
  return `/api/v1/users/${id}/photo`
}
</script>

<template>
  <img
    v-if="hasPhoto && userId"
    :src="photoUrl(userId)"
    :alt="name"
    class="finmind-avatar"
    :class="`sz-${size}`"
  />
  <span v-else class="finmind-avatar" :class="`sz-${size}`" :style="{ background: colorForId(props.userId) }">
    {{ initials(name) }}
  </span>
</template>
