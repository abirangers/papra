import { Buffer } from 'node:buffer';
import { GoogleGenAI } from '@google/genai';
import { defineTextExtractor } from '../extractors.models';

export const imageExtractorDefinition = defineTextExtractor({
  name: 'gemini', // Changed name to reflect the new engine
  mimeTypes: [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ],
  extract: async ({ arrayBuffer, config, mimeType }) => {
    const { apiKey } = config.gemini;

    if (!apiKey) {
      throw new Error('Gemini API key is missing. Please provide it in the configuration.');
    }

    const genAI = new GoogleGenAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = "Extract all text from this document. Provide only the text content without any additional formatting or explanation.";

    const buffer = arrayBuffer instanceof ArrayBuffer ? Buffer.from(arrayBuffer) : arrayBuffer;

    const imagePart = {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType,
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const content = response.text();

    return { content };
  },
});
