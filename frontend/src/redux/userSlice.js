import { createSlice } from "@reduxjs/toolkit";

const userSlice=createSlice({
   name:"user",
   initialState:{
    userData:null,
    authVersion:0,
    otherUsers:null,
    selectedUser:null,
    onlineUsers:[],
    searchData:null
   },  
   reducers:{
    setUserData:(state,action)=>{
   if(!action.payload || state.userData?._id !== action.payload._id){
     state.authVersion++
     state.otherUsers=null
     state.searchData=null
   }
   state.userData=action.payload
   if(!action.payload){
     state.selectedUser=null
     state.onlineUsers=[]
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
       setSelectedUser:(state,action)=>{
         state.selectedUser=action.payload
          }
          ,
             setOnlineUsers:(state,action)=>{
              state.onlineUsers=action.payload
               },
   }
})

export const {setUserData,setCurrentUser,setOtherUsersForSession,setSearchDataForSession,setSelectedUser,setOnlineUsers}=userSlice.actions
export default userSlice.reducer
