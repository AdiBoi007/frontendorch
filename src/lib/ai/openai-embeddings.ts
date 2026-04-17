import OpenAI from "openai";
import type { AppEnv } from "../../config/env.js";
import type { EmbeddingProvider } from "./provider.js";

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;

  constructor(private readonly env: AppEnv) {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async embedText(input: string) {
    try {
      const response = await this.client.embeddings.create({
        model: this.env.OPENAI_EMBEDDING_MODEL,
        input
      });

      return response.data[0]?.embedding ?? [];
    } catch {
      return Array.from({ length: 12 }, (_, index) => ((input.charCodeAt(index % Math.max(input.length, 1)) || 7) % 11) / 11);
    }
  }
}
