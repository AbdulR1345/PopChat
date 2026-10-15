import axios from "axios"
import { useContext, useEffect, useState } from "react"
import { serverUrl } from "../main"
import { useDispatch, useSelector } from "react-redux"
import { loadMessages } from "../redux/messageSlice"
import { reportApiError } from "../utils/reportApiError"
import SocketContext from "../context/SocketContext"

const useMessages=()=>{
    const dispatch=useDispatch()
    const socket=useContext(SocketContext)
    const [request,setRequest]=useState({conversationId:null,loading:false})
    const userId=useSelector(state=>state.user.userData?._id)
    const selectedUserId=useSelector(state=>state.user.selectedUser?._id)
    useEffect(()=>{
        if(!userId || !selectedUserId) return

        let controller
        let active=true
        const fetchMessages=async ()=>{
            controller?.abort()
            controller=new AbortController()
            const currentController=controller
            setRequest({conversationId:selectedUserId,loading:true})
            try {
                const result=await axios.get(`${serverUrl}/api/message/get/${selectedUserId}`,{
                    withCredentials:true,
                    signal:currentController.signal
                })
                if(active && !currentController.signal.aborted){
                    dispatch(loadMessages({conversationId:selectedUserId,messages:result.data}))
                }
            } catch (error) {
                if(!axios.isCancel(error)) reportApiError(error)
            } finally {
                if(active && !currentController.signal.aborted) setRequest({conversationId:selectedUserId,loading:false})
            }
        }
        fetchMessages()
        socket?.on("connect",fetchMessages)
        return ()=>{
            active=false
            controller?.abort()
            socket?.off("connect",fetchMessages)
        }
    },[dispatch,selectedUserId,userId,socket])
    return Boolean(selectedUserId && (request.conversationId!==selectedUserId || request.loading))
}

export default useMessages
