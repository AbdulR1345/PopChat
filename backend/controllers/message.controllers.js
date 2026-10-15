import uploadOnCloudinary from "../config/cloudinary.js"
import Conversation from "../models/conversation.model.js"
import Message from "../models/message.model.js"
import User from "../models/user.model.js"
import { buildInboxPipeline } from "../utils/inbox.js"
import { publicMessages } from "../utils/messageView.js"
import { publishInboxUpdated, publishMessage, publishMessageUpdated, publishStatuses } from "../socket/socket.js"

const validId = value => typeof value === "string" && /^[a-f\d]{24}$/i.test(value)
const validClientMessageId = value =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value)
const SUPPORTED_REACTIONS = new Set(["👍", "❤️", "😂", "😮", "😢", "🔥"])
const pairFilter = (a, b) => ({ $or: [{ sender: a, receiver: b }, { sender: b, receiver: a }] })
const inPair = (item, userId) => String(item.sender) === String(userId) || String(item.receiver) === String(userId)
const exposeOne = async item => (await publicMessages([item]))[0]
const publishUpdate = async item => {
  const safe = await exposeOne(item)
  publishMessageUpdated(safe)
  return safe
}

const ensureConversation = async (sender, receiver, messageId) => {
  const conversation = await Conversation.findOne({
    partcipants: { $all: [sender, receiver], $size: 2 },
  })
  if (!conversation) {
    await Conversation.create({ partcipants: [sender, receiver], messages: [messageId] })
    return true
  }
  if (conversation.messages.some(id => String(id) === String(messageId))) return false
  conversation.messages.push(messageId)
  await conversation.save()
  return true
}

export const sendMessage = async (req, res) => {
  const sender = req.userId
  const receiver = req.params.receiver?.toLowerCase()
  const { message, clientMessageId, replyTo } = req.body ?? {}
  if (!validId(receiver) || receiver === String(sender).toLowerCase()) {
    return res.status(400).json({ message: "invalid receiver" })
  }
  if (typeof message !== "string" && message !== undefined) {
    return res.status(400).json({ message: "invalid message" })
  }
  if (message?.length > 10000 || (!message?.trim() && !req.file)) {
    return res.status(400).json({ message: "message or image is required" })
  }
  if (clientMessageId !== undefined && !validClientMessageId(clientMessageId)) {
    return res.status(400).json({ message: "invalid client message id" })
  }
  if (replyTo !== undefined && !validId(replyTo)) {
    return res.status(400).json({ message: "invalid reply target" })
  }

  try {
    if (!await User.exists({ _id: receiver })) {
      return res.status(404).json({ message: "receiver not found" })
    }
    if (clientMessageId) {
      const existing = await Message.findOne({ sender, clientMessageId })
      if (existing) {
        if (String(existing.receiver) !== receiver) {
          return res.status(409).json({ message: "client message id already used" })
        }
        const safe = await exposeOne(existing)
        if (await ensureConversation(sender, receiver, existing._id)) publishMessage(safe)
        return res.status(200).json(safe)
      }
    }

    if (replyTo && !await Message.findOne({ _id: replyTo, ...pairFilter(sender, receiver) })) {
      return res.status(400).json({ message: "reply target is not in this conversation" })
    }

    const image = req.file ? await uploadOnCloudinary(req.file.buffer) : undefined
    let newMessage
    try {
      newMessage = await Message.create({
        sender, receiver, message, image, receiptVersion: 1, clientMessageId, replyTo,
      })
    } catch (error) {
      if (error?.code !== 11000 || !clientMessageId) throw error
      const existing = await Message.findOne({ sender, clientMessageId })
      if (!existing || String(existing.receiver) !== receiver) throw error
      const safe = await exposeOne(existing)
      if (await ensureConversation(sender, receiver, existing._id)) publishMessage(safe)
      return res.status(200).json(safe)
    }

    await ensureConversation(sender, receiver, newMessage._id)
    const safe = await exposeOne(newMessage)
    publishMessage(safe)
    return res.status(201).json(safe)
  } catch {
    return res.status(500).json({ message: "send message error" })
  }
}

