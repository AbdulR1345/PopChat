import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import express from "express"
import cookieParser from "cookie-parser"
import bcrypt from "bcryptjs"
import { Writable } from "node:stream"
import { v2 as cloudinary } from "cloudinary"
import User from "../models/user.model.js"
import authRouter from "../routes/auth.routes.js"
import userRouter from "../routes/user.routes.js"

const originalMethods = Object.fromEntries(
    ["findOne", "findById", "findByIdAndUpdate", "find", "create", "exists"].map((name) => [name, User[name]])
)
const originalJwtSecret = process.env.JWT_SECRET
const users = []
const originalUploadStream = cloudinary.uploader.upload_stream
let selectedPasswordForLogin = false
let sessionCookie
let lastUpdate
let server
let baseUrl

const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, options)
    return { response, body: await response.json() }
}

const assertPublicUser = (user) => {
    assert.deepEqual(Object.keys(user).sort(), ["_id", "image", "userName", "bio", "availability"].concat(user.name === undefined ? [] : ["name"]).sort())
    assert.equal(user.email, undefined)
    assert.equal(user.password, undefined)
    assert.equal(user.token, undefined)
}
const assertOwnUser = (user) => {
    const { email, ...publicFields } = user
    assertPublicUser(publicFields)
    assert.equal(email, "alice@example.test")
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
    User.findByIdAndUpdate = async (id, fields, options) => {
        lastUpdate = { id, fields, options }
        const user = users.find((item) => item._id === id)
        if (user) Object.assign(user, fields)
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
    cloudinary.uploader.upload_stream = originalUploadStream
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalJwtSecret
})

test("auth and current-user endpoints retain own email and cookie session", async () => {
    assert.equal(User.schema.path("password").options.select, false)

    const signup = await request("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: "alice", email: "alice@example.test", password: "correct-password" }),
    })
    assert.equal(signup.response.status, 201)
    assertOwnUser(signup.body)
    assert.equal(signup.body.bio, "")
    assert.equal(signup.body.availability, "available")
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
    assertOwnUser(login.body)
    assert.equal(selectedPasswordForLogin, true)
    const cookie = login.response.headers.get("set-cookie")?.split(";")[0]
    assert.ok(cookie)
    sessionCookie = cookie

    for (let i = 0; i < 2; i++) {
        const current = await request("/api/user/current", { headers: { Cookie: cookie } })
        assert.equal(current.response.status, 200)
        assertOwnUser(current.body)
        assert.equal(current.body._id, login.body._id)
    }

    const profile = await request("/api/user/profile", {
        method: "PUT",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice" }),
    })
    assert.equal(profile.response.status, 200)
    assertOwnUser(profile.body)
    assert.equal(profile.body.name, "Alice")
    assert.equal(lastUpdate.id, "1")
    assert.equal(lastUpdate.options.runValidators, true)

    users.push({ _id: "2", name: "Bob", userName: "bob", email: "bob@example.test", image: "", password: await bcrypt.hash("private-password", 4), token: "private-token", __v: 0 })
    const others = await request("/api/user/others", { headers: { Cookie: cookie } })
    assert.equal(others.response.status, 200)
    assert.ok(Array.isArray(others.body))
    assert.equal(others.body.length, 1)
    assert.equal(others.body[0].userName, "bob")
    others.body.forEach(assertPublicUser)
    assert.equal(others.body[0].bio, "")
    assert.equal(others.body[0].availability, "available")

    const search = await request("/api/user/search?query=bob", { headers: { Cookie: cookie } })
    assert.equal(search.response.status, 200)
    assert.ok(Array.isArray(search.body))
    assert.equal(search.body.length, 1)
    assert.equal(search.body[0].userName, "bob")
    search.body.forEach(assertPublicUser)
})

test("bio, availability and display name validate before account update", async () => {
    const update = async (body, authenticated = true) => request("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(authenticated ? { Cookie: sessionCookie } : {}) },
        body: JSON.stringify(body),
    })
    const before = users[0].bio
    const unauthorized = await update({ name: "Intruder" }, false)
    assert.equal(unauthorized.response.status, 401)
    assert.equal(users[0].name, "Alice")

    for (const body of [
        { bio: "a".repeat(161) }, { bio: 42 }, { availability: "offline" },
        { availability: null }, { name: "  " }, { name: 42 }, { name: "a".repeat(121) },
    ]) {
        const result = await update(body)
        assert.equal(result.response.status, 400)
        assert.equal(typeof result.body.message, "string")
        assert.equal(users[0].bio, before)
    }
    for (const availability of ["available", "busy", "away"]) {
        const result = await update({ name: "  Alice Smith  ", bio: "  hello  ", availability, email: "stolen@example.test", userId: "2" })
        assert.equal(result.response.status, 200)
        assertOwnUser(result.body)
        assert.equal(result.body.name, "Alice Smith")
        assert.equal(result.body.bio, "hello")
        assert.equal(result.body.availability, availability)
        assert.equal(users[0].email, "alice@example.test")
        assert.equal(users[1].name, "Bob")
        assert.equal(lastUpdate.id, "1")
    }
    const cleared = await update({ bio: "" })
    assert.equal(cleared.response.status, 200)
    assert.equal(cleared.body.bio, "")
})

test("schema accepts legacy profiles and enforces bio and availability", () => {
    const legacy = new User({ userName: "legacy", email: "legacy@example.test", password: "hash" })
    assert.equal(legacy.validateSync(), undefined)
    assert.equal(legacy.bio, "")
    assert.equal(legacy.availability, "available")
    legacy.bio = "a".repeat(161)
    assert.ok(legacy.validateSync()?.errors.bio)
    legacy.bio = "  short  "
    legacy.availability = "offline"
    assert.ok(legacy.validateSync()?.errors.availability)
    legacy.availability = "away"
    assert.equal(legacy.validateSync(), undefined)
    assert.equal(legacy.bio, "short")
})

test("profile image update still uses the authenticated upload path", async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    let bytes = 0
    cloudinary.uploader.upload_stream = (options, callback) => new Writable({
        write(chunk, encoding, done) { bytes += chunk.length; done() },
        final(done) { callback(null, { secure_url: "https://res.cloudinary.com/test/avatar.png" }); done() },
    })
    try {
        const body = new FormData()
        body.set("name", "Alice")
        body.set("bio", "Photo updated")
        body.set("image", new Blob([png], { type: "image/png" }), "avatar.png")
        const result = await request("/api/user/profile", { method: "PUT", headers: { Cookie: sessionCookie }, body })
        assert.equal(result.response.status, 200)
        assert.equal(bytes, png.length)
        assert.equal(result.body.image, "https://res.cloudinary.com/test/avatar.png")
        assertOwnUser(result.body)
    } finally {
        cloudinary.uploader.upload_stream = originalUploadStream
    }
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
