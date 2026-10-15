import assert from "node:assert/strict"
import test from "node:test"
import { cookieOptions, clearCookieOptions } from "../config/cookie.js"

test("cookie settings retain localhost behavior and require HTTPS in production", () => {
  const original = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = "development"
    assert.equal(cookieOptions().sameSite, "Strict")
    assert.equal(cookieOptions().secure, false)
    process.env.NODE_ENV = "production"
    assert.equal(cookieOptions().sameSite, "None")
    assert.equal(cookieOptions().secure, true)
    assert.equal(clearCookieOptions().secure, true)
  } finally {
    if (original === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = original
  }
})
