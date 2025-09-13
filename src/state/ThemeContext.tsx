import React, { createContext, useContext, useMemo, useState } from 'react'
import { createTheme, ThemeProvider } from '@mui/material/styles'

type Mode = 'light' | 'dark'

interface ThemeCtx {
  mode: Mode
  toggle: () => void
}

const Ctx = createContext<ThemeCtx | undefined>(undefined)

export const AppThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [mode, setMode] = useState<Mode>('dark')
  const toggle = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'))

  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      primary: { main: '#7aa2f7' },
      secondary: { main: '#a6da95' },
      background: mode === 'dark' ? { default: '#0f1522', paper: '#101626' } : undefined
    },
    shape: { borderRadius: 10 },
    components: {
      MuiCard: { styleOverrides: { root: { borderColor: mode === 'dark' ? '#1f2940' : '#e0e0e0', borderWidth: 1, borderStyle: 'solid' } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } }
    }
  }), [mode])

  const ctx = useMemo(() => ({ mode, toggle }), [mode])

  return (
    <Ctx.Provider value={ctx}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </Ctx.Provider>
  )
}

export function useThemeMode() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useThemeMode must be used within AppThemeProvider')
  return c
}

