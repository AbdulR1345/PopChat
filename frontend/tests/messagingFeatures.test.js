import assert from 'node:assert/strict'
import test from 'node:test'
import { messagePreview, sortContactsByActivity } from '../src/utils/conversations.js'
import messageReducer, { appendMessage, loadMessages, updateMessageStatus } from '../src/redux/messageSlice.js'
import userReducer, { clearTypingUsers, setInboxForSession, setLastSentMessage, setSelectedUser, setTypingUser, setUserData } from '../src/redux/userSlice.js'

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
