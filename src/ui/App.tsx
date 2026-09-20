import { useEffect, useRef, useState, type ReactNode } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { HomeRoute } from "./routes/HomeRoute";
import { ThreadRoute } from "./routes/ThreadRoute";
import { ThreadsRoute } from "./routes/ThreadsRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { UnlockRoute } from "./routes/UnlockRoute";
import { SystemStatusBox } from "./boxes/SystemStatusBox";
import { primaryAccentSlot, readColorScheme, readPrimaryAccent } from "./color-scheme";

function applyTheme(theme: string) {
  const prefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = theme === "auto" ? (prefersDark ? "dark" : "light") : theme;
}
function applyPrimaryAccent(schemeValue: string | null, accentValue: string | null) {
  const scheme = readColorScheme(schemeValue);
  const accent = readPrimaryAccent(accentValue);
  const value = accent === "fbf719" ? "#fbf719" : accent === "e068a5" ? "#e068a5" : `var(--accent-${primaryAccentSlot(scheme, accent) + 1})`;
  document.documentElement.style.setProperty("--accent", value);
}
function applyPreferences() {
  applyTheme(localStorage.getItem("dorothy-ann-theme") ?? "auto");
  const scheme = localStorage.getItem("dorothy-ann-color-scheme") ?? "mono";
  document.documentElement.dataset.colorScheme = scheme;
  applyPrimaryAccent(scheme, localStorage.getItem("dorothy-ann-primary-accent"));
}
function ThemeBootstrap() {
  useEffect(() => {
    applyPreferences();
    const onPreferenceChange = () => applyPreferences();
    window.addEventListener("dorothy-ann-preference-change", onPreferenceChange);
    return () => window.removeEventListener("dorothy-ann-preference-change", onPreferenceChange);
  }, []);
  return null;
}
export function GlobalShortcuts() {
  const location = useLocation();
  const navigate = useNavigate();
  const lastEscape = useRef(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
      if (event.isComposing) return;
      if (event.altKey && event.code === "KeyS") { event.preventDefault(); navigate("/threads"); return; }
      if (event.altKey && event.code === "KeyC") { event.preventDefault(); navigate("/settings"); return; }
      if (event.key === "i" && !event.ctrlKey && !event.altKey && !event.metaKey && !isEditable) {
        const prompt = document.querySelector<HTMLInputElement>('input[aria-label="Search query"]:not(:disabled)');
        if (prompt) { event.preventDefault(); prompt.focus(); return; }
      }
      if (event.key !== "Escape") return;
      if ((location.pathname === "/threads" || location.pathname === "/settings") && !isEditable) {
        event.preventDefault(); navigate("/", { replace: true });
        return;
      }
      if (isEditable) return;
      const current = Date.now();
      if (current - lastEscape.current < 500) { event.preventDefault(); navigate("/", { replace: true }); }
      lastEscape.current = current;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [location.pathname, navigate]);
  return null;
}
function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  useEffect(() => {
    if (location.pathname === "/unlock") { setStatus("ready"); return; }
    let cancelled = false;
    void fetch("/api/status").then(async (response) => {
      if (!response.ok) throw new Error("status");
      return await response.json() as { fixtureMode?: boolean; storage?: boolean };
    }).then(async (provider) => {
      if (provider.fixtureMode === false) {
        const session = await fetch("/api/auth/session").then((response) => response.json()) as { authenticated?: boolean };
        if (!session.authenticated) { navigate(`/unlock?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`, { replace: true }); return; }
      }
      if (!cancelled) setStatus(provider.storage === false && provider.fixtureMode !== true ? "unavailable" : "ready");
    }).catch(() => { if (!cancelled) setStatus("unavailable"); });
    return () => { cancelled = true; };
  }, [location.pathname, location.search, navigate]);
  if (status !== "ready") return <SystemStatusBox status={status} detail="Unable to check application access." onIntent={() => window.location.reload()} />;
  return <>{children}</>;
}
export function App() {
  return <><ThemeBootstrap /><AuthGate><GlobalShortcuts /><Routes>
    <Route path="/unlock" element={<UnlockRoute />} />
    <Route path="/settings" element={<SettingsRoute />} />
    <Route path="/threads" element={<ThreadsRoute />} />
    <Route path="/threads/new" element={<ThreadRoute />} />
    <Route path="/threads/:threadId" element={<ThreadRoute />} />
    <Route path="/new" element={<HomeRoute />} />
    <Route path="*" element={<HomeRoute />} />
  </Routes></AuthGate></>;
}

export { HomeRoute, ThreadRoute, ThreadsRoute, SettingsRoute, UnlockRoute };
