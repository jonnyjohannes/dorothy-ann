import { FormEvent, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import styles from "./App.module.css";

function Unlock() {
  const [passphrase, setPassphrase] = useState("");
  const [message, setMessage] = useState("");
  return <main className={styles.center}><section className={styles.card} aria-labelledby="unlock-title"><p className={styles.kicker}>private research desk</p><h1 id="unlock-title">dorothy-ann</h1><p>This research desk is private.</p><form onSubmit={(event) => { event.preventDefault(); setMessage("Fixture mode is ready — welcome in."); }}><label htmlFor="passphrase">Passphrase</label><input id="passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="current-password" /><button type="submit">Unlock</button></form>{message && <p role="status">{message}</p>}</section></main>;
}

function Home() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"lookup" | "research">("lookup");
  const navigate = useNavigate();
  const inferred = query.trimEnd().endsWith("?");
  const activeMode = mode === "lookup" && inferred ? "research" : mode;
  const submit = (event: FormEvent) => { event.preventDefault(); if (query.trim()) navigate(`/topics/new?mode=${activeMode}&q=${encodeURIComponent(query.trim())}`); };
  return <main className={styles.shell}><header className={styles.header}><button className={styles.iconButton} aria-label="Open topics">☰</button><Link to="/" className={styles.brand}>dorothy-ann</Link><button className={styles.iconButton} aria-label="New topic">＋</button></header><section className={styles.hero}><p className={styles.kicker}>curious · prepared · evidence-oriented</p><h1>What should we look up?</h1><form onSubmit={submit} className={styles.queryForm}><input aria-label="Search query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask a question or search for something" autoFocus /><div className={styles.controls}><select aria-label="Query mode" value={activeMode} onChange={(event) => setMode(event.target.value as "lookup" | "research")}><option value="lookup">lookup</option><option value="research">research</option></select><button type="submit">{activeMode === "research" ? "Ask Dorothy Ann" : "Go"}</button></div></form><p className={styles.hint}>Add <strong>?</strong> to ask Dorothy Ann to research.</p></section><p className={styles.recent}>Recent topics will stay in this browser.</p></main>;
}

function Topic() { return <main className={styles.shell}><header className={styles.header}><Link to="/" className={styles.brand}>← dorothy-ann</Link></header><section className={styles.topic}><p className={styles.kicker}>fixture mode</p><h1>Your topic is ready</h1><p>The portable application scaffold is live. Search, research, evidence, and export flows will land here next.</p><Link to="/" className={styles.textLink}>Start another query →</Link></section></main>; }

export function App() { return <Routes><Route path="/unlock" element={<Unlock />} /><Route path="/topics/:threadId" element={<Topic />} /><Route path="*" element={<Home />} /></Routes>; }
