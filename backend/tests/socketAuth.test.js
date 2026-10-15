import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { after, before, test } from "node:test"
import cookieParser from "cookie-parser"
import express from "express"
import jwt from "jsonwebtoken"
import User from "../models/user.model.js"
import Conversation from "../models/conversation.model.js"
import Message from "../models/message.model.js"
import authRouter from "../routes/auth.routes.js"
import messageRouter from "../routes/message.routes.js"
import { app, getReceiverSocketIds, io, server } from "../socket/socket.js"

const requireFrontend = createRequire(new URL("../../frontend/package.json", import.meta.url))
const { io: createClient } = requireFrontend("socket.io-client")

const alice = "507f1f77bcf86cd799439011"
const bob = "507f1f77bcf86cd799439012"
const originalSecret = process.env.JWT_SECRET
const originalExists = User.exists
const originalFindOne = Conversation.findOne
const originalConversationCreate = Conversation.create
const originalMessageCreate = Message.create
const originalMessageFind = Message.find
const clients = new Set()
let baseUrl

const cookieFor = (userId, options) =>
  `token=${jwt.sign({ userId }, process.env.JWT_SECRET, options)}`

const clientFor = (cookie, query) => {
  const client = createClient(baseUrl, {
    autoConnect: false,
    reconnection: false,
    transports: ["websocket"],
    timeout: 2000,
    extraHeaders: cookie ? { Cookie: cookie } : {},
    ...(query ? { query } : {}),
  })
  clients.add(client)
  return client
}

const connect = client => new Promise((resolve, reject) => {
  client.once("connect", resolve)
  client.once("connect_error", reject)
  client.connect()
})

const nextEvent = (client, name, predicate = () => true) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    client.off(name, onEvent)
    reject(new Error(`Timed out waiting for ${name}`))
  }, 2000)
  const onEvent = value => {
    if (!predicate(value)) return
    clearTimeout(timeout)
    client.off(name, onEvent)
    resolve(value)
  }
  client.on(name, onEvent)
})

before(async () => {
  process.env.JWT_SECRET = "socket-auth-test-secret"
  User.exists = async ({ _id }) => _id === alice || _id === bob ? { _id } : null
  Message.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) })
  app.use(express.json())
  app.use(cookieParser())
  app.use("/api/auth", authRouter)
  app.use("/api/message", messageRouter)
  server.listen(0, "127.0.0.1")
  await new Promise(resolve => server.once("listening", resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  for (const client of clients) client.disconnect()
  await new Promise(resolve => io.close(resolve))
  User.exists = originalExists
  Conversation.findOne = originalFindOne
  Conversation.create = originalConversationCreate
  Message.create = originalMessageCreate
  Message.find = originalMessageFind
  if (originalSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalSecret
})

test("valid cookie authenticates and query userId cannot impersonate another user", async () => {
  const client = clientFor(cookieFor(alice), { userId: bob })
  await connect(client)
  assert.equal(io.sockets.sockets.get(client.id).data.userId, alice)
  assert.deepEqual(getReceiverSocketIds(bob), [])
  assert.deepEqual(getReceiverSocketIds(alice), [client.id])
  client.disconnect()
})

test("missing, invalid, expired, and nonexistent-user tokens are rejected generically", async () => {
  for (const cookie of [
    undefined,
    "token=invalid",
    cookieFor(alice, { expiresIn: -1 }),
    cookieFor("507f1f77bcf86cd799439099"),
  ]) {
    const client = clientFor(cookie)
    await assert.rejects(connect(client), { message: "Authentication failed" })
    client.disconnect()
  }
})

test("a browser origin outside the configured frontend origin is rejected", async () => {
  const client = createClient(baseUrl, {
    autoConnect: false,
    reconnection: false,
    transports: ["websocket"],
    timeout: 2000,
    extraHeaders: { Cookie: cookieFor(alice), Origin: "http://untrusted.example" },
  })
  clients.add(client)
  await assert.rejects(connect(client))
  assert.equal(client.connected, false)
  client.disconnect()
})

test("presence remains online until the last authenticated tab disconnects", async () => {
  const first = clientFor(cookieFor(alice))
  const second = clientFor(cookieFor(alice))
  const observer = clientFor(cookieFor(bob))
  await connect(first)
  await connect(observer)
  const joined = nextEvent(observer, "getOnlineUsers", users => users.includes(alice))
  await connect(second)
  assert.deepEqual((await joined).sort(), [alice, bob].sort())
  assert.equal(getReceiverSocketIds(alice).length, 2)

  const oneLeft = nextEvent(observer, "getOnlineUsers", users => users.includes(alice))
  first.disconnect()
  assert.deepEqual((await oneLeft).sort(), [alice, bob].sort())
  assert.deepEqual(getReceiverSocketIds(alice), [second.id])

  const offline = nextEvent(observer, "getOnlineUsers", users => !users.includes(alice))
  second.disconnect()
  assert.deepEqual(await offline, [bob])
  observer.disconnect()
})

test("HTTP message sender is authenticated and newMessage reaches every recipient tab", async () => {
  const sender = clientFor(cookieFor(alice))
  const recipientOne = clientFor(cookieFor(bob))
  const recipientTwo = clientFor(cookieFor(bob))
  await Promise.all([connect(sender), connect(recipientOne), connect(recipientTwo)])
  Conversation.findOne = async () => null
  Conversation.create = async fields => fields
  Message.create = async fields => ({ _id: "message-1", ...fields })

  const firstMessage = nextEvent(recipientOne, "newMessage")
  const secondMessage = nextEvent(recipientTwo, "newMessage")
  const response = await fetch(`${baseUrl}/api/message/send/${bob}`, {
    method: "POST",
    headers: { Cookie: cookieFor(alice), "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hello", sender: bob }),
  })
  assert.equal(response.status, 201)
  assert.equal((await response.json()).sender, alice)
  for (const message of await Promise.all([firstMessage, secondMessage])) {
    assert.equal(message.sender, alice)
    assert.equal(message.receiver, bob)
    assert.equal(message.message, "hello")
  }
  sender.disconnect()
  recipientOne.disconnect()
  recipientTwo.disconnect()
})

