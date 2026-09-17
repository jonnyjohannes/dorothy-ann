import { useEffect, useRef, useState, type ReactNode } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { HomeRoute } from "./routes/HomeRoute";
import { ThreadRoute } from "./routes/ThreadRoute";
import { ThreadsRoute } from "./routes/ThreadsRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { UnlockRoute } from "./routes/UnlockRoute";
import { SystemStatusBox } from "./boxes/SystemStatusBox";

function applyTheme(theme: string) {
  const prefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = theme === "auto" ? (prefersDark ? "dark" : "light") : theme;
}
function ThemeBootstrap() {
  useEffect(() => {
    const theme = localStorage.getItem("dorothy-ann-theme") ?? "auto";
    applyTheme(theme);
    document.documentElement.dataset.colorScheme = localStorage.getItem("dorothy-ann-color-scheme") ?? "mono";
  }, []);
  return null;
}
function GlobalShortcuts() {
  const navigate = useNavigate();
  const lastEscape = useRef(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.isComposing) return;
      if (event.altKey && event.code === "KeyS") { event.preventDefault(); navigate("/threads"); return; }
      if (event.altKey && event.code === "KeyC") { event.preventDefault(); navigate("/settings"); return; }
      if (event.key !== "Escape") return;
      const current = Date.now();
      if (current - lastEscape.current < 500) { event.preventDefault(); navigate("/new", { replace: true }); }
      lastEscape.current = current;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
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
    <Route path="/topics/:threadId" element={<ThreadRoute />} />
    <Route path="/new" element={<ThreadRoute />} />
    <Route path="*" element={<HomeRoute />} />
  </Routes></AuthGate></>;
}

export { HomeRoute, ThreadRoute, ThreadsRoute, SettingsRoute, UnlockRoute };
