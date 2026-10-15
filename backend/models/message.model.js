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
clientMessageId:{type:String},
reactions:[{_id:false,user:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},emoji:{type:String,required:true}}],
replyTo:{type:mongoose.Schema.Types.ObjectId,ref:"Message"},
editedAt:{type:Date},
deletedAt:{type:Date}


},{timestamps:true})

messageSchema.index({sender:1,receiver:1,createdAt:-1})
messageSchema.index({receiver:1,sender:1,receiptVersion:1,readAt:1})
messageSchema.index({receiver:1,receiptVersion:1,deliveredAt:1,createdAt:1})
messageSchema.index({sender:1,clientMessageId:1},{unique:true,partialFilterExpression:{clientMessageId:{$type:"string"}}})
// Both directions of a two-person media query use this equality prefix and cursor sort.
messageSchema.index({sender:1,receiver:1,createdAt:-1,_id:-1},{name:"shared_media_by_pair",partialFilterExpression:{image:{$gt:""}}})

const Message=mongoose.model("Message",messageSchema)
export default Message
