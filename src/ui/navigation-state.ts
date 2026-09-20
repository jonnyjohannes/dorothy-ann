interface RouteLocation {
  pathname: string;
  search?: string;
  hash?: string;
  state?: unknown;
}

interface ThreadSelectorState {
  returnTo: string;
}

function isSafeReturnTo(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && value !== "/threads";
}

export function threadSelectorState(location: RouteLocation): ThreadSelectorState | undefined {
  if (location.pathname === "/threads") return undefined;
  return { returnTo: `${location.pathname}${location.search ?? ""}${location.hash ?? ""}` };
}

export function threadSelectorReturnTo(state: unknown): string {
  if (!state || typeof state !== "object" || !("returnTo" in state)) return "/";
  const returnTo = (state as { returnTo?: unknown }).returnTo;
  return isSafeReturnTo(returnTo) ? returnTo : "/";
}
