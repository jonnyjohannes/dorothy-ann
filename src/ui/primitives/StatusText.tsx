import type { HTMLAttributes, ReactNode } from "react";

export interface StatusTextProps extends HTMLAttributes<HTMLParagraphElement> {
  children?: ReactNode;
  assertive?: boolean;
}

export function StatusText({ assertive = false, className, ...props }: StatusTextProps) {
  return <p {...props} className={["ui-status-text", assertive ? "ui-status-text--assertive" : "", className].filter(Boolean).join(" ")} role={assertive ? "alert" : "status"} aria-live={assertive ? "assertive" : "polite"} />;
}
