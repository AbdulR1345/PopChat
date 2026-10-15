import mongoose from "mongoose"
const messageSchema=new mongoose.Schema({
sender:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User",
    required:true
},
receiver:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User",
    required:true
},
message:{
    type:String,
    default:""
},
image:{
    type:String,
    default:""
},
// Receipt tracking starts with newly created messages. Historical messages
// have no version and are excluded from unread counts.
receiptVersion:{type:Number},
deliveredAt:{type:Date},
readAt:{type:Date},
clientMessageId:{type:String}


},{timestamps:true})

messageSchema.index({sender:1,receiver:1,createdAt:-1})
messageSchema.index({receiver:1,sender:1,receiptVersion:1,readAt:1})
messageSchema.index({receiver:1,receiptVersion:1,deliveredAt:1,createdAt:1})
messageSchema.index({sender:1,clientMessageId:1},{unique:true,partialFilterExpression:{clientMessageId:{$type:"string"}}})

const Message=mongoose.model("Message",messageSchema)
export default Message
