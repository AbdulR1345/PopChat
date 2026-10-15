import { useSelector } from 'react-redux'
import Avatar from './Avatar'
import { MessageActions, ReplyQuote } from './MessageExtras'

function ReceiverMessage({ item, senderName, onJump, onReply, onReact }) {
  const selectedUser = useSelector(state => state.user.selectedUser)
  const userId = useSelector(state => state.user.userData?._id)
  return <div className="message-row incoming" data-message-id={item._id}>
    <Avatar user={selectedUser} size="tiny" /><div className="message-content">
      <div className="message-bubble">
        <ReplyQuote preview={item.replyPreview} senderName={senderName} onJump={onJump} />
        {item.deletedAt ? <span className="deleted-message">This message was deleted</span>
          : <>{item.image && <a href={item.image} target="_blank" rel="noreferrer"><img src={item.image} alt="Shared attachment" loading="lazy" /></a>}{item.message && <span>{item.message}</span>}</>}
      </div>
      <div className="message-meta">{item.createdAt && <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}{item.editedAt && !item.deletedAt && <span>Edited</span>}</div>
      <MessageActions item={item} userId={userId} onReply={onReply} onReact={onReact} />
    </div>
  </div>
}

export default ReceiverMessage
