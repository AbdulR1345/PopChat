import { createSlice } from "@reduxjs/toolkit";
import { setSelectedUser, setUserData } from "./userSlice.js";

const messageSlice=createSlice({
   name:"message",
   initialState:{
    messages:[],
    conversationId:null,
    ownerId:null
   },  
   reducers:{
    loadMessages:(state,action)=>{
      if(state.conversationId!==action.payload.conversationId) return
      const fetched=Array.isArray(action.payload.messages)?action.payload.messages:[]
      const fetchedIds=new Set(fetched.map(message=>message._id))
      const existing=new Map(state.messages.map(message=>[message._id,message]))
      state.messages=[...fetched.map(message=>{
        const current=existing.get(message._id)
        return current?{
          ...message,
          deliveredAt:message.deliveredAt || current.deliveredAt,
          readAt:message.readAt || current.readAt,
        }:message
      }),...state.messages.filter(message=>!fetchedIds.has(message._id))]
    },
    appendMessage:(state,action)=>{
      if(state.conversationId!==action.payload.conversationId) return
      const message=action.payload.message
      if(!message || state.messages.some(existing=>existing._id===message._id)) return
      state.messages.push(message)
    },
    updateMessageStatus:(state,action)=>{
      const {messageId,sender,receiver,deliveredAt,readAt}=action.payload
      const message=state.messages.find(item=>item._id===messageId &&
        String(item.sender)===sender && String(item.receiver)===receiver)
      if(!message) return
      if(deliveredAt) message.deliveredAt=deliveredAt
      if(readAt) message.readAt=readAt
    }
   },
   extraReducers:(builder)=>{
     builder.addCase(setSelectedUser,(state,action)=>{
       const conversationId=action.payload?._id ?? null
       if(state.conversationId!==conversationId){
         state.conversationId=conversationId
         state.messages=[]
       }
     })
     builder.addCase(setUserData,(state,action)=>{
       if(state.ownerId!==action.payload?._id){
         state.conversationId=null
         state.messages=[]
       }
       state.ownerId=action.payload?._id ?? null
     })
   }
})

export const {loadMessages,appendMessage,updateMessageStatus}=messageSlice.actions
export default messageSlice.reducer
