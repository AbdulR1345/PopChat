import { useEffect, useReducer, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { FiArrowLeft, FiCamera, FiMail, FiUser } from 'react-icons/fi'
import Avatar from '../components/Avatar'
import { serverUrl } from '../main'
import { setUserData } from '../redux/userSlice'
import { availabilityOptions, initialProfileEditor, MAX_BIO_LENGTH, MAX_DISPLAY_NAME_LENGTH, profileEditorReducer, validateProfile } from '../utils/profile'

function Profile() {
  const { userData } = useSelector(state => state.user)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const fileInput = useRef(null)
  const submitting = useRef(false)
  const [editor, updateEditor] = useReducer(profileEditorReducer, userData, initialProfileEditor)
  const { fields, error, success } = editor
  const [attachment, setAttachment] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const change = (key, value) => {
    updateEditor({ type: 'change', key, value })
  }

  const handleImage = event => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAttachment(null)
      setPreview(null)
      updateEditor({ type: 'error', message: 'Choose a JPEG, PNG, or WebP image under 5 MB.' })
      event.target.value = ''
      return
    }
    setAttachment(file)
    setPreview(URL.createObjectURL(file))
    updateEditor({ type: 'clearFeedback' })
  }

  const handleProfile = async event => {
    event.preventDefault()
    if (submitting.current) return
    const validationError = validateProfile(fields, userData?.name)
    if (validationError) { updateEditor({ type: 'error', message: validationError }); return }
    submitting.current = true
    setSaving(true)
    updateEditor({ type: 'clearFeedback' })
    try {
      const formData = new FormData()
      if (fields.name !== userData?.name) formData.append('name', fields.name.trim())
      formData.append('bio', fields.bio.trim())
      formData.append('availability', fields.availability)
      if (attachment) formData.append('image', attachment)
      const result = await axios.put(`${serverUrl}/api/user/profile`, formData, { withCredentials: true })
      dispatch(setUserData(result.data))
      updateEditor({ type: 'saved', user: result.data })
      setAttachment(null)
      setPreview(null)
      if (fileInput.current) fileInput.current.value = ''
    } catch (requestError) {
      updateEditor({ type: 'error', message: requestError?.response?.data?.message || 'Profile could not be saved. Please try again.' })
    } finally { submitting.current = false; setSaving(false) }
  }

  return <main className="auth-stage"><div className="auth-card profile-card">
    <div className="profile-top"><button className="back-link" type="button" onClick={() => navigate('/')}><FiArrowLeft /> Back to chat</button></div>
    <span className="eyebrow">YOUR PROFILE</span>
    <h1>Make it yours</h1>
    <p>Keep your name, photo, and availability up to date.</p>
    <form className="auth-form" onSubmit={handleProfile} noValidate>
      <div className="profile-avatar"><Avatar user={{ image: preview || userData?.image }} size="large" /><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Profile photo" onChange={handleImage} /><button type="button" aria-label="Change profile photo" disabled={saving} onClick={() => fileInput.current?.click()}><FiCamera /></button></div>
      {attachment && <p className="profile-note">Selected: {attachment.name}</p>}
      <label className="form-field"><span>Display name</span><span className="input-wrap"><FiUser /><input type="text" placeholder="Enter your name" maxLength={MAX_DISPLAY_NAME_LENGTH} value={fields.name} onChange={event => change('name', event.target.value)} disabled={saving} required /></span></label>
      <label className="form-field"><span>Username</span><span className="input-wrap readonly-wrap"><FiUser /><input type="text" value={userData?.userName || ''} readOnly /></span></label>
      <label className="form-field"><span>Email address</span><span className="input-wrap readonly-wrap"><FiMail /><input type="email" value={userData?.email || ''} readOnly /></span></label>
      <label className="form-field"><span>Bio <small className="field-count">{fields.bio.length}/{MAX_BIO_LENGTH}</small></span><textarea className="profile-textarea" rows="4" maxLength={MAX_BIO_LENGTH} value={fields.bio} onChange={event => change('bio', event.target.value)} placeholder="A little about you" disabled={saving} /></label>
      <label className="form-field"><span>Availability</span><select className="profile-select" value={fields.availability} onChange={event => change('availability', event.target.value)} disabled={saving}>{availabilityOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <p className="profile-note">Availability is your choice. The green dot shows whether you are connected.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {success && <div className="form-success" role="status">{success}</div>}
      <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
    </form>
  </div></main>
}

export default Profile
