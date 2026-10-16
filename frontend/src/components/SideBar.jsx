import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { FiArchive, FiBookmark, FiEdit2, FiLogOut, FiMoreHorizontal, FiSearch, FiUser, FiVolumeX, FiX } from 'react-icons/fi'
import { serverUrl } from '../main'
import { setSearchDataForSession, setSelectedUser, setUserData } from '../redux/userSlice'
import { reportApiError } from '../utils/reportApiError'
import Avatar from './Avatar'
import { conversationActions, messagePreview, messagePreviewTime, preferenceFor, sortContactsByActivity, visibleContacts } from '../utils/conversations'
import { availabilityLabel } from '../utils/profile'

function SideBar({ onUpdatePreference, onRetryPreferences }) {
  const { userData, authVersion, otherUsers, selectedUser, onlineUsers, searchData, inbox, preferences, preferenceLoadError, typingUsers } = useSelector(state => state.user)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [view, setView] = useState('all')
  const [openMenu, setOpenMenu] = useState(null)
  const [pending, setPending] = useState(null)
  const [actionError, setActionError] = useState('')
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
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

  useEffect(() => {
    if (!openMenu) return
    menuRef.current?.querySelector('button')?.focus()
    const onPointerDown = event => {
      if (!menuRef.current?.parentElement?.contains(event.target)) setOpenMenu(null)
    }
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openMenu])

  const handleLogOut = async () => {
    try {
      await axios.post(`${serverUrl}/api/auth/logout`, null, { withCredentials: true })
      dispatch(setUserData(null))
      navigate('/login')
    } catch (error) { reportApiError(error) }
  }

  const summaries = new Map((inbox ?? []).map(item => [String(item.userId), item]))
  const candidates = (query.trim() ? searchData : otherUsers)?.filter(user => user._id !== userData?._id)
  const visible = candidates && preferences && visibleContacts(candidates, preferences, view)
  const people = visible && (query.trim() ? visible : sortContactsByActivity(visible, inbox, preferences))
  const chooseUser = user => { dispatch(setSelectedUser(user)); setQuery(''); setOpenMenu(null) }
  const changePreference = async (otherUserId, change) => {
    setPending(otherUserId)
    setActionError('')
    try {
      await onUpdatePreference(otherUserId, change)
      setOpenMenu(null)
      if (Object.hasOwn(change, 'archived')) document.getElementById(`sidebar-${view}-tab`)?.focus()
      else triggerRef.current?.focus()
    } catch (error) {
      setActionError(error?.response?.data?.message || 'Conversation preference could not be saved.')
    } finally { setPending(null) }
  }
  const handleTabKey = event => {
    const next = event.key === 'ArrowRight' || event.key === 'End' ? 'archived'
      : event.key === 'ArrowLeft' || event.key === 'Home' ? 'all' : null
    if (!next) return
    event.preventDefault()
    setView(next)
    setOpenMenu(null)
    document.getElementById(`sidebar-${next}-tab`)?.focus()
  }

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
        <div className="conversation-tabs" role="tablist" aria-label="Conversation views">
          <button id="sidebar-all-tab" type="button" role="tab" aria-selected={view === 'all'} aria-controls="conversation-view" tabIndex={view === 'all' ? 0 : -1} onKeyDown={handleTabKey} onClick={() => { setView('all'); setOpenMenu(null) }}>All</button>
          <button id="sidebar-archived-tab" type="button" role="tab" aria-selected={view === 'archived'} aria-controls="conversation-view" tabIndex={view === 'archived' ? 0 : -1} onKeyDown={handleTabKey} onClick={() => { setView('archived'); setOpenMenu(null) }}>Archived</button>
        </div>
        <div className="list-heading"><span>{query.trim() ? 'Search results' : view === 'archived' ? 'Archived conversations' : 'All conversations'}</span>{!query.trim() && <span>{people?.length ?? 0}</span>}</div>
        {actionError && <p className="sidebar-action-error" role="alert">{actionError}</p>}
      </div>
      <div id="conversation-view" className="conversation-list" role="tabpanel" aria-labelledby={`sidebar-${view}-tab`}>
        {people?.map(user => {
          const isOnline = onlineUsers?.includes(user._id)
          const summary = summaries.get(user._id)
          const preference = preferenceFor(preferences, user._id)
          const preview = messagePreview(summary?.lastMessage)
          const unread = summary?.unreadCount || 0
          const menuVisible = openMenu === user._id
          return <div key={user._id} className="conversation-entry">
            <button type="button" className={`conversation-item ${selectedUser?._id === user._id ? 'active' : ''}`} onClick={() => chooseUser(user)}>
              <Avatar user={user} online={isOnline} size="medium" />
              <span className="conversation-copy"><strong>{user.name || user.userName}</strong><span className={typingUsers[user._id] ? 'typing-preview' : ''}>{typingUsers[user._id] ? 'Typing…' : preview || (isOnline ? 'Online now' : user.name && user.userName ? `@${user.userName}` : 'Offline')}</span></span>
              {(summary?.lastMessage || unread > 0) && <span className="conversation-meta">{summary?.lastMessage && <time dateTime={summary.lastMessage.createdAt}>{messagePreviewTime(summary.lastMessage.createdAt)}</time>}{unread > 0 && <span className="unread-badge" aria-label={`${unread} unread messages`}>{unread > 99 ? '99+' : unread}</span>}</span>}
              <span className="conversation-flags">{preference.pinnedAt && <FiBookmark aria-label="Pinned" />}{preference.muted && <FiVolumeX aria-label="Muted" />}{preference.archived && <FiArchive aria-label="Archived" />}</span>
            </button>
            {summary?.lastMessage && <button ref={menuVisible ? triggerRef : null} className="conversation-menu-trigger" type="button" aria-label={`Actions for ${user.name || user.userName}`} aria-expanded={menuVisible} aria-controls={menuVisible ? `conversation-menu-${user._id}` : undefined} onClick={() => { setActionError(''); setOpenMenu(menuVisible ? null : user._id) }}><FiMoreHorizontal /></button>}
            {menuVisible && <div ref={menuRef} id={`conversation-menu-${user._id}`} className="conversation-action-menu" aria-label={`Actions for ${user.name || user.userName}`}>
              {conversationActions(preference).map(action => <button key={action.label} type="button" disabled={pending === user._id} onClick={() => changePreference(user._id, action.change)}>{action.label}</button>)}
              {pending === user._id && <span role="status">Saving…</span>}
            </div>}
          </div>
        })}
        {!people && <div className="list-empty">{preferenceLoadError ? <>Conversations could not be loaded. <button className="retry-preferences" type="button" onClick={onRetryPreferences}>Retry</button></> : preferences === null ? 'Loading conversations…' : query.trim() ? 'Searching…' : 'Loading people…'}</div>}
        {people && query.trim() && searching && <div className="list-empty">Searching…</div>}
        {people?.length === 0 && !searching && <div className="list-empty">{query.trim() ? 'No people found.' : view === 'archived' ? 'No archived conversations.' : 'No conversations yet.'}</div>}
      </div>
      <div className="sidebar-footer">
        <button className="footer-user" type="button" onClick={() => navigate('/profile')}><Avatar user={userData} size="small" /><span><strong>{userData?.name || userData?.userName}</strong><small>My profile · {availabilityLabel(userData?.availability)}</small></span><FiUser aria-hidden="true" /></button>
        <button className="logout-button" type="button" onClick={handleLogOut} title="Log out" aria-label="Log out"><FiLogOut /></button>
      </div>
    </aside>
  )
}

export default SideBar
