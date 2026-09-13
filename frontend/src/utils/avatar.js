// Cor determinística por id + iniciais do nome - mesmo componente visual já
// usado no Personal-Assistant (utils/registroStatus.js: corParaId/iniciais).
const AVATAR_COLORS = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#059669', '#dc2626']

export function colorForId(id) {
  if (!id) return AVATAR_COLORS[0]
  let sum = 0
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

export function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}
