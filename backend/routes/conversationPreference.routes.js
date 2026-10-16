import express from "express"
import isAuth from "../middlewares/isAuth.js"
import { getConversationPreferences, updateConversationPreference } from "../controllers/conversationPreference.controllers.js"

const conversationPreferenceRouter = express.Router()
conversationPreferenceRouter.get("/", isAuth, getConversationPreferences)
conversationPreferenceRouter.put("/:otherUserId", isAuth, updateConversationPreference)
export default conversationPreferenceRouter
