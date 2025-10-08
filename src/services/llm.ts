export const callGeminiApi = async (apiKey: string, data: any): Promise<string> => {
  const { goals, snapshot } = data;

  const prompt = `
    **User Goals:**
    ${goals}

    **User Portfolio Snapshot:**
    ${JSON.stringify(snapshot, null, 2)}

    **Analysis Request:**
    Based on the user's goals and portfolio snapshot, please provide a detailed analysis of their financial situation. The analysis should cover the following aspects:

    1.  **Asset Allocation:** Evaluate the current asset allocation and its suitability for the user's stated goals. Provide specific recommendations for adjustments if necessary.
    2.  **Longevity:** Project how long the user's portfolio is likely to last based on their current spending and savings rate. Compare this to their target retirement age.
    3.  **Goals:** Assess the feasibility of the user's financial goals and provide actionable steps they can take to achieve them.

    Please provide a clear, concise, and actionable analysis.
  `;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  const result = await response.json();
  return result.candidates[0].content.parts[0].text;
};