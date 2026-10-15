import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement, useContext } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { createServer } from 'vite'
import userReducer, { setUserData } from '../src/redux/userSlice.js'

test('SocketProvider renders with no connection before and after login', async () => {
  const vite = await createServer({
    configFile: false,
    esbuild: { jsx: 'automatic' },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    plugins: [{
      name: 'mock-main-for-socket-provider-test',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === '../main' && importer?.endsWith('/src/context/SocketProvider.jsx')) return '\0test-server-url'
      },
      load(id) {
        if (id === '\0test-server-url') return "export const serverUrl = 'http://localhost:8000'"
      },
    }],
  })

  try {
    const { default: SocketProvider } = await vite.ssrLoadModule('/src/context/SocketProvider.jsx')
    const { default: SocketContext } = await vite.ssrLoadModule('/src/context/SocketContext.js')
    const store = configureStore({ reducer: { user: userReducer } })
    function SocketStatus() {
      return createElement('span', null, useContext(SocketContext) ? 'connected' : 'no socket')
    }
    const render = () => renderToStaticMarkup(
      createElement(Provider, { store }, createElement(SocketProvider, null, createElement(SocketStatus))),
    )

    assert.equal(render(), '<span>no socket</span>')
    store.dispatch(setUserData({ _id: 'alice' }))
    assert.equal(render(), '<span>no socket</span>')
    store.dispatch(setUserData(null))
    assert.equal(render(), '<span>no socket</span>')
  } finally {
    await vite.close()
  }
})
