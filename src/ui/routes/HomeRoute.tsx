import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { CanonicalSource } from "../../domain/model-v3";
import { resolveQueryMode } from "../../domain/policies";
import { EvidenceBox } from "../boxes/EvidenceBox";
import { PromptBox } from "../boxes/PromptBox";
import { StickyHeader } from "../boxes/StickyHeader";
import type { BoxIntent } from "../boxes/box-types";
import styles from "../App.module.css";

export function HomeRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [sources, setSources] = useState<CanonicalSource[]>([]);

  useEffect(() => {
    const query = params.get("q")?.trim();
    if (!query) return;
    let cancelled = false;
    void fetch("/api/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) })
      .then(async (response) => {
        if (!response.ok) throw new Error("lookup unavailable");
        const body = await response.json() as { results?: CanonicalSource[] };
        if (!cancelled) setSources(body.results ?? []);
      })
      .catch(() => { if (!cancelled) setMessage("Search is unavailable."); });
    return () => { cancelled = true; };
  }, [params]);

  const onIntent = (intent: BoxIntent) => {
    if (intent.type === "prompt_submitted") {
      const mode = resolveQueryMode(intent.value);
      if (mode === "lookup") {
        void fetch("/api/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: intent.value }) })
          .then(async (response) => { if (!response.ok) throw new Error("lookup unavailable"); const body = await response.json() as { results?: CanonicalSource[] }; setSources(body.results ?? []); })
          .catch(() => setMessage("Search is unavailable."));
      } else navigate(`/topics/new?mode=${mode}&q=${encodeURIComponent(intent.value)}`);
      return;
    }
    if (intent.type === "command_requested") {
      if (intent.command === "/settings") navigate("/settings");
      else if (intent.command === "/threads") navigate("/threads");
      else if (intent.command === "/new") { setValue(""); navigate("/new", { replace: true }); }
      else setMessage(`Unknown command: ${intent.command}`);
    }
    if (intent.type === "new_thread_requested") { setValue(""); navigate("/new", { replace: true }); }
  };

  return <main className={styles.shell}>
    <StickyHeader onIntent={onIntent} />
    <section className={styles.hero}>
      <div className={styles.commandList} aria-label="Commands">
        <p><Link to="/new"><code>/new</code></Link><span><code>&lt;esc&gt;&lt;esc&gt;</code></span></p>
        <p><Link to="/settings"><code>/settings</code></Link><span><code>&lt;alt&gt;+c</code></span></p>
        <p><Link to="/threads"><code>/threads</code></Link><span><code>&lt;alt&gt;+s</code></span></p>
      </div>
      <PromptBox value={value} onChange={setValue} onIntent={onIntent} />
      {message && <p className={styles.commandMessage} role="status">{message}</p>}
      {sources.length > 0 && <EvidenceBox sources={sources} onIntent={() => undefined} />}
    </section>
  </main>;
}