export const getMessages = async (req, res) => {
  const sender = req.userId
  const receiver = req.params.receiver?.toLowerCase()
  if (!validId(receiver) || receiver === String(sender).toLowerCase()) {
    return res.status(400).json({ message: "invalid receiver" })
  }
  try {
    const messages = await Message.find({ $or: [
      { sender, receiver },
      { sender: receiver, receiver: sender },
    ] }).sort({ createdAt: 1, _id: 1 }).lean()
    return res.status(200).json(await publicMessages(messages))
  } catch {
    return res.status(500).json({ message: "get message error" })
  }
}

export const getInbox = async (req, res) => {
  try {
    const inbox = await Message.aggregate(buildInboxPipeline(req.userId))
    return res.status(200).json(inbox)
  } catch {
    return res.status(500).json({ message: "get inbox error" })
  }
}

export const readMessages = async (req, res) => {
  const sender = req.params.sender?.toLowerCase()
  const receiver = req.userId
  const ids = req.body?.messageIds
  if (!validId(sender) || sender === String(receiver).toLowerCase() ||
      !Array.isArray(ids) || ids.length > 100 || !ids.every(validId)) {
    return res.status(400).json({ message: "invalid read request" })
  }
  if (!ids.length) return res.status(200).json({ messages: [] })

  const filter = {
    _id: { $in: [...new Set(ids)] },
    sender, receiver, receiptVersion: 1,
  }
  try {
    const now = new Date()
    await Message.updateMany({ ...filter, deliveredAt: null }, { $set: { deliveredAt: now } })
    await Message.updateMany({ ...filter, readAt: null }, { $set: { readAt: now } })
    const messages = await Message.find(filter).lean()
    publishStatuses(messages)
    if (messages.length) publishInboxUpdated([sender, receiver])
    return res.status(200).json({
      messages: messages.map(item => ({
        messageId: String(item._id),
        deliveredAt: item.deliveredAt ?? null,
        readAt: item.readAt ?? null,
      })),
    })
  } catch {
    return res.status(500).json({ message: "read message error" })
  }
}

const messageForParticipant = async (messageId, userId) => {
  const item = await Message.findOne({ _id: messageId })
  return item && inPair(item, userId) ? item : null
}

export const setReaction = async (req, res) => {
  const messageId = req.params.messageId
  const emoji = req.body?.emoji
  if (!validId(messageId) || !(emoji === null || SUPPORTED_REACTIONS.has(emoji))) {
    return res.status(400).json({ message: "invalid reaction" })
  }
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      const item = await messageForParticipant(messageId, req.userId)
      if (!item) return res.status(404).json({ message: "message not found" })
      if (item.deletedAt) return res.status(409).json({ message: "message was deleted" })
      const current = (item.reactions ?? []).find(reaction => String(reaction.user) === String(req.userId))?.emoji ?? null
      if (current === emoji) return res.status(200).json(await exposeOne(item))
      const reactions = (item.reactions ?? []).filter(reaction => String(reaction.user) !== String(req.userId))
        .map(reaction => ({ user: reaction.user, emoji: reaction.emoji }))
      if (emoji) reactions.push({ user: req.userId, emoji })
      const updated = await Message.findOneAndUpdate(
        { _id: messageId, deletedAt: null, __v: item.__v ?? null },
        { $set: { reactions }, $inc: { __v: 1 } },
        { new: true, runValidators: true },
      )
      if (!updated) continue
      return res.status(200).json(await publishUpdate(updated))
    }
    return res.status(409).json({ message: "reaction changed; retry" })
  } catch {
    return res.status(500).json({ message: "reaction error" })
  }
}

