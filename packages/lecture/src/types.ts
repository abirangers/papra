import type { DeepPartial } from '@corentinth/chisels';

export type ExtractorConfig = {
  tesseract: {
    languages: string[];
  };
  ollama: {
    baseUrl: string;
    model: string;
    embeddingModel: string;
  };
};

export type PartialExtractorConfig = undefined | DeepPartial<ExtractorConfig>;
