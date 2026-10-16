import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, before, test } from 'node:test'
import cookieParser from 'cookie-parser'
import express from 'express'
import jwt from 'jsonwebtoken'
import ConversationPreference from '../models/conversationPreference.model.js'
import User from '../models/user.model.js'
import conversationPreferenceRouter from '../routes/conversationPreference.routes.js'
import { app, io, server } from '../socket/socket.js'
import { verifyRequestOrigin } from '../config/origin.js'

const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { io: createClient } = requireFrontend('socket.io-client')
const alice = '507f1f77bcf86cd799439011'
const bob = '507f1f77bcf86cd799439012'
const charlie = '507f1f77bcf86cd799439013'
const users = new Set([alice, bob, charlie])
const original = {
  secret: process.env.JWT_SECRET,
  exists: User.exists,
  find: ConversationPreference.find,
  findOne: ConversationPreference.findOne,
  findOneAndUpdate: ConversationPreference.findOneAndUpdate,
}
const rows = new Map()
const clients = new Set()
const key = (userId, otherUserId) => `${userId}:${otherUserId}`
const copy = row => row && { ...row }
const cookie = userId => `token=${jwt.sign({ userId }, process.env.JWT_SECRET)}`
let baseUrl

const request = (owner, partner, body, method = 'PUT') => fetch(`${baseUrl}/api/conversation/preferences${partner ? `/${partner}` : ''}`, {
  method,
  headers: { ...(owner ? { Cookie: cookie(owner) } : {}), 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

before(async () => {
  process.env.JWT_SECRET = 'conversation-preferences-test-secret'
  User.exists = async ({ _id }) => users.has(String(_id)) ? { _id } : null
  ConversationPreference.find = filter => ({ lean: async () => [...rows.values()].filter(row => row.userId === String(filter.userId)).map(copy) })
  ConversationPreference.findOne = filter => ({ lean: async () => copy(rows.get(key(String(filter.userId), String(filter.otherUserId)))) })
  ConversationPreference.findOneAndUpdate = async (filter, update, options) => {
    const id = key(String(filter.userId), String(filter.otherUserId))
    const current = rows.get(id)
    if (current && current.revision !== filter.revision) {
      if (options.upsert) throw Object.assign(new Error('duplicate key'), { code: 11000 })
      return null
    }
    if (!current && !options.upsert) return null
    const next = { userId: String(filter.userId), otherUserId: String(filter.otherUserId),
      pinnedAt: null, archived: false, archivedAt: null, muted: false, revision: 0,
      ...current, ...update.$set }
    next.revision += update.$inc.revision
    rows.set(id, next)
    return copy(next)
  }
  app.use(express.json())
  app.use(cookieParser())
  app.use(verifyRequestOrigin)
  app.use('/api/conversation/preferences', conversationPreferenceRouter)
  server.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  for (const client of clients) client.disconnect()
  await new Promise(resolve => io.close(resolve))
  User.exists = original.exists
  ConversationPreference.find = original.find
  ConversationPreference.findOne = original.findOne
  ConversationPreference.findOneAndUpdate = original.findOneAndUpdate
  if (original.secret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = original.secret
})

test('approved schema declares one unique owner-partner index', () => {
  const indexes = ConversationPreference.schema.indexes()
  assert.deepEqual(indexes, [[{ userId: 1, otherUserId: 1 }, { unique: true, background: true }]])
  assert.deepEqual(Object.keys(ConversationPreference.schema.paths).sort(),
    ['_id', '__v', 'archived', 'archivedAt', 'createdAt', 'muted', 'otherUserId', 'pinnedAt', 'revision', 'updatedAt', 'userId'].sort())
})

test('GET and PUT require authentication and GET returns only the owner records', async () => {
  rows.clear()
  assert.equal((await request(null, null, undefined, 'GET')).status, 401)
  assert.equal((await request(null, bob, { pinned: true })).status, 401)
  assert.equal((await request(alice, bob, { muted: true })).status, 200)
  assert.deepEqual((await (await request(bob, null, undefined, 'GET')).json()).preferences, [])
  const response = await request(alice, null, undefined, 'GET')
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).preferences.map(item => item.otherUserId), [bob])
})

test('validation rejects bad targets, self, unknown users, empty payloads and mass assignment', async () => {
  for (const [target, body, status] of [
    ['bad', { pinned: true }, 400], [alice, { pinned: true }, 400],
    ['507f1f77bcf86cd799439099', { pinned: true }, 404],
    [bob, {}, 400], [bob, { userId: alice }, 400],
    [bob, { pinned: 'true' }, 400], [bob, { muted: 1 }, 400],
    [bob, { archived: null }, 400], [bob, { pinned: true, extra: false }, 400],
  ]) assert.equal((await request(alice, target, body)).status, status)
  assert.equal((await fetch(`${baseUrl}/api/conversation/preferences/${bob}`, {
    method: 'PUT', headers: { Cookie: cookie(alice), Origin: 'https://wrong.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ muted: true }),
  })).status, 403)
})

test('pin, archive, mute and manual reversal persist independently and idempotently', async () => {
  rows.clear()
  const pin = await (await request(alice, bob, { pinned: true })).json()
  assert.equal(pin.revision, 1)
  assert.ok(pin.pinnedAt)
  const same = await (await request(alice, bob, { pinned: true })).json()
  assert.equal(same.revision, 1)
  assert.equal(same.pinnedAt, pin.pinnedAt)
  const archive = await (await request(alice, bob, { archived: true })).json()
  assert.equal(archive.revision, 2)
  assert.equal(archive.archived, true)
  assert.ok(archive.archivedAt)
  const muted = await (await request(alice, bob, { muted: true })).json()
  assert.equal(muted.revision, 3)
  assert.equal(muted.archived, true)
  assert.equal(muted.pinnedAt, pin.pinnedAt)
  assert.equal((await (await request(alice, bob, { muted: false, pinned: false, archived: false })).json()).revision, 4)
  const result = await (await request(alice, null, undefined, 'GET')).json()
  assert.equal(result.preferences[0].pinnedAt, null)
  assert.equal(result.preferences[0].archived, false)
  assert.equal(result.preferences[0].archivedAt, null)
  assert.equal(result.preferences[0].muted, false)
  assert.equal((await (await request(alice, bob, { archived: false })).json()).revision, 4)
})

test('concurrent initial writes create one row and preserve different fields', async () => {
  rows.clear()
  const [pin, mute] = await Promise.all([
    request(alice, charlie, { pinned: true }), request(alice, charlie, { muted: true }),
  ])
  assert.equal(pin.status, 200)
  assert.equal(mute.status, 200)
  assert.equal(rows.size, 1)
  const result = rows.get(key(alice, charlie))
  assert.ok(result.pinnedAt)
  assert.equal(result.muted, true)
  assert.equal(result.revision, 2)
})

test('a duplicate-key first insert retries without overwriting the competing field', async () => {
  rows.clear()
  const normal = ConversationPreference.findOneAndUpdate
  let injected = false
  ConversationPreference.findOneAndUpdate = async (filter, update, options) => {
    if (!injected && options.upsert) {
      injected = true
      rows.set(key(alice, charlie), { userId: alice, otherUserId: charlie, pinnedAt: null,
        archived: false, archivedAt: null, muted: true, revision: 1 })
      throw Object.assign(new Error('duplicate key'), { code: 11000 })
    }
    return normal(filter, update, options)
  }
  try {
    const response = await request(alice, charlie, { pinned: true })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.revision, 2)
    assert.ok(result.pinnedAt)
    assert.equal(result.muted, true)
    assert.equal(rows.size, 1)
  } finally {
    ConversationPreference.findOneAndUpdate = normal
  }
})

test('concurrent updates to an existing row preserve independent fields', async () => {
  rows.clear()
  rows.set(key(alice, bob), { userId: alice, otherUserId: bob, pinnedAt: null,
    archived: false, archivedAt: null, muted: false, revision: 1 })
  const [pin, archive] = await Promise.all([
    request(alice, bob, { pinned: true }), request(alice, bob, { archived: true }),
  ])
  assert.equal(pin.status, 200)
  assert.equal(archive.status, 200)
  const result = rows.get(key(alice, bob))
  assert.ok(result.pinnedAt)
  assert.equal(result.archived, true)
  assert.equal(result.revision, 3)
})

test('preferences stay private and the socket event reaches only the owner tabs', async () => {
  rows.clear()
  const connect = userId => new Promise((resolve, reject) => {
    const client = createClient(baseUrl, { autoConnect: false, reconnection: false,
      transports: ['websocket'], extraHeaders: { Cookie: cookie(userId) } })
    clients.add(client)
    client.once('connect', () => resolve(client))
    client.once('connect_error', reject)
    client.connect()
  })
  const [first, second, partner] = await Promise.all([connect(alice), connect(alice), connect(bob)])
  const events = [[], [], []]
  first.on('conversationPreferenceUpdated', value => events[0].push(value))
  second.on('conversationPreferenceUpdated', value => events[1].push(value))
  partner.on('conversationPreferenceUpdated', value => events[2].push(value))
  assert.equal((await request(alice, bob, { archived: true })).status, 200)
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.deepEqual(events[0], [{ otherUserId: bob, revision: 1 }])
  assert.deepEqual(events[1], events[0])
  assert.deepEqual(events[2], [])
  assert.equal((await request(alice, bob, { archived: true })).status, 200)
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(events[0].length, 1)
  assert.deepEqual((await (await request(bob, null, undefined, 'GET')).json()).preferences, [])
})
