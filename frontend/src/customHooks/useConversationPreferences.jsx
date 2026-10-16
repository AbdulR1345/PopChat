import { useCallback, useContext, useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import axios from 'axios'
import SocketContext from '../context/SocketContext'
import { serverUrl } from '../main'
import { applyPreferenceForSession, setPreferenceLoadErrorForSession, setPreferencesForSession } from '../redux/userSlice'
import { reportApiError } from '../utils/reportApiError'

function useConversationPreferences() {
  const dispatch = useDispatch()
  const socket = useContext(SocketContext)
  const userId = useSelector(state => state.user.userData?._id)
  const authVersion = useSelector(state => state.user.authVersion)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!userId) return
    let controller
    let timer
    const refresh = async () => {
      controller?.abort()
      controller = new AbortController()
      const request = controller
      try {
        const response = await axios.get(`${serverUrl}/api/conversation/preferences`, {
          withCredentials: true, signal: request.signal,
        })
        if (!request.signal.aborted) dispatch(setPreferencesForSession({
          userId, authVersion, preferences: response.data.preferences,
        }))
      } catch (error) {
        if (!axios.isCancel(error)) {
          dispatch(setPreferenceLoadErrorForSession({ userId, authVersion }))
          reportApiError(error)
        }
      }
    }
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(refresh, 75)
    }
    refresh()
    socket?.on('conversationPreferenceUpdated', schedule)
    socket?.on('connect', schedule)
    return () => {
      window.clearTimeout(timer)
      controller?.abort()
      socket?.off('conversationPreferenceUpdated', schedule)
      socket?.off('connect', schedule)
    }
  }, [dispatch, socket, userId, authVersion, reloadKey])

  const updatePreference = useCallback(async (otherUserId, change) => {
    const response = await axios.put(`${serverUrl}/api/conversation/preferences/${otherUserId}`,
      change, { withCredentials: true })
    dispatch(applyPreferenceForSession({ userId, authVersion, preference: response.data }))
    return response.data
  }, [dispatch, userId, authVersion])
  return { updatePreference, retryPreferences: () => setReloadKey(value => value + 1) }
}

export default useConversationPreferences
