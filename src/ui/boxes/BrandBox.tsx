import type { KeyboardEvent } from "react";
import styles from "../App.module.css";
import type { BoxIntent } from "./box-types";

export function BrandBox({ tagline = "take chances", onIntent }: { tagline?: string; onIntent: (intent: BoxIntent) => void }) {
  const activate = () => onIntent({ type: "new_thread_requested" });
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
  };
  return <button type="button" className={styles.signature} aria-label="New topic" onClick={activate} onKeyDown={onKeyDown}>~∞|°_°|∞~ <span className={styles.brand}>{tagline}</span></button>;
}
