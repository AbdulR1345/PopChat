import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, before, test } from 'node:test'
import cookieParser from 'cookie-parser'
import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/user.model.js'
import Message from '../models/message.model.js'
import Conversation from '../models/conversation.model.js'
import messageRouter from '../routes/message.routes.js'
import { app, io, server } from '../socket/socket.js'

const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { io: createClient } = requireFrontend('socket.io-client')
const alice = '507f1f77bcf86cd799439011'
const bob = '507f1f77bcf86cd799439012'
const charlie = '507f1f77bcf86cd799439013'
const users = new Set([alice, bob, charlie])
const originals = {
  secret: process.env.JWT_SECRET,
  exists: User.exists,
  create: Message.create,
  find: Message.find,
  findOne: Message.findOne,
  updateMany: Message.updateMany,
  aggregate: Message.aggregate,
  conversationFind: Conversation.findOne,
  conversationCreate: Conversation.create,
}
const documents = []
const conversations = new Map()
const clients = new Set()
let baseUrl
let nextId = 1
let lastPipeline

const cookieFor = userId => `token=${jwt.sign({ userId }, process.env.JWT_SECRET)}`
const keyFor = people => [...people].map(String).sort().join(':')
const matches = (item, filter) => Object.entries(filter).every(([field, expected]) => {
  if (field === '$or') return expected.some(branch => matches(item, branch))
  const actual = item[field]
  if (expected && typeof expected === 'object' && '$in' in expected) {
    return expected.$in.map(String).includes(String(actual))
  }
  if (expected === null) return actual == null
  return String(actual) === String(expected)
})
const copy = item => ({ ...item })
const nextMessage = fields => {
  const item = { _id: String(nextId++).padStart(24, '0'), createdAt: new Date(Date.now() + nextId), ...fields }
  documents.push(item)
  return item
}
const fakeConversation = fields => {
  const conversation = {
    partcipants: fields.partcipants,
    messages: [...fields.messages],
    save: async () => conversation,
    populate: async () => ({ messages: conversation.messages.map(id => documents.find(item => String(item._id) === String(id))) }),
  }
  conversations.set(keyFor(fields.partcipants), conversation)
  return conversation
}
const clientFor = userId => {
  const client = createClient(baseUrl, {
    autoConnect: false, reconnection: false, transports: ['websocket'], timeout: 2000,
    extraHeaders: { Cookie: cookieFor(userId) },
  })
  clients.add(client)
  return client
}
const connect = client => new Promise((resolve, reject) => {
  client.once('connect', resolve)
  client.once('connect_error', reject)
  client.connect()
})
const nextEvent = (client, name, predicate = () => true) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { client.off(name, receive); reject(new Error(`Timed out waiting for ${name}`)) }, 6000)
  const receive = value => {
    if (!predicate(value)) return
    clearTimeout(timer)
    client.off(name, receive)
    resolve(value)
  }
  client.on(name, receive)
})
const postMessage = (sender, receiver, body) => fetch(`${baseUrl}/api/message/send/${receiver}`, {
  method: 'POST', headers: { Cookie: cookieFor(sender), 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

before(async () => {
  process.env.JWT_SECRET = 'messaging-features-test-secret'
  User.exists = async ({ _id }) => users.has(String(_id)) ? { _id } : null
  Message.create = async fields => nextMessage(fields)
  Message.findOne = async filter => documents.find(item => matches(item, filter)) ?? null
  Message.find = filter => {
    let rows = documents.filter(item => matches(item, filter))
    return {
      sort(spec) {
        if (spec.createdAt) rows = rows.sort((a, b) =>
          spec.createdAt * (a.createdAt - b.createdAt) ||
          (spec._id ? spec._id * String(a._id).localeCompare(String(b._id)) : 0))
        return this
      },
      limit(count) { rows = rows.slice(0, count); return this },
      async lean() { return rows.map(copy) },
    }
  }
  Message.updateMany = async (filter, update) => {
    let modifiedCount = 0
    for (const item of documents.filter(doc => matches(doc, filter))) {
      Object.assign(item, update.$set)
      modifiedCount++
    }
    return { modifiedCount }
  }
  Message.aggregate = async pipeline => {
    lastPipeline = pipeline
    const current = String(pipeline[0].$match.$or[0].sender)
    const grouped = new Map()
    for (const item of [...documents].filter(doc => doc.sender === current || doc.receiver === current)
      .sort((a, b) => b.createdAt - a.createdAt)) {
      const other = item.sender === current ? item.receiver : item.sender
      if (!grouped.has(other)) grouped.set(other, { userId: other, lastMessage: copy(item), unreadCount: 0 })
      if (item.receiver === current && item.receiptVersion === 1 && !item.readAt) {
        grouped.get(other).unreadCount++
      }
    }
    return [...grouped.values()].sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt)
  }
  Conversation.findOne = async query => conversations.get(keyFor(query.partcipants.$all)) ?? null
  Conversation.create = async fields => fakeConversation(fields)
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/message', messageRouter)
  server.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  for (const client of clients) client.disconnect()
  await new Promise(resolve => io.close(resolve))
  User.exists = originals.exists
  Message.create = originals.create
  Message.find = originals.find
  Message.findOne = originals.findOne
  Message.updateMany = originals.updateMany
  Message.aggregate = originals.aggregate
  Conversation.findOne = originals.conversationFind
  Conversation.create = originals.conversationCreate
  if (originals.secret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originals.secret
})

test('inbox orders previews and counts only unread messages with receipt tracking', async () => {
  documents.length = 0
  nextMessage({ sender: bob, receiver: alice, message: 'unread', receiptVersion: 1, createdAt: new Date('2026-01-01T10:00:00Z') })
  nextMessage({ sender: charlie, receiver: alice, image: 'https://example.test/photo.png', receiptVersion: 1, createdAt: new Date('2026-01-02T10:00:00Z') })
  nextMessage({ sender: bob, receiver: alice, message: 'legacy', createdAt: new Date('2026-01-03T10:00:00Z') })
  const response = await fetch(`${baseUrl}/api/message/inbox`, { headers: { Cookie: cookieFor(alice) } })
  assert.equal(response.status, 200)
  const inbox = await response.json()
  assert.deepEqual(inbox.map(item => item.userId), [bob, charlie])
  assert.deepEqual(inbox.map(item => item.unreadCount), [1, 1])
  assert.equal(inbox[0].lastMessage.message, 'legacy')
  assert.deepEqual(lastPipeline[1], { $sort: { createdAt: -1, _id: -1 } })
  assert.equal(lastPipeline[3].$group.unreadCount.$sum.$cond[1], 1)
})

test('retrying a send with the same client message id creates one message', async () => {
  documents.length = 0
  conversations.clear()
  const body = { message: 'once', clientMessageId: 'retry-message-001' }
  const first = await postMessage(alice, bob, body)
  const second = await postMessage(alice, bob, body)
  assert.equal(first.status, 201)
  assert.equal(second.status, 200)
  assert.equal((await first.json())._id, (await second.json())._id)
  assert.equal(documents.length, 1)
  assert.equal(conversations.get(keyFor([alice, bob])).messages.length, 1)
})

test('a unique-key race returns the existing message and repairs its conversation link', async () => {
  documents.length = 0
  conversations.clear()
  const existing = nextMessage({ sender: alice, receiver: bob, message: 'race', clientMessageId: 'race-message-001', receiptVersion: 1 })
  const normalFindOne = Message.findOne
  const normalCreate = Message.create
  let lookups = 0
  Message.findOne = async filter => ++lookups === 1 ? null : normalFindOne(filter)
  Message.create = async () => { throw Object.assign(new Error('duplicate key'), { code: 11000 }) }
  try {
    const response = await postMessage(alice, bob, { message: 'race', clientMessageId: 'race-message-001' })
    assert.equal(response.status, 200)
    assert.equal((await response.json())._id, existing._id)
    assert.equal(documents.length, 1)
    assert.deepEqual(conversations.get(keyFor([alice, bob])).messages, [existing._id])
  } finally {
    Message.findOne = normalFindOne
    Message.create = normalCreate
  }
})

test('message history reads the canonical messages even when conversation links are missing', async () => {
  documents.length = 0
  conversations.clear()
  const later = nextMessage({ sender: bob, receiver: alice, message: 'later', createdAt: new Date('2026-01-02T10:00:00Z') })
  const earlier = nextMessage({ sender: alice, receiver: bob, message: 'earlier', createdAt: new Date('2026-01-01T10:00:00Z') })
  nextMessage({ sender: charlie, receiver: alice, message: 'other conversation' })
  const response = await fetch(`${baseUrl}/api/message/get/${bob}`, { headers: { Cookie: cookieFor(alice) } })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).map(item => item._id), [earlier._id, later._id])
})

test('delivery requires recipient acknowledgement, including after offline reconnection', async () => {
  documents.length = 0
  conversations.clear()
  const sender = clientFor(alice)
  const recipient = clientFor(bob)
  await Promise.all([connect(sender), connect(recipient)])
  const incoming = nextEvent(recipient, 'newMessage')
  const response = await postMessage(alice, bob, { message: 'online' })
  assert.equal(response.status, 201)
  const onlineMessage = await incoming
  assert.equal(documents[0].deliveredAt, undefined)
  sender.emit('messageDelivered', { messageIds: [onlineMessage._id] })
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(documents[0].deliveredAt, undefined)
  const delivered = nextEvent(sender, 'messageStatus', value => value.messageId === onlineMessage._id && value.deliveredAt)
  recipient.emit('messageDelivered', { messageIds: [onlineMessage._id] })
  assert.ok((await delivered).deliveredAt)
  assert.ok(documents[0].deliveredAt)
  recipient.disconnect()

  const offlineResponse = await postMessage(alice, bob, { message: 'offline' })
  const offlineMessage = await offlineResponse.json()
  assert.equal(documents[1].deliveredAt, undefined)
  const reconnected = clientFor(bob)
  const pending = nextEvent(reconnected, 'pendingMessages')
  await connect(reconnected)
  assert.deepEqual((await pending).map(item => item._id), [offlineMessage._id])
  const deliveredAfterReconnect = nextEvent(sender, 'messageStatus', value => value.messageId === offlineMessage._id && value.deliveredAt)
  reconnected.emit('messageDelivered', { messageIds: [offlineMessage._id] })
  assert.ok((await deliveredAfterReconnect).deliveredAt)
  sender.disconnect()
  reconnected.disconnect()
})

test('offline delivery continues with the next batch after an acknowledgement', async () => {
  documents.length = 0
  for (let index = 0; index < 101; index++) {
    nextMessage({
      sender: alice, receiver: bob, message: String(index), receiptVersion: 1,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    })
  }
  const recipient = clientFor(bob)
  const firstBatch = nextEvent(recipient, 'pendingMessages')
  await connect(recipient)
  const first = await firstBatch
  assert.equal(first.length, 100)
  const secondBatch = nextEvent(recipient, 'pendingMessages', batch => batch.length === 1)
  recipient.emit('messageDelivered', { messageIds: first.map(item => item._id) })
  const second = await secondBatch
  assert.equal(second[0].message, '100')
  recipient.emit('messageDelivered', { messageIds: [second[0]._id] })
  recipient.disconnect()
})

test('read updates persist, sync to both recipient tabs, and reject cross-user ids', async () => {
  documents.length = 0
  const item = nextMessage({ sender: alice, receiver: bob, message: 'please read', receiptVersion: 1 })
  const outsiderItem = nextMessage({ sender: alice, receiver: bob, message: 'private', receiptVersion: 1 })
  const sender = clientFor(alice)
  const firstTab = clientFor(bob)
  const secondTab = clientFor(bob)
  await Promise.all([connect(sender), connect(firstTab), connect(secondTab)])
  const firstStatus = nextEvent(firstTab, 'messageStatus', value => value.messageId === item._id && value.readAt)
  const secondStatus = nextEvent(secondTab, 'messageStatus', value => value.messageId === item._id && value.readAt)
  const senderStatus = nextEvent(sender, 'messageStatus', value => value.messageId === item._id && value.readAt)
  const response = await fetch(`${baseUrl}/api/message/read/${alice}`, {
    method: 'POST', headers: { Cookie: cookieFor(bob), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageIds: [item._id] }),
  })
  assert.equal(response.status, 200)
  await Promise.all([firstStatus, secondStatus, senderStatus])
  assert.ok(item.readAt)
  assert.ok(item.deliveredAt)
  const inbox = await fetch(`${baseUrl}/api/message/inbox`, { headers: { Cookie: cookieFor(bob) } }).then(result => result.json())
  assert.equal(inbox.find(entry => entry.userId === alice).unreadCount, 1)

  const forbidden = await fetch(`${baseUrl}/api/message/read/${alice}`, {
    method: 'POST', headers: { Cookie: cookieFor(charlie), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageIds: [outsiderItem._id] }),
  })
  assert.equal(forbidden.status, 200)
  assert.deepEqual((await forbidden.json()).messages, [])
  assert.equal(outsiderItem.readAt, undefined)
  sender.disconnect()
  firstTab.disconnect()
  secondTab.disconnect()
})

