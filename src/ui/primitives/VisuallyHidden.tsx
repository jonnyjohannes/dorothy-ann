import type { HTMLAttributes, ReactNode } from "react";

export interface VisuallyHiddenProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

export function VisuallyHidden({ className, ...props }: VisuallyHiddenProps) {
  return <span {...props} className={["ui-visually-hidden", className].filter(Boolean).join(" ")} />;
}
