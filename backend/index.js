import "dotenv/config"
import connectDb from "./config/db.js"
import { app, io, server } from "./socket/socket.js"
import mongoose from "mongoose"
import { configureHttpApp } from "./config/httpApp.js"
import { validateProductionEnvironment } from "./config/production.js"
import User from "./models/user.model.js"
import Message from "./models/message.model.js"
import ConversationPreference from "./models/conversationPreference.model.js"

const port = process.env.PORT || 5000
let ready = false
let startupFailure = "production configuration invalid"
try {
  validateProductionEnvironment()
  startupFailure = "frontend or HTTP configuration failed"
  configureHttpApp(app, { isReady: () => ready && mongoose.connection.readyState === 1 })
  startupFailure = "database connection failed"
  await connectDb()
  startupFailure = "user index setup failed"
  await User.init()
  startupFailure = "message index setup failed"
  await Message.init()
  startupFailure = "conversation preference unique index setup failed"
  await ConversationPreference.createIndexes()
  ready = true
  startupFailure = "HTTP listener failed"
  await new Promise((resolve, reject) => {
    const onError = error => { server.off("listening", onListening); reject(error) }
    const onListening = () => { server.off("error", onError); resolve() }
    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(port, "0.0.0.0")
  })
  console.log("server started")
} catch (error) {
  const safeMessage = /^(missing production environment variables:|FRONTEND_ORIGIN must|frontend build missing:)/.test(error?.message ?? "") ? `: ${error.message}` : ""
  console.error(`${startupFailure}${safeMessage}`)
  await mongoose.disconnect()
  process.exitCode = 1
}

const shutdown = async () => {
  ready = false
  await new Promise(resolve => io.close(resolve))
  await mongoose.disconnect()
}
process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
