import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import mongoose from "mongoose"
import authRouter from "../routes/auth.routes.js"
import userRouter from "../routes/user.routes.js"
import messageRouter from "../routes/message.routes.js"
import conversationPreferenceRouter from "../routes/conversationPreference.routes.js"
import { allowedOrigin, verifyRequestOrigin } from "./origin.js"

export const frontendDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist")

export const configureHttpApp = (app, { production = process.env.NODE_ENV === "production", isReady = () => mongoose.connection.readyState === 1, dist = frontendDist } = {}) => {
  app.use(cors({ origin: allowedOrigin, credentials: true }))
  app.use(express.json())
  app.use(cookieParser())
  app.use(verifyRequestOrigin)

  app.get("/health", (req, res) => {
    if (!isReady()) return res.status(503).json({ status: "unavailable" })
    res.json({ status: "ok" })
  })
  app.use("/api/auth", authRouter)
  app.use("/api/user", userRouter)
  app.use("/api/message", messageRouter)
  app.use("/api/conversation/preferences", conversationPreferenceRouter)
  app.use("/api", (req, res) => res.status(404).json({ message: "not found" }))

  if (production) {
    const indexFile = path.join(dist, "index.html")
    if (!existsSync(indexFile)) throw new Error("frontend build missing: frontend/dist/index.html")
    app.use(express.static(dist, { index: false }))
    app.get(["/", "/login", "/signup", "/profile"], (req, res) => res.sendFile(indexFile))
  }

  app.use((error, req, res, next) => {
    const badRequest = error.status === 400
    res.status(badRequest ? 400 : 500).json({ message: badRequest ? "invalid request" : "server error" })
  })
}
