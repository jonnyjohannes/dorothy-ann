import styles from "../App.module.css";
import type { BoxIntent } from "./box-types";
export function SystemStatusBox({ status, detail, onIntent }: { status: "ready" | "checking" | "unavailable"; detail?: string; onIntent: (intent: BoxIntent) => void }) {
  if (status === "ready") return null;
  return <section className={styles.center} role="alert" aria-label="System status"><p>{status === "checking" ? "Checking access…" : detail ?? "The service is unavailable."}</p>{status === "unavailable" && <button type="button" onClick={() => onIntent({ type: "retry_requested" })}>Retry</button>}</section>;
}
