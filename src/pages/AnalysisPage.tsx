import React, { useState, useEffect } from 'react';
import { useApp } from '@state/AppContext';
import { Button, TextField, Typography, Paper, Box } from '@mui/material';
import { callBackendApi } from '../services/backend';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { saveAnalysisCache, loadAnalysisCache } from '../state/analysisCache';

// Mock LLM analysis function
const getAnalysis = async (data: any): Promise<string> => {
  const { goals, snapshot } = data;

  // Basic analysis based on goals
  let analysis = ``;
  if (goals.includes('FIRE') || goals.includes('retire early')) {
    analysis += `**Goal: Financial Independence, Retire Early (FIRE)**\n\n`;
    analysis += `Your portfolio is currently valued at **$${(snapshot.totalValue || 0).toLocaleString()}**. To achieve FIRE, you'll need to focus on aggressive growth and a high savings rate. Let's break down your current standing:\n\n`;
  } else if (goals.includes('wealth preservation')) {
    analysis += `**Goal: Wealth Preservation**\n\n`;
    analysis += `Your primary goal is to preserve your current wealth of **$${(snapshot.totalValue || 0).toLocaleString()}**. This means focusing on low-risk investments and minimizing volatility.\n\n`;
  } else {
    analysis += `**Goal: General Portfolio Growth**\n\n`;
    analysis += `You're looking to grow your portfolio, currently valued at **$${(snapshot.totalValue || 0).toLocaleString()}**. Let's look at your asset allocation to see if it aligns with this goal.\n\n`;
  }

  // Asset Allocation Analysis
  analysis += `**Asset Allocation:**\n`;
  const { weights } = snapshot.allocations;
  Object.entries(weights).forEach(([assetClass, weight]) => {
    analysis += `* **${assetClass}:** ${( (weight as number) * 100).toFixed(2)}%\n`;
  });
  analysis += `\nThis allocation seems [reasonable/aggressive/conservative] for your goal of ${goals}.\n\n`;

  // Longevity Analysis
  analysis += `**Longevity:**\n`;
  analysis += `Based on your current spending and savings rate, your portfolio is projected to last until you are **[AGE]**. This is [above/below] your target retirement age of **${snapshot.retirement?.target_age || 'N/A'}**.\n\n`;

  // Recommendations
  analysis += `**Recommendations:**\n`;
  analysis += `* Consider [increasing/decreasing] your allocation to stocks to better align with your risk tolerance.\n`;
  analysis += `* Your emergency fund seems [adequate/inadequate]. Consider having 3-6 months of expenses saved.\n`;
  analysis += `* [Further recommendations based on a more detailed analysis]...\n`;

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(analysis);
    }, 1000);
  });
};

export const AnalysisPage: React.FC = () => {
  const { snapshot } = useApp();
  const [goals, setGoals] = useState('');
  const [analysis, setAnalysis] = useState(loadAnalysisCache()?.analysis || '');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: string; parts: { text: string }[] }[]>(loadAnalysisCache()?.chatHistory || []);
  const [userMessage, setUserMessage] = useState('');

  useEffect(() => {
    saveAnalysisCache({ analysis, chatHistory });
  }, [analysis, chatHistory]);

  const handleClear = () => {
    setAnalysis('');
    setChatHistory([]);
    saveAnalysisCache({ analysis: '', chatHistory: [] });
  };

  const handleAnalysis = async () => {
    if (!snapshot) {
      alert('Please upload a snapshot first.');
      return;
    }

    setLoading(true);
    setAnalysis('');
    setChatHistory([]);
    try {
      const data = {
        goals,
        snapshot,
      };
      await callBackendApi(data, (chunk) => {
        setAnalysis((prev) => prev + chunk);
      });
    } catch (error) {
      alert(`Error: ${(error as Error).message}`);
    }
    setLoading(false);
  };

  const handleSendMessage = async () => {
    if (!userMessage) {
      return;
    }

    const newChatHistory = [...chatHistory, { role: 'user', parts: [{ text: userMessage }] }];
    setChatHistory(newChatHistory);
    setUserMessage('');
    setLoading(true);

    try {
      const data = {
        goals,
        snapshot,
        history: newChatHistory,
      };
      let llmResponse = '';
      await callBackendApi(data, (chunk) => {
        llmResponse += chunk;
      });
      setChatHistory([...newChatHistory, { role: 'model', parts: [{ text: llmResponse }] }]);
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
      <Button variant="outlined" onClick={handleClear} sx={{ ml: 2 }}>
        Clear / Start Again
      </Button>

      {analysis && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>
            Analysis Results
          </Typography>
          <Paper elevation={3} sx={{ p: 3 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
          </Paper>

          <Box sx={{ mt: 4 }}>
            {chatHistory.map((chat, index) => (
              <Paper key={index} elevation={1} sx={{ p: 2, mb: 2, bgcolor: chat.role === 'user' ? '#f0f0f0' : '#fff' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{chat.parts[0].text}</ReactMarkdown>
              </Paper>
            ))}
          </Box>

          <Box sx={{ mt: 2, display: 'flex' }}>
            <TextField
              label="Ask a follow-up question"
              fullWidth
              variant="outlined"
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
            />
            <Button variant="contained" onClick={handleSendMessage} disabled={loading} sx={{ ml: 2 }}>
              Send
            </Button>
          </Box>
        </Box>
      )}
    </div>
  );
};
