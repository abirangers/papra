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

    const prompt = `You are a highly specialized text extraction engine. Your sole purpose is to extract raw, unformatted text from the provided document content.
                    **Instructions:**
                    1.  Analyze the document content below.
                    2.  Extract ALL text content exactly as it appears.
                    3.  Preserve original line breaks, spacing, and paragraphs.
                    4.  Your output must be ONLY the raw text content. Do not add any titles, summaries, explanations, or any other text before or after the extracted content.

                    **Content to Process:**
                    \`\`\`
                    ${documentContent}
                    \`\`\``;
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
