import type { Logger } from '@crowlog/logger';
import type { Config } from '../config/config.types';
import { extractText } from '@papra/lecture';
import mime from 'mime-types';

import { createLogger } from '../shared/logger/logger';

export async function getFileSha256Hash({ file }: { file: File }) {
  const arrayBuffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashHex = Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

  return {
    hash: hashHex,
  };
}

export async function extractDocumentText({
  file,
  ocrLanguages,
  config,
  logger = createLogger({ namespace: 'documents:services' }),
}: {
  file: File;
  ocrLanguages?: string[];
  logger?: Logger;
  config: Config;
}) {
  const arrayBuffer = await file.arrayBuffer();
  const lookedUp = mime.lookup(file.name);
  const safeMimeType = file.type && file.type !== 'application/octet-stream'
    ? file.type
    : (lookedUp === false ? 'application/octet-stream' : lookedUp);

  const { textContent, error, extractorName } = await extractText({
    arrayBuffer,
    mimeType: safeMimeType,
    config: { tesseract: { languages: ocrLanguages }, gemini: { apiKey: config.gemini.apiKey } },
  });

  if (error) {
    logger.error({ error, extractorName }, 'Error while extracting text from document');
  }

  return {
    text: textContent ?? '',
  };
}
