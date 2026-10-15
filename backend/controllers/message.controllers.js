import uploadOnCloudinary from "../config/cloudinary.js"
import Conversation from "../models/conversation.model.js"
import Message from "../models/message.model.js"
import User from "../models/user.model.js"
import { buildInboxPipeline } from "../utils/inbox.js"
import { publishInboxUpdated, publishMessage, publishStatuses } from "../socket/socket.js"

const validId = value => typeof value === "string" && /^[a-f\d]{24}$/i.test(value)
const validClientMessageId = value =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value)

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
  const { message, clientMessageId } = req.body ?? {}
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
        if (await ensureConversation(sender, receiver, existing._id)) publishMessage(existing)
        return res.status(200).json(existing)
      }
    }

    const image = req.file ? await uploadOnCloudinary(req.file.buffer) : undefined
    let newMessage
    try {
      newMessage = await Message.create({
        sender, receiver, message, image, receiptVersion: 1, clientMessageId,
      })
    } catch (error) {
      if (error?.code !== 11000 || !clientMessageId) throw error
      const existing = await Message.findOne({ sender, clientMessageId })
      if (!existing || String(existing.receiver) !== receiver) throw error
      if (await ensureConversation(sender, receiver, existing._id)) publishMessage(existing)
      return res.status(200).json(existing)
    }

    await ensureConversation(sender, receiver, newMessage._id)
    publishMessage(newMessage)
    return res.status(201).json(newMessage)
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
    return res.status(200).json(messages)
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
