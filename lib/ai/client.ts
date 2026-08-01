import "server-only";
import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";

const BASE_URL = "https://api.cheaperinference.com/v1";

export const SCRIPT_MODEL_ID = "deepseek-v4-flash";

let _provider: OpenAIProvider | null = null;

function getProvider(): OpenAIProvider {
  if (_provider) return _provider;
  const apiKey = process.env.CHEAPER_INFERENCE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CHEAPER_INFERENCE_API_KEY ausente. Defina-a em .env.local (server-only)."
    );
  }
  _provider = createOpenAI({ apiKey, baseURL: BASE_URL });
  return _provider;
}

export function getScriptModel() {
  return getProvider().chat(SCRIPT_MODEL_ID);
}