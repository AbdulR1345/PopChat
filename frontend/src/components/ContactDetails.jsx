import { useSelector } from 'react-redux'
import { FiImage, FiMail, FiUser, FiX } from 'react-icons/fi'
import Avatar from './Avatar'

function ContactDetails({ open, onClose }) {
  const { selectedUser, onlineUsers } = useSelector(state => state.user)
  const { messages } = useSelector(state => state.message)
  const images = messages.filter(message => message.image)
  const isOnline = onlineUsers?.includes(selectedUser?._id)

  if (!selectedUser) return <aside className="contact-details" aria-label="Contact details"><header className="details-header"><span className="eyebrow">CONTACT DETAILS</span></header><div className="shared-empty details-placeholder"><FiUser /><span>Select a conversation to see contact details and shared images.</span></div></aside>

  return <>
    {open && <button className="details-scrim" type="button" aria-label="Close contact details" onClick={onClose} />}
    <aside className={`contact-details ${open ? 'details-open' : ''}`} aria-label="Contact details">
      <header className="details-header"><span className="eyebrow">CONTACT DETAILS</span><button className="icon-button details-close" type="button" aria-label="Close contact details" onClick={onClose}><FiX /></button></header>
      <div className="contact-hero"><Avatar user={selectedUser} online={isOnline} size="large" /><h2>{selectedUser?.name || selectedUser?.userName}</h2><p className={isOnline ? 'status-online' : ''}>{isOnline ? 'Active now' : 'Offline'}</p></div>
      <div className="details-divider" />
      <div className="details-section"><h3>About</h3>{selectedUser?.userName && <div className="detail-line"><FiUser /><span><small>Username</small><strong>@{selectedUser.userName}</strong></span></div>}{selectedUser?.email && <div className="detail-line"><FiMail /><span><small>Email</small><strong>{selectedUser.email}</strong></span></div>}</div>
      <div className="details-divider" />
      <div className="details-section"><div className="section-title"><h3>Shared images</h3><span>{images.length}</span></div>{images.length ? <div className="shared-images">{images.map(message => <a key={message._id} href={message.image} target="_blank" rel="noreferrer" aria-label="Open shared image"><img src={message.image} alt="Shared in this conversation" loading="lazy" /></a>)}</div> : <div className="shared-empty"><FiImage /><span>Images shared in this chat will appear here.</span></div>}</div>
    </aside>
  </>
}

export default ContactDetails
