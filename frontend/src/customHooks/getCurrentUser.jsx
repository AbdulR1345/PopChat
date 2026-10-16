import axios from "axios"
import { useEffect, useRef } from "react"
import { serverUrl } from "../main"
import { useDispatch, useSelector } from "react-redux"
import { finishSessionCheck, setCurrentUser } from "../redux/userSlice"
import { reportApiError } from "../utils/reportApiError"

const useGetCurrentUser=()=>{
    const dispatch=useDispatch()
    const authVersion=useSelector(state=>state.user.authVersion)
    const initialAuthVersion=useRef(authVersion).current
    useEffect(()=>{
        const controller=new AbortController()
        const fetchUser=async ()=>{
            try {
                const result=await axios.get(`${serverUrl}/api/user/current`,{
                    withCredentials:true,
                    signal:controller.signal
                })
                if(!controller.signal.aborted){
                    dispatch(setCurrentUser({userData:result.data,authVersion:initialAuthVersion}))
                }
            } catch (error) {
                if(!controller.signal.aborted && !axios.isCancel(error)) {
                    if(error?.response?.status !== 401) reportApiError(error)
                    dispatch(finishSessionCheck(initialAuthVersion))
                }
            }
        }
        fetchUser()
        return ()=>controller.abort()
    },[dispatch,initialAuthVersion])
}

export default useGetCurrentUser
