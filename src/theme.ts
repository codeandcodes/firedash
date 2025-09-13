import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#7aa2f7' },
    secondary: { main: '#a6da95' },
    background: { default: '#0f1522', paper: '#101626' }
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCard: { styleOverrides: { root: { borderColor: '#1f2940', borderWidth: 1, borderStyle: 'solid' } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } }
  }
})

export default theme

