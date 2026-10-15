import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { Writable } from "node:stream"
import { after, before, test } from "node:test"
import cookieParser from "cookie-parser"
import express from "express"
import jwt from "jsonwebtoken"
import { v2 as cloudinary } from "cloudinary"
import User from "../models/user.model.js"
import Conversation from "../models/conversation.model.js"
import Message from "../models/message.model.js"
import messageRouter from "../routes/message.routes.js"
import { MAX_IMAGE_BYTES } from "../middlewares/multer.js"

const alice = "507f1f77bcf86cd799439011"
const bob = "507f1f77bcf86cd799439012"
const original = {
  secret: process.env.JWT_SECRET,
  exists: User.exists,
  findOne: Conversation.findOne,
  createConversation: Conversation.create,
  createMessage: Message.create,
  uploadStream: cloudinary.uploader.upload_stream,
}
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
let server
let baseUrl
let createdMessages = []
let uploadFailure = false
let uploadedBytes = 0
let lastQuery

const cookie = () => `token=${jwt.sign({ userId: alice }, process.env.JWT_SECRET)}`
const form = (bytes, type, filename = "image.png") => {
  const body = new FormData()
  body.set("message", "hello")
  body.set("image", new Blob([bytes], { type }), filename)
  return body
}
const send = (body, authenticated = true) => fetch(`${baseUrl}/api/message/send/${bob}`, {
  method: "POST",
  headers: authenticated ? { Cookie: cookie() } : {},
  body,
})

before(async () => {
  process.env.JWT_SECRET = "image-upload-test-secret"
  User.exists = async ({ _id }) => _id === alice || _id === bob
  Conversation.findOne = async query => { lastQuery = query; return null }
  Conversation.create = async fields => fields
  Message.create = async fields => {
    const message = { _id: String(createdMessages.length + 1), ...fields }
    createdMessages.push(message)
    return message
  }
  cloudinary.uploader.upload_stream = (options, callback) => new Writable({
    write(chunk, encoding, done) { uploadedBytes += chunk.length; done() },
    final(done) {
      if (uploadFailure) callback(new Error("private cloudinary failure"))
      else callback(null, { secure_url: "https://res.cloudinary.com/test/image.png" })
      done()
    },
  })
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use("/api/message", messageRouter)
  server = app.listen(0, "127.0.0.1")
  await new Promise(resolve => server.once("listening", resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise(resolve => server.close(resolve))
  User.exists = original.exists
  Conversation.findOne = original.findOne
  Conversation.create = original.createConversation
  Message.create = original.createMessage
  cloudinary.uploader.upload_stream = original.uploadStream
  if (original.secret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = original.secret
})

test("valid image retains message response and never uses a request filename as a path", async () => {
  const filename = "popchat-test-unsafe-filename.png"
  const response = await send(form(png, "image/png", filename))
  assert.equal(response.status, 201)
  const message = await response.json()
  assert.equal(message.image, "https://res.cloudinary.com/test/image.png")
  assert.equal(message.sender, alice)
  assert.equal(uploadedBytes, png.length)
  assert.equal(existsSync(`public/${filename}`), false)
  assert.deepEqual(lastQuery.partcipants.$size, 2)
})

test("unsupported content and spoofed MIME are rejected before persistence", async () => {
  const count = createdMessages.length
  const unsupported = await send(form(Buffer.from("not an image"), "text/plain", "fake.png"))
  assert.equal(unsupported.status, 400)
  assert.deepEqual(await unsupported.json(), { message: "unsupported image format" })
  const spoofed = await send(form(png, "image/jpeg", "fake.jpg"))
  assert.equal(spoofed.status, 400)
  assert.deepEqual(await spoofed.json(), { message: "unsupported image format" })
  assert.equal(createdMessages.length, count)
})

test("oversized upload returns 413 and does not create a message", async () => {
  const count = createdMessages.length
  const response = await send(form(Buffer.alloc(MAX_IMAGE_BYTES + 1), "image/png"))
  assert.equal(response.status, 413)
  assert.deepEqual(await response.json(), { message: "image exceeds 5 MB" })
  assert.equal(createdMessages.length, count)
})

test("unauthenticated upload is rejected before upload processing", async () => {
  const count = createdMessages.length
  const response = await send(form(png, "image/png"), false)
  assert.equal(response.status, 401)
  assert.equal(createdMessages.length, count)
})

test("failed cloud upload returns a safe error and leaves no temporary file", async () => {
  const count = createdMessages.length
  uploadFailure = true
  try {
    const response = await send(form(png, "image/png", "popchat-failed-upload.png"))
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { message: "send message error" })
    assert.equal(createdMessages.length, count)
    assert.equal(existsSync("public/popchat-failed-upload.png"), false)
  } finally {
    uploadFailure = false
  }
})
