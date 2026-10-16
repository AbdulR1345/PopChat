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
    preferences:null,
    preferenceLoadError:false,
    typingUsers:{}
   },  
   reducers:{
    setUserData:(state,action)=>{
   if(!action.payload || state.userData?._id !== action.payload._id){
     state.authVersion++
     state.otherUsers=null
     state.searchData=null
     state.inbox=null
     state.preferences=null
     state.preferenceLoadError=false
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
        const current=users.find(user=>user._id===state.selectedUser?._id)
        if(current) state.selectedUser=current
        if(state.searchData){
          const byId=new Map(users.map(user=>[user._id,user]))
          state.searchData=state.searchData.map(user=>byId.get(user._id) ?? user)
        }
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
        state.inbox=(Array.isArray(inbox)?inbox:[]).map(summary=>{
          const current=state.inbox?.find(item=>String(item.userId)===String(summary.userId))?.lastMessage
          const incoming=summary.lastMessage
          if(!current || !incoming || current._id!==incoming._id) return summary
          const currentRevision=Number(current.revision ?? current.__v ?? 0)
          const incomingRevision=Number(incoming.revision ?? incoming.__v ?? 0)
          if(currentRevision>incomingRevision || (currentRevision===incomingRevision && current.deletedAt && !incoming.deletedAt)){
            return {...summary,lastMessage:{...current,deliveredAt:incoming.deliveredAt || current.deliveredAt,readAt:incoming.readAt || current.readAt}}
          }
          return summary
        })
      }
    },
    setPreferencesForSession:(state,action)=>{
      const {userId,authVersion,preferences}=action.payload
      if(state.userData?._id!==userId || state.authVersion!==authVersion) return
      const next={...state.preferences}
      for(const item of Array.isArray(preferences)?preferences:[]){
        const id=String(item.otherUserId)
        if(!next[id] || Number(item.revision)>Number(next[id].revision)) next[id]=item
      }
      state.preferences=next
      state.preferenceLoadError=false
    },
    setPreferenceLoadErrorForSession:(state,action)=>{
      const {userId,authVersion}=action.payload
      if(state.userData?._id===userId && state.authVersion===authVersion) state.preferenceLoadError=true
    },
    applyPreferenceForSession:(state,action)=>{
      const {userId,authVersion,preference}=action.payload
      if(state.userData?._id!==userId || state.authVersion!==authVersion || !preference?.otherUserId) return
      state.preferences ||= {}
      const id=String(preference.otherUserId)
      if(!state.preferences[id] || Number(preference.revision)>Number(state.preferences[id].revision)){
        state.preferences[id]=preference
      }
    },
    setLastSentMessage:(state,action)=>{
      const message=action.payload
      if(!state.userData || String(message?.sender)!==state.userData._id) return
      const otherId=String(message.receiver)
      state.inbox ||= []
      const summary=state.inbox.find(item=>String(item.userId)===otherId)
      if(summary){
        if(summary.lastMessage?._id===message._id){
          const currentRevision=Number(summary.lastMessage.revision ?? summary.lastMessage.__v ?? 0)
          const incomingRevision=Number(message.revision ?? message.__v ?? 0)
          if(currentRevision>incomingRevision || (currentRevision===incomingRevision && summary.lastMessage.deletedAt && !message.deletedAt)) return
        }
        if(!summary.lastMessage || !summary.lastMessage.createdAt ||
          new Date(message.createdAt).getTime()>=new Date(summary.lastMessage.createdAt).getTime()){
          summary.lastMessage=message
        }
      }else{
        state.inbox.push({userId:otherId,lastMessage:message,unreadCount:0})
      }
    },
    applyInboxMessageUpdate:(state,action)=>{
      const message=action.payload
      if(!state.userData || !message?._id) return
      const otherId=String(message.sender)===state.userData._id ? String(message.receiver) : String(message.sender)
      const summary=state.inbox?.find(item=>String(item.userId)===otherId)
      if(summary?.lastMessage?._id!==message._id) return
      const current=summary.lastMessage
      if(Number(current.revision ?? current.__v ?? 0)>Number(message.revision ?? message.__v ?? 0)) return
      summary.lastMessage={...current,...message,deliveredAt:message.deliveredAt || current.deliveredAt,readAt:message.readAt || current.readAt}
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

export const {setUserData,setCurrentUser,setOtherUsersForSession,setSearchDataForSession,setInboxForSession,setPreferencesForSession,setPreferenceLoadErrorForSession,applyPreferenceForSession,setLastSentMessage,applyInboxMessageUpdate,setTypingUser,clearTypingUsers,setSelectedUser,setOnlineUsers}=userSlice.actions
export default userSlice.reducer
