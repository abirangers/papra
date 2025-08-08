import mammoth from 'mammoth';
import { defineTextExtractor } from '../extractors.models';
import { Buffer } from 'node:buffer';

export const docxExtractorDefinition = defineTextExtractor({
  name: 'docx',
  mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  extract: async ({ arrayBuffer /*, config, mimeType */ }) => {
    console.log(`DOCX Extractor: Received arrayBuffer with size: ${arrayBuffer.byteLength}`);
    const { value, messages } = await mammoth.extractRawText({
      buffer: Buffer.from(arrayBuffer),
    });
    console.log(`DOCX Extractor: Mammoth messages: ${JSON.stringify(messages)}`);
    console.log(`DOCX Extractor: Extracted value length: ${value.length}`);
    return { content: value };
  },
});