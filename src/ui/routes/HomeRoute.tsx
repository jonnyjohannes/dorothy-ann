import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PromptBox } from "../boxes/PromptBox";
import { StickyHeader } from "../boxes/StickyHeader";
import type { BoxIntent } from "../boxes/box-types";
import styles from "../App.module.css";

export function HomeRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const query = params.get("q")?.trim();
    if (!query) return;
    navigate(`/topics/new?q=${encodeURIComponent(query)}`, { replace: true });
  }, [params]);

  const onIntent = (intent: BoxIntent) => {
    if (intent.type === "prompt_submitted") {
      navigate(`/topics/new?q=${encodeURIComponent(intent.value)}`);
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
    </section>
  </main>;
}
