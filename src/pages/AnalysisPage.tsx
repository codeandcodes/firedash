import React, { useMemo, useState } from 'react';
import { useApp } from '@state/AppContext';
import { Box, Button, Collapse, FormControlLabel, Switch, TextField, Typography, Paper } from '@mui/material';
import { useChat } from '@state/ChatContext';
import { callBackendApi } from '../services/backend';
import { buildLLMSnapshotContext } from '../utils/snapshotContext';

export const AnalysisPage: React.FC = () => {
  const { snapshot } = useApp();
  const [goals, setGoals] = useState('');
  const { setChatHistory } = useChat();
  const [loading, setLoading] = useState(false);
  const [showContext, setShowContext] = useState(false);

  const compactContext = useMemo(() => (snapshot ? buildLLMSnapshotContext(snapshot) : null), [snapshot]);

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
      <Box sx={{ mt: 3 }}>
        <FormControlLabel
          control={<Switch checked={showContext} onChange={(e) => setShowContext(e.target.checked)} />}
          label="Show condensed LLM context (advanced)"
        />
      </Box>
      <Collapse in={showContext}>
        <Paper variant="outlined" sx={{ p: 2, mt: 1, overflowX: 'auto' }}>
          {compactContext ? (
            <pre style={{ margin: 0 }}>{JSON.stringify(compactContext, null, 2)}</pre>
          ) : (
            <Typography color="text.secondary">Load a snapshot to view the generated context.</Typography>
          )}
        </Paper>
      </Collapse>
    </div>
  );
};
