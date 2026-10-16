import genToken from "../config/token.js"
import User from "../models/user.model.js"
import bcrypt from "bcryptjs"
import { ownUser } from "../utils/publicUser.js"
import { disconnectSocketsForToken } from "../socket/socket.js"
import { cookieOptions, clearCookieOptions } from "../config/cookie.js"
export const signUp=async (req,res)=>{
   try {
    const {userName,email,password}=req.body ?? {}
    if (typeof userName !== "string" || !userName.trim() ||
        typeof email !== "string" || !email.trim() ||
        typeof password !== "string") {
        return res.status(400).json({message:"invalid signup details"})
    }
    const checkUserByUserName=await User.findOne({userName})
    if(checkUserByUserName){
        return res.status(400).json({message:"account details unavailable"})
    }
    const checkUserByEmail=await User.findOne({email})
    if(checkUserByEmail){
        return res.status(400).json({message:"account details unavailable"})
    }
if(password.length<6){
    return res.status(400).json({message:"password must be at least 6 characters"})
}

const hashedPassword=await bcrypt.hash(password,10)

const user=await User.create({
    userName,email,password:hashedPassword
})

const token=await genToken(user._id)

res.cookie("token",token,cookieOptions())

   return res.status(201).json(ownUser(user))


   } catch (error) {
    return res.status(500).json({message:"signup error"})
   } 
}
export const login=async (req,res)=>{
    try {
     const {email,password}=req.body ?? {}
     if (typeof email !== "string" || typeof password !== "string") {
         return res.status(400).json({message:"invalid login details"})
     }
     const user=await User.findOne({email}).select("+password")
     if(!user){
         return res.status(400).json({message:"invalid credentials"})
     }

 const isMatch=await bcrypt.compare(password,user.password)
 if(!isMatch){
    return res.status(400).json({message:"invalid credentials"})
 }
 
 const token=await genToken(user._id)
 
 res.cookie("token",token,cookieOptions())
 
    return res.status(200).json(ownUser(user))
 
 
    } catch (error) {
     return res.status(500).json({message:"login error"})
    } 
 }

 export const logOut=async (req,res)=>{
    try {
        disconnectSocketsForToken(req.cookies?.token)
        res.clearCookie("token",clearCookieOptions())
        return res.status(200).json({message:"log out successfully"})
    } catch (error) {
        return res.status(500).json({message:"logout error"})
    }
 }
