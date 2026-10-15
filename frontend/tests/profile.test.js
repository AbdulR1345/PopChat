import assert from 'node:assert/strict'
import test from 'node:test'
import userReducer, { setInboxForSession, setOtherUsersForSession, setSearchDataForSession, setSelectedUser, setUserData } from '../src/redux/userSlice.js'
import messageReducer, { appendMessage } from '../src/redux/messageSlice.js'
import { availabilityLabel, contactProfile, initialProfileEditor, MAX_BIO_LENGTH, profileEditorReducer, profileFields, validateProfile } from '../src/utils/profile.js'

test('legacy and populated profile fields initialize safely', () => {
  assert.deepEqual(profileFields({ userName: 'legacy' }), { name: '', bio: '', availability: 'available' })
  assert.deepEqual(profileFields({ name: 'Alice', bio: 'Hello', availability: 'busy' }),
    { name: 'Alice', bio: 'Hello', availability: 'busy' })
  assert.equal(availabilityLabel(undefined), 'Available')
  assert.equal(availabilityLabel('busy'), 'Busy')
  assert.equal(availabilityLabel('away'), 'Away')
})

test('bio and availability validation match the editor limits', () => {
  const fields = { name: 'Alice', bio: 'a'.repeat(MAX_BIO_LENGTH), availability: 'available' }
  assert.equal(validateProfile(fields), '')
  assert.match(validateProfile({ ...fields, bio: 'a'.repeat(MAX_BIO_LENGTH + 1) }), /160/)
  assert.match(validateProfile({ ...fields, availability: 'offline' }), /availability/)
  assert.match(validateProfile({ ...fields, name: '  ' }), /Display name/)
  assert.equal(validateProfile({ ...fields, bio: '' }), '')
  const legacyName = 'L'.repeat(150)
  assert.equal(validateProfile({ ...fields, name: legacyName }, legacyName), '')
  assert.match(validateProfile({ ...fields, name: legacyName }), /Display name/)
})

test('contact profile omits email and keeps presence separate from availability', () => {
  const user = { name: 'Bob', userName: 'bob', email: 'private@example.test', bio: 'Hello', availability: 'busy' }
  assert.deepEqual(contactProfile(user, true), {
    name: 'Bob', username: 'bob', bio: 'Hello', availability: 'Busy', presence: 'Active now',
  })
  assert.deepEqual(contactProfile({ userName: 'legacy' }, false), {
    name: 'legacy', username: 'legacy', bio: '', availability: 'Available', presence: 'Offline',
  })
})

test('failed saves retain draft fields and successful saves use the server profile', () => {
  let editor = initialProfileEditor({ name: 'Alice', bio: '', availability: 'available' })
  editor = profileEditorReducer(editor, { type: 'change', key: 'bio', value: 'Draft bio' })
  editor = profileEditorReducer(editor, { type: 'change', key: 'availability', value: 'busy' })
  editor = profileEditorReducer(editor, { type: 'error', message: 'Save failed' })
  assert.deepEqual(editor.fields, { name: 'Alice', bio: 'Draft bio', availability: 'busy' })
  assert.equal(editor.error, 'Save failed')
  editor = profileEditorReducer(editor, { type: 'saved', user: { name: 'Alice', bio: 'Saved bio', availability: 'away' } })
  assert.deepEqual(editor.fields, { name: 'Alice', bio: 'Saved bio', availability: 'away' })
  assert.equal(editor.success, 'Profile saved.')
  assert.equal(editor.error, '')
})

test('profile saves retain the session, selected conversation, inbox, and messages', () => {
  const alice = { _id: 'alice', userName: 'alice', bio: '', availability: 'available' }
  const bob = { _id: 'bob', userName: 'bob' }
  let user = userReducer(undefined, setUserData(alice))
  user = userReducer(user, setSelectedUser(bob))
  const version = user.authVersion
  user = userReducer(user, setInboxForSession({ userId: 'alice', authVersion: version, inbox: [{ userId: 'bob', unreadCount: 2 }] }))
  const message = { _id: 'm1', sender: 'alice', receiver: 'bob', message: 'hello' }
  let messages = messageReducer(undefined, setUserData(alice))
  messages = messageReducer(messages, setSelectedUser(bob))
  messages = messageReducer(messages, appendMessage({ conversationId: 'bob', message }))
  user = userReducer(user, setUserData({ ...alice, name: 'Alice', bio: 'Updated', availability: 'away' }))
  assert.equal(user.authVersion, version)
  assert.equal(user.selectedUser._id, 'bob')
  assert.equal(user.inbox[0].unreadCount, 2)
  assert.equal(user.userData.bio, 'Updated')
  assert.equal(messages.messages[0]._id, 'm1')
})

test('refreshed public profiles update selected contact and search without resetting conversation state', () => {
  const alice = { _id: 'alice', userName: 'alice' }
  const bob = { _id: 'bob', userName: 'bob', name: 'Old' }
  let state = userReducer(undefined, setUserData(alice))
  state = userReducer(state, setSelectedUser(bob))
  const authVersion = state.authVersion
  state = userReducer(state, setSearchDataForSession({ userId: 'alice', authVersion, users: [bob] }))
  const updated = { ...bob, name: 'New', bio: 'Hello', availability: 'busy' }
  state = userReducer(state, setOtherUsersForSession({ userId: 'alice', authVersion, users: [updated] }))
  assert.deepEqual(state.selectedUser, updated)
  assert.deepEqual(state.searchData, [updated])
  assert.equal(state.authVersion, authVersion)
})
