import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BrandBox } from "../boxes/BrandBox";
import { UnlockBox } from "../boxes/UnlockBox";
import type { BoxIntent } from "../boxes/box-types";
import styles from "../App.module.css";

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try { const url = new URL(value, window.location.origin); return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : "/"; } catch { return "/"; }
}

export function UnlockRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [message, setMessage] = useState("");
  const onIntent = (intent: BoxIntent) => {
    if (intent.type !== "passphrase_submitted") return;
    void fetch("/api/auth/passphrase", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passphrase: intent.passphrase }) })
      .then((response) => { if (!response.ok) throw new Error("rejected"); setMessage("Unlocked."); navigate(safeReturnTo(params.get("returnTo")), { replace: true }); })
      .catch(() => setMessage("That passphrase did not work."));
  };
  return <main className={styles.unlockShell}>
    <header className={styles.header}><BrandBox onIntent={() => navigate("/", { replace: true })} /></header>
    <UnlockBox message={message} onIntent={onIntent} />
  </main>;
}
