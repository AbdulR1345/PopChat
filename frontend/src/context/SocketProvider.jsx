import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { io } from 'socket.io-client'
import { serverUrl } from '../main'
import { appendMessage, updateMessageStatus } from '../redux/messageSlice'
import { clearTypingUsers, setLastSentMessage, setOnlineUsers, setTypingUser, setUserData } from '../redux/userSlice'
import SocketContext from './SocketContext'

function SocketProvider({ children }) {
  const userId = useSelector(state => state.user.userData?._id)
  const dispatch = useDispatch()
  const [connection, setConnection] = useState(null)

  useEffect(() => {
    if (!userId) return

    const socket = io(serverUrl, { withCredentials: true })
    const typingTimers = new Map()
    const retryTimers = new Set()
    const handleOnlineUsers = users => dispatch(setOnlineUsers(users))
    const acknowledgeIds = (ids, attempt = 0) => {
      if (!ids.length || !socket.connected) return
      socket.timeout(5000).emit('messageDelivered', { messageIds: ids }, (error, response) => {
        if ((!error && response?.ok) || !socket.connected || attempt >= 2) return
        const timer = window.setTimeout(() => {
          retryTimers.delete(timer)
          acknowledgeIds(ids, attempt + 1)
        }, 700 * (attempt + 1))
        retryTimers.add(timer)
      })
    }
    const acknowledgeMessages = messages => {
      const ids = messages.filter(message => message.receiptVersion === 1).map(message => String(message._id))
      acknowledgeIds(ids)
    }
    const handleNewMessage = message => {
      if (String(message.receiver) !== userId) return
      dispatch(appendMessage({ conversationId: String(message.sender), message }))
      acknowledgeMessages([message])
    }
    const handlePendingMessages = messages => {
      if (!Array.isArray(messages)) return
      const incoming = messages.filter(message => String(message.receiver) === userId)
      for (const message of incoming) {
        dispatch(appendMessage({ conversationId: String(message.sender), message }))
      }
      acknowledgeMessages(incoming)
    }
    const handleMessageCreated = message => {
      if (String(message.sender) !== userId) return
      dispatch(appendMessage({ conversationId: String(message.receiver), message }))
      dispatch(setLastSentMessage(message))
    }
    const handleStatus = status => dispatch(updateMessageStatus(status))
    const stopTyping = ({ userId: otherId }) => {
      window.clearTimeout(typingTimers.get(otherId))
      typingTimers.delete(otherId)
      dispatch(setTypingUser({ userId: otherId, typing: false }))
    }
    const startTyping = ({ userId: otherId }) => {
      if (!otherId || otherId === userId) return
      window.clearTimeout(typingTimers.get(otherId))
      dispatch(setTypingUser({ userId: otherId, typing: true }))
      typingTimers.set(otherId, window.setTimeout(() => stopTyping({ userId: otherId }), 5000))
    }
    const clearTyping = () => {
      for (const timer of typingTimers.values()) window.clearTimeout(timer)
      typingTimers.clear()
      dispatch(clearTypingUsers())
    }
    const handleDisconnect = reason => {
      dispatch(setOnlineUsers([]))
      clearTyping()
      for (const timer of retryTimers) window.clearTimeout(timer)
      retryTimers.clear()
      if (reason === 'io server disconnect') dispatch(setUserData(null))
    }

    socket.on('getOnlineUsers', handleOnlineUsers)
    socket.on('newMessage', handleNewMessage)
    socket.on('pendingMessages', handlePendingMessages)
    socket.on('messageCreated', handleMessageCreated)
    socket.on('messageStatus', handleStatus)
    socket.on('typing:start', startTyping)
    socket.on('typing:stop', stopTyping)
    socket.on('disconnect', handleDisconnect)
    setConnection({ userId, socket })

    return () => {
      socket.off('getOnlineUsers', handleOnlineUsers)
      socket.off('newMessage', handleNewMessage)
      socket.off('pendingMessages', handlePendingMessages)
      socket.off('messageCreated', handleMessageCreated)
      socket.off('messageStatus', handleStatus)
      socket.off('typing:start', startTyping)
      socket.off('typing:stop', stopTyping)
      socket.off('disconnect', handleDisconnect)
      socket.disconnect()
      dispatch(setOnlineUsers([]))
      clearTyping()
      for (const timer of retryTimers) window.clearTimeout(timer)
      retryTimers.clear()
    }
  }, [dispatch, userId])

  return <SocketContext.Provider value={connection?.userId === userId ? connection.socket : null}>{children}</SocketContext.Provider>
}

export default SocketProvider
