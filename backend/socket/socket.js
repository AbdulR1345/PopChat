import http from "http"
import { createHash } from "node:crypto"
import express from "express"
import cookieParser from "cookie-parser"
import jwt from "jsonwebtoken"
import { Server } from "socket.io"
import User from "../models/user.model.js"
import { allowedOrigin } from "../config/origin.js"

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: allowedOrigin, credentials: true },
  // WebSocket upgrades do not use the browser's CORS checks.
  allowRequest: (request, callback) => {
    callback(null, !request.headers.origin || request.headers.origin === allowedOrigin)
  },
})

const parseCookies = cookieParser()
const userSocketMap = new Map()
const tokenSocketMap = new Map()
const tokenDigest = token => createHash("sha256").update(token).digest("hex")

export const getReceiverSocketIds = receiver =>
  [...(userSocketMap.get(String(receiver)) ?? [])]

export const disconnectSocketsForToken = token => {
  if (typeof token !== "string") return
  for (const socketId of [...(tokenSocketMap.get(tokenDigest(token)) ?? [])]) {
    io.sockets.sockets.get(socketId)?.disconnect(true)
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
  let sockets = userSocketMap.get(userId)
  if (!sockets) {
    sockets = new Set()
    userSocketMap.set(userId, sockets)
  }
  sockets.add(socket.id)
  const digest = socket.data.tokenDigest
  let tokenSockets = tokenSocketMap.get(digest)
  if (!tokenSockets) {
    tokenSockets = new Set()
    tokenSocketMap.set(digest, tokenSockets)
  }
  tokenSockets.add(socket.id)
  io.emit("getOnlineUsers", [...userSocketMap.keys()])

  socket.on("disconnect", () => {
    sockets.delete(socket.id)
    if (sockets.size === 0) userSocketMap.delete(userId)
    tokenSockets.delete(socket.id)
    if (tokenSockets.size === 0) tokenSocketMap.delete(digest)
    io.emit("getOnlineUsers", [...userSocketMap.keys()])
  })
})

export { app, server, io }
