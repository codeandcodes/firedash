import type { Snapshot } from '@types/schema'
import type { ChatMessage } from '@state/ChatContext'
import { buildLLMSnapshotContext } from '../utils/snapshotContext'

type BackendRequest =
  | { goals: string; snapshot: Snapshot; history?: ChatMessage[] }
  | { prompt: string; context?: any; history?: ChatMessage[] }

const ANALYSIS_PROMPT = (goals: string, snapshot: Snapshot) => `
**System Prompt:**
You are a financial analyst. Your task is to analyze the user's portfolio for any weaknesses in terms of longevity and wealth preservation. Provide a detailed analysis and actionable recommendations.

**User Goals:**
${goals}

**User Portfolio Snapshot:**
${JSON.stringify(buildLLMSnapshotContext(snapshot), null, 2)}

**Analysis Request:**
Based on the user's goals and portfolio snapshot, provide a detailed analysis that covers:
1. **Asset Allocation:** Suitability for goals and specific adjustments.
2. **Longevity:** Project runway vs. retirement target.
3. **Goals:** Feasibility and concrete next steps.
4. **Weaknesses:** Risks to longevity and wealth preservation.

Respond in clear Markdown with actionable guidance.
`

const CHAT_PROMPT = (prompt: string, context?: any) => `
You are Firedash's financial planning copilot. Answer follow-up questions using the provided context when available and keep responses concise but actionable. Format responses in Markdown.
${context ? `\nContext:\n${JSON.stringify(context, null, 2)}` : ''}

User request:
${prompt}
`

export const callBackendApi = async (data: BackendRequest, onChunk: (chunk: string) => void): Promise<void> => {
  const history = data.history || []
  let prompt: string

  if ('snapshot' in data) {
    prompt = ANALYSIS_PROMPT(data.goals, data.snapshot)
  } else {
    prompt = CHAT_PROMPT(data.prompt, data.context)
  }

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, history }),
  });

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    onChunk(chunk);
  }
};
