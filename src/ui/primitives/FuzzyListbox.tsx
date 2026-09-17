import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface FuzzyListboxProps<T> {
  items: readonly T[];
  activeId?: string;
  getItemId: (item: T) => string;
  renderItem: (item: T, active: boolean) => ReactNode;
  onActiveIdChange?: (id: string) => void;
  onSelect?: (item: T) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
  emptyState?: ReactNode;
}

/** Accessible list mechanics only; ranking and item meaning belong to callers. */
export function FuzzyListbox<T>({
  items,
  activeId,
  getItemId,
  renderItem,
  onActiveIdChange,
  onSelect,
  ariaLabel,
  id,
  className,
  emptyState,
}: FuzzyListboxProps<T>) {
  const generatedId = useId();
  const listboxId = id ?? `fuzzy-listbox-${generatedId}`;
  const optionRefs = useRef(new Map<string, HTMLDivElement>());
  const activeIndex = items.findIndex((item) => getItemId(item) === activeId);
  const scrollOption = (itemId: string) => {
    const option = optionRefs.current.get(itemId);
    if (option && typeof option.scrollIntoView === "function") option.scrollIntoView({ block: "nearest" });
  };
  const setActive = (index: number) => {
    const item = items[index];
    if (!item) return;
    const itemId = getItemId(item);
    onActiveIdChange?.(itemId);
    scrollOption(itemId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(activeIndex < items.length - 1 ? activeIndex + 1 : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex > 0 ? activeIndex - 1 : items.length - 1);
    } else if (event.key === "Home" && items.length > 0) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && items.length > 0) {
      event.preventDefault();
      setActive(items.length - 1);
    } else if ((event.key === "Enter" || event.key === " ") && activeIndex >= 0) {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) onSelect?.(item);
    }
  };

  useEffect(() => {
    if (activeId) scrollOption(activeId);
  }, [activeId]);

  return (
    <div id={listboxId} role="listbox" aria-label={ariaLabel} aria-activedescendant={activeId ? `${listboxId}-option-${activeId}` : undefined} tabIndex={-1} onKeyDown={onKeyDown} className={["ui-fuzzy-listbox", className].filter(Boolean).join(" ")}>
      {items.length === 0 ? emptyState : items.map((item) => {
        const itemId = getItemId(item);
        const active = itemId === activeId;
        return <div
          key={itemId}
          id={`${listboxId}-option-${itemId}`}
          role="option"
          aria-selected={active}
          ref={(element) => { if (element) optionRefs.current.set(itemId, element); else optionRefs.current.delete(itemId); }}
          className={active ? "ui-fuzzy-listbox__option is-active" : "ui-fuzzy-listbox__option"}
          onMouseEnter={() => onActiveIdChange?.(itemId)}
          onClick={() => onSelect?.(item)}
        >{renderItem(item, active)}</div>;
      })}
    </div>
  );
}
