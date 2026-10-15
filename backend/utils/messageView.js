import Message from "../models/message.model.js"

export const DELETED_MESSAGE = "This message was deleted"

const asObject = value => typeof value?.toObject === "function" ? value.toObject() : value
const samePair = (a, b) =>
  [String(a.sender), String(a.receiver)].sort().join(":") ===
  [String(b.sender), String(b.receiver)].sort().join(":")

export const replyPreview = (reply, original) => {
  const id = String(reply.replyTo)
  if (!original || !samePair(reply, original)) return { _id: id, text: "Message unavailable", unavailable: true }
  if (original.deletedAt) return { _id: id, sender: String(original.sender), text: DELETED_MESSAGE, deleted: true }
  return {
    _id: id,
    sender: String(original.sender),
    text: original.message?.trim().slice(0, 120) || (original.image ? "Photo" : "Message unavailable"),
  }
}

export const publicMessage = (input, original) => {
  const item = asObject(input)
  const deleted = Boolean(item.deletedAt)
  return {
    ...item,
    sender: String(item.sender),
    receiver: String(item.receiver),
    ...(item.replyTo ? { replyTo: String(item.replyTo), replyPreview: replyPreview(item, original) } : {}),
    message: deleted ? "" : item.message ?? "",
    image: deleted ? "" : item.image ?? "",
    reactions: deleted ? [] : (item.reactions ?? []).map(reaction => ({ user: String(reaction.user), emoji: reaction.emoji })),
    editedAt: item.editedAt ?? null,
    deletedAt: item.deletedAt ?? null,
    revision: item.__v ?? 0,
  }
}

// One bounded lookup per 100 distinct references; no recursive population.
export const publicMessages = async inputs => {
  const messages = inputs.map(asObject)
  const ids = [...new Set(messages.filter(item => item.replyTo).map(item => String(item.replyTo)))]
  const originals = new Map()
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = await Message.find({ _id: { $in: ids.slice(offset, offset + 100) } }).lean()
    for (const item of batch) originals.set(String(item._id), item)
  }
  return messages.map(item => publicMessage(item, originals.get(String(item.replyTo))))
}
