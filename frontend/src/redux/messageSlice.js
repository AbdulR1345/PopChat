import { createSlice } from "@reduxjs/toolkit";
import { setSelectedUser, setUserData } from "./userSlice.js";

const revision = message => Number(message?.revision ?? message?.__v ?? 0)
const reconcile = (incoming, current) => {
  if (!current) return incoming
  const authoritative = revision(current) > revision(incoming) ||
    (revision(current) === revision(incoming) && current.deletedAt && !incoming.deletedAt) ? current : incoming
  return {
    ...authoritative,
    deliveredAt: incoming.deliveredAt || current.deliveredAt,
    readAt: incoming.readAt || current.readAt,
  }
}
const updateReplyPreviews = (messages, original) => {
  for (const item of messages) if (String(item.replyTo) === String(original._id)) {
    item.replyPreview = {
      _id: String(original._id), sender: String(original.sender),
      text: original.deletedAt ? 'This message was deleted' : original.message?.trim().slice(0, 120) || (original.image ? 'Photo' : 'Message unavailable'),
      deleted: Boolean(original.deletedAt),
    }
  }
}

const messageSlice=createSlice({
   name:"message",
   initialState:{
    messages:[],
    conversationId:null,
    ownerId:null,
    updates:{}
   },  
   reducers:{
    loadMessages:(state,action)=>{
      if(state.conversationId!==action.payload.conversationId) return
      const fetched=Array.isArray(action.payload.messages)?action.payload.messages:[]
      const fetchedIds=new Set(fetched.map(message=>message._id))
      const existing=new Map(state.messages.map(message=>[message._id,message]))
      state.messages=[...fetched.map(message=>
        reconcile(reconcile(message,existing.get(message._id)),state.updates[message._id])),
        ...state.messages.filter(message=>!fetchedIds.has(message._id))]
      for(const update of Object.values(state.updates)) updateReplyPreviews(state.messages,update)
    },
    appendMessage:(state,action)=>{
      if(state.conversationId!==action.payload.conversationId) return
      const message=action.payload.message
      if(!message) return
      const incoming=reconcile(message,state.updates[message._id])
      const index=state.messages.findIndex(existing=>existing._id===message._id)
      if(index<0) state.messages.push(incoming)
      else state.messages[index]=reconcile(incoming,state.messages[index])
    },
    applyMessageUpdate:(state,action)=>{
      const {conversationId,message}=action.payload
      if(state.conversationId!==conversationId || !message?._id) return
      const prior=state.updates[message._id]
      const current=state.messages.find(item=>item._id===message._id)
      const next=reconcile(reconcile(message,prior),current)
      state.updates[message._id]=next
      if(current) Object.assign(current,next)
      updateReplyPreviews(state.messages,next)
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
         state.updates={}
       }
     })
     builder.addCase(setUserData,(state,action)=>{
       if(state.ownerId!==action.payload?._id){
         state.conversationId=null
         state.messages=[]
         state.updates={}
       }
       state.ownerId=action.payload?._id ?? null
     })
   }
})

export const {loadMessages,appendMessage,applyMessageUpdate,updateMessageStatus}=messageSlice.actions
export default messageSlice.reducer
