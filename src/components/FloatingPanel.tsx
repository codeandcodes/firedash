import React, { useState } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import { Chat, Close, Minimize } from '@mui/icons-material';

export const FloatingPanel: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [minimized, setMinimized] = useState(false);
  const [closed, setClosed] = useState(false);

  if (closed) {
    return null;
  }

  return (
    <Paper 
      elevation={3} 
      sx={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: minimized ? 200 : 400,
        height: minimized ? 48 : 500,
        zIndex: 1300,
        transition: 'width 0.3s, height 0.3s',
        overflow: 'hidden',
      }}
    >
      <Box 
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 1,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        <Chat sx={{ mr: 1 }} />
        <Typography variant="h6">AI Assistant</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button color="inherit" onClick={() => setMinimized(!minimized)}>
          <Minimize />
        </Button>
        <Button color="inherit" onClick={() => setClosed(true)}>
          <Close />
        </Button>
      </Box>
      <Box sx={{ p: 2, display: minimized ? 'none' : 'block' }}>
        {children}
      </Box>
    </Paper>
  );
};