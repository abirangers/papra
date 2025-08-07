import { Buffer } from 'node:buffer';
import { Ollama } from 'ollama';
import { defineTextExtractor } from '../extractors.models';

export const imageExtractorDefinition = defineTextExtractor({
  name: 'ollama',
  mimeTypes: [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ],
  extract: async ({ arrayBuffer, config }) => {
    const { baseUrl, model } = config.ollama;

    const ollamaClient = new Ollama({ host: baseUrl });

    const prompt = "Extract all text from this document. Provide only the text content without any additional formatting or explanation.";

    const buffer = arrayBuffer instanceof ArrayBuffer ? Buffer.from(arrayBuffer) : arrayBuffer;
    const image = buffer.toString('base64');

    const result = await ollamaClient.generate({
      model,
      prompt,
      images: [image],
    });

    return { content: result.response };
  },
});
