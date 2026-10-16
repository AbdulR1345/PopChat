export const preferenceFor = (preferences, userId) => preferences?.[String(userId)] ?? {
  otherUserId: String(userId), pinnedAt: null, archived: false, archivedAt: null, muted: false, revision: 0,
}

export const visibleContacts = (contacts, preferences, view = 'all') =>
  contacts.filter(user => Boolean(preferenceFor(preferences, user._id).archived) === (view === 'archived'))

export const conversationActions = preference => [
  { label: preference.pinnedAt ? 'Unpin' : 'Pin', change: { pinned: !preference.pinnedAt } },
  { label: preference.archived ? 'Unarchive' : 'Archive', change: { archived: !preference.archived } },
  { label: preference.muted ? 'Unmute' : 'Mute', change: { muted: !preference.muted } },
]

export const sortContactsByActivity = (contacts, inbox, preferences = {}) => {
  const activity = new Map((inbox ?? []).map(item => [String(item.userId), item.lastMessage?.createdAt]))
  return [...contacts].sort((a, b) => {
    const pin = Number(Boolean(preferenceFor(preferences, b._id).pinnedAt)) - Number(Boolean(preferenceFor(preferences, a._id).pinnedAt))
    const aTime = Date.parse(activity.get(a._id) ?? '') || 0
    const bTime = Date.parse(activity.get(b._id) ?? '') || 0
    return pin || bTime - aTime || String(a._id).localeCompare(String(b._id))
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
