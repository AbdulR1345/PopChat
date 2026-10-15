import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { io } from 'socket.io-client'
import { serverUrl } from '../main'
import { setOnlineUsers, setUserData } from '../redux/userSlice'
import SocketContext from './SocketContext'

function SocketProvider({ children }) {
  const userId = useSelector(state => state.user.userData?._id)
  const dispatch = useDispatch()
  const [connection, setConnection] = useState(null)

  useEffect(() => {
    if (!userId) return

    const socket = io(serverUrl, { withCredentials: true })
    const handleOnlineUsers = users => dispatch(setOnlineUsers(users))
    const handleDisconnect = reason => {
      dispatch(setOnlineUsers([]))
      if (reason === 'io server disconnect') dispatch(setUserData(null))
    }

    socket.on('getOnlineUsers', handleOnlineUsers)
    socket.on('disconnect', handleDisconnect)
    setConnection({ userId, socket })

    return () => {
      socket.off('getOnlineUsers', handleOnlineUsers)
      socket.off('disconnect', handleDisconnect)
      socket.disconnect()
      dispatch(setOnlineUsers([]))
    }
  }, [dispatch, userId])

  return (
    <SocketContext.Provider value={connection !== null && connection.userId === userId ? connection.socket : null}>
      {children}
    </SocketContext.Provider>
  )
}

export default SocketProvider
