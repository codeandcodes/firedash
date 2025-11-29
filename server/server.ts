
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

const llmProvider = process.env.LLM_PROVIDER || 'GEMINI';
const geminiModel = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4';

let genAI: GoogleGenerativeAI | undefined;
let openai: OpenAI | undefined;

if (llmProvider === 'GEMINI') {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable not set for GEMINI provider.');
  }
  genAI = new GoogleGenerativeAI(API_KEY);
} else if (llmProvider === 'OPENAI') {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}

class ThinkingFilter {
  private insideThinkingTag = false;
  private tagBuffer = '';

  transform(chunk: string): string {
    let output = '';
    let i = 0;

    while (i < chunk.length) {
      if (this.insideThinkingTag) {
        const tagEnd = chunk.indexOf('</think', i);
        if (tagEnd !== -1) {
          const tagEndEnd = chunk.indexOf('>', tagEnd);
          if (tagEndEnd !== -1) {
            this.insideThinkingTag = false;
            i = tagEndEnd + 1;
          } else {
            i = chunk.length;
          }
        } else {
          i = chunk.length;
        }
      } else {
        const tagStart = chunk.indexOf('<think', i);
        if (tagStart !== -1) {
          output += chunk.substring(i, tagStart);
          const tagStartEnd = chunk.indexOf('>', tagStart);
          if (tagStartEnd !== -1) {
            this.insideThinkingTag = true;
            i = tagStartEnd + 1;
          } else {
            this.tagBuffer = chunk.substring(tagStart);
            i = chunk.length;
          }
        } else {
          output += chunk.substring(i);
          i = chunk.length;
        }
      }
    }
    return output;
  }
}

app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, history } = req.body;

    if (!prompt) {
      return res.status(400).send('Prompt is required.');
    }

    res.setHeader('Content-Type', 'text/plain');
    res.flushHeaders();

    const thinkingFilter = new ThinkingFilter();

    if (llmProvider === 'GEMINI' && genAI) {
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
        model: geminiModel,
        generationConfig,
        safetySettings,
      });

      const chat = model.startChat({
        history: history || [],
      });

      const result = await chat.sendMessageStream(prompt);

      for await (const chunk of result.stream) {
        res.write(thinkingFilter.transform(chunk.text()));
      }
    } else if (llmProvider === 'OPENAI' && openai) {
      const stream = await openai.chat.completions.create({
        model: openaiModel,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      });

      for await (const chunk of stream) {
        res.write(thinkingFilter.transform(chunk.choices[0]?.delta?.content || ''));
      }
    } else {
      return res.status(500).send('LLM provider not configured correctly.');
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
