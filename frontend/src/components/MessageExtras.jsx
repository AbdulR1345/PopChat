import { useState } from 'react'
import { FiMoreHorizontal } from 'react-icons/fi'

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

export function ReplyQuote({ preview, senderName, onJump }) {
  if (!preview) return null
  return <button className="reply-quote" type="button" onClick={() => onJump(preview._id)} aria-label="Jump to original message">
    <strong>{preview.sender ? senderName(preview.sender) : 'Original message'}</strong>
    <span>{preview.text}</span>
  </button>
}

export function MessageActions({ item, userId, own, onReply, onReact, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const [reactOpen, setReactOpen] = useState(false)
  const counts = new Map()
  for (const reaction of item.reactions ?? []) counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1)
  const mine = item.reactions?.find(reaction => String(reaction.user) === String(userId))?.emoji
  return <>
    {counts.size > 0 && !item.deletedAt && <div className="reaction-summary" aria-label="Message reactions">
      {[...counts].map(([emoji, count]) => <button key={emoji} type="button" className={mine === emoji ? 'my-reaction' : ''}
        aria-label={`${emoji} reaction, ${count}. ${mine === emoji ? 'Remove your reaction' : 'React with this emoji'}`}
        onClick={() => onReact(item, mine === emoji ? null : emoji)}>{emoji}<span>{count}</span></button>)}
    </div>}
    <div className="message-actions">
      <button type="button" className="message-menu-toggle" aria-label="Message actions" aria-expanded={open}
        onClick={() => { setOpen(value => !value); setReactOpen(false) }}><FiMoreHorizontal /></button>
      {open && <div className="message-action-menu">
        <button type="button" onClick={() => { onReply(item); setOpen(false) }}>Reply</button>
        {!item.deletedAt && <button type="button" aria-expanded={reactOpen} onClick={() => setReactOpen(value => !value)}>React</button>}
        {own && !item.deletedAt && !item.image && <button type="button" onClick={() => { onEdit(); setOpen(false) }}>Edit</button>}
        {own && !item.deletedAt && <button type="button" onClick={() => { onDelete(item); setOpen(false) }}>Delete</button>}
        {reactOpen && <div className="reaction-picker" aria-label="Choose a reaction">
          {REACTIONS.map(emoji => <button type="button" key={emoji} aria-label={`React ${emoji}`} onClick={() => {
            onReact(item, mine === emoji ? null : emoji)
            setReactOpen(false)
            setOpen(false)
          }}>{emoji}</button>)}
          {mine && <button type="button" className="remove-reaction" onClick={() => {
            onReact(item, null); setReactOpen(false); setOpen(false)
          }}>Remove</button>}
        </div>}
      </div>}
    </div>
  </>
}
