import "server-only";

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export type AiProviderName = "openai" | "anthropic";
export type AiPurpose =
  | "conversation"
  | "decision_frame"
  | "decision_analysis"
  | "home_ask"
  | "home_status";

type JsonSchema = Record<string, unknown>;

type GenerateOptions = {
  purpose: AiPurpose;
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens: number;
};

type GenerateStructuredOptions = GenerateOptions & {
  schemaName: string;
  schema: JsonSchema;
};

export class AiConfigurationError extends Error {
  constructor() {
    super("AI provider is not configured.");
    this.name = "AiConfigurationError";
  }
}

export class AiProviderError extends Error {
  constructor() {
    super("AI provider request failed.");
    this.name = "AiProviderError";
  }
}

export function configuredAiProvider(): AiProviderName {
  const configured = String(process.env.LIFE_CFO_AI_PROVIDER || "openai")
    .trim()
    .toLowerCase();
  if (configured === "claude") return "anthropic";
  if (configured === "openai" || configured === "anthropic") return configured;
  throw new AiConfigurationError();
}

function modelFor(provider: AiProviderName, purpose: AiPurpose): string {
  if (provider === "anthropic") {
    const anthropicDefaults: Record<AiPurpose, string> = {
      conversation: "claude-sonnet-5",
      decision_frame: "claude-sonnet-5",
      decision_analysis: "claude-haiku-4-5-20251001",
      home_ask: "claude-haiku-4-5-20251001",
      home_status: "claude-haiku-4-5-20251001",
    };
    const purposeKey = `ANTHROPIC_MODEL_${purpose.toUpperCase()}`;
    return (
      process.env[purposeKey] ||
      process.env.ANTHROPIC_MODEL ||
      anthropicDefaults[purpose]
    );
  }

  const defaults: Record<AiPurpose, string> = {
    conversation: "gpt-4.1",
    decision_frame: "gpt-4.1",
    decision_analysis: "gpt-4o-mini-2024-07-18",
    home_ask: "gpt-4o-mini",
    home_status: "gpt-4o-mini",
  };
  const purposeOverride = process.env[`OPENAI_MODEL_${purpose.toUpperCase()}`];
  if (purposeOverride) return purposeOverride;
  if (purpose === "decision_frame") {
    return process.env.OPENAI_MODEL_FRAME || process.env.OPENAI_MODEL || defaults[purpose];
  }
  if (purpose === "conversation" || purpose === "decision_analysis") {
    return process.env.OPENAI_MODEL || defaults[purpose];
  }
  return defaults[purpose];
}

function openAiClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new AiConfigurationError();
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function anthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiConfigurationError();
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function textFromAnthropicResponse(content: Anthropic.ContentBlock[]): string {
  return content
    .filter(
      (block): block is Anthropic.TextBlock => block.type === "text"
    )
    .map((block) => block.text)
    .join("")
    .trim();
}

async function anthropicRequest(
  options: GenerateOptions,
  schema?: JsonSchema
): Promise<string> {
  let message: Anthropic.Message;
  try {
    message = await anthropicClient().messages.create(
      {
        model: modelFor("anthropic", options.purpose),
        max_tokens: options.maxOutputTokens,
        system: options.system,
        messages: [{ role: "user", content: options.prompt }],
        // Note: `temperature` is intentionally not forwarded here. Newer Claude
        // models (e.g. claude-sonnet-5) reject the parameter outright ("temperature
        // is deprecated for this model"), and there's no forward-compatible way to
        // know per-model support, so the Anthropic branch always uses the model's
        // default sampling instead of the caller-supplied value.
        ...(schema
          ? {
              output_config: {
                format: {
                  type: "json_schema",
                  schema,
                },
              },
            }
          : {}),
      },
      { timeout: 60_000 }
    );
  } catch (error) {
    if (error instanceof AiConfigurationError) throw error;
    throw new AiProviderError();
  }

  const text = textFromAnthropicResponse(message.content);
  if (!text) throw new AiProviderError();
  return text;
}

export async function generateAiText(options: GenerateOptions): Promise<string> {
  const provider = configuredAiProvider();
  if (provider === "anthropic") return anthropicRequest(options);

  const response = await openAiClient().responses.create({
    model: modelFor("openai", options.purpose),
    input: [
      { role: "system", content: options.system },
      { role: "user", content: options.prompt },
    ],
    temperature: options.temperature,
    max_output_tokens: options.maxOutputTokens,
  });
  const text = String(response.output_text || "").trim();
  if (!text) throw new AiProviderError();
  return text;
}

export async function generateAiStructured<T = unknown>(
  options: GenerateStructuredOptions
): Promise<T> {
  const provider = configuredAiProvider();
  const raw =
    provider === "anthropic"
      ? await anthropicRequest(options, {
          ...options.schema,
        })
      : String(
          (
            await openAiClient().responses.create({
              model: modelFor("openai", options.purpose),
              input: [
                { role: "system", content: options.system },
                { role: "user", content: options.prompt },
              ],
              temperature: options.temperature,
              max_output_tokens: options.maxOutputTokens,
              text: {
                format: {
                  type: "json_schema",
                  name: options.schemaName,
                  strict: true,
                  schema: options.schema,
                },
              },
            })
          ).output_text || ""
        ).trim();

  if (!raw) throw new AiProviderError();
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new AiProviderError();
  }
}
