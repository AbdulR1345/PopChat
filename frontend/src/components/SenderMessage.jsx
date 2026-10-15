import { useSelector } from 'react-redux'
import Avatar from './Avatar'
import { FiCheck } from 'react-icons/fi'
import { RiCheckDoubleLine } from 'react-icons/ri'

function SenderMessage({ image, message, date, deliveredAt, readAt }) {
  const userData = useSelector(state => state.user.userData)
  const status = readAt ? 'Read' : deliveredAt ? 'Delivered' : 'Sent'
  return <div className="message-row outgoing"><div className="message-content"><div className="message-bubble">{image && <a href={image} target="_blank" rel="noreferrer"><img src={image} alt="Shared attachment" loading="lazy" /></a>}{message && <span>{message}</span>}</div><div className={`message-meta ${readAt ? 'is-read' : ''}`}>{date && <time dateTime={date}>{new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}<span aria-label={status}>{deliveredAt || readAt ? <RiCheckDoubleLine /> : <FiCheck />}{status}</span></div></div><Avatar user={userData} size="tiny" /></div>
}

export default SenderMessage
