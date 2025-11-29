import React, { useState } from 'react';
import { Box, Button, Paper, TextField, Typography } from '@mui/material';
import { Chat, Close } from '@mui/icons-material';
import { useChat } from '@state/ChatContext';
import { callBackendApi } from '../services/backend';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface ChatPanelProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  width: number;
  setWidth: (width: number) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ open, setOpen, width, setWidth }) => {
  const { chatHistory, setChatHistory, context, setContext } = useChat();
  const [userMessage, setUserMessage] = useState('');

  const handleMouseDown = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = startWidth - (e.clientX - startX);
      if (newWidth > 200 && newWidth < 800) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleSendMessage = async () => {
    if (!userMessage) return;

    const pendingHistory = [...chatHistory];
    const nextChatHistory = [...pendingHistory, { role: 'user', parts: [{ text: userMessage }] }];
    setChatHistory(nextChatHistory);
    setUserMessage('');

    const data = {
      prompt: userMessage,
      context,
      history: pendingHistory,
    };

    let llmResponse = '';
    await callBackendApi(data, (chunk) => {
      llmResponse += chunk;
      setChatHistory([...nextChatHistory, { role: 'model', parts: [{ text: llmResponse }] }]);
    });
  };

  if (!open) {
    return (
      <Button 
        variant="contained" 
        onClick={() => setOpen(true)} 
        sx={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 1300,
        }}
      >
        <Chat />
      </Button>
    );
  }

  return (
    <Paper 
      elevation={3} 
      sx={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: width,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        transition: 'right 0.3s',
      }}
    >
      <Box 
        onMouseDown={handleMouseDown}
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'ew-resize',
        }}
      />
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
        <Button color="inherit" onClick={() => setOpen(false)}>
          <Close />
        </Button>
        <Button color="inherit" onClick={() => {
          setChatHistory([]);
          setContext(null);
        }}>
          New Conversation
        </Button>
      </Box>
      <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto' }}>
        {context && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2">Context:</Typography>
            <pre>{JSON.stringify(context, null, 2)}</pre>
            <Button size="small" variant="outlined" onClick={() => setContext(null)} sx={{ mt: 1 }}>
              Clear Context
            </Button>
          </Box>
        )}
        {chatHistory.map((chat, index) => (
          <Paper key={index} elevation={1} sx={{ p: 1, mb: 1, bgcolor: chat.role === 'user' ? '#f0f0f0' : '#fff' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {chat.parts[0].text}
            </ReactMarkdown>
          </Paper>
        ))}
      </Box>
      <Box sx={{ p: 2, display: 'flex' }}>
        <TextField
          label="Ask a question"
          fullWidth
          variant="outlined"
          size="small"
          value={userMessage}
          onChange={(e) => setUserMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSendMessage();
            }
          }}
        />
        <Button variant="contained" onClick={handleSendMessage} sx={{ ml: 1 }}>
          Send
        </Button>
      </Box>
    </Paper>
  );
};
