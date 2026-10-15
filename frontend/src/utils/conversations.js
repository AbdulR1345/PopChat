export const sortContactsByActivity = (contacts, inbox) => {
  const activity = new Map((inbox ?? []).map(item => [String(item.userId), item.lastMessage?.createdAt]))
  return [...contacts].sort((a, b) => {
    const aTime = Date.parse(activity.get(a._id) ?? '') || 0
    const bTime = Date.parse(activity.get(b._id) ?? '') || 0
    return bTime - aTime || (a.name || a.userName || '').localeCompare(b.name || b.userName || '')
  })
}

export const messagePreview = message => {
  if (!message) return ''
  if (message.deletedAt) return 'This message was deleted'
  return message.message?.trim() || (message.image ? 'Photo' : '')
}

export const messagePreviewTime = date => {
  if (!date) return ''
  const time = new Date(date)
  if (Number.isNaN(time.getTime())) return ''
  const today = new Date()
  return time.toDateString() === today.toDateString()
    ? time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : time.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
