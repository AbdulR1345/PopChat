import { useState } from 'react'
import { useSelector } from 'react-redux'
import SideBar from '../components/SideBar'
import MessageArea from '../components/MessageArea'
import ContactDetails from '../components/ContactDetails'
import useMessages from '../customHooks/getMessages'
import useGetInbox from '../customHooks/getInbox'
import useConversationPreferences from '../customHooks/useConversationPreferences'

function Home() {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const selectedUser = useSelector(state => state.user.selectedUser)
  const loadingMessages = useMessages()
  useGetInbox()
  const { updatePreference, retryPreferences } = useConversationPreferences()

  return <main className="app-stage">
    <div className="messenger-shell">
      <SideBar onUpdatePreference={updatePreference} onRetryPreferences={retryPreferences} />
      <MessageArea key={selectedUser?._id || 'welcome'} loadingMessages={loadingMessages} onOpenDetails={() => setDetailsOpen(true)} onUpdatePreference={updatePreference} />
      <ContactDetails open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </div>
  </main>
}

export default Home
