import express from "express"
import isAuth from "../middlewares/isAuth.js"
import { uploadImage } from "../middlewares/multer.js"
import { deleteMessage, editMessage, getInbox, getMessages, getSharedMedia, readMessages, sendMessage, setReaction } from "../controllers/message.controllers.js"

const messageRouter=express.Router()

messageRouter.post("/send/:receiver",isAuth,uploadImage,sendMessage)
messageRouter.get("/get/:receiver",isAuth,getMessages)
messageRouter.get("/inbox",isAuth,getInbox)
messageRouter.post("/read/:sender",isAuth,readMessages)
messageRouter.put("/:messageId/reaction",isAuth,setReaction)
messageRouter.patch("/:messageId",isAuth,editMessage)
messageRouter.delete("/:messageId",isAuth,deleteMessage)
messageRouter.get("/media/:otherUserId",isAuth,getSharedMedia)
export default messageRouter
