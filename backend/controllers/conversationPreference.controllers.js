import ConversationPreference from "../models/conversationPreference.model.js"
import User from "../models/user.model.js"
import { publishConversationPreferenceUpdated } from "../socket/socket.js"

const validId = value => typeof value === "string" && /^[a-f\d]{24}$/i.test(value)
const allowed = new Set(["pinned", "archived", "muted"])

export const safePreference = (item, otherUserId = item?.otherUserId) => ({
  otherUserId: String(otherUserId),
  pinnedAt: item?.pinnedAt ?? null,
  archived: item?.archived ?? false,
  archivedAt: item?.archivedAt ?? null,
  muted: item?.muted ?? false,
  revision: item?.revision ?? 0,
})

export const getConversationPreferences = async (req, res) => {
  try {
    const rows = await ConversationPreference.find({ userId: req.userId }).lean()
    return res.status(200).json({ preferences: rows.map(row => safePreference(row)) })
  } catch {
    return res.status(500).json({ message: "get conversation preferences error" })
  }
}

export const updateConversationPreference = async (req, res) => {
  const otherUserId = req.params.otherUserId?.toLowerCase()
  const userId = String(req.userId).toLowerCase()
  const body = req.body
  if (!validId(otherUserId) || otherUserId === userId) {
    return res.status(400).json({ message: "invalid conversation partner" })
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !Object.keys(body).length || Object.keys(body).some(key => !allowed.has(key) || typeof body[key] !== "boolean")) {
    return res.status(400).json({ message: "invalid preference update" })
  }

  try {
    if (!await User.exists({ _id: otherUserId })) {
      return res.status(404).json({ message: "conversation partner not found" })
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const current = await ConversationPreference.findOne({ userId, otherUserId }).lean()
      const before = safePreference(current, otherUserId)
      const changes = {}
      const now = new Date()
      if (body.pinned !== undefined && body.pinned !== Boolean(before.pinnedAt)) {
        changes.pinnedAt = body.pinned ? now : null
      }
      if (body.archived !== undefined && body.archived !== before.archived) {
        changes.archived = body.archived
        changes.archivedAt = body.archived ? now : null
      }
      if (body.muted !== undefined && body.muted !== before.muted) {
        changes.muted = body.muted
      }
      if (!Object.keys(changes).length) {
        // Recheck once: another writer may have changed the document after the read.
        const latest = await ConversationPreference.findOne({ userId, otherUserId }).lean()
        if ((latest?.revision ?? 0) !== before.revision) continue
        return res.status(200).json(safePreference(latest, otherUserId))
      }
      try {
        const updated = await ConversationPreference.findOneAndUpdate(
          { userId, otherUserId, revision: before.revision },
          { $set: changes, $inc: { revision: 1 } },
          { upsert: !current, new: true, runValidators: true, setDefaultsOnInsert: false },
        )
        if (!updated) continue
        const result = safePreference(updated, otherUserId)
        publishConversationPreferenceUpdated(userId, { otherUserId, revision: result.revision })
        return res.status(200).json(result)
      } catch (error) {
        if (error?.code === 11000) continue
        throw error
      }
    }
    return res.status(409).json({ message: "preference changed; retry" })
  } catch {
    return res.status(500).json({ message: "update conversation preference error" })
  }
}
