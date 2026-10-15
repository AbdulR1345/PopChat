import { useSelector } from 'react-redux'
import Avatar from './Avatar'

function ReceiverMessage({ image, message, date }) {
  const selectedUser = useSelector(state => state.user.selectedUser)
  return <div className="message-row incoming"><Avatar user={selectedUser} size="tiny" /><div className="message-content"><div className="message-bubble">{image && <a href={image} target="_blank" rel="noreferrer"><img src={image} alt="Shared attachment" loading="lazy" /></a>}{message && <span>{message}</span>}</div>{date && <time dateTime={date}>{new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}</div></div>
}

export default ReceiverMessage
