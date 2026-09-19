import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type Ref } from "react";

type SharedActionProps = {
  variant?: "default" | "quiet" | "danger";
  className?: string;
};

type ButtonActionProps = SharedActionProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };
type LinkActionProps = SharedActionProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
export type ActionProps = ButtonActionProps | LinkActionProps;

function actionClass(variant: ActionProps["variant"], className?: string): string {
  return ["ui-action", `ui-action-${variant ?? "default"}`, className].filter(Boolean).join(" ");
}

export const Action = forwardRef<HTMLButtonElement | HTMLAnchorElement, ActionProps>(function Action(props, ref) {
  if ("href" in props && props.href !== undefined) {
    const { variant, className, ...anchorProps } = props;
    return <a {...anchorProps} ref={ref as Ref<HTMLAnchorElement>} className={actionClass(variant, className)} />;
  }
  const { variant, className, type = "button", ...buttonProps } = props as ButtonActionProps;
  return <button {...buttonProps} ref={ref as Ref<HTMLButtonElement>} type={type} className={actionClass(variant, className)} />;
});
Action.displayName = "Action";
