import "server-only";
import { generateText } from "ai";
import { getScriptModel } from "./client";
import type { Brief, Cena, RoteiroOutput, RoteiroVoz } from "@/lib/types";

export class GenerateRoteiroError extends Error {
  constructor(
    message: string,
    public readonly kind: "invalid_input" | "provider" | "parse" | "unknown",
    public readonly status?: number
  ) {
    super(message);
    this.name = "GenerateRoteiroError";
  }
}

const PROMPT_TEMPLATE = `Você é um roteirista especializado em vídeos animados curtos de até 30 segundos, com foco em conteúdo publicitário e institucional. Seu trabalho é transformar os inputs abaixo em um roteiro técnico completo, pronto para produção.

## INPUTS DO USUÁRIO

- Produto/Marca: {{produto}}
- Público-alvo: {{publico_alvo}}
- Objetivo do vídeo (ex: conversão, awareness, explicação de produto): {{objetivo}}
- Tom de voz (ex: jovem e descontraído, corporativo, divertido): {{tom}}
- Idioma da narração: {{idioma}}
- Duração total: {{duracao}} (padrão: 30 segundos)
- CTA (chamada para ação) e link/destino: {{cta}}
- Estilo visual de animação (ex: motion graphics 2D flat, 3D, kinetic typography, whiteboard): {{estilo_visual}}
- Referências ou restrições (ex: cores da marca, elementos obrigatórios, coisas a evitar): {{referencias}}

## REGRAS DE CONSTRUÇÃO DO ROTEIRO

1. Divida o roteiro em blocos de tempo (ex: 0:00–0:03, 0:03–0:08...), cobrindo a duração total sem deixar buracos.
2. Siga a curva narrativa: Gancho (primeiros ~15% do tempo) → Problema/Contexto → Solução/Produto → CTA (últimos ~15-20% do tempo).
3. Respeite o ritmo de fala do idioma: em português, ~2,5 a 3 palavras por segundo falado. Calcule o total de palavras da narração de acordo com a duração e deixe folga para pausas e momentos só visuais.
4. O gancho inicial deve funcionar mesmo sem som (mudo), pensando em redes sociais com autoplay silencioso.
5. O CTA deve aparecer tanto na tela (texto) quanto na narração.
6. Toda mudança de cena deve ter uma justificativa narrativa ou visual — nunca cortar só por estética.
7. Adapte o vocabulário e as referências ao público-alvo e ao tom solicitado.

## FORMATO DE SAÍDA (OBRIGATÓRIO)

Gere a resposta em duas partes:

### PARTE 1 — ROTEIRO EM TABELA

Uma tabela com estas colunas: TEMPO | VÍDEO (direção visual) | ÁUDIO/NARRAÇÃO

- Coluna VÍDEO: descreva cena, movimento de câmera/elementos, transições, paleta de cores, textos na tela.
- Coluna ÁUDIO/NARRAÇÃO: texto falado + indicação de tom emocional por trecho (ex: "tom curioso", "mais firme e direto") + observações de trilha sonora (mood, se muda de intensidade) + efeitos sonoros relevantes (SFX).

### PARTE 2 — TEXTO DE NARRAÇÃO PARA ELEVENLABS

Gere o texto completo da narração, já formatado para colar diretamente no ElevenLabs, seguindo estas convenções:

- Escreva o texto corrido, sem numeração de cena, exatamente na ordem em que será narrado.
- Use \`...\` para pausas curtas naturais e \`—\` para pausas mais longas ou dramáticas.
- Use MAIÚSCULAS apenas nas poucas palavras que precisam de ênfase forte (o ElevenLabs interpreta caixa alta como ênfase de entonação). Não abuse — no máximo 1 a 2 palavras por frase.
- Escreva por extenso números, siglas e abreviações exatamente como devem soar (ex: "trinta por cento", não "30%"; "erre e ésse", não "R$").
- Não inclua indicações de cena, tempo ou direção de câmera nesse bloco — apenas o que deve ser dito, em texto puro.
- Ao final, inclua uma linha separada com sugestão de configuração de voz: estilo (ex: conversacional, calmo, energético), estabilidade e exaggeration recomendados em termos gerais (ex: "estabilidade média-baixa para soar mais espontâneo").

### PARTE 3 — PROMPTS DE CENA (MINIMAX)

Logo após a PARTE 2, emita uma lista JSON delimitada por \`\`\`cenas e \`\`\`, com um objeto por linha da tabela da PARTE 1 (na mesma ordem), seguindo EXATAMENTE este schema:

\`\`\`cenas
[
  { "idx": 1, "tempo": "0:00–0:06", "duration": 6, "video_pt": "...", "audio_pt": "...", "prompt": "..." },
  ...
]
\`\`\`

Regras:
- "idx": sequencial a partir de 1, na mesma ordem das linhas da tabela.
- "tempo": copie idêntico da coluna TEMPO da tabela.
- "duration": 6 se a janela de tempo da cena for ≤ 6s; 10 se for > 6s (cenas do MiniMax Hailuo-2.3 em 768P só permitem 6 ou 10 segundos).
- "video_pt": copie idêntico o texto da coluna VÍDEO dessa linha.
- "audio_pt": copie idêntico o texto da coluna ÁUDIO/NARRAÇÃO dessa linha.
- "prompt": descrição cinematográfica em INGLÊS, ≤ 2000 caracteres, pronta para o MiniMax Hailuo-2.3. Incorpore direção visual da coluna VÍDEO traduzida e expandida (estilo, paleta, movimento). Use preferencialmente a sintaxe de câmera entre colchetes suportada pelo modelo quando fizer sentido: [Push in], [Pull back], [Pan left], [Pan right], [Truck left], [Truck right], [Zoom in], [Zoom out], [Tilt up], [Tilt down]. Não inclua legendas, tipografia, narração nem texto narrado dentro do prompt — apenas a cena visual. Mantenha ~1–3 sentenças.
- Não adicione comentários fora ou dentro do bloco JSON. Não adicione vírgulas finais.

## RESTRIÇÕES

- Nunca ultrapasse a contagem de palavras compatível com a duração total informada.
- Nunca invente CTA, link ou nome de produto — use exatamente o que foi passado em {{cta}} e {{produto}}.
- Se algum input estiver vazio ou ambíguo, assuma a opção mais genérica e sinalize isso claramente no início da resposta, antes do roteiro.`;