test("message retrieval is limited to the authenticated two-person message pair", async () => {
  const seen = []
  Message.find = query => {
    seen.push(query)
    return {
      sort: () => ({
        lean: async () => [{ _id: "message-1", sender: alice, receiver: bob }],
        limit: () => ({ lean: async () => [] }),
      }),
    }
  }
  const response = await fetch(`${baseUrl}/api/message/get/${bob}`, {
    headers: { Cookie: cookieFor(alice) },
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).length, 1)
  assert.deepEqual(seen[0], { $or: [{ sender: alice, receiver: bob }, { sender: bob, receiver: alice }] })

  const unauthenticated = await fetch(`${baseUrl}/api/message/get/${bob}`)
  assert.equal(unauthenticated.status, 401)
  assert.equal(seen.length, 1)

  const invalid = await fetch(`${baseUrl}/api/message/get/not-an-id`, {
    headers: { Cookie: cookieFor(alice) },
  })
  assert.equal(invalid.status, 400)
  assert.equal(seen.length, 1)
})

test("message creation rejects invalid and self recipients", async () => {
  for (const receiver of ["not-an-id", alice]) {
    const response = await fetch(`${baseUrl}/api/message/send/${receiver}`, {
      method: "POST",
      headers: { Cookie: cookieFor(alice), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { message: "invalid receiver" })
  }
})

test("logout closes sockets in every tab; a missing-cookie reconnect fails and a new login token works", async () => {
  const cookie = cookieFor(alice)
  const client = clientFor(cookie)
  const otherTab = clientFor(cookie)
  await Promise.all([connect(client), connect(otherTab)])
  const disconnected = Promise.all([
    nextEvent(client, "disconnect"),
    nextEvent(otherTab, "disconnect"),
  ])
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookie },
  })
  assert.equal(response.status, 200)
  assert.match(response.headers.get("set-cookie"), /^token=;/)
  await disconnected
  assert.deepEqual(getReceiverSocketIds(alice), [])

  const withoutCookie = clientFor()
  await assert.rejects(connect(withoutCookie), { message: "Authentication failed" })
  withoutCookie.disconnect()

  const loggedInAgain = clientFor(cookieFor(alice))
  await connect(loggedInAgain)
  assert.equal(io.sockets.sockets.get(loggedInAgain.id).data.userId, alice)
  loggedInAgain.disconnect()
})
