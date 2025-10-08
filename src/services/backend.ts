export const callBackendApi = async (data: any, onChunk: (chunk: string) => void): Promise<void> => {
  const { goals, snapshot, history } = data;

  const prompt = `
    **System Prompt:**
    You are a financial analyst. Your task is to analyze the user's portfolio for any weaknesses in terms of longevity and wealth preservation. Provide a detailed analysis and actionable recommendations.

    **User Goals:**
    ${goals}

    **User Portfolio Snapshot:**
    ${JSON.stringify(snapshot, null, 2)}

    **Analysis Request:**
    Based on the user's goals and portfolio snapshot, please provide a detailed analysis of their financial situation. The analysis should cover the following aspects:

    1.  **Asset Allocation:** Evaluate the current asset allocation and its suitability for the user's stated goals. Provide specific recommendations for adjustments if necessary.
    2.  **Longevity:** Project how long the user's portfolio is likely to last based on their current spending and savings rate. Compare this to their target retirement age.
    3.  **Goals:** Assess the feasibility of the user's financial goals and provide actionable steps they can take to achieve them.
    4.  **Weaknesses:** Identify any potential weaknesses in the portfolio in terms of longevity and wealth preservation.

    Please provide a clear, concise, and actionable analysis in Markdown format.
  `;

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