function fill(template: string, brief: Brief, duracao: number): string {
  const f = (v: string, fallback: string) => (v && v.trim() ? v.trim() : fallback);
  return template
    .replace(/\{\{produto\}\}/g, f(brief.produto, "produto (não informado)"))
    .replace(/\{\{publico_alvo\}\}/g, f(brief.publico_alvo, "público geral"))
    .replace(/\{\{objetivo\}\}/g, f(brief.objetivo, "awareness"))
    .replace(/\{\{tom\}\}/g, f(brief.tom, "profissional e próximo"))
    .replace(/\{\{idioma\}\}/g, f(brief.idioma, "pt-BR"))
    .replace(/\{\{duracao\}\}/g, String(duracao))
    .replace(/\{\{cta\}\}/g, f(brief.cta, "Conheça o produto"))
    .replace(/\{\{estilo_visual\}\}/g, f(brief.estilo_visual, "motion graphics 2D flat"))
    .replace(/\{\{referencias\}\}/g, f(brief.referencias, "sem restrições específicas"));
}

const SYSTEM_PROMPT = [
  "Você é um roteirista sênior de vídeos animados curtos.",
  "Siga EXATAMENTE o FORMATO DE SAÍDA fornecido, com as três partes demarcadas pelos títulos '### PARTE 1 — ROTEIRO EM TABELA', '### PARTE 2 — TEXTO DE NARRAÇÃO PARA ELEVENLABS' e '### PARTE 3 — PROMPTS DE CENA (MINIMAX)'.",
  "Não adicione comentários, explicações ou texto fora dessas três partes.",
  "Se algum input estiver ambíguo, coloque um único parágrafo curto de AVISO antes de '### PARTE 1' explicando o que assumiu.",
].join(" ");

function buildAviso(raw: string): string | undefined {
  const before = raw.split(/###\s*PARTE\s*1/i)[0] || "";
  const a = before
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^Você é um roteirista/i.test(l))
    .join(" ")
    .trim();
  return a && a.length > 4 ? a : undefined;
}

function extractTabela(bodyAfterHeader: string): string {
  const lines = bodyAfterHeader.split("\n");
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = /^\s*\|.*\|\s*$/.test(line);
    if (isTableRow) {
      if (start === -1) start = i;
      end = i;
    } else if (start !== -1 && line.trim().length > 0) {
      break;
    }
  }
  if (start === -1 || end === -1) {
    const fallback = bodyAfterHeader.split(/\n\n###\s*PARTE\s*2/i)[0] || "";
    return fallback.trim();
  }
  return lines.slice(start, end + 1).join("\n").trim();
}

