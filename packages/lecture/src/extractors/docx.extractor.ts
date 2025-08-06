import type { Extractor } from '../extractors.models';
import mammoth from 'mammoth';

export const extract: Extractor = async ({ file }) => {
  const { value } = await mammoth.extractRawText({
    buffer: file,
  });

  return {
    content: value,
  };
};

export const docxExtractorDefinition = {
  name: 'docx',
  mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  extract,
};
