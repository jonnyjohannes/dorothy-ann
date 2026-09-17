import type { HTMLAttributes, ReactNode } from "react";

export type LayoutGap = "none" | "xs" | "sm" | "md" | "lg" | "xl";

interface LayoutProps extends HTMLAttributes<HTMLDivElement> {
  gap?: LayoutGap;
  children?: ReactNode;
}

function layoutClass(base: string, gap: LayoutGap, className?: string): string {
  return [base, `ui-gap-${gap}`, className].filter(Boolean).join(" ");
}

export function Stack({ gap = "md", className, ...props }: LayoutProps) {
  return <div {...props} className={layoutClass("ui-stack", gap, className)} />;
}

export function Inline({ gap = "sm", className, ...props }: LayoutProps) {
  return <div {...props} className={layoutClass("ui-inline", gap, className)} />;
}

export function Surface({ gap = "md", className, ...props }: LayoutProps) {
  return <div {...props} className={layoutClass("ui-surface", gap, className)} />;
}
