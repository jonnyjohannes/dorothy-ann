import { useEffect } from "react";

interface ScrollSurface {
  element: HTMLElement;
  axis: "vertical" | "horizontal";
  indicator: HTMLDivElement;
  thumb: HTMLDivElement;
  cleanup: () => void;
}

// New layout scrollers can opt into the same indicator and keyboard behavior with .app-scroll-surface.
const SCROLL_SURFACES = [".app-route-scroll", ".app-thread-list-scroll", ".app-scroll-surface", ".ui-listbox-menu", ".ui-fuzzy-listbox", ".ui-markdown pre"] as const;
const ROUTE_SURFACES = ".app-route-scroll, .app-thread-list-scroll";
const KEYBOARD_SURFACES = `${ROUTE_SURFACES}, .app-scroll-surface, .ui-markdown pre`;

/** Adds accessible visual controls while leaving all movement to native overflow. */
export function ScrollIndicators() {
  useEffect(() => {
    const surfaces = new Map<HTMLElement, ScrollSurface>();
    let disposed = false;

    const refresh = () => {
      if (disposed) return;
      const targets = new Map<HTMLElement, "vertical" | "horizontal">();
      const hasOpenMenu = document.querySelector(".ui-listbox-menu, .ui-fuzzy-listbox") !== null;
      document.querySelectorAll<HTMLElement>(SCROLL_SURFACES.join(",")).forEach((element) => {
        if (hasOpenMenu && element.matches(ROUTE_SURFACES)) return;
        const horizontal = element.matches(".ui-markdown pre, [data-scroll-axis='horizontal']");
        targets.set(element, horizontal ? "horizontal" : "vertical");
      });
      document.querySelectorAll<HTMLElement>(ROUTE_SURFACES).forEach((element) => {
        element.classList.toggle("route-scroll-locked", hasOpenMenu);
      });
      for (const [element, surface] of surfaces) {
        if (!targets.has(element) || !element.isConnected) {
          element.classList.remove("has-custom-scroll-indicator");
          surface.cleanup();
          surface.indicator.remove();
          surfaces.delete(element);
        }
      }
      for (const [element, axis] of targets) {
        const scrollSize = axis === "vertical" ? element.scrollHeight : element.scrollWidth;
        const clientSize = axis === "vertical" ? element.clientHeight : element.clientWidth;
        if (scrollSize <= clientSize || clientSize <= 0) {
          element.classList.remove("has-custom-scroll-indicator");
          surfaces.get(element)?.cleanup();
          surfaces.get(element)?.indicator.remove();
          surfaces.delete(element);
          continue;
        }
        let surface = surfaces.get(element);
        if (!surface) {
          let mountingIndicator: HTMLDivElement | undefined;
          try {
            const indicator = document.createElement("div");
            mountingIndicator = indicator;
            const thumb = document.createElement("div");
            indicator.className = `app-scroll-indicator app-scroll-indicator--${axis}`;
            indicator.setAttribute("role", "scrollbar");
            const label = axis === "horizontal"
              ? "Code horizontal scroll position"
              : element.matches(".app-route-scroll")
                ? "Route content scroll position"
                : element.matches(".app-thread-list-scroll")
                  ? "Saved threads scroll position"
                  : element.matches(".ui-listbox-menu, .ui-fuzzy-listbox")
                  ? `${element.getAttribute("aria-label") ?? "List"} scroll position`
                  : "Page scroll position";
            indicator.setAttribute("aria-label", label);
            indicator.setAttribute("aria-orientation", axis);
            if (!element.id) element.id = `app-scroll-surface-${surfaces.size + 1}`;
            indicator.setAttribute("aria-controls", element.id);
            indicator.setAttribute("aria-valuemin", "0");
            indicator.setAttribute("aria-valuemax", String(scrollSize - clientSize));
            indicator.tabIndex = 0;
            indicator.append(thumb);
            document.body.append(indicator);
            const update = () => {
              const size = axis === "vertical" ? element.scrollHeight : element.scrollWidth;
              const viewport = axis === "vertical" ? element.clientHeight : element.clientWidth;
              const offset = axis === "vertical" ? element.scrollTop : element.scrollLeft;
              const rect = element.getBoundingClientRect();
              const ratio = Math.min(1, viewport / size);
              const start = Math.max(0, Math.min(1 - ratio, offset / (size - viewport)));
              indicator.style.setProperty("--scroll-thumb-size", `${ratio * 100}%`);
              indicator.style.setProperty("--scroll-thumb-start", `${start * 100}%`);
              indicator.style.setProperty("--scroll-track-start", `${axis === "vertical" ? rect.top : rect.left}px`);
              indicator.style.setProperty("--scroll-track-size", `${axis === "vertical" ? rect.bottom - rect.top : rect.right - rect.left}px`);
              const edge = axis === "vertical"
                ? element.matches(ROUTE_SURFACES) ? 0 : window.innerWidth - rect.right
                : window.innerHeight - rect.bottom;
              indicator.style.setProperty("--scroll-track-edge", `${edge}px`);
              indicator.setAttribute("aria-valuemax", String(size - viewport));
              indicator.setAttribute("aria-valuenow", String(Math.round(offset)));
              indicator.setAttribute("aria-valuetext", `${Math.round(offset)} of ${size - viewport}`);
              thumb.style.setProperty("--scroll-thumb-size", `${ratio * 100}%`);
              thumb.style.setProperty("--scroll-thumb-start", `${start * 100}%`);
            };
            element.addEventListener("scroll", update, { passive: true });
            window.addEventListener("scroll", update, { passive: true });
            const observer = new ResizeObserver(update);
            observer.observe(element);
            const mutation = new MutationObserver(update);
            mutation.observe(element, { childList: true, subtree: true, characterData: true });
            const onKeyDown = (event: KeyboardEvent) => {
              const max = (axis === "vertical" ? element.scrollHeight - element.clientHeight : element.scrollWidth - element.clientWidth);
              const current = axis === "vertical" ? element.scrollTop : element.scrollLeft;
              const unit = Math.max(40, (axis === "vertical" ? element.clientHeight : element.clientWidth) * 0.1);
              let next: number | undefined;
              if (event.key === "Home") next = 0;
              else if (event.key === "End") next = max;
              else if (event.key === (axis === "vertical" ? "ArrowDown" : "ArrowRight")) next = current + unit;
              else if (event.key === (axis === "vertical" ? "ArrowUp" : "ArrowLeft")) next = current - unit;
              else if (event.key === "PageDown") next = current + (axis === "vertical" ? element.clientHeight : element.clientWidth);
              else if (event.key === "PageUp") next = current - (axis === "vertical" ? element.clientHeight : element.clientWidth);
              if (next !== undefined) {
                event.preventDefault();
                element.scrollTo(axis === "vertical" ? { top: next } : { left: next });
              }
            };
            indicator.addEventListener("keydown", onKeyDown);
            // Only an overflowing layout/code surface joins the tab order. Menus own their arrow keys.
            const keyboardSurface = element.matches(KEYBOARD_SURFACES) && !element.matches(".ui-listbox-menu, .ui-fuzzy-listbox");
            const originalTabIndex = element.getAttribute("tabindex");
            if (keyboardSurface && originalTabIndex === null) element.tabIndex = 0;
            const onSurfaceKeyDown = (event: KeyboardEvent) => {
              if (event.target !== element || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || element.classList.contains("route-scroll-locked")) return;
              onKeyDown(event);
            };
            if (keyboardSurface) element.addEventListener("keydown", onSurfaceKeyDown);
            let dragStart = 0;
            let scrollStart = 0;
            indicator.addEventListener("pointerdown", (event) => {
              if (event.button !== 0) return;
              dragStart = axis === "vertical" ? event.clientY : event.clientX;
              scrollStart = axis === "vertical" ? element.scrollTop : element.scrollLeft;
              indicator.setPointerCapture(event.pointerId);
            });
            indicator.addEventListener("pointermove", (event) => {
              if (!indicator.hasPointerCapture(event.pointerId)) return;
              const track = axis === "vertical" ? indicator.clientHeight : indicator.clientWidth;
              const delta = (axis === "vertical" ? event.clientY : event.clientX) - dragStart;
              const max = axis === "vertical" ? element.scrollHeight - element.clientHeight : element.scrollWidth - element.clientWidth;
              const viewport = axis === "vertical" ? element.clientHeight : element.clientWidth;
              element.scrollTo(axis === "vertical" ? { top: scrollStart + delta * max / Math.max(1, track - viewport * viewport / (axis === "vertical" ? element.scrollHeight : element.scrollWidth)) } : { left: scrollStart + delta * max / Math.max(1, track - viewport * viewport / (axis === "horizontal" ? element.scrollWidth : element.scrollHeight)) });
            });
            const cleanup = () => { element.removeEventListener("scroll", update); window.removeEventListener("scroll", update); observer.disconnect(); mutation.disconnect(); indicator.removeEventListener("keydown", onKeyDown); if (keyboardSurface) { element.removeEventListener("keydown", onSurfaceKeyDown); if (originalTabIndex === null) element.removeAttribute("tabindex"); } };
            surface = { element, axis, indicator, thumb, cleanup };
            surfaces.set(element, surface);
            element.classList.add("has-custom-scroll-indicator");
            update();
          } catch {
            element.classList.remove("has-custom-scroll-indicator");
            mountingIndicator?.remove();
            surface?.indicator.remove();
            surfaces.delete(element);
          }
        } else {
          surface.axis = axis;
        }
      }
    };

    refresh();
    const mutation = new MutationObserver(refresh);
    mutation.observe(document.documentElement, { childList: true, subtree: true });
    const resize = new ResizeObserver(refresh);
    resize.observe(document.documentElement);
    window.addEventListener("resize", refresh, { passive: true });
    return () => {
      disposed = true;
      mutation.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", refresh);
      for (const [element, surface] of surfaces) {
        element.classList.remove("has-custom-scroll-indicator");
        surface.cleanup();
        surface.indicator.remove();
      }
    };
  }, []);
  return null;
}
