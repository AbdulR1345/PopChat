import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import express from "express"
import cookieParser from "cookie-parser"
import bcrypt from "bcryptjs"
import User from "../models/user.model.js"
import authRouter from "../routes/auth.routes.js"
import userRouter from "../routes/user.routes.js"

const originalMethods = Object.fromEntries(
    ["findOne", "findById", "findByIdAndUpdate", "find", "create", "exists"].map((name) => [name, User[name]])
)
const originalJwtSecret = process.env.JWT_SECRET
const users = []
let selectedPasswordForLogin = false
let server
let baseUrl

const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, options)
    return { response, body: await response.json() }
}

const assertPublicUser = (user) => {
    assert.deepEqual(Object.keys(user).sort(), ["_id", "email", "image", "userName"].concat(user.name === undefined ? [] : ["name"]).sort())
    assert.equal(user.password, undefined)
    assert.equal(user.token, undefined)
}

before(async () => {
    process.env.JWT_SECRET = "local-test-secret"
    User.findOne = (filter) => {
        const user = users.find((item) => Object.entries(filter).every(([key, value]) => item[key] === value))
        return {
            then: (resolve, reject) => Promise.resolve(user).then(resolve, reject),
            select: (projection) => {
                assert.equal(projection, "+password")
                selectedPasswordForLogin = true
                return Promise.resolve(user)
            },
        }
    }
    User.create = async (fields) => {
        const user = { _id: String(users.length + 1), name: undefined, image: "", ...fields, __v: 0 }
        users.push(user)
        return user
    }
    User.findById = async (id) => users.find((user) => user._id === id)
    User.exists = async ({ _id }) => users.some(user => user._id === _id)
    User.findByIdAndUpdate = async (id, fields) => {
        const user = users.find((item) => item._id === id)
        if (user) Object.assign(user, { name: fields.name })
        return user
    }
    User.find = async (filter) => users.filter((user) => {
        if (filter._id?.$ne) return user._id !== filter._id.$ne
        if (filter.$or) return filter.$or.some((condition) => {
            const [field, expression] = Object.entries(condition)[0]
            return new RegExp(expression.$regex, expression.$options).test(user[field] || "")
        })
        return true
    })

    const app = express()
    app.use(express.json())
    app.use(cookieParser())
    app.use("/api/auth", authRouter)
    app.use("/api/user", userRouter)
    server = app.listen(0, "127.0.0.1")
    await new Promise((resolve) => server.once("listening", resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
    await new Promise((resolve) => server.close(resolve))
    for (const [name, method] of Object.entries(originalMethods)) User[name] = method
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalJwtSecret
})

test("auth and user endpoints return only public fields while preserving login and cookie session", async () => {
    assert.equal(User.schema.path("password").options.select, false)

    const signup = await request("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: "alice", email: "alice@example.test", password: "correct-password" }),
    })
    assert.equal(signup.response.status, 201)
    assertPublicUser(signup.body)
    assert.equal(signup.body.userName, "alice")
    assert.ok(signup.response.headers.get("set-cookie")?.includes("HttpOnly"))

    const wrongPassword = await request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alice@example.test", password: "wrong-password" }),
    })
    assert.equal(wrongPassword.response.status, 400)
    assert.deepEqual(wrongPassword.body, { message: "incorrect password" })
    assert.equal(wrongPassword.response.headers.get("set-cookie"), null)

    const login = await request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alice@example.test", password: "correct-password" }),
    })
    assert.equal(login.response.status, 200)
    assertPublicUser(login.body)
    assert.equal(selectedPasswordForLogin, true)
    const cookie = login.response.headers.get("set-cookie")?.split(";")[0]
    assert.ok(cookie)

    for (let i = 0; i < 2; i++) {
        const current = await request("/api/user/current", { headers: { Cookie: cookie } })
        assert.equal(current.response.status, 200)
        assertPublicUser(current.body)
        assert.equal(current.body._id, login.body._id)
    }

    const profile = await request("/api/user/profile", {
        method: "PUT",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice" }),
    })
    assert.equal(profile.response.status, 200)
    assertPublicUser(profile.body)
    assert.equal(profile.body.name, "Alice")

    users.push({ _id: "2", name: "Bob", userName: "bob", email: "bob@example.test", image: "", password: await bcrypt.hash("private-password", 4), __v: 0 })
    const others = await request("/api/user/others", { headers: { Cookie: cookie } })
    assert.equal(others.response.status, 200)
    assert.ok(Array.isArray(others.body))
    assert.equal(others.body.length, 1)
    assert.equal(others.body[0].userName, "bob")
    others.body.forEach(assertPublicUser)

    const search = await request("/api/user/search?query=bob", { headers: { Cookie: cookie } })
    assert.equal(search.response.status, 200)
    assert.ok(Array.isArray(search.body))
    assert.equal(search.body.length, 1)
    assert.equal(search.body[0].userName, "bob")
    search.body.forEach(assertPublicUser)
})

test("server errors do not serialize underlying authentication data", async () => {
    const missingCookie = await request("/api/user/others")
    assert.equal(missingCookie.response.status, 401)
    assert.deepEqual(missingCookie.body, { message: "token is not found" })

    const invalidCookie = await request("/api/user/current", { headers: { Cookie: "token=invalid-token" } })
    assert.equal(invalidCookie.response.status, 401)
    assert.deepEqual(invalidCookie.body, { message: "invalid token" })

    const originalFind = User.find
    User.find = async () => { throw new Error("password=secret token=secret") }
    try {
        const cookie = (await request("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "alice@example.test", password: "correct-password" }),
        })).response.headers.get("set-cookie")?.split(";")[0]
        const result = await request("/api/user/others", { headers: { Cookie: cookie } })
        assert.equal(result.response.status, 500)
        assert.deepEqual(result.body, { message: "get other users error" })
    } finally {
        User.find = originalFind
    }
})
