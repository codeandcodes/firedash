
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable not set.');
}

const genAI = new GoogleGenerativeAI(API_KEY);



app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, history } = req.body;

    if (!prompt) {
      return res.status(400).send('Prompt is required.');
    }

    const generationConfig = {
      maxOutputTokens: 8192,
      temperature: 1,
      topP: 0.95,
    };

    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ];

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
      generationConfig,
      safetySettings,
    });

    const chat = model.startChat({
      history: history || [],
    });

    const result = await chat.sendMessageStream(prompt);

    res.setHeader('Content-Type', 'text/plain');
    res.flushHeaders();

    for await (const chunk of result.stream) {
      res.write(chunk.text());
    }

    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while generating content.');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
