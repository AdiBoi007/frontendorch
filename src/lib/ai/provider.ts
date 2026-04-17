import { z } from "zod";

export interface GenerationInput<TSchema extends z.ZodTypeAny> {
  prompt: string;
  schema: TSchema;
  systemPrompt?: string;
  fallback: () => z.infer<TSchema>;
}

export interface GenerationProvider {
  generateObject<TSchema extends z.ZodTypeAny>(input: GenerationInput<TSchema>): Promise<z.infer<TSchema>>;
}

export interface EmbeddingProvider {
  embedText(input: string): Promise<number[]>;
}
