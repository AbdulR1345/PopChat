import { createSlice } from "@reduxjs/toolkit";
import { setSelectedUser, setUserData } from "./userSlice.js";

const messageSlice=createSlice({
   name:"message",
   initialState:{
    messages:[],
    conversationId:null
   },  
   reducers:{
    loadMessages:(state,action)=>{
      if(state.conversationId!==action.payload.conversationId) return
      const fetched=Array.isArray(action.payload.messages)?action.payload.messages:[]
      const fetchedIds=new Set(fetched.map(message=>message._id))
      state.messages=[...fetched,...state.messages.filter(message=>!fetchedIds.has(message._id))]
    },
    appendMessage:(state,action)=>{
      if(state.conversationId!==action.payload.conversationId) return
      const message=action.payload.message
      if(!message || state.messages.some(existing=>existing._id===message._id)) return
      state.messages.push(message)
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
       if(!action.payload){
         state.conversationId=null
         state.messages=[]
       }
     })
   }
})

export const {loadMessages,appendMessage}=messageSlice.actions
export default messageSlice.reducer
