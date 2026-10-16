import assert from 'node:assert/strict'
import http from 'node:http'
import process from 'node:process'
import { createRequire } from 'node:module'
import { after, before, test } from 'node:test'
import { io as createClient } from 'socket.io-client'
import { createServer as createViteServer } from 'vite'

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url))
const { Server } = requireBackend('socket.io')
const previousTarget = process.env.VITE_SERVER_URL
let upstream
let sockets
let vite
let origin

before(async () => {
  upstream = http.createServer((req, res) => {
    if (req.url === '/api/session' && req.method === 'POST') {
      res.setHeader('Set-Cookie', 'token=proxy-test; Path=/; HttpOnly')
      res.writeHead(200).end('signed in')
    } else if (req.url === '/api/session') {
      res.writeHead(req.headers.cookie === 'token=proxy-test' ? 200 : 401).end('session')
    } else {
      res.writeHead(404).end()
    }
  })
  sockets = new Server(upstream)
  sockets.use((socket, next) => socket.request.headers.cookie === 'token=proxy-test' ? next() : next(new Error('unauthorized')))
  upstream.listen(0, '127.0.0.1')
  await new Promise(resolve => upstream.once('listening', resolve))
  process.env.VITE_SERVER_URL = `http://127.0.0.1:${upstream.address().port}`
  vite = await createViteServer({ server: { host: '127.0.0.1', port: 0 } })
  await vite.listen()
  origin = `http://127.0.0.1:${vite.httpServer.address().port}`
})

after(async () => {
  await vite?.close()
  upstream?.closeAllConnections()
  await new Promise(resolve => sockets?.close(resolve))
  if (previousTarget === undefined) delete process.env.VITE_SERVER_URL
  else process.env.VITE_SERVER_URL = previousTarget
})

test('Vite preserves API cookies and serves the app while proxying the API', async () => {
  const home = await fetch(origin)
  assert.equal(home.status, 200)
  assert.match(await home.text(), /vite\/client/)
  const login = await fetch(`${origin}/api/session`, { method: 'POST' })
  assert.equal(login.status, 200)
  assert.match(login.headers.get('set-cookie'), /HttpOnly/)
  const current = await fetch(`${origin}/api/session`, { headers: { Cookie: 'token=proxy-test' } })
  assert.equal(current.status, 200)
  assert.equal((await fetch(`${origin}/api/session`)).status, 401)
})

test('Vite proxies authenticated Socket.IO polling and WebSocket upgrades', async () => {
  const client = createClient(origin, {
    autoConnect: false, reconnection: false, transports: ['polling', 'websocket'],
    extraHeaders: { Cookie: 'token=proxy-test', Origin: origin }, timeout: 3000,
  })
  try {
    const connected = new Promise((resolve, reject) => {
      client.once('connect', resolve)
      client.once('connect_error', reject)
    })
    client.connect()
    const upgraded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket.IO upgrade timed out')), 5000)
      client.io.engine.on('upgrade', transport => { clearTimeout(timer); resolve(transport.name) })
    })
    await connected
    assert.equal(await upgraded, 'websocket')
  } finally {
    client.disconnect()
  }
})
