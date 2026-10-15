import uploadOnCloudinary from "../config/cloudinary.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { getReceiverSocketIds, io } from "../socket/socket.js";

export const sendMessage=async (req,res)=>{
    try {
        let sender=req.userId
        let {receiver}=req.params
        let {message}=req.body ?? {}

        if (!/^[a-f\d]{24}$/i.test(receiver) || receiver === sender) {
            return res.status(400).json({message:"invalid receiver"})
        }
        if (typeof message !== "string" && message !== undefined) {
            return res.status(400).json({message:"invalid message"})
        }
        if (message?.length > 10000 || (!message?.trim() && !req.file)) {
            return res.status(400).json({message:"message or image is required"})
        }
        if (!await User.exists({ _id: receiver })) {
            return res.status(404).json({message:"receiver not found"})
        }

        let image;
        if(req.file){
            image=await uploadOnCloudinary(req.file.buffer)
        }

        let conversation=await Conversation.findOne({
            partcipants:{$all:[sender,receiver],$size:2}
        })

        let newMessage=await Message.create({
            sender,receiver,message,image
        })

        if(!conversation){
            conversation=await Conversation.create({
                partcipants:[sender,receiver],
                messages:[newMessage._id]
            })
        }else{
            conversation.messages.push(newMessage._id)
            await conversation.save()
        }

        const receiverSocketIds=getReceiverSocketIds(receiver)
if(receiverSocketIds.length){
    io.to(receiverSocketIds).emit("newMessage",newMessage)
}


        
        return res.status(201).json(newMessage)
    
    } catch (error) {
        return res.status(500).json({message:"send message error"})
    }
}

export const getMessages=async (req,res)=>{
    try {
        let sender=req.userId
        let {receiver}=req.params
        if (!/^[a-f\d]{24}$/i.test(receiver) || receiver === sender) {
            return res.status(400).json({message:"invalid receiver"})
        }
        let conversation=await Conversation.findOne({
            partcipants:{$all:[sender,receiver],$size:2}
        }).populate("messages")

        return res.status(200).json(conversation?.messages ?? [])
    } catch (error) {
        return res.status(500).json({message:"get message error"})
    }
}
