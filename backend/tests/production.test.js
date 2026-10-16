import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"
import express from "express"
import { configureHttpApp } from "../config/httpApp.js"
import { validateProductionEnvironment } from "../config/production.js"

const valid = {
  NODE_ENV: "production", MONGODB_URL: "placeholder", JWT_SECRET: "placeholder",
  FRONTEND_ORIGIN: "https://example.onrender.com", PORT: "10000", CLOUD_NAME: "placeholder",
  API_KEY: "placeholder", API_SECRET: "placeholder",
}

test("production configuration requires names and a precise HTTPS origin", () => {
  assert.doesNotThrow(() => validateProductionEnvironment(valid))
  assert.doesNotThrow(() => validateProductionEnvironment({ NODE_ENV: "development" }))
  assert.throws(() => validateProductionEnvironment({ NODE_ENV: "production" }), /MONGODB_URL.*FRONTEND_ORIGIN.*API_SECRET/)
  assert.throws(() => validateProductionEnvironment({ ...valid, PORT: "0" }), /PORT/)
  for (const origin of ["http://example.onrender.com", "https://example.onrender.com/path", "https://example.onrender.com/"]) {
    assert.throws(() => validateProductionEnvironment({ ...valid, FRONTEND_ORIGIN: origin }), /FRONTEND_ORIGIN/)
  }
})

test("startup fails before connecting and does not print configured secrets", () => {
  const result = spawnSync(process.execPath, ["index.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, ...valid, JWT_SECRET: "", MONGODB_URL: "mongodb+srv://sensitive-placeholder" },
    encoding: "utf8", timeout: 10000,
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /JWT_SECRET/)
  assert.doesNotMatch(result.stderr, /sensitive-placeholder/)
  assert.doesNotMatch(result.stdout, /server started/)
})

let root
let server
let url
let ready = false

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "popchat-static-"))
  await mkdir(path.join(root, "assets"))
  await writeFile(path.join(root, "index.html"), "<html>PopChat test</html>")
  await writeFile(path.join(root, "assets", "app.js"), "test asset")
  const app = express()
  configureHttpApp(app, { production: true, isReady: () => ready, dist: root })
  server = app.listen(0, "127.0.0.1")
  await new Promise(resolve => server.once("listening", resolve))
  url = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise(resolve => server.close(resolve))
  await rm(root, { recursive: true, force: true })
})

test("health reports readiness without internals", async () => {
  assert.equal((await fetch(`${url}/health`)).status, 503)
  ready = true
  const response = await fetch(`${url}/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: "ok" })
})

test("production frontend routes and assets work without masking API or missing files", async () => {
  for (const route of ["/", "/login", "/signup", "/profile"]) {
    const response = await fetch(`${url}${route}`)
    assert.equal(response.status, 200, route)
    assert.match(await response.text(), /PopChat test/)
  }
  assert.equal(await (await fetch(`${url}/assets/app.js`)).text(), "test asset")
  for (const route of ["/assets/missing.js", "/socket.io/missing", "/unknown"]) {
    const response = await fetch(`${url}${route}`)
    assert.equal(response.status, 404, route)
    assert.doesNotMatch(await response.text(), /PopChat test/)
  }
  const api = await fetch(`${url}/api/missing`)
  assert.equal(api.status, 404)
  assert.deepEqual(await api.json(), { message: "not found" })
})
