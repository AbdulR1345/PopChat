import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import axios from 'axios'
import { FiImage, FiUser, FiX } from 'react-icons/fi'
import Avatar from './Avatar'
import SocketContext from '../context/SocketContext'
import { serverUrl } from '../main'
import { contactProfile } from '../utils/profile'

function MediaThumbnail({ item, onOpen }) {
  const [failed, setFailed] = useState(false)
  return <button className="media-thumb" type="button" onClick={() => onOpen(item)} disabled={failed} aria-label={`Open image shared ${new Date(item.createdAt).toLocaleString()}`}>
    {failed ? <span>Image unavailable</span> : <img src={item.image} alt="Shared in this conversation" loading="lazy" onError={() => setFailed(true)} />}
  </button>
}

function ContactDetails({ open, onClose }) {
  const { selectedUser, onlineUsers, userData } = useSelector(state => state.user)
  const messages = useSelector(state => state.message.messages)
  const socket = useContext(SocketContext)
  const otherId = selectedUser?._id
  const userId = userData?._id
  const controller = useRef(null)
  const deletedIds = useRef(new Set())
  deletedIds.current = new Set(messages.filter(item => item.deletedAt).map(item => String(item._id)))
  const closeButton = useRef(null)
  const [media, setMedia] = useState({ conversationId: null, items: [], nextCursor: null, loading: false, error: '' })
  const [viewer, setViewer] = useState(null)
  const [viewerFailed, setViewerFailed] = useState(false)
  const isOnline = onlineUsers?.includes(otherId)

  const fetchMedia = useCallback(async (cursor = null) => {
    if (!userId || !otherId) return
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setMedia(previous => ({
      conversationId: otherId,
      items: cursor && previous.conversationId === otherId ? previous.items : [],
      nextCursor: cursor,
      loading: true,
      error: '',
    }))
    try {
      const result = await axios.get(`${serverUrl}/api/message/media/${otherId}`, {
        withCredentials: true, signal: request.signal,
        params: { limit: 24, ...(cursor ? { cursor } : {}) },
      })
      if (request.signal.aborted) return
      setMedia(previous => {
        const items = cursor && previous.conversationId === otherId ? previous.items : []
        const seen = new Set(items.map(item => item._id))
        return {
          conversationId: otherId,
          items: [...items, ...result.data.items.filter(item => !seen.has(item._id) && !deletedIds.current.has(String(item._id)))],
          nextCursor: result.data.nextCursor,
          loading: false,
          error: '',
        }
      })
    } catch (error) {
      if (!axios.isCancel(error) && !request.signal.aborted) {
        setMedia(previous => ({ ...previous, loading: false, error: 'Shared images could not be loaded.' }))
      }
    }
  }, [otherId, userId])

  useEffect(() => {
    setViewer(null)
    if (otherId) void fetchMedia()
    return () => controller.current?.abort()
  }, [otherId, fetchMedia])

  useEffect(() => {
    if (!socket || !otherId || !userId) return
    const belongs = item => item && [String(item.sender), String(item.receiver)].sort().join(':') === [String(userId), String(otherId)].sort().join(':')
    const created = item => { if (belongs(item) && item.image && !item.deletedAt) void fetchMedia() }
    const updated = item => {
      if (!belongs(item) || !item.deletedAt) return
      setViewer(current => current?._id === item._id ? null : current)
      void fetchMedia()
    }
    const reconnect = () => { void fetchMedia() }
    socket.on('newMessage', created)
    socket.on('messageCreated', created)
    socket.on('messageUpdated', updated)
    socket.on('connect', reconnect)
    return () => {
      socket.off('newMessage', created)
      socket.off('messageCreated', created)
      socket.off('messageUpdated', updated)
      socket.off('connect', reconnect)
    }
  }, [socket, otherId, userId, fetchMedia])

  useEffect(() => {
    if (!viewer) return
    closeButton.current?.focus()
    const keydown = event => {
      if (event.key === 'Escape') setViewer(null)
      if (event.key === 'Tab') { event.preventDefault(); closeButton.current?.focus() }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [viewer])

  useEffect(() => {
    const deleted = new Set(messages.filter(item => item.deletedAt).map(item => String(item._id)))
    if (!deleted.size) return
    setMedia(previous => previous.conversationId !== otherId || !previous.items.some(item => deleted.has(String(item._id)))
      ? previous : { ...previous, items: previous.items.filter(item => !deleted.has(String(item._id))) })
    setViewer(current => current && deleted.has(String(current._id)) ? null : current)
  }, [messages, otherId])

  if (!selectedUser) return <aside className="contact-details" aria-label="Contact details"><header className="details-header"><span className="eyebrow">CONTACT DETAILS</span></header><div className="shared-empty details-placeholder"><FiUser /><span>Select a conversation to see contact details and shared images.</span></div></aside>
  const contact = contactProfile(selectedUser, isOnline)
  const visible = media.conversationId === otherId ? media : { items: [], nextCursor: null, loading: true, error: '' }
  const openViewer = item => { setViewer(item); setViewerFailed(false) }
  const senderName = item => String(item.sender) === String(userId) ? 'You' : selectedUser.name || selectedUser.userName

  return <>
    {open && <button className="details-scrim" type="button" aria-label="Close contact details" onClick={onClose} />}
    <aside className={`contact-details ${open ? 'details-open' : ''}`} aria-label="Contact details">
      <header className="details-header"><span className="eyebrow">CONTACT DETAILS</span><button className="icon-button details-close" type="button" aria-label="Close contact details" onClick={onClose}><FiX /></button></header>
      <div className="contact-hero"><Avatar user={selectedUser} online={isOnline} size="large" /><h2>{contact.name}</h2><p className={isOnline ? 'status-online' : ''}>{contact.presence}</p><span className="availability-badge">{contact.availability}</span></div>
      <div className="details-divider" />
      <div className="details-section"><h3>About</h3>{contact.username && <div className="detail-line"><FiUser /><span><small>Username</small><strong>@{contact.username}</strong></span></div>}{contact.bio && <p className="contact-bio">{contact.bio}</p>}{!contact.bio && <p className="contact-bio-empty">No bio yet.</p>}</div>
      <div className="details-divider" />
      <div className="details-section"><div className="section-title"><h3>Shared images</h3><span>{visible.items.length} loaded</span></div>
        {visible.items.length > 0 && <div className="shared-images">{visible.items.map(item => <MediaThumbnail key={item._id} item={item} onOpen={openViewer} />)}</div>}
        {!visible.loading && visible.items.length === 0 && !visible.error && <div className="shared-empty"><FiImage /><span>No images shared in this chat yet.</span></div>}
        {visible.loading && <p className="media-state">Loading shared images…</p>}
        {visible.error && <p className="form-error" role="alert">{visible.error} <button type="button" onClick={() => fetchMedia(visible.nextCursor)}>Retry</button></p>}
        {visible.nextCursor && !visible.loading && <button className="load-media" type="button" onClick={() => fetchMedia(visible.nextCursor)}>Load more</button>}
      </div>
    </aside>
    {viewer && <div className="media-viewer" role="dialog" aria-modal="true" aria-label="Shared image viewer" onClick={() => setViewer(null)}>
      <div className="media-viewer-content" onClick={event => event.stopPropagation()}>
        <button ref={closeButton} className="icon-button" type="button" aria-label="Close image viewer" onClick={() => setViewer(null)}><FiX /></button>
        {viewerFailed ? <p>Image unavailable.</p> : <img src={viewer.image} alt="Shared image" onError={() => setViewerFailed(true)} />}
        <p>{senderName(viewer)} · <time dateTime={viewer.createdAt}>{new Date(viewer.createdAt).toLocaleString()}</time></p>
      </div>
    </div>}
  </>
}

export default ContactDetails