test('typing uses authenticated identity and clears after every tab stops, timeout, or disconnect', async () => {
  const observer = clientFor(bob)
  const first = clientFor(alice)
  const second = clientFor(alice)
  await Promise.all([connect(observer), connect(first), connect(second)])
  const started = nextEvent(observer, 'typing:start')
  first.emit('typing:start', { recipientId: bob, userId: charlie })
  assert.equal((await started).userId, alice)
  second.emit('typing:start', { recipientId: bob })
  let stopCount = 0
  observer.on('typing:stop', () => stopCount++)
  first.emit('typing:stop', { recipientId: bob })
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(stopCount, 0)
  const stopped = nextEvent(observer, 'typing:stop')
  second.emit('typing:stop', { recipientId: bob })
  assert.equal((await stopped).userId, alice)

  const staleStarted = nextEvent(observer, 'typing:start')
  first.emit('typing:start', { recipientId: bob })
  await staleStarted
  const staleStopped = nextEvent(observer, 'typing:stop')
  await staleStopped

  const disconnectStarted = nextEvent(observer, 'typing:start')
  first.emit('typing:start', { recipientId: bob })
  await disconnectStarted
  const disconnectStopped = nextEvent(observer, 'typing:stop')
  first.disconnect()
  await disconnectStopped
  observer.disconnect()
  second.disconnect()
})
