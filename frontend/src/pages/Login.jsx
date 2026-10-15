import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { FiEye, FiEyeOff, FiLock, FiMail, FiMessageCircle } from 'react-icons/fi'
import { serverUrl } from '../main'
import { setSelectedUser, setUserData } from '../redux/userSlice'

function Login() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await axios.post(`${serverUrl}/api/auth/login`, { email, password }, { withCredentials: true })
      dispatch(setUserData(result.data))
      dispatch(setSelectedUser(null))
      navigate('/')
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Unable to sign in. Please try again.')
    } finally { setLoading(false) }
  }

  return <main className="auth-stage"><div className="auth-card">
    <div className="auth-mark"><FiMessageCircle /></div>
    <span className="eyebrow">WELCOME BACK</span>
    <h1>Sign in to PopChat</h1>
    <p>Pick up the conversation right where you left off.</p>
    <form className="auth-form" onSubmit={handleLogin}>
      <label className="form-field"><span>Email address</span><span className="input-wrap"><FiMail /><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></span></label>
      <label className="form-field"><span>Password</span><span className="input-wrap"><FiLock /><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required /><button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(show => !show)}>{showPassword ? <FiEyeOff /> : <FiEye />}</button></span></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <p className="auth-switch">New to PopChat? <Link to="/signup">Create an account</Link></p>
  </div></main>
}

export default Login
