import http from "http"
import { createHash } from "node:crypto"
import express from "express"
import cookieParser from "cookie-parser"
import jwt from "jsonwebtoken"
import { Server } from "socket.io"
import User from "../models/user.model.js"
import Message from "../models/message.model.js"
import { allowedOrigin } from "../config/origin.js"

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: allowedOrigin, credentials: true },
  allowRequest: (request, callback) => {
    callback(null, !request.headers.origin || request.headers.origin === allowedOrigin)
  },
})

const parseCookies = cookieParser()
const userSocketMap = new Map()
const tokenSocketMap = new Map()
const typingSocketMap = new Map()
const tokenDigest = token => createHash("sha256").update(token).digest("hex")
const validId = value => typeof value === "string" && /^[a-f\d]{24}$/i.test(value)
const typingKey = (sender, recipient) => `${sender}:${recipient}`
const TYPING_TIMEOUT_MS = 4000
const PENDING_BATCH_SIZE = 100

export const getReceiverSocketIds = receiver =>
  [...(userSocketMap.get(String(receiver)) ?? [])]

const emitToUser = (userId, event, payload) => {
  const socketIds = getReceiverSocketIds(userId)
  if (socketIds.length) io.to(socketIds).emit(event, payload)
}

export const publishInboxUpdated = userIds => {
  for (const userId of new Set(userIds.map(String))) {
    emitToUser(userId, "inboxUpdated", { userId })
  }
}

export const publishMessage = message => {
  emitToUser(message.sender, "messageCreated", message)
  for (const socketId of getReceiverSocketIds(message.receiver)) {
    const socket = io.sockets.sockets.get(socketId)
    if (!socket) continue
    if (message.receiptVersion === 1) socket.data.pendingDeliveryIds.add(String(message._id))
    socket.emit("newMessage", message)
  }
  publishInboxUpdated([message.sender, message.receiver])
}

export const publishStatuses = messages => {
  for (const message of messages) {
    const payload = {
      messageId: String(message._id),
      sender: String(message.sender),
      receiver: String(message.receiver),
      deliveredAt: message.deliveredAt ?? null,
      readAt: message.readAt ?? null,
    }
    for (const userId of new Set([payload.sender, payload.receiver])) {
      emitToUser(userId, "messageStatus", payload)
    }
  }
}

export const disconnectSocketsForToken = token => {
  if (typeof token !== "string") return
  for (const socketId of [...(tokenSocketMap.get(tokenDigest(token)) ?? [])]) {
    io.sockets.sockets.get(socketId)?.disconnect(true)
  }
}

const queuePendingMessages = async socket => {
  const messages = await Message.find({
    receiver: socket.data.userId, receiptVersion: 1, deliveredAt: null,
  }).sort({ createdAt: 1 }).limit(PENDING_BATCH_SIZE).lean()
  if (!socket.connected) return
  const unsent = messages.filter(message => !socket.data.pendingDeliveryIds.has(String(message._id)))
  if (!unsent.length) return
  for (const message of unsent) socket.data.pendingDeliveryIds.add(String(message._id))
  socket.emit("pendingMessages", unsent)
}

const stopTyping = (socket, recipient) => {
  const timer = socket.data.typingTargets.get(recipient)
  if (!timer) return
  clearTimeout(timer)
  socket.data.typingTargets.delete(recipient)
  const key = typingKey(socket.data.userId, recipient)
  const sockets = typingSocketMap.get(key)
  sockets?.delete(socket.id)
  if (sockets?.size === 0) {
    typingSocketMap.delete(key)
    emitToUser(recipient, "typing:stop", { userId: socket.data.userId })
  }
}

