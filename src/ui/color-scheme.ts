export const COLOR_SCHEMES = ["mono", "catppuccin", "rose-pine"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];
export type PrimaryAccent = "default" | `${number}`;

export const ACCENT_NAMES: Record<ColorScheme, readonly string[]> = {
  mono: ["yellow"],
  catppuccin: ["lavender", "mauve", "blue", "teal", "green", "yellow", "peach", "maroon"],
  "rose-pine": ["iris", "foam", "pine", "gold", "rose", "love", "golden", "muted"],
};

export function defaultAccentSlot(scheme: ColorScheme): number {
  return scheme === "catppuccin" ? 5 : scheme === "rose-pine" ? 6 : 0;
}

export function readPrimaryAccent(value: string | null | undefined): PrimaryAccent {
  if (value === "default") return value;
  return value !== undefined && value !== null && /^[0-7]$/.test(value) ? value as `${number}` : "default";
}

export function primaryAccentSlot(scheme: ColorScheme, accent: PrimaryAccent): number {
  if (accent === "default") return defaultAccentSlot(scheme);
  return scheme === "mono" ? 0 : Number(accent);
}

export function isColorScheme(value: string | null): value is ColorScheme {
  return value !== null && (COLOR_SCHEMES as readonly string[]).includes(value);
}

export function readColorScheme(value: string | null | undefined): ColorScheme {
  return isColorScheme(value ?? null) ? value as ColorScheme : "mono";
}

/** Stable FNV-1a mapping; source identity must not depend on list position. */
export function sourceAccentSlot(sourceId: string, paletteSize: number): number {
  if (paletteSize <= 0) return 0;
  let hash = 0x811c9dc5;
  for (const character of sourceId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % paletteSize;
}

export function headingAccentSlot(headingIndex: number, paletteSize: number): number {
  if (paletteSize <= 0) return 0;
  return Math.abs(headingIndex) % paletteSize;
}
