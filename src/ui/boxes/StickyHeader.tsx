import type { ReactNode } from "react";
import styles from "../App.module.css";
import type { BoxIntent } from "./box-types";
import { BrandBox } from "./BrandBox";

export function StickyHeader({ tagline, actions, onIntent }: { tagline?: string; actions?: ReactNode; onIntent: (intent: BoxIntent) => void }) {
  return <header className={styles.header} role="banner"><BrandBox tagline={tagline} onIntent={onIntent} />{actions}</header>;
}
