import dp from '../assets/dp.webp'

function Avatar({ user, online = false, size = 'medium' }) {
  return <span className={`avatar avatar-${size}`}><img src={user?.image || dp} alt="" />{online && <span className="online-dot" />}</span>
}

export default Avatar
