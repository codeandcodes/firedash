import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { Psychology } from '@mui/icons-material';

interface ContextIconProps {
  onClick: () => void;
}

export const ContextIcon: React.FC<ContextIconProps> = ({ onClick }) => {
  return (
    <Tooltip title="Ask AI Assistant about this">
      <IconButton onClick={onClick} size="small">
        <Psychology />
      </IconButton>
    </Tooltip>
  );
};