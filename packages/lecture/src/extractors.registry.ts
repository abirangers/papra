import type { ExtractorDefinition } from './extractors.models';
import { docxExtractorDefinition } from './extractors/docx.extractor';
import { imageExtractorDefinition } from './extractors/img.extractor';
import { pdfExtractorDefinition } from './extractors/pdf.extractor';
import { txtExtractorDefinition } from './extractors/txt.extractor';

export const extractorDefinitions: ExtractorDefinition[] = [
  pdfExtractorDefinition,
  txtExtractorDefinition,
  imageExtractorDefinition,
  docxExtractorDefinition,
];

export function getExtractor({
  mimeType,
  extractors = extractorDefinitions,
}: {
  mimeType: string;
  extractors?: ExtractorDefinition[];
}) {
  console.log(`[Extractor Registry] Getting extractor for MIME type: "${mimeType}"`);
  const wilcardedMimeType = mimeType.replace(/\/.*/, '/*');
  const extractor = extractors.find(extractor => extractor.mimeTypes.includes(mimeType) || extractor.mimeTypes.includes(wilcardedMimeType));

  if (!extractor) {
    console.log(`[Extractor Registry] No extractor found for MIME type: "${mimeType}"`);
  }

  return {
    extractor,
  };
}
