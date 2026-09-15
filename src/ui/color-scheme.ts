export const COLOR_SCHEMES = ["mono", "catppuccin", "rose-pine"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];
export type PrimaryAccent = "default" | "e068a5" | `${number}`;

export const ACCENT_NAMES: Record<ColorScheme, readonly string[]> = {
  mono: ["yellow"],
  catppuccin: ["lavender", "mauve", "blue", "teal", "green", "yellow", "peach", "maroon"],
  "rose-pine": ["iris", "foam", "pine", "gold", "rose", "love", "golden", "muted"],
};

export function defaultAccentSlot(scheme: ColorScheme): number {
  return scheme === "catppuccin" ? 5 : scheme === "rose-pine" ? 6 : 0;
}

export function readPrimaryAccent(value: string | null | undefined): PrimaryAccent {
  if (value === "default" || value === "e068a5") return value;
  return value !== undefined && value !== null && /^[0-7]$/.test(value) ? value as `${number}` : "default";
}

export function primaryAccentSlot(scheme: ColorScheme, accent: PrimaryAccent): number {
  if (accent === "default") return defaultAccentSlot(scheme);
  if (accent === "e068a5") return 0;
  return scheme === "mono" ? 0 : Number(accent);
}

export function isColorScheme(value: string | null): value is ColorScheme {
  return value !== null && (COLOR_SCHEMES as readonly string[]).includes(value);
}

export function readColorScheme(value: string | null | undefined): ColorScheme {
  return isColorScheme(value ?? null) ? value as ColorScheme : "mono";
}

/** Stable FNV-1a mapping; source identity must not depend on list position. */
function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function spreadOrder(paletteSize: number): number[] {
  const preferred = [0, 4, 2, 6, 1, 5, 3, 7];
  return [...preferred.filter((slot) => slot < paletteSize), ...Array.from({ length: paletteSize }, (_, slot) => slot).filter((slot) => !preferred.includes(slot))];
}

export function sourceAccentSlot(sourceId: string, paletteSize: number, threadSeed = ""): number {
  if (paletteSize <= 0) return 0;
  const order = spreadOrder(paletteSize);
  return order[stableHash(`${threadSeed}:${sourceId}`) % order.length] ?? 0;
}

export function headingAccentSlot(headingIndex: number, paletteSize: number, threadSeed = ""): number {
  if (paletteSize <= 0) return 0;
  const order = spreadOrder(paletteSize);
  const offset = stableHash(threadSeed) % order.length;
  return order[(headingIndex + offset) % order.length] ?? 0;
}
