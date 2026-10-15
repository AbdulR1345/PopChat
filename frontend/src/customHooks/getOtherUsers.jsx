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
        const controller=new AbortController()
        const fetchUser=async ()=>{
            try {
                const result=await axios.get(`${serverUrl}/api/user/others`,{
                    withCredentials:true,
                    signal:controller.signal
                })
                if(!controller.signal.aborted){
                    dispatch(setOtherUsersForSession({userId,authVersion,users:result.data}))
                }
            } catch (error) {
                if(!axios.isCancel(error)) reportApiError(error)
            }
        }
        fetchUser()
        return ()=>controller.abort()
    },[dispatch,userId,authVersion])
}

export default useGetOtherUsers
