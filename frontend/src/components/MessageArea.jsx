import { useContext, useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import axios from 'axios'
import EmojiPicker from 'emoji-picker-react'
import { FiArrowLeft, FiImage, FiInfo, FiSend, FiSmile, FiX } from 'react-icons/fi'
import Avatar from './Avatar'
import SenderMessage from './SenderMessage'
import ReceiverMessage from './ReceiverMessage'
import { setSelectedUser } from '../redux/userSlice'
import { appendMessage } from '../redux/messageSlice'
import SocketContext from '../context/SocketContext'
import { serverUrl } from '../main'

function MessageArea({ loadingMessages, onOpenDetails }) {
  const { selectedUser, userData, onlineUsers } = useSelector(state => state.user)
  const { messages } = useSelector(state => state.message)
  const selectedUserId = selectedUser?._id
  const userId = userData?._id
  const socket = useContext(SocketContext)
  const dispatch = useDispatch()
  const fileInput = useRef(null)
  const bottom = useRef(null)
  const [showPicker, setShowPicker] = useState(false)
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [preview, setPreview] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    if (!socket || !selectedUserId || !userId) return
    const handleNewMessage = message => {
      if (message.sender !== selectedUserId || message.receiver !== userId) return
      dispatch(appendMessage({ conversationId: selectedUserId, message }))
    }
    socket.on('newMessage', handleNewMessage)
    return () => socket.off('newMessage', handleNewMessage)
  }, [dispatch, socket, selectedUserId, userId])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, selectedUserId])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const handleImage = event => {
    const file = event.target.files?.[0]
    if (!file) return
    setAttachment(file)
    setPreview(URL.createObjectURL(file))
    setSendError('')
  }

  const clearAttachment = () => {
    setAttachment(null)
    setPreview(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const handleSendMessage = async event => {
    event.preventDefault()
    if (!selectedUserId || (!input.trim() && !attachment) || sending) return
    setSending(true)
    setSendError('')
    try {
      const formData = new FormData()
      formData.append('message', input.trim())
      if (attachment) formData.append('image', attachment)
      const result = await axios.post(`${serverUrl}/api/message/send/${selectedUserId}`, formData, { withCredentials: true })
      dispatch(appendMessage({ conversationId: selectedUserId, message: result.data }))
      setInput('')
      clearAttachment()
      setShowPicker(false)
    } catch (error) {
      setSendError(error?.response?.data?.message || 'Message could not be sent. Please try again.')
    } finally { setSending(false) }
  }

  const isOnline = onlineUsers?.includes(selectedUserId)

  return <section className={`message-area ${selectedUser ? 'message-area-open' : ''}`} aria-label="Chat">
    {selectedUser ? <>
      <header className="chat-header">
        <button className="icon-button mobile-back" type="button" aria-label="Back to conversations" onClick={() => dispatch(setSelectedUser(null))}><FiArrowLeft /></button>
        <Avatar user={selectedUser} online={isOnline} size="medium" />
        <div className="chat-header-copy"><strong>{selectedUser.name || selectedUser.userName}</strong><span className={isOnline ? 'status-online' : ''}>{isOnline ? 'Active now' : 'Offline'}</span></div>
        <button className="icon-button details-toggle" type="button" aria-label="Show contact details" title="Contact details" onClick={onOpenDetails}><FiInfo /></button>
      </header>
      <div className="message-scroll" role="log" aria-label="Messages">
        <div className="conversation-marker"><span>CONVERSATION</span></div>
        {loadingMessages && messages.length === 0 && <div className="chat-state">Loading messages…</div>}
        {!loadingMessages && messages.length === 0 && <div className="chat-empty"><div className="empty-orb"><FiSmile /></div><h2>Start a conversation</h2><p>Send a message to {selectedUser.name || selectedUser.userName}.</p></div>}
        {messages.map(message => message.sender === userId
          ? <SenderMessage key={message._id} image={message.image} message={message.message} date={message.createdAt} />
          : <ReceiverMessage key={message._id} image={message.image} message={message.message} date={message.createdAt} />)}
        <div ref={bottom} />
      </div>
      <div className="composer-wrap">
        {preview && <div className="attachment-preview"><img src={preview} alt="Selected attachment" /><span>{attachment?.name}</span><button type="button" className="icon-button" aria-label="Remove attachment" onClick={clearAttachment}><FiX /></button></div>}
        {sendError && <p className="form-error composer-error" role="alert">{sendError}</p>}
        {showPicker && <div className="emoji-popover"><EmojiPicker width={300} height={350} theme="dark" onEmojiClick={emoji => { setInput(current => current + emoji.emoji); setShowPicker(false) }} /></div>}
        <form className="composer" onSubmit={handleSendMessage}>
          <button className="composer-icon" type="button" aria-label="Choose emoji" title="Choose emoji" onClick={() => setShowPicker(open => !open)}><FiSmile /></button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleImage} />
          <button className="composer-icon" type="button" aria-label="Attach image" title="Attach image" onClick={() => fileInput.current?.click()}><FiImage /></button>
          <input className="message-input" type="text" placeholder="Write a message…" aria-label="Write a message" value={input} onChange={event => setInput(event.target.value)} />
          <button className="send-button" type="submit" aria-label="Send message" disabled={sending || (!input.trim() && !attachment)}><FiSend /></button>
        </form>
      </div>
    </> : <div className="welcome-state"><div className="welcome-icon"><FiSend /></div><span className="eyebrow">YOUR SPACE TO CONNECT</span><h2>Welcome to PopChat</h2><p>Choose someone from your conversations to start chatting.</p></div>}
  </section>
}

export default MessageArea
