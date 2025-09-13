import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AppBar, Box, CssBaseline, Divider, Drawer, IconButton, List, ListItem, ListItemButton, ListItemText, Toolbar, Typography } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'

const drawerWidth = 240
const navItems = [
  { to: '/upload', label: 'Upload' },
  { to: '/builder', label: 'Builder' },
  { to: '/snapshot', label: 'Snapshot' },
  { to: '/contrib-expenses', label: 'Contrib & Expenses' },
  { to: '/real-estate', label: 'Real Estate' },
  { to: '/social-security', label: 'Social Security' },
  { to: '/assumptions', label: 'Assumptions' },
  { to: '/scenarios', label: 'Scenarios' },
  { to: '/results', label: 'Results' },
  { to: '/sensitivity', label: 'Sensitivity' }
]

export const Layout: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const { pathname } = useLocation()

  const drawer = (
    <div>
      <Toolbar><Typography variant="h6" color="primary">Firedash</Typography></Toolbar>
      <Divider />
      <List>
        {navItems.map((item) => (
          <ListItem key={item.to} disablePadding>
            <ListItemButton component={Link} to={item.to} selected={pathname === item.to} onClick={() => setMobileOpen(false)}>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  )

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 2, display: { sm: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            Firedash
          </Typography>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }} aria-label="navigation">
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
                ModalProps={{ keepMounted: true }}
                sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}>
          {drawer}
        </Drawer>
        <Drawer variant="permanent" sx={{ display: { xs: 'none', sm: 'block' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }} open>
          {drawer}
        </Drawer>
      </Box>
      <Box component="main" sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${drawerWidth}px)` } }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  )
}