export const editMessage = async (req, res) => {
  const messageId = req.params.messageId
  const value = req.body?.message
  const expectedEditedAt = req.body?.expectedEditedAt
  if (!validId(messageId) || typeof value !== "string" || !value.trim() || value.length > 10000 ||
      !Object.hasOwn(req.body ?? {}, "expectedEditedAt") ||
      !(expectedEditedAt === null || (typeof expectedEditedAt === "string" &&
        !Number.isNaN(Date.parse(expectedEditedAt)) && new Date(expectedEditedAt).toISOString() === expectedEditedAt))) {
    return res.status(400).json({ message: "invalid edit" })
  }
  try {
    const item = await messageForParticipant(messageId, req.userId)
    if (!item) return res.status(404).json({ message: "message not found" })
    if (String(item.sender) !== String(req.userId)) return res.status(403).json({ message: "only the sender can edit" })
    if (item.deletedAt) return res.status(409).json({ message: "message was deleted" })
    if (item.image) return res.status(400).json({ message: "only text messages can be edited" })
    if ((item.editedAt?.toISOString() ?? null) !== expectedEditedAt) {
      return res.status(409).json({ message: "message changed; refresh before editing" })
    }
    if (item.message === value.trim()) return res.status(200).json(await exposeOne(item))
    const nextEditedAt = new Date(Math.max(Date.now(), (item.editedAt?.getTime() ?? 0) + 1))
    const updated = await Message.findOneAndUpdate(
      { _id: messageId, sender: req.userId, image: { $in: ["", null] }, deletedAt: null, editedAt: item.editedAt ?? null },
      { $set: { message: value.trim(), editedAt: nextEditedAt }, $inc: { __v: 1 } },
      { new: true, runValidators: true },
    )
    if (!updated) return res.status(409).json({ message: "message changed; refresh before editing" })
    const safe = await publishUpdate(updated)
    publishInboxUpdated([item.sender, item.receiver])
    return res.status(200).json(safe)
  } catch {
    return res.status(500).json({ message: "edit message error" })
  }
}

export const deleteMessage = async (req, res) => {
  const messageId = req.params.messageId
  if (!validId(messageId)) return res.status(400).json({ message: "invalid message id" })
  try {
    const item = await messageForParticipant(messageId, req.userId)
    if (!item) return res.status(404).json({ message: "message not found" })
    if (String(item.sender) !== String(req.userId)) return res.status(403).json({ message: "only the sender can delete" })
    if (item.deletedAt) return res.status(200).json(await exposeOne(item))
    const updated = await Message.findOneAndUpdate(
      { _id: messageId, sender: req.userId, deletedAt: null },
      { $set: { message: "", image: "", reactions: [], deletedAt: new Date() }, $inc: { __v: 1 } },
      { new: true },
    )
    if (!updated) return res.status(200).json(await exposeOne(await Message.findOne({ _id: messageId })))
    const safe = await publishUpdate(updated)
    publishInboxUpdated([item.sender, item.receiver])
    return res.status(200).json(safe)
  } catch {
    return res.status(500).json({ message: "delete message error" })
  }
}

const decodeCursor = value => {
  if (typeof value !== "string" || value.length > 200) return null
  try {
    const [date, id] = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    if (!validId(id) || typeof date !== "string" || Number.isNaN(Date.parse(date)) ||
        new Date(date).toISOString() !== date) return null
    return { createdAt: new Date(date), _id: id }
  } catch { return null }
}

export const getSharedMedia = async (req, res) => {
  const other = req.params.otherUserId?.toLowerCase()
  const userId = String(req.userId)
  const rawLimit = req.query.limit
  const limit = rawLimit === undefined ? 24 : Number(rawLimit)
  const cursor = req.query.cursor === undefined ? undefined : decodeCursor(req.query.cursor)
  if (!validId(other) || other === userId.toLowerCase() || !Number.isInteger(limit) || limit < 1 || limit > 50 ||
      (req.query.cursor !== undefined && !cursor)) {
    return res.status(400).json({ message: "invalid media request" })
  }
  try {
    const before = cursor ? { $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
    ] } : null
    const direction = (sender, receiver) => ({
      sender, receiver, image: { $gt: "" }, deletedAt: null,
      ...(before ? { $and: [before] } : {}),
    })
    // The two bounded scans each use the shared-media index's equality prefix.
    const [outgoing, incoming] = await Promise.all([
      Message.find(direction(userId, other)).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean(),
      Message.find(direction(other, userId)).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean(),
    ])
    const rows = [...new Map([...outgoing, ...incoming].map(item => [String(item._id), item])).values()]
      .sort((a, b) => b.createdAt - a.createdAt || (String(a._id) < String(b._id) ? 1 : -1))
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    return res.status(200).json({
      items: page.map(item => ({ _id: item._id, image: item.image, sender: item.sender, createdAt: item.createdAt })),
      nextCursor: rows.length > limit && last
        ? Buffer.from(JSON.stringify([last.createdAt.toISOString(), String(last._id)])).toString("base64url")
        : null,
    })
  } catch {
    return res.status(500).json({ message: "get shared media error" })
  }
}
