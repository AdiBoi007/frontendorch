import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AppEnv } from "../../config/env.js";
import type { GenerationInput, GenerationProvider } from "./provider.js";

export class AnthropicGenerationProvider implements GenerationProvider {
  private readonly client: Anthropic;

  constructor(private readonly env: AppEnv) {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
  }

  async generateObject<TSchema extends z.ZodTypeAny>(input: GenerationInput<TSchema>) {
    try {
      const response = await this.client.messages.create({
        model: this.env.ANTHROPIC_MODEL_REASONING,
        max_tokens: 4000,
        system:
          input.systemPrompt ??
          "Return valid JSON only. Do not include markdown fences, commentary, or omitted fields.",
        messages: [
          {
            role: "user",
            content: input.prompt
          }
        ]
      });

      const text = response.content
        .map((part) => ("text" in part ? part.text : ""))
        .join("")
        .trim();
      return input.schema.parse(JSON.parse(text));
    } catch {
      return input.schema.parse(input.fallback());
    }
  }
}
