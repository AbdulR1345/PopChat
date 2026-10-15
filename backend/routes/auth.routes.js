import express from "express"
import { login, logOut, signUp } from "../controllers/auth.controllers.js"
import { verifyLegacyLogoutOrigin } from "../config/origin.js"

const authRouter=express.Router()

authRouter.post("/signup",signUp)
authRouter.post("/login",login)
authRouter.post("/logout",logOut)
authRouter.get("/logout",verifyLegacyLogoutOrigin,logOut)

export default authRouter
