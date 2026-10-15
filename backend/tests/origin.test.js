import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import express from "express"
import { allowedOrigin, verifyLegacyLogoutOrigin, verifyRequestOrigin } from "../config/origin.js"

const originalNodeEnv = process.env.NODE_ENV
let server
let baseUrl

before(async () => {
  const app = express()
  app.use(verifyRequestOrigin)
  app.post("/write", (req, res) => res.json({ ok: true }))
  app.get("/logout", verifyLegacyLogoutOrigin, (req, res) => res.json({ ok: true }))
  server = app.listen(0, "127.0.0.1")
  await new Promise(resolve => server.once("listening", resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise(resolve => server.close(resolve))
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
})

test("production mutations require the configured frontend origin", async () => {
  process.env.NODE_ENV = "production"
  const missing = await fetch(`${baseUrl}/write`, { method: "POST" })
  assert.equal(missing.status, 403)
  const foreign = await fetch(`${baseUrl}/write`, { method: "POST", headers: { Origin: "https://foreign.example" } })
  assert.equal(foreign.status, 403)
  const allowed = await fetch(`${baseUrl}/write`, { method: "POST", headers: { Origin: allowedOrigin } })
  assert.equal(allowed.status, 200)
})

test("legacy GET logout remains usable locally and rejects cross-site requests", async () => {
  process.env.NODE_ENV = "development"
  assert.equal((await fetch(`${baseUrl}/logout`)).status, 200)
  process.env.NODE_ENV = "production"
  assert.equal((await fetch(`${baseUrl}/logout`)).status, 403)
  assert.equal((await fetch(`${baseUrl}/logout`, { headers: { Referer: "https://foreign.example/page" } })).status, 403)
  assert.equal((await fetch(`${baseUrl}/logout`, { headers: { Referer: `${allowedOrigin}/` } })).status, 200)
})
