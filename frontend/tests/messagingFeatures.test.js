import assert from 'node:assert/strict'
import test from 'node:test'
import { messagePreview, sortContactsByActivity } from '../src/utils/conversations.js'
import messageReducer, { appendMessage, applyMessageUpdate, loadMessages, updateMessageStatus } from '../src/redux/messageSlice.js'
import userReducer, { applyInboxMessageUpdate, clearTypingUsers, setInboxForSession, setLastSentMessage, setSelectedUser, setTypingUser, setUserData } from '../src/redux/userSlice.js'

const me = { _id: 'me', userName: 'me' }
const bob = { _id: 'bob', name: 'Bob' }
const charlie = { _id: 'charlie', name: 'Charlie' }

test('conversation previews use database activity order and an image-only label', () => {
  const contacts = [bob, charlie]
  const inbox = [
    { userId: 'bob', lastMessage: { message: 'first', createdAt: '2026-01-01T10:00:00Z' } },
    { userId: 'charlie', lastMessage: { message: '', image: 'https://example.test/photo.png', createdAt: '2026-01-02T10:00:00Z' } },
  ]
  assert.deepEqual(sortContactsByActivity(contacts, inbox).map(user => user._id), ['charlie', 'bob'])
  assert.deepEqual(contacts.map(user => user._id), ['bob', 'charlie'])
  assert.equal(messagePreview(inbox[1].lastMessage), 'Photo')
  assert.equal(messagePreview(null), '')
})

test('inbox data is scoped to the authenticated session and typing clears on conversation change', () => {
  let state = userReducer(undefined, { type: 'init' })
  state = userReducer(state, setUserData(me))
  const authVersion = state.authVersion
  state = userReducer(state, setInboxForSession({ userId: me._id, authVersion, inbox: [{ userId: bob._id, unreadCount: 2 }] }))
  assert.equal(state.inbox[0].unreadCount, 2)
  state = userReducer(state, setTypingUser({ userId: bob._id, typing: true }))
  state = userReducer(state, setSelectedUser(bob))
  state = userReducer(state, setSelectedUser(charlie))
  assert.equal(state.typingUsers[bob._id], undefined)
  state = userReducer(state, clearTypingUsers())
  assert.deepEqual(state.typingUsers, {})
  state = userReducer(state, setUserData(null))
  assert.equal(state.inbox, null)
  state = userReducer(state, setInboxForSession({ userId: me._id, authVersion, inbox: [] }))
  assert.equal(state.inbox, null)
})

test('sent messages update the local preview while a socket is disconnected', () => {
  let state = userReducer(undefined, { type: 'init' })
  state = userReducer(state, setUserData(me))
  const first = { _id: 'm1', sender: 'me', receiver: 'bob', message: 'first', createdAt: '2026-01-01T10:00:00Z' }
  const latest = { _id: 'm2', sender: 'me', receiver: 'bob', message: 'latest', createdAt: '2026-01-02T10:00:00Z' }
  state = userReducer(state, setLastSentMessage(first))
  state = userReducer(state, setLastSentMessage(latest))
  state = userReducer(state, setLastSentMessage(first))
  assert.equal(state.inbox.length, 1)
  assert.equal(state.inbox[0].lastMessage._id, 'm2')
  assert.equal(state.inbox[0].unreadCount, 0)
})

test('message insertion is idempotent and receipt states never regress after a stale fetch', () => {
  let state = messageReducer(undefined, { type: 'init' })
  state = messageReducer(state, setUserData(me))
  state = messageReducer(state, setSelectedUser(bob))
  const message = { _id: 'm1', sender: 'me', receiver: 'bob', message: 'hello', receiptVersion: 1 }
  state = messageReducer(state, appendMessage({ conversationId: 'bob', message }))
  state = messageReducer(state, appendMessage({ conversationId: 'bob', message }))
  assert.equal(state.messages.length, 1)
  state = messageReducer(state, updateMessageStatus({ messageId: 'm1', sender: 'me', receiver: 'bob', deliveredAt: '2026-01-01T10:01:00Z' }))
  state = messageReducer(state, updateMessageStatus({ messageId: 'm1', sender: 'me', receiver: 'bob', readAt: '2026-01-01T10:02:00Z' }))
  state = messageReducer(state, loadMessages({ conversationId: 'bob', messages: [message] }))
  assert.equal(state.messages[0].deliveredAt, '2026-01-01T10:01:00Z')
  assert.equal(state.messages[0].readAt, '2026-01-01T10:02:00Z')
  state = messageReducer(state, updateMessageStatus({ messageId: 'm1', sender: 'charlie', receiver: 'bob', readAt: 'changed' }))
  assert.equal(state.messages[0].readAt, '2026-01-01T10:02:00Z')
  state = messageReducer(state, setSelectedUser(charlie))
  assert.deepEqual(state.messages, [])
})

