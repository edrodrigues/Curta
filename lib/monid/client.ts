import "server-only";

const MONID_BASE = "https://api.monid.ai/v1";
const VIDEO_MODEL = "MiniMax-Hailuo-2.3" as const;

export type MonidRunStatus =
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "BLOCKED"
  | "TIME_OUT"
  | "STOPPED";

export type VideoResolution = "768P" | "1080P";
export type VideoDuration = 6 | 10;

export class MonidError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "rate_limit" | "blocked" | "http" | "unknown",
    public readonly status?: number
  ) {
    super(message);
    this.name = "MonidError";
  }
}

function getApiKey(): string {
  const key = process.env.MONID_API_KEY;
  if (!key) {
    throw new MonidError(
      "MONID_API_KEY ausente. Defina-a em .env.local (server-only).",
      "auth"
    );
  }
  return key;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

function mapHttpError(status: number, body: unknown): MonidError {
  const msg =
    (typeof body === "object" && body !== null && "message" in body
      ? String((body as Record<string, unknown>).message)
      : null) ?? `Monid retornou HTTP ${status}.`;
  if (status === 401 || status === 403) {
    return new MonidError("Chave da API Monid inválida ou sem permissão.", "auth", status);
  }
  if (status === 429) {
    return new MonidError("Limite de requisições da Monid atingido. Tente novamente em instantes.", "rate_limit", status);
  }
  return new MonidError(msg, "http", status);
}

export type StartVideoRunInput = {
  prompt: string;
  resolution?: VideoResolution;
  duration?: VideoDuration;
};

export type StartVideoRunResult = {
  run_id: string;
  status: MonidRunStatus;
};

export async function startVideoRun(input: StartVideoRunInput): Promise<StartVideoRunResult> {
  const body = {
    provider: "minimax",
    endpoint: "/v1/video_generation",
    input: {
      model: VIDEO_MODEL,
      prompt: input.prompt,
      resolution: input.resolution ?? "768P",
      duration: input.duration ?? 6,
      prompt_optimizer: true,
      fast_pretreatment: false,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${MONID_BASE}/run`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (e) {
    throw new MonidError(
      `Falha de rede ao iniciar run Monid: ${(e as Error).message}`,
      "unknown"
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw mapHttpError(res.status, data);

  const runId =
    (typeof data === "object" && data && "runId" in data && typeof data.runId === "string"
      ? data.runId
      : null) ??
    (typeof data === "object" && data && "run_id" in data && typeof data.run_id === "string"
      ? data.run_id
      : null);
  if (!runId) {
    throw new MonidError("Resposta do Monid sem runId.", "unknown", res.status);
  }
  const status =
    (typeof data === "object" && data && "status" in data && typeof data.status === "string"
      ? data.status
      : "RUNNING") as MonidRunStatus;
  return { run_id: runId, status };
}

export type GetRunResult = {
  run_id: string;
  status: MonidRunStatus;
  download_url?: string;
  error?: string;
  stoppable?: boolean;
};

function extractDownloadUrl(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const root = data as Record<string, unknown>;
  for (const key of ["download_url", "download_link", "downloadUrl", "downloadLink"]) {
    const v = root[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  for (const containerKey of ["output", "result", "results"]) {
    const cont = root[containerKey];
    if (cont && typeof cont === "object") {
      const obj = cont as Record<string, unknown>;
      if (Array.isArray(obj)) {
        const first = obj[0];
        if (first && typeof first === "object") {
          const o = first as Record<string, unknown>;
          for (const key of ["download_url", "download_link", "downloadUrl", "downloadLink", "url"]) {
            const v = o[key];
            if (typeof v === "string" && v.length > 0) return v;
          }
        }
      } else {
        for (const key of ["download_url", "download_link", "downloadUrl", "downloadLink", "url"]) {
          const v = obj[key];
          if (typeof v === "string" && v.length > 0) return v;
        }
      }
    }
  }
  return undefined;
}

export async function getRun(run_id: string): Promise<GetRunResult> {
  let res: Response;
  try {
    res = await fetch(`${MONID_BASE}/runs/${encodeURIComponent(run_id)}`, {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    });
  } catch (e) {
    throw new MonidError(
      `Falha de rede ao consultar run Monid: ${(e as Error).message}`,
      "unknown"
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw mapHttpError(res.status, data);

  const status =
    (typeof data === "object" && data && "status" in data && typeof data.status === "string"
      ? data.status
      : "RUNNING") as MonidRunStatus;
  const download_url = extractDownloadUrl(data);
  const stoppable =
    typeof data === "object" && data && "stoppable" in data
      ? Boolean(data.stoppable)
      : undefined;
  const error =
    typeof data === "object" && data && "error" in data && typeof data.error === "object" && data.error
      ? String((data.error as Record<string, unknown>).message ?? "")
      : undefined;
  return { run_id, status, download_url, stoppable, error };
}