import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { FiArrowLeft, FiCamera, FiMail, FiUser } from 'react-icons/fi'
import Avatar from '../components/Avatar'
import { serverUrl } from '../main'
import { setUserData } from '../redux/userSlice'

function Profile() {
  const { userData } = useSelector(state => state.user)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const fileInput = useRef(null)
  const [name, setName] = useState(userData?.name || '')
  const [attachment, setAttachment] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const handleImage = event => {
    const file = event.target.files?.[0]
    if (!file) return
    setAttachment(file)
    setPreview(URL.createObjectURL(file))
  }

  const handleProfile = async event => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('name', name)
      if (attachment) formData.append('image', attachment)
      const result = await axios.put(`${serverUrl}/api/user/profile`, formData, { withCredentials: true })
      dispatch(setUserData(result.data))
      navigate('/')
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Profile could not be saved. Please try again.')
    } finally { setSaving(false) }
  }

  return <main className="auth-stage"><div className="auth-card profile-card">
    <div className="profile-top"><button className="back-link" type="button" onClick={() => navigate('/')}><FiArrowLeft /> Back</button></div>
    <span className="eyebrow">YOUR PROFILE</span>
    <h1>Make it yours</h1>
    <p>Keep your name and photo up to date.</p>
    <form className="auth-form" onSubmit={handleProfile}>
      <div className="profile-avatar"><Avatar user={{ image: preview || userData?.image }} size="large" /><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImage} /><button type="button" aria-label="Change profile photo" onClick={() => fileInput.current?.click()}><FiCamera /></button></div>
      <label className="form-field"><span>Display name</span><span className="input-wrap"><FiUser /><input type="text" placeholder="Enter your name" value={name} onChange={event => setName(event.target.value)} /></span></label>
      <label className="form-field"><span>Username</span><span className="input-wrap readonly-wrap"><FiUser /><input type="text" value={userData?.userName || ''} readOnly /></span></label>
      <label className="form-field"><span>Email address</span><span className="input-wrap readonly-wrap"><FiMail /><input type="email" value={userData?.email || ''} readOnly /></span></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
    </form>
  </div></main>
}

export default Profile
