import jwt from "jsonwebtoken"
import User from "../models/user.model.js"
const isAuth=async (req,res,next)=>{
    try {
        let token=req.cookies?.token
        if(!token){
            return res.status(401).json({message:"token is not found"})
        }

        let verifyToken=  jwt.verify(token,process.env.JWT_SECRET)
        if (typeof verifyToken !== "object" || typeof verifyToken.userId !== "string" ||
            !await User.exists({ _id: verifyToken.userId })) {
            return res.status(401).json({message:"invalid token"})
        }
        req.userId=verifyToken.userId
        next()


    } catch (error) {
        if(error instanceof jwt.JsonWebTokenError){
            return res.status(401).json({message:"invalid token"})
        }
        return res.status(500).json({message:"isauth error"})
    }
}

export default isAuth