test('delete updates redact loaded messages and reply quotes even after stale history arrives', () => {
  let state = messageReducer(undefined, { type: 'init' })
  state = messageReducer(state, setUserData(me))
  state = messageReducer(state, setSelectedUser(bob))
  const original = { _id: 'm1', sender: 'me', receiver: 'bob', message: 'secret', image: 'private-url', revision: 0 }
  const reply = { _id: 'm2', sender: 'bob', receiver: 'me', message: 'reply', replyTo: 'm1', replyPreview: { _id: 'm1', text: 'secret' } }
  state = messageReducer(state, appendMessage({ conversationId: 'bob', message: original }))
  state = messageReducer(state, appendMessage({ conversationId: 'bob', message: reply }))
  const tombstone = { ...original, message: '', image: '', deletedAt: '2026-01-01T12:00:00Z', revision: 1 }
  state = messageReducer(state, applyMessageUpdate({ conversationId: 'bob', message: tombstone }))
  assert.equal(state.messages[0].message, '')
  assert.equal(state.messages[1].replyPreview.text, 'This message was deleted')
  state = messageReducer(state, loadMessages({ conversationId: 'bob', messages: [original, reply] }))
  assert.equal(state.messages[0].image, '')
  assert.equal(state.messages[1].replyPreview.text, 'This message was deleted')
  state = messageReducer(state, applyMessageUpdate({ conversationId: 'bob', message: original }))
  assert.equal(state.messages[0].message, '')
  state = messageReducer(state, setSelectedUser(charlie))
  assert.deepEqual(state.updates, {})
})

test('reaction and edit updates apply by revision while retaining receipts', () => {
  let state = messageReducer(undefined, { type: 'init' })
  state = messageReducer(state, setUserData(me))
  state = messageReducer(state, setSelectedUser(bob))
  const initial = { _id: 'm1', sender: 'me', receiver: 'bob', message: 'hello', revision: 0, readAt: 'read' }
  state = messageReducer(state, appendMessage({ conversationId: 'bob', message: initial }))
  state = messageReducer(state, applyMessageUpdate({ conversationId: 'bob', message: { ...initial, message: 'edited', editedAt: 'edited', revision: 2, readAt: null } }))
  state = messageReducer(state, applyMessageUpdate({ conversationId: 'bob', message: { ...initial, reactions: [{ user: 'bob', emoji: '👍' }], revision: 1 } }))
  assert.equal(state.messages[0].message, 'edited')
  assert.equal(state.messages[0].readAt, 'read')
  state = messageReducer(state, applyMessageUpdate({ conversationId: 'bob', message: { ...state.messages[0], reactions: [{ user: 'bob', emoji: '🔥' }], revision: 3 } }))
  assert.equal(state.messages[0].reactions[0].emoji, '🔥')
})

test('stale inbox responses cannot restore a deleted preview', () => {
  let state = userReducer(undefined, { type: 'init' })
  state = userReducer(state, setUserData(me))
  const old = { _id: 'm1', sender: 'me', receiver: 'bob', message: 'secret', createdAt: '2026-01-01T10:00:00Z', revision: 0 }
  state = userReducer(state, setInboxForSession({ userId: 'me', authVersion: state.authVersion, inbox: [{ userId: 'bob', lastMessage: old, unreadCount: 0 }] }))
  state = userReducer(state, applyInboxMessageUpdate({ ...old, message: '', deletedAt: '2026-01-01T11:00:00Z', revision: 1 }))
  state = userReducer(state, setInboxForSession({ userId: 'me', authVersion: state.authVersion, inbox: [{ userId: 'bob', lastMessage: old, unreadCount: 0 }] }))
  assert.equal(state.inbox[0].lastMessage.message, '')
  assert.equal(state.inbox[0].lastMessage.deletedAt, '2026-01-01T11:00:00Z')
  state = userReducer(state, setLastSentMessage(old))
  assert.equal(state.inbox[0].lastMessage.message, '')
})
