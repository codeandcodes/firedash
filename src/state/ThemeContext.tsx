import React, { createContext, useContext, useMemo, useState } from 'react'
import { createTheme, ThemeProvider } from '@mui/material/styles'

type Mode = 'light' | 'dark'

interface ThemeCtx {
  mode: Mode
  toggle: () => void
}

const Ctx = createContext<ThemeCtx | undefined>(undefined)

export const AppThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [mode, setMode] = useState<Mode>('light')
  const toggle = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'))

  const palette: any = {
    mode,
    primary: { main: mode === 'dark' ? '#7aa2f7' : '#4F7BFF' },
    secondary: { main: mode === 'dark' ? '#a6da95' : '#14B8A6' },
    success: { main: mode === 'dark' ? '#22c55e' : '#16A34A' },
    error: { main: mode === 'dark' ? '#ef4444' : '#DC2626' },
  }
  if (mode === 'dark') {
    palette.background = { default: '#0f1522', paper: '#101626' }
  } else {
    palette.background = { default: '#F7FAFC', paper: '#FFFFFF' }
  }

  const theme = useMemo(() => createTheme({
    palette,
    shape: { borderRadius: 10 },
    components: {
      MuiCard: { styleOverrides: { root: { borderColor: mode === 'dark' ? '#1f2940' : '#E5E7EB', borderWidth: 1, borderStyle: 'solid' } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiAppBar: { styleOverrides: { root: { boxShadow: 'none', borderBottom: `1px solid ${mode==='dark' ? '#1f2940' : '#E5E7EB'}` } } },
      MuiDrawer: { styleOverrides: { paper: { borderRight: `1px solid ${mode==='dark' ? '#1f2940' : '#E5E7EB'}` } } }
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
/*
Theme provider with light/dark toggle.
- Only sets palette.background in dark mode to avoid undefined in light mode.
*/
