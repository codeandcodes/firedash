import React, { useState } from 'react';
import { useApp } from '@state/AppContext';
import { Button, TextField, Typography } from '@mui/material';
import { useChat } from '@state/ChatContext';
import { callBackendApi } from '../services/backend';

export const AnalysisPage: React.FC = () => {
  const { snapshot } = useApp();
  const [goals, setGoals] = useState('');
  const { setChatHistory } = useChat();
  const [loading, setLoading] = useState(false);

  const handleAnalysis = async () => {
    if (!snapshot) {
      alert('Please upload a snapshot first.');
      return;
    }

    setLoading(true);
    setChatHistory([]);
    try {
      const data = {
        goals,
        snapshot,
      };
      let llmResponse = '';
      await callBackendApi(data, (chunk) => {
        llmResponse += chunk;
      });
      setChatHistory([{ role: 'model', parts: [{ text: llmResponse }] }]);
    } catch (error) {
      alert(`Error: ${(error as Error).message}`);
    }
    setLoading(false);
  };

  return (
    <div>
      <Typography variant="h4" gutterBottom>
        Portfolio Analysis
      </Typography>
      <Typography variant="body1" gutterBottom>
        Enter your financial goals below to get an AI-powered analysis of your portfolio.
      </Typography>
      <TextField
        label="Financial Goals (e.g., FIRE, wealth preservation, retire at 65)"
        multiline
        rows={4}
        fullWidth
        variant="outlined"
        value={goals}
        onChange={(e) => setGoals(e.target.value)}
        sx={{ mb: 2 }}
      />
      <Button variant="contained" onClick={handleAnalysis} disabled={loading || !snapshot}>
        {loading ? 'Analyzing...' : 'Analyze Portfolio'}
      </Button>
    </div>
  );
};