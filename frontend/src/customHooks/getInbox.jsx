import { useContext, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import axios from 'axios'
import SocketContext from '../context/SocketContext'
import { serverUrl } from '../main'
import { setInboxForSession } from '../redux/userSlice'
import { reportApiError } from '../utils/reportApiError'

function useGetInbox() {
  const dispatch = useDispatch()
  const socket = useContext(SocketContext)
  const userId = useSelector(state => state.user.userData?._id)
  const authVersion = useSelector(state => state.user.authVersion)

  useEffect(() => {
    if (!userId) return
    let controller
    let timer
    const fetchInbox = async () => {
      controller?.abort()
      controller = new AbortController()
      const currentController = controller
      try {
        const result = await axios.get(`${serverUrl}/api/message/inbox`, {
          withCredentials: true, signal: currentController.signal,
        })
        if (!currentController.signal.aborted) {
          dispatch(setInboxForSession({ userId, authVersion, inbox: result.data }))
        }
      } catch (error) {
        if (!axios.isCancel(error)) reportApiError(error)
      }
    }
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(fetchInbox, 75)
    }
    fetchInbox()
    socket?.on('inboxUpdated', schedule)
    socket?.on('connect', schedule)
    return () => {
      window.clearTimeout(timer)
      controller?.abort()
      socket?.off('inboxUpdated', schedule)
      socket?.off('connect', schedule)
    }
  }, [dispatch, socket, userId, authVersion])
}

export default useGetInbox