function parseVoiceConfig(part2Body: string): { voz: RoteiroVoz; narration: string } {
  const paragraphs = part2Body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const voiceKeywords = /(estabilidade|exaggeration|estilo\s+de\s+voz|sugest[aã]o\s+de\s+voz|configura[cç][aã]o\s+de\s+voz|voz[:\s])/i;
  let voiceIdx = -1;
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    if (voiceKeywords.test(paragraphs[i])) {
      voiceIdx = i;
      break;
    }
  }

  if (voiceIdx === -1) {
    const last = paragraphs[paragraphs.length - 1] || "";
    const looksLikeConfig = voiceKeywords.test(last) ||
      /calmo|energ[eé]tico|conversacional|espont[aâ]neo/i.test(last);
    if (looksLikeConfig) voiceIdx = paragraphs.length - 1;
  }

  let voz: RoteiroVoz = { estilo: "", estabilidade: "", exaggeration: "", raw: "" };
  let narration = part2Body.trim();
  if (voiceIdx !== -1) {
    const voiceRaw = paragraphs[voiceIdx];
    voz = parseVoz(voiceRaw);
    narration = paragraphs
      .filter((_, i) => i !== voiceIdx)
      .join("\n\n")
      .trim();
  }
  return { voz, narration };
}

function parseVoz(raw: string): RoteiroVoz {
  const text = raw.replace(/\s+/g, " ").trim();
  let estilo = "";
  let estabilidade = "";
  let exaggeration = "";

  const estiloMatch = text.match(/estilo(?:\s+de\s+voz)?[:\s]+([^,.;]+)/i);
  if (estiloMatch) estilo = estiloMatch[1].trim();
  else {
    const cand = /calmo|energ[eé]tico|conversacional|profissional|jovem|divertido|s[eé]rio|suave|animado/i.exec(text);
    if (cand) estilo = cand[0];
  }

  const estabMatch = text.match(/estabilidade[:\s-]+([\wà-ú]+(?:\s+[\wà-ú]+)?)/i);
  if (estabMatch) estabilidade = estabMatch[1].trim();
  else {
    const cand = /(m[eé]dia-baixa|m[eé]dia-alta|baixa|alta|m[eé]dia)/i.exec(text);
    if (cand) estabilidade = cand[0].trim();
  }

  const exMatch = text.match(/exaggeration[:\s-]+([\wà-ú]+(?:\s+[\wà-ú]+)?)/i);
  if (exMatch) exaggeration = exMatch[1].trim();
  else {
    const cand = /(exagerad[oa]|controlad[oa]|neutro|alto|baixo|m[eé]dio)/i.exec(text);
    if (cand) exaggeration = cand[0].trim();
  }

  return { estilo, estabilidade, exaggeration, raw };
}

function extractMoodFromTabela(tabela: string): string {
  if (!tabela) return "";
  const moodMatch = tabela.match(/mood\s*[:\-]?\s*([^|\n,;)]+)/i);
  if (moodMatch) return moodMatch[1].trim();

  const trilhaMatch = tabela.match(/trilha\s*[:\-]?\s*([^|\n,;)]+)/i);
  if (trilhaMatch) return trilhaMatch[1].trim();

  const bgmMatch = tabela.match(/(?:BGM|background)\s*[:\-]?\s*([^|\n,;)]+)/i);
  if (bgmMatch) return bgmMatch[1].trim();

  const audioCol = tabela
    .split("\n")
    .filter((l) => /^\s*\|/.test(l))
    .map((l) => l.split("|").slice(-2, -1).join(" "))
    .join(" ");
  const cand = /calm|energ|upbeat|corporat|cinema|drama|suave|leve|festiv|sereno|animad|vibrant/i.exec(audioCol);
  if (cand) return cand[0];
  return "";
}

function clampPrompt(s: string, max = 2000): string {
  const t = (s || "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function parseCenasFromPart3(part3Body: string): Cena[] {
  const fenceMatch = part3Body.match(/```cenas\s*([\s\S]*?)```/i);
  let jsonText: string | null = null;
  if (fenceMatch) {
    jsonText = fenceMatch[1].trim();
  } else {
    const arrStart = part3Body.indexOf("[");
    const arrEnd = part3Body.lastIndexOf("]");
    if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
      jsonText = part3Body.slice(arrStart, arrEnd + 1).trim();
    }
  }
  if (!jsonText) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const cleaned = jsonText
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}");
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const cenas: Cena[] = [];
  parsed.forEach((row, i) => {
    if (!row || typeof row !== "object") return;
    const o = row as Record<string, unknown>;
    const idx = typeof o.idx === "number" ? o.idx : i + 1;
    const tempo = typeof o.tempo === "string" ? o.tempo : "";
    const video_pt = typeof o.video_pt === "string" ? o.video_pt : "";
    const audio_pt = typeof o.audio_pt === "string" ? o.audio_pt : "";
    const prompt_en = clampPrompt(typeof o.prompt === "string" ? o.prompt : "");
    const rawDur = typeof o.duration === "number" ? o.duration : 6;
    const duration_hint: 6 | 10 = rawDur === 10 ? 10 : 6;
    if (!video_pt && !audio_pt && !prompt_en) return;
    cenas.push({ index: idx - 1, tempo, video_pt, audio_pt, prompt_en, duration_hint });
  });
  return cenas;
}

