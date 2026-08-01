import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { scriptModel } from "./client";

export const scriptSchema = z.object({
  titulo: z
    .string()
    .min(4)
    .max(90)
    .describe("Título curto e convidativo do vídeo, em português do Brasil."),
  cenas: z
    .array(z.string().min(8).max(280))
    .min(1)
    .max(12)
    .describe(
      "Lista de cenas (uma sentença por cena), em português do Brasil, em ordem narrativa."
    ),
});

export type SuggestedScript = z.infer<typeof scriptSchema>;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_CHARS = 6_000;

export class GenerateScriptError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "invalid_url"
      | "fetch_failed"
      | "empty_content"
      | "provider"
      | "unknown",
    public readonly status?: number
  ) {
    super(message);
    this.name = "GenerateScriptError";
  }
}

function toAbsoluteUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  } catch {
    throw new GenerateScriptError("Link inválido.", "invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new GenerateScriptError("Protocolo não suportado.", "invalid_url");
  }
  return url;
}

async function fetchPageText(url: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Curta/1.0 (sugestao-de-roteiro)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      },
    });
  } catch (e) {
    clearTimeout(timer);
    throw new GenerateScriptError(
      "Não foi possível acessar o site.",
      "fetch_failed"
    );
  }
  clearTimeout(timer);
  if (!res.ok) {
    throw new GenerateScriptError(
      `Site respondeu ${res.status}.`,
      "fetch_failed",
      res.status
    );
  }
  const html = await res.text();
  const text = extractVisibleText(html);
  if (text.trim().length < 40) {
    throw new GenerateScriptError(
      "Não foi possível extrair conteúdo útil da página.",
      "empty_content"
    );
  }
  return text.slice(0, MAX_PAGE_CHARS);
}

function extractVisibleText(html: string): string {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const noHead = noComments.replace(/<head[\s\S]*?<\/head>/gi, " ");
  const noScripts = noHead
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const noTags = noScripts.replace(/<[^>]+>/g, " ");
  const collapsed = noTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed;
}

function buildSystemPrompt(durationSeconds: 30 | 60): string {
  const cenasTarget = Math.round(durationSeconds / 6);
  const wordLimit = durationSeconds === 60 ? 140 : 70;
  return [
    "Você é um roteirista de vídeos explicativos curtos em português do Brasil (pt-BR).",
    "A partir do conteúdo enviado, crie um roteiro de vídeo explicativo.",
    `Duração alvo: ${durationSeconds} segundos (~${wordLimit} palavras).`,
    `Divida em exatamente ${cenasTarget} cenas; cada cena é UMA sentença curta.`,
    "Cada cena descreve uma ação visual concreta que possa virar um clipe de vídeo (texto-para-vídeo).",
    "Responda SOMENTE um JSON válido no formato { titulo, cenas }.",
    "Sem comentários, sem markdown, sem texto fora do JSON.",
  ].join(" ");
}

function buildUserPrompt(url: URL, pageText: string): string {
  return [
    `Site de origem: ${url.hostname}`,
    `URL: ${url.toString()}`,
    "---",
    "Conteúdo extraído da página (pode estar truncado):",
    pageText,
  ].join("\n");
}

export async function generateScript(params: {
  url: string;
  durationSeconds: 30 | 60;
}): Promise<SuggestedScript> {
  const url = toAbsoluteUrl(params.url);
  const pageText = await fetchPageText(url);

  try {
    const { object } = await generateObject({
      model: scriptModel,
      schema: scriptSchema,
      schemaName: "roteiro",
      system: buildSystemPrompt(params.durationSeconds),
      prompt: buildUserPrompt(url, pageText),
      temperature: 0.7,
      providerOptions: {
        openai: { strictJsonSchema: true },
      },
    });
    return object;
  } catch (e: unknown) {
    const err = e as { name?: string; statusCode?: number; message?: string };
    const status = err?.statusCode;
    if (status === 402) {
      throw new GenerateScriptError(
        "Serviço de IA sem saldo. Tente novamente mais tarde.",
        "provider",
        status
      );
    }
    if (status === 429 || status === 503) {
      throw new GenerateScriptError(
        "Serviço de IA temporariamente indisponível. Tente novamente.",
        "provider",
        status
      );
    }
    throw new GenerateScriptError(
      err?.message ?? "Falha ao gerar roteiro.",
      "unknown",
      status
    );
  }
}