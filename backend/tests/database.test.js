import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"
import mongoose from "mongoose"
import connectDb from "../config/db.js"

test("database connection failure propagates to startup", async () => {
  const original = mongoose.connect
  mongoose.connect = async () => { throw new Error("database unavailable") }
  try {
    await assert.rejects(connectDb(), /database unavailable/)
  } finally {
    mongoose.connect = original
  }
})

test("server does not listen when the database URL is invalid", () => {
  const result = spawnSync(process.execPath, ["index.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, MONGODB_URL: "not-a-mongodb-uri", PORT: "0" },
    encoding: "utf8",
    timeout: 10000,
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /database connection failed/)
  assert.doesNotMatch(result.stdout, /server started/)
})
