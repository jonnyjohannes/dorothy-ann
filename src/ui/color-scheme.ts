export const COLOR_SCHEMES = ["mono", "catppuccin", "rose-pine"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

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
