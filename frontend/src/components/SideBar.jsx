import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { FiEdit2, FiLogOut, FiSearch, FiUser, FiX } from 'react-icons/fi'
import { serverUrl } from '../main'
import { setSearchDataForSession, setSelectedUser, setUserData } from '../redux/userSlice'
import { reportApiError } from '../utils/reportApiError'
import Avatar from './Avatar'
import { messagePreview, messagePreviewTime, sortContactsByActivity } from '../utils/conversations'

function SideBar() {
  const { userData, authVersion, otherUsers, selectedUser, onlineUsers, searchData, inbox, typingUsers } = useSelector(state => state.user)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  useEffect(() => {
    if (!query.trim() || !userData?._id) return
    const controller = new AbortController()
    const userId = userData._id
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const result = await axios.get(`${serverUrl}/api/user/search`, {
          params: { query: query.trim() }, withCredentials: true, signal: controller.signal,
        })
        if (!controller.signal.aborted) dispatch(setSearchDataForSession({ userId, authVersion, users: result.data }))
      } catch (error) {
        if (!axios.isCancel(error)) reportApiError(error)
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, userData?._id, authVersion, dispatch])

  const handleLogOut = async () => {
    try {
      await axios.post(`${serverUrl}/api/auth/logout`, null, { withCredentials: true })
      dispatch(setUserData(null))
      navigate('/login')
    } catch (error) { reportApiError(error) }
  }

  const summaries = new Map((inbox ?? []).map(item => [String(item.userId), item]))
  const candidates = (query.trim() ? searchData : otherUsers)?.filter(user => user._id !== userData?._id)
  const people = candidates && (query.trim() ? candidates : sortContactsByActivity(candidates, inbox))
  const chooseUser = user => { dispatch(setSelectedUser(user)); setQuery('') }

  return (
    <aside className={`sidebar ${selectedUser ? 'sidebar-conversation-open' : ''}`} aria-label="Conversations">
      <div className="sidebar-top">
        <div className="brand-row">
          <button className="avatar-button" type="button" title="Edit profile" aria-label="Edit profile" onClick={() => navigate('/profile')}><Avatar user={userData} size="medium" /></button>
          <div className="brand-copy"><span className="eyebrow">YOUR WORKSPACE</span><strong>PopChat<span className="brand-dot">.</span></strong></div>
          <button className="icon-button subtle-button" type="button" title="Edit profile" aria-label="Edit profile" onClick={() => navigate('/profile')}><FiEdit2 /></button>
        </div>
        <div className="sidebar-heading"><div><span className="eyebrow">MESSENGER</span><h1>Messages</h1></div><span className="count-pill">{otherUsers?.length ?? 0}</span></div>
        <label className="search-field"><FiSearch aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search people" aria-label="Search people" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><FiX /></button>}</label>
        <div className="list-heading"><span>{query.trim() ? 'Search results' : 'All conversations'}</span>{!query.trim() && <span>{otherUsers?.length ?? 0}</span>}</div>
      </div>
      <div className="conversation-list">
        {people?.map(user => {
          const isOnline = onlineUsers?.includes(user._id)
          const summary = summaries.get(user._id)
          const preview = messagePreview(summary?.lastMessage)
          const unread = summary?.unreadCount || 0
          return <button key={user._id} type="button" className={`conversation-item ${selectedUser?._id === user._id ? 'active' : ''}`} onClick={() => chooseUser(user)}>
            <Avatar user={user} online={isOnline} size="medium" />
            <span className="conversation-copy"><strong>{user.name || user.userName}</strong><span className={typingUsers[user._id] ? 'typing-preview' : ''}>{typingUsers[user._id] ? 'Typing…' : preview || (isOnline ? 'Online now' : user.name && user.userName ? `@${user.userName}` : 'Offline')}</span></span>
            {(summary?.lastMessage || unread > 0) && <span className="conversation-meta">{summary?.lastMessage && <time dateTime={summary.lastMessage.createdAt}>{messagePreviewTime(summary.lastMessage.createdAt)}</time>}{unread > 0 && <span className="unread-badge" aria-label={`${unread} unread messages`}>{unread > 99 ? '99+' : unread}</span>}</span>}
          </button>
        })}
        {!people && <div className="list-empty">{query.trim() ? 'Searching…' : 'Loading people…'}</div>}
        {query.trim() && searching && <div className="list-empty">Searching…</div>}
        {people?.length === 0 && !searching && <div className="list-empty">{query.trim() ? 'No people found.' : 'No conversations yet.'}</div>}
      </div>
      <div className="sidebar-footer">
        <button className="footer-user" type="button" onClick={() => navigate('/profile')}><Avatar user={userData} size="small" /><span><strong>{userData?.name || userData?.userName}</strong><small>My profile</small></span><FiUser aria-hidden="true" /></button>
        <button className="logout-button" type="button" onClick={handleLogOut} title="Log out" aria-label="Log out"><FiLogOut /></button>
      </div>
    </aside>
  )
}

export default SideBar
