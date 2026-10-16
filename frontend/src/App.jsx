import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import useGetCurrentUser from './customHooks/getCurrentUser'
import { useSelector } from 'react-redux'
import Home from './pages/Home'
import Profile from './pages/Profile'
import useGetOtherUsers from './customHooks/getOtherUsers'

function App() {
  useGetCurrentUser()
  useGetOtherUsers()
  const userData=useSelector(state=>state.user.userData)
  const sessionStatus=useSelector(state=>state.user.sessionStatus)

  if(sessionStatus==='pending') return <main className="auth-stage" role="status">Loading session…</main>

  return (
    <Routes>
      <Route path='/login' element={!userData?<Login/>:<Navigate to="/"/>}/>
      <Route path='/signup' element={!userData?<SignUp/>:<Navigate to="/profile"/>}/>
      <Route path='/' element={userData?<Home/>:<Navigate to="/login"/>}/>
      <Route path='/profile' element={userData?<Profile/>:<Navigate to="/signup"/>}/>
    </Routes>
  )
}

export default App
