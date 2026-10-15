import uploadOnCloudinary from "../config/cloudinary.js"
import User from "../models/user.model.js"
import publicUser, { ownUser } from "../utils/publicUser.js"

// 120 characters accommodates existing display names while bounding new input.
export const MAX_DISPLAY_NAME_LENGTH = 120
const AVAILABILITY = new Set(["available", "busy", "away"])

export const profileChanges = (body = {}) => {
    const changes = {}
    if (body.name !== undefined) {
        if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > MAX_DISPLAY_NAME_LENGTH) {
            return { error: `display name must be 1-${MAX_DISPLAY_NAME_LENGTH} characters` }
        }
        changes.name = body.name.trim()
    }
    if (body.bio !== undefined) {
        if (typeof body.bio !== "string" || body.bio.trim().length > 160) {
            return { error: "bio must be at most 160 characters" }
        }
        changes.bio = body.bio.trim()
    }
    if (body.availability !== undefined) {
        if (typeof body.availability !== "string" || !AVAILABILITY.has(body.availability)) {
            return { error: "availability must be available, busy, or away" }
        }
        changes.availability = body.availability
    }
    return { changes }
}

export const getCurrentUser=async (req,res)=>{
try {
    let user=await User.findById(req.userId)
    if(!user){
        return res.status(400).json({message:"user not found"})
    }

    return res.status(200).json(ownUser(user))
} catch (error) {
    return res.status(500).json({message:"current user error"})
}
}

export const editProfile=async (req,res)=>{
    try {
        const { changes, error } = profileChanges(req.body ?? {})
        if (error) return res.status(400).json({ message: error })
        if(req.file){
            changes.image=await uploadOnCloudinary(req.file.buffer)
        }
        let user=await User.findByIdAndUpdate(req.userId, changes, {new:true,runValidators:true})

        if(!user){
            return res.status(400).json({message:"user not found"})
        }

        return res.status(200).json(ownUser(user))
    } catch (error) {
        return res.status(500).json({message:"profile error"})
    }
}

export const getOtherUsers=async (req,res)=>{
    try {
        let users=await User.find({
            _id:{$ne:req.userId}
        })
        return res.status(200).json(users.map(publicUser))
    } catch (error) {
        return res.status(500).json({message:"get other users error"})
    }
}

export const search =async (req,res)=>{
    try {
        let {query}=req.query
        if(!query){
            return res.status(400).json({message:"query is required"})
        }
        let users=await User.find({
            $or:[
                {name:{$regex:query,$options:"i"}},
                {userName:{$regex:query,$options:"i"}},
            ]
        })
        return res.status(200).json(users.map(publicUser))
    } catch (error) {
        return res.status(500).json({message:"search users error"})
    }
}
