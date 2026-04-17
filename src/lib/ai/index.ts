import type { AppEnv } from "../../config/env.js";
import { AnthropicGenerationProvider } from "./anthropic.js";
import { MockEmbeddingProvider, MockGenerationProvider } from "./mock.js";
import { OpenAiEmbeddingProvider } from "./openai-embeddings.js";

export function createGenerationProvider(env: AppEnv) {
  if (env.ANTHROPIC_API_KEY) {
    return new AnthropicGenerationProvider(env);
  }

  return new MockGenerationProvider();
}

export function createEmbeddingProvider(env: AppEnv) {
  if (env.OPENAI_API_KEY) {
    return new OpenAiEmbeddingProvider(env);
  }

  return new MockEmbeddingProvider();
}
