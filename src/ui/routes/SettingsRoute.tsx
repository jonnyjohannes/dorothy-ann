import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SettingsBox } from "../boxes/SettingsBox";
import { StickyHeader } from "../boxes/StickyHeader";
import type { BoxIntent } from "../boxes/box-types";
import styles from "../App.module.css";

export function SettingsRoute() {
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<string, string>>(() => ({
    theme: localStorage.getItem("dorothy-ann-theme") ?? "auto",
    colorScheme: localStorage.getItem("dorothy-ann-color-scheme") ?? "mono",
    primaryAccent: localStorage.getItem("dorothy-ann-primary-accent") ?? "default",
  }));
  const onIntent = (intent: BoxIntent) => {
    if (intent.type === "new_thread_requested") navigate("/new", { replace: true });
    if (intent.type === "preference_changed") {
      setValues((current) => ({ ...current, [intent.key]: intent.value }));
      const storageKey = intent.key === "colorScheme" ? "dorothy-ann-color-scheme" : intent.key === "primaryAccent" ? "dorothy-ann-primary-accent" : "dorothy-ann-theme";
      localStorage.setItem(storageKey, intent.value);
      if (intent.key === "theme") document.documentElement.dataset.theme = intent.value;
      if (intent.key === "colorScheme") document.documentElement.dataset.colorScheme = intent.value;
    }
  };
  return <main className={styles.shell}>
    <StickyHeader onIntent={onIntent} />
    <SettingsBox values={values} persistence="saved" onIntent={onIntent} />
  </main>;
}