io.use(async (socket, next) => {
  try {
    await new Promise((resolve, reject) => {
      parseCookies(socket.request, {}, error => error ? reject(error) : resolve())
    })
    const token = socket.request.cookies?.token
    if (typeof token !== "string") throw new Error("Missing token")

    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (typeof payload !== "object" || typeof payload.userId !== "string") {
      throw new Error("Invalid token payload")
    }
    if (!await User.exists({ _id: payload.userId })) throw new Error("Unknown user")

    socket.data.userId = payload.userId
    socket.data.tokenDigest = tokenDigest(token)
    next()
  } catch {
    next(new Error("Authentication failed"))
  }
})

io.on("connection", socket => {
  const userId = socket.data.userId
  const digest = socket.data.tokenDigest
  socket.data.pendingDeliveryIds = new Set()
  socket.data.typingTargets = new Map()

  let sockets = userSocketMap.get(userId)
  if (!sockets) {
    sockets = new Set()
    userSocketMap.set(userId, sockets)
  }
  sockets.add(socket.id)
  let tokenSockets = tokenSocketMap.get(digest)
  if (!tokenSockets) {
    tokenSockets = new Set()
    tokenSocketMap.set(digest, tokenSockets)
  }
  tokenSockets.add(socket.id)
  io.emit("getOnlineUsers", [...userSocketMap.keys()])

  // A user who reconnects while another user is typing sees the current state.
  for (const [key, activeSockets] of typingSocketMap) {
    const [sender, recipient] = key.split(":")
    if (recipient === userId && activeSockets.size) socket.emit("typing:start", { userId: sender })
  }
  void queuePendingMessages(socket).catch(() => {})

  socket.on("messageDelivered", async (payload, acknowledge) => {
    const ids = payload?.messageIds
    if (!Array.isArray(ids) || !ids.length || ids.length > PENDING_BATCH_SIZE || !ids.every(validId)) {
      acknowledge?.({ ok: false })
      return
    }
    const eligible = [...new Set(ids)].filter(id => socket.data.pendingDeliveryIds.has(id))
    if (!eligible.length) {
      acknowledge?.({ ok: true, delivered: 0 })
      return
    }
    try {
      await Message.updateMany(
        { _id: { $in: eligible }, receiver: userId, receiptVersion: 1, deliveredAt: null },
        { $set: { deliveredAt: new Date() } },
      )
      const messages = await Message.find({
        _id: { $in: eligible }, receiver: userId, receiptVersion: 1,
      }).lean()
      for (const id of eligible) socket.data.pendingDeliveryIds.delete(id)
      publishStatuses(messages)
      acknowledge?.({ ok: true, delivered: messages.length })
      void queuePendingMessages(socket).catch(() => {})
    } catch {
      acknowledge?.({ ok: false })
    }
  })

  socket.on("typing:start", payload => {
    const recipient = payload?.recipientId
    if (!validId(recipient) || recipient === userId) return
    const key = typingKey(userId, recipient)
    let activeSockets = typingSocketMap.get(key)
    if (!activeSockets) {
      activeSockets = new Set()
      typingSocketMap.set(key, activeSockets)
    }
    const wasIdle = activeSockets.size === 0
    activeSockets.add(socket.id)
    if (wasIdle) emitToUser(recipient, "typing:start", { userId })
    const previous = socket.data.typingTargets.get(recipient)
    if (previous) clearTimeout(previous)
    socket.data.typingTargets.set(recipient, setTimeout(() => stopTyping(socket, recipient), TYPING_TIMEOUT_MS))
  })

  socket.on("typing:stop", payload => {
    const recipient = payload?.recipientId
    if (validId(recipient)) stopTyping(socket, recipient)
  })

  socket.on("disconnect", () => {
    for (const recipient of [...socket.data.typingTargets.keys()]) stopTyping(socket, recipient)
    sockets.delete(socket.id)
    if (sockets.size === 0) userSocketMap.delete(userId)
    tokenSockets.delete(socket.id)
    if (tokenSockets.size === 0) tokenSocketMap.delete(digest)
    io.emit("getOnlineUsers", [...userSocketMap.keys()])
  })
})

export { app, server, io }
