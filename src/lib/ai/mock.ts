import { z } from "zod";
import type { EmbeddingProvider, GenerationInput, GenerationProvider } from "./provider.js";

export class MockGenerationProvider implements GenerationProvider {
  async generateObject<TSchema extends z.ZodTypeAny>(input: GenerationInput<TSchema>) {
    return input.schema.parse(input.fallback());
  }
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  async embedText(input: string) {
    const values = Array.from({ length: 12 }, (_, index) => ((input.charCodeAt(index % Math.max(input.length, 1)) || 7) % 13) / 13);
    return values;
  }
}
