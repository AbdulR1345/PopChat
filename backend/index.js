import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import express from "express";
import dotenv from "dotenv";
import connectDb from "./config/db.js";
import authRouter from "./routes/auth.routes.js";
import cookieParser from "cookie-parser";
dotenv.config();
import cors from "cors";
import userRouter from "./routes/user.routes.js";
import messageRouter from "./routes/message.routes.js";
import { app, io, server } from "./socket/socket.js";
import mongoose from "mongoose";
import { allowedOrigin, verifyRequestOrigin } from "./config/origin.js";
import Message from "./models/message.model.js";

const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(verifyRequestOrigin);
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/message", messageRouter);
app.use((error, req, res, next) => {
  const badRequest = error.status === 400;
  res.status(badRequest ? 400 : 500).json({ message: badRequest ? "invalid request" : "server error" });
});

try {
  await connectDb();
  await Message.init();
  server.listen(port, () => console.log("server started"));
} catch {
  console.error("database connection failed");
  await mongoose.disconnect();
  process.exitCode = 1;
}

const shutdown = async () => {
  await new Promise(resolve => io.close(resolve));
  await mongoose.disconnect();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
