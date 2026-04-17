import type { AppEnv } from "../../config/env.js";
import { AnthropicGenerationProvider } from "./anthropic.js";
import { MockEmbeddingProvider, MockGenerationProvider, MockTranscriptionProvider } from "./mock.js";
import { OpenAiEmbeddingProvider } from "./openai-embeddings.js";
import { OpenAiTranscriptionProvider } from "./openai-transcription.js";

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

export function createTranscriptionProvider(env: AppEnv) {
  if (env.OPENAI_API_KEY) {
    return new OpenAiTranscriptionProvider(env);
  }

  return new MockTranscriptionProvider();
}
