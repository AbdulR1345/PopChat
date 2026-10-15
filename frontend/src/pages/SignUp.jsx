import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { FiEye, FiEyeOff, FiLock, FiMail, FiMessageCircle, FiUser } from 'react-icons/fi'
import { serverUrl } from '../main'
import { setUserData } from '../redux/userSlice'

function SignUp() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [showPassword, setShowPassword] = useState(false)
  const [userName, setUserName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSignUp = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await axios.post(`${serverUrl}/api/auth/signup`, { userName, email, password }, { withCredentials: true })
      dispatch(setUserData(result.data))
      navigate('/profile')
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Unable to create your account. Please try again.')
    } finally { setLoading(false) }
  }

  return <main className="auth-stage"><div className="auth-card">
    <div className="auth-mark"><FiMessageCircle /></div>
    <span className="eyebrow">JOIN THE CONVERSATION</span>
    <h1>Create your account</h1>
    <p>A space for the conversations that matter.</p>
    <form className="auth-form" onSubmit={handleSignUp}>
      <label className="form-field"><span>Username</span><span className="input-wrap"><FiUser /><input type="text" value={userName} onChange={event => setUserName(event.target.value)} placeholder="Choose a username" autoComplete="username" required /></span></label>
      <label className="form-field"><span>Email address</span><span className="input-wrap"><FiMail /><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></span></label>
      <label className="form-field"><span>Password</span><span className="input-wrap"><FiLock /><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Create a password" autoComplete="new-password" required /><button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(show => !show)}>{showPassword ? <FiEyeOff /> : <FiEye />}</button></span></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
    </form>
    <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
  </div></main>
}

export default SignUp
