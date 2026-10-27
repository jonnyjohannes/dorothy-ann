import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import styles from "../App.module.css";
import type { BoxIntent } from "./box-types";
import { ListboxMenu } from "../primitives/ListboxMenu";

const COMMANDS = ["/new", "/link", "/news", "/image", "/video", "/settings", "/threads"] as const;
export function PromptBox({ value, disabled = false, onChange, onIntent }: { value: string; disabled?: boolean; onChange: (value: string) => void; onIntent: (intent: BoxIntent) => void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => { if (!value.startsWith("/")) setSuggestionsOpen(false); else setSuggestionsOpen(true); }, [value]);
  useLayoutEffect(() => {
    const resize = () => {
      if (!input.current) return;
      input.current.style.height = "auto";
      input.current.style.height = `${input.current.scrollHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [value]);
  const suggestions = COMMANDS.filter((command) => command.startsWith(value));
  const renderSuggestion = (command: (typeof COMMANDS)[number]) => <>{value && <strong>{command.slice(0, value.length)}</strong>}{command.slice(value.length)}</>;
  const submit = (event?: FormEvent) => { event?.preventDefault(); if (disabled) return; const next = suggestions[active] ?? value.trim(); if (!next) return; if (next.startsWith("/")) onIntent({ type: "command_requested", command: next }); else onIntent({ type: "prompt_submitted", value: next }); setSuggestionsOpen(false); };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); submit(); }
    else if (event.key === "ArrowDown" && suggestionsOpen) { event.preventDefault(); setActive((current) => Math.min(current + 1, suggestions.length - 1)); }
    else if (event.key === "ArrowUp" && suggestionsOpen) { event.preventDefault(); setActive((current) => Math.max(0, current - 1)); }
    else if (event.key === "Tab" && suggestionsOpen && suggestions.length) { event.preventDefault(); onChange(`${suggestions[active]} `); setSuggestionsOpen(false); }
    else if (event.key === "Escape" && !event.nativeEvent.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (suggestionsOpen) { event.preventDefault(); event.stopPropagation(); setSuggestionsOpen(false); }
    }
    else if (event.key === "c" && (event.ctrlKey || event.metaKey) && input.current && input.current === document.activeElement && input.current.selectionStart === input.current.selectionEnd) { event.preventDefault(); onChange(""); }
  };
  return <form className={styles.promptBox} onSubmit={submit}><textarea ref={input} autoFocus rows={1} enterKeyHint="send" className={styles.promptInput} aria-label="Search query" value={value} disabled={disabled} placeholder="???" onChange={(event) => { onChange(event.target.value); setActive(0); }} onKeyDown={onKeyDown} /><button className={styles.promptSubmit} type="submit" aria-label="Send" disabled={disabled || !value.trim()}><span aria-hidden="true">↵</span></button>{suggestionsOpen && suggestions.length > 0 && <ListboxMenu items={suggestions} activeIndex={active} ariaLabel="Commands" onActiveIndexChange={setActive} onSelect={(command) => { onChange(`${command} `); setSuggestionsOpen(false); }} className="ui-listbox-menu--overlay prompt-command-menu" renderItem={(command) => renderSuggestion(command)} />}</form>;
}
