import mongoose from "mongoose"

const conversationPreferenceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  otherUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  pinnedAt: { type: Date, default: null },
  archived: { type: Boolean, default: false },
  archivedAt: { type: Date, default: null },
  muted: { type: Boolean, default: false },
  revision: { type: Number, default: 0 },
}, { timestamps: true })

conversationPreferenceSchema.index({ userId: 1, otherUserId: 1 }, { unique: true })

const ConversationPreference = mongoose.model("ConversationPreference", conversationPreferenceSchema)
export default ConversationPreference
