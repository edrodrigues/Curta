export type MonidVoiceStyle =
  | "didatica"
  | "entusiasmada"
  | "institucional"
  | "descontraida";

export const NARRATION_VOICES: Record<MonidVoiceStyle, string> = {
  didatica: "Xb7hH8MSUJpSbSDYk0k2",
  entusiasmada: "FGY2WhTYpPnrIDTdsKH5",
  institucional: "onwK4e9ZLuTAKqWW03F9",
  descontraida: "bIHbv24MWmeRgasZH58o",
};

export const DEFAULT_NARRATION_VOICE = "SAz9YHcvj6GT2YYXdXww";

export function narrationVoiceForStyle(style: string): string {
  const v = (style || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/didatic|tutorial|educac|explicat/.test(v)) return NARRATION_VOICES.didatica;
  if (/entusias|energ|dinam|upbeat|animad/.test(v)) return NARRATION_VOICES.entusiasmada;
  if (/institucional|corporat|formal|firm|apresentac/.test(v)) return NARRATION_VOICES.institucional;
  if (/descontraid|leve|proxim|jovem|social|conversa/.test(v)) return NARRATION_VOICES.descontraida;
  return DEFAULT_NARRATION_VOICE;
}
