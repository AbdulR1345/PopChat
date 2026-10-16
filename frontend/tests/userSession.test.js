import assert from 'node:assert/strict'
import test from 'node:test'
import userReducer, {
  setCurrentUser,
  finishSessionCheck,
  setOtherUsersForSession,
  setSearchDataForSession,
  setUserData,
} from '../src/redux/userSlice.js'

const alice = { _id: 'alice', userName: 'alice' }
const bob = { _id: 'bob', userName: 'bob' }

test('user lists load for the current session and clear on logout', () => {
  let state = userReducer(undefined, { type: 'init' })
  assert.equal(state.userData, null)
  assert.equal(state.otherUsers, null)

  state = userReducer(state, setUserData(alice))
  const authVersion = state.authVersion
  state = userReducer(state, setOtherUsersForSession({ userId: alice._id, authVersion, users: [bob] }))
  state = userReducer(state, setSearchDataForSession({ userId: alice._id, authVersion, users: [bob] }))
  assert.deepEqual(state.otherUsers, [bob])
  assert.deepEqual(state.searchData, [bob])

  state = userReducer(state, setUserData(null))
  assert.equal(state.otherUsers, null)
  assert.equal(state.searchData, null)
  state = userReducer(state, setOtherUsersForSession({ userId: alice._id, authVersion, users: [bob] }))
  state = userReducer(state, setSearchDataForSession({ userId: alice._id, authVersion, users: [bob] }))
  assert.equal(state.otherUsers, null)
  assert.equal(state.searchData, null)

  state = userReducer(state, setUserData(alice))
  state = userReducer(state, setOtherUsersForSession({ userId: alice._id, authVersion, users: [bob] }))
  assert.equal(state.otherUsers, null)
  state = userReducer(state, setOtherUsersForSession({ userId: alice._id, authVersion: state.authVersion, users: [bob] }))
  assert.deepEqual(state.otherUsers, [bob])
})

test('an old account or initialization response cannot replace a newer session', () => {
  let state = userReducer(undefined, { type: 'init' })
  const initialVersion = state.authVersion
  state = userReducer(state, setUserData(alice))
  const aliceVersion = state.authVersion
  state = userReducer(state, setUserData(bob))
  state = userReducer(state, setOtherUsersForSession({ userId: alice._id, authVersion: aliceVersion, users: [bob] }))
  state = userReducer(state, setCurrentUser({ userData: alice, authVersion: initialVersion }))
  assert.deepEqual(state.userData, bob)
  assert.equal(state.otherUsers, null)

  state = userReducer(state, setUserData(null))
  state = userReducer(state, setCurrentUser({ userData: alice, authVersion: initialVersion }))
  assert.equal(state.userData, null)
})

test('session restoration loads the list and profile updates retain it', () => {
  let state = userReducer(undefined, { type: 'init' })
  state = userReducer(state, setCurrentUser({ userData: alice, authVersion: state.authVersion }))
  assert.deepEqual(state.userData, alice)
  const authVersion = state.authVersion
  state = userReducer(state, setOtherUsersForSession({ userId: alice._id, authVersion, users: [bob] }))
  state = userReducer(state, setUserData({ ...alice, name: 'Alice' }))
  assert.equal(state.authVersion, authVersion)
  assert.deepEqual(state.otherUsers, [bob])
})

test('initial session stays pending until resolved and stale completion cannot reverse logout', () => {
  let state = userReducer(undefined, { type: 'init' })
  assert.equal(state.sessionStatus, 'pending')
  const firstVersion = state.authVersion
  state = userReducer(state, setCurrentUser({ userData: alice, authVersion: firstVersion }))
  assert.equal(state.sessionStatus, 'ready')
  assert.deepEqual(state.userData, alice)

  state = userReducer(undefined, { type: 'init' })
  state = userReducer(state, finishSessionCheck(state.authVersion))
  assert.equal(state.sessionStatus, 'ready')
  assert.equal(state.userData, null)

  state = userReducer(undefined, { type: 'init' })
  state = userReducer(state, setUserData(null))
  state = userReducer(state, finishSessionCheck(firstVersion))
  state = userReducer(state, setCurrentUser({ userData: alice, authVersion: firstVersion }))
  assert.equal(state.sessionStatus, 'ready')
  assert.equal(state.userData, null)
})
