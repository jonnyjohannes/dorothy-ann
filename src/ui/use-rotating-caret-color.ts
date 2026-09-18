import { useCallback, useEffect, useState, type CSSProperties, type FocusEvent } from "react";

const ACCENT_VARIABLES = Array.from({ length: 8 }, (_, index) => `--accent-${index + 1}`);
const ROTATION_MS = 2_000;

type MediaQueryListWithChange = MediaQueryList & { addEventListener?: (type: "change", listener: (event: MediaQueryListEvent) => void) => void; removeEventListener?: (type: "change", listener: (event: MediaQueryListEvent) => void) => void };

function readAccentPalette(): string[] {
  if (typeof window === "undefined") return ["var(--accent)"];
  const styles = window.getComputedStyle(document.documentElement);
  const palette = ACCENT_VARIABLES.map((name) => styles.getPropertyValue(name).trim()).filter(Boolean);
  return palette.length > 0 ? palette : [styles.getPropertyValue("--accent").trim() || "var(--accent)"];
}

function readReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useRotatingCaretColor(): { style: CSSProperties; onFocus: (event: FocusEvent<HTMLInputElement>) => void; onBlur: (event: FocusEvent<HTMLInputElement>) => void } {
  const [palette, setPalette] = useState(readAccentPalette);
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion);

  useEffect(() => {
    const refresh = () => {
      setPalette(readAccentPalette());
      setIndex(0);
    };
    window.addEventListener("dorothy-ann-preference-change", refresh);
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") as MediaQueryListWithChange : undefined;
    const onMotionChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media?.addEventListener?.("change", onMotionChange);
    return () => {
      window.removeEventListener("dorothy-ann-preference-change", refresh);
      media?.removeEventListener?.("change", onMotionChange);
    };
  }, []);

  useEffect(() => {
    setIndex(0);
    if (!focused || reducedMotion || palette.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % palette.length), ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [focused, palette, reducedMotion]);

  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { style: { caretColor: palette[index] ?? palette[0] ?? "var(--accent)" }, onFocus, onBlur };
}
