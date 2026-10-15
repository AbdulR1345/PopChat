import { useState } from 'react'
import { useSelector } from 'react-redux'
import SideBar from '../components/SideBar'
import MessageArea from '../components/MessageArea'
import ContactDetails from '../components/ContactDetails'
import useMessages from '../customHooks/getMessages'

function Home() {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const selectedUser = useSelector(state => state.user.selectedUser)
  const loadingMessages = useMessages()

  return <main className="app-stage">
    <div className="messenger-shell">
      <SideBar />
      <MessageArea key={selectedUser?._id || 'welcome'} loadingMessages={loadingMessages} onOpenDetails={() => setDetailsOpen(true)} />
      <ContactDetails open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </div>
  </main>
}

export default Home
