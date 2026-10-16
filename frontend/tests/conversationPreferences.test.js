import assert from 'node:assert/strict'
import test from 'node:test'
import { conversationActions, preferenceFor, sortContactsByActivity, visibleContacts } from '../src/utils/conversations.js'
import userReducer, {
  applyPreferenceForSession, setInboxForSession, setPreferenceLoadErrorForSession,
  setPreferencesForSession, setSelectedUser, setUserData,
} from '../src/redux/userSlice.js'
import messageReducer, { appendMessage } from '../src/redux/messageSlice.js'

const me = { _id: 'me', userName: 'me' }
const bob = { _id: 'bob', name: 'Bob' }
const charlie = { _id: 'charlie', name: 'Charlie' }
const dave = { _id: 'dave', name: 'Dave' }
const initial = () => userReducer(undefined, setUserData(me))
const snapshot = (state, preferences) => userReducer(state, setPreferencesForSession({
  userId: 'me', authVersion: state.authVersion, preferences,
}))
const updated = (state, preference) => userReducer(state, applyPreferenceForSession({
  userId: 'me', authVersion: state.authVersion, preference,
}))

test('pins sort above other contacts and activity plus partner ID break ties', () => {
  const contacts = [dave, charlie, bob]
  const inbox = [
    { userId: 'bob', lastMessage: { createdAt: '2026-01-03T00:00:00Z' } },
    { userId: 'charlie', lastMessage: { createdAt: '2026-01-02T00:00:00Z' } },
    { userId: 'dave', lastMessage: { createdAt: '2026-01-02T00:00:00Z' } },
  ]
  const preferences = { charlie: { pinnedAt: '2026-01-01' }, dave: { pinnedAt: '2026-01-04' } }
  assert.deepEqual(sortContactsByActivity(contacts, inbox, preferences).map(item => item._id), ['charlie', 'dave', 'bob'])
  assert.deepEqual(sortContactsByActivity(contacts, inbox).map(item => item._id), ['bob', 'charlie', 'dave'])
  assert.deepEqual(contacts.map(item => item._id), ['dave', 'charlie', 'bob'])
})

test('archive filtering keeps undiscovered contacts in All and archived previews in Archived', () => {
  const contacts = [bob, charlie, dave]
  const preferences = { bob: { archived: true, muted: true, pinnedAt: '2026-01-01' } }
  assert.deepEqual(visibleContacts(contacts, preferences, 'all').map(item => item._id), ['charlie', 'dave'])
  assert.deepEqual(visibleContacts(contacts, preferences, 'archived').map(item => item._id), ['bob'])
  assert.equal(preferenceFor(preferences, 'bob').muted, true)
  assert.equal(Boolean(preferenceFor(preferences, 'bob').pinnedAt), true)
  assert.deepEqual(preferenceFor(preferences, 'dave'), {
    otherUserId: 'dave', pinnedAt: null, archived: false, archivedAt: null, muted: false, revision: 0,
  })
})

test('conversation menu actions expose one independent boolean update each', () => {
  assert.deepEqual(conversationActions({ pinnedAt: null, archived: false, muted: false }), [
    { label: 'Pin', change: { pinned: true } },
    { label: 'Archive', change: { archived: true } },
    { label: 'Mute', change: { muted: true } },
  ])
  assert.deepEqual(conversationActions({ pinnedAt: '2026-01-01', archived: true, muted: true }), [
    { label: 'Unpin', change: { pinned: false } },
    { label: 'Unarchive', change: { archived: false } },
    { label: 'Unmute', change: { muted: false } },
  ])
})

test('incoming inbox updates never clear archive or mute preferences', () => {
  let state = initial()
  state = snapshot(state, [{ otherUserId: 'bob', archived: true, muted: true, revision: 1 }])
  state = userReducer(state, setInboxForSession({ userId: 'me', authVersion: state.authVersion,
    inbox: [{ userId: 'bob', unreadCount: 3, lastMessage: { message: 'new', createdAt: '2026-01-03' } }] }))
  assert.equal(state.inbox[0].unreadCount, 3)
  assert.equal(state.inbox[0].lastMessage.message, 'new')
  assert.equal(state.preferences.bob.archived, true)
  assert.equal(state.preferences.bob.muted, true)
  assert.deepEqual(visibleContacts([bob], state.preferences, 'archived'), [bob])
})

test('manual unarchive returns a contact to All while selected chat and messages remain', () => {
  let user = initial()
  user = userReducer(user, setSelectedUser(bob))
  user = snapshot(user, [{ otherUserId: 'bob', archived: true, revision: 1 }])
  let messages = messageReducer(undefined, setUserData(me))
  messages = messageReducer(messages, setSelectedUser(bob))
  messages = messageReducer(messages, appendMessage({ conversationId: 'bob', message: { _id: 'm1', sender: 'bob', receiver: 'me' } }))
  user = updated(user, { otherUserId: 'bob', archived: false, revision: 2 })
  assert.equal(user.selectedUser._id, 'bob')
  assert.deepEqual(visibleContacts([bob], user.preferences, 'all'), [bob])
  assert.equal(messages.messages.length, 1)
})

test('stale responses and duplicate events cannot restore old preferences', () => {
  let state = initial()
  state = snapshot(state, [{ otherUserId: 'bob', archived: true, muted: false, revision: 2 }])
  state = updated(state, { otherUserId: 'bob', archived: true, muted: true, revision: 3 })
  state = snapshot(state, [{ otherUserId: 'bob', archived: false, muted: false, revision: 2 }])
  state = updated(state, { otherUserId: 'bob', archived: false, muted: false, revision: 2 })
  state = updated(state, { otherUserId: 'bob', archived: false, muted: false, revision: 3 })
  assert.equal(state.preferences.bob.archived, true)
  assert.equal(state.preferences.bob.muted, true)
  assert.equal(state.preferences.bob.revision, 3)
})

test('logout, account switch and stale fetches do not leak preferences', () => {
  let state = initial()
  const oldVersion = state.authVersion
  state = snapshot(state, [{ otherUserId: 'bob', muted: true, revision: 1 }])
  state = userReducer(state, setUserData(null))
  assert.equal(state.preferences, null)
  state = userReducer(state, setUserData({ _id: 'other', userName: 'other' }))
  state = userReducer(state, setPreferencesForSession({ userId: 'me', authVersion: oldVersion,
    preferences: [{ otherUserId: 'bob', muted: true, revision: 8 }] }))
  state = userReducer(state, applyPreferenceForSession({ userId: 'me', authVersion: oldVersion,
    preference: { otherUserId: 'bob', muted: true, revision: 9 } }))
  assert.equal(state.preferences, null)
})

test('load failures remain visible until an authoritative fetch succeeds', () => {
  let state = initial()
  state = userReducer(state, setPreferenceLoadErrorForSession({ userId: 'me', authVersion: state.authVersion }))
  assert.equal(state.preferenceLoadError, true)
  state = snapshot(state, [])
  assert.equal(state.preferenceLoadError, false)
  assert.deepEqual(state.preferences, {})
})
