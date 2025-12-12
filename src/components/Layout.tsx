import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AppBar, Box, Button, CssBaseline, Divider, Drawer, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper, Stack, Toolbar, Typography, useMediaQuery } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import Brightness4Icon from '@mui/icons-material/Brightness4'
import Brightness7Icon from '@mui/icons-material/Brightness7'
import { useTheme } from '@mui/material/styles'
import { useThemeMode } from '@state/ThemeContext'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import BuildIcon from '@mui/icons-material/Build'
import PieChartOutlineIcon from '@mui/icons-material/PieChartOutline'
import InsightsIcon from '@mui/icons-material/Insights'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'
import ScienceIcon from '@mui/icons-material/Science';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { ChatPanel } from './ChatPanel';
import { useApp } from '@state/AppContext'

const drawerWidthExpanded = 260
const drawerWidthCollapsed = 72
const navItems = [
  { to: '/upload', label: 'Upload', icon: <CloudUploadIcon fontSize="small" /> },
  { to: '/builder', label: 'Builder', icon: <BuildIcon fontSize="small" /> },
  { to: '/snapshot', label: 'Snapshot', icon: <PieChartOutlineIcon fontSize="small" /> },
  { to: '/results', label: 'Results', icon: <InsightsIcon fontSize="small" /> },
  { to: '/what-ifs', label: 'What‑Ifs', icon: <AutoGraphIcon fontSize="small" /> },
  { to: '/analysis', label: 'Analysis', icon: <ScienceIcon fontSize="small" /> }
]

export const Layout: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [chatPanelOpen, setChatPanelOpen] = React.useState(true);
  const [snapshotCollapsed, setSnapshotCollapsed] = React.useState(false)
  const [drawerCollapsed, setDrawerCollapsed] = React.useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const theme = useTheme()
  const { toggle } = useThemeMode()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const { snapshot, snapshotSource } = useApp()
  const drawerWidth = drawerCollapsed ? drawerWidthCollapsed : drawerWidthExpanded

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: drawerCollapsed ? 1 : 2 }}>
      <Toolbar sx={{ px: 1, mb: drawerCollapsed ? 1 : 2 }}>
        {!drawerCollapsed && (
          <Typography variant="h5" sx={{ fontWeight: 800, background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            🔥 Firedash
          </Typography>
        )}
        {drawerCollapsed && (
          <Typography variant="h6" sx={{ fontWeight: 800 }}>🔥</Typography>
        )}
      </Toolbar>
      <List sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {navItems.map((item) => {
          const isActive = pathname === item.to
          return (
            <ListItem key={item.to} disablePadding sx={{ display: 'block' }}>
              <ListItemButton
                component={Link}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                sx={{
                  borderRadius: '9999px',
                  mb: 0.5,
                  minHeight: 44,
                  backgroundColor: isActive ? theme.palette.primary.light + '20' : 'transparent',
                  color: isActive ? theme.palette.primary.main : theme.palette.text.secondary,
                  '&:hover': {
                    backgroundColor: isActive ? theme.palette.primary.light + '30' : theme.palette.action.hover,
                  },
                  px: drawerCollapsed ? 1.25 : 2
                }}
              >
                <ListItemIcon sx={{ minWidth: drawerCollapsed ? 32 : 40, color: isActive ? theme.palette.primary.main : theme.palette.text.secondary }}>
                  {item.icon}
                </ListItemIcon>
                {!drawerCollapsed && (
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontWeight: isActive ? 600 : 500,
                      fontSize: '0.9rem'
                    }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          )
        })}
      </List>
      {snapshot && (
        <Paper variant="outlined" sx={{ p: drawerCollapsed ? 1 : 1.5, mb: 1.5, borderRadius: 2, borderColor: 'primary.main', bgcolor: 'background.paper' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Box sx={{ overflow: 'hidden' }}>
              <Typography variant="caption" color="text.secondary">{drawerCollapsed ? 'Snapshot' : 'Snapshot loaded'}</Typography>
              {!drawerCollapsed && (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.4 }}>{snapshot?.name || snapshotSource || 'Snapshot'}</Typography>
                  {snapshot?.timestamp && (
                    <Typography variant="caption" color="text.secondary">{new Date(snapshot.timestamp).toLocaleString()}</Typography>
                  )}
                </>
              )}
            </Box>
            {!drawerCollapsed && (
              <Button size="small" variant="text" onClick={() => setSnapshotCollapsed((v) => !v)}>
                {snapshotCollapsed ? 'Show' : 'Hide'}
              </Button>
            )}
          </Stack>
          {!snapshotCollapsed && !drawerCollapsed && (
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              <Button variant="contained" size="small" onClick={() => navigate('/results')}>View Results</Button>
              <Button variant="outlined" size="small" onClick={() => navigate('/builder')}>Edit in Builder</Button>
              <Button variant="text" size="small" onClick={() => navigate('/upload')}>Upload Snapshot</Button>
              <Button variant="text" size="small" onClick={() => navigate('/upload#monarch')}>Update from Monarch</Button>
            </Stack>
          )}
        </Paper>
      )}
      <Box sx={{ mt: 'auto', pt: 2 }}>
        <Divider sx={{ mb: 2 }} />
        <ListItemButton onClick={toggle} sx={{ borderRadius: '9999px' }}>
          <ListItemIcon sx={{ minWidth: 40 }}>
            {theme.palette.mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </ListItemIcon>
          {!drawerCollapsed && <ListItemText primary={theme.palette.mode === 'dark' ? 'Light Mode' : 'Dark Mode'} />}
        </ListItemButton>
        <ListItemButton onClick={() => setDrawerCollapsed((v) => !v)} sx={{ borderRadius: '9999px', mt: 1 }}>
          <ListItemIcon sx={{ minWidth: 40 }}>
            {drawerCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </ListItemIcon>
          {!drawerCollapsed && <ListItemText primary={drawerCollapsed ? 'Expand' : 'Collapse'} />}
        </ListItemButton>
      </Box>
    </Box>
  )

  const [chatPanelWidth, setChatPanelWidth] = React.useState(400);
  const snapshotLabel = snapshot?.name || snapshotSource || 'Snapshot loaded'
  const timestamp = snapshot?.timestamp ? new Date(snapshot.timestamp).toLocaleString() : null

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          display: { sm: 'none' },
          bgcolor: 'background.paper',
          color: 'text.primary',
          boxShadow: 1
        }}
      >
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 2, display: { sm: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>Firedash</Typography>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }} aria-label="navigation">
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, border: 'none' }
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, borderRight: '1px solid', borderColor: 'divider', overflowX: 'hidden' }
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 4,
          width: { sm: `calc(100% - ${drawerWidth}px - ${chatPanelOpen ? chatPanelWidth : 0}px)` },
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar sx={{ display: { sm: 'none' } }} />
        {children}
      </Box>
      <ChatPanel open={chatPanelOpen} setOpen={setChatPanelOpen} width={chatPanelWidth} setWidth={setChatPanelWidth} />
    </Box>
  )
}
