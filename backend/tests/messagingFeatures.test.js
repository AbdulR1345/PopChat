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
  findOneAndUpdate: Message.findOneAndUpdate,
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
  if (field === '$and') return expected.every(branch => matches(item, branch))
  const actual = item[field]
  if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
    if ('$in' in expected) return expected.$in.some(value => value == null ? actual == null : String(value) === String(actual))
    if ('$gt' in expected) return actual > expected.$gt
    if ('$lt' in expected) return actual < expected.$lt
  }
  if (expected === null) return actual == null
  return String(actual) === String(expected)
})
const copy = item => ({ ...item })
const nextMessage = fields => {
  const item = { _id: String(nextId++).padStart(24, '0'), createdAt: new Date(Date.now() + nextId), __v: 0, image: '', reactions: [], ...fields }
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
  Message.findOne = async filter => {
    const item = documents.find(row => matches(row, filter))
    return item ? copy(item) : null
  }
  Message.findOneAndUpdate = async (filter, update) => {
    const item = documents.find(row => matches(row, filter))
    if (!item) return null
    Object.assign(item, update.$set ?? {})
    for (const [field, amount] of Object.entries(update.$inc ?? {})) item[field] = (item[field] ?? 0) + amount
    return copy(item)
  }
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
      if (!grouped.has(other)) grouped.set(other, { userId: other, lastMessage: {
        ...copy(item), message: item.deletedAt ? '' : item.message, image: item.deletedAt ? '' : item.image,
      }, unreadCount: 0 })
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
  Message.findOneAndUpdate = originals.findOneAndUpdate
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

const mutate = (userId, method, path, body) => fetch(`${baseUrl}/api/message${path}`, {
  method,
  headers: { Cookie: cookieFor(userId), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

test('replies validate their target and return bounded, redacted previews', async () => {
  documents.length = 0
  conversations.clear()
  const original = nextMessage({ sender: bob, receiver: alice, message: 'private original' })
  const image = nextMessage({ sender: bob, receiver: alice, image: 'https://example.test/reply.png' })
  const elsewhere = nextMessage({ sender: charlie, receiver: alice, message: 'elsewhere' })
  assert.equal((await postMessage(alice, bob, { message: 'reply', replyTo: 'bad' })).status, 400)
  assert.equal((await postMessage(alice, bob, { message: 'reply', replyTo: elsewhere._id })).status, 400)
  assert.equal((await postMessage(alice, bob, { message: 'reply', replyTo: 'f'.repeat(24) })).status, 400)
  const aliceTab = clientFor(alice)
  const bobTab = clientFor(bob)
  await Promise.all([connect(aliceTab), connect(bobTab)])
  const outgoing = nextEvent(aliceTab, 'messageCreated', value => value.replyTo === image._id)
  const incoming = nextEvent(bobTab, 'newMessage', value => value.replyTo === image._id)
  const sent = await postMessage(alice, bob, { message: 'reply', replyTo: image._id })
  assert.equal(sent.status, 201)
  assert.equal((await sent.json()).replyPreview.text, 'Photo')
  assert.equal((await outgoing).replyPreview.text, 'Photo')
  assert.equal((await incoming).replyPreview.text, 'Photo')
  const deleted = await mutate(bob, 'DELETE', `/${original._id}`)
  assert.equal(deleted.status, 200)
  const toDeleted = await postMessage(alice, bob, { message: 'still here', replyTo: original._id })
  assert.equal(toDeleted.status, 201)
  assert.equal((await toDeleted.json()).replyPreview.text, 'This message was deleted')
  const history = await mutate(alice, 'GET', `/get/${bob}`).then(result => result.json())
  assert.equal(history.find(item => item._id === original._id).message, '')
  assert.equal(history.find(item => item.replyTo === original._id).replyPreview.text, 'This message was deleted')
  assert.ok(!JSON.stringify(history).includes('private original'))
  aliceTab.disconnect(); bobTab.disconnect()
})

test('reactions are authorized, idempotent, atomic, and reach both users tabs', async () => {
  documents.length = 0
  const item = nextMessage({ sender: alice, receiver: bob, message: 'react' })
  const sender = clientFor(alice)
  const firstTab = clientFor(bob)
  const secondTab = clientFor(bob)
  await Promise.all([connect(sender), connect(firstTab), connect(secondTab)])
  const updates = [sender, firstTab, secondTab].map(client => nextEvent(client, 'messageUpdated', value => value._id === item._id && value.reactions?.length === 1))
  assert.equal((await mutate(bob, 'PUT', `/${item._id}/reaction`, { emoji: '👍' })).status, 200)
  await Promise.all(updates)
  assert.equal((await mutate(bob, 'PUT', `/${item._id}/reaction`, { emoji: '👍' })).status, 200)
  assert.equal(documents[0].__v, 1)
  assert.equal((await mutate(bob, 'PUT', `/${item._id}/reaction`, { emoji: 'invalid' })).status, 400)
  assert.equal((await mutate(charlie, 'PUT', `/${item._id}/reaction`, { emoji: '😂' })).status, 404)
  await Promise.all([
    mutate(bob, 'PUT', `/${item._id}/reaction`, { emoji: '❤️' }),
    mutate(bob, 'PUT', `/${item._id}/reaction`, { emoji: '🔥' }),
    mutate(alice, 'PUT', `/${item._id}/reaction`, { emoji: '😂' }),
  ])
  assert.equal(documents[0].reactions.filter(reaction => reaction.user === bob).length, 1)
  assert.equal(documents[0].reactions.filter(reaction => reaction.user === alice).length, 1)
  assert.equal((await mutate(bob, 'PUT', `/${item._id}/reaction`, { emoji: null })).status, 200)
  assert.equal(documents[0].reactions.some(reaction => reaction.user === bob), false)
  sender.disconnect(); firstTab.disconnect(); secondTab.disconnect()
})

test('edits preserve identity and receipts, reject stale text edits, and ignore reaction-only revisions', async () => {
  documents.length = 0
  const item = nextMessage({ sender: alice, receiver: bob, message: 'first', receiptVersion: 1, readAt: new Date() })
  const image = nextMessage({ sender: alice, receiver: bob, message: 'caption', image: 'https://example.test/image.png' })
  const senderTab = clientFor(alice)
  const receiverTab = clientFor(bob)
  await Promise.all([connect(senderTab), connect(receiverTab)])
  assert.equal((await mutate(bob, 'PATCH', `/${item._id}`, { message: 'other', expectedEditedAt: null })).status, 403)
  assert.equal((await mutate(alice, 'PATCH', `/${item._id}`, { message: ' ', expectedEditedAt: null })).status, 400)
  assert.equal((await mutate(alice, 'PATCH', `/${image._id}`, { message: 'other', expectedEditedAt: null })).status, 400)
  await mutate(bob, 'PUT', `/${item._id}/reaction`, { emoji: '👍' })
  const edits = [senderTab, receiverTab].map(client => nextEvent(client, 'messageUpdated', value => value._id === item._id && value.message === 'second'))
  const first = await mutate(alice, 'PATCH', `/${item._id}`, { message: 'second', expectedEditedAt: null })
  assert.equal(first.status, 200)
  await Promise.all(edits)
  const changed = await first.json()
  assert.equal(changed._id, item._id)
  assert.ok(changed.readAt)
  assert.ok(changed.editedAt)
  assert.equal((await mutate(alice, 'PATCH', `/${item._id}`, { message: 'stale', expectedEditedAt: null })).status, 409)
  const results = await Promise.all([
    mutate(alice, 'PATCH', `/${item._id}`, { message: 'third', expectedEditedAt: changed.editedAt }),
    mutate(alice, 'PATCH', `/${item._id}`, { message: 'fourth', expectedEditedAt: changed.editedAt }),
  ])
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409])
  assert.equal(documents[0].createdAt, item.createdAt)
  senderTab.disconnect(); receiverTab.disconnect()
})

test('deletion is idempotent and removes content from history, inbox, replies, sockets, and media', async () => {
  documents.length = 0
  const original = nextMessage({ sender: alice, receiver: bob, message: 'secret caption', image: 'https://example.test/private.png', receiptVersion: 1 })
  const reply = nextMessage({ sender: bob, receiver: alice, message: 'reply', replyTo: original._id })
  const observer = clientFor(bob)
  await connect(observer)
  assert.equal((await mutate(bob, 'DELETE', `/${original._id}`)).status, 403)
  const update = nextEvent(observer, 'messageUpdated', value => value._id === original._id)
  const first = await mutate(alice, 'DELETE', `/${original._id}`)
  assert.equal(first.status, 200)
  const event = await update
  assert.equal(event.message, '')
  assert.equal(event.image, '')
  assert.ok(event.deletedAt)
  assert.equal((await mutate(alice, 'DELETE', `/${original._id}`)).status, 200)
  assert.equal(documents[0].__v, 1)
  assert.equal((await mutate(alice, 'PATCH', `/${original._id}`, { message: 'revive', expectedEditedAt: null })).status, 409)
  assert.equal((await mutate(bob, 'PUT', `/${original._id}/reaction`, { emoji: '👍' })).status, 409)
  const history = await mutate(bob, 'GET', `/get/${alice}`).then(result => result.json())
  assert.equal(history.find(item => item._id === original._id).image, '')
  assert.equal(history.find(item => item._id === reply._id).replyPreview.text, 'This message was deleted')
  const media = await mutate(bob, 'GET', `/media/${alice}`).then(result => result.json())
  assert.deepEqual(media.items, [])
  const latest = nextMessage({ sender: alice, receiver: bob, message: 'last secret' })
  await mutate(alice, 'DELETE', `/${latest._id}`)
  const inbox = await mutate(bob, 'GET', '/inbox').then(result => result.json())
  assert.equal(inbox.find(entry => entry.userId === alice).lastMessage.message, '')
  observer.disconnect()
  const reconnected = clientFor(bob)
  const pending = nextEvent(reconnected, 'pendingMessages')
  await connect(reconnected)
  const replay = await pending
  assert.equal(replay.find(item => item._id === original._id).image, '')
  assert.ok(!JSON.stringify(replay).includes('secret caption'))
  reconnected.disconnect()
})

test('media uses the partial-index predicate in both directions and paginates without other users', async () => {
  documents.length = 0
  const base = new Date('2026-01-01T00:00:00Z').getTime()
  for (let index = 0; index < 5; index++) nextMessage({
    sender: index % 2 ? bob : alice, receiver: index % 2 ? alice : bob,
    image: `https://example.test/${index}.png`, createdAt: new Date(base + index * 1000),
  })
  nextMessage({ sender: charlie, receiver: alice, image: 'https://example.test/other.png', createdAt: new Date(base + 8000) })
  nextMessage({ sender: alice, receiver: bob, image: 'https://example.test/deleted.png', deletedAt: new Date(), createdAt: new Date(base + 9000) })
  const indexes = Message.schema.indexes()
  assert.ok(indexes.some(([keys, options]) => keys.sender === 1 && keys.receiver === 1 && keys.createdAt === -1 &&
    keys._id === -1 && options.partialFilterExpression?.image?.$gt === ''))
  const first = await mutate(alice, 'GET', `/media/${bob}?limit=2`).then(result => result.json())
  assert.deepEqual(first.items.map(item => item.image), ['https://example.test/4.png', 'https://example.test/3.png'])
  assert.ok(first.nextCursor)
  const second = await mutate(alice, 'GET', `/media/${bob}?limit=2&cursor=${first.nextCursor}`).then(result => result.json())
  assert.deepEqual(second.items.map(item => item.image), ['https://example.test/2.png', 'https://example.test/1.png'])
  const third = await mutate(alice, 'GET', `/media/${bob}?limit=2&cursor=${second.nextCursor}`).then(result => result.json())
  assert.deepEqual(third.items.map(item => item.image), ['https://example.test/0.png'])
  assert.equal(third.nextCursor, null)
  assert.equal((await mutate(alice, 'GET', `/media/${bob}?limit=51`)).status, 400)
  assert.equal((await mutate(alice, 'GET', `/media/${bob}?cursor=bad`)).status, 400)
  assert.equal((await mutate(alice, 'GET', '/media/not-an-id')).status, 400)
  assert.deepEqual((await mutate(bob, 'GET', `/media/${charlie}`).then(result => result.json())).items, [])
})