function parseDurationFromTempo(tempo: string): number {
  const m = tempo.match(/\d{1,2}:\d{2}\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return 6;
  const endSec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const startMatch = tempo.match(/(\d{1,2}):(\d{2})\s*[–-]/);
  const startSec = startMatch ? parseInt(startMatch[1], 10) * 60 + parseInt(startMatch[2], 10) : 0;
  const span = endSec - startSec;
  if (!Number.isFinite(span) || span <= 0) return 6;
  return span > 6 ? 10 : 6;
}

function deriveCenasFromTabela(tabela_md: string): Cena[] {
  const rows = tabela_md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\|.*\|\s*$/.test(l));
  if (rows.length < 3) return [];
  const body = rows.slice(2);
  const cenas: Cena[] = [];
  body.forEach((r, i) => {
    const cells = r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 3) return;
    const [tempo, video_pt, audio_pt] = cells;
    const duration_hint = parseDurationFromTempo(tempo) as 6 | 10;
    cenas.push({
      index: i,
      tempo,
      video_pt,
      audio_pt: audio_pt || "",
      prompt_en: clampPrompt(video_pt),
      duration_hint,
    });
  });
  return cenas;
}

export function parseRoteiroOutput(raw: string): RoteiroOutput {
  const aviso = buildAviso(raw);

  const split1 = raw.split(/###\s*PARTE\s*1/i);
  const part1AndRest = split1.length > 1 ? split1.slice(1).join("### PARTE 1") : raw;
  const split2 = part1AndRest.split(/###\s*PARTE\s*2/i);
  const part1Body = split2[0] || "";
  const part2AndRest = split2.length > 1 ? split2.slice(1).join("### PARTE 2") : "";
  const split3 = part2AndRest.split(/###\s*PARTE\s*3/i);
  const part2Body = split3[0] || "";
  const part3Body = split3.length > 1 ? split3.slice(1).join("### PARTE 3") : "";

  const tabela_md = extractTabela(part1Body);
  const { voz, narration } = parseVoiceConfig(part2Body);
  const trilha_mood = extractMoodFromTabela(tabela_md) || "ambiente calmo";
  const narracao_texto = narration.replace(/^[\s\n]*--+[\s\n]*/, "").trim();

  let cenas = parseCenasFromPart3(part3Body);
  if (cenas.length === 0) cenas = deriveCenasFromTabela(tabela_md);

  return {
    tabela_md,
    narracao_texto,
    voz,
    trilha_mood,
    aviso,
    cenas,
  };
}

export async function generateRoteiro(params: {
  brief: Brief;
  durationSeconds: number;
}): Promise<RoteiroOutput> {
  const b = params.brief;
  if (!b || !b.produto || !b.cta) {
    throw new GenerateRoteiroError(
      "Brief incompleto: produto e CTA são obrigatórios.",
      "invalid_input"
    );
  }
  const userPrompt = fill(PROMPT_TEMPLATE, params.brief, params.durationSeconds);

  let text: string;
  try {
    const result = await generateText({
      model: getScriptModel(),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.7,
    });
    text = result.text;
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    const status = err?.statusCode;
    if (status === 402) {
      throw new GenerateRoteiroError(
        "Serviço de IA sem saldo. Tente novamente mais tarde.",
        "provider",
        status
      );
    }
    if (status === 429 || status === 503) {
      throw new GenerateRoteiroError(
        "Serviço de IA temporariamente indisponível. Tente novamente.",
        "provider",
        status
      );
    }
    throw new GenerateRoteiroError(
      err?.message ?? "Falha ao gerar roteiro.",
      "unknown",
      status
    );
  }

  if (!text || text.trim().length < 30) {
    throw new GenerateRoteiroError(
      "Resposta do modelo vazia ou muito curta.",
      "parse"
    );
  }
  return parseRoteiroOutput(text);
}