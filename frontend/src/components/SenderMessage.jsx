import { useSelector } from 'react-redux'
import Avatar from './Avatar'

function SenderMessage({ image, message, date }) {
  const userData = useSelector(state => state.user.userData)
  return <div className="message-row outgoing"><div className="message-content"><div className="message-bubble">{image && <a href={image} target="_blank" rel="noreferrer"><img src={image} alt="Shared attachment" loading="lazy" /></a>}{message && <span>{message}</span>}</div>{date && <time dateTime={date}>{new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}</div><Avatar user={userData} size="tiny" /></div>
}

export default SenderMessage
