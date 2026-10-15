import express from "express"
import isAuth from "../middlewares/isAuth.js"
import { uploadImage } from "../middlewares/multer.js"
import { getInbox, getMessages, readMessages, sendMessage } from "../controllers/message.controllers.js"

const messageRouter=express.Router()

messageRouter.post("/send/:receiver",isAuth,uploadImage,sendMessage)
messageRouter.get("/get/:receiver",isAuth,getMessages)
messageRouter.get("/inbox",isAuth,getInbox)
messageRouter.post("/read/:sender",isAuth,readMessages)
export default messageRouter
