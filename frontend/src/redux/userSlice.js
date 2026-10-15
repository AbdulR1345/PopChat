import { createSlice } from "@reduxjs/toolkit";

const userSlice=createSlice({
   name:"user",
   initialState:{
    userData:null,
    authVersion:0,
    otherUsers:null,
    selectedUser:null,
    onlineUsers:[],
    searchData:null,
    inbox:null,
    typingUsers:{}
   },  
   reducers:{
    setUserData:(state,action)=>{
   if(!action.payload || state.userData?._id !== action.payload._id){
     state.authVersion++
     state.otherUsers=null
     state.searchData=null
     state.inbox=null
     state.typingUsers={}
     state.selectedUser=null
   }
   state.userData=action.payload
   if(!action.payload){
     state.selectedUser=null
     state.onlineUsers=[]
     state.typingUsers={}
   }
    },
    setCurrentUser:(state,action)=>{
      if(state.authVersion===action.payload.authVersion && !state.userData){
        state.authVersion++
        state.userData=action.payload.userData
      }
    },
    setOtherUsersForSession:(state,action)=>{
      const {userId,authVersion,users}=action.payload
      if(state.userData?._id===userId && state.authVersion===authVersion){
        state.otherUsers=users
      }
    },
    setSearchDataForSession:(state,action)=>{
      const {userId,authVersion,users}=action.payload
      if(state.userData?._id===userId && state.authVersion===authVersion){
        state.searchData=users
      }
    },
    setInboxForSession:(state,action)=>{
      const {userId,authVersion,inbox}=action.payload
      if(state.userData?._id===userId && state.authVersion===authVersion){
        state.inbox=Array.isArray(inbox)?inbox:[]
      }
    },
    setLastSentMessage:(state,action)=>{
      const message=action.payload
      if(!state.userData || String(message?.sender)!==state.userData._id) return
      const otherId=String(message.receiver)
      state.inbox ||= []
      const summary=state.inbox.find(item=>String(item.userId)===otherId)
      if(summary){
        if(!summary.lastMessage || !summary.lastMessage.createdAt ||
          new Date(message.createdAt).getTime()>=new Date(summary.lastMessage.createdAt).getTime()){
          summary.lastMessage=message
        }
      }else{
        state.inbox.push({userId:otherId,lastMessage:message,unreadCount:0})
      }
    },
    setTypingUser:(state,action)=>{
      const {userId,typing}=action.payload
      if(!state.userData || !userId || userId===state.userData._id) return
      if(typing) state.typingUsers[userId]=true
      else delete state.typingUsers[userId]
    },
    clearTypingUsers:(state)=>{state.typingUsers={}},
       setSelectedUser:(state,action)=>{
         if(state.selectedUser?._id && state.selectedUser._id!==action.payload?._id){
           delete state.typingUsers[state.selectedUser._id]
         }
         state.selectedUser=action.payload
          }
          ,
             setOnlineUsers:(state,action)=>{
              state.onlineUsers=action.payload
               },
   }
})

export const {setUserData,setCurrentUser,setOtherUsersForSession,setSearchDataForSession,setInboxForSession,setLastSentMessage,setTypingUser,clearTypingUsers,setSelectedUser,setOnlineUsers}=userSlice.actions
export default userSlice.reducer
