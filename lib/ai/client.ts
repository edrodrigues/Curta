import "server-only";
import { createOpenAI } from "@ai-sdk/openai";

const API_KEY = process.env.CHEAPER_INFERENCE_API_KEY;
const BASE_URL = "https://api.cheaperinference.com/v1";

if (!API_KEY) {
  throw new Error(
    "CHEAPER_INFERENCE_API_KEY ausente. Defina-a em .env.local (server-only)."
  );
}

export const cheaper = createOpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

export const SCRIPT_MODEL_ID = "deepseek-v4-flash";

export const scriptModel = cheaper.chat(SCRIPT_MODEL_ID);