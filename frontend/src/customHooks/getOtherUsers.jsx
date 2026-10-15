import axios from "axios"
import { useEffect } from "react"
import { serverUrl } from "../main"
import { useDispatch, useSelector } from "react-redux"
import { setOtherUsersForSession } from "../redux/userSlice"
import { reportApiError } from "../utils/reportApiError"

const useGetOtherUsers=()=>{
    const dispatch=useDispatch()
    const userId=useSelector(state=>state.user.userData?._id)
    const authVersion=useSelector(state=>state.user.authVersion)
    useEffect(()=>{
        if(!userId) return
        let controller
        const fetchUser=async ()=>{
            controller?.abort()
            controller=new AbortController()
            const request=controller
            try {
                const result=await axios.get(`${serverUrl}/api/user/others`,{
                    withCredentials:true,
                    signal:request.signal
                })
                if(!request.signal.aborted){
                    dispatch(setOtherUsersForSession({userId,authVersion,users:result.data}))
                }
            } catch (error) {
                if(!axios.isCancel(error)) reportApiError(error)
            }
        }
        fetchUser()
        const refreshOnFocus=()=>{ if(document.visibilityState==='visible') void fetchUser() }
        window.addEventListener('focus',refreshOnFocus)
        return ()=>{controller?.abort();window.removeEventListener('focus',refreshOnFocus)}
    },[dispatch,userId,authVersion])
}

export default useGetOtherUsers
