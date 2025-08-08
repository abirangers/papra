import { Buffer } from 'node:buffer';
import { GoogleGenAI } from '@google/genai';
import { defineTextExtractor } from '../extractors.models';

export const imageExtractorDefinition = defineTextExtractor({
  name: 'gemini',
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

    const buffer = arrayBuffer instanceof ArrayBuffer ? Buffer.from(arrayBuffer) : arrayBuffer;

    const imagePart = {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType,
      },
    } as const;

    const instructionPart = {
      text: [
        'You are a highly specialized text extraction engine. Extract ALL textual content from the image.',
        'Preserve line breaks and spacing. Output ONLY the raw extracted text with no extra words.',
      ].join('\n'),
    } as const;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [imagePart, instructionPart],
        },
      ],
    });

    const content = response.text.trim();
    return { content };
  },
});
