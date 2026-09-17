import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import styles from "../App.module.css";
import type { BoxIntent } from "./box-types";

const COMMANDS = ["/new", "/settings", "/threads"] as const;
export function PromptBox({ value, disabled = false, onChange, onIntent }: { value: string; disabled?: boolean; onChange: (value: string) => void; onIntent: (intent: BoxIntent) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [escapeArmed, setEscapeArmed] = useState(false);
  useEffect(() => { if (!value.startsWith("/")) setSuggestionsOpen(false); else setSuggestionsOpen(true); }, [value]);
  const suggestions = COMMANDS.filter((command) => command.startsWith(value));
  const submit = (event?: FormEvent) => { event?.preventDefault(); const next = suggestions[active] ?? value.trim(); if (!next) return; if (next.startsWith("/")) onIntent({ type: "command_requested", command: next }); else onIntent({ type: "prompt_submitted", value: next }); setSuggestionsOpen(false); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestionsOpen) { event.preventDefault(); setActive((current) => Math.min(current + 1, suggestions.length - 1)); }
    else if (event.key === "ArrowUp" && suggestionsOpen) { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); }
    else if (event.key === "Tab" && suggestionsOpen && suggestions.length) { event.preventDefault(); onChange(suggestions[active]); }
    else if (event.key === "Escape" && suggestionsOpen) { event.preventDefault(); setSuggestionsOpen(false); }
    else if (event.key === "Escape" && !event.nativeEvent.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); if (escapeArmed) onIntent({ type: "new_thread_requested" }); else { setEscapeArmed(true); input.current?.blur(); window.setTimeout(() => setEscapeArmed(false), 500); }
    }
    else if (event.key === "c" && (event.ctrlKey || event.metaKey) && input.current && input.current === document.activeElement && input.current.selectionStart === input.current.selectionEnd) { event.preventDefault(); onChange(""); }
  };
  return <form className={styles.promptBox} onSubmit={submit}><input ref={input} className="prompt-caret-cycle" aria-label="Search query" value={value} disabled={disabled} placeholder="...? for research" onChange={(event) => { onChange(event.target.value); setActive(0); }} onKeyDown={onKeyDown} />{suggestionsOpen && suggestions.length > 0 && <ul role="listbox" aria-label="Commands">{suggestions.map((command, index) => <li key={command} role="option" aria-selected={index === active} onMouseDown={(event) => { event.preventDefault(); onChange(command); submit(); }}>{command}</li>)}</ul>}</form>;
}
