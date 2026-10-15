import { useContext, useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import axios from 'axios'
import EmojiPicker from 'emoji-picker-react'
import { FiArrowLeft, FiImage, FiInfo, FiSend, FiSmile, FiX } from 'react-icons/fi'
import Avatar from './Avatar'
import SenderMessage from './SenderMessage'
import ReceiverMessage from './ReceiverMessage'
import { setLastSentMessage, setSelectedUser } from '../redux/userSlice'
import { appendMessage } from '../redux/messageSlice'
import SocketContext from '../context/SocketContext'
import { serverUrl } from '../main'
import useReadReceipts from '../customHooks/useReadReceipts'

function MessageArea({ loadingMessages, onOpenDetails }) {
  const { selectedUser, userData, onlineUsers, typingUsers } = useSelector(state => state.user)
  const { messages } = useSelector(state => state.message)
  const selectedUserId = selectedUser?._id
  const userId = userData?._id
  const socket = useContext(SocketContext)
  const dispatch = useDispatch()
  const fileInput = useRef(null)
  const bottom = useRef(null)
  const messageScroll = useRef(null)
  const wasAtBottom = useRef(true)
  const typingTimer = useRef(null)
  const lastTypingSent = useRef(0)
  const pendingClientMessageId = useRef(null)
  const [showPicker, setShowPicker] = useState(false)
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [preview, setPreview] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const isTyping = Boolean(typingUsers[selectedUserId])
  const lastMessageId = messages.at(-1)?._id
  useReadReceipts({ selectedUserId, userId, messages, scrollRef: messageScroll })
  useEffect(() => {
    if (wasAtBottom.current) bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lastMessageId, selectedUserId])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => () => {
    window.clearTimeout(typingTimer.current)
    if (socket && selectedUserId) socket.emit('typing:stop', { recipientId: selectedUserId })
  }, [socket, selectedUserId])

  const stopTyping = () => {
    window.clearTimeout(typingTimer.current)
    if (socket && selectedUserId) socket.emit('typing:stop', { recipientId: selectedUserId })
    lastTypingSent.current = 0
  }

  const signalTyping = () => {
    if (!socket || !selectedUserId) return
    const now = Date.now()
    if (now - lastTypingSent.current > 1500) {
      socket.emit('typing:start', { recipientId: selectedUserId })
      lastTypingSent.current = now
    }
    window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(stopTyping, 1300)
  }

  const handleImage = event => {
    const file = event.target.files?.[0]
    if (!file) return
    setAttachment(file)
    setPreview(URL.createObjectURL(file))
    setSendError('')
    pendingClientMessageId.current = null
  }

  const clearAttachment = () => {
    setAttachment(null)
    setPreview(null)
    pendingClientMessageId.current = null
    if (fileInput.current) fileInput.current.value = ''
  }

  const handleSendMessage = async event => {
    event.preventDefault()
    if (!selectedUserId || (!input.trim() && !attachment) || sending) return
    setSending(true)
    setSendError('')
    stopTyping()
    wasAtBottom.current = true
    try {
      const formData = new FormData()
      formData.append('message', input.trim())
      if (attachment) formData.append('image', attachment)
      pendingClientMessageId.current ||= crypto.randomUUID()
      formData.append('clientMessageId', pendingClientMessageId.current)
      const result = await axios.post(`${serverUrl}/api/message/send/${selectedUserId}`, formData, { withCredentials: true })
      dispatch(appendMessage({ conversationId: selectedUserId, message: result.data }))
      dispatch(setLastSentMessage(result.data))
      setInput('')
      clearAttachment()
      setShowPicker(false)
    } catch (error) {
      setSendError(error?.response?.data?.message || 'Message could not be sent. Please try again.')
    } finally { setSending(false) }
  }

  const isOnline = onlineUsers?.includes(selectedUserId)

  const handleInputChange = event => {
    const next = event.target.value
    setInput(next)
    setSendError('')
    pendingClientMessageId.current = null
    if (next.trim()) signalTyping()
    else stopTyping()
  }

  return <section className={`message-area ${selectedUser ? 'message-area-open' : ''}`} aria-label="Chat">
    {selectedUser ? <>
      <header className="chat-header">
        <button className="icon-button mobile-back" type="button" aria-label="Back to conversations" onClick={() => dispatch(setSelectedUser(null))}><FiArrowLeft /></button>
        <Avatar user={selectedUser} online={isOnline} size="medium" />
        <div className="chat-header-copy"><strong>{selectedUser.name || selectedUser.userName}</strong><span className={isTyping || isOnline ? 'status-online' : ''}>{isTyping ? 'Typing…' : isOnline ? 'Active now' : 'Offline'}</span></div>
        <button className="icon-button details-toggle" type="button" aria-label="Show contact details" title="Contact details" onClick={onOpenDetails}><FiInfo /></button>
      </header>
      <div className="message-scroll" ref={messageScroll} role="log" aria-label="Messages" onScroll={event => {
        const element = event.currentTarget
        wasAtBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
      }}>
        <div className="conversation-marker"><span>CONVERSATION</span></div>
        {loadingMessages && messages.length === 0 && <div className="chat-state">Loading messages…</div>}
        {!loadingMessages && messages.length === 0 && <div className="chat-empty"><div className="empty-orb"><FiSmile /></div><h2>Start a conversation</h2><p>Send a message to {selectedUser.name || selectedUser.userName}.</p></div>}
        {messages.map(message => message.sender === userId
          ? <SenderMessage key={message._id} image={message.image} message={message.message} date={message.createdAt} deliveredAt={message.deliveredAt} readAt={message.readAt} />
          : <ReceiverMessage key={message._id} id={message._id} image={message.image} message={message.message} date={message.createdAt} />)}
        {isTyping && <div className="typing-indicator" aria-label={`${selectedUser.name || selectedUser.userName} is typing`}><Avatar user={selectedUser} size="tiny" /><span className="typing-dots"><i /><i /><i /></span></div>}
        <div ref={bottom} />
      </div>
      <div className="composer-wrap">
        {preview && <div className="attachment-preview"><img src={preview} alt="Selected attachment" /><span>{attachment?.name}</span><button type="button" className="icon-button" aria-label="Remove attachment" onClick={clearAttachment}><FiX /></button></div>}
        {sendError && <p className="form-error composer-error" role="alert">{sendError}</p>}
        {showPicker && <div className="emoji-popover"><EmojiPicker width={300} height={350} theme="dark" onEmojiClick={emoji => { setInput(current => current + emoji.emoji); pendingClientMessageId.current = null; signalTyping(); setShowPicker(false) }} /></div>}
        <form className="composer" onSubmit={handleSendMessage}>
          <button className="composer-icon" type="button" aria-label="Choose emoji" title="Choose emoji" disabled={sending} onClick={() => setShowPicker(open => !open)}><FiSmile /></button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleImage} />
          <button className="composer-icon" type="button" aria-label="Attach image" title="Attach image" disabled={sending} onClick={() => fileInput.current?.click()}><FiImage /></button>
          <input className="message-input" type="text" placeholder="Write a message…" aria-label="Write a message" value={input} disabled={sending} onChange={handleInputChange} />
          <button className="send-button" type="submit" aria-label="Send message" disabled={sending || (!input.trim() && !attachment)}><FiSend /></button>
        </form>
      </div>
    </> : <div className="welcome-state"><div className="welcome-icon"><FiSend /></div><span className="eyebrow">YOUR SPACE TO CONNECT</span><h2>Welcome to PopChat</h2><p>Choose someone from your conversations to start chatting.</p></div>}
  </section>
}

export default MessageArea
