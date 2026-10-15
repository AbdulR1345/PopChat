import mongoose from "mongoose";

const userSchema=new mongoose.Schema({
    name:{
        type:String,
    },
    userName:{
        type:String,
        required:true,
        unique:true
    },
    email:{
        type:String,
        required:true,
        unique:true
    },
    password:{
        type:String,
        required:true,
        select:false,
    },
    image:{
        type:String,
        default:""
    },
    bio:{
        type:String,
        trim:true,
        maxlength:160,
        default:""
    },
    availability:{
        type:String,
        enum:["available","busy","away"],
        default:"available"
    }
},{timestamps:true})

const User=mongoose.model("User",userSchema)

export default User
