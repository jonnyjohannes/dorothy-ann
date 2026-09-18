import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SettingsBox } from "../boxes/SettingsBox";
import { PromptBox } from "../boxes/PromptBox";
import { StickyHeader } from "../boxes/StickyHeader";
import type { BoxIntent } from "../boxes/box-types";
import styles from "../App.module.css";

export function SettingsRoute() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() => ({
    theme: localStorage.getItem("dorothy-ann-theme") ?? "auto",
    colorScheme: localStorage.getItem("dorothy-ann-color-scheme") ?? "mono",
    primaryAccent: localStorage.getItem("dorothy-ann-primary-accent") ?? "default",
  }));
  const onIntent = (intent: BoxIntent) => {
    if (intent.type === "new_thread_requested") navigate("/", { replace: true });
    if (intent.type === "route_escape_requested") { navigate("/", { replace: true }); return; }
    if (intent.type === "prompt_submitted") { navigate(`/topics/new?q=${encodeURIComponent(intent.value)}`); return; }
    if (intent.type === "command_requested") {
      if (intent.command === "/new") navigate("/", { replace: true });
      else if (intent.command === "/threads") navigate("/threads");
      else if (intent.command === "/settings") setPrompt("");
      return;
    }
    if (intent.type === "new_thread_requested") { navigate("/", { replace: true }); return; }
    if (intent.type === "preference_changed") {
      setValues((current) => ({ ...current, [intent.key]: intent.value }));
      const storageKey = intent.key === "colorScheme" ? "dorothy-ann-color-scheme" : intent.key === "primaryAccent" ? "dorothy-ann-primary-accent" : "dorothy-ann-theme";
      localStorage.setItem(storageKey, intent.value);
      if (intent.key === "theme") document.documentElement.dataset.theme = intent.value;
      if (intent.key === "colorScheme") document.documentElement.dataset.colorScheme = intent.value;
      window.dispatchEvent(new Event("dorothy-ann-preference-change"));
    }
  };
  return <main className={styles.shell}>
    <StickyHeader onIntent={onIntent} />
    <section className={styles.routeLayout}>
      <h1 className={styles.pageTitle}><code>/settings</code></h1>
      <SettingsBox values={values} persistence="saved" onIntent={onIntent} />
    </section>
    <PromptBox value={prompt} onChange={setPrompt} onIntent={onIntent} />
  </main>;
}
