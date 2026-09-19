import { useEffect, useState, type KeyboardEvent } from "react";
import styles from "../App.module.css";
import type { BoxIntent } from "./box-types";

const ROTATING_TAGLINES = ["take chances", "make mistakes", "get messy"] as const;

export function BrandBox({ tagline, onIntent }: { tagline?: string; onIntent: (intent: BoxIntent) => void }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (tagline !== undefined || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % ROTATING_TAGLINES.length), 3_000);
    return () => window.clearInterval(timer);
  }, [tagline]);
  const activate = () => onIntent({ type: "new_thread_requested" });
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
  };
  const visibleTagline = tagline ?? ROTATING_TAGLINES[index];
  return <button type="button" className={styles.signature} aria-label="New topic" onClick={activate} onKeyDown={onKeyDown}><span aria-hidden="true">~∞|°_°|∞~</span><span className={styles.brand} aria-hidden="true">{visibleTagline}</span></button>;
}
