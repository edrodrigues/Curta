import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { scriptModel } from "./client";
import type { Brief } from "@/lib/types";

export const briefSchema = z.object({
  produto: z
    .string()
    .min(2)
    .max(120)
    .describe("Nome curto do produto/marca (ex.: 'Curta', 'Nubank Pix')."),
  publico_alvo: z
    .string()
    .min(4)
    .max(180)
    .describe("Descrição curta do público-alvo (ex.: 'Pequenos empresários 25-45 anos')."),
  objetivo: z
    .string()
    .min(3)
    .max(80)
    .describe("Objetivo do vídeo em poucas palavras (ex.: 'conversão', 'awareness', 'explicação de produto')."),
  tom: z
    .string()
    .min(3)
    .max(60)
    .describe("Tom de voz (ex.: 'jovem e descontraído', 'corporativo', 'divertido')."),
  idioma: z
    .string()
    .min(2)
    .max(8)
    .describe("Idioma da narração como código BCP-47 (ex.: 'pt-BR', 'en-US', 'es-ES')."),
  cta: z
    .string()
    .min(3)
    .max(160)
    .describe("Chamada para ação + link/destino (ex.: 'Acesse curta.app agora')."),
  estilo_visual: z
    .string()
    .min(3)
    .max(60)
    .describe("Estilo de animação (ex.: 'motion graphics 2D flat', 'kinetic typography')."),
  referencias: z
    .string()
    .min(0)
    .max(220)
    .describe("Restrições/cores de marca/elementos a evitar, ou vazio se nada."),
});

export type SuggestedBrief = z.infer<typeof briefSchema>;

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
  } catch {
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

function buildBriefSystemPrompt(durationSeconds: 30 | 60): string {
  return [
    "Você é um analista de marketing. A partir do conteúdo de uma página web, extraia um BRIEF para um vídeo publicitário curto.",
    `Duração alvo do vídeo: ${durationSeconds} segundos.`,
    "Responda SOMENTE um JSON válido no formato definido pelo schema.",
    "Use exatamente o que estiver visível na página. Não invente produto, marca ou CTA que não estejam no conteúdo.",
    "Se um campo não puder ser inferido, preencha com um valor genérico curto (ex.: 'divulgado', 'público geral', 'motion graphics 2D flat').",
    "Em 'referencias' inclua paleta de cores óbvia da marca se houver; caso contrário, deixe vazio.",
    "Sem comentários, sem markdown, sem texto fora do JSON.",
  ].join(" ");
}

function buildBriefUserPrompt(url: URL, pageText: string): string {
  return [
    `Site de origem: ${url.hostname}`,
    `URL: ${url.toString()}`,
    "---",
    "Conteúdo extraído da página (pode estar truncado):",
    pageText,
  ].join("\n");
}

export async function generateBrief(params: {
  url: string;
  durationSeconds: 30 | 60;
}): Promise<Brief> {
  const url = toAbsoluteUrl(params.url);
  const pageText = await fetchPageText(url);

  try {
    const { object } = await generateObject({
      model: scriptModel,
      schema: briefSchema,
      schemaName: "brief",
      system: buildBriefSystemPrompt(params.durationSeconds),
      prompt: buildBriefUserPrompt(url, pageText),
      temperature: 0.4,
      providerOptions: {
        openai: { strictJsonSchema: true },
      },
    });
    return { ...object };
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
      err?.message ?? "Falha ao extrair brief do link.",
      "unknown",
      status
    );
  }
}