import { useState } from 'react'
import { useSelector } from 'react-redux'
import { FiCheck } from 'react-icons/fi'
import { RiCheckDoubleLine } from 'react-icons/ri'
import Avatar from './Avatar'
import { MessageActions, ReplyQuote } from './MessageExtras'

function SenderMessage({ item, senderName, onJump, onReply, onReact, onEdit, onDelete }) {
  const userData = useSelector(state => state.user.userData)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [baseEditedAt, setBaseEditedAt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const status = item.readAt ? 'Read' : item.deliveredAt ? 'Delivered' : 'Sent'
  const startEdit = () => { setDraft(item.message); setBaseEditedAt(item.editedAt ?? null); setError(''); setEditing(true) }
  const save = async event => {
    event.preventDefault()
    if (!draft.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      await onEdit(item, draft, baseEditedAt)
      setEditing(false)
    } catch (problem) {
      setError(problem?.response?.data?.message || 'Edit failed. Please try again.')
    } finally { setSaving(false) }
  }
  return <div className="message-row outgoing" data-message-id={item._id}>
    <div className="message-content">
      <div className="message-bubble">
        <ReplyQuote preview={item.replyPreview} senderName={senderName} onJump={onJump} />
        {item.deletedAt ? <span className="deleted-message">This message was deleted</span> : editing
          ? <form className="inline-edit" onSubmit={save}>
            <textarea value={draft} maxLength={10000} aria-label="Edit message" onChange={event => setDraft(event.target.value)} />
            <span><button type="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button><button type="submit" disabled={saving || !draft.trim()}>Save</button></span>
            {error && <small role="alert">{error}</small>}
          </form>
          : <>{item.image && <a href={item.image} target="_blank" rel="noreferrer"><img src={item.image} alt="Shared attachment" loading="lazy" /></a>}{item.message && <span>{item.message}</span>}</>}
      </div>
      <div className={`message-meta ${item.readAt ? 'is-read' : ''}`}>
        {item.createdAt && <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}
        {item.editedAt && !item.deletedAt && <span>Edited</span>}
        <span aria-label={status}>{item.deliveredAt || item.readAt ? <RiCheckDoubleLine /> : <FiCheck />}{status}</span>
      </div>
      <MessageActions item={item} userId={userData?._id} own onReply={onReply} onReact={onReact} onEdit={startEdit} onDelete={onDelete} />
    </div><Avatar user={userData} size="tiny" />
  </div>
}

export default SenderMessage
