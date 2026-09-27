import { useRef, useState, type FormEvent } from "react";
import styles from "../App.module.css";
import type { BoxIntent } from "./box-types";
export function UnlockBox({ message, onIntent }: { message?: string; onIntent: (intent: BoxIntent) => void }) {
  const [passphrase, setPassphrase] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!passphrase) return; const value = passphrase; setPassphrase(""); onIntent({ type: "passphrase_submitted", passphrase: value }); window.setTimeout(() => input.current?.focus(), 0); };
  return <section className={styles.unlockCard} aria-label="Unlock"><h1 className={styles.pageTitle}><code>/unlock</code></h1><form className={styles.unlockForm} onSubmit={submit}><label className={styles.srOnly} htmlFor="unlock-passphrase">Passphrase</label><input ref={input} id="unlock-passphrase" type="password" value={passphrase} autoComplete="current-password" placeholder="passphrase" onChange={(event) => setPassphrase(event.target.value)} autoFocus /></form>{message && <p role="status">{message}</p>}</section>;
}
