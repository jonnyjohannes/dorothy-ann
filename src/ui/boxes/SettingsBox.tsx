import { useState, type KeyboardEvent } from "react";
import styles from "../App.module.css";
import type { BoxIntent } from "./box-types";

export interface BackupPreview { add: number; conflicts: number; issues: string[]; candidateId: string }
export function SettingsBox({ values, preview, persistence, onIntent }: { values: Record<string, string>; preview?: BackupPreview; persistence?: "saved" | "session_only"; onIntent: (intent: BoxIntent) => void }) {
  const [backupOpen, setBackupOpen] = useState(false);
  const labels = { theme: "Appearance", colorScheme: "Colors", primaryAccent: "Primary accent" } as const;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (backupOpen) setBackupOpen(false);
    else onIntent({ type: "route_escape_requested" });
    event.stopPropagation();
  };
  return <section className={styles.settings} aria-label="Settings" onKeyDown={onKeyDown}><h2 className={styles.pageTitle}><code>/settings</code></h2>{(["theme", "colorScheme", "primaryAccent"] as const).map((key) => <label className={styles.themeControl} key={key}>{labels[key]}<select aria-label={labels[key]} value={values[key] ?? "auto"} onChange={(event) => onIntent({ type: "preference_changed", key, value: event.target.value })}><option value="auto">auto</option><option value="light">light</option><option value="dark">dark</option><option value="mono">mono</option><option value="rose-pine">rose pine</option></select></label>)}{persistence === "session_only" && <p role="status">Preference active for this session; could not save.</p>}{backupOpen && preview && <div role="dialog" aria-label="Backup preview"><p>{preview.add} new topic(s), {preview.conflicts} conflict(s).</p>{preview.issues.length > 0 && <p role="alert">{preview.issues.length} invalid record(s).</p>}<button type="button" onClick={() => setBackupOpen(false)}>Cancel</button></div>}<button type="button" className={styles.textButton} onClick={() => setBackupOpen(true)}>Preview backup import</button></section>;
}
