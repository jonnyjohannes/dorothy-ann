import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import styles from "../App.module.css";
import { ListboxMenu } from "../primitives/ListboxMenu";
import type { BoxIntent } from "./box-types";

type SettingKey = "theme" | "colorScheme" | "primaryAccent";
interface SettingOption { value: string; label: string }

function SettingsSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly SettingOption[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const listbox = useRef<HTMLDivElement>(null);
  const activeOption = options[active] ?? options[0];
  const listboxId = `settings-listbox-${id}`;

  useEffect(() => {
    const selected = options.findIndex((option) => option.value === value);
    if (selected >= 0) setActive(selected);
  }, [options, value]);

  useEffect(() => {
    if (open) listbox.current?.focus();
  }, [open]);

  const select = (option: SettingOption) => {
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  };
  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) setOpen(true);
      else if (event.key === "ArrowDown") setActive((current) => (current + 1) % options.length);
      else if (event.key === "ArrowUp") setActive((current) => (current - 1 + options.length) % options.length);
      else if (activeOption) select(activeOption);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  };
  const onListboxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => (current + 1) % options.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => (current - 1 + options.length) % options.length); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(options.length - 1); }
    else if ((event.key === "Enter" || event.key === " ") && activeOption) { event.preventDefault(); select(activeOption); }
    else if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  };

  return <div className={styles.settingsSelect}>
    <button ref={trigger} type="button" className={styles.settingsSelectTrigger} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={listboxId} onClick={() => setOpen((current) => !current)} onKeyDown={onTriggerKeyDown}>{activeOption?.label}</button>
    {open && <ListboxMenu items={options} activeIndex={active} selectedIndex={options.findIndex((option) => option.value === value)} ariaLabel={label} id={listboxId} onActiveIndexChange={setActive} onSelect={select} listboxRef={listbox} onKeyDown={onListboxKeyDown} renderItem={(option) => option.label} />}
  </div>;
}

export function SettingsBox({ values, persistence, onIntent }: { values: Record<string, string>; persistence?: "saved" | "session_only"; onIntent: (intent: BoxIntent) => void }) {
  const labels: Record<SettingKey, string> = { theme: "Appearance", colorScheme: "Color scheme", primaryAccent: "Primary accent" };
  const options: Record<SettingKey, readonly SettingOption[]> = {
    theme: [{ value: "auto", label: "auto" }, { value: "light", label: "light" }, { value: "dark", label: "dark" }],
    colorScheme: [{ value: "mono", label: "mono" }, { value: "catppuccin", label: "catppuccin" }, { value: "rose-pine", label: "rose pine" }],
    primaryAccent: [{ value: "default", label: "scheme default" }, { value: "fbf719", label: "#fbf719" }, { value: "e068a5", label: "#e068a5" }],
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onIntent({ type: "route_escape_requested" });
    event.stopPropagation();
  };
  return <section className={styles.settings} aria-label="Settings" onKeyDown={onKeyDown}>{(Object.keys(labels) as SettingKey[]).map((key) => <div className={styles.themeControl} key={key}><span>{labels[key]}</span><SettingsSelect label={labels[key]} value={values[key] ?? options[key][0]?.value ?? ""} options={options[key]} onChange={(value) => onIntent({ type: "preference_changed", key, value })} /></div>)}{persistence === "session_only" && <p role="status">Preference active for this session; could not save.</p>}</section>;
}
