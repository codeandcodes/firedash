import { AppProvider } from '@state/AppContext'
import { AppRouter } from './router'
import { Layout } from '@components/Layout'

export default function App() {
  return (
    <AppProvider>
      <Layout>
        <AppRouter />
      </Layout>
    </AppProvider>
  )
}

