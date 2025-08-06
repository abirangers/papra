import type { DeepPartial } from '@corentinth/chisels';

export type ExtractorConfig = {
  tesseract: {
    languages: string[];
  };
  gemini: {
    apiKey?: string;
  };
};

export type PartialExtractorConfig = undefined | DeepPartial<ExtractorConfig>;
