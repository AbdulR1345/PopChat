import axios from "axios"
import { useEffect, useState } from "react"
import { serverUrl } from "../main"
import { useDispatch, useSelector } from "react-redux"
import { loadMessages } from "../redux/messageSlice"
import { reportApiError } from "../utils/reportApiError"

const useMessages=()=>{
    const dispatch=useDispatch()
    const [request,setRequest]=useState({conversationId:null,loading:false})
    const userId=useSelector(state=>state.user.userData?._id)
    const selectedUserId=useSelector(state=>state.user.selectedUser?._id)
    useEffect(()=>{
        if(!userId || !selectedUserId) return

        const controller=new AbortController()
        let active=true
        setRequest({conversationId:selectedUserId,loading:true})
        const fetchMessages=async ()=>{
            try {
                const result=await axios.get(`${serverUrl}/api/message/get/${selectedUserId}`,{
                    withCredentials:true,
                    signal:controller.signal
                })
                if(active){
                    dispatch(loadMessages({conversationId:selectedUserId,messages:result.data}))
                }
            } catch (error) {
                if(!axios.isCancel(error)) reportApiError(error)
            } finally {
                if(active) setRequest({conversationId:selectedUserId,loading:false})
            }
        }
        fetchMessages()
        return ()=>{
            active=false
            controller.abort()
        }
    },[dispatch,selectedUserId,userId])
    return Boolean(selectedUserId && (request.conversationId!==selectedUserId || request.loading))
}

export default useMessages
