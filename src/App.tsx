import { AppProvider } from '@state/AppContext'
import { ChatProvider } from '@state/ChatContext'
import { AppRouter } from './router'
import { Layout } from '@components/Layout'

export default function App() {
  return (
    <AppProvider>
      <ChatProvider>
        <Layout>
          <AppRouter />
        </Layout>
      </ChatProvider>
    </AppProvider>
  )
}

