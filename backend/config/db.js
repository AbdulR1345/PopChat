import mongoose from "mongoose";

const connectDb =async ()=>{
    await mongoose.connect(process.env.MONGODB_URL)
    console.log("db connected")
}

export default connectDb
