import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PromptBox } from "../boxes/PromptBox";
import { StickyHeader } from "../boxes/StickyHeader";
import type { BoxIntent } from "../boxes/box-types";
import { turnLocation, workspaceController } from "../controllers/workspace-controller";
import styles from "../App.module.css";
import { threadSelectorState } from "../navigation-state";

export function HomeRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const query = params.get("q")?.trim();
    if (!query) return;
    navigate(turnLocation(query), { replace: true });
  }, [navigate, params]);

  const populateSearchCommand = (command: "/link" | "/image" | "/video") => {
    setValue(`${command} `);
    document.querySelector<HTMLInputElement>('input[aria-label="Search query"]:not(:disabled)')?.focus();
  };

  const onIntent = (intent: BoxIntent) => {
    const command = workspaceController.command(intent);
    if (!command) return;
    if (command.type === "navigate") { if (intent.type === "new_thread_requested" || intent.type === "command_requested" && intent.command === "/new") setValue(""); navigate(command.to, { replace: command.replace }); }
    else if (command.type === "submit") { setMessage(""); navigate(turnLocation(command.kind === "search" ? `/${command.resultKind} ${command.value}` : command.value)); }
    else if (command.type === "invalid") setMessage(command.message);
  };

  return <main className={styles.shell}>
    <StickyHeader onIntent={onIntent} />
    <section className={styles.routeLayout}>
      <h1 className={styles.pageTitle}><code>/new</code></h1>
      <div className={styles.commandList} aria-label="Commands">
        <p><Link to="/"><code>/new</code></Link><span><code>&lt;esc&gt;&lt;esc&gt;</code></span></p>
        <p><Link to="/threads" state={threadSelectorState(location)}><code>/threads</code></Link><span><code>&lt;alt&gt;+s</code></span></p>
        <p><button className={styles.commandListAction} type="button" onClick={() => populateSearchCommand("/link")}><code>/link</code></button><span><code>{"{query}"}</code></span></p>
        <p><button className={styles.commandListAction} type="button" onClick={() => populateSearchCommand("/image")}><code>/image</code></button><span><code>{"{query}"}</code></span></p>
        <p><button className={styles.commandListAction} type="button" onClick={() => populateSearchCommand("/video")}><code>/video</code></button><span><code>{"{query}"}</code></span></p>
        <p><Link to="/settings"><code>/settings</code></Link><span><code>&lt;alt&gt;+c</code></span></p>
      </div>
      <PromptBox value={value} onChange={setValue} onIntent={onIntent} />
      {message && <p className={styles.commandMessage} role="status">{message}</p>}
    </section>
  </main>;
}
